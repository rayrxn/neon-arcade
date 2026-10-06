-- Uji constraint integritas (jalankan setelah schema.sql). Setiap blok yang seharusnya gagal
-- dibungkus DO ... EXCEPTION supaya script lanjut dan mencetak PASS/FAIL.
\set ON_ERROR_STOP on
INSERT INTO users (id, username, display_name, email, password_hash) VALUES
  ('00000000-0000-0000-0000-000000000001', 'cadmin1', 'Admin', 'ca@x.test', 'pbkdf2$1$x'),
  ('00000000-0000-0000-0000-000000000002', 'cplayer1', 'Player', 'cp@x.test', 'pbkdf2$1$x');
UPDATE users SET role = 'super_admin' WHERE username = 'cadmin1';
INSERT INTO wallets (user_id) VALUES ('00000000-0000-0000-0000-000000000002');
INSERT INTO wallet_transactions (id, user_id, currency, amount, balance_before, balance_after, type, category, source, idempotency_key)
  VALUES ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'AC', 250000, 10000, 260000, 'reward', 'level', 'level', 'milestone:L15:15');
INSERT INTO level_milestones (user_id, milestone_type, milestone_level, reward_id)
  VALUES ('00000000-0000-0000-0000-000000000002', 'L15', 15, '10000000-0000-0000-0000-000000000001');

CREATE OR REPLACE FUNCTION expect_fail(label TEXT, stmt TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE 'FAIL  %', label;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'PASS  % (%)', label, SQLERRM;
END $$;

SELECT expect_fail('milestone never paid twice', $q$INSERT INTO wallet_transactions (id, user_id, currency, amount, balance_before, balance_after, type, category, idempotency_key) VALUES ('10000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000002', 'AC', 250000, 260000, 510000, 'reward', 'level', 'other-key'); INSERT INTO level_milestones (user_id, milestone_type, milestone_level, reward_id) VALUES ('00000000-0000-0000-0000-000000000002', 'L15', 15, '10000000-0000-0000-0000-000000000009')$q$);
SELECT expect_fail('idempotency key unique per user', $q$INSERT INTO wallet_transactions (user_id, currency, amount, balance_before, balance_after, type, category, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000002', 'AC', 250000, 260000, 510000, 'reward', 'level', 'milestone:L15:15')$q$);
SELECT expect_fail('milestone level must match type', $q$INSERT INTO level_milestones (user_id, milestone_type, milestone_level, reward_id) VALUES ('00000000-0000-0000-0000-000000000002', 'L50', 15, '10000000-0000-0000-0000-000000000001')$q$);
SELECT expect_fail('balance can never go negative', $q$UPDATE wallets SET ac_balance = -1 WHERE user_id = '00000000-0000-0000-0000-000000000002'$q$);
SELECT expect_fail('transaction history cannot be overwritten', $q$UPDATE wallet_transactions SET amount = 1 WHERE id = '10000000-0000-0000-0000-000000000001'$q$);
SELECT expect_fail('transactions cannot be deleted', $q$DELETE FROM wallet_transactions WHERE id = '10000000-0000-0000-0000-000000000001'$q$);
INSERT INTO wallet_transactions (user_id, currency, amount, balance_before, balance_after, type, category, admin_id, reversal_of, idempotency_key)
  VALUES ('00000000-0000-0000-0000-000000000002', 'AC', -250000, 260000, 10000, 'reversal', 'reversal', '00000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'reversal:10000000-0000-0000-0000-000000000001');
SELECT expect_fail('a transaction can only be reversed once', $q$INSERT INTO wallet_transactions (user_id, currency, amount, balance_before, balance_after, type, category, reversal_of, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000002', 'AC', -250000, 300000, 50000, 'reversal', 'reversal', '10000000-0000-0000-0000-000000000001', 'reversal:again')$q$);
SELECT expect_fail('admin adjustment requires admin id', $q$INSERT INTO wallet_transactions (user_id, currency, amount, balance_before, balance_after, type, category, idempotency_key) VALUES ('00000000-0000-0000-0000-000000000002', 'AC', 5, 10000, 10005, 'adjust', 'admin', 'adj:1')$q$);
SELECT expect_fail('forced results only for test accounts', $q$UPDATE users SET test_control = 'win' WHERE username = 'cplayer1'$q$);
INSERT INTO admin_audit_log (code, admin_id, admin_role, action, target_user, reason) VALUES ('ADMIN_BAN', '00000000-0000-0000-0000-000000000001', 'super_admin', 'user.ban', '00000000-0000-0000-0000-000000000002', 'cheating confirmed');
SELECT expect_fail('audit log cannot be edited', $q$UPDATE admin_audit_log SET reason = 'x'$q$);
SELECT expect_fail('audit log cannot be deleted', $q$DELETE FROM admin_audit_log$q$);
SELECT expect_fail('cannot report yourself', $q$INSERT INTO reports (reporter_id, target_type, target_user_id, reason, description) VALUES ('00000000-0000-0000-0000-000000000002', 'player', '00000000-0000-0000-0000-000000000002', 'spam', 'reporting myself now')$q$);
INSERT INTO reports (reporter_id, target_type, target_user_id, reason, description) VALUES ('00000000-0000-0000-0000-000000000001', 'player', '00000000-0000-0000-0000-000000000002', 'spam', 'spamming the chat');
SELECT expect_fail('duplicate open report rejected', $q$INSERT INTO reports (reporter_id, target_type, target_user_id, reason, description) VALUES ('00000000-0000-0000-0000-000000000001', 'player', '00000000-0000-0000-0000-000000000002', 'spam', 'spamming again now')$q$);
SELECT expect_fail('friendship pair unique', $q$INSERT INTO friendships (requester_id, addressee_id, status) VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', 'pending'); INSERT INTO friendships (requester_id, addressee_id, status) VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'pending')$q$);
SELECT expect_fail('daily reward once per day', $q$INSERT INTO daily_claims (user_id, claim_day, streak_day, streak) VALUES ('00000000-0000-0000-0000-000000000002', '2026-10-06', 1, 1); INSERT INTO daily_claims (user_id, claim_day, streak_day, streak) VALUES ('00000000-0000-0000-0000-000000000002', '2026-10-06', 2, 2)$q$);
SELECT expect_fail('equip only owned items', $q$INSERT INTO items (id, kind, source) VALUES ('gold-frame', 'frame', 'daily') ON CONFLICT DO NOTHING; INSERT INTO user_equipped (user_id, slot, item_id) VALUES ('00000000-0000-0000-0000-000000000002', 'frame', 'gold-frame')$q$);
