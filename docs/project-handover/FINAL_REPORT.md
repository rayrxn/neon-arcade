# Final Handover Report — 2026-10-17

1. **What Neon Arcade is.** A live virtual arcade (arcadebet.my.id): React SPA + PHP API + PostgreSQL on DomaiNesia shared hosting, two virtual currencies (AC, AG), 22 playable server-settled games, loyalty cards up to Vivace, memberships, chat, admin panel and an Owner Console. See `PROJECT_OVERVIEW.md`.
2. **How it evolved.** Artifact with localStorage (phases 1–6, 2–6 Oct) → server mode on the host (6 Oct) → 2.0 core/console/identity (10 Oct) → 2.1–2.9 games and economy (10–11 Oct) → "1.0.0 Release" (11–12 Oct) → "1.1.1 Release" with new sign-in, 2FA and the full console (12 Oct) → suspended (17 Oct). See `PROJECT_TIMELINE.md`.
3. **Verified to work.** All API suites, page-render tests and i18n checks pass on 2026-10-17; production API healthy and on the same build as GitHub. Feature-level detail in `FEATURE_INVENTORY.md`.
4. **Incomplete.** Light-mode sweep, responsive sweep of admin/game pages, accessibility, Racing PvP, Reme, Layer/Moles (disabled), mobile music test.
5. **Broken / defective.** No confirmed functional breakage on production. Open defects: BUG-020 (2FA key tied to DB password), BUG-002 (exposed DB password), BUG-012 (one e2e step), minor UI/label items.
6. **Unverified.** 1.1.1 features on production (email 2FA delivery, strict sessions, console forms), live economy values, membership prices after the old console bug, card faces visually, e2e suite since 2026-10-11.
7. **Requested but not implemented.** Racing PvP, Reme. Football predictions were dropped on purpose.
8. **Architecture to preserve.** Server-authoritative money logic; SQL `wallet_post` ledger with idempotency keys; PHP `fail()` codes translated by i18n; HashRouter; single-file standalone build; `main` + `deploy` branches with cron sync; repo mirrors `public_html`; console as separate authority. See `ARCHITECTURE.md`, `DECISION_REGISTER.md`.
9. **Preferences to respect.** No AI-looking UI, no emoji icons, no overlap, short ID+EN copy, compact layouts, ship complete and live, push every change, ask the reset question, never touch credentials, "hemat token". See `DEVELOPMENT_PREFERENCES.md`.
10. **Security risks.** SEC-02/BUG-020 key coupling, SEC-01 exposed password, no CSP, per-email login lock, no backups. See `SECURITY_AUDIT.md`.
11. **Data-preservation questions.** No backups exist; hosting end date unknown; restore never tested. See `DATA_PRESERVATION.md`.
12. **Blocking progress.** The financial suspension and owner-only actions (backup, password rotation, approvals).
13. **Address first.** T-01 backup → T-02 decouple 2FA key → T-03 rotate DB password → T-04 check membership prices.
14. **Keep deferred.** New games, CSP, removing local mode, payment gateway, WebSocket.
15. **Before touching the code.** Read `NEW_CHAT_BOOTSTRAP.md`, check `git log 2afcd46..origin/main`, run the tests, ask the reset question before any release.

## DO NOT REPEAT THESE MISTAKES
- Keying users by email in admin data (one email = up to 3 accounts) — use ids.
- Leaving an invisible full-screen overlay in the DOM.
- Shipping console/admin entries without running them once end to end.
- Overwriting untouched settings with defaults (memberships zeroed).
- Parsing a select value `off` as boolean.
- Hard-coded version strings in titles.
- Long modals for small updates; grid children without `min-w-0` on phones.
- Building on an old interpretation after the owner corrected it — the newest message wins.
- Rotating the DB password or console key before decoupling the 2FA key.
- Presenting unverified work as done.

## NON-NEGOTIABLE QUALITY BAR
- **Code:** money and results on the server; idempotent ledger writes; permission check on every admin action; every new admin action also in the console catalog; i18n keys in both languages; no secrets in Git.
- **Security:** never handle credentials for the owner; audit every staff action; no destructive operation without explicit approval.
- **UI/UX:** original, product-specific, dark neon identity; no emoji icons; nothing overlaps at 390 px or desktop; short natural copy; smooth purposeful motion; Potato mode respected.
- **Workflow:** read before editing; test (API suites + render tests + screenshots for UI); ask the reset question; push `main`, run `deploy.sh`, refresh the mirror, update `PROJECT_CONTEXT.md` line 42; tell the owner briefly in Indonesian what changed and what was not verified.

## WHAT WE STILL DON'T KNOW
See `OPEN_QUESTIONS.md` (hosting end date, backups at the provider, password rotation, live prices, why Layer/Moles were disabled, Reme/Racing scope, production email delivery, early project history).
