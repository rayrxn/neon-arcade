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
- [ ] Max bet: one limit (card × membership, global cap, per-game cap) shown = enforced
- [ ] Ban: dedicated banned screen (reason, duration, date, issued by, logout only); backend blocks
- [ ] Maintenance: global + per game + schedule + message + countdown + admin/tester bypass + preview
- [ ] Game status: ON / OFF / maintenance / disable betting / disable new sessions / force end / emergency shutdown
- [ ] Security events: severity INFO..CRITICAL, reason/trigger/evidence/confidence, dismiss / false positive / review / escalate
- [ ] Emergency session termination (permission, confirm, audit)
- [ ] Tickets: claim, assign, priority, internal notes, escalate, reopen; OPEN→CLAIMED→IN PROGRESS→WAITING→RESOLVED→CLOSED
- [ ] Granular permissions enforced server-side; audit log (who/what/when/target/before/after/reason/result)
- [ ] Anti double reward / idempotency review
- [ ] Unresolved placeholders sweep ({max_ac}, {value}, …)

## B. Owner Console
- [ ] Separate console key auth, short sessions, rate limit, CSRF header, audit every command
- [ ] Web console `/system-console` (terminal UI, history, autocomplete, help, confirm destructive)
- [ ] CLI launcher `tools/owner-console.php` (runs on the host over SSH/cPanel terminal)
- [ ] Command registry with real handlers + command reference doc

## C. Economy & loyalty
- [ ] Economy audit + rebalance (central config), analytics (circulation, generated/spent/removed, avg/median, top, distribution)
- [ ] Economy safeguards FLAG → REVIEW → ACTION
- [ ] Loyalty XP curve: early fast → prestige; existing players never demoted
- [ ] Rewards rebalance (daily / weekly / monthly / one-time / membership / loyalty / quest)
- [ ] Vivace tier (above Monarch): card, badge, profile effect, rewards, XP requirement, benefits
- [ ] Card redesign: Platinum, Infinite, Black, Monarch polish, Vivace superior; progressive quality

## D. Identity & profile
- [ ] Roles left of the name; viewer setting "max visible role badges" with +N overflow
- [ ] Prefix/suffix in Settings (not Membership), preview/save/reset, anti-impersonation
- [ ] Formatting codes &k &l &o &n &m &r + colors (safe renderer, no HTML)
- [ ] Mini profile popover on avatar/name click (positioning, keyboard, mobile, privacy)
- [ ] Right-side icons become explained badges
- [ ] Profile customization with live preview (status, bio, frames, badges, theme)

## E. UI / UX
- [ ] Logo spacing (expanded, rail, mobile)
- [ ] Light/Dark theme audit, banners theme-aware
- [ ] Loading screen coin
- [ ] Icon / spacing / responsive sweep
- [ ] Performance presets Ultra / High / Medium / Potato (+ auto)

## F. Systems
- [ ] Announcements @HERE/@ALL/@VIP/@VVIP/@VIP+VVIP/@TESTER/@MODERATOR, priority, sound, schedule, preview, history
- [ ] Feature flags OFF / TESTER ONLY / VIP ONLY / PUBLIC (backend enforced)
- [ ] Notification center categories
- [ ] Activity history (games, AG, LXP, rewards, cases, bets, security)
- [ ] Session recovery
- [ ] Error monitoring (API errors, failed requests, client crashes, auth failures)
- [ ] Music on mobile/tablet (unlock on gesture, fallback)
- [ ] Crash max ×10,000 with admin-configured curve/presets
- [ ] Anti-bot captcha (Cloudflare Turnstile when keys are configured, built-in challenge otherwise)

## G. Games
- [ ] Case opening + battle expansion
- [ ] Chess PvP (+ Normal / Medium / Hard practice engine)
- [ ] Racing PvP
- [ ] Horse Racing (shared rounds)
- [ ] Snake, Tower, Slice, Layer, Cross the Road, Sweet, Keno, Moles, Pump, Tarot
- [ ] Live football prediction (football-data.org; needs API token)

## H. QA
- [ ] QA center (admin) running real checks
- [ ] Test suites updated + new tests; browser checks at mobile / tablet / desktop, light + dark + potato
