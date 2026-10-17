# Testing and Verification

## How to run (local)

```bash
service postgresql start            # tests create their own databases
bash api/tests/run.sh               # PHP API suites (stage 1–9) + RNG JS-vs-PHP comparison
node tools/standalone/build.mjs dist/neon-arcade-standalone.html
node tests/run-tests.cjs            # renders every page in ID/EN + flow tests (needs the build)
node tests/i18n-keys.mjs            # every key in both languages
bash tests/run-server-mode.sh       # browser e2e: real bundle ↔ local API ↔ fresh DB (Playwright)
bash db/run-tests.sh                # phase-6 SQL tests (npm run test:db)
php api/tests/sweet_rtp.php         # Sweet RTP simulation
```

## Latest results (this audit, 2026-10-17)

| Suite | Result |
|---|---|
| `api/tests/run.sh` | **PASS** — run summaries: 114, 176, 42, 203, 40, 57 checks, all passed |
| `tests/run-tests.cjs` | **PASS** ("All tests passed") |
| `tests/i18n-keys.mjs` | **PASS** with one dynamic-prefix notice (`rewards.achievements.`) |
| `tests/run-server-mode.sh` | **NOT RUN** in this audit. Last known: 59/60 on 2026-10-11 (BUG-012) |
| `db/run-tests.sh` | **NOT RUN** in this audit |
| Production smoke | `/api/health` ok; `/api/console/state` enabled (read-only). Nothing else run on production. |

A passing build does not prove the site works; UI changes also need screenshots at phone and desktop width.

## Test matrix

| Test ID | Requirement | Procedure | Expected | Coverage | Latest result | Missing automation | Risk if untested |
|---|---|---|---|---|---|---|---|
| TV-01 | Ledger never double-pays | api suites (idempotency keys) | one ledger row per key | automated | PASS 2026-10-17 | — | money duplication |
| TV-02 | Bets within limits, MAX = min(balance, card) | stage8 + UI | over-limit refused; MAX fills min | API automated; UI manual | PASS (API) / checked 2026-10-12 (UI) | UI test for MAX | wrong bets |
| TV-03 | Provably fair RNG equal in JS and PHP | `rng_compare.mjs` | identical outputs | automated | PASS | — | unverifiable fairness |
| TV-04 | Game RTP (Keno, Tower, Cross, Pump, Sweet) | stage8, `sweet_rtp.php` | RTP in target band | automated (Sweet separate) | PASS (stage8) / NOT RUN (Sweet) | — | economy drift |
| TV-05 | 2FA TOTP + email, ticket burn, resend throttle | stage9 | as specified | automated | PASS | email delivery on production | lockouts |
| TV-06 | Strict session 3 h, Owner/Admin only, totp or verified email | stage9 | as specified | automated | PASS | — | weak staff security |
| TV-07 | Session absolute 7 days | stage9 | expiry not extended | automated | PASS | — | long-lived stolen sessions |
| TV-08 | Console: every admin action runs; errors explained; settings keep untouched values | stage9 + sweep script (local) | each action OK or clear error | partly automated | PASS 2026-10-12 | commit the sweep (`T-30`) | console "does nothing" |
| TV-09 | Feature flags enforced per endpoint | stage8 | `errors.featureOff` | automated | PASS | — | hidden features reachable |
| TV-10 | Permissions / rank checks | api suites | forbidden for lower roles | automated | PASS | DB vs JS map (TD-01) | privilege escalation |
| TV-11 | Every page renders in ID/EN without crash | `run-tests.cjs` | no errors | automated | PASS | — | blank pages |
| TV-12 | No raw i18n keys | `i18n-keys.mjs` | none missing | automated | PASS (1 notice) | runtime check `window.__missingI18n` | raw keys shown |
| TV-13 | Responsive at 390 px (no horizontal scroll) | Playwright script measuring `scrollWidth` | = viewport | manual script | PASS for Home, Games, Wallet, Profile, Settings (2026-10-12) | admin + game pages | broken mobile UI |
| TV-14 | Light / dark / potato readability | screenshots | readable | manual | partial | visual tests | unreadable panels |
| TV-15 | Release trailer once after 3 h away | Playwright with aged localStorage | shown once, not again | manual script | PASS 2026-10-12 | — | annoyance |
| TV-16 | Sign-in, register, forgot, 2FA step in a browser | `run-server-mode.sh` | green | automated | 59/60 (2026-10-11) | — | sign-in breakage |
| TV-17 | Deploy produced the right build | compare `public_html/version.json` sha with `git log` | same sha | manual | PASS 2026-10-17 (`c82f634`) | — | stale site |
| TV-18 | Backups restorable | restore a dump into a scratch DB | app boots with data | none | NOT RUN (no backup exists) | — | total data loss |
| TV-19 | Accessibility | axe / manual keyboard pass | no critical issues | none | NOT RUN | — | excluded users |
