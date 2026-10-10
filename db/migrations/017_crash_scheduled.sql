-- v2.4: Owner can set the crash point of a future global Crash round ("event round").
-- Such rounds are marked so the provably fair check can say why the seed does not explain the point.
ALTER TABLE crash_rounds ADD COLUMN IF NOT EXISTS forced BOOLEAN NOT NULL DEFAULT FALSE;
