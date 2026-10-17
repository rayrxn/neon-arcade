# Feature Inventory

Audit 2026-10-17. Status words: **COMPLETE AND VERIFIED** (automated test and/or browser check in a session),
**IMPLEMENTED, NOT FULLY VERIFIED**, **PARTIALLY IMPLEMENTED**, **BROKEN**, **DISCUSSED, NOT IMPLEMENTED**, **PLANNED**,
**BLOCKED**, **DEFERRED**, **DEPRECATED**, **UNKNOWN**. "Verified" below means verified **locally** (tests or QA screenshots);
nothing was exercised on the production site by Claude except the two read-only API checks (E-11, E-12).

Paths are relative to the repo root. Test suites: `api/tests/*` (PHP), `tests/run-tests.cjs` (UI), `tests/run-server-mode.sh` (browser e2e).

## 1. Accounts, sessions, security

| ID | Feature | Latest requirement | Implementation | Status | Gaps / bugs | Tests | Confidence |
|---|---|---|---|---|---|---|---|
| F-01 | Register / login / logout | Username or email login; argon2id; 5 failed logins / 15 min lock; anti-bot proof-of-work on auth pages only | `api/lib/auth.php`, `v2core.php` captcha, `src/components/auth/AuthForm.jsx` | COMPLETE AND VERIFIED | Turnstile path coded, no keys configured | api_test, stage8 | VERIFIED |
| F-02 | Sign-in page redesign (R 1.1.1) | "Fresh look", no overlap, no emoji, desktop stage + mobile layout | `src/pages/AuthPage.jsx`, `AuthShowcase.jsx`, `index.css` `.auth-*` | COMPLETE AND VERIFIED (screenshots desktop + mobile) | — | render tests | VERIFIED |
| F-03 | 2FA | Authenticator (TOTP, QR) or email code; enabled in Settings → Security; email needs a verified address | `api/lib/security.php`, `src/components/settings/TwoFactorCard.jsx`, `src/utils/qr.js`, migration 028 | IMPLEMENTED, NOT FULLY VERIFIED | Email delivery on production untested; recovery = console `2fa-off` | stage9 (57 checks), browser flow locally | VERIFIED (local) |
| F-04 | Session lifetime | Absolute 7 days, no sliding renewal | `SESSION_TTL_S` in `auth.php`, `session_ttl_for()` | COMPLETE AND VERIFIED | — | stage9 | VERIFIED |
| F-05 | Strict sessions | Owner/Admin only; 3 h; 2FA code (authenticator **or** verified email) on every sign-in; off in Settings or via console | `security.php` `api_strict_session`, `strict_method_ok`, console `strict` | COMPLETE AND VERIFIED (local) | — | stage9 | VERIFIED |
| F-06 | Password reset / email verification / change email | Reset picks one of up to 3 accounts on the email; change email while unverified | `account.php`, migrations 007, 027, `SettingsPage.jsx` | IMPLEMENTED, NOT FULLY VERIFIED | Mail deliverability depends on host | api suites | STRONGLY SUPPORTED |
| F-07 | Up to 3 accounts per email | — | migration 027 | COMPLETE AND VERIFIED | — | api suites | VERIFIED |
| F-08 | Ban / mute / freeze / banned screen | Banned screen shows reason, duration, by whom; logout only | `admin.php`, `BannedScreen`, chat mod notices | COMPLETE AND VERIFIED | — | stage8 | VERIFIED |

## 2. Economy, wallet, loyalty

| ID | Feature | Latest requirement | Implementation | Status | Gaps / bugs | Tests | Confidence |
|---|---|---|---|---|---|---|---|
| F-10 | Two currencies | AC = "Arcade Chips" (renamed 2.9.15), AG = "Arcade Gems"; virtual only | ledger SQL `wallet_post`; UI `BalanceChip`, `Currency` | COMPLETE AND VERIFIED | — | all suites | VERIFIED |
| F-11 | Converter AC → AG | Default 25,000 AC = 1 AG, min 1 AG, max 200 AG/day; card raises the daily cap; withdrawals AG only | `KV_DEFAULTS['economy']` (`platform2.php`), `Converter.jsx` | COMPLETE AND VERIFIED | Wallet converter overflowed on phones — fixed 2026-10-12 | stage suites, mobile screenshot | VERIFIED |
| F-12 | Transfers (send/receive) | AG held 60 s, daily limits grow with the card | `platform*.php`, `SendModal.jsx` | IMPLEMENTED, NOT FULLY VERIFIED | — | stage2 | STRONGLY SUPPORTED |
| F-13 | Max bet | Unified: card × membership, global cap 1.5B AC / 100K AG, per-game cap; **MAX button = min(balance, card limit)** | `bet_limits()`, SQL `game_start`, `GameKit.useMaxBet` | COMPLETE AND VERIFIED | — | stage8; browser check (10,000 balance → MAX 10,000) | VERIFIED |
| F-14 | Loyalty cards | Order none → silver → gold → platinum → infinite → black → monarch → **vivace** (top). Seed: XP 0 / 2.5k / 12k / 50k / 175k / 500k / 1.5M / 4M; max bet AC 250k / 500k / 1M / 2.5M / 8.5M / 20M / 50M / 125M | table `loyalty_cards` (migrations 004, 008, 012, 014), `LoyaltyCard.jsx`, `index.css` `lc-*` | IMPLEMENTED, NOT FULLY VERIFIED | Production values may have been edited; Vivace key strip may poke out (BUG-009) | stage suites | VERIFIED (seed) |
| F-15 | Card redesigns | Platinum, Infinite, Black, Monarch polish, Vivace "concert" card | `1ec6a14`, `index.css` | IMPLEMENTED, NOT FULLY VERIFIED | Only static screenshots were reviewed in 2.0.0; no full visual pass since | — | STRONGLY SUPPORTED |
| F-16 | Rewards (daily/weekly/monthly/one-time, card bonuses, LXP) | Central config; LXP daily 100, daily quest 40, weekly quest 200; per-card daily game LXP cap | migration 014/019, `LXP_REWARDS` | COMPLETE AND VERIFIED | — | stage8 | VERIFIED |
| F-17 | Memberships VIP / VVIP | Bought with **real money, handled manually**: the player's request opens a support ticket quoting the price in **Rupiah** (default Rp149.999 VIP / Rp499.999 VVIP, 30 days); the Owner activates it after payment. VVIP includes VIP, private manager | `KV_DEFAULTS['memberships']`, `membership_request()` / `membership_set()` in `platform2.php` | IMPLEMENTED, NOT FULLY VERIFIED | Live prices unverified; old console bug could zero prices (BUG-010); console labels the price as AG (BUG-017) | stage suites | VERIFIED (code) |
| F-18 | Economy safeguards + analytics | Flag → review → action; analytics in admin and console | `v2core.php` `economy_analytics` | COMPLETE AND VERIFIED | — | stage8, console sweep | VERIFIED |
| F-19 | Luck boost "Jam Gacor" | Admin win bonus (global / per player), RNG untouched | `admin_v4_action` setLuck | COMPLETE AND VERIFIED | — | stage8 | VERIFIED |
| F-20 | Redeem codes | AC/AG/item codes, max uses, per user, expiry, members-only | `admin.php` createCode, `RedeemPage.jsx` | COMPLETE AND VERIFIED | AG codes capped at 10 | stage suites | VERIFIED |
| F-21 | Top Up | Shows packages, **never charges** (no gateway) | `TopUpModal`, `services/payments.js` | DEFERRED (by design) | — | — | VERIFIED |
| F-22 | Rupiah exchange | Prank flow, sends nothing | `5589bde` | COMPLETE (prank) | — | — | VERIFIED |

## 3. Games

Registered in `src/config/games.js` (23 slugs, 22 playable). All wagered games settle on the server.

| ID | Games | Status | Notes |
|---|---|---|---|
| F-30 | Dice, Limbo, Coinflip, Roulette, Plinko (multi-ball), Mines, Blackjack | COMPLETE AND VERIFIED | Port of phase-4 engine; RNG checked JS vs PHP (`rng_compare.mjs`) |
| F-31 | Crash (solo) + Global Crash (shared rounds, max ×10,000, presets, scheduled points) | COMPLETE AND VERIFIED | stage8 crash block |
| F-32 | Case Opening + Case Battle (Pocket/Jackpot/Mythic cases, up to 5 cases, Crazy mode) | COMPLETE AND VERIFIED | stage8 "Cases T13" |
| F-33 | Keno, Tower ("ladder"), Cross the Road, Pump | COMPLETE AND VERIFIED | RTP checked in stage8 |
| F-34 | Tarot, Sweet (tumble slot) | COMPLETE AND VERIFIED | `api/tests/sweet_rtp.php` |
| F-35 | Horse Racing (shared rounds, live `/pulse`) | COMPLETE AND VERIFIED | migration 018 |
| F-36 | Chess PvP + practice engine (Normal/Medium/Hard) | IMPLEMENTED, NOT FULLY VERIFIED | Rules perft-checked; PvP flow not browser-tested in this audit |
| F-37 | Skill arcades Snake, Slice (+ stakes) | IMPLEMENTED, NOT FULLY VERIFIED | Server score checks, capped payouts |
| F-38 | Layer, Moles | DEFERRED (disabled by migration 025) | Re-enable in Admin → Operations |
| F-39 | Reme | PLANNED (no loader since phase 4) | Shows "coming soon" |
| F-40 | Racing PvP | DISCUSSED, NOT IMPLEMENTED | Listed in `docs/MASTER-UPDATE.md` G |
| F-41 | Football predictions | DEPRECATED (dropped, D-13) | — |
| F-42 | Provably fair seeds | COMPLETE AND VERIFIED | commit–reveal, HMAC-SHA256 |

## 4. Profiles, identity, social

| ID | Feature | Status | Notes / evidence |
|---|---|---|---|
| F-50 | Public profile `/u/:username`, status, bio, frames, badges, themes, profile/name/chat effects | IMPLEMENTED, NOT FULLY VERIFIED | `Identity.jsx`, migrations 009, 013, 024 |
| F-51 | Mini profile popover (avatar/name click; keyboard, mobile, privacy; "house player" label for bots) | IMPLEMENTED, NOT FULLY VERIFIED | `ProfilePopover`; 2.0.0 marked unverified, bot label added 3.0.0 |
| F-52 | Staff tags left of the name, viewer limit with "+N", shimmer colours per role | IMPLEMENTED, NOT FULLY VERIFIED | `705577a` |
| F-53 | Prefix / suffix (Settings; VVIP or staff; ≤10 visible chars; reserved words) + formatting codes | COMPLETE AND VERIFIED | stage8 affix tests |
| F-54 | Global Chat (+ VIP room), mentions, emotes, moderation, slow mode, filter terms, staff action lines | COMPLETE AND VERIFIED | stage2/8; polling, not real-time |
| F-55 | House players ("bots") with gamertags, cards, memberships, banners/frames, multilingual chat, game feed, jackpot announcements | IMPLEMENTED, NOT FULLY VERIFIED | `src/services/bots.js`, KV `bots`; console `setBots` |
| F-56 | Friends, block, favourites, leaderboards (global/weekly/monthly/per game/friends/season) | COMPLETE AND VERIFIED | stage2 |
| F-57 | Notifications (categories, unread per filter, pop-ups), activity history | COMPLETE AND VERIFIED | v2.1 |

## 5. Admin, moderation, operations

| ID | Feature | Status | Notes / evidence |
|---|---|---|---|
| F-60 | Admin panel (33 sections, `src/admin`) with granular permissions | IMPLEMENTED, NOT FULLY VERIFIED | Many screens never visually re-checked after 2.0.0 |
| F-61 | **Owner Console** (the "Supreme Console" in some specs): key unlock, 30-min idle, rate limit, audit, confirm destructive; web forms for **every** admin action + 33 server tools; CLI | COMPLETE AND VERIFIED (local, every action run end to end 2026-10-12) | `console.php`, `console2.php`, `SystemConsolePage.jsx`; enabled on production (E-12) |
| F-62 | Tickets (claim, assign, priority, notes, escalate, player close; OPEN → CLAIMED → IN_PROGRESS → WAITING_FOR_USER → RESOLVED → CLOSED) | COMPLETE AND VERIFIED | stage8 |
| F-63 | Reports + moderation queue | COMPLETE AND VERIFIED | stage2 |
| F-64 | Audit log (who/what/when/target/before/after/reason) | IMPLEMENTED, NOT FULLY VERIFIED | `audit_log()`; append-only by convention, no DB trigger verified on production |
| F-65 | Feature flags OFF / TESTER / VIP / PUBLIC, enforced per endpoint | COMPLETE AND VERIFIED | `FEATURE_ROUTES`, stage8 |
| F-66 | Maintenance (global, per game, schedule, message, countdown, staff/tester bypass) + emergency shutdown | COMPLETE AND VERIFIED | stage8 |
| F-67 | Security flags (severity, confidence, review decisions) | COMPLETE AND VERIFIED | stage8 |
| F-68 | Announcements (targets @ALL/@HERE/@VIP/@VVIP/@MEMBERS/@TESTER/@MODERATOR/@STAFF, priority, sound, schedule, 3-day default end) | COMPLETE AND VERIFIED | stage8 |
| F-69 | QA center, error log, monitoring | COMPLETE AND VERIFIED | `qa_run()` |
| F-70 | Test mode (test accounts, force win/loss, simulate) | COMPLETE AND VERIFIED | console sweep |
| F-71 | Release gate + release reset | COMPLETE AND VERIFIED | migration 026, `release_reset()` |
| F-72 | Status page `/status` | COMPLETE AND VERIFIED | — |

## 6. Experience, visuals, settings

| ID | Feature | Status | Notes |
|---|---|---|---|
| F-80 | Dark / Light / System theme | PARTIALLY IMPLEMENTED | Light variants exist for listed banners; remaining dark panels not audited (BUG-004) |
| F-81 | Light-mode banners ("light banner") | PARTIALLY IMPLEMENTED | `.pass-hero`, `.mission-card`, `.event--*`, `.update-banner` |
| F-82 | Performance presets Ultra / High / Medium / **Potato** (+ Auto with frame-rate detection) | IMPLEMENTED, NOT FULLY VERIFIED | `PerformanceController.jsx` |
| F-83 | Reduced motion | PARTIALLY IMPLEMENTED | Checks exist in `main.jsx`, `index.css`, `AuthBackdrop`, `FormattedText`; not audited site-wide |
| F-84 | Sound + music (mobile unlock on gesture) | IMPLEMENTED, NOT FULLY VERIFIED | Needs a real iOS/Android tap test |
| F-85 | Release trailer (2-min video), hold-to-skip ring, cutscene once after 3+ h away, banner "Watch release video" | COMPLETE AND VERIFIED (local) | per-device storage (E-21) |
| F-86 | Update log (header scroll icon, journey modal for milestones, compact for others, real version title) | COMPLETE AND VERIFIED | — |
| F-87 | Loading screen coin, new logo (chip ring), favicons | IMPLEMENTED, NOT FULLY VERIFIED | — |
| F-88 | Responsive layout | PARTIALLY IMPLEMENTED | Main pages checked at 390 px on 2026-10-12 (no horizontal scroll on Home, Games, Wallet, Profile, Settings); admin and game pages not swept |
| F-89 | Accessibility | UNKNOWN | aria attributes in ~80 files; no WCAG audit |
| F-90 | i18n ID + EN | COMPLETE AND VERIFIED | `tests/i18n-keys.mjs` |
| F-91 | Session recovery (resume open round after reload, global open-round banner) | COMPLETE AND VERIFIED | v2.2 |

## Note on F-17 (memberships)
`membership_request()` (`api/lib/platform2.php`) turns a membership purchase into a support ticket:
"I'd like to get VIP (Rp149.999). Please send payment instructions…". This is the **only real-money flow** in the project and it is manual.
The current live prices were not checked in this audit.
