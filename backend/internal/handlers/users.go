package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/garvitgupta/footprint/backend/internal/auth"
	"github.com/garvitgupta/footprint/backend/internal/store"
	"github.com/go-chi/chi/v5"
)

type createUserReq struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	Role        string `json:"role"`
	DisplayName string `json:"display_name"`
}

func (a *API) listUsers(w http.ResponseWriter, r *http.Request) {
	users, err := a.Store.ListUsers(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if users == nil {
		writeJSON(w, 200, []any{})
		return
	}
	writeJSON(w, 200, users)
}

func (a *API) createUser(w http.ResponseWriter, r *http.Request) {
	var req createUserReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	role := strings.ToLower(strings.TrimSpace(req.Role))
	if role == "" {
		role = "member"
	}
	if role != "admin" && role != "member" {
		writeErr(w, 400, "role must be admin or member")
		return
	}
	if email == "" || req.Password == "" {
		writeErr(w, 400, "email and password required")
		return
	}
	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	u, err := a.Store.CreateUser(r.Context(), email, hash, role, req.DisplayName)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			writeErr(w, 409, "email already exists")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, u)
}

func (a *API) deleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	caller := auth.UserFrom(r.Context())
	if caller != nil && caller.ID == id {
		writeErr(w, 400, "cannot delete yourself")
		return
	}
	if err := a.Store.DeleteUser(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, 404, "not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}
