package store

import (
	"context"
	"time"

	"github.com/garvitgupta/footprint/backend/internal/models"
)

type CreateFlowInput struct {
	InvestmentID string
	Kind         string // contribution | withdrawal
	Amount       float64
	OccurredOn   *time.Time
	Notes        *string
}

func (s *Store) ListFlows(ctx context.Context, investmentID string) ([]models.InvestmentFlow, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, investment_id, kind, amount::float8, occurred_on, notes, created_at
		FROM investment_flows
		WHERE investment_id = $1
		ORDER BY created_at DESC, id DESC`, investmentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []models.InvestmentFlow{}
	for rows.Next() {
		var f models.InvestmentFlow
		if err := rows.Scan(&f.ID, &f.InvestmentID, &f.Kind, &f.Amount, &f.OccurredOn, &f.Notes, &f.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// CreateFlow inserts a cashflow and keeps investments.purchase_value in sync.
// This preserves existing API shapes where purchase_value is the total invested.
func (s *Store) CreateFlow(ctx context.Context, in CreateFlowInput) (*models.InvestmentFlow, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var exists bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM investments WHERE id=$1)`, in.InvestmentID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrNotFound
	}

	delta := in.Amount
	if in.Kind == "withdrawal" {
		delta = -in.Amount
	}

	var f models.InvestmentFlow
	err = tx.QueryRow(ctx, `
		INSERT INTO investment_flows (investment_id, kind, amount, occurred_on, notes)
		VALUES ($1,$2,$3,$4,$5)
		RETURNING id, investment_id, kind, amount::float8, occurred_on, notes, created_at`,
		in.InvestmentID, in.Kind, in.Amount, in.OccurredOn, in.Notes,
	).Scan(&f.ID, &f.InvestmentID, &f.Kind, &f.Amount, &f.OccurredOn, &f.Notes, &f.CreatedAt)
	if err != nil {
		return nil, err
	}

	// Keep total principal invested in the existing column.
	if _, err := tx.Exec(ctx, `
		UPDATE investments
		SET purchase_value = GREATEST(0, purchase_value + $2),
		    updated_at = now()
		WHERE id = $1`, in.InvestmentID, delta); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &f, nil
}

