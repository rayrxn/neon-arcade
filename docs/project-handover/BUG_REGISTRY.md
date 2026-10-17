# Bug Registry

Audit 2026-10-17. Continues the numbering of the old `docs/BUGS.md` (BUG-001 … BUG-009), which stays as history.
Severity P0–P3 (impact) is separate from Priority (when to do it). Only confirmed defects are "Open"; risks without a
reproduced failure are marked **Risk** or **Suspected**.

## Summary

| ID | Title | Sev | Prio | Status | Verification |
|---|---|---|---|---|---|
| BUG-001 | Owner Console disabled on production | P2 | — | **Resolved** (console enabled) | VERIFIED 2026-10-17 (E-12) |
| BUG-002 | DB password visible in an old chat screenshot | P1 | High | Open — owner action | UNVERIFIED whether rotated |
| BUG-003 | Raw key `missions.status.none` on the Roblox mission card | P3 | Low | Fixed, not visually verified | — |
| BUG-004 | Some dark panels unreadable in light mode | P2 | Medium | Partly fixed | not audited site-wide |
| BUG-005 | Crash curve had no tests | — | — | Fixed (stage8) | VERIFIED |
| BUG-006 | Feature flags not enforced on endpoints | — | — | Fixed (`FEATURE_ROUTES`) | VERIFIED |
| BUG-007 | Mirror not 1:1 with host | — | — | Fixed (`public_html-extra/`) | VERIFIED (E-05) |
| BUG-008 | New DB ran briefly with old site code | — | — | Resolved (process rule) | — |
| BUG-009 | Vivace piano-key strip slightly outside the card frame | P3 | Low | Suspected | weak evidence (one screenshot) |
| BUG-010 | Old console could reset VIP/VVIP prices and benefits | P1 | **High** | Fixed in code `c82f634`; production state unknown | check live prices |
| BUG-011 | No backups listed for the hosting account | P0 (data) | **Highest** | Open — risk | VERIFIED (E-08) |
| BUG-012 | E-2E suite: seeded staff login fails (59/60) | P3 | Medium | Open, cause unknown | from 2026-10-11 run |
| BUG-013 | Console API errors for actions printed raw i18n keys / generic errors | P2 | — | Fixed `c82f634` | VERIFIED (stage9) |
| BUG-014 | Console wrong field specs (~15 actions could not run), `off` parsed as false, `users`/`announce` SQL errors | P1 | — | Fixed `c82f634` | VERIFIED (every action run) |
| BUG-015 | Admin panel would not open when one email held two accounts | P1 | — | Fixed (admin snapshot keyed by id) | VERIFIED in session |
| BUG-016 | 3.1.1 update-log entry dated 2026-10-13 though shipped 2026-10-12 | P3 | Low | Open | VERIFIED (`changelog.js`) |
| BUG-017 | Console "Membership settings" labels prices as AG; they are Rupiah | P3 | Low | Open | VERIFIED (`console2.php` vs `membership_request()`) |
| BUG-018 | Release-trailer "seen" state is per device, not per account | P3 | Low | Open (known limitation) | VERIFIED (E-21) |
| BUG-019 | i18n check reports dynamic prefix `rewards.achievements.` | P3 | Low | Open, probably false positive | VERIFIED output |
| BUG-020 | Rotating the DB password or console key breaks every authenticator-2FA secret | P1 | **High (before BUG-002 fix)** | Open | VERIFIED in code (`sec_key()`) |

## Details

### BUG-002 — DB password exposure
- **Source:** old `docs/BUGS.md` (screenshot of `~/neon-config.php` shared in chat around 2026-10-10).
- **Impact:** anyone with that screenshot and network access to the DB could read or change all data. The DB user is `arcadebe_app`.
- **Do BUG-020 first** (otherwise authenticator 2FA breaks for every player who uses it).
- **Fix (owner):** cPanel → PostgreSQL Databases → change password of `arcadebe_app`; update `'pass'` in `~/neon-config.php` and `~/.pgpass`; check `/api/health` shows `db: true`.
- **Claude must not** do this itself (credential rule D-09).

### BUG-020 — 2FA key tied to the DB password
- `sec_key()` (`api/lib/security.php`) derives the AES-256-GCM key from the DB password, DB name and console key hash.
- Changing any of them (exactly what BUG-002 asks for) makes stored TOTP secrets unreadable; affected players cannot pass the authenticator step.
- Fix: dedicated `twofa_key` in `~/neon-config.php` + re-encrypt existing secrets with the old key, **then** rotate the DB password. Detail in `SECURITY_AUDIT.md` SEC-02.

### BUG-010 — Membership config reset by the old console
- **Root cause (confirmed):** before `c82f634` the console catalog offered `setMembershipConfig` with only a reason field; the API then wrote price 0 and empty benefits for both tiers.
- **Fix in code:** `console_action_prepare()` fills untouched values from `kv_get('memberships')`; stage9 test "membership settings keep untouched values".
- **Open question:** was the old command ever run on production? Check the Membership page or console `do setMembershipConfig` help output / audit log (`audit 50`) for `membership.config` entries.

### BUG-011 — No backups
- **Evidence:** cPanel `list_backups` returned an empty list (E-08). The repo has the code but **not** player data (balances, cards, profiles, tickets, audit log).
- **Impact:** if the hosting lapses (project is suspended for financial reasons) or the DB is damaged, all player data is lost.
- **Fix:** see `DATA_PRESERVATION.md` — take a `pg_dump` and store it off the host. Needs the owner's approval.

### BUG-012 — e2e staff login
- **Source:** `docs/ROADMAP.md` T1 (2026-10-11): server-mode suite 59/60, seeded `neon_owner` / `admin` returned `wrongCredentials`.
- **Hypothesis:** seed password hashing differs between migration 003 and the current login (or forced-password-change state). Not reproduced in this audit.
- **Next:** run `bash tests/run-server-mode.sh` and read the failing step.

### BUG-016 / BUG-017 / BUG-019
- BUG-016: change `"date": "2026-10-13"` to `2026-10-12` in `src/config/changelog.js` at the next release.
- BUG-017: in `api/lib/console2.php`, labels `VIP price (AG)` / `VVIP price (AG)` → `(Rp)`.
- BUG-019: `tests/i18n-keys.mjs` flags a key built at runtime; confirm all `rewards.achievements.<id>` keys exist, then whitelist the prefix.

### BUG-018 — Trailer state per device
- `ReleaseTrailer.jsx` stores `neon-arcade:trailer2-seen:<uid>` and `last-active` in localStorage. A player on a new device or after clearing data sees the cutscene once more. Accepted by the owner when told; a server flag would fix it.

## Fixed during the last sessions (for history)
Admin panel locked by an invisible trailer overlay (volume RangeError) → clamp + safety timeout + `pointer-events-none`;
release flag known only after the next sync → sync right after login; email-code throttle hit its own row; `console_words` did not keep
quoted text; `adjustCurrency` via console needed a real admin id → `neon_console` system actor; sign-in page brand mark overlapped stats;
wallet converter wider than the phone screen; update-log title said 1.0.0 on 1.1.1; MAX ignored a balance below the card limit.
