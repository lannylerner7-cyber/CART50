package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type RPC struct {
	URL, CookieFile string
	Client          *http.Client
}
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

func (e *RPCError) Error() string { return fmt.Sprintf("Bitcoin Core RPC error %d", e.Code) }
func (r *RPC) Call(wallet, method string, params any, result any) error {
	raw, err := json.Marshal(map[string]any{"jsonrpc": "2.0", "id": "vault", "method": method, "params": params})
	if err != nil {
		return err
	}
	endpoint := strings.TrimRight(r.URL, "/")
	if wallet != "" {
		endpoint += "/wallet/" + url.PathEscape(wallet)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	credential, err := os.ReadFile(r.CookieFile)
	if err != nil {
		return errors.New("RPC cookie unavailable")
	}
	parts := strings.SplitN(strings.TrimSpace(string(credential)), ":", 2)
	if len(parts) != 2 {
		return errors.New("invalid RPC cookie")
	}
	req.SetBasicAuth(parts[0], parts[1])
	req.Header.Set("Content-Type", "application/json")
	res, err := r.Client.Do(req)
	if err != nil {
		return errors.New("Bitcoin Core unreachable")
	}
	defer res.Body.Close()
	var reply struct {
		Result json.RawMessage `json:"result"`
		Error  *RPCError       `json:"error"`
	}
	if err = json.NewDecoder(io.LimitReader(res.Body, 32<<20)).Decode(&reply); err != nil {
		return errors.New("invalid RPC response")
	}
	if reply.Error != nil {
		return reply.Error
	}
	if res.StatusCode != 200 {
		return errors.New("Bitcoin Core request failed")
	}
	if result == nil {
		return nil
	}
	d := json.NewDecoder(bytes.NewReader(reply.Result))
	d.UseNumber()
	return d.Decode(result)
}

const MaxSats int64 = 2100000000000000

// Decimal parsing is exact: Bitcoin RPC JSON numbers never pass through float64.
func parseBTC(n json.Number) (int64, error) {
	s := string(n)
	negative := strings.HasPrefix(s, "-")
	if negative {
		s = s[1:]
	}
	parts := strings.Split(s, ".")
	if len(parts) > 2 || parts[0] == "" {
		return 0, errors.New("invalid BTC amount")
	}
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(fraction) > 8 {
		return 0, errors.New("sub-satoshi amount")
	}
	digits := parts[0] + fraction + strings.Repeat("0", 8-len(fraction))
	var out int64
	for _, c := range digits {
		if c < '0' || c > '9' {
			return 0, errors.New("invalid amount")
		}
		out = out*10 + int64(c-'0')
		if out > MaxSats {
			return 0, errors.New("amount exceeds Bitcoin supply")
		}
	}
	if negative {
		out = -out
	}
	return out, nil
}
func btc(sats int64) json.Number {
	sign := ""
	if sats < 0 {
		sign = "-"
		sats = -sats
	}
	return json.Number(fmt.Sprintf("%s%d.%08d", sign, sats/100000000, sats%100000000))
}
