package main

import (
	"encoding/json"
	"errors"
	"math/big"
	"strconv"
	"time"
)

type UTXO struct {
	TxID      string      `json:"txid"`
	Vout      int         `json:"vout"`
	Amount    json.Number `json:"amount"`
	Spendable bool        `json:"spendable"`
	Safe      bool        `json:"safe"`
}
type PaymentInput struct {
	Address      string `json:"address"`
	Amount       string `json:"amountSats"`
	FeeRate      string `json:"feeRate"`
	ReplacesTxid string `json:"replacesTxid,omitempty"`
}

func (e *Engine) prepareBump(input PaymentInput) (*Intent, error) {
	if err := e.ready(); err != nil {
		return nil, err
	}
	if e.state.Settings.Paused {
		return nil, errors.New("sending is paused")
	}
	rate, ceiling, err := e.feeLimits(input.FeeRate)
	if err != nil {
		return nil, err
	}
	var old *Intent
	for n := range e.state.Intents {
		i := &e.state.Intents[n]
		if i.TxID == input.ReplacesTxid && i.Wallet == "vault-spending" {
			old = i
			break
		}
	}
	if old == nil || old.Status != "broadcast" {
		return nil, errors.New("only a pending spending-vault transaction can be replaced")
	}
	if input.Address != old.Address || input.Amount != strconv.FormatInt(old.Amount, 10) {
		return nil, errors.New("replacement must preserve the original recipient and amount")
	}
	for _, i := range e.state.Intents {
		if i.Replaces == old.TxID && i.Status != "expired" && i.Status != "replaced" {
			return nil, errors.New("a replacement review already exists; resolve it before retrying")
		}
	}
	var funded struct {
		PSBT   string      `json:"psbt"`
		Fee    json.Number `json:"fee"`
		Errors []string    `json:"errors"`
	}
	if err = e.rpc.Call(old.Wallet, "psbtbumpfee", []any{old.TxID, map[string]any{"fee_rate": rate, "replaceable": true}}, &funded); err != nil {
		return nil, err
	}
	if len(funded.Errors) > 0 || funded.PSBT == "" {
		return nil, errors.New("Core rejected the replacement")
	}
	fee, err := parseBTC(funded.Fee)
	if err != nil || fee <= old.Fee || fee > ceiling {
		return nil, errors.New("replacement fee violates configured ceilings")
	}
	var decoded struct {
		Tx struct {
			Vin  []map[string]any `json:"vin"`
			Vout []struct {
				Value  json.Number `json:"value"`
				Script struct {
					Address string `json:"address"`
				} `json:"scriptPubKey"`
			} `json:"vout"`
		} `json:"tx"`
	}
	if err = e.rpc.Call("", "decodepsbt", []any{funded.PSBT}, &decoded); err != nil {
		return nil, err
	}
	var received int64
	for _, output := range decoded.Tx.Vout {
		if output.Script.Address == old.Address {
			value, err := parseBTC(output.Value)
			if err != nil {
				return nil, err
			}
			received += value
		}
	}
	if received != old.Amount {
		return nil, errors.New("replacement destination amount changed")
	}
	inputs := []map[string]any{}
	for _, v := range decoded.Tx.Vin {
		inputs = append(inputs, map[string]any{"txid": v["txid"], "vout": v["vout"]})
	}
	next := Intent{ID: randomID(), Wallet: old.Wallet, Address: old.Address, Amount: old.Amount, Fee: fee, PSBT: funded.PSBT,
		Status: "review", Created: stamp(), Expires: time.Now().UTC().Add(10 * time.Minute).Format(time.RFC3339), Inputs: inputs, Replaces: old.TxID}
	e.state.Intents = append(e.state.Intents, next)
	if err = e.persist(); err != nil {
		return nil, err
	}
	for _, in := range inputs {
		var out json.RawMessage
		if err = e.rpc.Call("", "gettxout", []any{in["txid"], in["vout"], true}, &out); err != nil {
			return nil, err
		}
		if string(out) != "null" {
			_ = e.rpc.Call(old.Wallet, "lockunspent", []any{false, []map[string]any{in}}, nil)
		}
	}
	return &e.state.Intents[len(e.state.Intents)-1], nil
}

func (e *Engine) releaseReview(i *Intent) error {
	var locked []map[string]any
	if err := e.rpc.Call(i.Wallet, "listlockunspent", []any{}, &locked); err != nil {
		return err
	}
	for _, candidate := range locked {
		for _, input := range i.Inputs {
			a, _ := json.Marshal(candidate)
			b, _ := json.Marshal(input)
			if string(a) == string(b) {
				if err := e.rpc.Call(i.Wallet, "lockunspent", []any{true, []map[string]any{candidate}}, nil); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (e *Engine) feeLimits(rate string) (json.Number, int64, error) {
	// Convert sat/vB decimal through the same exact fixed-point parser.
	r, err := parseBTC(json.Number(rate))
	if err != nil || r <= 0 {
		return "", 0, errors.New("positive fee rate required")
	}
	ceiling, err := parseBTC(json.Number(e.state.Settings.FeeRate))
	if err != nil || ceiling <= 0 || r > ceiling {
		return "", 0, errors.New("fee rate exceeds ceiling or limits are unset")
	}
	total, err := strconv.ParseInt(e.state.Settings.TotalFee, 10, 64)
	if err != nil || total <= 0 {
		return "", 0, errors.New("total fee ceiling must be configured")
	}
	return json.Number(rate), total, nil
}
func (e *Engine) prepare(wallet, address string, amount int64, rate string, inputs []map[string]any, subtract bool) (*Intent, error) {
	if err := e.ready(); err != nil {
		return nil, err
	}
	if e.state.Settings.Paused {
		return nil, errors.New("sending is paused; review operational settings")
	}
	if amount <= 0 || amount > MaxSats {
		return nil, errors.New("invalid amount")
	}
	feeRate, maxFee, err := e.feeLimits(rate)
	if err != nil {
		return nil, err
	}
	var valid struct {
		Valid bool `json:"isvalid"`
	}
	if err = e.rpc.Call("", "validateaddress", []any{address}, &valid); err != nil {
		return nil, err
	}
	if !valid.Valid {
		return nil, errors.New("destination is invalid for the configured network")
	}
	if inputs == nil {
		inputs = []map[string]any{}
	}
	options := map[string]any{"fee_rate": feeRate, "replaceable": true, "lockUnspents": true, "includeWatching": false}
	if subtract {
		options["subtractFeeFromOutputs"] = []int{0}
		options["add_inputs"] = false
	}
	var funded struct {
		PSBT string      `json:"psbt"`
		Fee  json.Number `json:"fee"`
	}
	if err = e.rpc.Call(wallet, "walletcreatefundedpsbt", []any{inputs, []any{map[string]any{address: btc(amount)}}, 0, options, true}, &funded); err != nil {
		return nil, err
	}
	var decoded struct {
		Tx struct {
			Vin []map[string]any `json:"vin"`
		} `json:"tx"`
	}
	if err = e.rpc.Call("", "decodepsbt", []any{funded.PSBT}, &decoded); err != nil {
		return nil, err
	}
	locked := []map[string]any{}
	for _, v := range decoded.Tx.Vin {
		locked = append(locked, map[string]any{"txid": v["txid"], "vout": v["vout"]})
	}
	unlock := func() { _ = e.rpc.Call(wallet, "lockunspent", []any{true, locked}, nil) }
	fee, err := parseBTC(funded.Fee)
	if err != nil || fee <= 0 || fee > maxFee {
		unlock()
		return nil, errors.New("estimated fee exceeds absolute ceiling")
	}
	if subtract {
		amount -= fee
	}
	if amount <= 0 {
		unlock()
		return nil, errors.New("amount cannot cover fee")
	}
	i := Intent{ID: randomID(), Wallet: wallet, Address: address, Amount: amount, Fee: fee, PSBT: funded.PSBT, Status: "review", Created: stamp(), Expires: time.Now().UTC().Add(10 * time.Minute).Format(time.RFC3339), Inputs: locked}
	e.state.Intents = append(e.state.Intents, i)
	if err = e.persist(); err != nil {
		unlock()
		return nil, err
	}
	return &e.state.Intents[len(e.state.Intents)-1], nil
}
func reviewView(i *Intent, network string) map[string]any {
	return map[string]any{"id": i.ID, "address": i.Address, "amountSats": strconv.FormatInt(i.Amount, 10), "feeSats": strconv.FormatInt(i.Fee, 10), "totalSats": strconv.FormatInt(i.Amount+i.Fee, 10), "expiresAt": i.Expires, "network": network}
}
func transactionView(i *Intent) Transaction {
	status := "pending"
	confs := 0
	if i.Status == "confirmed" {
		status = "confirmed"
		confs = 3
	}
	return Transaction{TxID: i.TxID, WalletID: i.Wallet, Direction: "outgoing", Amount: strconv.FormatInt(i.Amount, 10), Fee: strptr(strconv.FormatInt(i.Fee, 10)), FirstSeen: i.Created, Confirmations: confs, Status: status, Address: &i.Address}
}
func (e *Engine) send(i *Intent) error {
	if i.TxID != "" && (i.Status == "broadcast" || i.Status == "confirmed") {
		return nil
	}
	if err := e.ready(); err != nil {
		return err
	}
	if e.state.Settings.Paused {
		return errors.New("sending is paused")
	}
	maxFee, err := strconv.ParseInt(e.state.Settings.TotalFee, 10, 64)
	if err != nil || maxFee <= 0 || i.Fee > maxFee {
		return errors.New("fee ceiling changed; review again")
	}
	if i.Status == "review" {
		expires, err := time.Parse(time.RFC3339, i.Expires)
		if err != nil || time.Now().After(expires) {
			return errors.New("payment review expired")
		}
		// Core may have restarted (releasing non-persistent locks). Re-lock and
		// verify every reviewed input remains unspent before signing.
		if i.Replaces != "" {
			var pending map[string]any
			if err = e.rpc.Call("", "getmempoolentry", []any{i.Replaces}, &pending); err != nil {
				return errors.New("original transaction is no longer pending; review again")
			}
		}
		for _, in := range i.Inputs {
			var out json.RawMessage
			if err = e.rpc.Call("", "gettxout", []any{in["txid"], in["vout"], true}, &out); err != nil {
				return err
			}
			if string(out) == "null" && i.Replaces == "" {
				return errors.New("reviewed input is no longer spendable; review again")
			}
		}
		var signed struct {
			PSBT     string `json:"psbt"`
			Complete bool   `json:"complete"`
		}
		if err = e.rpc.Call(i.Wallet, "walletprocesspsbt", []any{i.PSBT, true, "ALL", true}, &signed); err != nil {
			return err
		}
		if !signed.Complete {
			return errors.New("signing incomplete")
		}
		var finalized struct {
			Hex      string `json:"hex"`
			Complete bool   `json:"complete"`
		}
		if err = e.rpc.Call("", "finalizepsbt", []any{signed.PSBT}, &finalized); err != nil {
			return err
		}
		if !finalized.Complete {
			return errors.New("finalization incomplete")
		}
		var decoded struct {
			TxID  string `json:"txid"`
			Vsize int64  `json:"vsize"`
		}
		if err = e.rpc.Call("", "decoderawtransaction", []any{finalized.Hex}, &decoded); err != nil {
			return err
		}
		if decoded.TxID == "" || decoded.Vsize <= 0 {
			return errors.New("invalid finalized transaction")
		}
		rate, _ := parseBTC(json.Number(e.state.Settings.FeeRate))
		actualFee := new(big.Int).Mul(big.NewInt(i.Fee), big.NewInt(100000000))
		allowedFee := new(big.Int).Mul(big.NewInt(rate), big.NewInt(decoded.Vsize))
		if rate <= 0 || actualFee.Cmp(allowedFee) > 0 {
			return errors.New("final signed fee rate exceeds ceiling")
		}
		i.Raw = finalized.Hex
		i.TxID = decoded.TxID
		i.Status = "signed"
		i.PSBT = ""
		// Durable raw bytes and txid precede any broadcast. No new transaction
		// is constructed on retry, even when the network response is ambiguous.
		if err = e.persist(); err != nil {
			return err
		}
	}
	if i.Status != "signed" && i.Status != "broadcast_unknown" {
		return errors.New("intent cannot be sent")
	}
	// Reconcile this exact txid first. Missing UTXOs are never proof of success.
	var known struct {
		Confirmations int `json:"confirmations"`
	}
	if err = e.rpc.Call(i.Wallet, "gettransaction", []any{i.TxID}, &known); err == nil {
		if known.Confirmations < 0 {
			return errors.New("transaction conflicted; manual review required")
		}
		if known.Confirmations >= 3 {
			i.Status = "confirmed"
			return e.persist()
		}
		var mempool map[string]any
		if known.Confirmations > 0 || e.rpc.Call("", "getmempoolentry", []any{i.TxID}, &mempool) == nil {
			i.Status = "broadcast"
			return e.persist()
		}
	}
	i.Status = "broadcast_unknown"
	if err = e.persist(); err != nil {
		return err
	}
	var txid string
	// maxfeerate uses BTC/kvB; explicit local ceilings were checked above.
	if err = e.rpc.Call("", "sendrawtransaction", []any{i.Raw}, &txid); err != nil {
		return errors.New("broadcast outcome uncertain; exact transaction retained for reconciliation")
	}
	if txid != i.TxID {
		return errors.New("broadcast returned unexpected transaction ID")
	}
	i.Status = "broadcast"
	if i.Replaces != "" {
		for n := range e.state.Intents {
			if e.state.Intents[n].TxID == i.Replaces {
				e.state.Intents[n].Status = "replaced"
			}
		}
	}
	return e.persist()
}
func (e *Engine) reconcile() error {
	for n := range e.state.Intents {
		i := &e.state.Intents[n]
		if i.Status == "review" {
			expires, err := time.Parse(time.RFC3339, i.Expires)
			if err != nil || time.Now().After(expires) {
				if err = e.releaseReview(i); err != nil {
					return err
				}
				i.PSBT = ""
				i.Status = "expired"
			} else {
				// Re-establish locks lost during a Core restart.
				_ = e.rpc.Call(i.Wallet, "lockunspent", []any{false, i.Inputs}, nil)
			}
			continue
		}
		if i.TxID == "" {
			continue
		}
		var tx struct {
			Confirmations int    `json:"confirmations"`
			ReplacedBy    string `json:"replaced_by_txid"`
			Abandoned     bool   `json:"abandoned"`
		}
		if err := e.rpc.Call(i.Wallet, "gettransaction", []any{i.TxID}, &tx); err != nil {
			i.Status = "broadcast_unknown"
			continue
		}
		if tx.ReplacedBy != "" {
			i.Status = "replaced"
			continue
		}
		if tx.Confirmations < 0 {
			i.Status = "conflicted"
			continue
		}
		if tx.Confirmations >= 3 {
			i.Status = "confirmed"
			continue
		}
		if tx.Confirmations > 0 {
			i.Status = "confirming"
			continue
		}
		var entry map[string]any
		if e.rpc.Call("", "getmempoolentry", []any{i.TxID}, &entry) == nil {
			i.Status = "broadcast"
			continue
		}
		// Includes reorgs and eviction. Do not blindly construct or broadcast a replacement.
		i.Status = "broadcast_unknown"
	}
	return nil
}
func (e *Engine) sweep() error {
	if e.state.Settings.Paused || e.descriptor == "" {
		return nil
	}
	if err := e.ready(); err != nil {
		return err
	}
	// Only sweep confirmed safe inputs. Outstanding intents block additional
	// spending from that wallet until reconciled.
	for _, w := range e.state.Wallets {
		if w.Kind != "temporary" || w.DestructionStatus == "completed" || w.Status == "creating" {
			continue
		}
		pending := false
		for _, i := range e.state.Intents {
			if i.Wallet == w.ID && i.Status != "confirmed" && i.Status != "expired" && i.Status != "replaced" {
				pending = true
			}
		}
		if pending {
			continue
		}
		var utxos []UTXO
		if err := e.rpc.Call(w.ID, "listunspent", []any{3}, &utxos); err != nil {
			return err
		}
		var total int64
		inputs := []map[string]any{}
		for _, u := range utxos {
			if !u.Safe || !u.Spendable {
				continue
			}
			n, err := parseBTC(u.Amount)
			if err != nil {
				return err
			}
			total += n
			inputs = append(inputs, map[string]any{"txid": u.TxID, "vout": u.Vout})
		}
		if total == 0 {
			continue
		}
		var estimate struct {
			Rate   json.Number `json:"feerate"`
			Errors []string    `json:"errors"`
		}
		if err := e.rpc.Call("", "estimatesmartfee", []any{3, "CONSERVATIVE"}, &estimate); err != nil {
			return err
		}
		if len(estimate.Errors) > 0 || estimate.Rate == "" {
			return errors.New("fee estimate unavailable; automatic sweep paused")
		}
		satsPerKB, err := parseBTC(estimate.Rate)
		if err != nil {
			return err
		}
		rate := strconv.FormatInt((satsPerKB+999)/1000, 10)
		if _, _, err = e.feeLimits(rate); err != nil {
			return err
		}
		address, err := e.coldDestination()
		if err != nil {
			return err
		}
		i, err := e.prepare(w.ID, address, total, rate, inputs, true)
		if err != nil {
			return err
		}
		if err = e.send(i); err != nil {
			return err
		}
	}
	return nil
}
