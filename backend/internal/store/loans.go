package store

import (
	"context"
	"errors"
	"time"

	"github.com/garvitgupta/footprint/backend/internal/models"
	"github.com/jackc/pgx/v5"
)

type LoanInput struct {
	Counterparty string
	Direction    string
	Principal    float64
	Currency     string
	OpenedOn     *time.Time
	Notes        *string
}

type LoanUpdate struct {
	Counterparty *string
	Principal    *float64
	Currency     *string
	OpenedOn     *time.Time
	Notes        *string
}

func (s *Store) ListLoans(ctx context.Context) ([]models.Loan, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT l.id, l.counterparty, l.direction, l.principal, l.currency, l.opened_on, l.notes,
		       COALESCE((SELECT SUM(amount) FROM loan_payments p WHERE p.loan_id = l.id), 0)::float8 AS paid,
		       l.created_at, l.updated_at
		FROM loans l
		ORDER BY l.created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	loans := []models.Loan{}
	for rows.Next() {
		var l models.Loan
		if err := rows.Scan(&l.ID, &l.Counterparty, &l.Direction, &l.Principal, &l.Currency,
			&l.OpenedOn, &l.Notes, &l.Paid, &l.CreatedAt, &l.UpdatedAt); err != nil {
			return nil, err
		}
		l.Outstanding = l.Principal - l.Paid
		l.Payments = []models.LoanPayment{}
		loans = append(loans, l)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(loans) == 0 {
		return loans, nil
	}
	ids := make([]string, len(loans))
	idx := make(map[string]int, len(loans))
	for i, l := range loans {
		ids[i] = l.ID
		idx[l.ID] = i
	}
	pRows, err := s.DB.Query(ctx,
		`SELECT id, loan_id, amount, paid_on, notes, created_at
		 FROM loan_payments WHERE loan_id = ANY($1) ORDER BY paid_on DESC, id DESC`, ids)
	if err != nil {
		return nil, err
	}
	defer pRows.Close()
	for pRows.Next() {
		var p models.LoanPayment
		if err := pRows.Scan(&p.ID, &p.LoanID, &p.Amount, &p.PaidOn, &p.Notes, &p.CreatedAt); err != nil {
			return nil, err
		}
		if i, ok := idx[p.LoanID]; ok {
			loans[i].Payments = append(loans[i].Payments, p)
		}
	}
	return loans, pRows.Err()
}

func (s *Store) GetLoan(ctx context.Context, id string) (*models.Loan, error) {
	var l models.Loan
	err := s.DB.QueryRow(ctx, `
		SELECT l.id, l.counterparty, l.direction, l.principal, l.currency, l.opened_on, l.notes,
		       COALESCE((SELECT SUM(amount) FROM loan_payments p WHERE p.loan_id = l.id), 0)::float8 AS paid,
		       l.created_at, l.updated_at
		FROM loans l WHERE l.id = $1`, id).Scan(
		&l.ID, &l.Counterparty, &l.Direction, &l.Principal, &l.Currency,
		&l.OpenedOn, &l.Notes, &l.Paid, &l.CreatedAt, &l.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	l.Outstanding = l.Principal - l.Paid
	l.Payments = []models.LoanPayment{}
	rows, err := s.DB.Query(ctx,
		`SELECT id, loan_id, amount, paid_on, notes, created_at
		 FROM loan_payments WHERE loan_id = $1 ORDER BY paid_on DESC, id DESC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var p models.LoanPayment
		if err := rows.Scan(&p.ID, &p.LoanID, &p.Amount, &p.PaidOn, &p.Notes, &p.CreatedAt); err != nil {
			return nil, err
		}
		l.Payments = append(l.Payments, p)
	}
	return &l, rows.Err()
}

func (s *Store) CreateLoan(ctx context.Context, in LoanInput) (*models.Loan, error) {
	cur := in.Currency
	if cur == "" {
		cur = "INR"
	}
	var id string
	err := s.DB.QueryRow(ctx,
		`INSERT INTO loans (counterparty, direction, principal, currency, opened_on, notes)
		 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
		in.Counterparty, in.Direction, in.Principal, cur, in.OpenedOn, in.Notes,
	).Scan(&id)
	if err != nil {
		return nil, err
	}
	return s.GetLoan(ctx, id)
}

func (s *Store) UpdateLoan(ctx context.Context, id string, in LoanUpdate) (*models.Loan, error) {
	existing, err := s.GetLoan(ctx, id)
	if err != nil {
		return nil, err
	}
	if in.Counterparty != nil {
		existing.Counterparty = *in.Counterparty
	}
	if in.Principal != nil {
		existing.Principal = *in.Principal
	}
	if in.Currency != nil && *in.Currency != "" {
		existing.Currency = *in.Currency
	}
	if in.OpenedOn != nil {
		existing.OpenedOn = in.OpenedOn
	}
	if in.Notes != nil {
		existing.Notes = in.Notes
	}
	_, err = s.DB.Exec(ctx, `
		UPDATE loans
		SET counterparty = $1, principal = $2, currency = $3, opened_on = $4, notes = $5, updated_at = now()
		WHERE id = $6`,
		existing.Counterparty, existing.Principal, existing.Currency, existing.OpenedOn, existing.Notes, id)
	if err != nil {
		return nil, err
	}
	return s.GetLoan(ctx, id)
}

func (s *Store) DeleteLoan(ctx context.Context, id string) error {
	ct, err := s.DB.Exec(ctx, `DELETE FROM loans WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

type PaymentInput struct {
	Amount float64
	PaidOn *time.Time
	Notes  *string
}

func (s *Store) AddPayment(ctx context.Context, loanID string, in PaymentInput) (*models.LoanPayment, error) {
	var p models.LoanPayment
	var paidOn any
	if in.PaidOn != nil {
		paidOn = *in.PaidOn
	}
	err := s.DB.QueryRow(ctx,
		`INSERT INTO loan_payments (loan_id, amount, paid_on, notes)
		 VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4)
		 RETURNING id, loan_id, amount, paid_on, notes, created_at`,
		loanID, in.Amount, paidOn, in.Notes,
	).Scan(&p.ID, &p.LoanID, &p.Amount, &p.PaidOn, &p.Notes, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	_, _ = s.DB.Exec(ctx, `UPDATE loans SET updated_at = now() WHERE id = $1`, loanID)
	return &p, nil
}

func (s *Store) DeletePayment(ctx context.Context, paymentID int64) error {
	ct, err := s.DB.Exec(ctx, `DELETE FROM loan_payments WHERE id = $1`, paymentID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
