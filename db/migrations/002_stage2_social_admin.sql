-- 002 — Tahap 2: transfer, redeem, jackpot, chat, teman, laporan, tiket, notifikasi, admin di server.

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mute_reason TEXT;

-- Transfer antar pemain. AC langsung; AG ditahan 60 detik (pending) lalu diselesaikan server.
-- Transfer yang ditolak limit harian tetap tercatat (status failed) tanpa menyentuh saldo.
CREATE TABLE transfers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id      UUID NOT NULL REFERENCES users(id),
  to_id        UUID NOT NULL REFERENCES users(id),
  currency     currency_code NOT NULL,
  amount       NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  note         VARCHAR(80) NOT NULL DEFAULT '',
  status       VARCHAR(8) NOT NULL CHECK (status IN ('success', 'pending', 'failed')),
  reason       VARCHAR(24),
  release_at   TIMESTAMPTZ,
  send_tx      UUID REFERENCES wallet_transactions(id),
  receive_tx   UUID REFERENCES wallet_transactions(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at   TIMESTAMPTZ,
  CHECK (from_id <> to_id)
);
CREATE INDEX transfers_from_idx ON transfers (from_id, created_at DESC);
CREATE INDEX transfers_to_idx ON transfers (to_id, created_at DESC);
CREATE INDEX transfers_pending_idx ON transfers (release_at) WHERE status = 'pending';

-- Jackpot feed (kemenangan besar) — juga diumumkan di chat.
CREATE TABLE jackpots (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  UUID NOT NULL REFERENCES users(id),
  amount   NUMERIC(18,2) NOT NULL,
  game     VARCHAR(32) NOT NULL,
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX jackpots_time_idx ON jackpots (at DESC);

-- Chat: data tambahan (id jackpot untuk pesan tipe jackpot) & alasan hapus; pesan yang disembunyikan per user.
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS delete_reason TEXT;
ALTER TABLE chat_messages ALTER COLUMN body TYPE VARCHAR(400);
CREATE TABLE chat_hidden (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_id  UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, message_id)
);

-- Tiket support: riwayat status, info tambahan (id sesi/transaksi teks bebas).
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS info JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Laporan: report dari pemain boleh tanpa batas karakter minimum untuk laporan sistem (anti-cheat).
ALTER TABLE reports ADD COLUMN IF NOT EXISTS category VARCHAR(16);

-- Warning: alasan saat dicabut.
ALTER TABLE user_warnings ADD COLUMN IF NOT EXISTS remove_reason TEXT;

-- Flag anti-cheat: penggabungan kejadian sejenis.
ALTER TABLE cheat_flags ADD COLUMN IF NOT EXISTS last_at TIMESTAMPTZ;
ALTER TABLE cheat_flags ADD COLUMN IF NOT EXISTS review_reason TEXT;
ALTER TABLE cheat_flags ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Pembatalan sesi oleh admin tidak lagi wajib reversal / admin (disimpan di game_sessions.detail juga).
ALTER TABLE session_invalidations ALTER COLUMN admin_id DROP NOT NULL;

-- Kode redeem: waktu dibuat. Kode bawaan dari config/economy.js disalin ke tabel.
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE redeem_codes ADD COLUMN IF NOT EXISTS built_in BOOLEAN NOT NULL DEFAULT FALSE;
INSERT INTO redeem_codes (code, rewards, max_uses, per_user, expires_at, active, built_in) VALUES
  ('WELCOME500', '[{"kind":"AC","amount":500}]', NULL, 1, NULL, TRUE, TRUE),
  ('LUCKY777', '[{"kind":"AC","amount":777}]', NULL, 1, '2026-12-31T23:59:59+07:00', TRUE, TRUE),
  ('NEONARCADE', '[{"kind":"AC","amount":1000},{"kind":"item","id":"neon-frame"}]', NULL, 1, '2026-12-31T23:59:59+07:00', TRUE, TRUE),
  ('GEMDROP', '[{"kind":"AG","amount":1}]', 3, 1, '2026-12-31T23:59:59+07:00', TRUE, TRUE),
  ('RAMADAN25', '[{"kind":"AC","amount":2500}]', NULL, 1, '2025-04-30T23:59:59+07:00', TRUE, TRUE)
ON CONFLICT (code) DO NOTHING;

-- Pengumuman: waktu dibuat.
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Audit log: label target bebas sudah ada (target_label). Admin "system" untuk tindakan otomatis → admin_id boleh NULL.
ALTER TABLE admin_audit_log ALTER COLUMN admin_id DROP NOT NULL;
-- Aksi rutin staff (balas tiket, assign) dicatat dengan alasan "—".
ALTER TABLE admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_reason_check;
ALTER TABLE admin_audit_log ADD CONSTRAINT admin_audit_log_reason_check CHECK (char_length(reason) >= 1);

-- raise_flag: kejadian sejenis dalam 10 menit digabung; risiko tinggi → notifikasi user + kasus moderasi.
CREATE OR REPLACE FUNCTION raise_flag(p_user UUID, p_type TEXT, p_risk flag_risk, p_session UUID, p_expected TEXT, p_submitted TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE fid UUID;
BEGIN
  SELECT id INTO fid FROM cheat_flags
   WHERE user_id = p_user AND type = p_type AND status = 'open' AND coalesce(last_at, created_at) > now() - interval '10 minutes'
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    UPDATE cheat_flags SET occurrences = occurrences + 1, last_at = now() WHERE id = fid;
    RETURN fid;
  END IF;
  INSERT INTO cheat_flags (user_id, type, risk, session_id, expected, submitted, evidence)
  VALUES (p_user, p_type, p_risk, p_session, p_expected, p_submitted,
          jsonb_build_object('session', p_session, 'expected', p_expected, 'submitted', p_submitted, 'recordedAt', (extract(epoch FROM now()) * 1000)::bigint))
  RETURNING id INTO fid;
  PERFORM log_event('SECURITY_EVENT', p_user, jsonb_build_object('flag', p_type, 'risk', p_risk, 'sessionId', p_session));
  IF p_risk IN ('high', 'critical') THEN
    PERFORM notify_user(p_user, 'security', jsonb_build_object('event', 'suspicious'));
    INSERT INTO reports (reporter_id, target_type, target_user_id, session_id, flag_id, reason, category, description, priority, evidence)
    VALUES (NULL, 'game', p_user, p_session, fid, 'cheating', 'cheating', 'Anti-cheat: ' || p_type || ' (' || p_risk || ')',
            CASE WHEN p_risk = 'critical' THEN 'urgent' ELSE 'high' END, jsonb_build_object('expected', p_expected, 'submitted', p_submitted));
    IF p_risk = 'critical' AND (SELECT auto_freeze_critical FROM system_settings WHERE id = 1) THEN
      UPDATE users SET wallet_frozen = TRUE WHERE id = p_user;
      INSERT INTO admin_audit_log (code, admin_id, admin_role, action, target_user, entity_id, previous, next, reason)
      VALUES ('SYSTEM_FREEZE_WALLET', NULL, 'super_admin', 'wallet.freeze', p_user, fid::text, 'false', 'true', 'Auto-freeze: ' || p_type);
    END IF;
  END IF;
  RETURN fid;
END $$;
