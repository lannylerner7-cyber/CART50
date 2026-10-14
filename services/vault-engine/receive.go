package main

import (
	"errors"
	"time"
)

// Called with the engine mutex held. Repeated requests reuse the persisted
// address; cold indices are reserved durably before an address is exposed.
func (e *Engine) receiveWallet(index int) (*Wallet, error) {
	if index < 0 || index >= len(e.state.Wallets) {
		return nil, errors.New("wallet not found")
	}
	w := &e.state.Wallets[index]
	expire(w, time.Now())
	if w.Status != "active" || w.DestructionStatus == "completed" {
		return nil, errors.New("wallet is not active; do not send to expired or destroyed wallets")
	}
	lastSync, err := time.Parse(time.RFC3339, e.lastSync)
	if err != nil || !e.connected || time.Since(lastSync) > time.Minute {
		return nil, errors.New("node reconciliation is stale; receiving unavailable")
	}
	if err := e.ready(); err != nil {
		return nil, err
	}
	if w.Address == nil || *w.Address == "" {
		if w.Kind != "cold" {
			return nil, errors.New("wallet address is not ready")
		}
		address, err := e.coldDestination()
		if err != nil {
			return nil, err
		}
		w.Address = &address
		if err := e.persist(); err != nil {
			w.Address = nil
			return nil, err
		}
	}
	var info struct {
		IsMine bool `json:"ismine"`
		IsWatchOnly bool `json:"iswatchonly"`
	}
	if err := e.rpc.Call(w.ID, "getaddressinfo", []any{*w.Address}, &info); err != nil {
		return nil, err
	}
	if !info.IsMine && !info.IsWatchOnly {
		return nil, errors.New("receiving address is not tracked by this wallet")
	}
	return w, nil
}
