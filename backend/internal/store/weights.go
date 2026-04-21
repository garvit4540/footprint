package store

import (
	"context"
	"time"

	"github.com/garvitgupta/footprint/backend/internal/models"
)

type WeightInput struct {
	ValueKg    float64
	RecordedOn *time.Time
	Notes      *string
}

func (s *Store) ListWeights(ctx context.Context) ([]models.Weight, error) {
	rows, err := s.DB.Query(ctx,
		`SELECT id, value_kg, recorded_on, notes, created_at
		 FROM weights ORDER BY recorded_on ASC, id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.Weight{}
	for rows.Next() {
		var w models.Weight
		if err := rows.Scan(&w.ID, &w.ValueKg, &w.RecordedOn, &w.Notes, &w.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, w)
	}
	return out, rows.Err()
}

func (s *Store) AddWeight(ctx context.Context, in WeightInput) (*models.Weight, error) {
	var w models.Weight
	var recorded any
	if in.RecordedOn != nil {
		recorded = *in.RecordedOn
	}
	err := s.DB.QueryRow(ctx,
		`INSERT INTO weights (value_kg, recorded_on, notes)
		 VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3)
		 RETURNING id, value_kg, recorded_on, notes, created_at`,
		in.ValueKg, recorded, in.Notes,
	).Scan(&w.ID, &w.ValueKg, &w.RecordedOn, &w.Notes, &w.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &w, nil
}

func (s *Store) DeleteWeight(ctx context.Context, id int64) error {
	ct, err := s.DB.Exec(ctx, `DELETE FROM weights WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

