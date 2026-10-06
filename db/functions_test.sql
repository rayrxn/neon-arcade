-- Uji fungsi server (jalankan setelah schema.sql + functions.sql di database kosong).
-- Output: baris "PASS ..." / "FAIL ...". Ringkasan di akhir.
\set ON_ERROR_STOP on
SET client_min_messages = notice;

CREATE TEMP TABLE t_ids (name TEXT PRIMARY KEY, id UUID);
CREATE TEMP TABLE t_result (ok BOOLEAN);
CREATE FUNCTION pg_temp.id(n TEXT) RETURNS UUID LANGUAGE sql AS $$ SELECT id FROM t_ids WHERE name = n $$;
CREATE FUNCTION pg_temp.ok(label TEXT, cond BOOLEAN) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO t_result VALUES (coalesce(cond, FALSE));
  RAISE NOTICE '% %', CASE WHEN cond THEN 'PASS' ELSE 'FAIL' END, label;
END $$;
-- Menjalankan statement yang HARUS gagal dengan kode error tertentu. Perubahan di dalamnya dibatalkan.
CREATE FUNCTION pg_temp.err(label TEXT, stmt TEXT, code TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  PERFORM pg_temp.ok(label || ' (no error)', FALSE);
EXCEPTION WHEN OTHERS THEN
  PERFORM pg_temp.ok(label || ' → ' || SQLERRM, SQLERRM = code);
END $$;
CREATE FUNCTION pg_temp.bal(n TEXT, c TEXT DEFAULT 'AC') RETURNS NUMERIC LANGUAGE sql AS $$
  SELECT CASE WHEN c = 'AC' THEN ac_balance ELSE ag_balance END FROM wallets WHERE user_id = (SELECT id FROM t_ids WHERE name = n) $$;
CREATE FUNCTION pg_temp.xp_to(lv INTEGER) RETURNS BIGINT LANGUAGE sql AS $$ SELECT coalesce(sum(xp_for_next(l)), 0) FROM generate_series(1, lv - 1) l $$;

-- ── Register: akun pertama super admin, wallet 10.000 AC + 1 AG lewat ledger ──
INSERT INTO t_ids SELECT 'owner', api_register('owner', 'owner@x.test', 'hash');
INSERT INTO t_ids SELECT 'p1', api_register('player1', 'p1@x.test', 'hash');
INSERT INTO t_ids SELECT 'p2', api_register('player2', 'p2@x.test', 'hash');
INSERT INTO t_ids SELECT 'mod', api_register('mod1', 'mod@x.test', 'hash');
INSERT INTO t_ids SELECT 'sup', api_register('support1', 'sup@x.test', 'hash');
SELECT pg_temp.ok('REGISTER: first account = super_admin, others = user', (SELECT role FROM users WHERE id = pg_temp.id('owner')) = 'super_admin' AND (SELECT role FROM users WHERE id = pg_temp.id('p1')) = 'user');
SELECT pg_temp.ok('REGISTER: 10000 AC + 1 AG via 2 ledger transactions', pg_temp.bal('p1') = 10000 AND pg_temp.bal('p1', 'AG') = 1 AND (SELECT count(*) FROM wallet_transactions WHERE user_id = pg_temp.id('p1')) = 2);
SELECT pg_temp.err('REGISTER: duplicate email', $$SELECT api_register('other', 'p1@x.test', 'hash')$$, 'errors.emailTaken');
SELECT admin_set_role(pg_temp.id('owner'), pg_temp.id('mod'), 'moderator', 'Promote to moderator');
SELECT admin_set_role(pg_temp.id('owner'), pg_temp.id('sup'), 'support', 'Promote to support');
SELECT pg_temp.ok('AUDIT: ADMIN_CHANGE_ROLE logged', (SELECT count(*) FROM admin_audit_log WHERE code = 'ADMIN_CHANGE_ROLE') = 2);

-- ── Provably fair: hasil SQL identik dengan utils/rng.js (nilai referensi dari JS) ──
SELECT pg_temp.ok('FAIRNESS: SQL float = JS float (nonce 0)', abs(fair_float('server-seed-test', 'client-seed-test', 0) - 0.7881328207440674) < 1e-12);
SELECT pg_temp.ok('FAIRNESS: SQL float = JS float (nonce 1)', abs(fair_float('server-seed-test', 'client-seed-test', 1) - 0.08644918981008232) < 1e-12);

-- ── Game start / complete / result (dice, seed tetap supaya hasil bisa dicek) ──
INSERT INTO fairness_seeds (user_id, server_seed, server_seed_hash, client_seed)
VALUES (pg_temp.id('p1'), 'server-seed-test', encode(digest('server-seed-test', 'sha256'), 'hex'), 'client-seed-test');
CREATE TEMP TABLE t_games AS SELECT 1 AS n, game_play_dice(pg_temp.id('p1'), 100, 50, TRUE) AS r;
SELECT pg_temp.ok('GAME RESULT: roll 78.82 > 50 → WON, payout 198', (r->>'roll')::numeric = 78.82 AND r->>'status' = 'WON' AND (r->>'payout')::numeric = 198) FROM t_games WHERE n = 1;
SELECT pg_temp.ok('WALLET REWARD: 10000 - 100 + 198 = 10098', pg_temp.bal('p1') = 10098);
SELECT pg_temp.ok('GAME: bet + payout tx linked to session with idempotency keys',
  (SELECT count(*) FROM wallet_transactions t JOIN t_games g ON t.session_id = (g.r->>'session_id')::uuid WHERE t.idempotency_key LIKE 'game:%') = 2);
INSERT INTO t_games SELECT 2, game_play_dice(pg_temp.id('p1'), 100, 50, TRUE);
SELECT pg_temp.ok('GAME RESULT: nonce 1 roll 8.64 → LOST, no payout', (r->>'roll')::numeric = 8.64 AND r->>'status' = 'LOST' AND pg_temp.bal('p1') = 9998) FROM t_games WHERE n = 2;
SELECT pg_temp.ok('GAME: events GAME_STARTED / GAME_COMPLETED / GAME_WON recorded',
  (SELECT count(*) FROM events WHERE user_id = pg_temp.id('p1') AND type IN ('GAME_STARTED', 'GAME_COMPLETED', 'GAME_WON')) >= 5);
SELECT pg_temp.ok('XP GAIN: XP per round (server formula) stored', (SELECT xp FROM user_progress WHERE user_id = pg_temp.id('p1')) = game_xp(100, TRUE) + game_xp(100, FALSE));

-- Duplicate submit: settle sesi yang sudah selesai → hasil lama, saldo tetap, flag low
CREATE TEMP TABLE t_dup AS SELECT game_settle((SELECT (r->>'session_id')::uuid FROM t_games WHERE n = 1), 1.98, 'win', '{}'::jsonb) AS r;
SELECT pg_temp.ok('DUPLICATE GAME REQUEST: returns old result, no extra payout', (r->>'duplicate')::boolean AND pg_temp.bal('p1') = 9998) FROM t_dup;
SELECT pg_temp.ok('ANTI-CHEAT: duplicate submission flagged', EXISTS (SELECT 1 FROM cheat_flags WHERE user_id = pg_temp.id('p1') AND type = 'duplicateSubmission'));

-- Hasil mustahil: multiplier di atas batas game → INVALID, tanpa payout, flag kritis + kasus moderasi
CREATE TEMP TABLE t_bad AS SELECT game_start(pg_temp.id('p1'), 'dice', 100) AS s;
CREATE TEMP TABLE t_bad2 AS SELECT game_settle((SELECT (s->>'session_id')::uuid FROM t_bad), 500, 'win', '{}'::jsonb) AS r;
SELECT pg_temp.ok('GAME VALIDATION: impossible result → INVALID, no payout', r->>'status' = 'INVALID' AND (r->>'payout')::numeric = 0 AND pg_temp.bal('p1') = 9898) FROM t_bad2;
SELECT pg_temp.ok('ANTI-CHEAT: critical flag opens moderation case with evidence',
  EXISTS (SELECT 1 FROM reports WHERE reporter_id IS NULL AND target_user_id = pg_temp.id('p1') AND flag_id IS NOT NULL AND evidence ? 'expected'));

-- Validasi & atomik
SELECT pg_temp.err('VALIDATION: bet above max bet', $$SELECT game_start((SELECT id FROM t_ids WHERE name='p1'), 'dice', 200000)$$, 'play.errors.maxBet');
SELECT pg_temp.err('VALIDATION: fractional bet', $$SELECT game_start((SELECT id FROM t_ids WHERE name='p1'), 'dice', 1.5)$$, 'play.errors.wholeBet');
UPDATE games SET max_bet = 100000 WHERE slug = 'coinflip';
SELECT pg_temp.err('ATOMIC: insufficient balance → error', $$SELECT game_start((SELECT id FROM t_ids WHERE name='p1'), 'coinflip', 20000)$$, 'errors.insufficient');
SELECT pg_temp.ok('ATOMIC: failed start left no open session and no bet tx', NOT EXISTS (SELECT 1 FROM game_sessions WHERE user_id = pg_temp.id('p1') AND game = 'coinflip') AND pg_temp.bal('p1') = 9898);
CREATE TEMP TABLE t_open AS SELECT game_start(pg_temp.id('p1'), 'coinflip', 10) AS s;
SELECT pg_temp.err('VALIDATION: one open round per game', $$SELECT game_start((SELECT id FROM t_ids WHERE name='p1'), 'coinflip', 10)$$, 'play.errors.openRound');
SELECT game_settle((SELECT (s->>'session_id')::uuid FROM t_open), 0, 'loss', '{}'::jsonb);

-- ── Level 15 & 50 milestones ──
SELECT grant_xp(pg_temp.id('p1'), (pg_temp.xp_to(15) - (SELECT xp FROM user_progress WHERE user_id = pg_temp.id('p1')))::int, 'admin');
SELECT pg_temp.ok('LEVEL UP: level 15 + history rows', (SELECT level FROM user_progress WHERE user_id = pg_temp.id('p1')) = 15 AND (SELECT count(*) FROM level_history WHERE user_id = pg_temp.id('p1')) = 14);
SELECT pg_temp.ok('LEVEL 15 REWARD: +250000 AC, recorded with reward tx', pg_temp.bal('p1') = 9888 + 250000 AND EXISTS (SELECT 1 FROM level_milestones WHERE user_id = pg_temp.id('p1') AND milestone_type = 'L15' AND milestone_level = 15));
SELECT pg_temp.ok('ACHIEVEMENT: level-15 unlocked automatically', EXISTS (SELECT 1 FROM user_achievements WHERE user_id = pg_temp.id('p1') AND achievement_id = 'level-15'));
SELECT pg_temp.ok('NOTIFICATION: level up notification with reward', EXISTS (SELECT 1 FROM notifications WHERE user_id = pg_temp.id('p1') AND kind = 'levelUp' AND jsonb_array_length(data->'rewards') = 1));
UPDATE user_progress SET xp = pg_temp.xp_to(14) WHERE user_id = pg_temp.id('p1');
SELECT grant_xp(pg_temp.id('p1'), (pg_temp.xp_to(15) - pg_temp.xp_to(14))::int, 'admin');
SELECT pg_temp.ok('LEVEL 15 REWARD: never paid twice', pg_temp.bal('p1') = 9888 + 250000 AND (SELECT count(*) FROM level_milestones WHERE user_id = pg_temp.id('p1')) = 1);
SELECT grant_xp(pg_temp.id('p1'), (pg_temp.xp_to(50) - (SELECT xp FROM user_progress WHERE user_id = pg_temp.id('p1')))::int, 'admin');
SELECT pg_temp.ok('LEVEL 50 REWARD: +1 AG (and +250000 AC at 30, 45)', pg_temp.bal('p1', 'AG') = 2 AND pg_temp.bal('p1') = 9888 + 750000 AND (SELECT count(*) FROM level_milestones WHERE user_id = pg_temp.id('p1')) = 4);
SELECT grant_xp(pg_temp.id('p1'), 999, 'game');
SELECT pg_temp.ok('ANTI-CHEAT: impossible XP from a game flagged', EXISTS (SELECT 1 FROM cheat_flags WHERE user_id = pg_temp.id('p1') AND type = 'impossibleXp'));

-- ── Test mode: tanpa hadiah, tanpa wallet ──
UPDATE users SET is_test = TRUE WHERE id = pg_temp.id('p2');
SELECT grant_xp(pg_temp.id('p2'), pg_temp.xp_to(16)::int, 'test');
SELECT pg_temp.ok('TEST MODE: no milestone payout on test account', pg_temp.bal('p2') = 10000 AND NOT EXISTS (SELECT 1 FROM level_milestones WHERE user_id = pg_temp.id('p2')));
CREATE TEMP TABLE t_test AS SELECT game_play_dice(pg_temp.id('p2'), 100, 50, TRUE) AS r;
SELECT pg_temp.ok('TEST MODE: test session marked, wallet untouched', (SELECT is_test FROM game_sessions WHERE id = (r->>'session_id')::uuid) AND pg_temp.bal('p2') = 10000) FROM t_test;
SELECT pg_temp.ok('TEST MODE: excluded from leaderboard view', NOT EXISTS (SELECT 1 FROM leaderboard_global WHERE id = pg_temp.id('p2')));
UPDATE users SET is_test = FALSE WHERE id = pg_temp.id('p2');

-- ── Daily reward ──
SELECT claim_daily(pg_temp.id('p2'), '2026-10-01');
SELECT pg_temp.ok('DAILY REWARD: day 1 → +250 AC', pg_temp.bal('p2') = 10250);
SELECT pg_temp.err('DAILY REWARD: once per day', $$SELECT claim_daily((SELECT id FROM t_ids WHERE name='p2'), '2026-10-01')$$, 'rewards.errors.claimedToday');
SELECT claim_daily(pg_temp.id('p2'), '2026-10-02');
SELECT pg_temp.ok('DAILY REWARD: streak → day 2 (+400)', pg_temp.bal('p2') = 10650 AND (SELECT streak FROM daily_claims WHERE user_id = pg_temp.id('p2') ORDER BY claim_day DESC LIMIT 1) = 2);
SELECT claim_daily(pg_temp.id('p2'), '2026-10-05');
SELECT pg_temp.ok('DAILY REWARD: missed days → back to day 1', (SELECT streak_day FROM daily_claims WHERE user_id = pg_temp.id('p2') AND claim_day = '2026-10-05') = 1);

-- ── Admin: RBAC, adjustment, reversal ──
SELECT pg_temp.err('PERMISSION: moderator cannot adjust balance', $$SELECT admin_adjust((SELECT id FROM t_ids WHERE name='mod'), (SELECT id FROM t_ids WHERE name='p2'), 'AC', 500, 'mod tries wallet')$$, 'admin.errors.forbidden');
SELECT pg_temp.err('PERMISSION: reason required', $$SELECT admin_adjust((SELECT id FROM t_ids WHERE name='owner'), (SELECT id FROM t_ids WHERE name='p2'), 'AC', 500, 'no')$$, 'admin.errors.reason');
INSERT INTO t_ids SELECT 'adj', admin_adjust(pg_temp.id('owner'), pg_temp.id('p2'), 'AC', 500, 'Bug compensation');
SELECT pg_temp.ok('ADMIN AC ADJUSTMENT: balance + tx admin_id + audit ADMIN_AC_ADJUSTMENT', pg_temp.bal('p2') = 11400 AND (SELECT admin_id FROM wallet_transactions WHERE id = pg_temp.id('adj')) = pg_temp.id('owner') AND EXISTS (SELECT 1 FROM admin_audit_log WHERE code = 'ADMIN_AC_ADJUSTMENT' AND entity_id = pg_temp.id('adj')::text));
SELECT pg_temp.err('ADMIN: cannot remove below zero', $$SELECT admin_adjust((SELECT id FROM t_ids WHERE name='owner'), (SELECT id FROM t_ids WHERE name='p2'), 'AG', -5, 'remove gems test')$$, 'admin.errors.negative');
SELECT pg_temp.err('PERMISSION: support cannot reverse', $$SELECT admin_reverse((SELECT id FROM t_ids WHERE name='sup'), (SELECT id FROM t_ids WHERE name='adj'), 'support tries')$$, 'admin.errors.forbidden');
INSERT INTO t_ids SELECT 'rev', admin_reverse(pg_temp.id('owner'), pg_temp.id('adj'), 'Granted twice by mistake');
SELECT pg_temp.ok('TRANSACTION REVERSAL: REVERSAL tx linked, original kept, balance restored',
  (SELECT reversal_of FROM wallet_transactions WHERE id = pg_temp.id('rev')) = pg_temp.id('adj') AND (SELECT amount FROM wallet_transactions WHERE id = pg_temp.id('adj')) = 500 AND pg_temp.bal('p2') = 10900
  AND EXISTS (SELECT 1 FROM admin_audit_log WHERE code = 'ADMIN_REVERSE_TRANSACTION'));
SELECT pg_temp.err('TRANSACTION REVERSAL: not twice', $$SELECT admin_reverse((SELECT id FROM t_ids WHERE name='owner'), (SELECT id FROM t_ids WHERE name='adj'), 'second reversal')$$, 'admin.errors.alreadyDone');
SELECT pg_temp.err('TRANSACTION REVERSAL: cannot reverse a reversal', $$SELECT admin_reverse((SELECT id FROM t_ids WHERE name='owner'), (SELECT id FROM t_ids WHERE name='rev'), 'reverse the reversal')$$, 'admin.errors.reverseReversal');

-- ── Moderation: ban / unban / mute / warn / freeze ──
SELECT pg_temp.err('ADMIN BAN: moderator cannot ban permanently', $$SELECT admin_ban((SELECT id FROM t_ids WHERE name='mod'), (SELECT id FROM t_ids WHERE name='p2'), NULL, 'perm ban by mod')$$, 'admin.errors.tempOnly');
SELECT pg_temp.err('ADMIN BAN: moderator cannot act on super admin', $$SELECT admin_ban((SELECT id FROM t_ids WHERE name='mod'), (SELECT id FROM t_ids WHERE name='owner'), 1, 'mod bans owner')$$, 'admin.errors.rank');
SELECT admin_ban(pg_temp.id('mod'), pg_temp.id('p2'), 2, 'Spamming chat');
SELECT pg_temp.ok('ADMIN BAN: temp ban + ADMIN_TEMP_BAN + notification', (SELECT status FROM users WHERE id = pg_temp.id('p2')) = 'banned' AND EXISTS (SELECT 1 FROM admin_audit_log WHERE code = 'ADMIN_TEMP_BAN') AND EXISTS (SELECT 1 FROM notifications WHERE user_id = pg_temp.id('p2') AND data->>'event' = 'suspended'));
SELECT pg_temp.err('ADMIN BAN: banned user cannot play', $$SELECT game_start((SELECT id FROM t_ids WHERE name='p2'), 'dice', 10)$$, 'errors.bannedUntil');
SELECT admin_unban(pg_temp.id('owner'), pg_temp.id('p2'), 'Appeal accepted');
SELECT pg_temp.ok('ADMIN UNBAN: active again + ADMIN_UNBAN', (SELECT status FROM users WHERE id = pg_temp.id('p2')) = 'active' AND EXISTS (SELECT 1 FROM admin_audit_log WHERE code = 'ADMIN_UNBAN'));
SELECT pg_temp.err('ADMIN MUTE: moderator cannot mute permanently', $$SELECT admin_mute((SELECT id FROM t_ids WHERE name='mod'), (SELECT id FROM t_ids WHERE name='p2'), NULL, 'perm mute by mod')$$, 'admin.errors.tempOnly');
SELECT admin_mute(pg_temp.id('mod'), pg_temp.id('p2'), 60, 'Cool down please');
SELECT pg_temp.ok('ADMIN MUTE: muted 60 min + ADMIN_MUTE', (SELECT muted_until FROM users WHERE id = pg_temp.id('p2')) > now() AND EXISTS (SELECT 1 FROM admin_audit_log WHERE code = 'ADMIN_MUTE'));
SELECT admin_mute(pg_temp.id('mod'), pg_temp.id('p2'), 0, 'Mute lifted early');
SELECT pg_temp.ok('ADMIN UNMUTE: ADMIN_UNMUTE', (SELECT muted_until FROM users WHERE id = pg_temp.id('p2')) IS NULL AND EXISTS (SELECT 1 FROM admin_audit_log WHERE code = 'ADMIN_UNMUTE'));
SELECT admin_warn(pg_temp.id('mod'), pg_temp.id('p2'), 'Harassment warning');
SELECT pg_temp.ok('ADMIN WARN: stored + ADMIN_WARN', EXISTS (SELECT 1 FROM user_warnings WHERE user_id = pg_temp.id('p2')) AND EXISTS (SELECT 1 FROM admin_audit_log WHERE code = 'ADMIN_WARN'));
SELECT admin_freeze_wallet(pg_temp.id('owner'), pg_temp.id('p2'), TRUE, 'Wallet review');
SELECT pg_temp.err('FREEZE WALLET: frozen wallet blocks games', $$SELECT game_start((SELECT id FROM t_ids WHERE name='p2'), 'dice', 10)$$, 'errors.walletFrozen');
SELECT admin_freeze_wallet(pg_temp.id('owner'), pg_temp.id('p2'), FALSE, 'Review done');
SELECT pg_temp.ok('AUDIT: ADMIN_FREEZE_WALLET / ADMIN_UNFREEZE_WALLET', (SELECT count(*) FROM admin_audit_log WHERE code IN ('ADMIN_FREEZE_WALLET', 'ADMIN_UNFREEZE_WALLET')) = 2);

-- ── Reports ──
INSERT INTO t_ids SELECT 'rep', report_create(pg_temp.id('p2'), 'player', pg_temp.id('p1'), 'harassment', 'Insulting players in chat');
SELECT pg_temp.ok('REPORT: created new + reporter notified', (SELECT status FROM reports WHERE id = pg_temp.id('rep')) = 'new' AND EXISTS (SELECT 1 FROM notifications WHERE user_id = pg_temp.id('p2') AND kind = 'reportUpdate'));
SELECT pg_temp.err('REPORT: cooldown 60s', $$SELECT report_create((SELECT id FROM t_ids WHERE name='p2'), 'player', (SELECT id FROM t_ids WHERE name='owner'), 'spam', 'Spamming the chat a lot')$$, 'reports.errors.cooldown');
UPDATE reports SET created_at = now() - interval '2 minutes' WHERE id = pg_temp.id('rep');
SELECT pg_temp.err('REPORT: duplicate open report', $$SELECT report_create((SELECT id FROM t_ids WHERE name='p2'), 'player', (SELECT id FROM t_ids WHERE name='p1'), 'harassment', 'Same report a second time')$$, 'reports.errors.duplicate');
SELECT pg_temp.err('REPORT: cannot report self', $$SELECT report_create((SELECT id FROM t_ids WHERE name='p2'), 'player', (SELECT id FROM t_ids WHERE name='p2'), 'spam', 'reporting myself here')$$, 'reports.errors.self');
SELECT pg_temp.err('PERMISSION: support cannot resolve reports', $$SELECT report_action((SELECT id FROM t_ids WHERE name='sup'), (SELECT id FROM t_ids WHERE name='rep'), 'resolve', 'support resolves')$$, 'admin.errors.forbidden');
SELECT report_action(pg_temp.id('mod'), pg_temp.id('rep'), 'investigate');
SELECT report_action(pg_temp.id('mod'), pg_temp.id('rep'), 'resolve', 'User warned');
SELECT pg_temp.ok('REPORT RESOLUTION: resolved + assignee + history + ADMIN_RESOLVE_REPORT',
  (SELECT status FROM reports WHERE id = pg_temp.id('rep')) = 'resolved' AND (SELECT assignee_id FROM reports WHERE id = pg_temp.id('rep')) = pg_temp.id('mod')
  AND (SELECT count(*) FROM report_events WHERE report_id = pg_temp.id('rep')) = 3 AND EXISTS (SELECT 1 FROM admin_audit_log WHERE code = 'ADMIN_RESOLVE_REPORT'));
SELECT pg_temp.ok('REPORT RESOLUTION: reporter notified of resolution', EXISTS (SELECT 1 FROM notifications WHERE user_id = pg_temp.id('p2') AND kind = 'reportUpdate' AND data->>'status' = 'resolved'));
SELECT pg_temp.err('REPORT RESOLUTION: cannot resolve twice', $$SELECT report_action((SELECT id FROM t_ids WHERE name='mod'), (SELECT id FROM t_ids WHERE name='rep'), 'resolve', 'again resolve')$$, 'admin.errors.alreadyDone');

-- ── Maintenance & rate limit ──
UPDATE system_settings SET maintenance_enabled = TRUE WHERE id = 1;
SELECT pg_temp.err('MAINTENANCE: users blocked', $$SELECT game_start((SELECT id FROM t_ids WHERE name='p2'), 'dice', 10)$$, 'errors.maintenance');
SELECT pg_temp.ok('MAINTENANCE: staff still allowed', (SELECT game_play_dice(pg_temp.id('owner'), 10, 50, TRUE)) ? 'status');
UPDATE system_settings SET maintenance_enabled = FALSE WHERE id = 1;
SELECT pg_temp.err('RATE LIMIT: more than 8 rounds per second rejected',
  $q$DO $b$ BEGIN FOR i IN 1..9 LOOP PERFORM game_play_dice((SELECT id FROM t_ids WHERE name='p2'), 1, 50, TRUE); END LOOP; END $b$$q$, 'play.errors.tooFast');

-- ── Audit log tidak bisa diubah / dihapus ──
SELECT pg_temp.err('AUDIT: append-only (update blocked)', $$UPDATE admin_audit_log SET reason = 'edited'$$, 'admin_audit_log is append-only');
SELECT pg_temp.err('AUDIT: append-only (delete blocked)', $$DELETE FROM admin_audit_log$$, 'admin_audit_log is append-only');

SELECT format('SUMMARY: %s passed, %s failed', count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok)) AS summary FROM t_result;
