package models

import "time"

type InvestmentFlow struct {
	ID           int64      `json:"id"`
	InvestmentID string     `json:"investment_id"`
	Kind         string     `json:"kind"` // contribution | withdrawal
	Amount       float64    `json:"amount"`
	OccurredOn   *time.Time `json:"occurred_on,omitempty"`
	Notes        *string    `json:"notes,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

