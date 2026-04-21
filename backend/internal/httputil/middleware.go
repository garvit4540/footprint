package httputil

import (
	"net/http"
	"strings"
)

// MaxBodyBytes caps the request body size. Uploads override this with their
// own larger limit inside the handler.
func MaxBodyBytes(limit int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.ContentLength > limit {
				http.Error(w, `{"error":"request too large"}`, http.StatusRequestEntityTooLarge)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, limit)
			next.ServeHTTP(w, r)
		})
	}
}

// RequireJSONOrXHR is defense-in-depth against CSRF on top of SameSite=Lax.
// Mutating requests must either send JSON or the X-Requested-With header —
// neither is possible in a simple cross-site <form> submission.
func RequireJSONOrXHR(next http.Handler) http.Handler {
	safe := map[string]bool{"GET": true, "HEAD": true, "OPTIONS": true}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if safe[r.Method] {
			next.ServeHTTP(w, r)
			return
		}
		ct := r.Header.Get("Content-Type")
		if i := strings.IndexByte(ct, ';'); i >= 0 {
			ct = ct[:i]
		}
		ct = strings.ToLower(strings.TrimSpace(ct))
		if ct == "application/json" || r.Header.Get("X-Requested-With") != "" {
			next.ServeHTTP(w, r)
			return
		}
		// Multipart uploads must present X-Requested-With (set by the client).
		http.Error(w, `{"error":"missing X-Requested-With or application/json content-type"}`, http.StatusForbidden)
	})
}

// SecurityHeaders sets conservative response headers for the API (nginx handles
// the HTML side).
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		next.ServeHTTP(w, r)
	})
}
