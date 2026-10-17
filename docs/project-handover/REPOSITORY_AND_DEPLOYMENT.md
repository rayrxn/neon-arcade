# Repository and Deployment

Audit 2026-10-17. Evidence: E-01 … E-10, E-15, E-27.

## Repository

| Item | Value |
|---|---|
| Remote | `https://github.com/rayrxn/neon-arcade` |
| Branches | `main` (source + build output + hosting mirror), `deploy` (exactly what `public_html` serves, built by `tools/deploy.sh`) |
| History | 125 commits on `main` before this handover, 2026-10-06 → 2026-10-12. Work from phases 1–6 (2026-10-02 → 06) predates Git. |
| Last code commit | `c82f634` "Console fixes: every Admin action verified end to end"; last commit `2afcd46` (hosting mirror) |
| Working tree before audit | clean, equal to `origin/main` |
| Secrets | none tracked (scan, E-15). DB credentials only in `~/neon-config.php` (API) and `~/.pgpass` (cron) on the host, outside `public_html`. |
| Clone note | Some sandboxes clone shallow; run `git fetch --unshallow origin main` before reading history. |

### Top-level layout

```
api/                 PHP API (index.php router, lib/*.php, tests/*.php)
db/                  schema.sql, functions.sql, compat.sql, migrations/001…028, resets/, *_test.sql
src/                 React app (pages, components, admin, games, services, store, i18n, config)
tools/               standalone bundler, deploy.sh, owner-console.php (CLI), hosting/ (cron scripts, cPanel extras)
tests/               run-tests.cjs (render + flow), i18n-keys.mjs, run-server-mode.sh + server-mode.cjs (browser e2e)
dist/                built single-file site (committed on purpose)
hosting/public_html/ copy of the live public_html (committed on purpose, owner's rule D-07)
docs/                specs, bug/roadmap docs, this handover package
PROJECT_CONTEXT.md   older handover summary; line 42 holds the current build id
```

Generated files committed on purpose: `dist/`, `hosting/public_html/`. Stale file: root `neon-arcade-standalone.html` (2026-10-06, phase-6 era).

## Hosting (DomaiNesia cPanel, read-only inspection)

| Item | Observed 2026-10-17 |
|---|---|
| Account | user `arcadebe`, plan `nimbus_go`, 15 GB quota, ~731 MB used |
| Domains | `arcadebet.my.id`, `mcp.arcadebet.my.id` (the cPanel MCP endpoint lives in `~/mcp`) |
| Web root | `~/public_html` = build `c82f634`, version 3.1.1 (`version.json`) |
| Source checkout | `~/neon-src` = `main` at `2afcd46` |
| Database | PostgreSQL `arcadebe_neon` (~33 MB), user `arcadebe_app` |
| Cron | `*/7 * * * * /bin/bash $HOME/bin/neon-sync.sh` |
| Logs | `~/logs/neon-sync.log` (every pull + migration), `~/error_log` (one old CLI notice) |
| Backups | **cPanel lists none** (see `DATA_PRESERVATION.md`) |
| Live checks | `/api/health` ok, `db: true`; `/api/console/state` → `enabled: true` |

**GitHub vs host:** identical. The host pulled `deploy` (built from `c82f634`) and `main` at `2afcd46`. No host-only code changes were found
in the listed directories; cPanel's own files (`400.shtml` … `cp_errordocument.shtml`, `php.ini`) are kept in `tools/hosting/public_html-extra/`
and copied by `deploy.sh`.

## How to release (the established routine)

1. Ask the owner: **Tanpa reset / Reset tester dulu / Reset global** (D-06). If a reset is chosen, add `db/resets/<date>-<label>.testers|global`.
2. Run the tests (see `TESTING_AND_VERIFICATION.md`).
3. Build: `node tools/standalone/build.mjs dist/neon-arcade-standalone.html`
   (Tailwind runs through `TAILWIND_BIN` if set, otherwise `npx tailwindcss` from devDependencies — needs `npm install`).
   Note: `deploy.sh` only rebuilds when `TAILWIND_BIN` is set or `dist/` is missing, so **build first**, then deploy.
4. Commit to `main`, `git push origin main`.
5. `bash tools/deploy.sh` — assembles and pushes branch `deploy`. Put `DEPLOY_COMMIT_TRAILER` in the env if a commit trailer is wanted.
6. Refresh the mirror: copy the `deploy` tree into `hosting/public_html/`
   (`git fetch origin deploy && git archive origin/deploy | tar -x -C hosting/public_html`), update the build id on `PROJECT_CONTEXT.md` line 42, commit, push.
7. Within ~7 minutes the host cron pulls both branches and runs new migrations once. Check `~/logs/neon-sync.log` and `/version.json`.

Lesson (old BUG-008): push `main` and run `deploy.sh` together, otherwise a migration can run while the old site build is still served.

## Local development

- PostgreSQL: `service postgresql start` (tests create their own databases).
- Local server with a fresh DB (QA): previous sessions used ad-hoc scripts (`serve.sh`): create DB, apply `compat.sql`, `schema.sql`, `functions.sql`, all migrations; `bash tools/deploy.sh --out <dir>`; write a config PHP file and run `php -S 127.0.0.1:8099 -t <dir>/site router.php` with `NEON_CONFIG=<config>`. The router comes from `tests/run-server-mode.sh`.
- The live site's fonts and CDN libraries are blocked in some sandboxes; QA scripts routed them to local copies.
- Staff accounts seeded by migration 003: `neon_owner`, `neon_admin`, `neon_mod`, `neon_helper`, `neon_tester` (default password `admin`, forced change at first login — **on production these were changed or must be**).

## Owner Console

- Web: `https://arcadebet.my.id/#/system-console`; CLI: `php ~/neon-src/tools/owner-console.php` (interactive) or with one command as arguments.
- Key: set by the owner with `--set-key` (Claude must not set it, D-09). Enabled on production (E-12).
- Reference: `docs/OWNER-CONSOLE.md` (older command list) and the in-app catalog (`help`, `actions`, `help do <action>`).
