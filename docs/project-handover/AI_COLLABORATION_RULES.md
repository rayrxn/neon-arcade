# AI Collaboration Rules for Neon Arcade

Priority order when rules conflict:
1. Explicit non-negotiable instructions (below, section A).
2. Latest confirmed project decisions (`DECISION_REGISTER.md`).
3. Established design and architecture conventions (`ARCHITECTURE.md`, existing code).
4. Strongly supported preferences (`DEVELOPMENT_PREFERENCES.md`).
5. Inferred preferences.
6. New suggestions — need the owner's approval.

A newer explicit request from the owner overrides an older preference; note significant changes in `DECISION_REGISTER.md`.

## A. Non-negotiable

1. **Never set, enter or reuse credentials** (console key, DB password, GitHub tokens pasted in chat, staff passwords). The owner does it.
2. **Never reset or delete player data** without the owner choosing it. Before every release ask: *Tanpa reset / Reset tester dulu / Reset global*.
3. **Push every change to GitHub `main`** at the end of the task; keep `hosting/public_html` equal to the live `public_html`; update the build id on `PROJECT_CONTEXT.md` line 42.
4. **Do not rebuild what exists.** Read the code first; extend it.
5. **Wagered results settle on the server.** Never move money logic to the browser.
6. **UI quality bar:** no emoji icons, no AI-looking UI, no overlapping elements, ID + EN copy for every string, short natural wording.
7. **Verify before saying "done":** run the test suites, look at screenshots (phone and desktop) for UI work, and say plainly what was not verified.
8. **No secrets in Git** — not in code, docs, commits or screenshots.
9. **Data preservation during the suspension** — see `DATA_PRESERVATION.md`.

## B. Working method

- Start with `git pull` (and `git fetch --unshallow` if the clone is shallow), `git status`, and read `docs/project-handover/README.md`.
- Check whether `main` moved since the last audit (`git log 2afcd46..origin/main`). If it did, update this package.
- Use the DomaiNesia MCP only when it is available and the task needs the host; prefer read-only calls; never overwrite hosted files by hand (deploys go through `deploy.sh` + cron).
- Inspect real files before editing; prefer small, complete changes; keep the existing patterns (PHP `fail()` codes + i18n keys, `require_user_perm`, `wallet_post`).
- Every new i18n key in both `phase13.en.js` and `phase13.id.js` (or the newest phase file).
- New admin actions must also appear in the Owner Console catalog (`api/lib/console2.php` `console_action_catalog`) so the console stays a superset of the panel (D-22).
- Work efficiently ("hemat token"): targeted searches, no repeated full-file reads, no long narration.
- Reply to the owner in Indonesian, short: what changed, that it is live, what was not verified.
- Use Claude Opus; do not switch models voluntarily.

## C. Do not repeat these mistakes

- Keying admin data by **email** (one email can hold 3 accounts) — key by user id.
- Invisible full-screen overlays left in the DOM (blocked the admin panel) — always `pointer-events-none` + a safety timeout.
- Console actions whose fields did not match the API — any catalog entry must be run end to end once (see `console_action_prepare`).
- Settings actions that overwrite untouched values with defaults (memberships reset) — merge with current values.
- Treating a select value `off` as boolean.
- Hard-coding a version in titles ("Neon Arcade 1.0.0") — derive from the changelog.
- Long modals for small releases.
- Width bugs on phones: grid children need `min-w-0` / `grid-cols-[minmax(0,1fr)]`.
- Interpreting a requirement once and shipping: when the owner corrects (trailer rule), the newest message wins.
- `pgrep` patterns that match your own shell when killing a dev server (use `^php -S 127.0.0.1:<port>`).
- Rotating the DB password before decoupling the 2FA key (SEC-02).
