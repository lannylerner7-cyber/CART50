package main

import (
	"encoding/json"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestExactAmounts(t *testing.T) {
	for _, c := range []struct {
		btc  string
		sats int64
	}{{"0.00000001", 1}, {"21000000.00000000", MaxSats}, {"-0.00001000", -1000}, {"1.23456789", 123456789}} {
		n, err := parseBTC(json.Number(c.btc))
		if err != nil || n != c.sats {
			t.Fatalf("amount conversion %s", c.btc)
		}
		round, err := parseBTC(btc(n))
		if err != nil || round != n {
			t.Fatal("roundtrip")
		}
	}
	for _, bad := range []string{"0.000000001", "1e8", "21000001", "xyz", "9999999999999999999999999"} {
		if _, err := parseBTC(json.Number(bad)); err == nil {
			t.Fatalf("accepted %s", bad)
		}
	}
}
func TestExpiryAndDeletion(t *testing.T) {
	now := time.Now().UTC()
	w := blankWallet("x", "x", "temporary")
	w.ExpiresAt = strptr(now.Format(time.RFC3339))
	expire(&w, now)
if w.Status != "expired" || w.DestructionStatus != "waiting_for_verification" {
		t.Fatal("expiry must not imply destruction")
	}
	if deletionAllowed(w) == nil {
		t.Fatal("unverified destruction allowed")
	}
	w.DestructionStatus = "completed"
	w.Confirmed = "1"
	if deletionAllowed(w) == nil {
		t.Fatal("funded deletion allowed")
	}
	w.Confirmed = "0"
	if deletionAllowed(w) != nil {
		t.Fatal("empty completed wallet should be deletable")
	}
}
func TestJournalRoundtrip(t *testing.T) {
	file := filepath.Join(t.TempDir(), "engine.json")
	s, err := loadState(file)
	if err != nil {
		t.Fatal(err)
	}
	s.Intents = []Intent{{ID: "intent", TxID: "known-txid", Raw: "signed-bytes", Status: "broadcast_unknown"}}
	s.ColdIndex = 123
	if err = saveState(file, s); err != nil {
		t.Fatal(err)
	}
	got, err := loadState(file)
	if err != nil || got.ColdIndex != 123 || got.Intents[0].TxID != "known-txid" {
		t.Fatal("durable intent missing")
	}
}
func freePort(t *testing.T) string {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer l.Close()
	return strconv.Itoa(l.Addr().(*net.TCPAddr).Port)
}
func TestRegtestWalletsAndPayments(t *testing.T) {
	if os.Getenv("VAULT_REGTEST") != "1" {
		t.Skip("set VAULT_REGTEST=1 with Bitcoin Core installed")
	}
	binary, err := exec.LookPath("bitcoind")
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	port := freePort(t)
	cmd := exec.Command(binary, "-regtest", "-server=1", "-datadir="+dir, "-rpcport="+port, "-listen=0", "-dnsseed=0", "-discover=0", "-connect=0", "-fallbackfee=0.00002000", "-persistmempool=0")
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	rpc := &RPC{URL: "http://127.0.0.1:" + port, CookieFile: filepath.Join(dir, "regtest", ".cookie"), Client: &http.Client{Timeout: 50 * time.Second}}
	t.Cleanup(func() { _ = rpc.Call("", "stop", []any{}, nil); _ = cmd.Wait() })
	ok := false
	for n := 0; n < 200; n++ {
		var info Chain
		if rpc.Call("", "getblockchaininfo", []any{}, &info) == nil {
			ok = true
			break
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !ok {
		t.Fatal("regtest did not start")
	}
	call := func(wallet, method string, params any, out any) {
		t.Helper()
		if err := rpc.Call(wallet, method, params, out); err != nil {
			t.Fatalf("%s: %v", method, err)
		}
	}
	call("", "createwallet", map[string]any{"wallet_name": "miner", "descriptors": true}, nil)
	var mining string
	call("miner", "getnewaddress", []any{}, &mining)
	call("", "generatetoaddress", []any{101, mining}, nil)
	call("", "createwallet", map[string]any{"wallet_name": "offline-test-cold", "descriptors": true}, nil)
	var descriptors struct {
		Descriptors []struct {
			Desc     string `json:"desc"`
			Internal bool   `json:"internal"`
			Active   bool   `json:"active"`
		} `json:"descriptors"`
	}
	call("offline-test-cold", "listdescriptors", []any{false}, &descriptors)
	var desc string
	for _, d := range descriptors.Descriptors {
		if d.Active && !d.Internal {
			desc = d.Desc
			break
		}
	}
	if desc == "" {
		t.Fatal("no cold public descriptor")
	}
	state, _ := loadState(filepath.Join(dir, "engine.json"))
	e := &Engine{rpc: rpc, state: state, file: filepath.Join(dir, "engine.json"), network: "regtest", descriptor: desc}
	if err = e.initialize(); err != nil {
		t.Fatal(err)
	}
	wallets, err := e.createWallets("Receiving", 101)
	if err != nil {
		t.Fatal(err)
	}
	if len(wallets) != 101 {
		t.Fatal("batch incomplete")
	}
	addresses := map[string]bool{}
	for _, w := range wallets {
		if w.Address == nil || addresses[*w.Address] {
			t.Fatal("duplicate address")
		}
		addresses[*w.Address] = true
	}
	e.state.Settings = Settings{Paused: false, FeeRate: "10", TotalFee: "10000", HotLimit: "200000000"}
	call("miner", "sendtoaddress", []any{*wallets[0].Address, btc(1000000)}, nil)
	var spendingAddress string
	for _, w := range e.state.Wallets {
		if w.Kind == "spending" {
			spendingAddress = *w.Address
		}
	}
	call("miner", "sendtoaddress", []any{spendingAddress, btc(1000000)}, nil)
	if err = e.sync(); err != nil {
		t.Fatal(err)
	}
	for _, w := range e.state.Wallets {
		if w.ID == wallets[0].ID && w.Unconfirmed != "1000000" {
			t.Fatalf("wrong unconfirmed %s", w.Unconfirmed)
		}
	}
	call("", "generatetoaddress", []any{3, mining}, nil)
	if err = e.sync(); err != nil {
		t.Fatal(err)
	}
	i, err := e.prepare("vault-spending", mining, 50000, "2", nil, false)
	if err != nil {
		t.Fatal(err)
	}
	id := i.ID
	if err = e.send(i); err != nil {
		t.Fatal(err)
	}
	txid := i.TxID
	if err = e.send(i); err != nil || i.TxID != txid {
		t.Fatal("duplicate submit changed txid")
	}
	bump, err := e.prepareBump(PaymentInput{Address: mining, Amount: "50000", FeeRate: "4", ReplacesTxid: txid})
	if err != nil {
		t.Fatal(err)
	}
	if err = e.send(bump); err != nil {
		t.Fatal(err)
	}
	if bump.TxID == txid || bump.Replaces != txid {
		t.Fatal("replacement identity not linked")
	}
	id = bump.ID
	call("", "generatetoaddress", []any{3, mining}, nil)
	if err = e.sync(); err != nil {
		t.Fatal(err)
	}
	for _, p := range e.state.Intents {
		if p.ID == id && p.Status != "confirmed" {
			t.Fatal("three-confirmation tracking failed")
		}
	}
	var utxos []UTXO
	call(wallets[0].ID, "listunspent", []any{3}, &utxos)
	inputs := []map[string]any{}
	var total int64
	for _, u := range utxos {
		n, _ := parseBTC(u.Amount)
		total += n
		inputs = append(inputs, map[string]any{"txid": u.TxID, "vout": u.Vout})
	}
	dest, err := e.coldDestination()
	if err != nil {
		t.Fatal(err)
	}
	sweep, err := e.prepare(wallets[0].ID, dest, total, "2", inputs, true)
	if err != nil {
		t.Fatal(err)
	}
	if err = e.send(sweep); err != nil {
		t.Fatal(err)
	}
// Expiry does not authorize destruction while the sweep is in the mempool.
expiredIndex := -1
for n := range e.state.Wallets {
if e.state.Wallets[n].ID == wallets[0].ID {
expiredIndex = n
e.state.Wallets[n].ExpiresAt = strptr(time.Now().Add(-time.Hour).UTC().Format(time.RFC3339))
}
}
if err = e.sync(); err != nil {
t.Fatal(err)
}
if expiredIndex < 0 || e.state.Wallets[expiredIndex].DestructionStatus != "waiting_for_settlement" {
t.Fatal("unsettled sweep must block destruction")
}
	call("", "generatetoaddress", []any{3, mining}, nil)
	if err = e.sync(); err != nil {
		t.Fatal(err)
	}
if e.state.Wallets[expiredIndex].DestructionStatus != storageUnverified {
t.Fatalf("drained legacy storage must remain blocked: %s", e.state.Wallets[expiredIndex].DestructionStatus)
}
	rows, err := e.transactions()
	if err != nil || len(rows) == 0 {
		t.Fatal("transactions missing")
	}
	for _, w := range e.state.Wallets {
		if w.ID == wallets[0].ID && (w.Confirmed != "0" || w.Unconfirmed != "0" || w.Swept == "0") {
			t.Fatalf("incorrect swept balance %+v", w)
		}
		if w.Kind == "cold" && w.Confirmed == "0" {
			t.Fatal("cold receipt missing")
		}
	}
	// Node reorg changes the confirmation state instead of claiming finality.
	var best string
	call("", "getbestblockhash", []any{}, &best)
	call("", "invalidateblock", []any{best}, nil)
	if err = e.sync(); err != nil {
		t.Fatal(err)
	}
if e.state.Wallets[expiredIndex].DestructionStatus != "blocked_reorg" {
t.Fatal("reorg must block destruction even with a zero displayed balance")
}
	for _, p := range e.state.Intents {
		if p.TxID == sweep.TxID && p.Status == "confirmed" {
			t.Fatal("reorg not reflected")
		}
	}
	restored, err := loadState(e.file)
	if err != nil || restored.ColdIndex != 1 {
		t.Fatal("cold reservation lost")
	}
// Late deposits before destruction must retain keys and restore the funds blocker.
call("", "generatetoaddress", []any{3, mining}, nil)
call("miner", "sendtoaddress", []any{*wallets[0].Address, btc(20000)}, nil)
if err = e.sync(); err != nil {
t.Fatal(err)
}
if e.state.Wallets[expiredIndex].DestructionStatus != "waiting_for_funds" {
t.Fatal("late deposit did not block destruction")
}
if deletionAllowed(e.state.Wallets[expiredIndex]) == nil {
t.Fatal("late-funded history must not be deleted")
}
}
