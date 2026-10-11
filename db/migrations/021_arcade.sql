-- v2.9: skill arcades (Snake, Moles, Slice, Layer). Browser-played, score checked on the server, pays capped XP only.
CREATE TABLE IF NOT EXISTS arcade_runs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game        VARCHAR(16) NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  score       INTEGER,
  xp          INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS arcade_runs_board_idx ON arcade_runs (game, ended_at DESC, score DESC);
CREATE INDEX IF NOT EXISTS arcade_runs_user_idx ON arcade_runs (user_id, game, ended_at DESC);
