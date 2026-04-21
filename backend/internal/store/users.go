package store

import (
	"context"
	"errors"
	"time"

	"github.com/garvitgupta/footprint/backend/internal/models"
	"github.com/jackc/pgx/v5"
)

func (s *Store) ListUsers(ctx context.Context) ([]models.User, error) {
	rows, err := s.DB.Query(ctx,
		`SELECT id, email, role, display_name, height_cm, created_at FROM users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.User
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.DisplayName, &u.HeightCm, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) CreateUser(ctx context.Context, email, passwordHash, role, displayName string) (*models.User, error) {
	var dn *string
	if displayName != "" {
		dn = &displayName
	}
	var u models.User
	err := s.DB.QueryRow(ctx,
		`INSERT INTO users (email, password_hash, role, display_name)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, email, role, display_name, height_cm, created_at`,
		email, passwordHash, role, dn,
	).Scan(&u.ID, &u.Email, &u.Role, &u.DisplayName, &u.HeightCm, &u.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) DeleteUser(ctx context.Context, id string) error {
	ct, err := s.DB.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) UserByEmail(ctx context.Context, email string) (*models.User, string, error) {
	var u models.User
	var hash string
	err := s.DB.QueryRow(ctx,
		`SELECT id, email, role, display_name, height_cm, created_at, password_hash
		 FROM users WHERE email = $1`, email,
	).Scan(&u.ID, &u.Email, &u.Role, &u.DisplayName, &u.HeightCm, &u.CreatedAt, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", ErrNotFound
	}
	if err != nil {
		return nil, "", err
	}
	return &u, hash, nil
}

func (s *Store) CreateSession(ctx context.Context, token, userID string, expires time.Time) error {
	_, err := s.DB.Exec(ctx,
		`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
		token, userID, expires)
	return err
}

func (s *Store) UserBySession(ctx context.Context, token string) (*models.User, error) {
	var u models.User
	err := s.DB.QueryRow(ctx,
		`SELECT u.id, u.email, u.role, u.display_name, u.height_cm, u.created_at
		 FROM sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.token = $1 AND s.expires_at > now()`, token,
	).Scan(&u.ID, &u.Email, &u.Role, &u.DisplayName, &u.HeightCm, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM sessions WHERE token = $1`, token)
	return err
}

// DeleteUserSessions drops every active session for a user. Called on login
// to rotate credentials, and could be called on password change.
func (s *Store) DeleteUserSessions(ctx context.Context, userID string) error {
	_, err := s.DB.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

type ProfileUpdate struct {
	DisplayName *string
	HeightCm    *float64
}

func (s *Store) UpdateProfile(ctx context.Context, userID string, in ProfileUpdate) (*models.User, error) {
	var u models.User
	err := s.DB.QueryRow(ctx, `
		UPDATE users
		SET display_name = COALESCE($1, display_name),
		    height_cm    = COALESCE($2, height_cm)
		WHERE id = $3
		RETURNING id, email, role, display_name, height_cm, created_at`,
		in.DisplayName, in.HeightCm, userID,
	).Scan(&u.ID, &u.Email, &u.Role, &u.DisplayName, &u.HeightCm, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &u, nil
}
