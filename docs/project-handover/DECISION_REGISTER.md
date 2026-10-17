# Decision Register

Latest explicit decision wins. Superseded decisions stay here so they are not proposed again.
Evidence IDs refer to `EVIDENCE_LEDGER.md`.

| ID | When | Decision | Why / problem | Alternatives | Status | Still valid? | Evidence | Cost of changing it |
|---|---|---|---|---|---|---|---|---|
| D-01 | 2026-10 (phases) | AC and AG are **virtual only**, no real-money value, no cash-out. Top Up never charges; the "Rupiah exchange" screen is a prank that sends nothing. Exception: VIP/VVIP memberships are requested through a support ticket priced in Rupiah and activated manually by the Owner after payment (`membership_request()`). | Legal/safety; it is an arcade, not gambling | Real payments | Implemented | yes | `README.md`, `5589bde` | Real money changes the legal nature of the site — needs the owner and legal review |
| D-02 | 2026-10-06 | Database = PostgreSQL **on the DomaiNesia host**; API = plain PHP on the same host | Owner wanted everything on the hosting he already paid for | Supabase + Railway/Vercel (earlier plan, dropped) | Implemented | yes | E-23, `6c67852` | Full backend rewrite |
| D-03 | 2026-10-06 | **Server-authoritative**: balances, rounds, RNG, rewards settle on the server; skill arcades may run in the browser but the server checks scores and caps payouts | Anti-cheat | Client-side logic (phase 1–6 era) | Implemented | yes | `docs/MASTER-UPDATE.md` decisions | Re-opens every cheat vector |
| D-04 | 2026-10-06 | Deploy = push `main`, `tools/deploy.sh` builds branch `deploy`, host cron (every 7 min, DomaiNesia minimum) pulls both and runs new migrations once | Shared hosting, no CI runner | SSH push, GitHub Actions | Implemented | yes | E-07, `tools/hosting/neon-sync.sh` | Re-plumb deployment |
| D-05 | 2026-10-06 | Polling instead of WebSocket (15 s, 4 s in chat) | Shared hosting has no WebSocket | WebSocket server | Implemented | yes | `README.md` | Needs a different host |
| D-06 | 2026-10 | Before every release ask: **Tanpa reset / Reset tester dulu / Reset global**. The owner has always chosen "tanpa reset" since the 2026-10-06 global reset. | Protect player data | — | Standing rule | yes | memory, `PROJECT_CONTEXT.md` §8 | Data loss |
| D-07 | 2026-10 | Push every change to GitHub `main`; the repo mirrors hosting `public_html` 1:1 (`hosting/public_html`, `dist/` committed) | Owner uses the repo with graphify and as a copy of the live site | Build artifacts out of Git | Implemented | yes | memory, `8408881` | Breaks owner's workflow |
| D-08 | 2026-10-10 | Owner Console is a **separate authority** (own key, hash in `~/neon-config.php`), not a role. No role above Owner. | Specs disagreed ("not a role" vs "above every role") | Super-role | Implemented | yes | `docs/MASTER-UPDATE.md` | Security model change |
| D-09 | 2026-10-10 | Claude **never sets credentials** (console key, passwords) on the live site; the owner runs `--set-key` himself | Credential safety | Claude sets key | Standing rule | yes | `docs/BUGS.md` BUG-001 | — |
| D-10 | 2026-10-10 | Vivace is the top loyalty tier, **above Monarch**. Order: none → silver → gold → platinum → infinite → black → monarch → vivace. "Black Infinite" in specs = two separate tiers (Infinite and Black), both redesigned. | Owner request | One merged "Black Infinite" tier | Implemented | yes | `1ec6a14`, `loyalty_cards` ranks (E-25) | Card ranks and limits |
| D-11 | 2026-10-10 | Light mode: banners get light variants (replaces "keep dark panels dark") | Newer spec | Keep dark banners | Partially implemented | yes | `docs/MASTER-UPDATE.md` | — |
| D-12 | 2026-10-10 | Prefix/suffix live in **Settings**, not Membership; VVIP or staff only, ≤10 visible chars, reserved staff words blocked; formatting codes `&k &l &o &n &m &r` + colours rendered safely (no HTML) | Anti-impersonation | Membership page | Implemented | yes | `705577a` | — |
| D-13 | 2026-10-10 | Football predictions **dropped** | Needed a paid/registered API token | football-data.org | Dropped | yes | E-24 | — |
| D-14 | 2026-10-10 | Anti-bot check only on login/sign-up (built-in proof-of-work; Cloudflare Turnstile when keys exist); never kick signed-in players | Owner request | Captcha everywhere | Implemented | yes | memory, v2core captcha | — |
| D-15 | 2026-10-11 | Versions: beta labelled "x.y.z BETA"; internal 3.0.0 shipped as **"1.0.0 Release"**, 3.1.1 as "1.1.1 Release" | Marketing | — | Implemented | yes | `src/config/build.js` `versionLabel` | Update-log labels |
| D-16 | 2026-10-11 | AC renamed "Arcade Coin" → **"Arcade Chips"** | Owner | — | Implemented | yes | memory, 2.9.15 | — |
| D-17 | 2026-10-11 | House players ("bots") are human-like: normal gamertags, no "bot" label in chat; their mini profile says "house player" | Busier chat without lying in the profile | Visible bot label | Implemented | yes | S1, 3.0.0 changelog | Trust/transparency |
| D-18 | 2026-10-11 | One email can hold **3 accounts**; password reset lets you pick the account. Admin snapshot keys users by **id**, not email (that was the "admin panel won't open" bug) | Owner request | 1 account per email | Implemented | yes | migration 027, S1 | — |
| D-19 | 2026-10-11 | Sessions are **absolute 7 days** (no sliding renewal). Owner/Admin may switch on **strict sessions**: 3 h and a 2FA code on every sign-in, using authenticator **or** email (email must be verified). Strict mode is only for `super_admin` and `admin`. It can be turned off in Settings or from the console. | Owner request (R 1.1.1) | Sliding sessions; authenticator-only strict mode (changed same day) | Implemented | yes | `api/lib/security.php`, stage9 | — |
| D-20 | 2026-10-11/12 | Release trailer: cutscene **once per player**, the first time they arrive after 3+ hours away (first visit counts). Skip = hold the centre button / Space 3 s, no long-press menu on phones. | Owner request, corrected twice the same night ("every time after 3 h" → "only once") | Play every 3 h | Implemented | yes | `ReleaseTrailer.jsx`, `UpdateLog.jsx` | — |
| D-21 | 2026-10-11 | MAX bet = **min(balance, Loyalty Card limit)** | Earlier rule "MAX = card limit, not balance" (2.9.x) was half right | MAX = card limit only (superseded) | Implemented | yes | `GameKit.jsx`, `eaac7b3` | — |
| D-22 | 2026-10-11 | Owner Console must be a **superset of the Admin panel** (every admin action, plus server tools), with guided forms and plain-language help | Owner request (R 1.1.1 phase B) | Text-only terminal | Implemented and verified end to end locally | yes | `console2.php`, `c82f634` | — |
| D-23 | 2026-10-11 | Update log: big "journey" modal only for milestone releases (x.0.0); later releases use the compact log | Owner said the 1.1.1 log was too long | One big modal for every release | Implemented | yes | `UpdateLog.jsx` | — |
| D-24 | ongoing | No emoji as UI icons, no "AI-looking" UI, no overlapping elements, short natural copy in ID + EN | Owner feedback, repeated | — | Standing rule | yes | memory, S1 | Owner rejects the work |
| D-25 | 2026-10-11 | Layer and Moles disabled "for now" (players see a pop-up; re-enable in Admin → Operations) | Reason not preserved in the repo | Keep them live | Implemented (migration 025) | probably | migration 025 | — |
| D-26 | 2026-10-11 | Credits: "made by 21 Development Project — Founder & Executive Director: Ray — Co-Founder & Creative Director: Mirelix" | Owner request | — | Used in the release video | yes | memory | — |

## Superseded / corrected (do not bring back)

| Old idea | Replaced by | Evidence |
|---|---|---|
| localStorage-only "live" site (artifact) | PHP API + PostgreSQL on host | D-02 |
| Supabase / Railway / Vercel | Host-only stack | E-23 |
| MAX bet = card limit regardless of balance | D-21 | S1 |
| Strict sessions require the authenticator app | Authenticator **or** verified email | D-19 |
| Trailer every time after 3 h away | Once per player | D-20 |
| Console = text terminal with ~30 commands | Console = every Admin action + forms | D-22 |
| Football predictions | Dropped | D-13 |
| Vivace "60M LXP, 1.5B AC / 100K AG" (migration 012, 2.0.0) | Reward rebalance v2.1 (migration 014): 4,000,000 LXP, 125M AC / 5,000 AG max bet | migrations 012 vs 014 (E-25) |
