CREATE TABLE IF NOT EXISTS loans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counterparty TEXT NOT NULL,
  direction    TEXT NOT NULL CHECK (direction IN ('borrowed','lent')),
  principal    NUMERIC(18,2) NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'INR',
  opened_on    DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS loan_payments (
  id         BIGSERIAL PRIMARY KEY,
  loan_id    UUID NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount     NUMERIC(18,2) NOT NULL,
  paid_on    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS loan_payments_loan_idx ON loan_payments(loan_id, paid_on DESC);
