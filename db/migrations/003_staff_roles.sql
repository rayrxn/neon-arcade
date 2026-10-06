-- 003 — Role staf: Owner (super_admin), Admin, Moderator, Helper (support), Tester (developer).
-- Nilai enum tetap; yang berubah label, izin, urutan, dan akun staf awal.

-- Akun yang wajib ganti password sebelum boleh melakukan apa pun (akun staf awal).
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Urutan: Tester di bawah Helper (tidak boleh menindak siapa pun).
UPDATE role_rank SET rank = 1 WHERE role = 'developer';

-- Izin baru: reset rilis (hanya Owner). Helper boleh memberi warning. Tester hanya test mode.
INSERT INTO role_permissions (role, permission) VALUES ('super_admin', 'release.reset'), ('support', 'users.warn') ON CONFLICT DO NOTHING;
DELETE FROM role_permissions WHERE role = 'developer' AND permission = 'games.manage';

-- Akun staf awal. Password "admin" → wajib diganti saat login pertama.
DO $$
DECLARE
  r RECORD; uid UUID;
  pw CONSTANT TEXT := '$argon2id$v=19$m=65536,t=4,p=1$Z2tIU0VESjBoQ3EvVy43dg$unBGZw7wP2RCU3YHN4oF+cqxA4ai3DGm3zKHoOnk6bM';
BEGIN
  FOR r IN SELECT * FROM (VALUES
      ('neon_owner',  'Owner',     'owner@arcadebet.my.id',     'super_admin', 'mint',   FALSE),
      ('neon_admin',  'Admin',     'admin@arcadebet.my.id',     'admin',       'rose',   FALSE),
      ('neon_mod',    'Moderator', 'moderator@arcadebet.my.id', 'moderator',   'sunset', FALSE),
      ('neon_helper', 'Helper',    'helper@arcadebet.my.id',    'support',     'cyan',   FALSE),
      ('neon_tester', 'Tester',    'tester@arcadebet.my.id',    'developer',   'violet', TRUE)
    ) v(username, display, email, role, preset, is_test)
  LOOP
    CONTINUE WHEN EXISTS (SELECT 1 FROM users WHERE username = r.username OR email = r.email);
    uid := api_register(r.username, r.email, pw);
    UPDATE users SET role = r.role::user_role, display_name = r.display, is_test = r.is_test, must_change_password = TRUE,
                     avatar = jsonb_build_object('kind', 'preset', 'id', r.preset)
     WHERE id = uid;
    INSERT INTO admin_audit_log (code, admin_id, admin_role, action, target_user, previous, next, reason)
    VALUES ('SYSTEM_ROLE', NULL, 'super_admin', 'user.role', uid, '"user"', to_jsonb(r.role), 'Akun staf awal');
  END LOOP;
END $$;
