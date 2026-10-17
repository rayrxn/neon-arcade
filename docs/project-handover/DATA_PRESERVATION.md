# Data Preservation

The project is **temporarily suspended for financial reasons** (owner, 2026-10-17). Suspension is **not** permission to delete
data, reset the economy, wipe accounts or let the database disappear.

## What exists, and where

| Data | Where | Preserved by GitHub? | Status 2026-10-17 |
|---|---|---|---|
| Source code, migrations, build, docs | GitHub `rayrxn/neon-arcade` (`main`, `deploy`) and host `~/neon-src`, `~/public_html` | **Yes** | VERIFIED identical (E-04, E-05) |
| Player accounts, password hashes, 2FA secrets | PostgreSQL `arcadebe_neon` on the host | **No** | DB online (E-11) |
| AC/AG balances, ledger, game rounds | same DB (`wallets`, `wallet_transactions`, `game_sessions`…) | **No** | online |
| Loyalty XP/cards, memberships, inventory, cosmetics, banners (images stored in DB) | same DB | **No** | online |
| Chat, friends, notifications, tickets, reports, flags | same DB | **No** | online |
| Admin audit log, console audit | same DB (`admin_audit_log`, `console_audit`) | **No** | online |
| Config overrides (economy, memberships, moderation, crash, bots, release, captcha, luck) | DB table `neon_kv` | **No** (defaults are in code) | online |
| Secrets (DB password, console key hash) | `~/neon-config.php`, `~/.pgpass` | **No — never commit** | present |
| cPanel extras (error pages, php.ini) | host + `tools/hosting/public_html-extra/` | Yes | VERIFIED |
| Release video `neon-arcade-1.0.0-reel.mp4` | `public_html` + `deploy` branch | Yes | VERIFIED in deploy tree |

Database size: about 33 MB (E-09). **cPanel shows no backups** (E-08). Whether DomaiNesia keeps server-side backups is unknown.

## What is NOT guaranteed

- Nothing in GitHub preserves player data. If the hosting account expires or is deleted, every account and balance is gone.
- The hosting renewal date is unknown to Claude (billing not accessible).
- No restore procedure has ever been tested.

## Recommended preservation steps (need the owner's approval)

1. **Dump the database** from cPanel Terminal (read-only for the data):
   ```bash
   mkdir -p ~/backups && pg_dump -h localhost -U arcadebe_app -Fc -f ~/backups/arcadebe_neon-$(date +%F).dump arcadebe_neon
   ```
   (`~/.pgpass` already holds the credentials for the cron user.) Then **download** the file through cPanel File Manager and keep it
   offline (encrypted drive). Do not commit it to GitHub — it contains password hashes, emails and 2FA secrets.
2. Download a copy of `~/neon-config.php` to the same private place (needed to decrypt 2FA secrets, see SEC-02).
3. Optional: cPanel "Backup" → full account backup, if the plan allows it.
4. Before the hosting lapses, put the site in maintenance with a message (console `maintenance on <message>`), so players are informed.
5. Record in this file the date and location of every backup taken.

## Restore procedure (untested, for a new host)

1. PostgreSQL 16, create DB and user; `pg_restore -d <db> <file>.dump`.
2. Clone the repo into `~/neon-src`; publish `deploy` branch contents to the web root.
3. Write `~/neon-config.php` with the new DB credentials **and the old values needed by `sec_key()`** (or the dedicated `twofa_key` once SEC-02 is fixed), plus the console key hash.
4. Install the cron from `tools/hosting/neon-sync.sh`; the migrations table (`neon_migrations`) prevents re-running applied migrations.
5. Check `/api/health`, sign in with a staff account, run console `qa`.

## Rules while suspended

- No release resets, no `resetCurrency`, no `releaseReset`, no `emergencyShutdown` without the owner's explicit request.
- Do not delete hosting files or the `deploy` branch.
- Keep this file updated with backup records.

## Backup log

| Date | What | Where | By |
|---|---|---|---|
| — | none recorded yet | — | — |
