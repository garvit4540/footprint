package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/garvitgupta/footprint/backend/internal/auth"
	"github.com/garvitgupta/footprint/backend/internal/store"
)

type loginReq struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type signupReq struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

func (a *API) signup(w http.ResponseWriter, r *http.Request) {
	var req signupReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Password == "" {
		writeErr(w, 400, "email and password required")
		return
	}
	if len(req.Password) < 8 {
		writeErr(w, 400, "password must be at least 8 characters")
		return
	}
	if len(req.Password) > auth.MaxPasswordBytes {
		writeErr(w, 400, "password too long")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeServerErr(w, "signup hash", err)
		return
	}
	u, err := a.Store.CreateUser(r.Context(), email, hash, "member", req.DisplayName)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			writeErr(w, 409, "an account with that email already exists")
			return
		}
		writeServerErr(w, "signup create", err)
		return
	}
	token := auth.NewToken()
	expires := time.Now().Add(auth.SessionTTL)
	if err := a.Store.CreateSession(r.Context(), token, u.ID, expires); err != nil {
		writeServerErr(w, "signup session", err)
		return
	}
	auth.SetSessionCookie(w, token, expires)
	writeJSON(w, 201, u)
}

func (a *API) login(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Password == "" {
		writeErr(w, 400, "email and password required")
		return
	}
	if len(req.Password) > auth.MaxPasswordBytes {
		writeErr(w, 400, "password too long")
		return
	}
	u, hash, err := a.Store.UserByEmail(r.Context(), email)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 401, "invalid credentials")
		return
	}
	if err != nil {
		writeServerErr(w, "login lookup", err)
		return
	}
	if !auth.VerifyPassword(hash, req.Password) {
		writeErr(w, 401, "invalid credentials")
		return
	}
	// Rotate sessions: a successful login invalidates any existing tokens for
	// this user so a stolen cookie can't outlive a password reset in practice.
	_ = a.Store.DeleteUserSessions(r.Context(), u.ID)

	token := auth.NewToken()
	expires := time.Now().Add(auth.SessionTTL)
	if err := a.Store.CreateSession(r.Context(), token, u.ID, expires); err != nil {
		writeServerErr(w, "login session", err)
		return
	}
	auth.SetSessionCookie(w, token, expires)
	writeJSON(w, 200, u)
}

func (a *API) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(auth.SessionCookie); err == nil {
		_ = a.Store.DeleteSession(r.Context(), c.Value)
	}
	auth.ClearSessionCookie(w)
	w.WriteHeader(204)
}

func (a *API) me(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	if u == nil {
		writeJSON(w, 200, nil)
		return
	}
	writeJSON(w, 200, u)
}

type updateMeReq struct {
	DisplayName *string  `json:"display_name"`
	HeightCm    *float64 `json:"height_cm"`
}

func (a *API) updateMe(w http.ResponseWriter, r *http.Request) {
	u := auth.UserFrom(r.Context())
	if u == nil {
		writeErr(w, 401, "unauthorized")
		return
	}
	var req updateMeReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if req.HeightCm != nil && (*req.HeightCm <= 0 || *req.HeightCm > 300) {
		writeErr(w, 400, "height_cm must be between 0 and 300")
		return
	}
	updated, err := a.Store.UpdateProfile(r.Context(), u.ID, store.ProfileUpdate{
		DisplayName: req.DisplayName, HeightCm: req.HeightCm,
	})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, updated)
}
