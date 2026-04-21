package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
)

const maxUploadBytes = 15 << 20 // 15 MB

// allowedImageExt maps file extensions to their canonical content-type.
// SVG is deliberately NOT allowed: SVG is an XML document that can embed
// scripts, making served user-uploaded SVGs an XSS vector.
var allowedImageExt = map[string]string{
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".gif":  "image/gif",
	".webp": "image/webp",
}

var safeUploadName = regexp.MustCompile(`^[0-9a-f]{32}\.(png|jpe?g|gif|webp)$`)

func (a *API) uploadImage(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadBytes+1<<20)
	if err := r.ParseMultipartForm(maxUploadBytes); err != nil {
		writeErr(w, 400, "upload too large or invalid multipart")
		return
	}
	f, header, err := r.FormFile("file")
	if err != nil {
		writeErr(w, 400, "missing file field")
		return
	}
	defer f.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	declared, ok := allowedImageExt[ext]
	if !ok {
		writeErr(w, 400, "unsupported file type")
		return
	}

	// Sniff the first 512 bytes so a .png that's actually HTML is rejected.
	sniff := make([]byte, 512)
	n, _ := io.ReadFull(f, sniff)
	sniffed := http.DetectContentType(sniff[:n])
	if !strings.HasPrefix(sniffed, declared) {
		writeErr(w, 400, "file contents do not match declared image type")
		return
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		writeServerErr(w, "upload seek", err)
		return
	}

	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		writeServerErr(w, "upload rand", err)
		return
	}
	name := hex.EncodeToString(buf) + ext
	dir := a.uploadDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeServerErr(w, "upload mkdir", err)
		return
	}
	dst, err := os.Create(filepath.Join(dir, name))
	if err != nil {
		writeServerErr(w, "upload create", err)
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, f); err != nil {
		writeServerErr(w, "upload copy", err)
		return
	}
	writeJSON(w, 201, map[string]string{"url": "/uploads/" + name})
}

func (a *API) serveUpload(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if !safeUploadName.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	full := filepath.Join(a.uploadDir(), name)
	if !strings.HasPrefix(filepath.Clean(full), filepath.Clean(a.uploadDir())+string(filepath.Separator)) {
		http.NotFound(w, r)
		return
	}
	if ct := allowedImageExt[strings.ToLower(filepath.Ext(name))]; ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; img-src 'self'")
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	http.ServeFile(w, r, full)
}

func (a *API) uploadDir() string {
	if a.UploadDir != "" {
		return a.UploadDir
	}
	return "/data/uploads"
}
