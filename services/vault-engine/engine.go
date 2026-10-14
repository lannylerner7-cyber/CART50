package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Engine struct {
	mu                        sync.Mutex
	rpc                       *RPC
	state                     State
	file, network, descriptor string
	lastSync                  string
	connected                 bool
blocks                    int
}
type Chain struct {
	Chain    string  `json:"chain"`
	Blocks   int     `json:"blocks"`
	Headers  int     `json:"headers"`
	Progress float64 `json:"verificationprogress"`
	IBD      bool    `json:"initialblockdownload"`
	Best     string  `json:"bestblockhash"`
}

func (e *Engine) chain() (Chain, error) {
	var c Chain
	err := e.rpc.Call("", "getblockchaininfo", []any{}, &c)
	if err != nil {
		return c, err
	}
	if c.Chain != e.network || (c.Chain != "regtest" && c.Chain != "signet") {
		return c, errors.New("network mismatch: mainnet is disabled")
	}
	return c, nil
}
func (e *Engine) ready() error {
	c, err := e.chain()
	if err != nil {
		return err
	}
	if c.IBD || c.Blocks < c.Headers {
		return errors.New("node is syncing; spending and creation paused")
	}
	return nil
}
func (e *Engine) persist() error {
	if err := saveState(e.file, e.state); err != nil {
		e.state.Settings.Paused = true
		return err
	}
	return nil
}
func (e *Engine) ensureWallet(id string, watch bool) error {
	var info map[string]any
	if err := e.rpc.Call(id, "getwalletinfo", []any{}, &info); err == nil {
		return nil
	}
	err := e.rpc.Call("", "loadwallet", map[string]any{"filename": id, "load_on_startup": true}, &info)
	if err == nil {
		return nil
	}
	// createwallet refuses existing wallets rather than replacing them.
	return e.rpc.Call("", "createwallet", map[string]any{"wallet_name": id, "disable_private_keys": watch, "blank": watch, "descriptors": true, "load_on_startup": true}, &info)
}
func (e *Engine) initialize() error {
	if err := e.ready(); err != nil {
		return err
	}
if e.state.CustodyMode == serverCustody {
if err := e.ensureReserve(); err != nil {
return err
}
}
	for _, p := range []struct {
		id, label, kind string
		watch           bool
	}{{"vault-spending", "Spending vault", "spending", false}, {"vault-cold", "Cold savings", "cold", true}} {
		if p.watch && e.descriptor == "" {
			continue
		}
if p.watch && e.state.CustodyMode == serverCustody {
continue // Preserve existing watch-only records, but do not create another.
}
		found := false
		for _, w := range e.state.Wallets {
			if w.ID == p.id {
				found = true
			}
		}
		if err := e.ensureWallet(p.id, p.watch); err != nil {
			return err
		}
		if !found {
			w := blankWallet(p.id, p.label, p.kind)
			if !p.watch {
				var addr string
				if err := e.rpc.Call(p.id, "getnewaddress", []any{"Spending vault", "bech32"}, &addr); err != nil {
					return err
				}
				w.Address = &addr
			}
			if p.watch {
				var result []struct {
					Success bool `json:"success"`
				}
				if err := e.rpc.Call(p.id, "importdescriptors", []any{[]any{map[string]any{"desc": e.descriptor, "timestamp": "now", "active": false, "range": []int{0, 1000}}}}, &result); err != nil {
					return err
				}
				if len(result) != 1 || !result[0].Success {
					return errors.New("cold descriptor import rejected")
				}
			}
			e.state.Wallets = append(e.state.Wallets, w)
			if err := e.persist(); err != nil {
				return err
			}
		}
	}
	return nil
}
func (e *Engine) coldDestination() (string, error) {
	if e.descriptor == "" {
		return "", errors.New("verified cold descriptor not configured")
	}
	next := e.state.ColdIndex
	e.state.ColdIndex++
	if err := e.persist(); err != nil {
		return "", err
	}
	var addresses []string
	if err := e.rpc.Call("", "deriveaddresses", []any{e.descriptor, []int64{next, next}}, &addresses); err != nil {
		return "", err
	}
	if len(addresses) != 1 {
		return "", errors.New("cold descriptor must yield one address")
	}
	var imports []struct {
		Success bool `json:"success"`
	}
	if err := e.rpc.Call("vault-cold", "importdescriptors", []any{[]any{map[string]any{"desc": e.descriptor, "timestamp": "now", "active": false, "range": []int64{0, next + 1000}}}}, &imports); err != nil {
		return "", err
	}
	if len(imports) != 1 || !imports[0].Success {
		return "", errors.New("cold watch range update failed")
	}
	return addresses[0], nil
}
func (e *Engine) syncWallet(w *Wallet) error {
	expire(w, time.Now())
	if w.DestructionStatus == "completed" {
		return nil
	}
	// Explicit JSON field names for Bitcoin Core's snake_case fields.
	var b struct {
		Mine struct {
			Trusted  json.Number `json:"trusted"`
			Pending  json.Number `json:"untrusted_pending"`
			Immature json.Number `json:"immature"`
		} `json:"mine"`
	}
	if err := e.rpc.Call(w.ID, "getbalances", []any{}, &b); err != nil {
		return err
	}
	trusted, err := parseBTC(b.Mine.Trusted)
	if err != nil {
		return err
	}
	pending, err := parseBTC(b.Mine.Pending)
	if err != nil {
		return err
	}
	var confirmedAmount json.Number
	if err = e.rpc.Call(w.ID, "getbalance", []any{"*", 1, true}, &confirmedAmount); err != nil {
		return err
	}
	confirmed, err := parseBTC(confirmedAmount)
	if err != nil {
		return err
	}
	w.Confirmed = strconv.FormatInt(confirmed, 10)
	w.Unconfirmed = strconv.FormatInt(trusted+pending-confirmed, 10)
	var utxos []UTXO
	if err = e.rpc.Call(w.ID, "listunspent", []any{1}, &utxos); err != nil {
		return err
	}
	var available int64
	for _, u := range utxos {
		if u.Spendable && u.Safe {
			n, err := parseBTC(u.Amount)
			if err != nil {
				return err
			}
			available += n
		}
	}
	w.Available = strconv.FormatInt(available, 10)
	var received json.Number
	if w.Kind == "temporary" && w.Address != nil {
		if err = e.rpc.Call(w.ID, "getreceivedbyaddress", []any{*w.Address, 0}, &received); err != nil {
			return err
		}
		r, err := parseBTC(received)
		if err != nil {
			return err
		}
		w.Received = strconv.FormatInt(r, 10)
	} else {
		var receivedRows []struct {
			Amount json.Number `json:"amount"`
		}
		if err = e.rpc.Call(w.ID, "listreceivedbyaddress", []any{0, false, true}, &receivedRows); err != nil {
			return err
		}
		var total int64
		for _, row := range receivedRows {
			n, err := parseBTC(row.Amount)
			if err != nil {
				return err
			}
			total += n
		}
		w.Received = strconv.FormatInt(total, 10)
	}
	var swept int64
	for _, i := range e.state.Intents {
		if i.Wallet == w.ID && i.Status == "confirmed" {
			swept += i.Amount
		}
	}
	w.Swept = strconv.FormatInt(swept, 10)
	w.LastSync = strptr(stamp())
	return nil
}
func (e *Engine) sync() error {
	e.connected = false
	c, err := e.chain()
	if err != nil {
		return err
	}
	if c.IBD || c.Blocks < c.Headers {
		return errors.New("node still synchronizing")
	}
	if err = e.initialize(); err != nil {
		return err
	}
	if err = e.reconcile(); err != nil {
		return err
	}
	for n := range e.state.Wallets {
		// A crash during batch creation keeps its identity in the journal.
		// Recover that wallet rather than inventing another identity.
		w := &e.state.Wallets[n]
		if w.Status == "creating" {
			if err = e.ensureWallet(w.ID, false); err != nil {
				return err
			}
			if w.Address == nil {
				var addresses map[string]any
				_ = e.rpc.Call(w.ID, "getaddressesbylabel", []any{w.Label}, &addresses)
				for a := range addresses {
					w.Address = strptr(a)
					break
				}
				if w.Address == nil {
					var a string
					if err = e.rpc.Call(w.ID, "getnewaddress", []any{w.Label, "bech32"}, &a); err != nil {
						return err
					}
					w.Address = &a
				}
			}
			w.Status = "active"
			if err = e.persist(); err != nil {
				return err
			}
		}
		if err = e.syncWallet(&e.state.Wallets[n]); err != nil {
			return err
		}
	}
	e.refreshDestructionReadiness(time.Now())
	e.state.Checkpoint = c.Best
e.blocks = c.Blocks
	e.state.Recovery = "healthy"
	e.lastSync = stamp()
	e.connected = true
	return e.persist()
}
func (e *Engine) createWallets(label string, count int) ([]Wallet, error) {
	if err := e.ready(); err != nil {
		return nil, err
	}
	if count < 1 || count > 200 || len(strings.TrimSpace(label)) == 0 || len(label) > 64 {
		return nil, errors.New("invalid label or batch count")
	}
	var hot int64
	for _, w := range e.state.Wallets {
		if w.Kind != "cold" {
			n, _ := strconv.ParseInt(w.Confirmed, 10, 64)
			p, _ := strconv.ParseInt(w.Unconfirmed, 10, 64)
			hot += n + p
		}
	}
	limit, _ := strconv.ParseInt(e.state.Settings.HotLimit, 10, 64)
	if hot > 0 && (limit == 0 || hot >= limit) {
		return nil, errors.New("hot exposure limit reached or unset; sweep existing funds first")
	}
	if len(e.state.Wallets)+count > 2000 {
		return nil, errors.New("wallet capacity reached")
	}
	created := []Wallet{}
	for i := 0; i < count; i++ {
		id := "temp-" + randomID()
		w := blankWallet(id, label, "temporary")
		if count > 1 {
			w.Label = fmt.Sprintf("%s %d", label, i+1)
		}
		// Journal the identity before creating its independent Core wallet.
		w.Status = "creating"
		e.state.Wallets = append(e.state.Wallets, w)
		if err := e.persist(); err != nil {
			return nil, err
		}
		if err := e.ensureWallet(id, false); err != nil {
			return nil, err
		}
		var addr string
		if err := e.rpc.Call(id, "getnewaddress", []any{w.Label, "bech32"}, &addr); err != nil {
			return nil, err
		}
		w.Address = &addr
		w.Status = "active"
		e.state.Wallets[len(e.state.Wallets)-1] = w
		if err := e.persist(); err != nil {
			return nil, err
		}
		created = append(created, w)
	}
	return created, nil
}
func (e *Engine) transactions() ([]Transaction, error) {
	result := []Transaction{}
	for _, w := range e.state.Wallets {
		if w.DestructionStatus == "completed" {
			continue
		}
		for offset := 0; ; offset += 1000 {
			var rows []struct {
				TxID          string      `json:"txid"`
				Category      string      `json:"category"`
				Amount        json.Number `json:"amount"`
				Fee           json.Number `json:"fee"`
				Time          int64       `json:"time"`
				Confirmations int         `json:"confirmations"`
				Address       string      `json:"address"`
				ReplacedBy    string      `json:"replaced_by_txid"`
			}
			if err := e.rpc.Call(w.ID, "listtransactions", []any{"*", 1000, offset, true}, &rows); err != nil {
				return nil, err
			}
			for _, r := range rows {
				n, err := parseBTC(r.Amount)
				if err != nil {
					return nil, err
				}
				direction := "incoming"
				if n < 0 {
					direction = "outgoing"
					n = -n
				}
				status := "pending"
				if r.Confirmations >= 3 {
					status = "confirmed"
				} else if r.Confirmations > 0 {
					status = "confirming"
				} else if r.Confirmations < 0 {
					status = "conflicted"
				}
				if r.ReplacedBy != "" {
					status = "replaced"
				}
				t := Transaction{TxID: r.TxID, WalletID: w.ID, Direction: direction, Amount: strconv.FormatInt(n, 10), FirstSeen: time.Unix(r.Time, 0).UTC().Format(time.RFC3339), Confirmations: r.Confirmations, Status: status}
				if r.Fee != "" {
					fee, err := parseBTC(r.Fee)
					if err != nil {
						return nil, err
					}
					if fee < 0 {
						fee = -fee
					}
					t.Fee = strptr(strconv.FormatInt(fee, 10))
				}
				if r.Address != "" {
					t.Address = &r.Address
				}
				if r.ReplacedBy != "" {
					t.ReplacedBy = &r.ReplacedBy
				}
				result = append(result, t)
			}
			if len(rows) < 1000 {
				break
			}
			if offset >= 99000 {
				return nil, errors.New("transaction history exceeds explorer query capacity")
			}
		}
	}
	return result, nil
}
func newEngine() (*Engine, error) {
	network := os.Getenv("BITCOIN_NETWORK")
	if network == "" {
		network = "signet"
	}
	if network != "signet" && network != "regtest" {
		return nil, errors.New("only signet and regtest are permitted")
	}
	dir := os.Getenv("ENGINE_DATA_DIR")
	if dir == "" {
		dir = ".vault-data"
	}
	file := dir + "/engine.json"
	s, err := loadState(file)
	if err != nil {
		return nil, err
	}
	descriptor := os.Getenv("COLD_DESCRIPTOR")
	if descriptor != "" {
		h := sha256.Sum256([]byte(descriptor))
		if hex.EncodeToString(h[:]) != os.Getenv("COLD_DESCRIPTOR_SHA256") {
			return nil, errors.New("cold descriptor fingerprint mismatch")
		}
		if strings.Contains(descriptor, "prv") || !strings.Contains(descriptor, "/*") || !strings.Contains(descriptor, "#") {
			return nil, errors.New("checksummed ranged public descriptor required")
		}
	}
	rpcURL := os.Getenv("BTC_RPC_URL")
	if rpcURL == "" {
		rpcURL = "http://127.0.0.1:38332"
	}
e := &Engine{rpc: &RPC{URL: rpcURL, CookieFile: os.Getenv("BTC_RPC_COOKIE_FILE"), Client: &http.Client{Timeout: 50 * time.Second}}, file: file, state: s, network: network, descriptor: descriptor}
if err := e.configureCustody(); err != nil {
return nil, err
}
return e, nil
}
