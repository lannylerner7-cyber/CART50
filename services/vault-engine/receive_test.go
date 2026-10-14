package main

import (
	"testing"
	"time"
)

func TestReceiveBlocksUnsafeStates(t *testing.T) {
	for _, state := range []string{"expired", "creating", "destroyed"} {
		e := &Engine{state: State{Wallets: []Wallet{{Status: state}}}}
		if _, err := e.receiveWallet(0); err == nil {
			t.Fatalf("accepted %s", state)
		}
	}
	e := &Engine{state: State{Wallets: []Wallet{blankWallet("test", "Test", "spending")}}, connected: true, lastSync: time.Now().Add(-2*time.Minute).UTC().Format(time.RFC3339)}
	if _, err := e.receiveWallet(0); err == nil {
		t.Fatal("stale receive accepted")
	}
	if _, err := e.receiveWallet(-1); err == nil {
		t.Fatal("unknown wallet accepted")
	}
}
