-- One email can hold up to 3 accounts (sign in with the username, or with the email when the password picks one account).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

CREATE OR REPLACE FUNCTION api_register(p_username TEXT, p_email TEXT, p_password_hash TEXT) RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE uid UUID; first BOOLEAN;
BEGIN
  IF p_username !~ '^[A-Za-z0-9_]{3,16}$' THEN PERFORM api_error('validation.usernameFormat'); END IF;
  IF (SELECT count(*) FROM users WHERE email = p_email) >= 3 THEN PERFORM api_error('errors.emailTaken'); END IF;
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
