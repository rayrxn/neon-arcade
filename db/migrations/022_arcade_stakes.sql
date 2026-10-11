-- v2.9.2: optional AC stake on skill arcades (score tiers pay up to ×2.5, capped per day).
ALTER TABLE arcade_runs ADD COLUMN IF NOT EXISTS stake NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE arcade_runs ADD COLUMN IF NOT EXISTS payout NUMERIC(18,2) NOT NULL DEFAULT 0;
