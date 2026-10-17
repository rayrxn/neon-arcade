# Technical Debt Register

Audit 2026-10-17. "Worth fixing?" weighs the real consequence against the cost. Do not rewrite working systems to follow a newer pattern.

| ID | Item | Where | Real consequence | Worth fixing? |
|---|---|---|---|---|
| TD-01 | Permissions defined in three places (DB `role_permissions`, PHP `require_user_perm` calls, JS `src/config/roles.js`) | `db/`, `api/lib/*`, `src/config/roles.js` | A new permission added in one place silently hides a button or lets the UI show something the API refuses | Medium — add a test that compares the DB list with `roles.js` |
| TD-02 | Layered admin dispatch (`admin_v3_action` → `admin_v2_action` → own switch → `admin_v4_action`); duplicate handlers, e.g. two `saveAnnouncement` (one dead) | `api/lib/admin.php`, `admin2.php`, `v2core.php` | Editing the dead handler changes nothing; easy to waste time | Low — delete dead duplicates when touching them |
| TD-03 | Local "demo" mode (`src/services/*.js`, `platformSeed.js`) still ships in the production bundle | `src/services/` | Larger bundle, two code paths to keep consistent, confusing for newcomers | Low while suspended; consider removing once the artifact is no longer needed |
| TD-04 | Production build is a custom bundler (`tools/standalone/build.mjs`), not Vite | `tools/standalone/` | No tree-shaking/minification guarantees; CDN libraries as globals | Keep (works, owner's setup); document only |
| TD-05 | Build output and a host mirror are committed (`dist/`, `hosting/public_html/`) | repo | Big diffs, duplicated API code in Git | Keep — owner's explicit rule D-07 |
| TD-06 | `package.json` version `0.6.0` vs app 3.1.1; unused devDependencies `react-icons`, `typescript` | `package.json` | Confusing metadata; slower installs | Low — tidy at next release |
| TD-07 | `README.md` and root `neon-arcade-standalone.html` describe the localStorage era | repo root | New readers get the wrong picture | Yes, cheap — point README at `docs/project-handover/` |
| TD-08 | Many i18n layers (`en.js`, `id.js`, `phase4…phase13`) deep-merged | `src/i18n/` | Hard to find where a string lives | Low — `grep` works; consolidate only if it starts causing collisions |
| TD-09 | Polling for live data (no WebSocket) | `server.js`, `/pulse` | Load grows with players; chat delay up to 4 s | Keep on shared hosting |
| TD-10 | Two `docs` generations (`PROJECT_CONTEXT.md`, `docs/BUGS.md`, `docs/ROADMAP.md`) and this package | repo | Contradicting status if both are edited | Yes — treat `docs/project-handover/` as the source of truth; old files are history |
| TD-11 | No automated visual regression or accessibility tests; e2e suite not re-run since 2026-10-11 | `tests/` | UI regressions are found by the owner on his phone | Medium — re-run e2e first |
| TD-12 | Ad-hoc QA scripts (local server, screenshots) live only in temporary session folders | outside repo | Every new session rebuilds them | Medium — commit a `tools/qa/serve.sh` |
| TD-13 | Large files: `v2core.php` 874 lines, `platform2.php` 800, `index.css` very large | `api/lib`, `src/index.css` | Slower navigation | Low |
| TD-14 | Trailer / "last active" state in localStorage | `ReleaseTrailer.jsx` | Per-device behaviour (BUG-018) | Low |
