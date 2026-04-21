# Footprint

A personal notebook: an admin's tracker (investments, loans, weight) stapled onto a small blog with fine-grained per-user visibility. Built as a single-user primary experience with optional reader accounts the admin can grant tag-by-tag access to.

---

## Stack

- **Backend** — Go 1.22, Chi router, pgx/v5, bcrypt, net/smtp. Hand-written SQL, no ORM.
- **Frontend** — React 18 + Vite + TypeScript, TanStack Query, React Router, Tailwind, Recharts, react-markdown.
- **DB** — Postgres 16 (with pgcrypto for UUIDs + bcrypt support).
- **Delivery** — `docker-compose` → three services: `db`, `api`, `web` (nginx serving the built SPA and proxying `/api` + `/uploads` to the Go backend).

## Runtime topology

```
Browser ──► nginx (web:80) ──► React SPA
                       ├ proxies /api/*     ──► api:8080 (Go)
                       └ proxies /uploads/* ──► api:8080 (Go)
                                                └ Postgres (db:5432)
                                                └ volume /data/uploads
```

Ports bound on the host: `web → 127.0.0.1:8080`, `api → 127.0.0.1:8081`, `db → 127.0.0.1:5432`. You only interact with `:8080`.

## Run

```bash
cp .env.example .env           # fill in if you want email notifications
docker compose up --build -d
open http://localhost:8080
```

Stop: `docker compose down`. Wipe everything: `docker compose down -v`.

---

## Authentication model

- **Password hashing** — bcrypt at default cost.
- **Sessions** — opaque random tokens (32 bytes hex), stored in the `sessions` table, delivered as an `HttpOnly`, `SameSite=Lax` cookie named `session`. Secure flag toggled by `COOKIE_SECURE` env.
- **Roles** — two real roles: `admin` and `member`. `public` is a *visibility tag* on posts, not a user role (anonymous viewers have no account).
- **Login rotation** — a successful login wipes every other session for that user.
- **Middleware stack** (`backend/internal/auth/auth.go`):
  - `Optional` — decodes the session cookie into a `*models.User` on the request context (no-op if missing/invalid).
  - `Required` — 401 if no user.
  - `AdminOnly` — 401 if no user, 403 if not admin.
- **Rate limits** — `/api/auth/login` and `/api/auth/signup` are limited to 10 requests / IP / minute.
- **CSRF defense-in-depth** — every mutating `/api/*` request must either be `Content-Type: application/json` or carry `X-Requested-With` (the frontend's `req()` helper sends both).

### Visibility rule (the important bit)

A post is visible to a caller iff **any** of these hold:

1. Caller is `admin`.
2. Post has the `public` role → visible to everyone, incl. unauthenticated.
3. Caller is signed-in **and** post has the `member` role.
4. Caller is signed-in **and every tag on the post is in their `user_tags` allowlist** (subset rule).

The subset rule is strict: if a post has `#gf` and `#trip`, a reader with only `#trip` allowed **cannot** see the post. They must be trusted with *all* tags on the post. Untagged posts can only be reached via role gates.

The same rule is evaluated in the list query (`store.ListBlogs`), the single-get (`store.GetBlog`), and the email notification audience (`store.RecipientsForBlog`) — there's no way for a user to get notified about a post they can't read.

---

## Database schema

All migrations live in `backend/internal/migrations/*.sql`, embedded with `//go:embed`, run on boot by `db.Migrate`. They use `CREATE TABLE IF NOT EXISTS` and can replay safely.

### `0001_init.sql` — investments

| table | purpose |
|---|---|
| `investments(id UUID pk, name, type, purchase_date, purchase_value, current_value, currency, notes, created_at, updated_at)` | one per holding |
| `valuation_history(id BIGSERIAL, investment_id FK CASCADE, value NUMERIC, recorded_at TIMESTAMPTZ)` | every valuation checkpoint — inserted on create, plus each time `current_value` changes |

### `0002_auth_blogs.sql` — auth + blog

| table | purpose |
|---|---|
| `users(id UUID, email UNIQUE, password_hash, role TEXT, display_name, created_at)` | accounts; `role ∈ {admin, member}` |
| `sessions(token PK, user_id FK CASCADE, expires_at, created_at)` | active sessions; token is 64-char hex |
| `blogs(id UUID, title, body, author_id FK SET NULL, created_at, updated_at)` | the posts |
| `tags(id UUID, name UNIQUE)` | lowercase, deduped |
| `blog_tags(blog_id, tag_id)` PK composite, both cascade | many-to-many |
| `blog_roles(blog_id, role TEXT)` PK composite | `role ∈ {admin, member, public}` — post visibility classes |

### `0003_site.sql` — site settings

One-row table (enforced by `CHECK(id)` + BOOL PK = TRUE). Admin edits at `/settings`.

```
site_settings(id BOOL PK DEFAULT TRUE CHECK(id), title, tagline, about, updated_at)
```

### `0004_user_tags.sql` — per-user allowlist

```
user_tags(user_id, tag_id)  -- PK composite, both cascade
```

This powers the subset visibility rule — each user's allowed tag set.

### `0005_loans.sql` — loan tracker

| table | purpose |
|---|---|
| `loans(id UUID, counterparty, direction CHECK ∈ {borrowed, lent}, principal, currency, opened_on, notes, created_at, updated_at)` | each loan |
| `loan_payments(id BIGSERIAL, loan_id FK CASCADE, amount, paid_on, notes, created_at)` | partial repayments |

`outstanding = principal − sum(loan_payments.amount)` — computed, not stored.

### `0006_weights.sql` — weight log

```
weights(id BIGSERIAL, value_kg NUMERIC CHECK > 0, recorded_on DATE, notes, created_at)
```

### `0007_user_profile.sql` — profile extensions

Adds `users.height_cm NUMERIC` — used to compute BMI on `/weight`.

---

## Environment variables

Full list. Defaults shown in brackets. All consumed in `backend/cmd/api/main.go`.

| Var | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | *required* | pgx connection URL |
| `PORT` | `8080` | api listen port |
| `UPLOAD_DIR` | `/data/uploads` | where `POST /api/uploads` writes images |
| `ADMIN_EMAIL` | `admin@local` | seeded on first boot if users table is empty |
| `ADMIN_PASSWORD` | `admin` | seeded on first boot if users table is empty |
| `SITE_URL` | `http://localhost:8080` | used in notification email links |
| `SMTP_HOST` | `smtp.gmail.com` | only used if `SMTP_USER`+`SMTP_PASS` are set |
| `SMTP_PORT` | `587` | |
| `SMTP_USER` | *unset* | if empty, SMTP is disabled — emails are logged instead |
| `SMTP_PASS` | *unset* | Gmail app password or any SMTP secret |
| `SMTP_FROM` | same as `SMTP_USER` | `From:` address |
| `SMTP_FROM_NAME` | `Footprint` | display name in `From:` |
| `COOKIE_SECURE` | `false` | set `true` to mark the session cookie `Secure` (HTTPS-only) |
| `ALLOWED_ORIGINS` | `http://localhost:5173, http://localhost:8080` | comma-separated CORS allowlist |

`.env.example` is committed. Copy to `.env`, fill in, `docker compose up -d`.

---

## Logins & seeding

- On first boot (empty `users` table), `db.SeedAdmin` inserts a single admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.
- `POST /api/auth/signup` creates a `member` user with no tags — open for anyone.
- `POST /api/auth/login` verifies bcrypt, wipes any prior sessions for that user, and issues a fresh cookie.
- `POST /api/auth/logout` deletes the session row and clears the cookie.
- `GET /api/auth/me` → current user or `null`.
- `PATCH /api/auth/me` → user updates their own `display_name` / `height_cm`.

---

## HTTP API

### Public (optional auth — `Optional` middleware sees you if logged in)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/login` | password login; rate-limited |
| `POST` | `/api/auth/signup` | self-register as `member`; rate-limited |
| `POST` | `/api/auth/logout` | kill current session |
| `GET` | `/api/auth/me` | current user or `null` |
| `PATCH` | `/api/auth/me` | update own display name / height |
| `GET` | `/api/blogs` | list posts, filtered by visibility |
| `GET` | `/api/blogs/:id` | one post, filtered by visibility |
| `GET` | `/api/tags` | tag names |
| `GET` | `/api/site` | site title / tagline / about |
| `GET` | `/uploads/:name` | serve an uploaded image (content-sniffed, CSP-locked) |

### Admin-only (`auth.AdminOnly`)

| Method | Path | Purpose |
|---|---|---|
| **Investments** | | |
| `GET` | `/api/investments` | list all |
| `POST` | `/api/investments` | create; auto-logs first valuation point |
| `GET` | `/api/investments/:id` | one |
| `PATCH` | `/api/investments/:id` | update; a `current_value` change appends to history |
| `DELETE` | `/api/investments/:id` | cascades valuation history |
| `GET` | `/api/investments/:id/history` | raw valuation timeline |
| `GET` | `/api/summary` | totals, by-type breakdown, per-investment series, LOCF aggregate |
| **Blogs** | | |
| `POST` | `/api/blogs` | create; fires async email to allowed recipients |
| `PATCH` | `/api/blogs/:id` | update body / tags / roles |
| `DELETE` | `/api/blogs/:id` | delete |
| **Users** | | |
| `GET` | `/api/users` | list |
| `POST` | `/api/users` | admin-create (role-selectable) |
| `DELETE` | `/api/users/:id` | can't self-delete |
| `GET` | `/api/users/:id/tags` | their allowed-tag list |
| `PUT` | `/api/users/:id/tags` | replace (body `{tags: [...]}`) |
| **Tags** | | |
| `GET` | `/api/tags/usage` | `[{id, name, blogs, users}]` for admin |
| `DELETE` | `/api/tags/:id` | FK cascade removes from all posts + user allowlists |
| **Loans** | | |
| `GET` | `/api/loans` | list with payments + `paid` + `outstanding` |
| `POST` | `/api/loans` | create |
| `GET` | `/api/loans/:id` | one |
| `PATCH` | `/api/loans/:id` | update metadata |
| `DELETE` | `/api/loans/:id` | cascades payments |
| `POST` | `/api/loans/:id/payments` | record a partial return |
| `DELETE` | `/api/loans/:id/payments/:pid` | undo |
| **Weight** | | |
| `GET` | `/api/weights` | all entries |
| `POST` | `/api/weights` | add |
| `DELETE` | `/api/weights/:id` | remove |
| **Site / uploads** | | |
| `PATCH` | `/api/site` | edit title / tagline / about |
| `POST` | `/api/uploads` | multipart image (15 MB max; PNG/JPG/GIF/WebP only; content-sniffed) |

### Other

- `GET /healthz` → plain `ok`; used by the Docker healthcheck / uptime monitors.

---

## Frontend routes

`frontend/src/App.tsx`. `<Protected admin>` wraps admin pages and redirects members to `/`.

| Path | Who | What |
|---|---|---|
| `/` | everyone | **Blog landing**: hero from `site_settings`, featured post + grid, tag filter, reading time, cover image = first markdown image in the body |
| `/login` | everyone | sign in |
| `/signup` | everyone | create a member account |
| `/blogs/:id` | everyone (server filters) | full markdown-rendered post |
| `/blogs/new` | admin | markdown editor with image upload (drag/paste/click) + preview + role chips |
| `/blogs/:id/edit` | admin | same editor, pre-filled |
| `/dashboard` | admin | portfolio: total stats, multi-line per-investment chart with white LOCF total overlay, INR/USD currency tabs, allocation pie, by-type (Gain/Loss + %) |
| `/investments` | admin | holdings table with quick "update current value", % change, last updated |
| `/investments/:id` | admin | chart, high/low/first-tracked tiles, full valuation update log with deltas |
| `/loans` | admin | Borrowed / Lent sections, progress bars, "I paid back" / "Payment received" modals, payment history |
| `/weight` | admin | stat cards (latest, BMI, since start, last 30 days), height editor, weight + BMI dual-axis chart + linear trend line |
| `/users` | admin | create users, per-user tag allowlist editor |
| `/tags` | admin | global tag list with usage counts; delete cascades to all posts/users |
| `/settings` | admin | edit site title / tagline / about |

---

## The mini-apps inside

### 1. Blog
- Markdown body with GFM (tables, task lists, strikethrough). Safe by default — `react-markdown` doesn't render raw HTML and sanitizes URLs.
- Visibility: roles (`public` / `member` / `admin`) + **subset** tag-based allowlist (every post tag must be in the user's list).
- Images: `POST /api/uploads` → `/uploads/<32hex>.<ext>`. Editor inserts `![alt](/uploads/...)` at the cursor on drop/paste/click. Files live in the `uploads_data` volume. SVG not allowed (XSS). Content-sniffed with `http.DetectContentType`.
- Tags: free-form, lowercased + deduped. List page has a chip filter. Admin `/tags` shows usage counts + delete.
- Notifications: `POST /api/blogs` → `notifyNewBlog` runs in a goroutine, fetches `RecipientsForBlog` (admins + member-role audience + users whose allowlist ⊇ post tags, minus author), sends each an HTML email. No SMTP creds → logs "would notify N users" instead.
- Onboarding: public `/signup`. New users are `member` with no tags → they only see `public` + `member` posts until admin grants tags.

### 2. Investments (admin-private)
- Types: `MUTUAL_FUND | STOCK | INSURANCE | FD | LIQUID | CRYPTO | REAL_ESTATE | BOND | OTHER`.
- Every `current_value` change appends to `valuation_history` inside the update transaction.
- Dashboard chart uses `summary.series` (per-investment point lists) and computes the **Portfolio total** with LOCF (last-observation-carried-forward), so days where one investment didn't move don't drop out of the sum. Currency tabs avoid summing INR + USD.
- Per-investment detail: chart, high/low/first-tracked tiles, full value-updates table with delta and cumulative-since-purchase.

### 3. Loans
- Two directions: `borrowed` (you owe) and `lent` (they owe).
- Each loan has many `loan_payments`. Card UI shows progress bar + outstanding with tone per direction (rose for debt, emerald for credit).
- Summary cards: *You owe*, *Owed to you*, *Net position* (per currency, since INR + USD don't sum).
- Add loan / record payment / remove payment / delete loan, all modal-driven.

### 4. Weight
- Free-form kg entries with date + notes.
- Stat cards: latest, **BMI** (calculated from `value_kg / (height_cm/100)²`, colour by category), change since start, last 30 days.
- Height stored per-user on `users.height_cm`.
- Chart: weight line + **BMI overlay** on a right y-axis + **dashed trend line** (least-squares fit). Caption translates the slope into kg/week.

### 5. Site config
- Single-row `site_settings`. Admin edits at `/settings` and the home hero + browser title update live.

---

## Security posture (what's in place)

- Parameterized SQL everywhere.
- bcrypt passwords, sessions in DB with TTL + rotation on login.
- `HttpOnly` + `SameSite=Lax` cookie; `Secure` toggled by env.
- Rate-limited login/signup (10 / IP / min).
- CSRF defense-in-depth (`X-Requested-With` / JSON content-type).
- Upload hardening: content-sniff via `http.DetectContentType`, regex-locked filenames, `Content-Security-Policy` header per served file, no SVG.
- Request body capped at 1 MB globally (15 MB for uploads).
- Password input capped at 128 bytes to prevent bcrypt-with-huge-input DoS.
- 500 responses don't leak Postgres error text.
- nginx headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- SMTP header-injection guard (CR/LF stripped from every header value).
- Every admin route behind `AdminOnly`; frontend hiding is cosmetic.

## What's intentionally not in place (known gaps)

- No password reset / change flow.
- No email verification on signup.
- No per-user notification opt-out toggle.
- No audit log on admin deletes.
- Rate limiter is in-process — single replica only.
- CSP on served HTML is permissive (Tailwind + recharts need inline styles).

---

## Data durability

Data lives in named Docker volumes (`db_data`, `uploads_data`) — these survive container stops, restarts, reboots, and `docker compose down`. They're deleted only by `docker compose down -v`, `docker volume rm`, or disk failure.

Backup one-liner:

```bash
mkdir -p ~/footprint-backups
docker exec investment-tracker-db-1 pg_dump -U invest invest \
  | gzip > ~/footprint-backups/db-$(date +%F).sql.gz
docker run --rm \
  -v investment-tracker_uploads_data:/d \
  -v ~/footprint-backups:/out \
  alpine tar czf /out/uploads-$(date +%F).tgz -C /d .
```

(Container / volume names are derived from the compose project directory; substitute if you extracted into `footprint/`.)

Restore:

```bash
gunzip -c db-YYYY-MM-DD.sql.gz \
  | docker exec -i investment-tracker-db-1 psql -U invest invest
docker run --rm -v investment-tracker_uploads_data:/d -v "$PWD":/in \
  alpine tar xzf /in/uploads-YYYY-MM-DD.tgz -C /d
docker compose restart api
```

---

## Going live later

If/when this app leaves localhost:

1. Rotate every default credential (Postgres, admin seed). Set `POSTGRES_PASSWORD`, `ADMIN_PASSWORD` in `.env` *before* first boot.
2. Put TLS in front. Caddy is the simplest path — it auto-provisions Let's Encrypt.
3. `COOKIE_SECURE=true`, `SITE_URL=https://your-domain`, `ALLOWED_ORIGINS=https://your-domain`.
4. Remove the `ports:` mappings for `db` and `api` in `docker-compose.yml`. Only the `web` container should be reachable.
5. Host firewall: allow 22 (SSH) + 443 only.
6. Backup Postgres + uploads off-box (scp / S3 / B2), test the restore once.
7. Update base images monthly.
