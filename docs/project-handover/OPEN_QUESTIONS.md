# Open Questions ("What we still don't know")

Ask the owner or verify before acting on any of these.

## Data and hosting
1. When does the hosting plan (`nimbus_go`) expire or renew? Is the suspension "stop development" or "stop paying for hosting"?
2. Does DomaiNesia keep server-side backups for this account? (cPanel lists none.)
3. Has the DB password been rotated since the screenshot (~2026-10-10)? (Do T-02 first if not.)
4. Were the old console's "Membership settings" ever run on production (prices reset to 0)?
5. What are the current live economy values (`neon_kv`): exchange rate, membership prices, crash preset, luck boosts? Admins may have changed the defaults.
6. Was the 1.0.0 release published for all players on 2026-10-12 21:00 UTC as planned?

## Product
7. Why were Layer and Moles disabled (migration 025, "for now")? Should they come back?
8. Rules for **Reme** (placeholder since phase 4) and **Racing PvP** — still wanted?
9. Is the membership payment flow (support ticket, manual activation, Rupiah price) the final model?
10. House players ("bots"): is the current level of realism acceptable long-term, given they are not labelled in chat?
11. Light mode: should every admin page follow the light palette too, or only player pages?

## History that was not available
12. The original concept and motivation from phases 1–6 (before Git), early UI feedback, and why the stack moved from the artifact to PHP — only summaries survive (`README.md`, `REPORT.md`, memory file).
13. Earlier handover prompts mention "Supreme Console", "Black Infinite redesign", "Platinum redesign", "Vivace above Monarch", "light banner", "Potato Mode", "mini profile", "prefix/suffix". This audit maps them to: Owner Console (F-61), Infinite + Black redesigns (F-15, D-10), F-15, D-10, F-81, F-82, F-51, F-53. If any of those names meant something different, tell the next session.
14. Whether the owner wants the GitHub repo to stay public/private as is (not checked).

## Technical
15. Does BUG-012 (seed staff login in e2e) still happen?
16. Is the `admin_audit_log` append-only trigger present on production? (It is in `db/schema.sql`.)
17. Does email delivery (2FA codes, password reset) reach Gmail inboxes from the host without landing in spam?
