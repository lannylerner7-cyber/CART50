package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"time"
)

const maxHealthSequence int64 = 9007199254740991

// This type is the complete outbound whitelist. Never serialize State or Wallet.
type HostHealth struct {
	Network        string `json:"network"`
	Blocks         int    `json:"blocks"`
	RecoveryStatus string `json:"recoveryStatus"`
	LastSync       string `json:"lastSync"`
}
type HealthCheckpoint struct {
	ID       string     `json:"id"`
	Sequence int64      `json:"sequence"`
	Data     HostHealth `json:"data"`
}
type HealthJournal struct {
	Sequence int64              `json:"sequence"`
	Pending  []HealthCheckpoint `json:"pending"`
}
type healthReplica struct {
	file, endpoint, token string
	journal               HealthJournal
	client                *http.Client
	rollback              bool
}

func validHealth(h HostHealth) bool {
	_, err := time.Parse(time.RFC3339, h.LastSync)
	return (h.Network == "signet" || h.Network == "regtest") && h.Blocks >= 0 &&
		(h.RecoveryStatus == "starting" || h.RecoveryStatus == "healthy" ||
			h.RecoveryStatus == "retrying" || h.RecoveryStatus == "sweep_blocked") &&
		(h.LastSync == "" || err == nil)
}

func newHealthReplica(file, endpoint, token string) (*healthReplica, error) {
	if endpoint == "" && token == "" {
		return nil, nil
	}
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil ||
		u.RawQuery != "" || u.Fragment != "" || u.Path != "/replicate" || len(token) < 32 {
		return nil, errors.New("replication requires HTTPS /replicate and an independent token")
	}
	r := &healthReplica{file: file, endpoint: endpoint, token: token, client: &http.Client{
		Timeout:       5 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}
	f, err := os.Open(file)
	if os.IsNotExist(err) {
		return r, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, 8193))
	if err != nil || len(raw) > 8192 {
		return nil, errors.New("invalid health journal size")
	}
	if err = json.Unmarshal(raw, &r.journal); err != nil {
		return nil, err
	}
	if r.journal.Sequence < 0 || r.journal.Sequence > maxHealthSequence || len(r.journal.Pending) > 2 {
		return nil, errors.New("invalid health sequence")
	}
	var previous int64
	for _, c := range r.journal.Pending {
		if c.ID != "engine-health" || c.Sequence <= previous || c.Sequence > r.journal.Sequence || !validHealth(c.Data) {
			return nil, errors.New("invalid health checkpoint")
		}
		previous = c.Sequence
	}
	return r, nil
}

func (r *healthReplica) capture(h HostHealth) error {
	if r.rollback {
		return errors.New("health journal rollback requires operator reconciliation")
	}
	if !validHealth(h) || r.journal.Sequence == maxHealthSequence {
		return errors.New("invalid health snapshot or sequence exhausted")
	}
	next := HealthJournal{Sequence: r.journal.Sequence + 1}
	// Preserve the oldest unacknowledged checkpoint and coalesce newer snapshots.
	// These are health snapshots, not a complete event/audit history.
	if len(r.journal.Pending) > 0 {
		next.Pending = append(next.Pending, r.journal.Pending[0])
	}
	next.Pending = append(next.Pending, HealthCheckpoint{"engine-health", next.Sequence, h})
	if err := saveJSON(r.file, next); err != nil {
		return err
	}
	r.journal = next
	return nil
}

func (r *healthReplica) request(method, endpoint string, body []byte) (*http.Response, error) {
	req, err := http.NewRequest(method, endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+r.token)
	req.Header.Set("Content-Type", "application/json")
	return r.client.Do(req)
}

func (r *healthReplica) deliver() error {
	if len(r.journal.Pending) == 0 {
		return nil
	}
	c := r.journal.Pending[0]
	// Read durable D1 progress first. A Queue 202 alone is NOT an acknowledgement.
	u, _ := url.Parse(r.endpoint)
	u.Path = "/replica"
	res, err := r.request("GET", u.String(), nil)
	if err != nil {
		return errors.New("health acknowledgement unavailable")
	}
	var ack struct {
		Sequence int64 `json:"sequence"`
	}
	err = json.NewDecoder(io.LimitReader(res.Body, 4096)).Decode(&ack)
	res.Body.Close()
	if res.StatusCode == 200 && err == nil && ack.Sequence > r.journal.Sequence {
		r.rollback = true
	}
	if res.StatusCode != 200 || err != nil || ack.Sequence < 0 || ack.Sequence > r.journal.Sequence {
		return errors.New("invalid acknowledgement or local journal rollback; operator reconciliation required")
	}
	if ack.Sequence >= c.Sequence {
		next := HealthJournal{Sequence: r.journal.Sequence, Pending: append([]HealthCheckpoint(nil), r.journal.Pending[1:]...)}
		if err := saveJSON(r.file, next); err != nil {
			return err
		}
		r.journal = next
		return nil
	}
	raw, _ := json.Marshal(c)
	res, err = r.request("POST", r.endpoint, raw)
	if err != nil {
		return errors.New("health replication unavailable")
	}
	res.Body.Close()
	if res.StatusCode != 202 {
		return errors.New("health replication rejected")
	}
	return errors.New("health checkpoint queued; awaiting durable acknowledgement")
}

func (r *healthReplica) run(e *Engine) {
	backoff := 15 * time.Second
	for {
		// No cloud requests or journal I/O while holding the signer's mutex.
		e.mu.Lock()
		h := HostHealth{e.network, e.blocks, e.state.Recovery, e.lastSync}
		e.mu.Unlock()
		err := r.capture(h)
		if err == nil {
			err = r.deliver()
		}
		if err != nil {
			log.Print("health replication pending; retained locally for replay")
			if backoff < 2*time.Minute {
				backoff *= 2
			}
		} else {
			backoff = 15 * time.Second
		}
		time.Sleep(backoff)
	}
}
