package models

import "time"

type Site struct {
	Title     string    `json:"title"`
	Tagline   string    `json:"tagline"`
	About     string    `json:"about"`
	UpdatedAt time.Time `json:"updated_at"`
}
