package main

import "net/http"

// Bound requests waiting for the single signing authority. Authentication must
// wrap this handler so unauthenticated callers never consume signing slots.
func boundedHandler(next http.Handler, limit int) http.Handler {
	slots := make(chan struct{}, limit)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			w.Header().Set("Retry-After", "1")
			jsonResponse(w, http.StatusServiceUnavailable, map[string]string{"error":"signer busy; request not admitted"})
			return
		}
		if r.Context().Err() != nil { return }
		next.ServeHTTP(w,r)
	})
}
