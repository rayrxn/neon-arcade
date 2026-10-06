-- 004 — Platform v2: chat moderation, AG play, AC→AG converter, loyalty XP & cards, player roles,
-- shop & inventory, boosts, emote catalog, VIP/VVIP memberships, reward missions (Roblox).
-- Every balance/ownership change goes through the server (wallet_post ledger + these tables).

-- New ledger categories (not used in this migration's transaction).
ALTER TYPE tx_category ADD VALUE IF NOT EXISTS 'shop';
ALTER TYPE tx_category ADD VALUE IF NOT EXISTS 'convert';
ALTER TYPE tx_category ADD VALUE IF NOT EXISTS 'loyalty';
ALTER TYPE tx_category ADD VALUE IF NOT EXISTS 'mission';

-- ───────────────────────────── Settings (owner-editable) ─────────────────────────────
INSERT INTO neon_kv (key, value) VALUES
  ('economy', '{"acPerAg": 25000, "convertMinAg": 1, "convertMaxAgPerDay": 200}'),
  ('moderation', '{"level": "standard", "autoMute": true, "autoMuteStrikes": 3, "autoMuteMinutes": 10, "repeatLimit": 8}')
ON CONFLICT (key) DO NOTHING;

-- ───────────────────────────── Chat moderation ─────────────────────────────
CREATE TABLE chat_terms (
  term        VARCHAR(40) PRIMARY KEY CHECK (term ~ '^[a-z]{2,40}$'),
  severity    SMALLINT NOT NULL DEFAULT 2 CHECK (severity BETWEEN 1 AND 3),
  match       VARCHAR(8) NOT NULL DEFAULT 'word' CHECK (match IN ('word', 'prefix', 'contains')),
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO chat_terms (term, severity, match) VALUES
  -- Indonesian
  ('anjing', 2, 'prefix'), ('anjir', 1, 'word'), ('anjay', 1, 'word'), ('bangsat', 3, 'prefix'), ('bajingan', 3, 'prefix'),
  ('kontol', 3, 'contains'), ('kntl', 3, 'word'), ('memek', 3, 'contains'), ('mmk', 2, 'word'), ('ngentot', 3, 'contains'),
  ('ngewe', 3, 'prefix'), ('entot', 3, 'prefix'), ('goblok', 2, 'prefix'), ('goblog', 2, 'prefix'), ('tolol', 2, 'prefix'),
  ('bego', 1, 'word'), ('babi', 1, 'word'), ('kampret', 2, 'prefix'), ('asu', 2, 'word'), ('jancok', 3, 'prefix'),
  ('jancuk', 3, 'prefix'), ('cok', 1, 'word'), ('puki', 3, 'word'), ('pukimak', 3, 'contains'), ('pepek', 3, 'contains'),
  ('peler', 3, 'prefix'), ('titit', 2, 'word'), ('lonte', 3, 'prefix'), ('pelacur', 3, 'prefix'), ('perek', 3, 'word'),
  ('bencong', 2, 'prefix'), ('banci', 2, 'word'), ('setan', 1, 'word'), ('keparat', 2, 'prefix'), ('brengsek', 2, 'prefix'),
  ('idiot', 1, 'word'), ('monyet', 1, 'word'), ('tai', 1, 'word'), ('taik', 2, 'word'), ('jembut', 3, 'prefix'),
  ('coli', 3, 'word'), ('colmek', 3, 'prefix'), ('bokep', 3, 'prefix'), ('sange', 3, 'prefix'), ('ngaceng', 3, 'prefix'),
  -- English
  ('fuck', 3, 'contains'), ('fck', 3, 'word'), ('fuk', 3, 'word'), ('motherfucker', 3, 'contains'), ('shit', 2, 'prefix'),
  ('bullshit', 2, 'word'), ('bitch', 3, 'prefix'), ('asshole', 3, 'contains'), ('bastard', 2, 'prefix'), ('dick', 3, 'word'),
  ('dicks', 3, 'word'), ('dickhead', 3, 'word'), ('cock', 3, 'word'), ('cocks', 3, 'word'), ('pussy', 3, 'prefix'),
  ('cunt', 3, 'prefix'), ('whore', 3, 'prefix'), ('slut', 3, 'prefix'), ('nigger', 3, 'contains'), ('nigga', 3, 'prefix'),
  ('faggot', 3, 'contains'), ('fag', 3, 'word'), ('retard', 2, 'prefix'), ('wanker', 3, 'prefix'), ('twat', 3, 'word'),
  ('porn', 3, 'prefix'), ('penis', 1, 'word'), ('vagina', 1, 'word'), ('boobs', 2, 'word'), ('tits', 2, 'word'),
  ('stfu', 1, 'word'), ('wtf', 1, 'word'), ('kys', 3, 'word'), ('damn', 1, 'word')
ON CONFLICT (term) DO NOTHING;

CREATE TABLE chat_moderation_log (
  id        BIGSERIAL PRIMARY KEY,
  user_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  action    VARCHAR(12) NOT NULL CHECK (action IN ('blocked', 'masked', 'spam', 'flood', 'auto_mute', 'deleted', 'muted', 'unmuted')),
  reason    VARCHAR(40),
  body      VARCHAR(400),
  matched   TEXT,
  admin_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_modlog_time_idx ON chat_moderation_log (at DESC);
CREATE INDEX chat_modlog_user_idx ON chat_moderation_log (user_id, at DESC);

-- ───────────────────────────── AG play ─────────────────────────────
ALTER TABLE game_sessions ADD COLUMN IF NOT EXISTS currency currency_code NOT NULL DEFAULT 'AC';
-- Bet limits now come from the player's Loyalty Card; the per-game cap only matters if an admin lowers it.
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_max_bet_check;
ALTER TABLE games ADD CONSTRAINT games_max_bet_check CHECK (max_bet BETWEEN 10 AND 100000000);
ALTER TABLE games ALTER COLUMN max_bet SET DEFAULT 20000000;
UPDATE games SET max_bet = 20000000 WHERE max_bet = 100000;

CREATE OR REPLACE FUNCTION game_start(p_user UUID, p_game TEXT, p_bet NUMERIC, p_currency currency_code) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE u users; g games; s fairness_seeds; sid UUID; tx UUID; block TEXT;
BEGIN
  SELECT * INTO u FROM users WHERE id = p_user;
  block := account_block(p_user);
  IF block IS NOT NULL THEN PERFORM api_error(block); END IF;
  IF u.wallet_frozen THEN PERFORM api_error('errors.walletFrozen'); END IF;
  IF (SELECT maintenance_enabled AND (maintenance_until IS NULL OR maintenance_until > now()) FROM system_settings WHERE id = 1)
     AND u.role = 'user' THEN PERFORM api_error('errors.maintenance'); END IF;
  SELECT * INTO g FROM games WHERE slug = p_game;
  IF NOT FOUND OR g.status <> 'live' THEN PERFORM api_error('play.errors.gameOff'); END IF;
  IF p_bet <> trunc(p_bet) THEN PERFORM api_error('play.errors.wholeBet'); END IF;
  IF p_bet < 1 THEN PERFORM api_error('play.errors.minBet'); END IF;
  IF p_currency = 'AC' AND p_bet > g.max_bet THEN PERFORM api_error('play.errors.maxBet'); END IF;
  IF (SELECT count(*) FROM game_sessions WHERE user_id = p_user AND started_at > now() - interval '1 second') >= 8 THEN
    PERFORM raise_flag(p_user, 'rapidRequests', 'medium', NULL, '<= 8 rounds/s', '> 8 rounds/s');
    PERFORM api_error('play.errors.tooFast');
  END IF;
  SELECT * INTO s FROM fairness_seeds WHERE user_id = p_user AND revealed_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO fairness_seeds (user_id, server_seed, server_seed_hash, client_seed)
    SELECT p_user, seed, encode(digest(seed, 'sha256'), 'hex'), encode(gen_random_bytes(10), 'hex')
    FROM (SELECT encode(gen_random_bytes(32), 'hex') AS seed) x
    RETURNING * INTO s;
  END IF;
  UPDATE fairness_seeds SET nonce = nonce + 1 WHERE id = s.id;
  BEGIN
    INSERT INTO game_sessions (user_id, game, bet, seed_id, nonce, is_test, currency) VALUES (p_user, p_game, p_bet, s.id, s.nonce, u.is_test, p_currency) RETURNING id INTO sid;
  EXCEPTION WHEN unique_violation THEN PERFORM api_error('play.errors.roundOpen');
  END;
  IF NOT u.is_test THEN
    tx := wallet_post(p_user, p_currency, -p_bet, 'bet', 'game', 'game', NULL, sid, NULL, NULL, 'game:' || sid || ':bet');
    UPDATE game_sessions SET bet_tx_id = tx WHERE id = sid;
  END IF;
  PERFORM log_event('GAME_STARTED', p_user, jsonb_build_object('session', sid, 'game', p_game, 'bet', p_bet, 'currency', p_currency));
  RETURN jsonb_build_object('session_id', sid, 'server_seed_hash', s.server_seed_hash, 'client_seed', s.client_seed, 'nonce', s.nonce,
                            'seed_id', s.id, 'bet_tx', tx, 'is_test', u.is_test, 'control', u.test_control);
END $$;
CREATE OR REPLACE FUNCTION game_start(p_user UUID, p_game TEXT, p_bet NUMERIC) RETURNS JSONB LANGUAGE sql AS $$
  SELECT game_start(p_user, p_game, p_bet, 'AC'::currency_code) $$;

-- ───────────────────────────── Loyalty ─────────────────────────────
CREATE TABLE loyalty_cards (
  slug          VARCHAR(12) PRIMARY KEY,
  name          VARCHAR(24) NOT NULL,
  rank          SMALLINT NOT NULL UNIQUE,
  xp_required   BIGINT NOT NULL CHECK (xp_required >= 0),
  max_bet_ac    NUMERIC(18,2) NOT NULL CHECK (max_bet_ac > 0),
  max_bet_ag    NUMERIC(18,2) NOT NULL CHECK (max_bet_ag > 0),
  unlock_ac     NUMERIC(18,2) CHECK (unlock_ac >= 0),
  unlock_ag     NUMERIC(18,2) CHECK (unlock_ag >= 0),
  color         VARCHAR(9) NOT NULL,
  benefits      JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO loyalty_cards (slug, name, rank, xp_required, max_bet_ac, max_bet_ag, unlock_ac, unlock_ag, color, benefits) VALUES
  ('none', 'No Card', 0, 0, 250000, 10, NULL, NULL, '#64748b', '["Basic profile", "Basic chat tag", "Max bet 250,000 AC / 10 AG"]'),
  ('silver', 'Silver', 1, 5000, 500000, 20, 1500000, 5, '#cbd5e1', '["Silver badge", "Silver chat tag", "Max bet 500,000 AC / 20 AG", "Exclusive Silver emotes", "Extra profile customization"]'),
  ('gold', 'Gold', 2, 25000, 1000000, 50, 1500000, 5, '#facc15', '["Gold badge", "Gold chat tag", "Max bet 1,000,000 AC / 50 AG", "Exclusive Gold emotes", "Gold profile effects"]'),
  ('platinum', 'Platinum', 3, 100000, 2500000, 125, 1500000, 5, '#a5b4fc', '["Platinum badge", "Platinum chat tag", "Max bet 2,500,000 AC / 125 AG", "Exclusive cosmetics", "Advanced profile customization"]'),
  ('infinite', 'Infinite', 4, 350000, 8500000, 350, 1500000, 5, '#3b82f6', '["Infinite badge", "Infinite chat tag", "Max bet 8,500,000 AC / 350 AG", "Exclusive cosmetics", "Special profile effects"]'),
  ('black', 'Black', 5, 1000000, 20000000, 750, 1500000, 5, '#e5c07b', '["Black badge", "Black chat tag", "Max bet 20,000,000 AC / 750 AG", "Exclusive cosmetics", "Unique profile effects", "Highest Loyalty status"]');

ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_xp BIGINT NOT NULL DEFAULT 0 CHECK (loyalty_xp >= 0);
-- Card bought with AC+AG (or granted): the player never drops below it.
ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_floor VARCHAR(12) NOT NULL DEFAULT 'none' REFERENCES loyalty_cards(slug);
-- Owner override (exact card, ignores XP); NULL = automatic.
ALTER TABLE users ADD COLUMN IF NOT EXISTS loyalty_override VARCHAR(12) REFERENCES loyalty_cards(slug);
-- Owner override of the progression role; NULL = automatic from level.
ALTER TABLE users ADD COLUMN IF NOT EXISTS player_role VARCHAR(24);

CREATE TABLE loyalty_xp_log (
  id       BIGSERIAL PRIMARY KEY,
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount   INTEGER NOT NULL,
  source   VARCHAR(24) NOT NULL,
  ref      TEXT,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lxp_user_time_idx ON loyalty_xp_log (user_id, at DESC);

-- ───────────────────────────── Progression roles ─────────────────────────────
CREATE TABLE player_roles (
  slug        VARCHAR(24) PRIMARY KEY CHECK (slug ~ '^[a-z][a-z0-9-]{1,23}$'),
  name        VARCHAR(24) NOT NULL,
  rank        SMALLINT NOT NULL,
  icon        VARCHAR(24) NOT NULL DEFAULT 'sparkles',
  color       VARCHAR(9) NOT NULL,
  min_level   INTEGER NOT NULL DEFAULT 1 CHECK (min_level >= 1),
  benefits    JSONB NOT NULL DEFAULT '{}'::jsonb,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO player_roles (slug, name, rank, icon, color, min_level, benefits) VALUES
  ('newcomer', 'Newcomer', 0, 'sprout', '#94a3b8', 1, '{"dailyBonusPct": 0, "perks": ["Newcomer chat tag", "Starter emotes"]}'),
  ('intermediate', 'Intermediate', 1, 'dice', '#38bdf8', 5, '{"dailyBonusPct": 2, "perks": ["+2% daily reward", "Intermediate chat tag"]}'),
  ('advanced', 'Advanced', 2, 'target', '#34d399', 12, '{"dailyBonusPct": 4, "perks": ["+4% daily reward", "Advanced chat tag"]}'),
  ('expert', 'Expert', 3, 'flame', '#a78bfa', 25, '{"dailyBonusPct": 6, "perks": ["+6% daily reward", "Expert chat tag", "Expert emote"]}'),
  ('veteran', 'Veteran', 4, 'shield', '#f59e0b', 40, '{"dailyBonusPct": 8, "perks": ["+8% daily reward", "Veteran chat tag"]}'),
  ('elite', 'Elite', 5, 'gem', '#f43f5e', 60, '{"dailyBonusPct": 10, "perks": ["+10% daily reward", "Elite chat tag", "Elite emote"]}'),
  ('legendary', 'Legendary', 6, 'crown', '#facc15', 80, '{"dailyBonusPct": 15, "perks": ["+15% daily reward", "Legendary chat tag", "Legendary emote"]}');

-- ───────────────────────────── Shop & inventory ─────────────────────────────
CREATE TABLE shop_items (
  id               VARCHAR(40) PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  category         VARCHAR(20) NOT NULL CHECK (category IN ('boosts', 'emotes', 'profile-effects', 'chat-effects', 'name-effects', 'themes', 'badges', 'cosmetics', 'loyalty', 'limited', 'event')),
  kind             VARCHAR(16) NOT NULL CHECK (kind IN ('boost', 'emote', 'profileEffect', 'chatEffect', 'nameEffect', 'theme', 'badge', 'frame')),
  name             VARCHAR(40) NOT NULL,
  description      VARCHAR(200) NOT NULL DEFAULT '',
  price_ag         NUMERIC(18,2) NOT NULL CHECK (price_ag >= 0),
  rarity           VARCHAR(10) NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  repeatable       BOOLEAN NOT NULL DEFAULT FALSE,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  available_from   TIMESTAMPTZ,
  available_until  TIMESTAMPTZ,
  stock            INTEGER CHECK (stock >= 0),
  requires         JSONB NOT NULL DEFAULT '{}'::jsonb,
  style            JSONB NOT NULL DEFAULT '{}'::jsonb,
  effect           JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort             INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE shop_inventory (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id      VARCHAR(40) NOT NULL REFERENCES shop_items(id),
  qty          INTEGER NOT NULL DEFAULT 1 CHECK (qty >= 0),
  source       VARCHAR(16) NOT NULL DEFAULT 'shop',
  acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE shop_purchases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  item_id     VARCHAR(40) NOT NULL REFERENCES shop_items(id),
  price_ag    NUMERIC(18,2) NOT NULL,
  tx_id       UUID REFERENCES wallet_transactions(id),
  request_id  VARCHAR(64) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, request_id)
);
CREATE INDEX shop_purchases_user_idx ON shop_purchases (user_id, created_at DESC);
CREATE TABLE user_boosts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     VARCHAR(40) NOT NULL REFERENCES shop_items(id),
  type        VARCHAR(8) NOT NULL CHECK (type IN ('xp', 'lxp', 'daily')),
  mult        NUMERIC(6,3) NOT NULL CHECK (mult > 1 AND mult <= 5),
  uses_left   INTEGER,
  starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_boosts_active_idx ON user_boosts (user_id, ends_at);

INSERT INTO shop_items (id, category, kind, name, description, price_ag, rarity, repeatable, requires, style, effect, sort, available_until, stock) VALUES
  ('feeling-lucky', 'boosts', 'boost', 'Feeling Lucky', '+50% XP from every round for 1 hour. Game results are not affected.', 3, 'rare', TRUE, '{}', '{"glyph": "🍀", "color": "#4ade80"}', '{"type": "xp", "mult": 1.5, "minutes": 60}', 1, NULL, NULL),
  ('loyalty-rush', 'boosts', 'boost', 'Loyalty Rush', '+25% Loyalty XP for 1 hour.', 5, 'epic', TRUE, '{}', '{"glyph": "⚡", "color": "#a78bfa"}', '{"type": "lxp", "mult": 1.25, "minutes": 60}', 2, NULL, NULL),
  ('double-daily', 'boosts', 'boost', 'Double Daily', 'Your next daily reward pays out twice.', 4, 'rare', TRUE, '{}', '{"glyph": "🎁", "color": "#facc15"}', '{"type": "daily", "mult": 2, "uses": 1}', 3, NULL, NULL),
  ('emote-skull', 'emotes', 'emote', 'Skull', 'Unlocks the :skull: emote.', 2, 'common', FALSE, '{}', '{}', '{"emote": "skull"}', 10, NULL, NULL),
  ('emote-clown', 'emotes', 'emote', 'Clown', 'Unlocks the :clown: emote.', 3, 'common', FALSE, '{}', '{}', '{"emote": "clown"}', 11, NULL, NULL),
  ('emote-sus', 'emotes', 'emote', 'Sus', 'Unlocks the :sus: emote.', 3, 'common', FALSE, '{}', '{}', '{"emote": "sus"}', 12, NULL, NULL),
  ('emote-moai', 'emotes', 'emote', 'Moai', 'Unlocks the :moai: emote.', 5, 'rare', FALSE, '{}', '{}', '{"emote": "moai"}', 13, NULL, NULL),
  ('emote-rocket', 'emotes', 'emote', 'Rocket', 'Unlocks the animated :rocket: emote.', 8, 'rare', FALSE, '{}', '{}', '{"emote": "rocket"}', 14, NULL, NULL),
  ('emote-crown', 'emotes', 'emote', 'Crown', 'Unlocks the animated :crown: emote.', 15, 'epic', FALSE, '{}', '{}', '{"emote": "crown"}', 15, NULL, NULL),
  ('emote-jackpot', 'emotes', 'emote', 'Jackpot', 'Unlocks the animated :jackpot: emote.', 25, 'legendary', FALSE, '{}', '{}', '{"emote": "jackpot"}', 16, NULL, NULL),
  ('fx-scanline', 'profile-effects', 'profileEffect', 'Scanline', 'A slow neon scan across your profile banner.', 6, 'rare', FALSE, '{}', '{"kind": "scan", "colors": ["#22d3ee", "#0ea5e9"]}', '{}', 20, NULL, NULL),
  ('fx-aurora', 'profile-effects', 'profileEffect', 'Aurora', 'Moving aurora light on your profile banner.', 10, 'epic', FALSE, '{}', '{"kind": "aurora", "colors": ["#22d3ee", "#a855f7", "#34d399"]}', '{}', 21, NULL, NULL),
  ('fx-starfield', 'profile-effects', 'profileEffect', 'Starfield', 'Drifting stars behind your profile.', 15, 'legendary', FALSE, '{}', '{"kind": "stars", "colors": ["#f8fafc", "#facc15"]}', '{}', 22, NULL, NULL),
  ('chat-glow-cyan', 'chat-effects', 'chatEffect', 'Cyan Glow', 'Your chat messages get a soft cyan glow.', 4, 'rare', FALSE, '{}', '{"color": "#22d3ee"}', '{}', 30, NULL, NULL),
  ('chat-glow-gold', 'chat-effects', 'chatEffect', 'Gold Glow', 'Your chat messages get a gold glow.', 8, 'epic', FALSE, '{}', '{"color": "#facc15"}', '{}', 31, NULL, NULL),
  ('chat-ember', 'chat-effects', 'chatEffect', 'Ember', 'A warm animated edge on your chat messages.', 12, 'legendary', FALSE, '{}', '{"color": "#fb7185", "color2": "#f97316", "animated": true}', '{}', 32, NULL, NULL),
  ('name-ocean', 'name-effects', 'nameEffect', 'Ocean Name', 'Your name flows in ocean blues.', 6, 'rare', FALSE, '{}', '{"colors": ["#22d3ee", "#3b82f6", "#a855f7"]}', '{}', 40, NULL, NULL),
  ('name-sunset', 'name-effects', 'nameEffect', 'Sunset Name', 'Your name glows in sunset colors.', 6, 'rare', FALSE, '{}', '{"colors": ["#fb923c", "#f43f5e", "#facc15"]}', '{}', 41, NULL, NULL),
  ('name-gold', 'name-effects', 'nameEffect', 'Gold Name', 'A shimmering gold name.', 12, 'epic', FALSE, '{}', '{"colors": ["#fde68a", "#f59e0b", "#fde68a"]}', '{}', 42, NULL, NULL),
  ('name-prism', 'name-effects', 'nameEffect', 'Prism Name', 'Every color, always moving.', 20, 'legendary', FALSE, '{}', '{"colors": ["#f43f5e", "#facc15", "#4ade80", "#22d3ee", "#a855f7"]}', '{}', 43, NULL, NULL),
  ('theme-midnight', 'themes', 'theme', 'Midnight', 'Deep blue profile theme.', 5, 'common', FALSE, '{}', '{"colors": ["#1e3a8a", "#0f172a"], "accent": "#60a5fa"}', '{}', 50, NULL, NULL),
  ('theme-rose', 'themes', 'theme', 'Neon Rose', 'Hot pink profile theme.', 5, 'common', FALSE, '{}', '{"colors": ["#be185d", "#4c0519"], "accent": "#f472b6"}', '{}', 51, NULL, NULL),
  ('theme-emerald', 'themes', 'theme', 'Emerald', 'Green profile theme.', 5, 'common', FALSE, '{}', '{"colors": ["#047857", "#022c22"], "accent": "#34d399"}', '{}', 52, NULL, NULL),
  ('badge-clover', 'badges', 'badge', 'Lucky Clover', 'A clover badge next to your name.', 4, 'rare', FALSE, '{}', '{"glyph": "☘", "color": "#4ade80"}', '{}', 60, NULL, NULL),
  ('badge-skull', 'badges', 'badge', 'Skull Badge', 'A skull badge next to your name.', 6, 'rare', FALSE, '{}', '{"glyph": "☠", "color": "#e2e8f0"}', '{}', 61, NULL, NULL),
  ('badge-high-roller', 'badges', 'badge', 'High Roller', 'A spade badge for big players.', 8, 'epic', FALSE, '{}', '{"glyph": "♠", "color": "#facc15"}', '{}', 62, NULL, NULL),
  ('frame-ice', 'cosmetics', 'frame', 'Ice Frame', 'Icy blue avatar frame.', 5, 'rare', FALSE, '{}', '{"color": "#7dd3fc"}', '{}', 70, NULL, NULL),
  ('frame-magma', 'cosmetics', 'frame', 'Magma Frame', 'Molten orange avatar frame.', 8, 'epic', FALSE, '{}', '{"color": "#f97316"}', '{}', 71, NULL, NULL),
  ('frame-void', 'cosmetics', 'frame', 'Void Frame', 'Deep violet avatar frame.', 12, 'legendary', FALSE, '{}', '{"color": "#a855f7"}', '{}', 72, NULL, NULL),
  ('frame-gold-card', 'loyalty', 'frame', 'Gold Card Frame', 'Gold avatar frame for Gold card holders and above.', 10, 'epic', FALSE, '{"card": "gold"}', '{"color": "#facc15"}', '{}', 80, NULL, NULL),
  ('name-platinum', 'loyalty', 'nameEffect', 'Platinum Name', 'Silver-blue name for Platinum card holders and above.', 15, 'epic', FALSE, '{"card": "platinum"}', '{"colors": ["#e2e8f0", "#a5b4fc", "#e2e8f0"]}', '{}', 81, NULL, NULL),
  ('fx-black-card', 'loyalty', 'profileEffect', 'Black Card Glow', 'Gold-on-black profile effect for Black card holders.', 30, 'legendary', FALSE, '{"card": "black"}', '{"kind": "aurora", "colors": ["#e5c07b", "#111827", "#e5c07b"]}', '{}', 82, NULL, NULL),
  ('name-glitch', 'limited', 'nameEffect', 'Glitch Name', 'Limited: a glitching neon name. Only 100 available.', 25, 'legendary', FALSE, '{}', '{"colors": ["#22d3ee", "#f43f5e", "#22d3ee"], "glitch": true}', '{}', 90, '2026-12-31T23:59:59+07:00', 100),
  ('emote-pumpkin', 'event', 'emote', 'Pumpkin', 'Halloween event emote.', 4, 'rare', FALSE, '{}', '{}', '{"emote": "pumpkin"}', 95, '2026-11-15T23:59:59+07:00', NULL),
  ('emote-firework', 'event', 'emote', 'Firework', 'New Year event emote.', 4, 'rare', FALSE, '{}', '{}', '{"emote": "firework"}', 96, '2027-01-07T23:59:59+07:00', NULL);

-- Membership cosmetics: not sold (inactive), owned automatically while the membership is active.
INSERT INTO shop_items (id, category, kind, name, description, price_ag, rarity, active, requires, style, sort) VALUES
  ('vip-name', 'name-effects', 'nameEffect', 'VIP Name', 'Gold-violet name for VIP members.', 0, 'epic', FALSE, '{"membership": "vip"}', '{"colors": ["#fde68a", "#c084fc", "#fde68a"]}', 200),
  ('vip-chat', 'chat-effects', 'chatEffect', 'VIP Chat', 'VIP glow on your chat messages.', 0, 'epic', FALSE, '{"membership": "vip"}', '{"color": "#c084fc"}', 201),
  ('vip-theme', 'themes', 'theme', 'VIP Theme', 'VIP profile theme.', 0, 'epic', FALSE, '{"membership": "vip"}', '{"colors": ["#6b21a8", "#1e1b4b"], "accent": "#c084fc"}', 202),
  ('vip-badge', 'badges', 'badge', 'VIP Badge', 'VIP badge next to your name.', 0, 'epic', FALSE, '{"membership": "vip"}', '{"glyph": "✦", "color": "#c084fc"}', 203),
  ('vip-frame', 'cosmetics', 'frame', 'VIP Frame', 'VIP avatar decoration.', 0, 'epic', FALSE, '{"membership": "vip"}', '{"color": "#c084fc"}', 204),
  ('vvip-name', 'name-effects', 'nameEffect', 'VVIP Name', 'Animated diamond name for VVIP members.', 0, 'legendary', FALSE, '{"membership": "vvip"}', '{"colors": ["#67e8f9", "#f0abfc", "#fde68a", "#67e8f9"]}', 210),
  ('vvip-chat', 'chat-effects', 'chatEffect', 'VVIP Chat', 'Animated VVIP edge on your chat messages.', 0, 'legendary', FALSE, '{"membership": "vvip"}', '{"color": "#67e8f9", "color2": "#f0abfc", "animated": true}', 211),
  ('vvip-theme', 'themes', 'theme', 'VVIP Theme', 'VVIP profile theme.', 0, 'legendary', FALSE, '{"membership": "vvip"}', '{"colors": ["#0e7490", "#701a75"], "accent": "#67e8f9"}', 212),
  ('vvip-badge', 'badges', 'badge', 'VVIP Badge', 'VVIP badge next to your name.', 0, 'legendary', FALSE, '{"membership": "vvip"}', '{"glyph": "◆", "color": "#67e8f9"}', 213),
  ('vvip-fx', 'profile-effects', 'profileEffect', 'VVIP Aura', 'Exclusive animated VVIP profile effect.', 0, 'legendary', FALSE, '{"membership": "vvip"}', '{"kind": "aurora", "colors": ["#67e8f9", "#f0abfc", "#fde68a"]}', 214),
  ('vvip-frame', 'cosmetics', 'frame', 'VVIP Frame', 'VVIP avatar decoration.', 0, 'legendary', FALSE, '{"membership": "vvip"}', '{"color": "#67e8f9"}', 215);

-- ───────────────────────────── Emotes ─────────────────────────────
CREATE TABLE emotes (
  code          VARCHAR(12) PRIMARY KEY CHECK (code ~ '^[a-z]{2,12}$'),
  glyph         VARCHAR(16) NOT NULL,
  name          VARCHAR(24) NOT NULL,
  category      VARCHAR(12) NOT NULL CHECK (category IN ('general', 'reactions', 'funny', 'rare', 'loyalty', 'vip', 'vvip', 'events')),
  rarity        VARCHAR(10) NOT NULL DEFAULT 'common' CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  unlock_type   VARCHAR(8) NOT NULL DEFAULT 'free' CHECK (unlock_type IN ('free', 'shop', 'item', 'card', 'vip', 'vvip', 'level', 'role')),
  unlock_value  VARCHAR(40),
  anim          VARCHAR(8) NOT NULL DEFAULT 'none' CHECK (anim IN ('none', 'bounce', 'pulse', 'wiggle', 'spin', 'float', 'shine')),
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort          INTEGER NOT NULL DEFAULT 0
);
INSERT INTO emotes (code, glyph, name, category, rarity, unlock_type, unlock_value, anim, sort) VALUES
  ('gg', 'GG', 'GG', 'general', 'common', 'free', NULL, 'none', 1),
  ('wave', '👋', 'Wave', 'general', 'common', 'free', NULL, 'wiggle', 2),
  ('ok', '👌', 'OK', 'general', 'common', 'free', NULL, 'none', 3),
  ('thumbs', '👍', 'Thumbs Up', 'general', 'common', 'free', NULL, 'bounce', 4),
  ('heart', '❤️', 'Heart', 'general', 'common', 'free', NULL, 'pulse', 5),
  ('clap', '👏', 'Clap', 'general', 'common', 'free', NULL, 'wiggle', 6),
  ('eyes', '👀', 'Eyes', 'general', 'common', 'free', NULL, 'none', 7),
  ('laugh', '😂', 'Laugh', 'reactions', 'common', 'free', NULL, 'bounce', 10),
  ('wow', '😮', 'Wow', 'reactions', 'common', 'free', NULL, 'none', 11),
  ('cry', '😭', 'Cry', 'reactions', 'common', 'free', NULL, 'none', 12),
  ('think', '🤔', 'Think', 'reactions', 'common', 'free', NULL, 'none', 13),
  ('angry', '😤', 'Angry', 'reactions', 'common', 'free', NULL, 'wiggle', 14),
  ('fire', '🔥', 'Fire', 'reactions', 'rare', 'item', 'emote-fire', 'pulse', 15),
  ('gem', '💎', 'Gem', 'reactions', 'rare', 'item', 'emote-gem', 'shine', 16),
  ('salute', '🫡', 'Salute', 'reactions', 'common', 'level', '5', 'none', 17),
  ('skull', '💀', 'Skull', 'funny', 'common', 'shop', 'emote-skull', 'none', 20),
  ('clown', '🤡', 'Clown', 'funny', 'common', 'shop', 'emote-clown', 'bounce', 21),
  ('sus', '🫣', 'Sus', 'funny', 'common', 'shop', 'emote-sus', 'none', 22),
  ('rofl', '🤣', 'ROFL', 'funny', 'rare', 'level', '10', 'spin', 23),
  ('moai', '🗿', 'Moai', 'funny', 'rare', 'shop', 'emote-moai', 'none', 24),
  ('rocket', '🚀', 'Rocket', 'rare', 'rare', 'shop', 'emote-rocket', 'float', 30),
  ('crown', '👑', 'Crown', 'rare', 'epic', 'shop', 'emote-crown', 'shine', 31),
  ('jackpot', '🎰', 'Jackpot', 'rare', 'legendary', 'shop', 'emote-jackpot', 'bounce', 32),
  ('flex', '💪', 'Flex', 'rare', 'epic', 'role', 'expert', 'pulse', 33),
  ('goat', '🐐', 'GOAT', 'rare', 'legendary', 'role', 'legendary', 'bounce', 34),
  ('silver', '🥈', 'Silver', 'loyalty', 'rare', 'card', 'silver', 'shine', 40),
  ('gold', '🥇', 'Gold', 'loyalty', 'epic', 'card', 'gold', 'shine', 41),
  ('plat', '💠', 'Platinum', 'loyalty', 'epic', 'card', 'platinum', 'spin', 42),
  ('infinite', '♾️', 'Infinite', 'loyalty', 'legendary', 'card', 'infinite', 'pulse', 43),
  ('blackcard', '🖤', 'Black Card', 'loyalty', 'legendary', 'card', 'black', 'pulse', 44),
  ('vip', '✨', 'VIP', 'vip', 'epic', 'vip', NULL, 'shine', 50),
  ('cheers', '🍾', 'Cheers', 'vip', 'epic', 'vip', NULL, 'wiggle', 51),
  ('vvip', '💫', 'VVIP', 'vvip', 'legendary', 'vvip', NULL, 'spin', 60),
  ('yacht', '🛥️', 'Yacht', 'vvip', 'legendary', 'vvip', NULL, 'float', 61),
  ('pumpkin', '🎃', 'Pumpkin', 'events', 'rare', 'shop', 'emote-pumpkin', 'wiggle', 70),
  ('firework', '🎆', 'Firework', 'events', 'rare', 'shop', 'emote-firework', 'pulse', 71);

-- ───────────────────────────── Memberships (VIP / VVIP) ─────────────────────────────
-- Payment isn't connected: the Owner activates a membership after confirming payment.
CREATE TABLE memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier          VARCHAR(4) NOT NULL CHECK (tier IN ('vip', 'vvip')),
  starts_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at       TIMESTAMPTZ,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  activated_by  UUID REFERENCES users(id),
  note          VARCHAR(200),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_membership_idx ON memberships (user_id) WHERE active;
INSERT INTO neon_kv (key, value) VALUES ('memberships', '{
  "vip": {"price": 149999, "days": 30, "benefits": ["VIP badge", "VIP profile theme", "VIP emotes", "VIP chat effect", "VIP name effect", "VIP profile decoration", "VIP music theme"]},
  "vvip": {"price": 499999, "days": 30, "benefits": ["VVIP badge", "VVIP profile theme", "VVIP emotes", "VIP emotes included", "VVIP chat effect", "VVIP name effect", "VVIP profile effects", "VVIP music themes", "Exclusive animations"]}
}') ON CONFLICT (key) DO NOTHING;

-- ───────────────────────────── Reward missions ─────────────────────────────
CREATE TABLE reward_missions (
  id              VARCHAR(40) PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  title           VARCHAR(60) NOT NULL,
  description     VARCHAR(300) NOT NULL DEFAULT '',
  game_name       VARCHAR(60),
  link            VARCHAR(300),
  reward_ac       NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (reward_ac >= 0),
  reward_ag       NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (reward_ag >= 0),
  reward_lxp      INTEGER NOT NULL DEFAULT 0 CHECK (reward_lxp >= 0),
  repeatable      BOOLEAN NOT NULL DEFAULT FALSE,
  cooldown_hours  INTEGER NOT NULL DEFAULT 24 CHECK (cooldown_hours >= 0),
  max_claims      INTEGER CHECK (max_claims > 0),
  verification    VARCHAR(8) NOT NULL DEFAULT 'manual' CHECK (verification IN ('manual')),
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort            INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE reward_claims (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id   VARCHAR(40) NOT NULL REFERENCES reward_missions(id),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(9) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  proof        VARCHAR(80) NOT NULL,
  review_note  VARCHAR(200),
  reviewed_by  UUID REFERENCES users(id),
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_pending_claim_idx ON reward_claims (mission_id, user_id) WHERE status = 'pending';
CREATE INDEX reward_claims_queue_idx ON reward_claims (status, created_at);
INSERT INTO reward_missions (id, title, description, game_name, link, reward_ac, reward_ag, reward_lxp, repeatable, sort) VALUES
  ('roblox-merge-inc', 'Play my games on Roblox', 'Play Merge Inc. on Roblox, then send your Roblox username. The Owner checks it and approves your reward.',
   'Merge Inc.', 'https://www.roblox.com/games/87122632491799/Merge-Inc', 25000, 2, 500, FALSE, 1);

-- ───────────────────────────── Permissions ─────────────────────────────
INSERT INTO role_permissions (role, permission) VALUES
  ('super_admin', 'economy.manage'), ('super_admin', 'loyalty.manage'), ('super_admin', 'playerroles.manage'),
  ('super_admin', 'shop.manage'), ('super_admin', 'emotes.manage'), ('super_admin', 'rewards.manage'),
  ('super_admin', 'memberships.manage'), ('super_admin', 'moderation.config'),
  ('admin', 'shop.manage'), ('admin', 'emotes.manage'), ('admin', 'rewards.manage'), ('admin', 'moderation.config')
ON CONFLICT DO NOTHING;
