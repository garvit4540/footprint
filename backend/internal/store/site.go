package store

import (
	"context"

	"github.com/garvitgupta/footprint/backend/internal/models"
)

func (s *Store) GetSite(ctx context.Context) (*models.Site, error) {
	var site models.Site
	err := s.DB.QueryRow(ctx,
		`SELECT title, tagline, about, updated_at FROM site_settings WHERE id = TRUE`).
		Scan(&site.Title, &site.Tagline, &site.About, &site.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &site, nil
}

type SiteUpdate struct {
	Title   *string
	Tagline *string
	About   *string
}

func (s *Store) UpdateSite(ctx context.Context, in SiteUpdate) (*models.Site, error) {
	var site models.Site
	err := s.DB.QueryRow(ctx, `
		UPDATE site_settings
		SET title      = COALESCE($1, title),
		    tagline    = COALESCE($2, tagline),
		    about      = COALESCE($3, about),
		    updated_at = now()
		WHERE id = TRUE
		RETURNING title, tagline, about, updated_at`,
		in.Title, in.Tagline, in.About,
	).Scan(&site.Title, &site.Tagline, &site.About, &site.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &site, nil
}
