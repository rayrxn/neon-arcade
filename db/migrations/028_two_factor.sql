-- R 1.1.1: two-step sign-in (email code or authenticator app), strict 3-hour sessions for Owners/Admins.
ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_method VARCHAR(8) CHECK (twofa_method IN ('email', 'totp'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;          -- encrypted on the server
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_pending TEXT;         -- encrypted, waiting for the first code
ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_last_step BIGINT NOT NULL DEFAULT 0;  -- a code works once
ALTER TABLE users ADD COLUMN IF NOT EXISTS twofa_enabled_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS strict_session BOOLEAN NOT NULL DEFAULT FALSE;

-- One-time codes and sign-in tickets. id = sha256 of the ticket (login) or a random id (settings codes).
CREATE TABLE IF NOT EXISTS auth_codes (
  id          CHAR(64) PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     VARCHAR(8) NOT NULL CHECK (purpose IN ('login', 'setup', 'confirm')),
  method      VARCHAR(8) NOT NULL CHECK (method IN ('email', 'totp')),
  code_hash   CHAR(64),
  attempts    INT NOT NULL DEFAULT 0,
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS auth_codes_user_idx ON auth_codes (user_id, purpose, created_at DESC);
