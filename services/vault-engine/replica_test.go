package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func testReplica(t *testing.T, handler http.HandlerFunc) *healthReplica {
	t.Helper()
	s := httptest.NewTLSServer(handler)
	t.Cleanup(s.Close)
	r, err := newHealthReplica(filepath.Join(t.TempDir(), "health.json"), s.URL+"/replicate", strings.Repeat("t", 32))
	if err != nil {
		t.Fatal(err)
	}
	r.client = s.Client()
	r.client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return r
}
func health() HostHealth { return HostHealth{"signet", 1, "starting", ""} }

func TestHealthBoundedDurableReplay(t *testing.T) {
	var applied int64
	var received []int64
	outage := true
	r := testReplica(t, func(w http.ResponseWriter, req *http.Request) {
		if req.Header.Get("Authorization") != "Bearer "+strings.Repeat("t", 32) {
			t.Error("missing auth")
		}
		if outage {
			w.WriteHeader(503)
			return
		}
		if req.Method == "GET" {
			json.NewEncoder(w).Encode(map[string]int64{"sequence": applied})
			return
		}
		var c HealthCheckpoint
		json.NewDecoder(req.Body).Decode(&c)
		received = append(received, c.Sequence)
		w.WriteHeader(202)
	})
	for i := 0; i < 100; i++ {
		if err := r.capture(health()); err != nil {
			t.Fatal(err)
		}
	}
	if len(r.journal.Pending) != 2 || r.journal.Pending[0].Sequence != 1 || r.journal.Pending[1].Sequence != 100 {
		t.Fatal(r.journal)
	}
	if r.deliver() == nil {
		t.Fatal("outage accepted")
	}
	restarted, err := newHealthReplica(r.file, r.endpoint, r.token)
	if err != nil {
		t.Fatal(err)
	}
	restarted.client = r.client
	r = restarted
	outage = false
	if r.deliver() == nil || len(r.journal.Pending) != 2 {
		t.Fatal("202 is not a durable D1 ack")
	}
	if r.deliver() == nil || len(received) != 2 || received[0] != received[1] {
		t.Fatal("same sequence must replay")
	}
	applied = 1
	if err := r.deliver(); err != nil {
		t.Fatal(err)
	}
	if len(r.journal.Pending) != 1 || r.journal.Pending[0].Sequence != 100 {
		t.Fatal("wrong checkpoint removed")
	}
	applied = 100
	if err := r.deliver(); err != nil {
		t.Fatal(err)
	}
	restarted, err = newHealthReplica(r.file, r.endpoint, r.token)
	if err != nil || len(restarted.journal.Pending) != 0 || restarted.journal.Sequence != 100 {
		t.Fatal("ack/sequence not durable", err)
	}
}
func TestHealthWhitelistAndWriteFailure(t *testing.T) {
	r := testReplica(t, func(http.ResponseWriter, *http.Request) {})
	if err := r.capture(health()); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(r.file)
	var journal map[string]any
	json.Unmarshal(raw, &journal)
	data := journal["pending"].([]any)[0].(map[string]any)["data"].(map[string]any)
	if len(data) != 4 {
		t.Fatal("unexpected outbound fields")
	}
	for _, k := range []string{"network", "blocks", "recoveryStatus", "lastSync"} {
		if _, ok := data[k]; !ok {
			t.Fatal(k)
		}
	}
	r.file = filepath.Join(r.file, "not-a-directory")
	if r.capture(health()) == nil || r.journal.Sequence != 1 {
		t.Fatal("failed write advanced sequence")
	}
}
func TestHealthTransportAndJournalValidation(t *testing.T) {
	for _, u := range []string{"http://host/replicate", "https://u:p@host/replicate", "https://host/replicate?q=1", "https://host/other"} {
		if _, err := newHealthReplica("unused", u, strings.Repeat("t", 32)); err == nil {
			t.Fatal(u)
		}
	}
	file := filepath.Join(t.TempDir(), "health.json")
	os.WriteFile(file, []byte(`{"sequence":1,"pending":[{"id":"engine-health","sequence":2}]}`), 0600)
	if _, err := newHealthReplica(file, "https://host/replicate", strings.Repeat("t", 32)); err == nil {
		t.Fatal("corrupt journal accepted")
	}
	r := testReplica(t, func(w http.ResponseWriter, req *http.Request) { http.Redirect(w, req, "http://example.com", 302) })
	r.capture(health())
	if r.deliver() == nil {
		t.Fatal("redirect accepted")
	}
}
func TestHealthRollbackStopsSequenceAllocation(t *testing.T) {
	r := testReplica(t, func(w http.ResponseWriter, req *http.Request) {
		json.NewEncoder(w).Encode(map[string]int{"sequence": 1000})
	})
	r.capture(health())
	if r.deliver() == nil || !r.rollback {
		t.Fatal("rollback not detected")
	}
	if r.capture(health()) == nil || r.journal.Sequence != 1 {
		t.Fatal("rollback must block allocation")
	}
}
