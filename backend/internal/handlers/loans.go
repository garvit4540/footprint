package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/garvitgupta/footprint/backend/internal/store"
	"github.com/go-chi/chi/v5"
)

type loanReq struct {
	Counterparty string  `json:"counterparty"`
	Direction    string  `json:"direction"`
	Principal    float64 `json:"principal"`
	Currency     string  `json:"currency"`
	OpenedOn     *string `json:"opened_on"`
	Notes        *string `json:"notes"`
}

type loanPatchReq struct {
	Counterparty *string  `json:"counterparty"`
	Principal    *float64 `json:"principal"`
	Currency     *string  `json:"currency"`
	OpenedOn     *string  `json:"opened_on"`
	Notes        *string  `json:"notes"`
}

type paymentReq struct {
	Amount float64 `json:"amount"`
	PaidOn *string `json:"paid_on"`
	Notes  *string `json:"notes"`
}

func (a *API) listLoans(w http.ResponseWriter, r *http.Request) {
	loans, err := a.Store.ListLoans(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, loans)
}

func (a *API) getLoan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	l, err := a.Store.GetLoan(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, l)
}

func (a *API) createLoan(w http.ResponseWriter, r *http.Request) {
	var req loanReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	req.Counterparty = strings.TrimSpace(req.Counterparty)
	req.Direction = strings.ToLower(strings.TrimSpace(req.Direction))
	if req.Counterparty == "" {
		writeErr(w, 400, "counterparty required")
		return
	}
	if req.Direction != "borrowed" && req.Direction != "lent" {
		writeErr(w, 400, "direction must be 'borrowed' or 'lent'")
		return
	}
	if req.Principal <= 0 {
		writeErr(w, 400, "principal must be > 0")
		return
	}
	opened, err := parseDate(req.OpenedOn)
	if err != nil {
		writeErr(w, 400, "invalid opened_on (YYYY-MM-DD)")
		return
	}
	l, err := a.Store.CreateLoan(r.Context(), store.LoanInput{
		Counterparty: req.Counterparty,
		Direction:    req.Direction,
		Principal:    req.Principal,
		Currency:     req.Currency,
		OpenedOn:     opened,
		Notes:        req.Notes,
	})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, l)
}

func (a *API) updateLoan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req loanPatchReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	opened, err := parseDate(req.OpenedOn)
	if err != nil {
		writeErr(w, 400, "invalid opened_on")
		return
	}
	l, err := a.Store.UpdateLoan(r.Context(), id, store.LoanUpdate{
		Counterparty: req.Counterparty,
		Principal:    req.Principal,
		Currency:     req.Currency,
		OpenedOn:     opened,
		Notes:        req.Notes,
	})
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, l)
}

func (a *API) deleteLoan(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := a.Store.DeleteLoan(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, 404, "not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

func (a *API) addPayment(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req paymentReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if req.Amount <= 0 {
		writeErr(w, 400, "amount must be > 0")
		return
	}
	paidOn, err := parseDate(req.PaidOn)
	if err != nil {
		writeErr(w, 400, "invalid paid_on")
		return
	}
	p, err := a.Store.AddPayment(r.Context(), id, store.PaymentInput{
		Amount: req.Amount, PaidOn: paidOn, Notes: req.Notes,
	})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, p)
}

func (a *API) deletePayment(w http.ResponseWriter, r *http.Request) {
	raw := chi.URLParam(r, "pid")
	pid, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		writeErr(w, 400, "invalid payment id")
		return
	}
	if err := a.Store.DeletePayment(r.Context(), pid); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, 404, "not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}
