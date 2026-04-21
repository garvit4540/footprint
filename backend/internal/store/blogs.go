package store

import (
	"context"
	"errors"
	"strconv"
	"strings"

	"github.com/garvitgupta/footprint/backend/internal/models"
	"github.com/jackc/pgx/v5"
)

type BlogInput struct {
	Title    string
	Body     string
	Tags     []string
	Roles    []string
	AuthorID string
}

// visibleCondition returns a SQL snippet constraining `b.id` to blogs the given
// caller may see, plus args to bind. role=="admin" returns an empty string
// meaning no constraint.
func visibleCondition(role, userID string, argStart int) (string, []any) {
	if role == "admin" {
		return "", nil
	}
	conds := []string{
		`EXISTS (SELECT 1 FROM blog_roles br WHERE br.blog_id = b.id AND br.role = 'public')`,
	}
	args := []any{}
	if userID != "" {
		p := "$" + strconv.Itoa(argStart)
		conds = append(conds,
			`EXISTS (SELECT 1 FROM blog_roles br WHERE br.blog_id = b.id AND br.role = 'member')`,
			// Tag-based access: the user must be allowed every tag on the post.
			// Post has at least one tag, and no post tag is missing from user_tags.
			`(
				EXISTS (SELECT 1 FROM blog_tags bt WHERE bt.blog_id = b.id)
				AND NOT EXISTS (
					SELECT 1 FROM blog_tags bt
					WHERE bt.blog_id = b.id
					  AND NOT EXISTS (
					      SELECT 1 FROM user_tags ut
					      WHERE ut.user_id = `+p+`::uuid AND ut.tag_id = bt.tag_id
					  )
				)
			)`)
		args = append(args, userID)
	}
	return " (" + strings.Join(conds, " OR ") + ") ", args
}

func (s *Store) ListBlogs(ctx context.Context, userID, role string) ([]models.Blog, error) {
	query := `
		SELECT b.id, b.title, b.body, b.author_id,
		       u.display_name, u.email,
		       b.created_at, b.updated_at
		FROM blogs b
		LEFT JOIN users u ON u.id = b.author_id`
	cond, args := visibleCondition(role, userID, 1)
	if cond != "" {
		query += " WHERE " + cond
	}
	query += ` ORDER BY b.created_at DESC`

	rows, err := s.DB.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var blogs []models.Blog
	var ids []string
	for rows.Next() {
		var b models.Blog
		var displayName, email *string
		if err := rows.Scan(&b.ID, &b.Title, &b.Body, &b.AuthorID,
			&displayName, &email, &b.CreatedAt, &b.UpdatedAt); err != nil {
			return nil, err
		}
		if displayName != nil && *displayName != "" {
			b.Author = displayName
		} else {
			b.Author = email
		}
		b.Tags = []string{}
		b.Roles = []string{}
		blogs = append(blogs, b)
		ids = append(ids, b.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return blogs, nil
	}

	tagMap := map[string][]string{}
	tagRows, err := s.DB.Query(ctx,
		`SELECT bt.blog_id, t.name
		 FROM blog_tags bt JOIN tags t ON t.id = bt.tag_id
		 WHERE bt.blog_id = ANY($1)
		 ORDER BY t.name`, ids)
	if err != nil {
		return nil, err
	}
	for tagRows.Next() {
		var id, name string
		if err := tagRows.Scan(&id, &name); err != nil {
			tagRows.Close()
			return nil, err
		}
		tagMap[id] = append(tagMap[id], name)
	}
	tagRows.Close()

	roleMap := map[string][]string{}
	roleRows, err := s.DB.Query(ctx,
		`SELECT blog_id, role FROM blog_roles WHERE blog_id = ANY($1) ORDER BY role`, ids)
	if err != nil {
		return nil, err
	}
	for roleRows.Next() {
		var id, role string
		if err := roleRows.Scan(&id, &role); err != nil {
			roleRows.Close()
			return nil, err
		}
		roleMap[id] = append(roleMap[id], role)
	}
	roleRows.Close()

	for i := range blogs {
		if t := tagMap[blogs[i].ID]; t != nil {
			blogs[i].Tags = t
		}
		if r := roleMap[blogs[i].ID]; r != nil {
			blogs[i].Roles = r
		}
	}
	return blogs, nil
}

func (s *Store) GetBlog(ctx context.Context, id, userID, role string) (*models.Blog, error) {
	var b models.Blog
	var displayName, email *string
	err := s.DB.QueryRow(ctx, `
		SELECT b.id, b.title, b.body, b.author_id,
		       u.display_name, u.email,
		       b.created_at, b.updated_at
		FROM blogs b
		LEFT JOIN users u ON u.id = b.author_id
		WHERE b.id = $1`, id).Scan(
		&b.ID, &b.Title, &b.Body, &b.AuthorID,
		&displayName, &email, &b.CreatedAt, &b.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	if displayName != nil && *displayName != "" {
		b.Author = displayName
	} else {
		b.Author = email
	}

	b.Tags = []string{}
	b.Roles = []string{}

	tagRows, err := s.DB.Query(ctx,
		`SELECT t.name FROM blog_tags bt
		 JOIN tags t ON t.id = bt.tag_id
		 WHERE bt.blog_id = $1 ORDER BY t.name`, id)
	if err != nil {
		return nil, err
	}
	for tagRows.Next() {
		var name string
		if err := tagRows.Scan(&name); err != nil {
			tagRows.Close()
			return nil, err
		}
		b.Tags = append(b.Tags, name)
	}
	tagRows.Close()

	roleRows, err := s.DB.Query(ctx,
		`SELECT role FROM blog_roles WHERE blog_id = $1 ORDER BY role`, id)
	if err != nil {
		return nil, err
	}
	for roleRows.Next() {
		var role string
		if err := roleRows.Scan(&role); err != nil {
			roleRows.Close()
			return nil, err
		}
		b.Roles = append(b.Roles, role)
	}
	roleRows.Close()

	if role == "admin" {
		return &b, nil
	}

	for _, r := range b.Roles {
		if r == "public" {
			return &b, nil
		}
	}
	if userID == "" {
		return nil, ErrNotFound
	}
	for _, r := range b.Roles {
		if r == "member" {
			return &b, nil
		}
	}
	// Tag-based access: user must be allowed every tag on the post.
	var allowed bool
	if err := s.DB.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM blog_tags WHERE blog_id = $1)
		   AND NOT EXISTS (
		     SELECT 1 FROM blog_tags bt
		     WHERE bt.blog_id = $1
		       AND NOT EXISTS (
		         SELECT 1 FROM user_tags ut
		         WHERE ut.user_id = $2 AND ut.tag_id = bt.tag_id
		       )
		   )`, id, userID).Scan(&allowed); err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrNotFound
	}
	return &b, nil
}

func (s *Store) CreateBlog(ctx context.Context, in BlogInput) (*models.Blog, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	var author any
	if in.AuthorID != "" {
		author = in.AuthorID
	}
	var id string
	if err := tx.QueryRow(ctx,
		`INSERT INTO blogs (title, body, author_id) VALUES ($1, $2, $3) RETURNING id`,
		in.Title, in.Body, author,
	).Scan(&id); err != nil {
		return nil, err
	}

	if err := upsertTags(ctx, tx, id, in.Tags); err != nil {
		return nil, err
	}
	if err := upsertRoles(ctx, tx, id, in.Roles); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetBlog(ctx, id, "", "admin")
}

func (s *Store) UpdateBlog(ctx context.Context, id string, in BlogInput) (*models.Blog, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	ct, err := tx.Exec(ctx,
		`UPDATE blogs SET title = $1, body = $2, updated_at = now() WHERE id = $3`,
		in.Title, in.Body, id)
	if err != nil {
		return nil, err
	}
	if ct.RowsAffected() == 0 {
		return nil, ErrNotFound
	}

	if _, err := tx.Exec(ctx, `DELETE FROM blog_tags WHERE blog_id = $1`, id); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM blog_roles WHERE blog_id = $1`, id); err != nil {
		return nil, err
	}
	if err := upsertTags(ctx, tx, id, in.Tags); err != nil {
		return nil, err
	}
	if err := upsertRoles(ctx, tx, id, in.Roles); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return s.GetBlog(ctx, id, "", "admin")
}

func (s *Store) DeleteBlog(ctx context.Context, id string) error {
	ct, err := s.DB.Exec(ctx, `DELETE FROM blogs WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func upsertTags(ctx context.Context, tx pgx.Tx, blogID string, tags []string) error {
	seen := map[string]bool{}
	for _, name := range tags {
		name = strings.ToLower(strings.TrimSpace(name))
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		var tagID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO tags (name) VALUES ($1)
			 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
			 RETURNING id`, name).Scan(&tagID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO blog_tags (blog_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			blogID, tagID); err != nil {
			return err
		}
	}
	return nil
}

func upsertRoles(ctx context.Context, tx pgx.Tx, blogID string, roles []string) error {
	valid := map[string]bool{"admin": true, "member": true, "public": true}
	seen := map[string]bool{}
	for _, role := range roles {
		role = strings.ToLower(strings.TrimSpace(role))
		if !valid[role] || seen[role] {
			continue
		}
		seen[role] = true
		if _, err := tx.Exec(ctx,
			`INSERT INTO blog_roles (blog_id, role) VALUES ($1, $2)`, blogID, role); err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ListTags(ctx context.Context) ([]models.Tag, error) {
	rows, err := s.DB.Query(ctx, `SELECT id, name FROM tags ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []models.Tag
	for rows.Next() {
		var t models.Tag
		if err := rows.Scan(&t.ID, &t.Name); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) ListTagsWithUsage(ctx context.Context) ([]models.TagUsage, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT t.id, t.name,
		       (SELECT COUNT(*) FROM blog_tags bt WHERE bt.tag_id = t.id)::int AS blogs,
		       (SELECT COUNT(*) FROM user_tags ut WHERE ut.tag_id = t.id)::int AS users
		FROM tags t ORDER BY t.name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.TagUsage{}
	for rows.Next() {
		var t models.TagUsage
		if err := rows.Scan(&t.ID, &t.Name, &t.Blogs, &t.Users); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

func (s *Store) DeleteTag(ctx context.Context, id string) error {
	ct, err := s.DB.Exec(ctx, `DELETE FROM tags WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// RecipientsForBlog returns registered users (excluding the author) who are
// allowed to see the given blog post, for notification purposes.
func (s *Store) RecipientsForBlog(ctx context.Context, blogID, excludeUserID string) ([]models.User, error) {
	rows, err := s.DB.Query(ctx, `
		SELECT DISTINCT u.id, u.email, u.role, u.display_name, u.height_cm, u.created_at
		FROM users u
		WHERE ($2::uuid IS NULL OR u.id <> $2::uuid)
		  AND (
		    u.role = 'admin'
		    OR (u.role = 'member' AND EXISTS (
		        SELECT 1 FROM blog_roles br WHERE br.blog_id = $1 AND br.role = 'member'
		    ))
		    OR (
		        EXISTS (SELECT 1 FROM blog_tags WHERE blog_id = $1)
		        AND NOT EXISTS (
		            SELECT 1 FROM blog_tags bt
		            WHERE bt.blog_id = $1
		              AND NOT EXISTS (
		                  SELECT 1 FROM user_tags ut
		                  WHERE ut.user_id = u.id AND ut.tag_id = bt.tag_id
		              )
		        )
		    )
		  )`,
		blogID, nullableUUID(excludeUserID),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []models.User{}
	for rows.Next() {
		var u models.User
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.DisplayName, &u.HeightCm, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func nullableUUID(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func (s *Store) ListUserTags(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.DB.Query(ctx,
		`SELECT t.name FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
		 WHERE ut.user_id = $1 ORDER BY t.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (s *Store) SetUserTags(ctx context.Context, userID string, tags []string) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `DELETE FROM user_tags WHERE user_id = $1`, userID); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, name := range tags {
		name = strings.ToLower(strings.TrimSpace(name))
		if name == "" || seen[name] {
			continue
		}
		seen[name] = true
		var tagID string
		if err := tx.QueryRow(ctx,
			`INSERT INTO tags (name) VALUES ($1)
			 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
			 RETURNING id`, name).Scan(&tagID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO user_tags (user_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
			userID, tagID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
