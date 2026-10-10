# Bug tracker (2026-10-10)

| ID | Title | Status | Prio | Where |
|---|---|---|---|---|
| BUG-001 | Owner Console disabled on production | confirmed (config, not code) | high | `~/neon-config.php` |
| BUG-002 | DB password visible in chat screenshot | confirmed | high | hosting DB user `arcadebe_app` |
| BUG-003 | Raw key `missions.status.none` on Roblox card | fixed-unverified | low | `Missions.jsx`, phase13 i18n |
| BUG-004 | Dark banners unreadable in light mode | fixed-unverified (partial) | medium | `src/index.css` light block |
| BUG-005 | Crash curve has no automated tests | fixed (stage8: cap, presets, custom/edge/preset validation, perms, audit) | medium | `v2core.php crash_*`, stage8 |
| BUG-006 | Feature flags not enforced by feature endpoints | fixed (`FEATURE_ROUTES` guard in router + stage8 tests) | medium | chat/transfers/shop/… routes |
| BUG-007 | GitHub mirror not 100% equal to host public_html | confirmed | low | `deploy.sh`, `hosting/public_html` |
| BUG-008 | Brief window where new DB ran with old site code | resolved | low | sync order main vs deploy |
| BUG-009 | Vivace piano-key strip renders slightly outside frame | suspected | low | `.lc-vv-keys` |

**BUG-001** User ran `owner-console.php --hash` but did not paste the printed line; `/api/console/state` returns `enabled:false`. Fix: user runs `php ~/neon-src/tools/owner-console.php --set-key` in cPanel Terminal. Claude must not set the key (credential rule).

**BUG-002** Screenshot of `neon-config.php` included the DB password. Next: user changes password in cPanel → PostgreSQL Databases, updates `'pass'` in `~/neon-config.php` and `~/.pgpass`.

**BUG-003** Key added in phase13 (en/id). Expected: "Not claimed / Belum diklaim". Verify on Rewards page.

**BUG-004** Light variants added for `.pass-hero`, `.mission-card`, `.event--*`; `.update-banner`/`.on-dark` forced white text. Other hard-coded dark panels may remain (not audited). Next: light-mode visual sweep.

**BUG-005** Stage8 crash tests were written but the edit was cancelled by the user before saving. Next: add tests for cap ×10,000, presets, custom validation, permissions.

**BUG-006** `require_feature()` exists but no endpoint calls it; flags only show in UI. Next: call it in chat send, transfer, shop buy, case/battle, pass claim, exchange, crash bet.

**BUG-007** Host `public_html` also contains cPanel files (`400/401/403/404/413/500.shtml`, `cp_errordocument.shtml`, `php.ini`) not in the mirror. Copies now saved in `tools/hosting/public_html-extra/` except `cp_errordocument.shtml` (content known, not yet saved). Next: save it, make `deploy.sh assemble` copy the folder, regenerate `hosting/public_html`. Also host `~/bin/neon-sync.sh` says "tiap 2 menit" in a comment while repo copy says 7 — comment-only difference.

**BUG-008** Migration 010 applied at 14:35 while public_html still served the 07-Oct build until the deploy pull. Live now. Cause: `main` pushed before `deploy`. Lesson: push `main` and run `deploy.sh` together.

**BUG-009** Seen in one screenshot (`.lc-vv-keys` bottom strip). Evidence weak; verify visually.
