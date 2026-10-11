-- v2.7: Chess PvP. Server validates every move, runs the clocks and escrows the stakes.
CREATE TABLE IF NOT EXISTS chess_matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  white_id    UUID REFERENCES users(id) ON DELETE SET NULL,   -- creator until someone joins (colours drawn on join)
  black_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  stake       NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (stake >= 0),
  currency    currency_code NOT NULL DEFAULT 'AC',
  minutes     SMALLINT NOT NULL DEFAULT 5,
  status      VARCHAR(10) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'done', 'cancelled')),
  state       JSONB NOT NULL,
  moves       JSONB NOT NULL DEFAULT '[]'::jsonb,
  clock       JSONB NOT NULL,                                 -- ms left per side at turn_at
  turn_at     TIMESTAMPTZ,
  result      VARCHAR(5),                                     -- w | b | draw
  reason      VARCHAR(16),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at  TIMESTAMPTZ,
  ended_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS chess_open_idx ON chess_matches (status, created_at DESC);
CREATE INDEX IF NOT EXISTS chess_white_idx ON chess_matches (white_id, status);
CREATE INDEX IF NOT EXISTS chess_black_idx ON chess_matches (black_id, status);
INSERT INTO games (slug, name, category, max_multiplier) VALUES ('chess', 'Chess', 'table', 1.9) ON CONFLICT (slug) DO NOTHING;
