CREATE TABLE IF NOT EXISTS site_settings (
  id         BOOLEAN PRIMARY KEY DEFAULT TRUE,
  title      TEXT NOT NULL DEFAULT 'Footprint',
  tagline    TEXT NOT NULL DEFAULT 'Thoughts, writing, and things I am learning.',
  about      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT site_settings_singleton CHECK (id)
);

INSERT INTO site_settings (id) VALUES (TRUE) ON CONFLICT DO NOTHING;
