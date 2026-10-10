-- v2.0 core: unified bet limits, game controls, scheduled maintenance with bypass, ban details,
-- security event severity, ticket lifecycle, targeted announcements, feature flags, owner console.

-- ── Games: one bet-limit model, betting / new-session switches, scheduled per-game maintenance ──
ALTER TABLE games DROP CONSTRAINT IF EXISTS games_max_bet_check;
ALTER TABLE games ADD CONSTRAINT games_max_bet_check CHECK (max_bet BETWEEN 10 AND 2000000000);
-- The old default (20M AC) silently capped bets far below what loyalty cards allowed.
UPDATE games SET max_bet = 1500000000 WHERE max_bet IN (20000000, 100000000);
ALTER TABLE games ALTER COLUMN max_bet SET DEFAULT 1500000000;
ALTER TABLE games ADD COLUMN IF NOT EXISTS max_bet_ag INTEGER NOT NULL DEFAULT 100000 CHECK (max_bet_ag BETWEEN 1 AND 10000000);
ALTER TABLE games ADD COLUMN IF NOT EXISTS betting_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS new_sessions BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS maintenance_message VARCHAR(300);
ALTER TABLE games ADD COLUMN IF NOT EXISTS maintenance_from TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS maintenance_until TIMESTAMPTZ;
ALTER TABLE games ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── Global maintenance: schedule start, admin / tester bypass switches ──
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS maintenance_starts_at TIMESTAMPTZ;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS maintenance_bypass_admins BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE system_settings ADD COLUMN IF NOT EXISTS maintenance_bypass_testers BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION maintenance_blocks(p_role user_role) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT s.maintenance_enabled
     AND (s.maintenance_starts_at IS NULL OR s.maintenance_starts_at <= now())
     AND (s.maintenance_until IS NULL OR s.maintenance_until > now())
     AND NOT (p_role IN ('super_admin', 'admin', 'moderator', 'support') AND s.maintenance_bypass_admins)
     AND NOT (p_role = 'developer' AND s.maintenance_bypass_testers)
  FROM system_settings s WHERE s.id = 1 $$;

-- Per-game maintenance (status or scheduled window). Staff may still test the game; OFF is off for everyone.
CREATE OR REPLACE FUNCTION game_blocked(g games, p_role user_role) RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN g.status = 'disabled' THEN 'play.errors.gameOff'
    WHEN (g.status = 'maintenance' OR (g.maintenance_from IS NOT NULL AND g.maintenance_from <= now() AND (g.maintenance_until IS NULL OR g.maintenance_until > now())))
         AND p_role = 'user' THEN 'play.errors.gameMaintenance'
    WHEN NOT g.betting_enabled THEN 'play.errors.bettingOff'
    WHEN NOT g.new_sessions THEN 'play.errors.newSessionsOff'
  END $$;

CREATE OR REPLACE FUNCTION game_start(p_user UUID, p_game TEXT, p_bet NUMERIC, p_currency currency_code) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE u users; g games; s fairness_seeds; sid UUID; tx UUID; block TEXT;
BEGIN
  SELECT * INTO u FROM users WHERE id = p_user;
  block := account_block(p_user);
  IF block IS NOT NULL THEN PERFORM api_error(block); END IF;
  IF u.wallet_frozen THEN PERFORM api_error('errors.walletFrozen'); END IF;
  IF maintenance_blocks(u.role) THEN PERFORM api_error('errors.maintenance'); END IF;
  SELECT * INTO g FROM games WHERE slug = p_game;
  IF NOT FOUND THEN PERFORM api_error('play.errors.gameOff'); END IF;
  block := game_blocked(g, u.role);
  IF block IS NOT NULL THEN PERFORM api_error(block); END IF;
  IF p_bet <> trunc(p_bet) THEN PERFORM api_error('play.errors.wholeBet'); END IF;
  IF p_bet < 1 THEN PERFORM api_error('play.errors.minBet'); END IF;
  IF p_currency = 'AC' AND p_bet > g.max_bet THEN PERFORM api_error('play.errors.maxBet'); END IF;
  IF p_currency = 'AG' AND p_bet > g.max_bet_ag THEN PERFORM api_error('play.errors.maxBet'); END IF;
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

-- ── Bans: when and by whom (shown on the banned screen) ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_by UUID REFERENCES users(id);

-- ── Security events: severity, confidence, reason, review workflow ──
ALTER TABLE cheat_flags ADD COLUMN IF NOT EXISTS severity VARCHAR(8) NOT NULL DEFAULT 'medium'
  CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical'));
ALTER TABLE cheat_flags ADD COLUMN IF NOT EXISTS confidence SMALLINT NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100);
ALTER TABLE cheat_flags ADD COLUMN IF NOT EXISTS reason TEXT;
ALTER TABLE cheat_flags ADD COLUMN IF NOT EXISTS review_note VARCHAR(300);
ALTER TABLE cheat_flags ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE cheat_flags DROP CONSTRAINT IF EXISTS cheat_flags_status_check;
ALTER TABLE cheat_flags ALTER COLUMN status TYPE VARCHAR(16);
ALTER TABLE cheat_flags ADD CONSTRAINT cheat_flags_status_check CHECK (status IN ('open', 'reviewing', 'confirmed', 'dismissed', 'false_positive', 'escalated'));
UPDATE cheat_flags SET severity = risk::text WHERE severity = 'medium' AND risk::text <> 'medium';
-- Rapid clicking is normal play; it used to be "medium". It is now information only.
UPDATE cheat_flags SET severity = 'info', confidence = 20 WHERE type = 'rapidRequests' AND status = 'open';

-- ── Tickets: claim, priority, escalation ──
ALTER TYPE ticket_status ADD VALUE IF NOT EXISTS 'CLAIMED' AFTER 'OPEN';
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(8) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS escalated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_by_user BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Announcements: target group, priority, sound, schedule (start_at), longer message ──
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS target VARCHAR(16) NOT NULL DEFAULT 'all'
  CHECK (target IN ('all', 'here', 'vip', 'vvip', 'members', 'tester', 'moderator', 'staff'));
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS priority VARCHAR(8) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS sound BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE announcements ALTER COLUMN message TYPE VARCHAR(1000);

-- ── Feature flags ──
CREATE TABLE IF NOT EXISTS feature_flags (
  key          VARCHAR(32) PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9-]{1,31}$'),
  state        VARCHAR(8) NOT NULL DEFAULT 'public' CHECK (state IN ('off', 'tester', 'vip', 'public')),
  label        VARCHAR(60) NOT NULL,
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Owner console: sessions (token hash only) and its own audit trail ──
CREATE TABLE IF NOT EXISTS console_sessions (
  id          CHAR(64) PRIMARY KEY,
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS console_audit (
  id         BIGSERIAL PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  session    CHAR(12),
  ip         INET,
  command    VARCHAR(500) NOT NULL,
  ok         BOOLEAN NOT NULL,
  result     TEXT
);
CREATE INDEX IF NOT EXISTS console_audit_time_idx ON console_audit (at DESC);
CREATE INDEX IF NOT EXISTS console_audit_ip_idx ON console_audit (ip, at DESC);

-- ── Permissions for the new actions ──
INSERT INTO role_permissions (role, permission) VALUES
  ('super_admin', 'sessions.terminate'), ('admin', 'sessions.terminate'),
  ('super_admin', 'security.review'), ('admin', 'security.review'), ('moderator', 'security.review'),
  ('super_admin', 'features.manage'),
  ('super_admin', 'maintenance.manage'), ('admin', 'maintenance.manage'),
  ('super_admin', 'errors.view'), ('admin', 'errors.view'), ('developer', 'errors.view'),
  ('super_admin', 'qa.run'), ('admin', 'qa.run'), ('developer', 'qa.run')
ON CONFLICT DO NOTHING;

-- ── Flag policy: each detection type has a severity and confidence. Only strong, high-severity signals
--    open a moderation report, notify the player or auto-freeze. Weak signals stay in the review queue. ──
CREATE OR REPLACE FUNCTION flag_policy(p_type TEXT, p_risk flag_risk, OUT severity TEXT, OUT confidence SMALLINT, OUT reason TEXT) LANGUAGE sql IMMUTABLE AS $$
  SELECT x.s, x.c::smallint, x.r FROM (VALUES
    ('rapidRequests', 'info', 20, 'Many rounds per second. Fast clicking is normal; only a sign of automation when sustained.'),
    ('duplicateSubmission', 'low', 30, 'The same round was submitted twice (double click, retry or reconnect). The second one was ignored.'),
    ('modifiedState', 'low', 40, 'A move referenced a tile that was already revealed. Usually a laggy double tap.'),
    ('impossibleDuration', 'low', 35, 'Several actions in a very short time. Can be fast play.'),
    ('suspiciousPattern', 'low', 30, 'Long win streak. Expected with low-risk settings; worth a look only with high multipliers.'),
    ('abnormalReward', 'info', 10, 'Very large payout. Results come from the server''s provably fair RNG, so this is not cheating by itself.'),
    ('replay', 'medium', 55, 'A request referenced a round that is no longer open.'),
    ('abnormalCurrency', 'medium', 50, 'Large net gain over recent rounds. Review together with the session history.'),
    ('impossibleXp', 'high', 80, 'XP above what one round can give.'),
    ('invalidState', 'critical', 90, 'A settlement asked for a multiplier above the game maximum. The settlement was refused.'),
    ('economyAnomaly', 'medium', 60, 'Balance change outside the normal pattern for this account.'),
    ('duplicateReward', 'high', 75, 'The same reward was requested again for a period that was already paid.')
  ) AS x(t, s, c, r) WHERE x.t = p_type
  UNION ALL
  SELECT p_risk::text, 60::smallint, 'Detection: ' || p_type
  WHERE NOT EXISTS (SELECT 1 FROM (VALUES ('rapidRequests'), ('duplicateSubmission'), ('modifiedState'), ('impossibleDuration'), ('suspiciousPattern'),
    ('abnormalReward'), ('replay'), ('abnormalCurrency'), ('impossibleXp'), ('invalidState'), ('economyAnomaly'), ('duplicateReward')) v(t) WHERE v.t = p_type)
  LIMIT 1 $$;

CREATE OR REPLACE FUNCTION raise_flag(p_user UUID, p_type TEXT, p_risk flag_risk, p_session UUID, p_expected TEXT, p_submitted TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE fid UUID; pol RECORD; strong BOOLEAN;
BEGIN
  SELECT * INTO pol FROM flag_policy(p_type, p_risk);
  SELECT id INTO fid FROM cheat_flags
   WHERE user_id = p_user AND type = p_type AND status = 'open' AND coalesce(last_at, created_at) > now() - interval '10 minutes'
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    -- Repeats raise confidence a little: a pattern is stronger evidence than one event.
    UPDATE cheat_flags SET occurrences = occurrences + 1, last_at = now(), confidence = least(100, confidence + 5) WHERE id = fid;
    RETURN fid;
  END IF;
  INSERT INTO cheat_flags (user_id, type, risk, severity, confidence, reason, session_id, expected, submitted, evidence)
  VALUES (p_user, p_type, p_risk, pol.severity, pol.confidence, pol.reason, p_session, p_expected, p_submitted,
          jsonb_build_object('session', p_session, 'expected', p_expected, 'submitted', p_submitted, 'recordedAt', (extract(epoch FROM now()) * 1000)::bigint))
  RETURNING id INTO fid;
  PERFORM log_event('SECURITY_EVENT', p_user, jsonb_build_object('flag', p_type, 'severity', pol.severity, 'confidence', pol.confidence, 'sessionId', p_session));
  strong := pol.severity IN ('high', 'critical') AND pol.confidence >= 70;
  IF strong THEN
    INSERT INTO reports (reporter_id, target_type, target_user_id, session_id, flag_id, reason, category, description, priority, evidence)
    VALUES (NULL, 'game', p_user, p_session, fid, 'cheating', 'cheating', 'Anti-cheat: ' || p_type || ' (' || pol.severity || ', ' || pol.confidence || '%)',
            CASE WHEN pol.severity = 'critical' THEN 'urgent' ELSE 'high' END, jsonb_build_object('expected', p_expected, 'submitted', p_submitted));
    IF pol.confidence >= 85 THEN
      PERFORM notify_user(p_user, 'security', jsonb_build_object('event', 'suspicious'));
    END IF;
    IF pol.severity = 'critical' AND pol.confidence >= 85 AND (SELECT auto_freeze_critical FROM system_settings WHERE id = 1) THEN
      UPDATE users SET wallet_frozen = TRUE WHERE id = p_user;
      INSERT INTO admin_audit_log (code, admin_id, admin_role, action, target_user, entity_id, previous, next, reason)
      VALUES ('SYSTEM_FREEZE_WALLET', NULL, 'super_admin', 'wallet.freeze', p_user, fid::text, 'false', 'true', 'Auto-freeze: ' || p_type);
    END IF;
  END IF;
  RETURN fid;
END $$;

UPDATE cheat_flags f SET severity = p.severity, confidence = p.confidence, reason = coalesce(f.reason, p.reason)
FROM (SELECT DISTINCT type FROM cheat_flags) t, LATERAL flag_policy(t.type, 'medium') p
WHERE f.type = t.type AND f.status = 'open';
