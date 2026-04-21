package models

import "time"

type Blog struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Body      string    `json:"body"`
	AuthorID  *string   `json:"author_id,omitempty"`
	Author    *string   `json:"author,omitempty"`
	Tags      []string  `json:"tags"`
	Roles     []string  `json:"roles"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Tag struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type TagUsage struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Blogs int    `json:"blogs"`
	Users int    `json:"users"`
}
