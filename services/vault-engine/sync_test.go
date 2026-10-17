package main

import (
"encoding/json"
"net/http"
"net/http/httptest"
"os"
"path/filepath"
"testing"
)

func TestSyncObservationDuringIBD(t *testing.T) {
server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
var req struct { Method string `json:"method"` }
if err := json.NewDecoder(r.Body).Decode(&req); err != nil { t.Error(err) }
if req.Method != "getblockchaininfo" { t.Errorf("unexpected mutation or RPC: %s", req.Method) }
json.NewEncoder(w).Encode(map[string]any{"result": map[string]any{
"chain": "main", "blocks": 511673, "headers": 971911,
"verificationprogress": 0.216237977, "initialblockdownload": true,
}, "error": nil, "id": 1})
}))
defer server.Close()
cookie := filepath.Join(t.TempDir(), "cookie")
if err := os.WriteFile(cookie, []byte("test:fixture"), 0600); err != nil { t.Fatal(err) }
e := &Engine{rpc: &RPC{URL: server.URL, CookieFile: cookie, Client: server.Client()}, network: "main"}
response := httptest.NewRecorder()
e.handler(response, httptest.NewRequest("GET", "/sync", nil))
if response.Code != http.StatusOK { t.Fatalf("sync failed: %s", response.Body.String()) }
var data struct {
Available bool `json:"available"`
IBD bool `json:"initialBlockDownload"`
Blocks int `json:"blocks"`
ObservedAt string `json:"observedAt"`
}
if err := json.Unmarshal(response.Body.Bytes(), &data); err != nil { t.Fatal(err) }
if !data.Available || !data.IBD || data.Blocks != 511673 || data.ObservedAt == "" {
t.Fatalf("incorrect observation: %+v", data)
}
if e.connected { t.Fatal("monitoring must not mark wallet reconciliation ready") }
}
