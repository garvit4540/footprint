CREATE TABLE IF NOT EXISTS weights (
  id          BIGSERIAL PRIMARY KEY,
  value_kg    NUMERIC(6,2) NOT NULL CHECK (value_kg > 0),
  recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weights_date_idx ON weights(recorded_on DESC);
