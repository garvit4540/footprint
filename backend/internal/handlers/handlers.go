package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"time"

	"github.com/garvitgupta/footprint/backend/internal/auth"
	"github.com/garvitgupta/footprint/backend/internal/httputil"
	"github.com/garvitgupta/footprint/backend/internal/mail"
	"github.com/garvitgupta/footprint/backend/internal/store"
	"github.com/go-chi/chi/v5"
)

type API struct {
	Store     *store.Store
	UploadDir string
	Mailer    *mail.Mailer
	SiteURL   string
}

func New(s *store.Store, uploadDir string, mailer *mail.Mailer, siteURL string) *API {
	return &API{Store: s, UploadDir: uploadDir, Mailer: mailer, SiteURL: siteURL}
}

func (a *API) Routes(r chi.Router) {
	r.Get("/healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	r.Get("/uploads/{name}", a.serveUpload)

	mw := &auth.Middleware{Store: a.Store}
	authLimiter := httputil.NewLimiter(10, time.Minute)

	r.Route("/api", func(r chi.Router) {
		r.Use(httputil.RequireJSONOrXHR)
		r.Use(httputil.SecurityHeaders)
		r.Use(mw.Optional)

		r.With(authLimiter.Middleware).Post("/auth/login", a.login)
		r.With(authLimiter.Middleware).Post("/auth/signup", a.signup)
		r.Post("/auth/logout", a.logout)
		r.Get("/auth/me", a.me)
		r.Patch("/auth/me", a.updateMe)

		r.Get("/blogs", a.listBlogs)
		r.Get("/blogs/{id}", a.getBlog)
		r.Get("/tags", a.listTags)
		r.Get("/site", a.getSite)

		r.Group(func(r chi.Router) {
			r.Use(auth.AdminOnly)

			r.Get("/investments", a.list)
			r.Post("/investments", a.create)
			r.Get("/investments/{id}", a.get)
			r.Patch("/investments/{id}", a.update)
			r.Delete("/investments/{id}", a.del)
			r.Get("/investments/{id}/history", a.history)
			r.Get("/summary", a.summary)

			r.Post("/blogs", a.createBlog)
			r.Patch("/blogs/{id}", a.updateBlog)
			r.Delete("/blogs/{id}", a.deleteBlog)

			r.Get("/users", a.listUsers)
			r.Post("/users", a.createUser)
			r.Delete("/users/{id}", a.deleteUser)
			r.Get("/users/{id}/tags", a.getUserTags)
			r.Put("/users/{id}/tags", a.setUserTags)

			r.Patch("/site", a.updateSite)
			r.Get("/tags/usage", a.listTagsUsage)
			r.Delete("/tags/{id}", a.deleteTag)

			r.Get("/weights", a.listWeights)
			r.Post("/weights", a.addWeight)
			r.Delete("/weights/{id}", a.deleteWeight)

			r.Get("/loans", a.listLoans)
			r.Post("/loans", a.createLoan)
			r.Get("/loans/{id}", a.getLoan)
			r.Patch("/loans/{id}", a.updateLoan)
			r.Delete("/loans/{id}", a.deleteLoan)
			r.Post("/loans/{id}/payments", a.addPayment)
			r.Delete("/loans/{id}/payments/{pid}", a.deletePayment)

			r.Post("/uploads", a.uploadImage)
		})
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// writeServerErr logs the real error but tells the client only that something
// failed, so we don't leak Postgres messages or stack internals.
func writeServerErr(w http.ResponseWriter, op string, err error) {
	log.Printf("%s: %v", op, err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
}

type createReq struct {
	Name          string  `json:"name"`
	Type          string  `json:"type"`
	PurchaseDate  *string `json:"purchase_date"`
	PurchaseValue float64 `json:"purchase_value"`
	CurrentValue  float64 `json:"current_value"`
	Currency      string  `json:"currency"`
	Notes         *string `json:"notes"`
}

func parseDate(s *string) (*time.Time, error) {
	if s == nil || *s == "" {
		return nil, nil
	}
	t, err := time.Parse("2006-01-02", *s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (a *API) list(w http.ResponseWriter, r *http.Request) {
	items, err := a.Store.List(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if items == nil {
		writeJSON(w, 200, []any{})
		return
	}
	writeJSON(w, 200, items)
}

func (a *API) create(w http.ResponseWriter, r *http.Request) {
	var req createReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if req.Name == "" || req.Type == "" {
		writeErr(w, 400, "name and type are required")
		return
	}
	pd, err := parseDate(req.PurchaseDate)
	if err != nil {
		writeErr(w, 400, "invalid purchase_date (YYYY-MM-DD)")
		return
	}
	inv, err := a.Store.Create(r.Context(), store.CreateInput{
		Name: req.Name, Type: req.Type, PurchaseDate: pd,
		PurchaseValue: req.PurchaseValue, CurrentValue: req.CurrentValue,
		Currency: req.Currency, Notes: req.Notes,
	})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, inv)
}

func (a *API) get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	inv, err := a.Store.Get(r.Context(), id)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, inv)
}

type updateReq struct {
	Name          *string  `json:"name"`
	Type          *string  `json:"type"`
	PurchaseDate  *string  `json:"purchase_date"`
	PurchaseValue *float64 `json:"purchase_value"`
	CurrentValue  *float64 `json:"current_value"`
	Currency      *string  `json:"currency"`
	Notes         *string  `json:"notes"`
}

func (a *API) update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req updateReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	pd, err := parseDate(req.PurchaseDate)
	if err != nil {
		writeErr(w, 400, "invalid purchase_date")
		return
	}
	inv, err := a.Store.Update(r.Context(), id, store.UpdateInput{
		Name: req.Name, Type: req.Type, PurchaseDate: pd,
		PurchaseValue: req.PurchaseValue, CurrentValue: req.CurrentValue,
		Currency: req.Currency, Notes: req.Notes,
	})
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, inv)
}

func (a *API) del(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := a.Store.Delete(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, 404, "not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

func (a *API) history(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	pts, err := a.Store.History(r.Context(), id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, pts)
}

func (a *API) summary(w http.ResponseWriter, r *http.Request) {
	sum, err := a.Store.Summary(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, sum)
}
