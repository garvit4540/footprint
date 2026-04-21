package models

import "time"

type Investment struct {
	ID            string     `json:"id"`
	Name          string     `json:"name"`
	Type          string     `json:"type"`
	PurchaseDate  *time.Time `json:"purchase_date,omitempty"`
	PurchaseValue float64    `json:"purchase_value"`
	CurrentValue  float64    `json:"current_value"`
	Currency      string     `json:"currency"`
	Notes         *string    `json:"notes,omitempty"`
	CreatedAt     time.Time  `json:"created_at"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

type ValuationPoint struct {
	Value      float64   `json:"value"`
	RecordedAt time.Time `json:"recorded_at"`
}

type TypeBreakdown struct {
	Type     string  `json:"type"`
	Invested float64 `json:"invested"`
	Current  float64 `json:"current"`
	Count    int     `json:"count"`
}

type HistoryPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

type InvestmentSeries struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Type     string         `json:"type"`
	Currency string         `json:"currency"`
	Points   []HistoryPoint `json:"points"`
}

type Summary struct {
	TotalInvested float64            `json:"total_invested"`
	TotalCurrent  float64            `json:"total_current"`
	TotalGain     float64            `json:"total_gain"`
	GainPct       float64            `json:"gain_pct"`
	ByType        []TypeBreakdown    `json:"by_type"`
	History       []HistoryPoint     `json:"history"`
	Series        []InvestmentSeries `json:"series"`
}
