CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS investments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  type           TEXT NOT NULL,
  purchase_date  DATE,
  purchase_value NUMERIC(18,2) NOT NULL,
  current_value  NUMERIC(18,2) NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'INR',
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS valuation_history (
  id            BIGSERIAL PRIMARY KEY,
  investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  value         NUMERIC(18,2) NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS valuation_history_inv_recorded_idx
  ON valuation_history (investment_id, recorded_at DESC);
