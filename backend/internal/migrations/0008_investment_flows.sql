-- Cashflow ledger for investments: additional contributions / withdrawals.
-- Kept intentionally simple (no units) so you can track total principal over time.

CREATE TABLE IF NOT EXISTS investment_flows (
  id            BIGSERIAL PRIMARY KEY,
  investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('contribution', 'withdrawal')),
  amount        NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  occurred_on   DATE,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_flows_investment_idx
  ON investment_flows (investment_id, created_at DESC);

-- Backfill a single "initial contribution" per existing investment so historical
-- data keeps working. Idempotent: only inserts if that investment has no flows.
INSERT INTO investment_flows (investment_id, kind, amount, occurred_on, notes)
SELECT i.id,
       'contribution',
       i.purchase_value,
       COALESCE(i.purchase_date, i.created_at::date),
       'initial seed'
FROM investments i
WHERE i.purchase_value > 0
  AND NOT EXISTS (
    SELECT 1 FROM investment_flows f WHERE f.investment_id = i.id
  );

