-- 005 — Perk loyalty & membership, battle pass, Crash global, banner upload, room VIP, jackpot per mata uang.

ALTER TYPE tx_category ADD VALUE IF NOT EXISTS 'perk';
ALTER TYPE tx_category ADD VALUE IF NOT EXISTS 'season';

-- ── Jackpot: per mata uang, hanya kemenangan sangat besar (> 100 juta AC / > 2.500 AG) ──
ALTER TABLE jackpots ADD COLUMN IF NOT EXISTS currency currency_code NOT NULL DEFAULT 'AC';
DELETE FROM chat_messages WHERE type = 'jackpot';
DELETE FROM jackpots WHERE amount <= 100000000;
INSERT INTO chat_messages (user_id, type, body, data, created_at)
SELECT NULL, 'jackpot', 'jackpot', jsonb_build_object('jackpotId', id), at FROM jackpots;

-- ── Banner profil yang di-upload pemain (disajikan lewat /api/banner/<user>) ──
CREATE TABLE user_banners (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime        VARCHAR(16) NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  data        BYTEA NOT NULL,
  hash        VARCHAR(16) NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Loyalty: hanya lewat XP; perk nyata per kartu ──
UPDATE loyalty_cards SET unlock_ac = NULL, unlock_ag = NULL;
ALTER TABLE loyalty_cards ADD COLUMN IF NOT EXISTS perks JSONB NOT NULL DEFAULT '{}'::jsonb;
UPDATE loyalty_cards SET perks = v.perks::jsonb, benefits = v.benefits::jsonb FROM (VALUES
  ('none',     '{"dailyAc": 0, "dailyAg": 0, "convertPct": 0, "shopDiscount": 0, "lxpPct": 0}',
               '["Max bet 250,000 AC / 10 AG", "Basic chat tag"]'),
  ('silver',   '{"dailyAc": 5000, "dailyAg": 0, "convertPct": 25, "shopDiscount": 0, "lxpPct": 0}',
               '["Max bet 500,000 AC / 20 AG", "Daily card bonus: 5,000 AC", "+25% AC → AG daily limit", "Silver badge & chat tag", "Silver emotes"]'),
  ('gold',     '{"dailyAc": 25000, "dailyAg": 1, "convertPct": 50, "shopDiscount": 5, "lxpPct": 5}',
               '["Max bet 1,000,000 AC / 50 AG", "Daily card bonus: 25,000 AC + 1 AG", "+50% AC → AG daily limit", "5% off in the Shop", "+5% Loyalty XP", "Gold badge, chat tag & emotes"]'),
  ('platinum', '{"dailyAc": 100000, "dailyAg": 3, "convertPct": 100, "shopDiscount": 10, "lxpPct": 10}',
               '["Max bet 2,500,000 AC / 125 AG", "Daily card bonus: 100,000 AC + 3 AG", "2× AC → AG daily limit", "10% off in the Shop", "+10% Loyalty XP", "Platinum cosmetics"]'),
  ('infinite', '{"dailyAc": 350000, "dailyAg": 8, "convertPct": 200, "shopDiscount": 15, "lxpPct": 15}',
               '["Max bet 8,500,000 AC / 350 AG", "Daily card bonus: 350,000 AC + 8 AG", "3× AC → AG daily limit", "15% off in the Shop", "+15% Loyalty XP", "Infinite cosmetics & profile effects"]'),
  ('black',    '{"dailyAc": 1000000, "dailyAg": 20, "convertPct": 400, "shopDiscount": 20, "lxpPct": 20}',
               '["Max bet 20,000,000 AC / 750 AG", "Daily card bonus: 1,000,000 AC + 20 AG", "5× AC → AG daily limit", "20% off in the Shop", "+20% Loyalty XP", "Black cosmetics & unique effects", "Highest Loyalty status"]')
) AS v(slug, perks, benefits) WHERE loyalty_cards.slug = v.slug;

-- ── Membership: manajer pribadi, hadiah sekali, prefix/suffix nama, kode redeem khusus member ──
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_prefix VARCHAR(12);
ALTER TABLE users ADD COLUMN IF NOT EXISTS name_suffix VARCHAR(12);
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS members_only VARCHAR(4) CHECK (members_only IN ('vip', 'vvip'));

-- Bonus berkala & sekali (VIP/VVIP harian & mingguan, bonus kartu harian, hadiah sekali membership, quest tanpa batas).
CREATE TABLE perk_claims (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind     VARCHAR(16) NOT NULL,
  period   VARCHAR(40) NOT NULL,
  at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, period)
);

-- Ruang chat: global, dan ruang VIP (VIP + VVIP + staf).
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS room VARCHAR(8) NOT NULL DEFAULT 'global' CHECK (room IN ('global', 'vip'));
CREATE INDEX IF NOT EXISTS chat_room_time_idx ON chat_messages (room, created_at DESC);

INSERT INTO neon_kv (key, value) VALUES ('memberships', '{}'::jsonb) ON CONFLICT (key) DO NOTHING;
UPDATE neon_kv SET value = value || '{
  "vip":  {"price": 149999, "days": 30, "benefits": []},
  "vvip": {"price": 499999, "days": 30, "benefits": []}
}'::jsonb WHERE key = 'memberships' AND NOT (value ? 'vip');

-- ── Battle pass: premium dibeli 7.500 AG per season, atau gratis untuk VVIP ──
CREATE TABLE season_passes (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_id  INTEGER NOT NULL,
  source     VARCHAR(8) NOT NULL CHECK (source IN ('ag', 'vvip', 'admin')),
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_id)
);

-- ── Crash global: satu ronde untuk semua pemain ──
CREATE TABLE crash_rounds (
  id          BIGSERIAL PRIMARY KEY,
  server_seed VARCHAR(64) NOT NULL,
  seed_hash   VARCHAR(64) NOT NULL,
  point       NUMERIC(14,2) NOT NULL CHECK (point >= 1),
  start_at    TIMESTAMPTZ NOT NULL,          -- taruhan ditutup, roket berangkat
  crash_at    TIMESTAMPTZ NOT NULL,          -- rahasia sampai lewat
  settled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX crash_rounds_recent_idx ON crash_rounds (id DESC);
CREATE TABLE crash_bets (
  round_id    BIGINT NOT NULL REFERENCES crash_rounds(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id  UUID NOT NULL REFERENCES game_sessions(id),
  bet         NUMERIC(18,2) NOT NULL,
  currency    currency_code NOT NULL,
  auto        NUMERIC(10,2),
  cashed_at   NUMERIC(14,2),
  payout      NUMERIC(18,2),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (round_id, user_id)
);

-- ── Alasan tindakan staf jadi opsional (kosong dicatat sebagai "—") ──
CREATE OR REPLACE FUNCTION require_reason(p_reason TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  IF p_reason IS NULL OR char_length(trim(p_reason)) = 0 THEN RETURN '—'; END IF;
  RETURN left(trim(p_reason), 300);
END $$;
