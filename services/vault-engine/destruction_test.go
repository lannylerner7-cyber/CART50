package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestDestructionReadinessFailsClosed(t *testing.T) {
	now := time.Now().UTC()
	for _, scenario := range []struct {
		name, want string
	}{
		{"drained", storageUnverified},
		{"not expired", "waiting_for_expiry"},
		{"invalid expiry", "blocked_invalid_expiry"},
		{"syncing", "blocked_node_unhealthy"},
		{"no peers", "blocked_node_unhealthy"},
		{"stale tip", "blocked_node_unhealthy"},
		{"future tip", "blocked_node_unhealthy"},
		{"reorg", "blocked_reorg"},
		{"scanning", "blocked_wallet_not_synced"},
		{"wallet behind", "blocked_wallet_not_synced"},
		{"confirmed funds", "waiting_for_funds"},
		{"late deposit", "waiting_for_funds"},
		{"immature funds", "waiting_for_funds"},
		{"missing balance", "blocked_balances_unknown"},
		{"unsafe utxo", "waiting_for_funds"},
		{"locked input", "waiting_for_funds"},
		{"pending sweep", "waiting_for_settlement"},
		{"conflicted sweep", "waiting_for_settlement"},
		{"unknown sweep", "waiting_for_settlement"},
		{"untracked replacement", "waiting_for_settlement"},
		{"confirmed replacement", storageUnverified},
		{"tip changed", "waiting_for_stable_tip"},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			chainCalls := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var req struct {
					Method string            `json:"method"`
					Params []json.RawMessage `json:"params"`
				}
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					t.Error(err)
					return
				}
				var result any
				switch req.Method {
				case "getblockchaininfo":
					chainCalls++
					best := "tip"
					if scenario.name == "tip changed" && chainCalls > 1 {
						best = "new-tip"
					}
					result = map[string]any{"chain": "signet", "blocks": 10, "headers": 10, "initialblockdownload": scenario.name == "syncing", "bestblockhash": best}
				case "getblockheader":
					confs, timestamp := 1, now.Unix()
					if scenario.name == "reorg" && string(req.Params[0]) == `"previous"` {
						confs = -1
					}
					if scenario.name == "stale tip" {
						timestamp = now.Add(-3 * time.Hour).Unix()
					}
					if scenario.name == "future tip" {
						timestamp = now.Add(time.Hour).Unix()
					}
					result = map[string]any{"confirmations": confs, "time": timestamp}
				case "getconnectioncount":
					result = 1
					if scenario.name == "no peers" {
						result = 0
					}
				case "getwalletinfo":
					hash := "tip"
					if scenario.name == "wallet behind" {
						hash = "old-tip"
					}
					result = map[string]any{"scanning": scenario.name == "scanning", "lastprocessedblock": map[string]any{"hash": hash}}
				case "getbalances":
					b := map[string]json.Number{"trusted": "0", "untrusted_pending": "0", "immature": "0"}
					switch scenario.name {
					case "confirmed funds":
						b["trusted"] = "0.01"
					case "late deposit":
						b["untrusted_pending"] = "0.01"
					case "immature funds":
						b["immature"] = "50"
					case "missing balance":
						delete(b, "immature")
					}
					result = map[string]any{"mine": b}
				case "listunspent", "listlockunspent":
					result = []any{}
					if (req.Method == "listunspent" && scenario.name == "unsafe utxo") ||
						(req.Method == "listlockunspent" && scenario.name == "locked input") {
						result = []any{map[string]any{"txid": "coin", "vout": 0}}
					}
				case "gettransaction":
					confs, replaced := 3, ""
					switch scenario.name {
					case "pending sweep":
						confs = 0
					case "conflicted sweep":
						confs = -1
					case "unknown sweep":
						_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": -5, "message": "unknown"}})
						return
					case "untracked replacement", "confirmed replacement":
						if string(req.Params[0]) == `"tx"` {
							replaced = "successor"
							confs = -1
						}
					}
					result = map[string]any{"confirmations": confs, "replaced_by_txid": replaced}
				default:
					t.Errorf("unexpected RPC %s", req.Method)
				}
				_ = json.NewEncoder(w).Encode(map[string]any{"result": result, "error": nil})
			}))
			defer server.Close()
			cookie := filepath.Join(t.TempDir(), "cookie")
			if err := os.WriteFile(cookie, []byte("test:test"), 0600); err != nil {
				t.Fatal(err)
			}
			w := blankWallet("temp-test", "Temporary", "temporary")
			w.ExpiresAt = strptr(now.Add(-time.Second).Format(time.RFC3339))
			if scenario.name == "not expired" {
				w.ExpiresAt = strptr(now.Add(time.Hour).Format(time.RFC3339))
			}
			if scenario.name == "invalid expiry" {
				w.ExpiresAt = strptr("invalid")
			}
			e := &Engine{rpc: &RPC{URL: server.URL, CookieFile: cookie, Client: server.Client()}, network: "signet"}
			e.state.Checkpoint = "previous"
			e.state.Intents = []Intent{{Wallet: w.ID, TxID: "tx", Address: "cold", Amount: 10, Status: "confirmed"}}
			if scenario.name == "confirmed replacement" {
				e.state.Intents[0].Status = "replaced"
				e.state.Intents = append(e.state.Intents, Intent{Wallet: w.ID, TxID: "successor", Replaces: "tx", Address: "cold", Amount: 10, Status: "confirmed"})
			}
			if got := e.destructionReadiness(w, now); got != scenario.want {
				t.Fatalf("got %s, want %s", got, scenario.want)
			}
			if len(e.state.Intents) == 0 {
				t.Fatal("readiness checks must not purge recoverable intent history")
			}
		})
	}
}
