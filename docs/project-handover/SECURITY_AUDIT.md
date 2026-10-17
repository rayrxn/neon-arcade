# Security and Data-Integrity Audit

Audit 2026-10-17, code at `2afcd46`. Read-only: no tests were run against the live site, no player data was read,
`~/neon-config.php` was not opened. Categories: **CONFIRMED** vulnerability · **SUSPICIOUS** (needs inspection) ·
**MISSING CONTROL** · **HARDENING** recommendation.

## Findings

| ID | Category | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| SEC-01 | CONFIRMED (exposure) | DB password of `arcadebe_app` was shown in a chat screenshot (~2026-10-10); rotation not confirmed | BUG-002, E-16 | Owner rotates it — **read SEC-02 first** |
| SEC-02 | CONFIRMED (design flaw, availability) | The 2FA encryption key is derived from the **DB password, DB name and console key hash** (`sec_key()` in `api/lib/security.php`). Rotating the DB password or the console key makes every stored authenticator secret undecryptable → every player with authenticator 2FA fails sign-in (only email-2FA users are unaffected). | `security.php` lines 18–22 | Before rotating: add a dedicated `'twofa_key'` to `~/neon-config.php`, change `sec_key()` to prefer it, re-encrypt secrets with a one-off script while the old key still works. Recovery if it already happened: console `2fa-off <name>` per affected player. |
| SEC-03 | HARDENING | `sec_encrypt()` stores the secret in plain text (`p:` prefix) if the PHP OpenSSL extension is missing | `security.php` line 26 | Fail closed instead (refuse to enable 2FA) |
| SEC-04 | MISSING CONTROL | No Content-Security-Policy header. Present: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options SAMEORIGIN` | `hosting/public_html/.htaccess` | Add a CSP that allows the CDN hosts in `index.html`; test thoroughly (inline scripts in the single-file build) |
| SEC-05 | HARDENING | Login lock counts failures **per email** (5 / 15 min). An attacker can lock a known player out | `auth.php` ~line 129 | Add an IP dimension or a captcha step instead of a hard lock |
| SEC-06 | HARDENING | Anti-bot is the built-in proof-of-work only; Cloudflare Turnstile code exists but no keys are set | `v2core.php` captcha, D-14 | Add Turnstile keys when bot sign-ups appear |
| SEC-07 | SUSPICIOUS | Seeded staff accounts (`neon_owner` … `neon_tester`) started with password `admin` (forced change on first login) | migration 003, README | Confirm every seeded account changed its password or is banned/unused |
| SEC-08 | HARDENING | Audit log and wallet ledger are protected by SQL triggers (`audit_no_update` on `admin_audit_log`, `wtx_immutable` on `wallet_transactions`) in `db/schema.sql`, installed with the initial DB (sync log 2026-10-06). Presence on production not re-queried. | `db/schema.sql` lines 111, 436 | Confirm with `\dS admin_audit_log` when someone has DB access |
| SEC-09 | MISSING CONTROL | **No backups** listed for the hosting account | E-08, BUG-011 | See `DATA_PRESERVATION.md` |
| SEC-10 | HARDENING | Local demo mode ships in the bundle (DevTools can change local-mode data) — not a server risk because production uses `SERVER_MODE` | TD-03 | Remove when convenient |
| SEC-11 | HARDENING | `mcp.arcadebet.my.id` exposes the cPanel MCP endpoint used by Claude | E-10 | Keep its credentials private; disable when not in use during the suspension |

## Controls verified in code (and by tests where noted)

- Passwords: argon2id; console key: argon2id hash only, never stored in plain text.
- Sessions: HttpOnly, `SameSite=Lax`, `Secure` on HTTPS; absolute 7 days; strict 3 h for Owner/Admin (stage9).
- CSRF: every POST needs header `X-Neon: 1` (`api/index.php`).
- 2FA: TOTP RFC 6238 (±1 step, single use via `totp_last_step`), email codes hashed (HMAC) with expiry, 5 wrong codes burn the sign-in ticket, 60 s resend throttle (stage9).
- Console: key unlock limited to 5 failures / 15 min per IP, 30-minute idle sessions, confirmation for destructive commands, every line audited (`console_audit`), errors logged to `error_log` table.
- Authorization: `require_user_perm()` per action, `adm_target()` rank check (staff cannot act on equal/higher roles), feature flags enforced per endpoint.
- SQL: PDO prepared statements throughout (spot-checked); interpolated values in the console are integer-cast.
- Uploads: only the profile banner — data URL, JPEG/PNG/WebP, ≤700 KB, real image check with `getimagesizefromstring`, stored in the DB (not on disk).
- User text: formatting codes rendered by a safe renderer (no HTML); affix rules block staff words.
- Economy: every balance change via SQL `wallet_post` with a unique idempotency key; refunds idempotent; server-side bet limits.

## Economy manipulation and replay

- Double requests: idempotency keys on ledger rows; game rounds settle once (tests in api suites).
- Skill arcades: client-run, server plausibility checks, payouts capped (D-03).
- Admin power is audited; the console's `neon_console` system actor cannot sign in (`password_hash = '!console'`).

## Secrets in the repository

None found (E-15). The handover package contains no credentials. Paths of secret files are named (`~/neon-config.php`, `~/.pgpass`) without values.
