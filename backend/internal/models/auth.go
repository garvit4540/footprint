package models

import "time"

type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	DisplayName *string   `json:"display_name,omitempty"`
	HeightCm    *float64  `json:"height_cm,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}
