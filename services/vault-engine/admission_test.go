package main

import (
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
)

func TestTenThousandRequestAdmission(t *testing.T) {
	const total = 10000
	var active, peak, accepted, rejected atomic.Int64
	release := make(chan struct{})
	full := make(chan struct{})
	h := boundedHandler(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		n := active.Add(1)
		for old := peak.Load(); n > old; old = peak.Load() {
			if peak.CompareAndSwap(old,n) { break }
		}
		if n == 32 { close(full) }
		<-release
		active.Add(-1)
		w.WriteHeader(200)
	}),32)
	var initial sync.WaitGroup
	for i:=0; i<32; i++ {
		initial.Add(1)
		go func() {
			defer initial.Done()
			r := httptest.NewRecorder()
			h.ServeHTTP(r,httptest.NewRequest("GET","/status",nil))
			if r.Code == 200 { accepted.Add(1) }
		}()
	}
	<-full
	var burst sync.WaitGroup
	for i:=32; i<total; i++ {
		burst.Add(1)
		go func() {
			defer burst.Done()
			r:=httptest.NewRecorder()
			h.ServeHTTP(r,httptest.NewRequest("GET","/status",nil))
			if r.Code==503 && r.Header().Get("Retry-After")=="1" { rejected.Add(1) }
		}()
	}
	burst.Wait()
	close(release)
	initial.Wait()
	if peak.Load()!=32 || accepted.Load()!=32 || rejected.Load()!=total-32 {
		t.Fatalf("peak=%d accepted=%d rejected=%d",peak.Load(),accepted.Load(),rejected.Load())
	}
	t.Logf("10,000 handler requests: accepted=%d overload-rejected=%d peak=%d (not a network throughput benchmark)",accepted.Load(),rejected.Load(),peak.Load())
}

func TestJournalNetworkBinding(t *testing.T) {
	for _, state := range []State{
		{Network:"signet"}, {Wallets:[]Wallet{{ID:"legacy"}}},
		{Intents:[]Intent{{ID:"legacy"}}}, {ColdIndex:1}, {Checkpoint:"old"},
	} {
		if bindNetwork(&state,"main")==nil { t.Fatal("unsafe mainnet journal accepted") }
	}
	s:=State{}
	if err:=bindNetwork(&s,"main"); err!=nil || s.Network!="main" { t.Fatal("fresh mainnet state rejected") }
	if bindNetwork(&s,"signet")==nil { t.Fatal("mainnet journal reused as Signet") }
}
