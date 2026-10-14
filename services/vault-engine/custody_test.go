package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

func TestCustodyModeAndSources(t *testing.T) {
	e := &Engine{state: State{Settings: Settings{Paused: true}}}
	t.Setenv("VAULT_CUSTODY_MODE", "server")
	if err := e.configureCustody(); err != nil { t.Fatal(err) }
	e.state.Wallets = []Wallet{
		blankWallet("vault-reserve", "Main vault", "reserve"),
		blankWallet("vault-spending", "Spending", "spending"),
		blankWallet("vault-cold", "Cold", "cold"),
		blankWallet("temp-test", "Temporary", "temporary"),
	}
	for _, id := range []string{"vault-reserve", "vault-spending", ""} {
		if _, err := e.paymentWallet(id); err != nil { t.Fatal(err) }
	}
	for _, id := range []string{"vault-cold", "temp-test", "missing"} {
		if _, err := e.paymentWallet(id); err == nil { t.Fatalf("accepted %s", id) }
	}
	t.Setenv("VAULT_CUSTODY_MODE", "external")
	e.state.Intents = []Intent{{Status: "broadcast_unknown"}}
	if err := e.configureCustody(); err == nil { t.Fatal("changed custody during uncertain payment") }
	e.state.Intents = nil
	e.state.Settings.Paused = false
	if err := e.configureCustody(); err == nil { t.Fatal("changed custody while sending enabled") }
	e.state.Settings.Paused = true
	if err := e.configureCustody(); err != nil { t.Fatal(err) }
	if e.canSpendWallet("vault-reserve") { t.Fatal("external mode permitted reserve spending") }
	t.Setenv("VAULT_CUSTODY_MODE", "invalid")
	if err := e.configureCustody(); err == nil { t.Fatal("invalid mode accepted") }
}

func TestRegtestServerCustody(t *testing.T) {
	if os.Getenv("VAULT_REGTEST") != "1" { t.Skip("set VAULT_REGTEST=1 with Core installed") }
	dir := t.TempDir()
	port := freePort(t)
	cmd := exec.Command("bitcoind", "-regtest", "-server=1", "-datadir="+dir,
		"-rpcport="+port, "-listen=0", "-dnsseed=0", "-discover=0", "-connect=0",
		"-fallbackfee=0.00002000", "-persistmempool=0")
	if err := cmd.Start(); err != nil { t.Fatal(err) }
	rpc := &RPC{URL: "http://127.0.0.1:"+port, CookieFile: filepath.Join(dir, "regtest", ".cookie"), Client: &http.Client{Timeout: 20*time.Second}}
	t.Cleanup(func() { _ = rpc.Call("", "stop", []any{}, nil); _ = cmd.Wait() })
	ready := false
	for n := 0; n < 200; n++ {
		if rpc.Call("", "getblockchaininfo", []any{}, nil) == nil { ready = true; break }
		time.Sleep(100*time.Millisecond)
	}
	if !ready { t.Fatal("Core did not start") }
	call := func(wallet, method string, params, out any) {
		t.Helper()
		if err := rpc.Call(wallet, method, params, out); err != nil { t.Fatalf("%s: %v", method, err) }
	}
	call("", "createwallet", map[string]any{"wallet_name":"miner","descriptors":true}, nil)
	var mining string
	call("miner", "getnewaddress", []any{}, &mining)
	call("", "generatetoaddress", []any{101, mining}, nil)
	state, _ := loadState(filepath.Join(dir,"engine.json"))
	state.CustodyMode = serverCustody
	e := &Engine{rpc:rpc, state:state, file:filepath.Join(dir,"engine.json"), network:"regtest"}
	if err := e.sync(); err != nil { t.Fatal(err) }
	if len(e.state.Wallets) != 2 || !e.canSpendWallet("vault-reserve") { t.Fatal("server wallets not initialized") }
	var reserve string
	for i, w := range e.state.Wallets {
		got, err := e.receiveWallet(i)
		if err != nil || got.Address == nil { t.Fatalf("receive %s: %v", w.ID, err) }
		if w.Kind == "reserve" { reserve = *got.Address }
	}
	e.state.Settings = Settings{Paused:false, FeeRate:"20", TotalFee:"100000", HotLimit:"200000000"}
	call("miner","sendtoaddress",[]any{reserve, btc(2000000)},nil)
	call("","generatetoaddress",[]any{3,mining},nil)
	if err := e.sync(); err != nil { t.Fatal(err) }
	request := func(route string, input any) *httptest.ResponseRecorder {
		t.Helper()
		raw, _ := json.Marshal(input)
		res := httptest.NewRecorder()
		e.handler(res, httptest.NewRequest("POST",route,bytes.NewReader(raw)))
		return res
	}
	res := request("/payments/review",PaymentInput{WalletID:"vault-reserve",Address:mining,Amount:"50000",FeeRate:"2"})
	if res.Code != 200 { t.Fatalf("review: %s",res.Body.String()) }
	var review map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &review); err != nil { t.Fatal(err) }
	if review["walletId"] != "vault-reserve" { t.Fatal("review source not pinned") }
	approval := map[string]any{"reviewId":review["id"],"confirmed":true}
	res = request("/payments/send",approval)
	if res.Code != 200 { t.Fatalf("send: %s",res.Body.String()) }
	var sent Transaction
	if err := json.Unmarshal(res.Body.Bytes(), &sent); err != nil { t.Fatal(err) }
	res = request("/payments/send",approval)
	var duplicate Transaction
	if err := json.Unmarshal(res.Body.Bytes(), &duplicate); err != nil { t.Fatal(err) }
	if res.Code != 200 || sent.TxID != duplicate.TxID || duplicate.WalletID != "vault-reserve" {
		t.Fatal("duplicate send changed transaction/source")
	}
	wrong := request("/payments/review",PaymentInput{WalletID:"vault-spending",Address:mining,Amount:"50000",FeeRate:"4",ReplacesTxid:sent.TxID})
	if wrong.Code == 200 { t.Fatal("replacement allowed from wrong wallet") }
	bump := request("/payments/review",PaymentInput{WalletID:"vault-reserve",Address:mining,Amount:"50000",FeeRate:"4",ReplacesTxid:sent.TxID})
	if bump.Code != 200 { t.Fatalf("reserve replacement: %s",bump.Body.String()) }
	if err := json.Unmarshal(bump.Body.Bytes(), &review); err != nil { t.Fatal(err) }
	if res := request("/payments/send",map[string]any{"reviewId":review["id"],"confirmed":true}); res.Code != 200 { t.Fatal(res.Body.String()) }
	call("","generatetoaddress",[]any{3,mining},nil)
	if err := e.sync(); err != nil { t.Fatal(err) }
	saved, err := loadState(e.file)
	if err != nil { t.Fatal(err) }
	restarted := &Engine{rpc:rpc,state:saved,file:e.file,network:"regtest"}
	if err := restarted.sync(); err != nil { t.Fatal(err) }
	if len(restarted.state.Wallets) != 2 || !restarted.canSpendWallet("vault-reserve") { t.Fatal("restart lost custody") }
	// Real temporary-wallet consolidation into a fresh, spendable reserve address.
	temps, err := restarted.createWallets("Temporary",1)
	if err != nil { t.Fatal(err) }
	call("miner","sendtoaddress",[]any{*temps[0].Address,btc(1000000)},nil)
	call("","generatetoaddress",[]any{3,mining},nil)
	var coins []UTXO
	call(temps[0].ID,"listunspent",[]any{3},&coins)
	inputs := []map[string]any{}
	var amount int64
	for _, c := range coins {
		n, err := parseBTC(c.Amount); if err != nil { t.Fatal(err) }
		amount += n
		inputs = append(inputs,map[string]any{"txid":c.TxID,"vout":c.Vout})
	}
	destination, err := restarted.savingsDestination()
	if err != nil || destination == reserve { t.Fatal("fresh main-vault destination not allocated") }
	intent, err := restarted.prepare(temps[0].ID,destination,amount,"2",inputs,true)
	if err != nil { t.Fatal(err) }
	if err := restarted.send(intent); err != nil { t.Fatal(err) }
	call("","generatetoaddress",[]any{3,mining},nil)
	if err := restarted.sync(); err != nil { t.Fatal(err) }
	var addressInfo struct { IsMine bool `json:"ismine"` }
	call("vault-reserve","getaddressinfo",[]any{destination},&addressInfo)
	if !addressInfo.IsMine { t.Fatal("sweep destination not controlled by reserve") }
	for _, w := range restarted.state.Wallets {
		if w.ID == temps[0].ID && w.Confirmed != "0" { t.Fatal("temporary wallet was not drained") }
	}
	// Core backup/restore must retain reserve keys; JSON export alone is not proof.
	backup := filepath.Join(dir, "reserve-backup.dat")
	call("vault-reserve", "backupwallet", []any{backup}, nil)
	call("", "restorewallet", map[string]any{"wallet_name":"restored-reserve", "backup_file":backup, "load_on_startup":false}, nil)
	var restoredInfo struct { PrivateKeys bool `json:"private_keys_enabled"` }
	call("restored-reserve", "getwalletinfo", []any{}, &restoredInfo)
	call("restored-reserve", "getaddressinfo", []any{destination}, &addressInfo)
	if !restoredInfo.PrivateKeys || !addressInfo.IsMine { t.Fatal("reserve backup did not restore signing custody") }
}
