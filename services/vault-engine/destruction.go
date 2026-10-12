package main

import (
	"encoding/json"
	"time"
)

// These are readiness observations, NOT destruction receipts. In particular,
// zero balances never authorize unlinking a Core wallet or purging its history.
const storageUnverified = "blocked_storage_verification"

func (e *Engine) destructionNodeReady(now time.Time) (Chain, bool) {
	c, err := e.chain()
	if err != nil || c.IBD || c.Blocks != c.Headers || c.Best == "" {
		return c, false
	}
	var tip struct {
		Time          int64 `json:"time"`
		Confirmations int   `json:"confirmations"`
	}
	if e.rpc.Call("", "getblockheader", []any{c.Best, true}, &tip) != nil || tip.Confirmations < 1 {
		return c, false
	}
	// Local regtest mining is deliberately idle between tests. On signet a
	// synchronized but isolated node is not evidence of the current chain.
	if e.network != "regtest" {
		var peers int
		if e.rpc.Call("", "getconnectioncount", []any{}, &peers) != nil || peers < 1 ||
			tip.Time < now.Add(-2*time.Hour).Unix() || tip.Time > now.Add(10*time.Minute).Unix() {
			return c, false
		}
	}
	return c, true
}

func (e *Engine) settledIntent(i Intent, seen map[string]bool) bool {
	if i.Status == "expired" && i.TxID == "" && i.Raw == "" && i.PSBT == "" {
		return true
	}
	if i.TxID == "" || seen[i.TxID] {
		return false
	}
	seen[i.TxID] = true
	var tx struct {
		Confirmations int    `json:"confirmations"`
		ReplacedBy    string `json:"replaced_by_txid"`
		Abandoned     bool   `json:"abandoned"`
	}
	if e.rpc.Call(i.Wallet, "gettransaction", []any{i.TxID}, &tx) != nil || tx.Abandoned {
		return false
	}
	if tx.ReplacedBy != "" {
		// A replaced transaction alone is never settlement. Follow only an
		// explicitly journaled successor preserving wallet/destination/amount.
		for _, next := range e.state.Intents {
			if next.Wallet == i.Wallet && next.TxID == tx.ReplacedBy &&
				next.Replaces == i.TxID && next.Address == i.Address && next.Amount == i.Amount {
				return e.settledIntent(next, seen)
			}
		}
		return false
	}
	return tx.Confirmations >= 3 && i.Status == "confirmed"
}

func (e *Engine) destructionReadiness(w Wallet, now time.Time) string {
	if w.Kind != "temporary" || w.ExpiresAt == nil {
		return "not_scheduled"
	}
	expiry, err := time.Parse(time.RFC3339, *w.ExpiresAt)
	if err != nil {
		return "blocked_invalid_expiry"
	}
	if now.Before(expiry) {
		return "waiting_for_expiry"
	}
	c, ready := e.destructionNodeReady(now)
	if !ready {
		return "blocked_node_unhealthy"
	}
	// A previous successful observation must still belong to the active chain.
	// A failed/reorg observation must never advance this checkpoint here.
	if e.state.Checkpoint == "" {
		return "waiting_for_verification"
	}
	var previous struct {
		Confirmations int `json:"confirmations"`
	}
	if e.rpc.Call("", "getblockheader", []any{e.state.Checkpoint, true}, &previous) != nil || previous.Confirmations < 1 {
		return "blocked_reorg"
	}
	var info struct {
		Scanning json.RawMessage `json:"scanning"`
		Last     struct {
			Hash string `json:"hash"`
		} `json:"lastprocessedblock"`
	}
	if e.rpc.Call(w.ID, "getwalletinfo", []any{}, &info) != nil ||
		string(info.Scanning) != "false" || info.Last.Hash != c.Best {
		return "blocked_wallet_not_synced"
	}
	var balances struct {
		Mine struct {
			Trusted  json.Number `json:"trusted"`
			Pending  json.Number `json:"untrusted_pending"`
			Immature json.Number `json:"immature"`
		} `json:"mine"`
	}
	if e.rpc.Call(w.ID, "getbalances", []any{}, &balances) != nil {
		return "blocked_balances_unknown"
	}
	for _, amount := range []json.Number{balances.Mine.Trusted, balances.Mine.Pending, balances.Mine.Immature} {
		n, err := parseBTC(amount)
		if err != nil {
			return "blocked_balances_unknown"
		}
		if n != 0 {
			return "waiting_for_funds"
		}
	}
	// Include unsafe and zero-confirmation UTXOs, plus separately locked coins.
	// A transaction review may hide inputs from listunspent.
	var utxos, locks []json.RawMessage
	if e.rpc.Call(w.ID, "listunspent", []any{0, 9999999, []string{}, true}, &utxos) != nil ||
		e.rpc.Call(w.ID, "listlockunspent", []any{}, &locks) != nil {
		return "blocked_balances_unknown"
	}
	if len(utxos) != 0 || len(locks) != 0 {
		return "waiting_for_funds"
	}
	for _, i := range e.state.Intents {
		if i.Wallet == w.ID && !e.settledIntent(i, map[string]bool{}) {
			return "waiting_for_settlement"
		}
	}
	end, ready := e.destructionNodeReady(now)
	if !ready || end.Best != c.Best {
		return "waiting_for_stable_tip"
	}
	// No storage backend has yet demonstrated irrecoverable per-wallet key
	// revocation. Do not turn this observation into a "completed" state.
	return storageUnverified
}

func (e *Engine) refreshDestructionReadiness(now time.Time) {
	for n := range e.state.Wallets {
		w := &e.state.Wallets[n]
		if w.Kind != "temporary" || w.DestructionStatus == "completed" || w.Status == "creating" {
			continue
		}
		expire(w, now)
		w.DestructionStatus = e.destructionReadiness(*w, now)
	}
}
