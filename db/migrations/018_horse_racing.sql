-- v2.5: Horse Racing — one shared race for everyone, settled on the server.
CREATE TABLE IF NOT EXISTS horse_rounds (
  id          BIGSERIAL PRIMARY KEY,
  server_seed VARCHAR(64) NOT NULL,
  seed_hash   VARCHAR(64) NOT NULL,
  odds        JSONB NOT NULL,           -- payout multiplier per horse (public from the start)
  finish      JSONB NOT NULL,           -- finishing order, secret until the race ends
  start_at    TIMESTAMPTZ NOT NULL,     -- bets close, race starts
  end_at      TIMESTAMPTZ NOT NULL,     -- race over, seed revealed
  settled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS horse_rounds_recent_idx ON horse_rounds (id DESC);
CREATE TABLE IF NOT EXISTS horse_bets (
  round_id    BIGINT NOT NULL REFERENCES horse_rounds(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL REFERENCES game_sessions(id),
  horse       SMALLINT NOT NULL CHECK (horse BETWEEN 0 AND 5),
  bet         NUMERIC(18,2) NOT NULL,
  currency    currency_code NOT NULL,
  payout      NUMERIC(18,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id)
);
INSERT INTO games (slug, name, category, max_multiplier) VALUES ('horse', 'Horse Racing', 'originals', 30) ON CONFLICT (slug) DO NOTHING;
