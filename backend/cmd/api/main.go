package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/garvitgupta/footprint/backend/internal/auth"
	"github.com/garvitgupta/footprint/backend/internal/db"
	"github.com/garvitgupta/footprint/backend/internal/handlers"
	"github.com/garvitgupta/footprint/backend/internal/httputil"
	"github.com/garvitgupta/footprint/backend/internal/mail"
	"github.com/garvitgupta/footprint/backend/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		log.Fatal("DATABASE_URL is required")
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	adminEmail := os.Getenv("ADMIN_EMAIL")
	if adminEmail == "" {
		adminEmail = "admin@local"
	}
	adminPassword := os.Getenv("ADMIN_PASSWORD")
	if adminPassword == "" {
		adminPassword = "admin"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := db.Connect(ctx, url)
	for i := 0; i < 10 && err != nil; i++ {
		log.Printf("db connect retry %d: %v", i+1, err)
		time.Sleep(2 * time.Second)
		pool, err = db.Connect(ctx, url)
	}
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer pool.Close()

	if err := db.Migrate(context.Background(), pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	if err := db.SeedAdmin(context.Background(), pool, adminEmail, adminPassword); err != nil {
		log.Fatalf("seed admin: %v", err)
	}

	uploadDir := os.Getenv("UPLOAD_DIR")
	if uploadDir == "" {
		uploadDir = "/data/uploads"
	}
	mailer := mail.FromEnv(os.Getenv)
	if mailer == nil {
		log.Printf("smtp: not configured, new-post emails will be logged only")
	} else {
		log.Printf("smtp: configured for %s@%s", mailer.User, mailer.Host)
	}
	siteURL := os.Getenv("SITE_URL")
	if siteURL == "" {
		siteURL = "http://localhost:8080"
	}
	auth.SecureCookies = os.Getenv("COOKIE_SECURE") == "true"
	if auth.SecureCookies {
		log.Printf("cookies: Secure flag enabled")
	}

	allowedOrigins := splitCSV(os.Getenv("ALLOWED_ORIGINS"))
	if len(allowedOrigins) == 0 {
		allowedOrigins = []string{"http://localhost:5173", "http://localhost:8080"}
	}

	api := handlers.New(store.New(pool), uploadDir, mailer, siteURL)

	r := chi.NewRouter()
	r.Use(middleware.Logger, middleware.Recoverer)
	// 1 MB cap on JSON bodies; image uploads override inside the upload handler.
	r.Use(httputil.MaxBodyBytes(1 << 20))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "X-Requested-With"},
		AllowCredentials: true,
	}))
	api.Routes(r)

	log.Printf("listening on :%s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal(err)
	}
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := parts[:0]
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
