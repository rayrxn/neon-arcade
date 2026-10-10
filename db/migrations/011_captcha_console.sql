-- Anti-bot captcha: one-time challenge nonces (built-in proof-of-work fallback when Turnstile is not configured).
CREATE TABLE IF NOT EXISTS captcha_used (
  nonce  VARCHAR(32) PRIMARY KEY,
  at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS captcha_used_at_idx ON captcha_used (at);
