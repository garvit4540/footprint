package models

import "time"

type Loan struct {
	ID           string        `json:"id"`
	Counterparty string        `json:"counterparty"`
	Direction    string        `json:"direction"` // "borrowed" | "lent"
	Principal    float64       `json:"principal"`
	Currency     string        `json:"currency"`
	OpenedOn     *time.Time    `json:"opened_on,omitempty"`
	Notes        *string       `json:"notes,omitempty"`
	Paid         float64       `json:"paid"`
	Outstanding  float64       `json:"outstanding"`
	Payments     []LoanPayment `json:"payments"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

type LoanPayment struct {
	ID        int64     `json:"id"`
	LoanID    string    `json:"loan_id"`
	Amount    float64   `json:"amount"`
	PaidOn    time.Time `json:"paid_on"`
	Notes     *string   `json:"notes,omitempty"`
	CreatedAt time.Time `json:"created_at"`
}
