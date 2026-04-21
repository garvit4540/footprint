package models

import "time"

type Weight struct {
	ID         int64     `json:"id"`
	ValueKg    float64   `json:"value_kg"`
	RecordedOn time.Time `json:"recorded_on"`
	Notes      *string   `json:"notes,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}
