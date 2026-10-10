# Neon Arcade — Master Update (v2.0) checklist

Combined from four specs (Master Prompt, Critical Addendum, Major Update Master, Next Update ID) plus the
user's notes: Turnstile/anti-bot captcha, and "decide per game whether it is online (server/shared) or local".
Status: `[x]` implemented + verified · `[~]` implemented, partly verified · `[!]` blocked (reason given) · `[ ]` open.

## Decisions where the specs disagree
- **Owner Console vs roles.** Spec 1 says "not a role above Owner"; the Addendum says "authority above every role".
  Both hold: the console is a separate authority boundary (its own console key, stored only as a hash in
  `~/neon-config.php` on the server). Holding it is not a user role. No role above Owner exists.
  Ordinary Owners (super_admin) cannot reach it without the key.
- **Light Mode banners.** The newest specs require banners to follow the light palette. This replaces the earlier
  "keep dark panels dark" approach: each banner gets a light variant.
- **"Black Infinite".** The project has two tiers, Infinite and Black. Both get their own redesign.
- **Role hierarchy names.** Existing roles are kept (super_admin = Owner, admin, moderator, support = Helper,
  developer = Tester). MASTER from the specs maps to Owner; nothing is renamed.
- **Online vs local games.** Every wagered game settles on the server (anti-cheat). "Online" = one shared round
  for everyone (Crash, Horse Racing) or a PvP match (Chess, Racing). "Local" = a private round per player
  (Mines, Keno, Pump, Tower, Cross the Road, Sweet, Tarot). Skill arcades (Snake, Moles, Slice, Layer) run
  in the browser and submit scores with server-side plausibility checks; they pay only capped XP, never AG.

## A. Core fixes
- [x] Max bet: one limit (card × membership, global cap, per-game cap) shown = enforced
- [x] Ban: dedicated banned screen (reason, duration, date, issued by, logout only); backend blocks
- [x] Maintenance: global + per game + schedule + message + countdown + admin/tester bypass + preview
- [x] Game status: ON / OFF / maintenance / disable betting / disable new sessions / force end / emergency shutdown
- [x] Security events: severity INFO..CRITICAL, reason/trigger/evidence/confidence, dismiss / false positive / review / escalate
- [x] Emergency session termination (permission, confirm, audit)
- [x] Tickets: claim, assign, priority, internal notes, escalate, reopen; OPEN→CLAIMED→IN PROGRESS→WAITING→RESOLVED→CLOSED
- [~] Granular permissions enforced server-side; audit log (who/what/when/target/before/after/reason/result)
- [~] Anti double reward / idempotency review
- [ ] Unresolved placeholders sweep ({max_ac}, {value}, …)

## B. Owner Console
- [x] Separate console key auth, short sessions, rate limit, CSRF header, audit every command
- [x] Web console `/system-console` (terminal UI, history, autocomplete, help, confirm destructive)
- [x] CLI launcher `tools/owner-console.php` (runs on the host over SSH/cPanel terminal)
- [x] Command registry with real handlers + command reference doc

## C. Economy & loyalty
- [~] Economy audit + rebalance (central config), analytics (circulation, generated/spent/removed, avg/median, top, distribution)
- [x] Economy safeguards FLAG → REVIEW → ACTION
- [x] Loyalty XP curve: early fast → prestige; existing players never demoted
- [x] Rewards rebalance (daily / weekly / monthly / one-time / membership / loyalty / quest)
- [x] Vivace tier (above Monarch): card, badge, profile effect, rewards, XP requirement, benefits
- [x] Card redesign: Platinum, Infinite, Black, Monarch polish, Vivace superior; progressive quality

## D. Identity & profile
- [x] Roles left of the name; viewer setting "max visible role badges" with +N overflow
- [x] Prefix/suffix in Settings (not Membership), preview/save/reset, anti-impersonation
- [x] Formatting codes &k &l &o &n &m &r + colors (safe renderer, no HTML)
- [x] Mini profile popover on avatar/name click (positioning, keyboard, mobile, privacy)
- [x] Right-side icons become explained badges
- [x] Profile customization with live preview (status, bio, frames, badges, theme)

## E. UI / UX
- [~] Logo spacing (expanded, rail, mobile)
- [~] Light/Dark theme audit, banners theme-aware
- [x] Loading screen coin
- [ ] Icon / spacing / responsive sweep
- [x] Performance presets Ultra / High / Medium / Potato (+ auto)

## F. Systems
- [x] Announcements @HERE/@ALL/@VIP/@VVIP/@VIP+VVIP/@TESTER/@MODERATOR, priority, sound, schedule, preview, history
- [x] Feature flags OFF / TESTER ONLY / VIP ONLY / PUBLIC (backend enforced)
- [x] Notification center categories
- [x] Activity history (games, AG, LXP, rewards, cases, bets, security)
- [x] Session recovery
- [x] Error monitoring (API errors, failed requests, client crashes, auth failures)
- [~] Music on mobile/tablet (unlock on gesture, fallback)
- [x] Crash max ×10,000 with admin-configured curve/presets (Games + Settings)
- [x] Jam Gacor: admin luck boost (global / per player) as a win bonus, RNG untouched
- [x] Staff actions (ban/kick/mute) shown in global chat
- [x] Anti-bot captcha (Cloudflare Turnstile when keys are configured, built-in challenge otherwise)

## G. Games
- [ ] Case opening + battle expansion
- [ ] Chess PvP (+ Normal / Medium / Hard practice engine)
- [ ] Racing PvP
- [x] Horse Racing (shared rounds, migration 018)
- [x] Keno, Tower, Cross the Road, Pump (server-settled, RTP-checked in stage8)
- [x] Tarot, Sweet (tumble slot, RTP via api/tests/sweet_rtp.php)
- [ ] Snake, Slice, Layer, Moles

## H. QA
- [x] QA center (admin) running real checks
- [ ] Test suites updated + new tests; browser checks at mobile / tablet / desktop, light + dark + potato


## Status after release 2.0.0 (2026-10-10) — where to continue
Done & deployed: core v2 (A), Owner Console (B, see docs/OWNER-CONSOLE.md — needs a console key hash in ~/neon-config.php to switch on),
Vivace + card redesigns + XP curve (C), identity v2 (D), perf presets, boot coin, captcha (PoW built-in; add `'captcha' => ['turnstile_site' => …, 'turnstile_secret' => …]` to neon-config to use Cloudflare Turnstile).
Crash curve: backend + admin card done (v2core.php `crash_cfg`, action `setCrashConfig`); stage8 crash tests not written yet.
Open next: notification center categories, activity history page, session recovery UI, music on mobile, placeholder/icon/responsive sweep,
full light-mode audit of remaining dark panels, reward rebalance (daily/weekly/monthly), feature-flag enforcement on each feature endpoint
(`require_feature()` exists, not yet called from chat/transfers/shop…), section G games (Chess, Racing, Horse, Snake, Tower, Slice, Layer,
Cross the Road, Sweet, Keno, Moles, Pump, Tarot, case expansion), football predictions (needs football-data.org token), browser QA pass.
