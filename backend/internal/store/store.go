package store

import (
	"context"
	"errors"
	"sort"
	"time"

	"github.com/garvitgupta/footprint/backend/internal/models"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ DB *pgxpool.Pool }

func New(db *pgxpool.Pool) *Store { return &Store{DB: db} }

var ErrNotFound = errors.New("not found")

func (s *Store) List(ctx context.Context) ([]models.Investment, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT id, name, type, purchase_date, purchase_value, current_value,
		       currency, notes, created_at, updated_at
		FROM investments ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Investment
	for rows.Next() {
		var inv models.Investment
		if err := rows.Scan(&inv.ID, &inv.Name, &inv.Type, &inv.PurchaseDate,
			&inv.PurchaseValue, &inv.CurrentValue, &inv.Currency, &inv.Notes,
			&inv.CreatedAt, &inv.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, inv)
	}
	return out, rows.Err()
}

func (s *Store) Get(ctx context.Context, id string) (*models.Investment, error) {
	var inv models.Investment
	err := s.DB.QueryRow(ctx, `
		SELECT id, name, type, purchase_date, purchase_value, current_value,
		       currency, notes, created_at, updated_at
		FROM investments WHERE id = $1`, id).Scan(
		&inv.ID, &inv.Name, &inv.Type, &inv.PurchaseDate,
		&inv.PurchaseValue, &inv.CurrentValue, &inv.Currency, &inv.Notes,
		&inv.CreatedAt, &inv.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

type CreateInput struct {
	Name          string
	Type          string
	PurchaseDate  *time.Time
	PurchaseValue float64
	CurrentValue  float64
	Currency      string
	Notes         *string
}

func (s *Store) Create(ctx context.Context, in CreateInput) (*models.Investment, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var inv models.Investment
	err = tx.QueryRow(ctx, `
		INSERT INTO investments (name, type, purchase_date, purchase_value, current_value, currency, notes)
		VALUES ($1,$2,$3,$4,$5,COALESCE(NULLIF($6,''),'INR'),$7)
		RETURNING id, name, type, purchase_date, purchase_value, current_value,
		          currency, notes, created_at, updated_at`,
		in.Name, in.Type, in.PurchaseDate, in.PurchaseValue, in.CurrentValue, in.Currency, in.Notes,
	).Scan(&inv.ID, &inv.Name, &inv.Type, &inv.PurchaseDate,
		&inv.PurchaseValue, &inv.CurrentValue, &inv.Currency, &inv.Notes,
		&inv.CreatedAt, &inv.UpdatedAt)
	if err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx,
		`INSERT INTO valuation_history (investment_id, value) VALUES ($1, $2)`,
		inv.ID, inv.CurrentValue); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &inv, nil
}

type UpdateInput struct {
	Name          *string
	Type          *string
	PurchaseDate  *time.Time
	PurchaseValue *float64
	CurrentValue  *float64
	Currency      *string
	Notes         *string
}

func (s *Store) Update(ctx context.Context, id string, in UpdateInput) (*models.Investment, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var existing models.Investment
	err = tx.QueryRow(ctx, `
		SELECT id, name, type, purchase_date, purchase_value, current_value,
		       currency, notes, created_at, updated_at
		FROM investments WHERE id = $1 FOR UPDATE`, id).Scan(
		&existing.ID, &existing.Name, &existing.Type, &existing.PurchaseDate,
		&existing.PurchaseValue, &existing.CurrentValue, &existing.Currency, &existing.Notes,
		&existing.CreatedAt, &existing.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}

	if in.Name != nil {
		existing.Name = *in.Name
	}
	if in.Type != nil {
		existing.Type = *in.Type
	}
	if in.PurchaseDate != nil {
		existing.PurchaseDate = in.PurchaseDate
	}
	if in.PurchaseValue != nil {
		existing.PurchaseValue = *in.PurchaseValue
	}
	if in.Currency != nil && *in.Currency != "" {
		existing.Currency = *in.Currency
	}
	if in.Notes != nil {
		existing.Notes = in.Notes
	}

	valueChanged := false
	if in.CurrentValue != nil && *in.CurrentValue != existing.CurrentValue {
		existing.CurrentValue = *in.CurrentValue
		valueChanged = true
	}

	err = tx.QueryRow(ctx, `
		UPDATE investments
		SET name=$1, type=$2, purchase_date=$3, purchase_value=$4,
		    current_value=$5, currency=$6, notes=$7, updated_at=now()
		WHERE id=$8
		RETURNING updated_at`,
		existing.Name, existing.Type, existing.PurchaseDate, existing.PurchaseValue,
		existing.CurrentValue, existing.Currency, existing.Notes, id,
	).Scan(&existing.UpdatedAt)
	if err != nil {
		return nil, err
	}

	if valueChanged {
		if _, err := tx.Exec(ctx,
			`INSERT INTO valuation_history (investment_id, value) VALUES ($1, $2)`,
			id, existing.CurrentValue); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &existing, nil
}

func (s *Store) Delete(ctx context.Context, id string) error {
	ct, err := s.DB.Exec(ctx, `DELETE FROM investments WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) History(ctx context.Context, id string) ([]models.ValuationPoint, error) {
	rows, err := s.DB.Query(ctx,
		`SELECT value, recorded_at FROM valuation_history
		 WHERE investment_id = $1 ORDER BY recorded_at ASC`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.ValuationPoint
	for rows.Next() {
		var p models.ValuationPoint
		if err := rows.Scan(&p.Value, &p.RecordedAt); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *Store) PerInvestmentHistory(ctx context.Context) ([]models.InvestmentSeries, error) {
	rows, err := s.DB.Query(ctx, `
		WITH daily AS (
		  SELECT investment_id,
		         date_trunc('day', recorded_at)::date AS d,
		         value,
		         ROW_NUMBER() OVER (
		           PARTITION BY investment_id, date_trunc('day', recorded_at)
		           ORDER BY recorded_at DESC
		         ) AS rn
		  FROM valuation_history
		)
		SELECT i.id, i.name, i.type, i.currency, d.d, d.value::float8
		FROM investments i
		JOIN daily d ON d.investment_id = i.id
		WHERE d.rn = 1
		ORDER BY i.name, d.d ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	byID := map[string]*models.InvestmentSeries{}
	order := []string{}
	for rows.Next() {
		var id, name, typ, ccy string
		var day time.Time
		var v float64
		if err := rows.Scan(&id, &name, &typ, &ccy, &day, &v); err != nil {
			return nil, err
		}
		ser, ok := byID[id]
		if !ok {
			ser = &models.InvestmentSeries{ID: id, Name: name, Type: typ, Currency: ccy, Points: []models.HistoryPoint{}}
			byID[id] = ser
			order = append(order, id)
		}
		ser.Points = append(ser.Points, models.HistoryPoint{Date: day.Format("2006-01-02"), Value: v})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	out := make([]models.InvestmentSeries, 0, len(order))
	for _, id := range order {
		out = append(out, *byID[id])
	}
	return out, nil
}

// AggregateLOCF builds a day-by-day portfolio total from per-investment series,
// carrying the last known value of each investment forward across days where
// it had no update. Mixed-currency totals just sum numbers — treat as a shape,
// not a canonical amount.
func AggregateLOCF(series []models.InvestmentSeries) []models.HistoryPoint {
	dateSet := map[string]struct{}{}
	for _, s := range series {
		for _, p := range s.Points {
			dateSet[p.Date] = struct{}{}
		}
	}
	if len(dateSet) == 0 {
		return []models.HistoryPoint{}
	}
	dates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		dates = append(dates, d)
	}
	sort.Strings(dates)

	// Preserve sorted dates per investment for LOCF lookup
	type invEntry struct {
		dates  []string
		values map[string]float64
	}
	invs := make([]invEntry, len(series))
	for i, s := range series {
		ds := make([]string, len(s.Points))
		vs := make(map[string]float64, len(s.Points))
		for j, p := range s.Points {
			ds[j] = p.Date
			vs[p.Date] = p.Value
		}
		sort.Strings(ds)
		invs[i] = invEntry{dates: ds, values: vs}
	}

	out := make([]models.HistoryPoint, 0, len(dates))
	for _, d := range dates {
		total := 0.0
		for _, inv := range invs {
			if len(inv.dates) == 0 || inv.dates[0] > d {
				continue
			}
			idx := sort.SearchStrings(inv.dates, d)
			if idx < len(inv.dates) && inv.dates[idx] == d {
				total += inv.values[d]
			} else {
				total += inv.values[inv.dates[idx-1]]
			}
		}
		out = append(out, models.HistoryPoint{Date: d, Value: total})
	}
	return out
}

func (s *Store) Summary(ctx context.Context) (*models.Summary, error) {
	sum := &models.Summary{
		ByType:  []models.TypeBreakdown{},
		History: []models.HistoryPoint{},
		Series:  []models.InvestmentSeries{},
	}

	if err := s.DB.QueryRow(ctx, `
		SELECT COALESCE(SUM(purchase_value),0)::float8, COALESCE(SUM(current_value),0)::float8
		FROM investments`).Scan(&sum.TotalInvested, &sum.TotalCurrent); err != nil {
		return nil, err
	}
	sum.TotalGain = sum.TotalCurrent - sum.TotalInvested
	if sum.TotalInvested > 0 {
		sum.GainPct = (sum.TotalGain / sum.TotalInvested) * 100
	}

	rows, err := s.DB.Query(ctx, `
		SELECT type,
		       SUM(purchase_value)::float8,
		       SUM(current_value)::float8,
		       COUNT(*)::int
		FROM investments GROUP BY type ORDER BY type`)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var b models.TypeBreakdown
		if err := rows.Scan(&b.Type, &b.Invested, &b.Current, &b.Count); err != nil {
			rows.Close()
			return nil, err
		}
		sum.ByType = append(sum.ByType, b)
	}
	rows.Close()

	series, err := s.PerInvestmentHistory(ctx)
	if err != nil {
		return nil, err
	}
	sum.Series = series
	sum.History = AggregateLOCF(series)
	return sum, nil
}
