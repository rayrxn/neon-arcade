-- Neon Arcade — aturan bisnis sisi server sebagai fungsi PostgreSQL (dipanggil API sebagai RPC).
-- Jalankan setelah schema.sql. Semua fungsi berjalan dalam satu transaksi database:
-- kalau satu langkah gagal (saldo kurang, permission, validasi), SEMUA perubahan dibatalkan.
-- Kode error = kunci i18n yang sama dengan frontend (mis. 'errors.insufficient').
--
-- Rumus identik dengan src/services (provably fair HMAC-SHA256, XP, level, milestone),
-- jadi hasil lokal dan server bisa dicocokkan 1:1 (lihat db/functions_test.sql).

-- ───────────────────────────── Referensi & helper ─────────────────────────────
CREATE TABLE role_permissions (role user_role NOT NULL, permission VARCHAR(32) NOT NULL, PRIMARY KEY (role, permission));
CREATE TABLE role_rank (role user_role PRIMARY KEY, rank SMALLINT NOT NULL);
INSERT INTO role_rank VALUES ('super_admin', 5), ('admin', 4), ('moderator', 3), ('support', 2), ('developer', 2), ('user', 0);

-- Sama dengan src/config/roles.js
INSERT INTO role_permissions (role, permission)
SELECT 'super_admin'::user_role, p FROM unnest(ARRAY['dashboard','users.view','users.sensitive','users.edit','users.ban','users.freeze','wallet.manage','progress.reset','games.manage','sessions.view','sessions.invalidate','anticheat','moderation','rewards.view','codes.manage','announcements.manage','analytics','logs.view','roles.manage','testmode','users.warn','reports.view','reports.manage','support.manage','wallet.reverse','system.manage']) p
UNION ALL SELECT 'admin'::user_role, p FROM unnest(ARRAY['dashboard','users.view','users.sensitive','users.edit','users.ban','users.freeze','wallet.manage','progress.reset','games.manage','sessions.view','sessions.invalidate','anticheat','moderation','rewards.view','codes.manage','announcements.manage','analytics','logs.view','users.warn','reports.view','reports.manage','support.manage','wallet.reverse','system.manage']) p
UNION ALL SELECT 'moderator'::user_role, p FROM unnest(ARRAY['dashboard','users.view','users.ban','users.warn','moderation','reports.view','reports.manage','sessions.view','logs.view']) p
UNION ALL SELECT 'support'::user_role, p FROM unnest(ARRAY['dashboard','users.view','sessions.view','rewards.view','reports.view','support.manage']) p
UNION ALL SELECT 'developer'::user_role, p FROM unnest(ARRAY['dashboard','testmode','sessions.view','games.manage']) p;

INSERT INTO games (slug, name, category, max_multiplier) VALUES
  ('dice', 'Dice', 'originals', 49.5), ('limbo', 'Limbo', 'originals', 1000000), ('coinflip', 'Coinflip', 'originals', 1.98),
  ('plinko', 'Plinko', 'originals', 1000), ('roulette', 'Roulette', 'table', 36), ('case-opening', 'Case Opening', 'cases', 20),
  ('case-battle', 'Case Battle', 'cases', 40), ('crash', 'Crash', 'originals', 1000000000), ('mines', 'Mines', 'originals', 6000000),
  ('blackjack', 'Blackjack', 'table', 2.5);

INSERT INTO items (id, kind, source, is_free) VALUES
  ('neon-frame','frame','redeem',false), ('gold-frame','frame','daily',false), ('violet-frame','frame','season',false),
  ('crimson-frame','frame','achievement',false), ('mint-frame','frame','achievement',false),
  ('avatar-aurora','avatar','season',false), ('avatar-ember','avatar','achievement',false),
  ('badge-first-win','badge','achievement',false), ('badge-streak-7','badge','achievement',false), ('badge-streak-30','badge','achievement',false),
  ('badge-level-15','badge','achievement',false), ('badge-level-50','badge','achievement',false), ('badge-quest','badge','achievement',false),
  ('badge-season','badge','season',false), ('title-rookie','title','default',true), ('title-grinder','title','achievement',false),
  ('title-quest-master','title','achievement',false), ('title-veteran','title','achievement',false), ('title-legend','title','achievement',false),
  ('chat-star','chatBadge','achievement',false), ('chat-bolt','chatBadge','achievement',false),
  ('banner-aurora','banner','season',false), ('banner-ember','banner','achievement',false), ('banner-ocean','banner','achievement',false),
  ('emote-gg','emote','default',true), ('emote-wave','emote','default',true), ('emote-fire','emote','daily',false), ('emote-gem','emote','season',false);
INSERT INTO system_settings (id) VALUES (1);

CREATE FUNCTION api_error(code TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = code; END $$;

CREATE FUNCTION xp_for_next(lv INTEGER) RETURNS INTEGER IMMUTABLE LANGUAGE sql AS $$ SELECT 100 + (lv - 1) * 75 $$;

CREATE FUNCTION level_from_xp(p_xp BIGINT) RETURNS INTEGER IMMUTABLE LANGUAGE plpgsql AS $$
DECLARE lv INTEGER := 1; rest BIGINT := greatest(p_xp, 0);
BEGIN
  WHILE rest >= xp_for_next(lv) LOOP rest := rest - xp_for_next(lv); lv := lv + 1; END LOOP;
  RETURN lv;
END $$;

CREATE FUNCTION game_xp(p_bet NUMERIC, p_win BOOLEAN) RETURNS INTEGER IMMUTABLE LANGUAGE sql AS $$
  SELECT least(60, 10 + floor(p_bet / 100)::int) + CASE WHEN p_win THEN 5 ELSE 0 END $$;

-- Provably fair: float ke-0 dari HMAC_SHA256(serverSeed, "clientSeed:nonce:0") — sama dengan utils/rng.js
CREATE FUNCTION fair_float(p_server_seed TEXT, p_client_seed TEXT, p_nonce INTEGER) RETURNS DOUBLE PRECISION IMMUTABLE LANGUAGE plpgsql AS $$
DECLARE b BYTEA := hmac(convert_to(p_client_seed || ':' || p_nonce || ':0', 'UTF8'), convert_to(p_server_seed, 'UTF8'), 'sha256');
BEGIN
  RETURN get_byte(b, 0) / 256.0 + get_byte(b, 1) / 65536.0 + get_byte(b, 2) / 16777216.0 + get_byte(b, 3) / 4294967296.0;
END $$;

CREATE FUNCTION log_event(p_type TEXT, p_user UUID, p_data JSONB DEFAULT '{}'::jsonb) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO events (type, user_id, data) VALUES (p_type, p_user, p_data) $$;

CREATE FUNCTION notify_user(p_user UUID, p_kind TEXT, p_data JSONB) RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO notifications (user_id, kind, data) VALUES (p_user, p_kind, p_data) $$;

CREATE FUNCTION raise_flag(p_user UUID, p_type TEXT, p_risk flag_risk, p_session UUID, p_expected TEXT, p_submitted TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE fid UUID;
BEGIN
  INSERT INTO cheat_flags (user_id, type, risk, session_id, expected, submitted, evidence)
  VALUES (p_user, p_type, p_risk, p_session, p_expected, p_submitted, jsonb_build_object('session', p_session))
  RETURNING id INTO fid;
  PERFORM log_event('SECURITY_EVENT', p_user, jsonb_build_object('flag', p_type, 'risk', p_risk));
  IF p_risk IN ('high', 'critical') THEN   -- kasus moderasi otomatis, bukti disimpan
    INSERT INTO reports (reporter_id, target_type, target_user_id, session_id, flag_id, reason, description, priority, evidence)
    VALUES (NULL, 'game', p_user, p_session, fid, 'cheating', 'Anti-cheat: ' || p_type, 'high', jsonb_build_object('expected', p_expected, 'submitted', p_submitted));
    IF p_risk = 'critical' AND (SELECT auto_freeze_critical FROM system_settings WHERE id = 1) THEN
      UPDATE users SET wallet_frozen = TRUE WHERE id = p_user;
    END IF;
  END IF;
  RETURN fid;
END $$;

-- ───────────────────────────── Ledger ─────────────────────────────
-- Satu-satunya jalan saldo berubah. Idempoten per (user, key); baris wallet dikunci (FOR UPDATE)
-- supaya dua request bersamaan tidak bisa membuat saldo negatif.
CREATE FUNCTION wallet_post(
  p_user UUID, p_currency currency_code, p_amount NUMERIC, p_type TEXT, p_category tx_category, p_source TEXT,
  p_reason TEXT, p_session UUID, p_admin UUID, p_reversal_of UUID, p_key TEXT
) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE existing UUID; w wallets; v_before NUMERIC; v_after NUMERIC; tx UUID;
BEGIN
  SELECT id INTO existing FROM wallet_transactions WHERE user_id = p_user AND idempotency_key = p_key;
  IF FOUND THEN RETURN existing; END IF;
  SELECT * INTO w FROM wallets WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN PERFORM api_error('errors.notFound'); END IF;
  v_before := CASE WHEN p_currency = 'AC' THEN w.ac_balance ELSE w.ag_balance END;
  v_after := round(v_before + p_amount, 2);
  IF v_after < 0 THEN PERFORM api_error('errors.insufficient'); END IF;
  IF p_currency = 'AC' THEN UPDATE wallets SET ac_balance = v_after, updated_at = now() WHERE user_id = p_user;
  ELSE UPDATE wallets SET ag_balance = v_after, updated_at = now() WHERE user_id = p_user; END IF;
  INSERT INTO wallet_transactions (user_id, currency, amount, balance_before, balance_after, type, category, source, reason, session_id, admin_id, reversal_of, idempotency_key)
  VALUES (p_user, p_currency, round(p_amount, 2), v_before, v_after, p_type, p_category, p_source, p_reason, p_session, p_admin, p_reversal_of, p_key)
  RETURNING id INTO tx;
  RETURN tx;
END $$;

-- ───────────────────────────── Auth ─────────────────────────────
CREATE FUNCTION api_register(p_username TEXT, p_email TEXT, p_password_hash TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE uid UUID; first BOOLEAN;
BEGIN
  IF p_username !~ '^[A-Za-z0-9_]{3,16}$' THEN PERFORM api_error('validation.usernameFormat'); END IF;
  IF EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN PERFORM api_error('errors.emailTaken'); END IF;
  IF EXISTS (SELECT 1 FROM users WHERE username = p_username) THEN PERFORM api_error('errors.usernameTaken'); END IF;
  first := NOT EXISTS (SELECT 1 FROM users);
  INSERT INTO users (username, display_name, email, password_hash, role)
  VALUES (p_username, p_username, p_email, p_password_hash, CASE WHEN first THEN 'super_admin' ELSE 'user' END::user_role)
  RETURNING id INTO uid;
  INSERT INTO wallets (user_id, ac_balance, ag_balance) VALUES (uid, 0, 0);
  PERFORM wallet_post(uid, 'AC', 10000, 'grant', 'system', 'signup', NULL, NULL, NULL, NULL, 'signup:AC');
  PERFORM wallet_post(uid, 'AG', 1, 'grant', 'system', 'signup', NULL, NULL, NULL, NULL, 'signup:AG');
  INSERT INTO user_progress (user_id) VALUES (uid);
  PERFORM log_event('USER_REGISTERED', uid);
  RETURN uid;
END $$;

-- Rate limit login: 5 gagal / 15 menit per email. Verifikasi hash dilakukan API (argon2/bcrypt).
CREATE FUNCTION api_login_allowed(p_email TEXT) RETURNS BOOLEAN LANGUAGE sql AS $$
  SELECT count(*) < 5 FROM login_attempts WHERE email = p_email AND NOT ok AND at > now() - interval '15 minutes' $$;

CREATE FUNCTION account_block(p_user UUID) RETURNS TEXT LANGUAGE sql AS $$
  SELECT CASE
    WHEN status = 'banned' AND (ban_until IS NULL OR ban_until > now()) THEN CASE WHEN ban_until IS NULL THEN 'errors.bannedPermanent' ELSE 'errors.bannedUntil' END
    WHEN status = 'frozen' THEN 'errors.accountFrozen' END
  FROM users WHERE id = p_user $$;

-- ───────────────────────────── Progres: XP, level, milestone ─────────────────────────────
CREATE FUNCTION grant_xp(p_user UUID, p_amount INTEGER, p_source TEXT) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE pr user_progress; u users; old_lv INTEGER; new_lv INTEGER; lv INTEGER; tx UUID; paid JSONB := '[]'::jsonb;
BEGIN
  IF p_amount <= 0 THEN RETURN jsonb_build_object('xp', 0); END IF;
  SELECT * INTO u FROM users WHERE id = p_user;
  SELECT * INTO pr FROM user_progress WHERE user_id = p_user FOR UPDATE;
  IF p_source = 'game' AND p_amount > 70 THEN
    PERFORM raise_flag(p_user, 'impossibleXp', 'high', NULL, '<= 70 XP per game', p_amount || ' XP');
  END IF;
  old_lv := level_from_xp(pr.xp);
  new_lv := level_from_xp(pr.xp + p_amount);
  UPDATE user_progress SET xp = xp + p_amount, level = new_lv, updated_at = now() WHERE user_id = p_user;
  PERFORM log_event('XP_GAINED', p_user, jsonb_build_object('xp', p_amount, 'source', p_source));
  FOR lv IN old_lv + 1 .. new_lv LOOP
    INSERT INTO level_history (user_id, level, xp) VALUES (p_user, lv, pr.xp + p_amount) ON CONFLICT DO NOTHING;
    CONTINUE WHEN u.is_test;                                -- akun test: tanpa hadiah
    IF lv % 15 = 0 AND NOT EXISTS (SELECT 1 FROM level_milestones WHERE user_id = p_user AND milestone_type = 'L15' AND milestone_level = lv) THEN
      tx := wallet_post(p_user, 'AC', 250000, 'reward', 'level', 'level', 'Level ' || lv || ' milestone', NULL, NULL, NULL, 'milestone:L15:' || lv);
      INSERT INTO level_milestones (user_id, milestone_type, milestone_level, reward_id) VALUES (p_user, 'L15', lv, tx) ON CONFLICT DO NOTHING;
      paid := paid || jsonb_build_object('type', 'L15', 'level', lv, 'currency', 'AC', 'amount', 250000, 'tx', tx);
      PERFORM log_event('MILESTONE_REWARD', p_user, jsonb_build_object('milestone', 'L15:' || lv, 'tx', tx));
    END IF;
    IF lv % 50 = 0 AND NOT EXISTS (SELECT 1 FROM level_milestones WHERE user_id = p_user AND milestone_type = 'L50' AND milestone_level = lv) THEN
      tx := wallet_post(p_user, 'AG', 1, 'reward', 'level', 'level', 'Level ' || lv || ' milestone', NULL, NULL, NULL, 'milestone:L50:' || lv);
      INSERT INTO level_milestones (user_id, milestone_type, milestone_level, reward_id) VALUES (p_user, 'L50', lv, tx) ON CONFLICT DO NOTHING;
      paid := paid || jsonb_build_object('type', 'L50', 'level', lv, 'currency', 'AG', 'amount', 1, 'tx', tx);
      PERFORM log_event('MILESTONE_REWARD', p_user, jsonb_build_object('milestone', 'L50:' || lv, 'tx', tx));
    END IF;
  END LOOP;
  IF new_lv > old_lv THEN
    PERFORM log_event('LEVEL_UP', p_user, jsonb_build_object('from', old_lv, 'to', new_lv));
    PERFORM notify_user(p_user, 'levelUp', jsonb_build_object('from', old_lv, 'level', new_lv, 'rewards', paid));
    INSERT INTO user_achievements (user_id, achievement_id)
      SELECT p_user, a FROM (VALUES ('first-levelup', 2), ('veteran', 10), ('level-15', 15), ('level-50', 50)) v(a, need) WHERE new_lv >= need
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('xp', p_amount, 'from', old_lv, 'to', new_lv, 'milestones', paid);
END $$;

-- ───────────────────────────── Game: start / finish (server menentukan hasil) ─────────────────────────────
CREATE FUNCTION game_start(p_user UUID, p_game TEXT, p_bet NUMERIC) RETURNS JSONB LANGUAGE plpgsql AS $$
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
  IF p_bet < 1 THEN PERFORM api_error('errors.invalidAmount'); END IF;
  IF p_bet > g.max_bet THEN PERFORM api_error('play.errors.maxBet'); END IF;
  -- Rate limit: maks 8 ronde / detik per user
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
    INSERT INTO game_sessions (user_id, game, bet, seed_id, nonce, is_test) VALUES (p_user, p_game, p_bet, s.id, s.nonce, u.is_test) RETURNING id INTO sid;
  EXCEPTION WHEN unique_violation THEN PERFORM api_error('play.errors.openRound');
  END;
  IF NOT u.is_test THEN   -- sesi test tidak menyentuh wallet
    tx := wallet_post(p_user, 'AC', -p_bet, 'bet', 'game', 'game', NULL, sid, NULL, NULL, 'game:' || sid || ':bet');
    UPDATE game_sessions SET bet_tx_id = tx WHERE id = sid;
  END IF;
  PERFORM log_event('GAME_STARTED', p_user, jsonb_build_object('session', sid, 'game', p_game, 'bet', p_bet));
  RETURN jsonb_build_object('session_id', sid, 'server_seed_hash', s.server_seed_hash, 'client_seed', s.client_seed, 'nonce', s.nonce);
END $$;

-- Selesaikan sesi dengan hasil yang sudah dihitung server. Idempoten: submit kedua mengembalikan hasil lama.
CREATE FUNCTION game_settle(p_session UUID, p_multiplier NUMERIC, p_result TEXT, p_detail JSONB) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE gs game_sessions; g games; v_payout NUMERIC; v_status session_status; tx UUID; valid BOOLEAN; v_xp INTEGER;
BEGIN
  SELECT * INTO gs FROM game_sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN PERFORM api_error('play.errors.settled'); END IF;
  IF gs.status <> 'OPEN' THEN
    PERFORM raise_flag(gs.user_id, 'duplicateSubmission', 'low', gs.id, 'one settlement', 'second submit');
    RETURN jsonb_build_object('duplicate', TRUE, 'status', gs.status, 'payout', gs.payout, 'multiplier', gs.multiplier);
  END IF;
  SELECT * INTO g FROM games WHERE slug = gs.game;
  valid := p_multiplier >= 0 AND p_multiplier <= g.max_multiplier;
  v_payout := CASE WHEN valid THEN round(gs.bet * p_multiplier, 2) ELSE 0 END;
  v_status := CASE WHEN NOT valid THEN 'INVALID' WHEN p_result = 'win' THEN 'WON' WHEN p_result = 'push' THEN 'DRAW' WHEN p_result = 'cancel' THEN 'CANCELLED' ELSE 'LOST' END;
  v_xp := CASE WHEN gs.is_test OR NOT valid THEN 0 ELSE game_xp(gs.bet, p_result = 'win') END;
  UPDATE game_sessions SET status = v_status, payout = v_payout, multiplier = CASE WHEN valid THEN p_multiplier ELSE 0 END,
         verification = CASE WHEN valid THEN 'verified' ELSE 'rejected' END, detail = p_detail, xp = v_xp, finished_at = now()
   WHERE id = gs.id;
  IF NOT valid THEN
    PERFORM raise_flag(gs.user_id, 'invalidState', 'critical', gs.id, '<= ' || g.max_multiplier || 'x', p_multiplier || 'x');
  ELSIF v_payout > 0 AND NOT gs.is_test THEN
    tx := wallet_post(gs.user_id, 'AC', v_payout, 'win', 'game', 'game', NULL, gs.id, NULL, NULL, 'game:' || gs.id || ':payout');
    UPDATE game_sessions SET payout_tx_id = tx WHERE id = gs.id;
  END IF;
  IF valid AND NOT gs.is_test THEN
    UPDATE user_progress SET games = games + 1, wins = wins + (p_result = 'win')::int, losses = losses + (p_result = 'loss')::int,
           pushes = pushes + (p_result = 'push')::int, wagered = wagered + gs.bet,
           best_multiplier = greatest(best_multiplier, CASE WHEN p_result = 'win' THEN p_multiplier ELSE 0 END)
     WHERE user_id = gs.user_id;
    INSERT INTO user_achievements (user_id, achievement_id) SELECT gs.user_id, 'first-game' ON CONFLICT DO NOTHING;
    IF p_result = 'win' THEN INSERT INTO user_achievements (user_id, achievement_id) SELECT gs.user_id, 'first-win' ON CONFLICT DO NOTHING; END IF;
    PERFORM grant_xp(gs.user_id, v_xp, 'game');
  END IF;
  PERFORM log_event('GAME_COMPLETED', gs.user_id, jsonb_build_object('session', gs.id, 'status', v_status, 'payout', v_payout));
  PERFORM log_event(CASE WHEN p_result = 'win' THEN 'GAME_WON' ELSE 'GAME_LOST' END, gs.user_id, jsonb_build_object('session', gs.id));
  RETURN jsonb_build_object('duplicate', FALSE, 'status', v_status, 'payout', v_payout, 'multiplier', p_multiplier, 'xp', v_xp, 'payout_tx', tx);
END $$;

-- Dice: roll 0.00–100.00 dari float provably fair; payout = 99 / chance (house edge 1%).
CREATE FUNCTION game_play_dice(p_user UUID, p_bet NUMERIC, p_target NUMERIC, p_over BOOLEAN) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE st JSONB; s fairness_seeds; f DOUBLE PRECISION; roll NUMERIC; chance NUMERIC; mult NUMERIC; win BOOLEAN; res JSONB;
BEGIN
  IF p_target < 2 OR p_target > 98 THEN PERFORM api_error('play.errors.invalid'); END IF;
  st := game_start(p_user, 'dice', p_bet);
  SELECT fs.* INTO s FROM fairness_seeds fs JOIN game_sessions gs ON gs.seed_id = fs.id WHERE gs.id = (st->>'session_id')::uuid;
  f := fair_float(s.server_seed, s.client_seed, (st->>'nonce')::int);
  roll := floor(f * 10001) / 100;
  chance := CASE WHEN p_over THEN 100 - p_target ELSE p_target END;
  mult := floor((99.0 / chance) * 10000) / 10000;
  win := CASE WHEN p_over THEN roll > p_target ELSE roll < p_target END;
  res := game_settle((st->>'session_id')::uuid, CASE WHEN win THEN mult ELSE 0 END, CASE WHEN win THEN 'win' ELSE 'loss' END,
                     jsonb_build_object('roll', roll, 'target', p_target, 'over', p_over));
  RETURN res || st || jsonb_build_object('roll', roll, 'float', f);
END $$;

-- ───────────────────────────── Daily reward ─────────────────────────────
CREATE FUNCTION claim_daily(p_user UUID, p_today DATE DEFAULT current_date) RETURNS JSONB LANGUAGE plpgsql AS $$
DECLARE last daily_claims; streak INTEGER; day INTEGER; ac INTEGER; xp INTEGER; item TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM daily_claims WHERE user_id = p_user AND claim_day = p_today) THEN PERFORM api_error('rewards.errors.claimedToday'); END IF;
  SELECT * INTO last FROM daily_claims WHERE user_id = p_user ORDER BY claim_day DESC LIMIT 1;
  streak := CASE WHEN last.claim_day = p_today - 1 THEN last.streak + 1 ELSE 1 END;   -- bolos sehari → mulai dari Day 1
  day := ((streak - 1) % 7) + 1;
  ac := (ARRAY[250, 400, 0, 600, 0, 800, 1500])[day];
  xp := (ARRAY[0, 0, 150, 0, 0, 0, 300])[day];
  item := (ARRAY[NULL, NULL, NULL, NULL, 'gold-frame', NULL, 'emote-fire'])[day];
  IF item IS NOT NULL AND EXISTS (SELECT 1 FROM user_items WHERE user_id = p_user AND item_id = item) AND day = 5 THEN ac := 1000; item := NULL; END IF;
  INSERT INTO daily_claims (user_id, claim_day, streak_day, streak) VALUES (p_user, p_today, day, streak);
  IF ac > 0 THEN PERFORM wallet_post(p_user, 'AC', ac, 'reward', 'daily', 'daily', 'Day ' || day, NULL, NULL, NULL, 'daily:' || p_today); END IF;
  IF item IS NOT NULL THEN INSERT INTO user_items (user_id, item_id, source) VALUES (p_user, item, 'daily') ON CONFLICT DO NOTHING; END IF;
  IF xp > 0 THEN PERFORM grant_xp(p_user, xp, 'daily'); END IF;
  IF streak >= 7 THEN INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user, 'streak-7') ON CONFLICT DO NOTHING; END IF;
  IF streak >= 30 THEN INSERT INTO user_achievements (user_id, achievement_id) VALUES (p_user, 'streak-30') ON CONFLICT DO NOTHING; END IF;
  PERFORM log_event('DAILY_CLAIMED', p_user, jsonb_build_object('day', day, 'streak', streak));
  RETURN jsonb_build_object('day', day, 'streak', streak, 'ac', ac, 'xp', xp, 'item', item);
END $$;

-- ───────────────────────────── Admin (RBAC + audit) ─────────────────────────────
CREATE FUNCTION require_perm(p_admin UUID, p_perm TEXT) RETURNS users LANGUAGE plpgsql AS $$
DECLARE a users;
BEGIN
  SELECT * INTO a FROM users WHERE id = p_admin;
  IF NOT FOUND OR account_block(p_admin) IS NOT NULL OR NOT EXISTS (SELECT 1 FROM role_permissions WHERE role = a.role AND permission = p_perm) THEN
    PERFORM api_error('admin.errors.forbidden');
  END IF;
  RETURN a;
END $$;

CREATE FUNCTION require_reason(p_reason TEXT) RETURNS TEXT LANGUAGE plpgsql AS $$
BEGIN
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 5 THEN PERFORM api_error('admin.errors.reason'); END IF;
  RETURN left(trim(p_reason), 300);
END $$;

-- Admin tidak boleh menindak role setara/lebih tinggi (kecuali dirinya sendiri bila diizinkan).
CREATE FUNCTION require_target(p_admin users, p_target UUID, p_allow_self BOOLEAN DEFAULT FALSE) RETURNS users LANGUAGE plpgsql AS $$
DECLARE t users;
BEGIN
  SELECT * INTO t FROM users WHERE id = p_target;
  IF NOT FOUND THEN PERFORM api_error('admin.errors.noUser'); END IF;
  IF t.id = p_admin.id AND NOT p_allow_self THEN PERFORM api_error('admin.errors.self'); END IF;
  IF t.id <> p_admin.id AND (SELECT rank FROM role_rank WHERE role = t.role) >= (SELECT rank FROM role_rank WHERE role = p_admin.role) THEN
    PERFORM api_error('admin.errors.rank');
  END IF;
  RETURN t;
END $$;

CREATE FUNCTION audit(p_admin users, p_code TEXT, p_action TEXT, p_target UUID, p_entity TEXT, p_prev JSONB, p_next JSONB, p_reason TEXT, p_ip INET DEFAULT NULL, p_agent TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE sql AS $$
  INSERT INTO admin_audit_log (code, admin_id, admin_role, action, target_user, entity_id, previous, next, reason, ip, user_agent)
  VALUES (p_code, (p_admin).id, (p_admin).role, p_action, p_target, p_entity, p_prev, p_next, p_reason, p_ip, p_agent) $$;

CREATE FUNCTION admin_adjust(p_admin UUID, p_target UUID, p_currency currency_code, p_delta NUMERIC, p_reason TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE a users; t users; r TEXT; tx UUID; v_before NUMERIC;
BEGIN
  a := require_perm(p_admin, 'wallet.manage'); r := require_reason(p_reason); t := require_target(a, p_target, TRUE);
  IF p_delta = 0 OR p_delta <> trunc(p_delta) OR abs(p_delta) > 100000000 THEN PERFORM api_error('admin.errors.invalid'); END IF;
  SELECT CASE WHEN p_currency = 'AC' THEN ac_balance ELSE ag_balance END INTO v_before FROM wallets WHERE user_id = p_target;
  IF v_before + p_delta < 0 THEN PERFORM api_error('admin.errors.negative'); END IF;
  tx := wallet_post(p_target, p_currency, p_delta, 'adjust', 'admin', 'admin', r, NULL, a.id, NULL, 'admin:' || gen_random_uuid());
  PERFORM audit(a, 'ADMIN_' || p_currency || '_ADJUSTMENT', CASE WHEN p_delta > 0 THEN 'wallet.add' ELSE 'wallet.remove' END, p_target, tx::text,
                jsonb_build_object(p_currency, v_before), jsonb_build_object(p_currency, v_before + p_delta), r);
  PERFORM notify_user(p_target, CASE WHEN p_delta > 0 THEN 'adminCredit' ELSE 'adminDebit' END, jsonb_build_object('amount', abs(p_delta), 'currency', p_currency));
  PERFORM log_event('ADMIN_ADJUSTMENT', p_target, jsonb_build_object('tx', tx, 'admin', a.id));
  RETURN tx;
END $$;

-- Reversal: transaksi baru bertipe REVERSAL yang menunjuk transaksi asli. Riwayat tidak ditimpa.
CREATE FUNCTION admin_reverse(p_admin UUID, p_tx UUID, p_reason TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE a users; r TEXT; o wallet_transactions; rev UUID;
BEGIN
  a := require_perm(p_admin, 'wallet.reverse'); r := require_reason(p_reason);
  SELECT * INTO o FROM wallet_transactions WHERE id = p_tx;
  IF NOT FOUND THEN PERFORM api_error('admin.errors.noTx'); END IF;
  PERFORM require_target(a, o.user_id, TRUE);
  IF o.type = 'reversal' THEN PERFORM api_error('admin.errors.reverseReversal'); END IF;
  IF EXISTS (SELECT 1 FROM wallet_transactions WHERE reversal_of = p_tx) THEN PERFORM api_error('admin.errors.alreadyDone'); END IF;
  BEGIN
    rev := wallet_post(o.user_id, o.currency, -o.amount, 'reversal', 'reversal', 'admin', r, o.session_id, a.id, o.id, 'reversal:' || o.id);
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'errors.insufficient' THEN PERFORM api_error('admin.errors.negative'); END IF;
    RAISE;
  END;
  PERFORM audit(a, 'ADMIN_REVERSE_TRANSACTION', 'wallet.reverse', o.user_id, o.id::text, jsonb_build_object('tx', o.id, 'amount', o.amount), jsonb_build_object('reversal', rev), r);
  PERFORM notify_user(o.user_id, 'security', jsonb_build_object('event', 'reversal', 'amount', -o.amount, 'currency', o.currency));
  PERFORM log_event('TRANSACTION_REVERSED', o.user_id, jsonb_build_object('tx', o.id, 'reversal', rev));
  RETURN rev;
END $$;

-- p_hours NULL = permanen (butuh users.freeze). Moderator maks 72 jam.
CREATE FUNCTION admin_ban(p_admin UUID, p_target UUID, p_hours INTEGER, p_reason TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE a users; t users; r TEXT;
BEGIN
  a := require_perm(p_admin, 'users.ban'); r := require_reason(p_reason); t := require_target(a, p_target);
  IF p_hours IS NULL AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE role = a.role AND permission = 'users.freeze') THEN PERFORM api_error('admin.errors.tempOnly'); END IF;
  IF p_hours IS NOT NULL AND (p_hours <= 0 OR (a.role = 'moderator' AND p_hours > 72)) THEN PERFORM api_error('admin.errors.invalid'); END IF;
  UPDATE users SET status = 'banned', ban_until = CASE WHEN p_hours IS NULL THEN NULL ELSE now() + make_interval(hours => p_hours) END, ban_reason = r WHERE id = p_target;
  DELETE FROM sessions WHERE user_id = p_target;   -- keluar paksa dari semua perangkat
  PERFORM audit(a, CASE WHEN p_hours IS NULL THEN 'ADMIN_BAN' ELSE 'ADMIN_TEMP_BAN' END, 'user.ban', p_target, p_target::text, to_jsonb(t.status), jsonb_build_object('status', 'banned', 'hours', p_hours), r);
  PERFORM notify_user(p_target, 'security', jsonb_build_object('event', CASE WHEN p_hours IS NULL THEN 'banned' ELSE 'suspended' END));
  PERFORM log_event('USER_BANNED', p_target, jsonb_build_object('admin', a.id, 'hours', p_hours));
END $$;

CREATE FUNCTION admin_unban(p_admin UUID, p_target UUID, p_reason TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE a users; t users; r TEXT;
BEGIN
  a := require_perm(p_admin, 'users.ban'); r := require_reason(p_reason); t := require_target(a, p_target);
  UPDATE users SET status = 'active', ban_until = NULL, ban_reason = NULL WHERE id = p_target;
  PERFORM audit(a, 'ADMIN_UNBAN', 'user.unban', p_target, p_target::text, to_jsonb(t.status), to_jsonb('active'::text), r);
  PERFORM notify_user(p_target, 'security', jsonb_build_object('event', 'restored'));
  PERFORM log_event('USER_UNBANNED', p_target, jsonb_build_object('admin', a.id));
END $$;

-- p_minutes NULL = permanen (admin ke atas), 0 = unmute.
CREATE FUNCTION admin_mute(p_admin UUID, p_target UUID, p_minutes INTEGER, p_reason TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE a users; t users; r TEXT; until_ts TIMESTAMPTZ;
BEGIN
  a := require_perm(p_admin, 'moderation'); r := require_reason(p_reason); t := require_target(a, p_target);
  IF p_minutes IS NULL AND NOT EXISTS (SELECT 1 FROM role_permissions WHERE role = a.role AND permission = 'users.freeze') THEN PERFORM api_error('admin.errors.tempOnly'); END IF;
  IF p_minutes IS NOT NULL AND (p_minutes < 0 OR (a.role = 'moderator' AND p_minutes > 10080)) THEN PERFORM api_error('admin.errors.invalid'); END IF;
  until_ts := CASE WHEN p_minutes IS NULL THEN 'infinity'::timestamptz WHEN p_minutes = 0 THEN NULL ELSE now() + make_interval(mins => p_minutes) END;
  UPDATE users SET muted_until = until_ts WHERE id = p_target;
  PERFORM audit(a, CASE WHEN until_ts IS NULL THEN 'ADMIN_UNMUTE' ELSE 'ADMIN_MUTE' END, CASE WHEN until_ts IS NULL THEN 'chat.unmute' ELSE 'chat.mute' END,
                p_target, p_target::text, to_jsonb(t.muted_until), to_jsonb(until_ts), r);
  PERFORM notify_user(p_target, 'security', jsonb_build_object('event', CASE WHEN until_ts IS NULL THEN 'unmuted' ELSE 'muted' END));
END $$;

CREATE FUNCTION admin_warn(p_admin UUID, p_target UUID, p_reason TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE a users; r TEXT; wid UUID;
BEGIN
  a := require_perm(p_admin, 'users.warn'); r := require_reason(p_reason); PERFORM require_target(a, p_target);
  INSERT INTO user_warnings (user_id, admin_id, reason) VALUES (p_target, a.id, r) RETURNING id INTO wid;
  PERFORM audit(a, 'ADMIN_WARN', 'user.warn', p_target, wid::text, NULL, NULL, r);
  PERFORM notify_user(p_target, 'security', jsonb_build_object('event', 'warning', 'reason', r));
  RETURN wid;
END $$;

CREATE FUNCTION admin_freeze_wallet(p_admin UUID, p_target UUID, p_frozen BOOLEAN, p_reason TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE a users; t users; r TEXT;
BEGIN
  a := require_perm(p_admin, 'users.freeze'); r := require_reason(p_reason); t := require_target(a, p_target);
  UPDATE users SET wallet_frozen = p_frozen WHERE id = p_target;
  PERFORM audit(a, CASE WHEN p_frozen THEN 'ADMIN_FREEZE_WALLET' ELSE 'ADMIN_UNFREEZE_WALLET' END, CASE WHEN p_frozen THEN 'wallet.freeze' ELSE 'wallet.unfreeze' END,
                p_target, p_target::text, to_jsonb(t.wallet_frozen), to_jsonb(p_frozen), r);
  PERFORM notify_user(p_target, 'security', jsonb_build_object('event', CASE WHEN p_frozen THEN 'walletFrozen' ELSE 'restored' END));
END $$;

CREATE FUNCTION admin_set_role(p_admin UUID, p_target UUID, p_role user_role, p_reason TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE a users; t users; r TEXT;
BEGIN
  a := require_perm(p_admin, 'roles.manage'); r := require_reason(p_reason); t := require_target(a, p_target);
  UPDATE users SET role = p_role WHERE id = p_target;
  PERFORM audit(a, 'ADMIN_CHANGE_ROLE', 'user.role', p_target, p_target::text, to_jsonb(t.role), to_jsonb(p_role), r);
  PERFORM log_event('ROLE_CHANGED', p_target, jsonb_build_object('from', t.role, 'to', p_role));
END $$;

-- ───────────────────────────── Reports ─────────────────────────────
CREATE FUNCTION report_create(p_reporter UUID, p_type TEXT, p_target UUID, p_reason TEXT, p_description TEXT, p_message UUID DEFAULT NULL, p_session UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE rid UUID; ev JSONB := '{}'::jsonb;
BEGIN
  IF char_length(trim(p_description)) < 10 THEN PERFORM api_error('reports.errors.short'); END IF;
  IF p_target = p_reporter THEN PERFORM api_error('reports.errors.self'); END IF;
  IF EXISTS (SELECT 1 FROM reports WHERE reporter_id = p_reporter AND created_at > now() - interval '60 seconds') THEN PERFORM api_error('reports.errors.cooldown'); END IF;
  IF (SELECT count(*) FROM reports WHERE reporter_id = p_reporter AND created_at > now() - interval '1 hour') >= 5 THEN PERFORM api_error('reports.errors.rate'); END IF;
  IF p_message IS NOT NULL THEN SELECT jsonb_build_object('message', to_jsonb(m)) INTO ev FROM chat_messages m WHERE id = p_message; END IF;
  IF p_session IS NOT NULL THEN SELECT ev || jsonb_build_object('session', jsonb_build_object('game', s.game, 'bet', s.bet, 'payout', s.payout, 'status', s.status)) INTO ev FROM game_sessions s WHERE id = p_session; END IF;
  BEGIN
    INSERT INTO reports (reporter_id, target_type, target_user_id, message_id, session_id, reason, description, evidence, priority)
    VALUES (p_reporter, p_type, p_target, p_message, p_session, p_reason, trim(p_description), coalesce(ev, '{}'::jsonb), CASE WHEN p_reason IN ('cheating', 'scam') THEN 'high' ELSE 'normal' END)
    RETURNING id INTO rid;
  EXCEPTION WHEN unique_violation THEN PERFORM api_error('reports.errors.duplicate');
  END;
  INSERT INTO report_events (report_id, admin_id, action, internal) VALUES (rid, NULL, 'created', FALSE);
  PERFORM notify_user(p_reporter, 'reportUpdate', jsonb_build_object('report', rid, 'status', 'new'));
  PERFORM log_event('REPORT_CREATED', p_reporter, jsonb_build_object('report', rid));
  RETURN rid;
END $$;

CREATE FUNCTION report_action(p_admin UUID, p_report UUID, p_action TEXT, p_reason TEXT DEFAULT NULL) RETURNS report_status LANGUAGE plpgsql AS $$
DECLARE a users; rp reports; next_status report_status; r TEXT := coalesce(p_reason, 'status change');
BEGIN
  a := require_perm(p_admin, 'reports.manage');
  SELECT * INTO rp FROM reports WHERE id = p_report FOR UPDATE;
  IF NOT FOUND THEN PERFORM api_error('errors.notFound'); END IF;
  next_status := CASE p_action WHEN 'investigate' THEN 'investigating' WHEN 'resolve' THEN 'resolved' WHEN 'dismiss' THEN 'dismissed' WHEN 'escalate' THEN 'escalated' WHEN 'reopen' THEN 'investigating' END;
  IF next_status IS NULL THEN PERFORM api_error('admin.errors.invalid'); END IF;
  IF rp.status = next_status THEN PERFORM api_error('admin.errors.alreadyDone'); END IF;
  IF p_action IN ('resolve', 'dismiss', 'escalate') AND rp.status NOT IN ('new', 'investigating', 'escalated') THEN PERFORM api_error('admin.errors.invalid'); END IF;
  IF p_action <> 'investigate' THEN r := require_reason(p_reason); END IF;
  UPDATE reports SET status = next_status, assignee_id = coalesce(assignee_id, a.id),
         resolution = CASE WHEN p_action IN ('resolve', 'dismiss') THEN r ELSE resolution END,
         resolved_at = CASE WHEN p_action IN ('resolve', 'dismiss') THEN now() ELSE resolved_at END
   WHERE id = p_report;
  INSERT INTO report_events (report_id, admin_id, action, note) VALUES (p_report, a.id, p_action, r);
  IF rp.reporter_id IS NOT NULL THEN PERFORM notify_user(rp.reporter_id, 'reportUpdate', jsonb_build_object('report', p_report, 'status', next_status)); END IF;
  IF rp.flag_id IS NOT NULL AND p_action IN ('resolve', 'dismiss') THEN
    UPDATE cheat_flags SET status = CASE WHEN p_action = 'resolve' THEN 'confirmed' ELSE 'dismissed' END, reviewed_by = a.id WHERE id = rp.flag_id;
  END IF;
  PERFORM audit(a, 'ADMIN_' || upper(p_action) || '_REPORT', 'report.' || p_action, rp.target_user_id, p_report::text, to_jsonb(rp.status), to_jsonb(next_status), r);
  PERFORM log_event(CASE WHEN p_action = 'resolve' THEN 'REPORT_RESOLVED' ELSE 'REPORT_UPDATED' END, rp.target_user_id, jsonb_build_object('report', p_report));
  RETURN next_status;
END $$;
