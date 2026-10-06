-- Password reset and email verification by email link.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS email_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        VARCHAR(8) NOT NULL CHECK (kind IN ('reset', 'verify')),
  token_hash  CHAR(64) NOT NULL UNIQUE,        -- sha256 of the token; the token itself is only in the email
  email       CITEXT NOT NULL,                 -- address the link was sent to
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS email_tokens_user_idx ON email_tokens (user_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS email_tokens_ip_idx ON email_tokens (ip, created_at DESC);
