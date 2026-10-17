# Project Timeline

Sources: update log in code (`src/config/changelog.js`, E-03), Git history (E-03), hosting sync log (E-05/E-06),
earlier handover docs (`PROJECT_CONTEXT.md`, `docs/*`), the memory file (E-23, E-24) and this conversation.
Version numbers are the **internal** numbers. From 3.0.0 on they are shown to players as "x.y.z Release"
(3.0.0 → "1.0.0 Release", 3.1.1 → "1.1.1 Release"). Before 3.0.0 they were shown as "x.y.z BETA".

## Before Git (2026-10-02 → 2026-10-06) — HISTORICAL ONLY

| Period | What happened | Evidence |
|---|---|---|
| Phases 1–3 | React SPA built as a Claude artifact. Two currencies AC + AG, Send/Receive, wallet history, Top Up screen that never charges, redeem codes, Global Chat, Jackpot, profile/settings, ID/EN, dark/light/system. All data in `localStorage`. | `README.md` (phase tables) |
| Phase 4 | 10 playable games (Case Opening, Case Battle, Crash, Plinko, Mines, Dice, Limbo, Coinflip, Roulette, Blackjack), provably-fair RNG, XP/levels, daily, quests, achievements, sound, admin panel with RBAC and audit log, test mode. | `README.md` |
| Phase 6 | "Master prompt" phase: atomic service layer, idempotent ledger, reveal gate, anti-cheat flags, seasons, history, leaderboards, friends, inventory, notifications, support, status page. PostgreSQL schema + SQL functions written and tested (83/83) but **not connected** to the live site. | `REPORT.md` |
| Plan at the time | Database on Supabase, API on Railway/Vercel, Git → GitHub → SSH to DomaiNesia. **Superseded** (see 2026-10-06). | memory (E-23) |
| 1.0.0 BETA → 1.4.0 (2026-10-02 → 10-06) | Update log entries: BETA launch, accounts on the server, chat/friends/profiles, levels/quests/loyalty, shop/gems/memberships. | changelog |

## Server era (Git history)

| Date | Version | Milestone | Commits / evidence |
|---|---|---|---|
| 2026-10-06 | — | Repo created (`52d04a4`). Deploy script for DomaiNesia, DB compat layer (no pgcrypto/citext on host), cron sync from GitHub. | `c9da46d`, `c71464a`, `6c67852` |
| 2026-10-06 | — | **Decision:** database lives on the DomaiNesia host (PostgreSQL), API is plain PHP on the same host. Stage 1 server mode: accounts, wallet, games, daily, quests, XP decided by PHP. | `0d8c937`, sync log "database awal terpasang" |
| 2026-10-06 | — | Stage 2: social + whole admin panel on the server. Staff roles with shimmer tags, seeded staff accounts, forced password change. **Global release reset** run once (8 accounts). | `384f60a`, `7cf0e46`, sync log |
| 2026-10-06/07 | 1.4–1.8 | Platform v2 (moderation, AG play, converter, loyalty, roles, shop, emotes, missions, memberships), Global Crash, battle pass, VIP/VVIP perks, banner upload, Silver purchasable, password reset + email verification, Monarch card, name effects, update log pop-up, rank bling, Rupiah exchange prank. | `cb1a77b` … `5589bde`, migrations 004–009 |
| 2026-10-10 | — | Potato mode (Auto/On/Off). | `10f950c` |
| 2026-10-10 | 2.0.0 | Core v2 (unified max bet, game controls, session termination, emergency shutdown, scheduled maintenance), **Owner Console** (web + CLI), Loyalty v2 (**Vivace above Monarch**, redesigned Platinum/Infinite/Black), Identity v2 (tags left of names, mini profile, formatting codes, prefix/suffix), crash ×10,000 curve. GitHub starts mirroring hosting `public_html`. First handover docs written. | `90e552d` … `a455617`, migrations 010–013 |
| 2026-10-10 | 2.1–2.5 | Reward rebalance, feature flags enforced per endpoint, notification groups, activity history, session recovery; Keno/Tower/Cross the Road/Pump; Tarot/Sweet; Horse Racing shared rounds. Football predictions **dropped**. | migrations 014–018, memory (E-24) |
| 2026-10-11 | 2.6–2.9.16 | Economy v2.6, Chess PvP (+ practice engine), skill arcades (Snake, Slice, Layer, Moles) then arcade stakes, profile effects, Layer/Moles disabled, case expansion (Pocket/Jackpot/Mythic, battles up to 5 cases + Crazy), coin redesign, Plinko multi-ball, anti-bot check simplified, AC renamed "Arcade Chips", release check. | migrations 019–025 |
| 2026-10-11 | 3.0.0 ("1.0.0 Release") | Out of BETA. Release gate (`publishRelease`), release trailer video, new update log with the whole journey, house players ("bots") in chat and feeds, change email while unverified, 3 accounts per email, new logo. | migrations 026–027 |
| 2026-10-11/12 | 3.1.1 ("1.1.1 Release") | New sign-in page, 2FA (authenticator or email), absolute 7-day sessions, strict 3-hour sessions for Owner/Admin, Owner Console rebuilt with every Admin action as guided forms, trailer cutscene once after 3+ h away, MAX bet = min(balance, card limit), wallet overflow fix, update log shows real version. | migration 028, commits `9129f87` … `c82f634` |
| 2026-10-12 | 3.1.1 | Console end-to-end fix: every Admin action verified, settings actions keep untouched values. Last code change before this audit. | `c82f634`, `2afcd46` |
| 2026-10-17 | — | User reports the project is **temporarily suspended for financial reasons** and asks for this handover. Site still online (E-11, E-22). | this conversation |

## Version planned vs shipped

- "1.0.0 Release" was planned for **12 October 2026, 21:00 UTC** (memory). The release gate (migration 026) let staff see it first;
  whether it is published on production was **not re-checked** in this audit (the update log on the live build shows 3.1.1 entries, which players only see after publishing — INFERRED published).
- The 3.1.1 update-log entry is dated 2026-10-13 although it was deployed on 2026-10-12 (cosmetic, see `BUG_REGISTRY.md` BUG-016).
