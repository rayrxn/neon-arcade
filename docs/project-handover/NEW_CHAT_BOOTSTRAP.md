# New Chat Bootstrap — copy everything below into a new Claude conversation

---

You are continuing development of **Neon Arcade**, a live virtual arcade website (https://arcadebet.my.id) owned by Ray
(GitHub `rayrxn`, "21 Development Project"). Use **Claude Opus**; do not switch models on your own. Reply to the owner in short
Bahasa Indonesia; write code, commits and docs in English.

## Snapshot (audit 2026-10-17)
- Repo: `https://github.com/rayrxn/neon-arcade`, branches `main` (source + build + hosting mirror) and `deploy` (what the site serves).
  Last code commit `c82f634`; last commit before the handover docs `2afcd46`.
- Stack: React 18 SPA (HashRouter, zustand, framer-motion, Tailwind) built into one HTML file by `tools/standalone/build.mjs`;
  PHP 8.1 API (`api/index.php` → `api/lib/*.php`); PostgreSQL 16 (`db/`, 28 migrations) — all on DomaiNesia shared hosting.
- Version on the site: internal 3.1.1, shown as "1.1.1 Release". Site and API healthy; host is on the same build as GitHub.
- Status: development **suspended for financial reasons**. Player data exists only in the production database and **no backup exists**.

## Before you change anything
1. Clone or pull; if shallow, `git fetch --unshallow origin main`. Check `git status` and `git log 2afcd46..origin/main` — if `main` moved, read those commits and update `docs/project-handover/`.
2. Read, in this order: `docs/project-handover/README.md`, `AI_COLLABORATION_RULES.md`, `DEVELOPMENT_PREFERENCES.md`, `MASTER_BACKLOG.md`,
   `BUG_REGISTRY.md`, `ARCHITECTURE.md`, `REPOSITORY_AND_DEPLOYMENT.md`, `DATA_PRESERVATION.md`. Use the others when needed.
3. Run the tests (`TESTING_AND_VERIFICATION.md`): `service postgresql start && bash api/tests/run.sh`, build, `node tests/run-tests.cjs`, `node tests/i18n-keys.mjs`.
4. Use the DomaiNesia cPanel MCP only if it is connected and the task needs the host. Prefer read-only calls. Never edit hosted files by hand;
   deploys go through `deploy.sh` + the host cron. Never open or print `~/neon-config.php` values.

## Critical warnings
- **Never set or enter credentials** (console key, DB password, staff passwords, GitHub tokens). The owner does it.
- **Never reset or delete player data.** Before every release ask: *Tanpa reset / Reset tester dulu / Reset global* (the owner usually says "tanpa reset").
- **Do not rotate the DB password or console key before fixing BUG-020** (`sec_key()` derives the 2FA key from them).
- Money and game results settle on the server only.
- Do not rebuild existing features; check `FEATURE_INVENTORY.md` first. Do not re-propose dropped ideas (football predictions, real payment gateway).

## Next recommended actions
T-01 database backup (owner approval) → T-02 decouple the 2FA key → T-03 owner rotates the DB password → T-04 check VIP/VVIP prices →
T-30 commit a QA helper → T-05 re-run the browser e2e suite. Details in `MASTER_BACKLOG.md`.

## How to work with the owner
- He writes short Indonesian messages with phone screenshots; find the cause, fix it, test it, deploy it in the same turn.
- The newest message wins when he corrects a requirement.
- UI must not look AI-made: no emoji icons, nothing overlapping at phone width, compact, dark neon identity, short ID + EN copy.
- Admin/console tools must be user-friendly with plain-language help; every new admin action also goes into the console catalog.
- Ask when an important requirement is ambiguous and expensive to redo.
- Be honest about what was not verified.

## Release routine
Ask the reset question → tests → `node tools/standalone/build.mjs dist/neon-arcade-standalone.html` → commit + `git push origin main` →
`bash tools/deploy.sh` → copy `origin/deploy` into `hosting/public_html/` → update the build id on `PROJECT_CONTEXT.md` line 42 → commit + push →
host cron applies it within ~7 minutes (check `/version.json`).

## Keep the handover current
After each task update `MASTER_BACKLOG.md`, `BUG_REGISTRY.md`, `FEATURE_INVENTORY.md` where affected, and add a line to `docs/project-handover/CHANGELOG.md`.

## Files
`README.md` · `PROJECT_OVERVIEW.md` · `PROJECT_TIMELINE.md` · `DECISION_REGISTER.md` · `FEATURE_INVENTORY.md` · `BUG_REGISTRY.md` ·
`TECHNICAL_DEBT.md` · `SECURITY_AUDIT.md` · `ARCHITECTURE.md` · `REPOSITORY_AND_DEPLOYMENT.md` · `DEVELOPMENT_PREFERENCES.md` ·
`AI_COLLABORATION_RULES.md` · `MASTER_BACKLOG.md` · `TESTING_AND_VERIFICATION.md` · `DATA_PRESERVATION.md` · `OPEN_QUESTIONS.md` ·
`EVIDENCE_LEDGER.md` · `FINAL_REPORT.md` · `CHANGELOG.md` — all in `docs/project-handover/`.
