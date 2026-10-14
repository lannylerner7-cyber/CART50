package main

import (
	"errors"
	"os"
)

const serverCustody = "server"
const externalCustody = "external"

// Existing installations remain external by default. Changing the destination
// policy is explicit and cannot reroute an unresolved transaction.
func (e *Engine) configureCustody() error {
	mode := os.Getenv("VAULT_CUSTODY_MODE")
	if mode == "" {
		mode = externalCustody
	}
	if mode != externalCustody && mode != serverCustody {
		return errors.New("VAULT_CUSTODY_MODE must be external or server")
	}
	previous := e.state.CustodyMode
	if previous == "" {
		previous = externalCustody
	}
	if previous != mode {
		if !e.state.Settings.Paused {
			return errors.New("pause sending and sweeps before changing custody mode")
		}
		for _, i := range e.state.Intents {
			if i.Status != "confirmed" && i.Status != "expired" && i.Status != "replaced" {
				return errors.New("resolve all outstanding payment intents before changing custody mode")
			}
		}
	}
	e.state.CustodyMode = mode
	// Startup acquires the journal lock after construction. Do not write until
	// the locked engine initializes/synchronizes.
	return nil
}

func (e *Engine) canSpendWallet(id string) bool {
	for _, w := range e.state.Wallets {
		if w.ID == id && w.Status == "active" && w.DestructionStatus != "completed" {
			return (id == "vault-spending" && w.Kind == "spending") ||
				(id == "vault-reserve" && w.Kind == "reserve" && e.state.CustodyMode == serverCustody)
		}
	}
	return false
}

func (e *Engine) paymentWallet(id string) (string, error) {
	if id == "" {
		id = "vault-spending" // Backward-compatible client default.
	}
	if !e.canSpendWallet(id) {
		return "", errors.New("source must be an active server-held main or spending wallet")
	}
	return id, nil
}

func (e *Engine) ensureReserve() error {
	if err := e.ensureWallet("vault-reserve", false); err != nil {
		return err
	}
	var info struct {
		PrivateKeys bool `json:"private_keys_enabled"`
	}
	if err := e.rpc.Call("vault-reserve", "getwalletinfo", []any{}, &info); err != nil {
		return err
	}
	if !info.PrivateKeys {
		return errors.New("main vault must have server-held signing keys; refusing watch-only wallet")
	}
	for _, w := range e.state.Wallets {
		if w.ID == "vault-reserve" {
			if w.Kind != "reserve" {
				return errors.New("main vault identity conflicts with existing wallet")
			}
			return nil
		}
	}
	var address string
	if err := e.rpc.Call("vault-reserve", "getnewaddress", []any{"Main vault", "bech32"}, &address); err != nil {
		return err
	}
	w := blankWallet("vault-reserve", "Main vault", "reserve")
	w.Address = &address
	e.state.Wallets = append(e.state.Wallets, w)
	return e.persist()
}

func (e *Engine) savingsDestination() (string, error) {
	if e.state.CustodyMode != serverCustody {
		return e.coldDestination()
	}
	if !e.canSpendWallet("vault-reserve") {
		return "", errors.New("server-held main vault is not ready")
	}
	// Core durably allocates a new descriptor address. The resulting payment
	// destination is subsequently pinned in the normal signed-intent journal.
	var address string
	err := e.rpc.Call("vault-reserve", "getnewaddress", []any{"Temporary wallet sweep", "bech32"}, &address)
	return address, err
}
