-- 001 — State per user untuk API PHP (Tahap 1: akun, saldo, game, progres diputuskan server).
-- Saldo & riwayat tetap di wallets / wallet_transactions (ledger). Dokumen ini menyimpan
-- progres (XP, quest, achievement, season, riwayat sesi) dengan bentuk yang sama seperti
-- di frontend, supaya aturan PHP dan JS bisa dicocokkan 1:1.

CREATE TABLE user_docs (
  user_id      UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  progress     JSONB NOT NULL DEFAULT '{}'::jsonb,
  wallet_meta  JSONB NOT NULL DEFAULT '{}'::jsonb,   -- inventory, totalWagered, totalWon, rounds, wins, biggestWin
  profile      JSONB NOT NULL DEFAULT '{}'::jsonb,   -- frame, equipped, avatarSet
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE neon_kv (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Kode error frontend untuk ronde terbuka adalah play.errors.roundOpen.
CREATE OR REPLACE FUNCTION game_start(p_user UUID, p_game TEXT, p_bet NUMERIC) RETURNS JSONB LANGUAGE plpgsql AS $$
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
  IF p_bet > g.max_bet THEN PERFORM api_error('play.errors.maxBet'); END IF;
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
  EXCEPTION WHEN unique_violation THEN PERFORM api_error('play.errors.roundOpen');
  END;
  IF NOT u.is_test THEN
    tx := wallet_post(p_user, 'AC', -p_bet, 'bet', 'game', 'game', NULL, sid, NULL, NULL, 'game:' || sid || ':bet');
    UPDATE game_sessions SET bet_tx_id = tx WHERE id = sid;
  END IF;
  PERFORM log_event('GAME_STARTED', p_user, jsonb_build_object('session', sid, 'game', p_game, 'bet', p_bet));
  RETURN jsonb_build_object('session_id', sid, 'server_seed_hash', s.server_seed_hash, 'client_seed', s.client_seed, 'nonce', s.nonce,
                            'seed_id', s.id, 'bet_tx', tx, 'is_test', u.is_test, 'control', u.test_control);
END $$;
