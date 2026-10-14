package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

type Wallet struct {
	ID                string  `json:"id"`
	Label             string  `json:"label"`
	Address           *string `json:"address"`
	Kind              string  `json:"kind"`
	CreatedAt         string  `json:"createdAt"`
	ExpiresAt         *string `json:"expiresAt"`
	Status            string  `json:"status"`
	DestructionStatus string  `json:"destructionStatus"`
	Confirmed         string  `json:"confirmedSats"`
	Unconfirmed       string  `json:"unconfirmedSats"`
	Available         string  `json:"availableSats"`
	Received          string  `json:"totalReceivedSats"`
	Swept             string  `json:"totalSweptSats"`
	LastSync          *string `json:"lastSync"`
}
type Transaction struct {
	TxID          string  `json:"txid"`
	WalletID      string  `json:"walletId"`
	Direction     string  `json:"direction"`
	Amount        string  `json:"amountSats"`
	Fee           *string `json:"feeSats"`
	FirstSeen     string  `json:"firstSeen"`
	Confirmations int     `json:"confirmations"`
	Status        string  `json:"status"`
	Address       *string `json:"address"`
	ReplacedBy    *string `json:"replacedBy"`
}
type Settings struct {
	Paused   bool   `json:"sweepsPaused"`
	FeeRate  string `json:"feeRateCeiling"`
	TotalFee string `json:"totalFeeCeilingSats"`
	HotLimit string `json:"hotExposureLimitSats"`
}
type Intent struct {
	ID       string           `json:"id"`
	Wallet   string           `json:"wallet"`
	Address  string           `json:"address"`
	Amount   int64            `json:"amount"`
	Fee      int64            `json:"fee"`
	PSBT     string           `json:"psbt"`
	Raw      string           `json:"raw"`
	TxID     string           `json:"txid"`
	Status   string           `json:"status"`
	Created  string           `json:"created"`
	Expires  string           `json:"expires"`
	Inputs   []map[string]any `json:"inputs"`
	Replaces string           `json:"replaces,omitempty"`
}
type State struct {
Network string `json:"network,omitempty"`
CustodyMode string `json:"custodyMode,omitempty"`
	Wallets    []Wallet `json:"wallets"`
	Intents    []Intent `json:"intents"`
	Settings   Settings `json:"settings"`
	ColdIndex  int64    `json:"coldIndex"`
	Checkpoint string   `json:"checkpoint"`
	Recovery   string   `json:"recovery"`
}

func randomID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b[:])
}
func stamp() string           { return time.Now().UTC().Format(time.RFC3339) }
func strptr(s string) *string { return &s }
func blankWallet(id, label, kind string) Wallet {
	w := Wallet{ID: id, Label: label, Kind: kind, CreatedAt: stamp(), Status: "active", DestructionStatus: "not_scheduled", Confirmed: "0", Unconfirmed: "0", Available: "0", Received: "0", Swept: "0"}
	if kind == "temporary" {
		w.ExpiresAt = strptr(time.Now().UTC().Add(120 * time.Hour).Format(time.RFC3339))
		w.DestructionStatus = "waiting_for_expiry"
	}
	return w
}
func expire(w *Wallet, now time.Time) {
	if w.ExpiresAt == nil {
		return
	}
	expiry, err := time.Parse(time.RFC3339, *w.ExpiresAt)
	if err == nil && !now.Before(expiry) {
		w.Status = "expired"
		if w.DestructionStatus == "blocked_pending_policy" || w.DestructionStatus == "waiting_for_expiry" {
			w.DestructionStatus = "waiting_for_verification"
		}
	}
}
func loadState(file string) (State, error) {
	var s State
	raw, err := os.ReadFile(file)
	if os.IsNotExist(err) {
		return State{Wallets: []Wallet{}, Intents: []Intent{}, Settings: Settings{Paused: true, FeeRate: "0", TotalFee: "0", HotLimit: "0"}, Recovery: "starting"}, nil
	}
	if err != nil {
		return s, err
	}
	err = json.Unmarshal(raw, &s)
	return s, err
}
func saveState(file string, s State) error {
return saveJSON(file, s)
}
func saveJSON(file string, s any) error {
	raw, err := json.Marshal(s)
	if err != nil {
		return err
	}
	dir := filepath.Dir(file)
	if err = os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	f, err := os.OpenFile(file+".new", os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	_, err = f.Write(raw)
	if err == nil {
		err = f.Sync()
	}
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if err = os.Rename(file+".new", file); err != nil {
		return err
	}
	d, err := os.Open(dir)
	if err != nil {
		return err
	}
	defer d.Close()
	return d.Sync()
}
func deletionAllowed(w Wallet) error {
	if w.Kind != "temporary" || w.Status != "expired" || w.DestructionStatus != "completed" {
		return errors.New("history deletion blocked until key destruction is verified complete")
	}
	if w.Confirmed != "0" || w.Unconfirmed != "0" {
		return errors.New("wallet still has funds")
	}
	return nil
}
