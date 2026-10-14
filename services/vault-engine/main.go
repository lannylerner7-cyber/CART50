package main

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"
)

func jsonResponse(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func body(r *http.Request, v any) error {
	d := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 65536))
	d.DisallowUnknownFields()
	return d.Decode(v)
}
func (e *Engine) handler(w http.ResponseWriter, r *http.Request) {
	e.mu.Lock()
	defer e.mu.Unlock()
	var result any
	var err error
	switch {
	case r.Method == "GET" && r.URL.Path == "/status":
		var c Chain
		c, err = e.chain()
		peers := 0
		if err == nil {
			err = e.rpc.Call("", "getconnectioncount", []any{}, &peers)
		}
		connected := err == nil && e.connected
		message := "Bitcoin Core connected"
		if !connected {
			message = "Node unavailable or reconciliation incomplete"
		}
		result = map[string]any{"connected": connected, "network": e.network, "blocks": c.Blocks, "headers": c.Headers, "syncProgress": c.Progress, "peers": peers, "lastSync": nil, "message": message, "recoveryStatus": e.state.Recovery}
		if e.lastSync != "" {
			result.(map[string]any)["lastSync"] = e.lastSync
		}
		err = nil
	case r.Method == "GET" && r.URL.Path == "/wallets":
		for n := range e.state.Wallets {
			expire(&e.state.Wallets[n], time.Now())
		}
		result = e.state.Wallets
	case r.Method == "POST" && r.URL.Path == "/wallets/create":
		var input struct {
			Label string `json:"label"`
			Count int    `json:"count"`
		}
		err = body(r, &input)
		if err == nil {
			result, err = e.createWallets(input.Label, input.Count)
		}
	case strings.HasPrefix(r.URL.Path, "/wallets/"):
		parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/wallets/"), "/")
		index := -1
		for n, wallet := range e.state.Wallets {
			if wallet.ID == parts[0] {
				index = n
			}
		}
		if index < 0 {
			if r.Method == "POST" && len(parts) == 2 && parts[1] == "delete" {
				result = map[string]any{"ok": true, "message": "History entry already absent"}
				break
			}
			err = errors.New("wallet not found")
			break
		}
		wallet := &e.state.Wallets[index]
		expire(wallet, time.Now())
		if r.Method == "GET" && len(parts) == 1 {
			result = wallet
			break
		}
		if r.Method != "POST" || len(parts) != 2 {
			err = errors.New("unknown wallet operation")
			break
		}
		if parts[1] == "rename" {
			var input struct {
				Label string `json:"label"`
			}
			err = body(r, &input)
			if err == nil && (len(strings.TrimSpace(input.Label)) == 0 || len(input.Label) > 64) {
				err = errors.New("invalid label")
			}
			if err == nil {
				wallet.Label = strings.TrimSpace(input.Label)
				err = e.persist()
				result = wallet
			}
} else if parts[1] == "receive" {
result, err = e.receiveWallet(index)
} else if parts[1] == "delete" {
			err = deletionAllowed(*wallet)
			if err == nil {
				e.state.Wallets = append(e.state.Wallets[:index], e.state.Wallets[index+1:]...)
				err = e.persist()
				result = map[string]any{"ok": true, "message": "Expired local history removed; Bitcoin blockchain history is unaffected"}
			}
		} else {
			err = errors.New("unknown wallet operation")
		}
	case r.Method == "GET" && r.URL.Path == "/transactions":
		var rows []Transaction
		rows, err = e.transactions()
		sort.Slice(rows, func(i, j int) bool { return rows[i].FirstSeen > rows[j].FirstSeen })
		result = rows
case r.Method == "GET" && r.URL.Path == "/settings":
result = e.state.Settings
case r.Method == "POST" && r.URL.Path == "/settings":
		var s Settings
		err = body(r, &s)
		fee, e1 := parseBTC(json.Number(s.FeeRate))
		total, e2 := strconv.ParseInt(s.TotalFee, 10, 64)
		hot, e3 := strconv.ParseInt(s.HotLimit, 10, 64)
		if err == nil && (e1 != nil || e2 != nil || e3 != nil || fee < 0 || total < 0 || hot < 0 || total > MaxSats || hot > MaxSats || fee > 10000*100000000) {
			err = errors.New("invalid limits")
		}
		if err == nil && !s.Paused && (fee == 0 || total == 0 || hot == 0) {
			err = errors.New("set all positive limits before unpausing")
		}
		if err == nil {
			e.state.Settings = s
			err = e.persist()
			result = map[string]bool{"ok": true}
		}
	case r.Method == "POST" && r.URL.Path == "/payments/review":
		var input PaymentInput
		err = body(r, &input)
		if err == nil {
			if input.ReplacesTxid != "" {
				var replacement *Intent
				replacement, err = e.prepareBump(input)
				if err == nil {
					result = reviewView(replacement, e.network)
				}
				break
			}
			amount, parseErr := strconv.ParseInt(input.Amount, 10, 64)
			err = parseErr
			hotLimit, _ := strconv.ParseInt(e.state.Settings.HotLimit, 10, 64)
			if amount <= 0 || amount > MaxSats || amount > hotLimit {
				err = errors.New("amount exceeds spending exposure ceiling or is invalid")
			}
			if err == nil {
				var i *Intent
				i, err = e.prepare("vault-spending", input.Address, amount, input.FeeRate, nil, false)
				if err == nil {
					result = reviewView(i, e.network)
				}
			}
		}
	case r.Method == "POST" && r.URL.Path == "/payments/send":
		var input struct {
			ReviewID  string `json:"reviewId"`
			Confirmed bool   `json:"confirmed"`
		}
		err = body(r, &input)
		if err == nil {
			err = errors.New("approved review not found")
			for n := range e.state.Intents {
				i := &e.state.Intents[n]
				if i.ID == input.ReviewID && input.Confirmed && i.Wallet == "vault-spending" {
					err = e.send(i)
					if err == nil {
						result = transactionView(i)
					}
					break
				}
			}
		}
	case r.Method == "GET" && r.URL.Path == "/explorer":
		q := r.URL.Query().Get("query")
		if len(q) > 128 || len(q) < 10 {
			err = errors.New("invalid query")
			break
		}
		result = map[string]any{"found": false, "kind": "unknown", "message": "Not found in tracked node wallets. A pruned node cannot provide arbitrary historical transactions.", "transaction": nil, "wallet": nil, "details": map[string]any{}}
		for _, wallet := range e.state.Wallets {
			if wallet.Address != nil && *wallet.Address == q {
				result = map[string]any{"found": true, "kind": "address", "message": "Tracked wallet address; data from your node", "transaction": nil, "wallet": wallet, "details": map[string]any{}}
				break
			}
		}
		if len(q) == 64 {
			for _, wallet := range e.state.Wallets {
				var tx map[string]any
				if e.rpc.Call(wallet.ID, "gettransaction", []any{q, true, true}, &tx) == nil {
					// Do not expose raw hex or wallet-internal labels to clients unnecessarily.
					delete(tx, "hex")
					// Expose exact satoshi output values, never floating point BTC.
					if decoded, ok := tx["decoded"].(map[string]any); ok {
						if outputs, ok := decoded["vout"].([]any); ok {
							for _, output := range outputs {
								if v, ok := output.(map[string]any); ok {
									if amount, ok := v["value"].(json.Number); ok {
										sats, parseErr := parseBTC(amount)
										if parseErr != nil {
											err = parseErr
											break
										}
										delete(v, "value")
										v["amountSats"] = strconv.FormatInt(sats, 10)
									}
								}
							}
						}
					}
					for _, field := range []string{"amount", "fee"} {
						if amount, ok := tx[field].(json.Number); ok {
							sats, parseErr := parseBTC(amount)
							if parseErr != nil {
								err = parseErr
								break
							}
							delete(tx, field)
							tx[field+"Sats"] = strconv.FormatInt(sats, 10)
						}
					}
					result = map[string]any{"found": true, "kind": "transaction", "message": "Transaction from your Bitcoin Core wallet", "transaction": nil, "wallet": nil, "details": tx}
					break
				}
			}
		}
	default:
		jsonResponse(w, 404, map[string]string{"error": "not found"})
		return
	}
	if err != nil {
		jsonResponse(w, 400, map[string]string{"error": err.Error()})
		return
	}
	jsonResponse(w, 200, result)
}
func main() {
	token := os.Getenv("VAULT_ENGINE_TOKEN")
	if len(token) < 32 {
		log.Fatal("VAULT_ENGINE_TOKEN must contain at least 32 characters")
	}
	e, err := newEngine()
	if err != nil {
		log.Fatal(err)
	}
	// A second signer must never operate on this journal concurrently.
	if err = os.MkdirAll(strings.TrimSuffix(e.file, "/engine.json"), 0700); err != nil {
		log.Fatal(err)
	}
	lock, err := os.OpenFile(e.file+".lock", os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		log.Fatal(err)
	}
	defer lock.Close()
	if err = syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		log.Fatal("another signer owns this journal")
	}
replica, err := newHealthReplica(e.file + ".health", os.Getenv("REPLICA_URL"), os.Getenv("REPLICA_TOKEN"))
if err != nil {
log.Fatal("invalid health replication configuration or journal")
}
if replica != nil {
go replica.run(e)
}
	go func() {
		backoff := time.Second
		for {
			e.mu.Lock()
			err := e.sync()
			reconciled := err == nil
			if err == nil {
				err = e.sweep()
			}
			if err != nil {
				e.state.Recovery = "retrying"
				if !reconciled {
					e.connected = false
				} else {
					e.state.Recovery = "sweep_blocked"
				}
				log.Print("node reconciliation/sweep blocked; retrying without blind signing")
			} else {
				backoff = time.Second
			}
			e.mu.Unlock()
			if err != nil {
				time.Sleep(backoff)
				if backoff < time.Minute {
					backoff *= 2
				}
			} else {
				time.Sleep(15 * time.Second)
			}
		}
	}()
	mux := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		supplied := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if len(supplied) != len(token) || subtle.ConstantTimeCompare([]byte(supplied), []byte(token)) != 1 {
			jsonResponse(w, 401, map[string]string{"error": "unauthorized"})
			return
		}
		e.handler(w, r)
	})
	listen := os.Getenv("ENGINE_LISTEN")
	if listen == "" {
		listen = "127.0.0.1:9090"
	}
	server := http.Server{Addr: listen, Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 180 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 8192}
	log.Printf("test-network vault engine listening on %s", listen)
	log.Fatal(server.ListenAndServe())
}
