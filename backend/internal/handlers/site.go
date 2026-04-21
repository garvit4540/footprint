package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/garvitgupta/footprint/backend/internal/store"
)

type siteReq struct {
	Title   *string `json:"title"`
	Tagline *string `json:"tagline"`
	About   *string `json:"about"`
}

func (a *API) getSite(w http.ResponseWriter, r *http.Request) {
	site, err := a.Store.GetSite(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, site)
}

func (a *API) updateSite(w http.ResponseWriter, r *http.Request) {
	var req siteReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	site, err := a.Store.UpdateSite(r.Context(), store.SiteUpdate{
		Title: req.Title, Tagline: req.Tagline, About: req.About,
	})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, site)
}
