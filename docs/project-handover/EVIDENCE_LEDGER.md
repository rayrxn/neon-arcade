# Evidence Ledger

Audit date: **2026-10-17** (Asia/Jakarta). Auditor: Claude (configured model `claude-opus-5-5`).
Every important claim in this handover package points to one of the entries below.

Confidence labels: **VERIFIED** (seen directly in this audit), **STRONGLY SUPPORTED** (several consistent sources),
**INFERRED** (reasoned from evidence, needs confirmation), **UNVERIFIED**, **CONFLICTING EVIDENCE**, **HISTORICAL ONLY**.

## Sources that were available

| Source | What it is | Coverage |
|---|---|---|
| S1 | This conversation (one long session, compacted several times; earliest visible request is the bot/chat update before 1.0.0) | 2026-10-11 → 2026-10-17. Earlier sessions only through summaries left in this one. |
| S2 | Claude's memory file about the user (`/areas/neon-arcade.md`, `/profile.md`) | Facts the user stated in earlier chats, 2026-09 → 2026-10-11 |
| S3 | Git repository `github.com/rayrxn/neon-arcade`, branch `main` (full history, 125 commits before this audit) | 2026-10-06 → 2026-10-12 |
| S4 | In-repo docs written by earlier sessions: `PROJECT_CONTEXT.md`, `docs/BUGS.md`, `docs/ROADMAP.md`, `docs/MASTER-UPDATE.md`, `docs/OWNER-CONSOLE.md`, `REPORT.md`, `README.md` | 2026-10-06 → 2026-10-12 |
| S5 | Update log in code, `src/config/changelog.js` (37 releases, 1.0.0 BETA → 3.1.1) | 2026-10-02 → 2026-10-13 |
| S6 | DomaiNesia cPanel MCP (read-only calls: account info, file listing, cron, backups, PostgreSQL list, sync log, error log, disk) | Snapshot 2026-10-17 |
| S7 | Public HTTP checks of the live site (`/api/health`, `/api/console/state`) | 2026-10-17 |
| S8 | Local test runs in this audit (API suites, frontend render tests, i18n check) against a fresh local PostgreSQL | 2026-10-17 |

## Sources that were NOT available

- The full archive of earlier Claude conversations (phases 1–6, the artifact era, Supabase/Railway planning, early UI feedback).
  Only what earlier sessions wrote into the repo docs and the memory file survives. See `OPEN_QUESTIONS.md`.
- The production database contents. The audit did not query player data on purpose (privacy, no need).
- `~/neon-config.php` on the host was **not opened**: it holds the database password.
- Billing / subscription end date of the hosting account.

## Ledger

| ID | Finding | Source | Location / reference | Observed | Confidence | Current? | Needs more checks? |
|---|---|---|---|---|---|---|---|
| E-01 | Repo is `rayrxn/neon-arcade`, default branch `main`, plus branch `deploy` (built site) | S3 | `git remote -v`, `git branch -r` | 2026-10-17 | VERIFIED | current | no |
| E-02 | Working tree clean, `main` equal to `origin/main` at `2afcd46` before this audit | S3 | `git status -sb` | 2026-10-17 | VERIFIED | current | no |
| E-03 | Git history starts 2026-10-06 (`52d04a4` "Initial commit: Neon Arcade - Phase 6 Complete"); phases 1–6 were built before Git | S3, S5 | `git log --reverse` | 2026-10-17 | VERIFIED | historical | no |
| E-04 | Live site `public_html/version.json` = build `c82f634`, version 3.1.1 | S6 | `/home/arcadebe/public_html/version.json` | 2026-10-17 | VERIFIED | current | no |
| E-05 | Host source checkout `~/neon-src` last synced to `2afcd46` (2026-10-12 08:07) — same as GitHub `main` | S6 | `~/logs/neon-sync.log` | 2026-10-17 | VERIFIED | current | no |
| E-06 | All 28 migrations (001–028) logged as applied on production; one release reset (`2026-10-06-staff-roles.global`, 8 accounts) | S6 | `~/logs/neon-sync.log` | 2026-10-17 | VERIFIED | current | no |
| E-07 | Cron: `*/7 * * * * /bin/bash $HOME/bin/neon-sync.sh` | S6 | cPanel cron list | 2026-10-17 | VERIFIED | current | no |
| E-08 | cPanel lists **no backups** for the account | S6 | `list_backups` → `[]` | 2026-10-17 | VERIFIED | current | yes — ask DomaiNesia whether server-side backups exist |
| E-09 | One PostgreSQL database `arcadebe_neon` (≈33 MB), user `arcadebe_app` | S6 | `list_postgresql_databases` | 2026-10-17 | VERIFIED | current | no |
| E-10 | Hosting plan `nimbus_go`, 15 GB quota, ≈731 MB used, domains `arcadebet.my.id` + `mcp.arcadebet.my.id` | S6 | account info, disk usage | 2026-10-17 | VERIFIED | current | no |
| E-11 | Live API healthy: `{"status":"ok","db":true}` | S7 | `GET /api/health` | 2026-10-17 | VERIFIED | current | no |
| E-12 | Owner Console is **enabled** on production (`enabled:true`) — old BUG-001 is resolved | S7 | `GET /api/console/state` | 2026-10-17 | VERIFIED | current | no |
| E-13 | API test suites all pass locally (counts 114 / 176 / 42 / 203 / 40 / 57 in the run summaries) | S8 | `bash api/tests/run.sh` | 2026-10-17 | VERIFIED | current | no |
| E-14 | Frontend render tests pass; i18n check passes with one dynamic-prefix notice `rewards.achievements.` | S8 | `node tests/run-tests.cjs`, `node tests/i18n-keys.mjs` | 2026-10-17 | VERIFIED | current | no |
| E-15 | No credentials in tracked files (scan hits were only i18n strings and test fixture passwords) | S3 | grep scan of `git ls-files` | 2026-10-17 | VERIFIED | current | no |
| E-16 | DB password appeared in a chat screenshot on ≈2026-10-10; rotation never confirmed | S4 | `docs/BUGS.md` BUG-002 | 2026-10-10 | STRONGLY SUPPORTED | maybe | yes — ask the user |
| E-17 | Stack: React 18.3 + react-router-dom 6.28 + zustand 5 + framer-motion 11 + lucide-react + Tailwind 3; custom bundler; PHP 8.1 API; PostgreSQL 16 | S3, S6 | `package.json`, `tools/standalone/build.mjs`, sync log "PHP/8.1.34" | 2026-10-17 | VERIFIED | current | no |
| E-18 | Production runs the PHP API (server mode); the browser-only "local mode" still ships in the bundle | S3 | `src/config/runtime.js`, `src/services/*.js` | 2026-10-17 | VERIFIED | current | no |
| E-19 | Older console (before `c82f634`) could reset VIP/VVIP prices to 0 when "Membership settings" was run without fields | S1, S3 | commit `c82f634`; fix in `api/lib/console2.php` `console_action_prepare` | 2026-10-12 | VERIFIED (bug) / UNVERIFIED (whether it ever ran on production) | fixed in code | yes — check live prices |
| E-20 | Seed staff login (`neon_owner` / `admin`) failed in the e2e server-mode suite (59/60 green) | S4 | `docs/ROADMAP.md` T1 | 2026-10-11 | STRONGLY SUPPORTED | unknown | yes — re-run suite |
| E-21 | Release-trailer "seen" and "last active" are stored per browser (localStorage), not per account on the server | S1, S3 | `src/components/updates/ReleaseTrailer.jsx` | 2026-10-12 | VERIFIED | current | no |
| E-22 | User stated the project is temporarily suspended for financial reasons; hosting is still online on 2026-10-17 | S1 (user's handover request), S6, S7 | — | 2026-10-17 | VERIFIED (site online) / UNVERIFIED (hosting end date) | current | yes — billing date |
| E-23 | Original deployment plan (Supabase DB + Railway/Vercel API) was replaced by a database on the DomaiNesia hosting itself | S2 | memory file lines on deployment workflow and "database connected through that hosting" | 2026-10-06 | STRONGLY SUPPORTED | historical | no |
| E-24 | Football predictions were dropped from the roadmap | S2 | memory file, 2026-10-10 | 2026-10-10 | VERIFIED (stated) | current | no |
| E-25 | Loyalty card seed values (rank, XP, max bets) come from migrations; production values may have been edited by admins | S3, S8 | `loyalty_cards` table in a fresh local DB | 2026-10-17 | VERIFIED (seed) / UNVERIFIED (production) | current | yes |
| E-26 | `react-icons` and `typescript` are listed in devDependencies but not imported anywhere in `src/` | S3 | `grep -rl react-icons src` → none | 2026-10-17 | VERIFIED | current | no |
| E-27 | Root `neon-arcade-standalone.html` was last changed 2026-10-06 (`384f60a`); `README.md` still describes the localStorage era | S3 | `git log -1 -- neon-arcade-standalone.html` | 2026-10-17 | VERIFIED | current | no |
| E-28 | `~/error_log` on host contains one PHP notice from running the CLI console non-interactively (2026-10-10) | S6 | `/home/arcadebe/error_log` | 2026-10-17 | VERIFIED | historical | no |
| E-29 | Two `saveAnnouncement` handlers exist; the one in `admin.php` is unreachable because `admin_v3_action` (v2core) answers first | S3 | `api/lib/admin.php:444`, `api/lib/v2core.php:562`, dispatch in `admin.php:131` | 2026-10-17 | VERIFIED | current | no |
| E-30 | 2FA, strict sessions, new login, console rehaul were tested locally (API tests + browser screenshots) but **not** exercised on production by Claude | S1, S8 | stage9 tests; QA screenshots in the session | 2026-10-12 | VERIFIED (local) / UNVERIFIED (production) | current | yes |
