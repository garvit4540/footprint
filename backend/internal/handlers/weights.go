package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/garvitgupta/footprint/backend/internal/store"
	"github.com/go-chi/chi/v5"
)

type weightReq struct {
	ValueKg    float64 `json:"value_kg"`
	RecordedOn *string `json:"recorded_on"`
	Notes      *string `json:"notes"`
}

func (a *API) listWeights(w http.ResponseWriter, r *http.Request) {
	items, err := a.Store.ListWeights(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, items)
}

func (a *API) addWeight(w http.ResponseWriter, r *http.Request) {
	var req weightReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if req.ValueKg <= 0 {
		writeErr(w, 400, "value_kg must be > 0")
		return
	}
	recorded, err := parseDate(req.RecordedOn)
	if err != nil {
		writeErr(w, 400, "invalid recorded_on (YYYY-MM-DD)")
		return
	}
	item, err := a.Store.AddWeight(r.Context(), store.WeightInput{
		ValueKg: req.ValueKg, RecordedOn: recorded, Notes: req.Notes,
	})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, item)
}

func (a *API) deleteWeight(w http.ResponseWriter, r *http.Request) {
	raw := chi.URLParam(r, "id")
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		writeErr(w, 400, "invalid id")
		return
	}
	if err := a.Store.DeleteWeight(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, 404, "not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}
