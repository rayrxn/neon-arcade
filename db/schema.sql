-- Neon Arcade — skema database untuk backend produksi (PostgreSQL 15+).
-- Mode lokal di browser memakai struktur yang sama (lihat src/store & src/services).
-- Aturan penting dijaga oleh constraint, bukan hanya kode aplikasi:
--   * saldo tidak pernah negatif                    → CHECK
--   * transaksi tidak pernah dobel                  → UNIQUE (user_id, idempotency_key)
--   * milestone level tidak pernah dibayar dua kali → UNIQUE (user_id, milestone_type, milestone_level)
--   * satu transaksi hanya bisa di-reverse sekali   → UNIQUE (reversal_of)
--   * audit log tidak bisa diubah/dihapus           → trigger + REVOKE
-- AC/AG adalah mata uang virtual tanpa nilai uang; tidak ada cash-out.

-- Extension pgcrypto & citext (atau penggantinya) dipasang lewat compat.sql.

CREATE TYPE user_role       AS ENUM ('super_admin', 'admin', 'moderator', 'support', 'developer', 'user');
CREATE TYPE account_status  AS ENUM ('active', 'frozen', 'banned');
CREATE TYPE currency_code   AS ENUM ('AC', 'AG');
CREATE TYPE tx_status       AS ENUM ('success', 'pending', 'failed');
CREATE TYPE tx_category     AS ENUM ('game', 'daily', 'quest', 'level', 'achievement', 'redeem', 'admin', 'system', 'reversal', 'refund', 'transfer', 'other');
CREATE TYPE session_status  AS ENUM ('OPEN', 'WON', 'LOST', 'DRAW', 'CANCELLED', 'INVALID');
CREATE TYPE report_status   AS ENUM ('new', 'investigating', 'escalated', 'resolved', 'dismissed');
CREATE TYPE ticket_status   AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED');
CREATE TYPE service_status  AS ENUM ('OPERATIONAL', 'DEGRADED', 'MAINTENANCE', 'OUTAGE');
CREATE TYPE flag_risk       AS ENUM ('low', 'medium', 'high', 'critical');

-- ───────────────────────────── Users & auth ─────────────────────────────
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username       CITEXT NOT NULL UNIQUE CHECK (username::text COLLATE "C" ~ '^[A-Za-z0-9_]{3,16}$'),
  display_name   VARCHAR(24) NOT NULL,
  email          CITEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,                      -- argon2id/bcrypt di server (lokal: PBKDF2-SHA256)
  role           user_role NOT NULL DEFAULT 'user',
  status         account_status NOT NULL DEFAULT 'active',
  ban_until      TIMESTAMPTZ,                        -- NULL + status banned = permanen
  ban_reason     TEXT,
  wallet_frozen  BOOLEAN NOT NULL DEFAULT FALSE,
  muted_until    TIMESTAMPTZ,
  is_test        BOOLEAN NOT NULL DEFAULT FALSE,     -- akun test: terisolasi dari statistik, leaderboard, hadiah
  test_control   VARCHAR(8) NOT NULL DEFAULT 'off' CHECK (test_control IN ('off', 'win', 'loss')),
  avatar         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at  TIMESTAMPTZ,
  CHECK (test_control = 'off' OR is_test)            -- hasil paksa hanya untuk akun test
);
CREATE INDEX users_status_idx ON users (status);
CREATE INDEX users_role_idx ON users (role) WHERE role <> 'user';

CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  csrf_token  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  ip          INET,
  user_agent  TEXT
);
CREATE INDEX sessions_user_idx ON sessions (user_id, expires_at);

CREATE TABLE login_attempts (
  id         BIGSERIAL PRIMARY KEY,
  email      CITEXT NOT NULL,
  ok         BOOLEAN NOT NULL,
  ip         INET,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX login_attempts_email_idx ON login_attempts (email, at DESC);

-- ───────────────────────────── Wallet ─────────────────────────────
CREATE TABLE wallets (
  user_id     UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  ac_balance  NUMERIC(18,2) NOT NULL DEFAULT 10000 CHECK (ac_balance >= 0),
  ag_balance  NUMERIC(18,2) NOT NULL DEFAULT 1 CHECK (ag_balance >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  currency         currency_code NOT NULL,
  amount           NUMERIC(18,2) NOT NULL CHECK (amount <> 0),
  balance_before   NUMERIC(18,2) NOT NULL,
  balance_after    NUMERIC(18,2) NOT NULL CHECK (balance_after >= 0),
  type             VARCHAR(16) NOT NULL,             -- bet | win | reward | adjust | reversal | send | receive | redeem | ...
  category         tx_category NOT NULL,
  source           VARCHAR(24),
  reason           TEXT,
  status           tx_status NOT NULL DEFAULT 'success',
  session_id       UUID,                             -- FK ditambahkan setelah game_sessions
  admin_id         UUID REFERENCES users(id),
  reversal_of      UUID UNIQUE REFERENCES wallet_transactions(id),   -- satu reversal per transaksi
  idempotency_key  VARCHAR(120) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key),
  CHECK (balance_after = balance_before + amount OR status <> 'success'),
  CHECK ((type = 'reversal') = (reversal_of IS NOT NULL)),
  CHECK (category <> 'admin' OR admin_id IS NOT NULL)
);
CREATE INDEX wtx_user_time_idx ON wallet_transactions (user_id, created_at DESC);
CREATE INDEX wtx_category_idx ON wallet_transactions (user_id, category);
CREATE INDEX wtx_session_idx ON wallet_transactions (session_id);

-- Riwayat transaksi tidak boleh ditimpa: hanya kolom status (pending → success/failed) yang boleh berubah.
CREATE FUNCTION wtx_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'wallet_transactions are append-only'; END IF;
  IF NEW.amount <> OLD.amount OR NEW.currency <> OLD.currency OR NEW.user_id <> OLD.user_id OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'wallet transaction history cannot be overwritten — create a REVERSAL instead';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER wtx_immutable BEFORE UPDATE OR DELETE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION wtx_immutable();

-- ───────────────────────────── Games ─────────────────────────────
CREATE TABLE games (
  slug      VARCHAR(32) PRIMARY KEY,
  name      VARCHAR(48) NOT NULL,
  category  VARCHAR(16) NOT NULL,
  status    VARCHAR(12) NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'maintenance', 'disabled')),
  max_bet   INTEGER NOT NULL DEFAULT 100000 CHECK (max_bet BETWEEN 10 AND 100000),
  max_multiplier NUMERIC(14,2) NOT NULL
);

CREATE TABLE fairness_seeds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id),
  server_seed       TEXT NOT NULL,                   -- rahasia sampai dirotasi
  server_seed_hash  TEXT NOT NULL,
  client_seed       TEXT NOT NULL,
  nonce             INTEGER NOT NULL DEFAULT 0,
  revealed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fairness_active_idx ON fairness_seeds (user_id) WHERE revealed_at IS NULL;

CREATE TABLE game_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  game            VARCHAR(32) NOT NULL REFERENCES games(slug),
  bet             NUMERIC(18,2) NOT NULL CHECK (bet > 0),
  payout          NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (payout >= 0),
  multiplier      NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (multiplier >= 0),
  status          session_status NOT NULL DEFAULT 'OPEN',
  verification    VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (verification IN ('pending', 'verified', 'rejected')),
  seed_id         UUID NOT NULL REFERENCES fairness_seeds(id),
  nonce           INTEGER NOT NULL,
  state           JSONB NOT NULL DEFAULT '{}'::jsonb, -- state server (crash point, posisi mines, deck) — tidak pernah dikirim ke client sebelum selesai
  detail          JSONB NOT NULL DEFAULT '{}'::jsonb,
  xp              INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  is_test         BOOLEAN NOT NULL DEFAULT FALSE,
  bet_tx_id       UUID UNIQUE REFERENCES wallet_transactions(id),
  payout_tx_id    UUID UNIQUE REFERENCES wallet_transactions(id),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  UNIQUE (seed_id, nonce),                               -- satu nonce = satu ronde (anti replay)
  CHECK (status = 'OPEN' OR finished_at IS NOT NULL),
  CHECK (NOT is_test OR payout_tx_id IS NULL)            -- sesi test tidak menyentuh wallet
);
CREATE UNIQUE INDEX one_open_round_idx ON game_sessions (user_id, game) WHERE status = 'OPEN';
CREATE INDEX sessions_user_time_idx ON game_sessions (user_id, started_at DESC);
CREATE INDEX sessions_game_time_idx ON game_sessions (game, started_at DESC) WHERE NOT is_test;
ALTER TABLE wallet_transactions ADD CONSTRAINT wtx_session_fk FOREIGN KEY (session_id) REFERENCES game_sessions(id);

CREATE TABLE session_invalidations (
  session_id      UUID PRIMARY KEY REFERENCES game_sessions(id),
  original_result JSONB NOT NULL,
  violation       VARCHAR(32) NOT NULL,
  reversal_tx_id  UUID REFERENCES wallet_transactions(id),
  admin_id        UUID NOT NULL REFERENCES users(id),
  reason          TEXT NOT NULL,
  at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────── Progression ─────────────────────────────
CREATE TABLE user_progress (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  xp              BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),   -- XP seumur hidup, dihitung server
  level           INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
  games           INTEGER NOT NULL DEFAULT 0,
  wins            INTEGER NOT NULL DEFAULT 0,
  losses          INTEGER NOT NULL DEFAULT 0,
  pushes          INTEGER NOT NULL DEFAULT 0,
  wagered         NUMERIC(18,2) NOT NULL DEFAULT 0,
  best_multiplier NUMERIC(14,4) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE level_history (
  id        BIGSERIAL PRIMARY KEY,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level     INTEGER NOT NULL,
  xp        BIGINT NOT NULL,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, level)
);

CREATE TABLE level_milestones (
  id               BIGSERIAL PRIMARY KEY,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  milestone_type   VARCHAR(8) NOT NULL CHECK (milestone_type IN ('L15', 'L50')),
  milestone_level  INTEGER NOT NULL CHECK (milestone_level > 0),
  reward_id        UUID NOT NULL UNIQUE REFERENCES wallet_transactions(id),
  claimed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, milestone_type, milestone_level),      -- tidak pernah dibayar dua kali
  CHECK ((milestone_type = 'L15' AND milestone_level % 15 = 0) OR (milestone_type = 'L50' AND milestone_level % 50 = 0))
);

CREATE TABLE daily_claims (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_day   DATE NOT NULL,
  streak_day  SMALLINT NOT NULL CHECK (streak_day BETWEEN 1 AND 7),
  streak      INTEGER NOT NULL,
  claimed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, claim_day)
);

CREATE TABLE quest_progress (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope       VARCHAR(8) NOT NULL CHECK (scope IN ('daily', 'weekly')),
  period      DATE NOT NULL,
  quest_id    VARCHAR(24) NOT NULL,
  progress    NUMERIC(18,2) NOT NULL DEFAULT 0,
  target      NUMERIC(18,2) NOT NULL,
  claimed_at  TIMESTAMPTZ,
  reward_tx   UUID REFERENCES wallet_transactions(id),
  expires_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, scope, period, quest_id)
);

CREATE TABLE user_achievements (
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id  VARCHAR(32) NOT NULL,
  unlocked_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE seasons (
  id          SERIAL PRIMARY KEY,
  start_at    TIMESTAMPTZ NOT NULL,
  end_at      TIMESTAMPTZ NOT NULL CHECK (end_at > start_at),
  ended_at    TIMESTAMPTZ,
  frozen      BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX one_active_season_idx ON seasons ((ended_at IS NULL)) WHERE ended_at IS NULL;

CREATE TABLE season_progress (
  season_id      INTEGER NOT NULL REFERENCES seasons(id),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  season_xp      BIGINT NOT NULL DEFAULT 0,
  tiers_claimed  SMALLINT[] NOT NULL DEFAULT '{}',
  final_rank     INTEGER,
  PRIMARY KEY (season_id, user_id)
);
CREATE INDEX season_rank_idx ON season_progress (season_id, season_xp DESC);

-- ───────────────────────────── Cosmetics & social ─────────────────────────────
CREATE TABLE items (
  id      VARCHAR(32) PRIMARY KEY,
  kind    VARCHAR(12) NOT NULL CHECK (kind IN ('avatar', 'frame', 'badge', 'title', 'chatBadge', 'banner', 'emote')),
  source  VARCHAR(16) NOT NULL,
  is_free BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE TABLE user_items (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id     VARCHAR(32) NOT NULL REFERENCES items(id),
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      VARCHAR(16) NOT NULL,
  PRIMARY KEY (user_id, item_id)
);
CREATE TABLE user_equipped (
  user_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot     VARCHAR(12) NOT NULL,                     -- avatar | frame | title | chatBadge | banner | badge1..3
  item_id  VARCHAR(32) NOT NULL,
  PRIMARY KEY (user_id, slot),
  FOREIGN KEY (user_id, item_id) REFERENCES user_items(user_id, item_id) ON DELETE CASCADE   -- hanya item yang dimiliki
);

CREATE TABLE friendships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(8) NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at  TIMESTAMPTZ,
  CHECK (requester_id <> addressee_id)
);
CREATE UNIQUE INDEX friendship_pair_idx ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));

CREATE TABLE user_blocks (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id),
  CHECK (user_id <> blocked_id)
);

CREATE TABLE favorites (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game       VARCHAR(32) NOT NULL REFERENCES games(slug),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game)
);
CREATE INDEX favorites_game_idx ON favorites (game);

CREATE TABLE chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id),
  type        VARCHAR(8) NOT NULL DEFAULT 'user',
  body        VARCHAR(200) NOT NULL,
  flagged     BOOLEAN NOT NULL DEFAULT FALSE,
  badge       VARCHAR(32) REFERENCES items(id),
  deleted_by  UUID REFERENCES users(id),
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX chat_time_idx ON chat_messages (created_at DESC);

CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       VARCHAR(24) NOT NULL,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

-- ───────────────────────────── Moderation, support, audit ─────────────────────────────
CREATE TABLE user_warnings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  admin_id    UUID NOT NULL REFERENCES users(id),
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at  TIMESTAMPTZ,
  removed_by  UUID REFERENCES users(id)
);
CREATE INDEX warnings_user_idx ON user_warnings (user_id) WHERE removed_at IS NULL;

CREATE TABLE cheat_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  type        VARCHAR(32) NOT NULL,
  risk        flag_risk NOT NULL,
  session_id  UUID REFERENCES game_sessions(id),
  expected    TEXT,
  submitted   TEXT,
  evidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurrences INTEGER NOT NULL DEFAULT 1,
  status      VARCHAR(12) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'confirmed', 'dismissed')),
  reviewed_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX flags_open_idx ON cheat_flags (user_id) WHERE status = 'open';

CREATE TABLE reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     UUID REFERENCES users(id),        -- NULL = sistem anti-cheat
  target_type     VARCHAR(12) NOT NULL CHECK (target_type IN ('player', 'message', 'profile', 'game', 'technical', 'other')),
  target_user_id  UUID REFERENCES users(id),
  message_id      UUID REFERENCES chat_messages(id),
  session_id      UUID REFERENCES game_sessions(id),
  flag_id         UUID REFERENCES cheat_flags(id),
  reason          VARCHAR(16) NOT NULL,
  description     VARCHAR(1000) NOT NULL CHECK (char_length(description) >= 10),
  evidence        JSONB NOT NULL DEFAULT '{}'::jsonb,   -- salinan bukti saat report dibuat
  status          report_status NOT NULL DEFAULT 'new',
  priority        VARCHAR(8) NOT NULL DEFAULT 'normal',
  assignee_id     UUID REFERENCES users(id),
  resolution      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  CHECK (reporter_id IS NULL OR reporter_id <> target_user_id)
);
-- Report ganda yang masih terbuka ditolak.
CREATE UNIQUE INDEX report_open_dup_idx ON reports (reporter_id, target_type, COALESCE(target_user_id, '00000000-0000-0000-0000-000000000000'), COALESCE(message_id, '00000000-0000-0000-0000-000000000000'), COALESCE(session_id, '00000000-0000-0000-0000-000000000000'))
  WHERE status IN ('new', 'investigating', 'escalated') AND reporter_id IS NOT NULL;
CREATE INDEX reports_queue_idx ON reports (status, created_at DESC);

CREATE TABLE report_events (
  id         BIGSERIAL PRIMARY KEY,
  report_id  UUID NOT NULL REFERENCES reports(id),
  admin_id   UUID REFERENCES users(id),
  action     VARCHAR(16) NOT NULL,                  -- created | investigate | assign | note | resolve | dismiss | escalate | reopen
  note       TEXT,
  internal   BOOLEAN NOT NULL DEFAULT TRUE,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE support_tickets (
  id           VARCHAR(12) PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id),
  category     VARCHAR(12) NOT NULL,
  subject      VARCHAR(80) NOT NULL,
  status       ticket_status NOT NULL DEFAULT 'OPEN',
  assignee_id  UUID REFERENCES users(id),
  session_id   UUID REFERENCES game_sessions(id),
  tx_id        UUID REFERENCES wallet_transactions(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX tickets_queue_idx ON support_tickets (status, updated_at DESC);
CREATE TABLE ticket_messages (
  id         BIGSERIAL PRIMARY KEY,
  ticket_id  VARCHAR(12) NOT NULL REFERENCES support_tickets(id),
  author_id  UUID NOT NULL REFERENCES users(id),
  body       VARCHAR(2000) NOT NULL,
  is_staff   BOOLEAN NOT NULL DEFAULT FALSE,
  internal   BOOLEAN NOT NULL DEFAULT FALSE,         -- catatan internal tidak pernah dikirim ke user
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE admin_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  code         VARCHAR(48) NOT NULL,                 -- ADMIN_BAN, ADMIN_AC_ADJUSTMENT, ADMIN_REVERSE_TRANSACTION, ...
  admin_id     UUID NOT NULL REFERENCES users(id),
  admin_role   user_role NOT NULL,
  action       VARCHAR(48) NOT NULL,
  target_user  UUID REFERENCES users(id),
  target_label TEXT,
  entity_id    TEXT,
  previous     JSONB,
  next         JSONB,
  reason       TEXT NOT NULL CHECK (char_length(reason) >= 2),
  ip           INET,
  user_agent   TEXT,
  at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_admin_idx ON admin_audit_log (admin_id, at DESC);
CREATE INDEX audit_target_idx ON admin_audit_log (target_user, at DESC);
CREATE INDEX audit_code_idx ON admin_audit_log (code, at DESC);

CREATE FUNCTION audit_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'admin_audit_log is append-only'; END $$;
CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE ON admin_audit_log FOR EACH ROW EXECUTE FUNCTION audit_append_only();
REVOKE UPDATE, DELETE, TRUNCATE ON admin_audit_log FROM PUBLIC;

CREATE TABLE events (
  id       BIGSERIAL PRIMARY KEY,
  type     VARCHAR(32) NOT NULL,                     -- USER_REGISTERED, GAME_STARTED, LEVEL_UP, REPORT_RESOLVED, ...
  user_id  UUID REFERENCES users(id),
  data     JSONB NOT NULL DEFAULT '{}'::jsonb,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX events_type_time_idx ON events (type, at DESC);
CREATE INDEX events_user_idx ON events (user_id, at DESC);

CREATE TABLE error_log (
  id       BIGSERIAL PRIMARY KEY,
  context  VARCHAR(64) NOT NULL,
  code     VARCHAR(64),
  message  TEXT NOT NULL,
  stack    TEXT,
  user_id  UUID REFERENCES users(id),
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────── System ─────────────────────────────
CREATE TABLE system_settings (
  id                    SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  maintenance_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  maintenance_message   VARCHAR(300),
  maintenance_until     TIMESTAMPTZ,
  auto_freeze_critical  BOOLEAN NOT NULL DEFAULT FALSE,
  chat_slow_mode_sec    SMALLINT NOT NULL DEFAULT 0 CHECK (chat_slow_mode_sec BETWEEN 0 AND 300)
);
CREATE TABLE service_status_overrides (
  service    VARCHAR(16) PRIMARY KEY CHECK (service IN ('website', 'api', 'database', 'auth', 'games', 'chat', 'notifications')),
  status     service_status NOT NULL,
  note       VARCHAR(200),
  admin_id   UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE redeem_codes (
  code        VARCHAR(16) PRIMARY KEY CHECK (code ~ '^[A-Z0-9]{4,16}$'),
  rewards     JSONB NOT NULL,
  max_uses    INTEGER CHECK (max_uses > 0),
  per_user    SMALLINT NOT NULL DEFAULT 1 CHECK (per_user BETWEEN 1 AND 10),
  expires_at  TIMESTAMPTZ,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES users(id)
);
CREATE TABLE redeem_uses (
  id      BIGSERIAL PRIMARY KEY,
  code    VARCHAR(16) NOT NULL REFERENCES redeem_codes(code),
  user_id UUID NOT NULL REFERENCES users(id),
  tx_id   UUID REFERENCES wallet_transactions(id),
  at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX redeem_uses_idx ON redeem_uses (code, user_id);

CREATE TABLE announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      VARCHAR(80) NOT NULL,
  message    VARCHAR(400) NOT NULL,
  type       VARCHAR(12) NOT NULL CHECK (type IN ('info', 'event', 'update', 'maintenance')),
  start_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_at     TIMESTAMPTZ,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES users(id)
);

-- Leaderboard: view tanpa akun test / ter-ban.
CREATE VIEW leaderboard_global AS
  SELECT u.id, u.username, p.level, p.xp, p.games, p.wins,
         (SELECT count(*) FROM user_achievements a WHERE a.user_id = u.id) AS achievements
  FROM users u JOIN user_progress p ON p.user_id = u.id
  WHERE NOT u.is_test AND u.status <> 'banned';
