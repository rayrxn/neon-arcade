# Neon Arcade — PROJECT_CONTEXT (handoff)

Last audit: 2026-10-10 (after release 2.0.0, commit `a455617` on `main`). Companion files: `docs/BUGS.md` (bug tracker), `docs/ROADMAP.md` (master TODO), `docs/MASTER-UPDATE.md` (v2.0 spec checklist), `docs/OWNER-CONSOLE.md`.
Status words used: **verified** (automated test or live check), **unverified** (built, no test/visual check), **partial**, **planned**, **suspected**, **confirmed**.

## 1. Project overview
Virtual arcade website (no real money). Players use two virtual currencies: **AC** (Arcade Coin) and **AG** (Arcade Gems). Live at `https://arcadebet.my.id` (Domainesia cPanel hosting). Repo: `github.com/rayrxn/neon-arcade`. UI languages: Indonesian + English.

Stack (from code):
- **Frontend:** React 18 SPA, zustand stores, Tailwind, framer-motion, lucide icons, HashRouter (`/#/route`). Built by a custom bundler `tools/standalone/build.mjs` into one HTML file (libraries from CDN, no JSON imports). `vite.config.js` exists but production uses the standalone build.
- **Backend:** plain PHP 8.1 API (`api/index.php` router → `api/lib/*.php`, ~6.4k lines). Server-authoritative: balances, game rounds, rewards, RNG settle on the server.
- **Database:** PostgreSQL on the same host. Schema `db/schema.sql` + `db/functions.sql` (many rules live in SQL functions: `wallet_post`, `game_start`, `raise_flag`, `admin_ban`…) + migrations `db/migrations/001…013`.
- **Mail:** `api/lib/mail.php` (password reset, email verification).
- **External:** CDN libraries; optional Cloudflare Turnstile (not configured); football-data.org planned (no token).
- **Two run modes:** `SERVER_MODE` (production, talks to PHP API) and a legacy local/demo mode where `src/services/*.js` simulate the backend in localStorage. New v2 features are server-only.

Features present in code: auth (login/register/forgot/reset/verify email), wallet + transfers + exchange (incl. a Rupiah "prank" screen that never sends data), ~10 games (dice, limbo, coinflip, plinko, roulette, crash solo + global crash, mines, blackjack, case opening, case battle), provably-fair seeds, XP/levels/quests/daily/achievements, battle pass, shop + inventory + cosmetics (name/chat/profile effects, frames, badges, themes), loyalty cards (none→silver→gold→platinum→infinite→black→monarch→vivace), VIP/VVIP memberships with perks, global chat (+VIP room) with moderation, friends, leaderboards, public profiles, notifications/pop-ups, support tickets, reports, redeem codes, Roblox missions (manual verification), status page, update log, admin panel (many pages), Owner Console.

## 2. Structure
```
api/index.php            router (GET me/sync/captcha/console/state…, POST actions, game/*)
api/lib/core.php         config(), db(), tx(), fail(), q/q1/qv helpers
api/lib/auth.php         sessions, login/register, profile (status/bio), ban_vars
api/lib/account.php      forgot/reset/verify email
api/lib/state.php        wallet_post wrapper, notify, user_view
api/lib/games.php        all game logic, begin()/finish(), crash
api/lib/platform*.php    sync_view, tickets, announcements view, catalog, loyalty, memberships, perks, pass, shop
api/lib/admin.php,admin2 admin snapshot + actions (admin_action → admin_v3_action → admin_v2_action → own switch)
api/lib/v2core.php       v2: feature flags, announcements targeting, session termination, economy analytics,
                         captcha (PoW/Turnstile), crash curve, QA checks, admin_v3_action
api/lib/console.php      Owner Console (key auth, sessions, command registry, audit)
db/                      schema, functions, migrations (applied once each by tools/hosting/after-sync.sh)
src/App.jsx              routes; src/admin/AdminLayout.jsx menu (ADMIN_SECTIONS); src/admin/pages/*.jsx
src/services/server.js   api() client (auto captcha on auth paths, banned handling), sync, adminCall
src/config/roles.js      frontend permission map (must mirror DB role_permissions)
src/i18n/                id/en base + phase4…phase13 deep-merged (phase13 = v2.0 strings)
src/components/ui/Identity.jsx  PlayerName/UserTags/StyledName/CardTag; FormattedText.jsx (&codes)
src/components/loyalty/LoyaltyCard.jsx + index.css (lc-* classes)
tools/deploy.sh          builds and pushes branch `deploy`; --out DIR assembles locally
tools/owner-console.php  CLI console (--set-key / --hash)
tools/hosting/           neon-sync.sh (cron), after-sync.sh (migrations), release-reset.php, public_html-extra/ (cPanel files)
hosting/public_html/     mirror of the deployed public_html (build e8169ed, v2.7.0)
api/tests/*.php, tests/  test suites
```
Coupling to watch: permissions exist in 3 places (DB `role_permissions`, `src/config/roles.js`, `require_user_perm` calls). Game limits: `bet_limits()` (platform2) + SQL `game_start` + `games` table + `GameKit.useMaxBet`. Any new i18n key needs both `phase13.en.js` and `phase13.id.js`. `sync_view` is called every poll — keep it cheap (it now calls `deliver_announcements()`).

## 3. Completed work
Verified by tests (API suites `bash api/tests/run.sh` all pass; `node tests/run-tests.cjs` pass; i18n check pass):
- Unified max bet (card × membership, global cap 1.5B AC / 100K AG, per-game cap) — stage8.
- Banned screen + ban vars; game controls (status, betting off, new rounds off, max bets, scheduled per-game maintenance); end round with refund (idempotent); terminate player sessions; emergency shutdown; scheduled global maintenance with staff/tester bypass.
- Security flags severity/confidence policy (SQL `flag_policy`), review decisions (dismiss/false positive/review/escalate/confirm).
- Tickets: CLAIMED status, claim/take-over, priority, escalate, player close.
- Announcements targeted (@ALL/@HERE/@VIP/@VVIP/@VIP+VVIP/@TESTER/@MODERATOR/@STAFF), priority, sound, scheduled one-time delivery.
- Feature flags (OFF/TESTER/VIP/PUBLIC) storage + admin + `require_feature()`.
- Captcha: built-in proof-of-work on login/register/forgot (server-mode browser test passed); Turnstile path coded.
- Economy analytics + safeguards (flag only), error log viewer, QA center checks.
- Owner Console (web + CLI): unlock, rate limit, confirm, audit, ban even Owners, wallet ledger entry.
- Vivace tier (rank 7, 60M LXP, 1.5B/100K limits) + items; XP curve lowered (silver 2.5k, gold 15k, platinum 75k, infinite 300k); per-card daily game LXP cap; central `LXP_REWARDS`.
- Affix (prefix/suffix) rules: VVIP or staff, ≤10 visible chars, formatting codes, reserved staff words blocked.
Built, **unverified** (no browser/visual QA after these changes): admin UIs for all of the above, Platinum/Infinite/Black/Vivace card faces (one static screenshot reviewed), mini profile popover, tags-left-of-name + "+N", Settings → Name display, status/bio editor, performance presets Ultra/High/Medium/Potato, light-mode banner variants, boot coin animation, logo spacing, crash curve admin card. Server-mode browser suite last run **before** the loyalty/identity/crash commits.
Live checks: hosting log shows migrations 010–013 applied OK; `/api/console/state` responds (build 2.0.0 live) with `enabled:false`.

## 4. Incomplete / pending (details + next steps in docs/ROADMAP.md)
Partial: crash curve (no stage8 tests yet — test edit was cancelled), feature flags not enforced on feature endpoints, light-mode audit (only listed banners fixed), economy/reward rebalance (LXP only; daily/weekly/monthly AC/AG not rebalanced), logo/icon/responsive sweep.
Planned, not started: notification center categories, activity history page, session recovery UI, music on mobile, placeholder sweep, all new games (Chess PvP, Racing PvP, Horse racing, Snake, Tower, Slice, Layer, Cross the Road, Sweet/candy, Keno, Moles, Pump, Tarot), case expansion, football predictions (blocked: needs football-data.org token), full browser QA pass.
Ops pending (user action): console key not yet in `~/neon-config.php` (user ran `--hash`, line not pasted; use `--set-key`); rotate DB password (it appeared in a chat screenshot); `tools/hosting/public_html-extra/` is not yet copied by `deploy.sh` (mirror not fully 1:1, see BUG-007).

## 5. Bugs
See `docs/BUGS.md` (7 items).

## 6. Database
13 migrations, all applied on production (log 2026-10-10). Key v2 tables: `feature_flags`, `console_sessions`, `console_audit`, `captcha_used`; new columns on `games`, `system_settings`, `users` (banned_at/by, name_prefix/suffix VARCHAR(32)), `cheat_flags` (severity, confidence, reason, review_note, status VARCHAR(16)), `support_tickets` (priority, escalated, closed_by_user), `announcements` (target, priority, sound, delivered_at). KV `neon_kv` keys: economy, moderation, memberships, crash.
Integrity: all balance changes go through `wallet_post` with unique `(user_id, idempotency_key)`; refunds use key `refund:<session>`. QA center has a ledger check (warn level; release resets may legitimately break it).
Risks: migrations run inside one transaction per file (`psql -1`); `ALTER TYPE ADD VALUE` values must not be used in the same file. Release resets (`db/resets/*`) wipe balances — always ask the user first. Production data has been reset globally once (2026-10-06).

## 7. Security & reliability
Auth: session cookie (HttpOnly, SameSite=Lax), argon2id passwords, login attempt limit (5/15 min), POST requires header `X-Neon: 1` (CSRF guard). Roles: super_admin (Owner), admin, moderator, support (Helper), developer (Tester), user; granular perms in DB `role_permissions` checked by `require_user_perm`. Owner Console is a separate key, not a role.
Confirmed safe-guards: server-side bet/limit checks, idempotent rewards, captcha one-time nonces, console rate limit, affix anti-impersonation, no HTML rendering of user codes.
Indications / not audited: no CSP header; Turnstile secret not set (PoW only — weaker vs. dedicated bots); legacy local mode still ships demo logic in the bundle (not a server risk); DB password exposed in chat history (rotate).

## 8. Rules & decisions (must follow)
- Before every release ask: Tanpa reset / Reset tester dulu / Reset global (user always chose Tanpa reset so far).
- Never commit secrets; DB password only in `~/neon-config.php`. Don't reuse GitHub tokens the user pasted. Don't create accounts or enter passwords/credentials on the live site (incl. console key).
- Push everything to GitHub at the end of every task; GitHub should mirror hosting (`hosting/public_html`, `dist/` are committed).
- Don't rebuild existing features; merge duplicate requirements, newest spec wins (decisions list in docs/MASTER-UPDATE.md).
- Short, natural UI copy, ID + EN; avoid "AI-looking" UI.
- Wagered games settle on the server; skill arcades may run client-side but pay only capped XP.
- No role above Owner; console = separate authority.
- Links use `/#/route`. Build: `TAILWIND_BIN=/tmp/claude-0/twbin/tailwindcss node tools/standalone/build.mjs` (path is the old session's; reinstall tailwind CLI if missing).

## 9. Last working state
Last commits: `cebd628` release 2.0.0, `8408881` hosting mirror, `a455617` console `--set-key`. Working tree clean at audit start; uncommitted at audit end: `tools/hosting/public_html-extra/` (cPanel error pages + php.ini copied from host) and these docs.
Deploy: branch `deploy` = build `cebd628`, live. Tests: API suites pass, frontend unit render tests pass, i18n pass; browser server-mode suite not re-run after last 3 feature commits.
Check before coding: `git pull`; run `bash api/tests/run.sh` (needs local Postgres: `service postgresql start`) and `node tests/run-tests.cjs` after a build.

## 10. Roadmap
See `docs/ROADMAP.md`.

## 11. Handoff instructions
1. Read this file, then `docs/BUGS.md`, `docs/ROADMAP.md`, `docs/MASTER-UPDATE.md` (decisions section).
2. Inspect first: `api/lib/v2core.php`, `api/lib/console.php`, `api/index.php`, `src/services/server.js`, `src/components/ui/Identity.jsx`, `src/admin/pages/Operations.jsx`, `db/migrations/010…013`.
3. Don't redo: anything in §3 "verified". Re-check visually anything in §3 "unverified" before changing it.
4. First step: run the browser server-mode suite (`bash tests/run-server-mode.sh`) + a visual pass (mobile/desktop, light/dark/potato) to turn "unverified" into verified or into bugs; then ROADMAP T1–T3.
