package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log"
	"net/http"
	"strings"

	"github.com/garvitgupta/footprint/backend/internal/auth"
	"github.com/garvitgupta/footprint/backend/internal/models"
	"github.com/garvitgupta/footprint/backend/internal/store"
	"github.com/go-chi/chi/v5"
)

type blogReq struct {
	Title string   `json:"title"`
	Body  string   `json:"body"`
	Tags  []string `json:"tags"`
	Roles []string `json:"roles"`
}

func currentCaller(r *http.Request) (string, string) {
	if u := auth.UserFrom(r.Context()); u != nil {
		return u.ID, u.Role
	}
	return "", ""
}

func (a *API) listBlogs(w http.ResponseWriter, r *http.Request) {
	uid, role := currentCaller(r)
	blogs, err := a.Store.ListBlogs(r.Context(), uid, role)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if blogs == nil {
		writeJSON(w, 200, []any{})
		return
	}
	writeJSON(w, 200, blogs)
}

func (a *API) getBlog(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	uid, role := currentCaller(r)
	b, err := a.Store.GetBlog(r.Context(), id, uid, role)
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, b)
}

func (a *API) createBlog(w http.ResponseWriter, r *http.Request) {
	var req blogReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if req.Title == "" {
		writeErr(w, 400, "title required")
		return
	}
	in := store.BlogInput{Title: req.Title, Body: req.Body, Tags: req.Tags, Roles: req.Roles}
	if u := auth.UserFrom(r.Context()); u != nil {
		in.AuthorID = u.ID
	}
	b, err := a.Store.CreateBlog(r.Context(), in)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	a.notifyNewBlog(b, in.AuthorID)
	writeJSON(w, 201, b)
}

func (a *API) notifyNewBlog(b *models.Blog, authorID string) {
	// Run detached from the request context so the notification survives the response.
	go func() {
		ctx := context.Background()
		recipients, err := a.Store.RecipientsForBlog(ctx, b.ID, authorID)
		if err != nil {
			log.Printf("notify: recipients for blog %s: %v", b.ID, err)
			return
		}
		if len(recipients) == 0 {
			return
		}
		if a.Mailer == nil {
			emails := make([]string, len(recipients))
			for i, u := range recipients {
				emails[i] = u.Email
			}
			log.Printf("notify: SMTP not configured, would email %d recipient(s): %s",
				len(emails), strings.Join(emails, ", "))
			return
		}
		subject := "New post: " + b.Title
		url := strings.TrimRight(a.SiteURL, "/") + "/blogs/" + b.ID
		excerpt := previewFor(b.Body, 260)
		body := buildBlogEmailHTML(b.Title, excerpt, url, b.Tags)
		for _, u := range recipients {
			if err := a.Mailer.Send(u.Email, subject, body); err != nil {
				log.Printf("notify: mail to %s failed: %v", u.Email, err)
			}
		}
		log.Printf("notify: sent %d email(s) for blog %s", len(recipients), b.ID)
	}()
}

func previewFor(body string, max int) string {
	s := strings.ReplaceAll(body, "\r", "")
	// strip markdown image/link syntax so the plain preview doesn't include raw markup
	s = strings.NewReplacer("**", "", "__", "", "*", "", "_", "", "`", "").Replace(s)
	s = strings.Join(strings.Fields(s), " ")
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}

func buildBlogEmailHTML(title, preview, url string, tags []string) string {
	tagHTML := ""
	if len(tags) > 0 {
		parts := make([]string, len(tags))
		for i, t := range tags {
			parts[i] = `<span style="display:inline-block;background:#eef2ff;color:#4338ca;border-radius:999px;padding:2px 10px;font-size:12px;margin-right:6px;">#` + html.EscapeString(t) + `</span>`
		}
		tagHTML = `<p style="margin:0 0 18px 0;">` + strings.Join(parts, "") + `</p>`
	}
	return fmt.Sprintf(`<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:32px auto;padding:28px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
    <p style="color:#6b7280;font-size:13px;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 8px 0;">New post</p>
    <h1 style="font-size:26px;line-height:1.25;margin:0 0 10px 0;color:#0f172a;">%s</h1>
    %s
    <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px 0;">%s</p>
    <a href="%s" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px;">Read the post →</a>
    <p style="color:#9ca3af;font-size:12px;margin:28px 0 0 0;">You're getting this because your access allows you to see this post.</p>
  </div>
</body>
</html>`, html.EscapeString(title), tagHTML, html.EscapeString(preview), html.EscapeString(url))
}

func (a *API) updateBlog(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req blogReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if req.Title == "" {
		writeErr(w, 400, "title required")
		return
	}
	b, err := a.Store.UpdateBlog(r.Context(), id, store.BlogInput{
		Title: req.Title, Body: req.Body, Tags: req.Tags, Roles: req.Roles,
	})
	if errors.Is(err, store.ErrNotFound) {
		writeErr(w, 404, "not found")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, b)
}

func (a *API) deleteBlog(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := a.Store.DeleteBlog(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, 404, "not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

func (a *API) listTags(w http.ResponseWriter, r *http.Request) {
	tags, err := a.Store.ListTags(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if tags == nil {
		writeJSON(w, 200, []any{})
		return
	}
	writeJSON(w, 200, tags)
}

func (a *API) listTagsUsage(w http.ResponseWriter, r *http.Request) {
	tags, err := a.Store.ListTagsWithUsage(r.Context())
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, tags)
}

func (a *API) deleteTag(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := a.Store.DeleteTag(r.Context(), id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeErr(w, 404, "not found")
			return
		}
		writeErr(w, 500, err.Error())
		return
	}
	w.WriteHeader(204)
}

func (a *API) getUserTags(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	tags, err := a.Store.ListUserTags(r.Context(), id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, tags)
}

func (a *API) setUserTags(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Tags []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeErr(w, 400, "invalid json")
		return
	}
	if err := a.Store.SetUserTags(r.Context(), id, req.Tags); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	tags, err := a.Store.ListUserTags(r.Context(), id)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, tags)
}
