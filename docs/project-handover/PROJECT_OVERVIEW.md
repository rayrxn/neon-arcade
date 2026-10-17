# Project Overview

## What Neon Arcade is

A virtual arcade website at **https://arcadebet.my.id**, built by **21 Development Project** (Founder & Executive Director: Ray;
Co-Founder & Creative Director: Mirelix). Players get two virtual currencies — **AC (Arcade Chips)** and **AG (Arcade Gems)** — and use
them in 22 playable games, a shop, loyalty cards, a battle pass, chat and leaderboards. No real-money winnings or cash-out exist;
the only real-money flow is VIP/VVIP membership, requested through a support ticket and activated manually by the Owner (D-01).
UI in Bahasa Indonesia and English, dark neon look with light mode and a Potato performance mode.

## Original vision vs today

| | Original (phases 1–6, 2026-10-02 → 06) | Today (3.1.1, 2026-10-12) |
|---|---|---|
| Delivery | Claude artifact, data in `localStorage` | Live site on DomaiNesia shared hosting |
| Backend | browser "service layer"; PostgreSQL functions written but unused | PHP 8.1 API + PostgreSQL 16 on the host, server-authoritative |
| Planned infra | Supabase + Railway/Vercel | dropped — everything on the host |
| Games | 10 | 22 playable (+ Reme placeholder, Layer/Moles disabled) |
| Admin | browser RBAC demo | full admin panel (33 sections) + Owner Console with every admin action |
| Versioning | "phases" | BETA versions 1.0.0 → 2.9.16, then "1.0.0 Release" (internal 3.0.0) and "1.1.1 Release" (3.1.1) |

## Long-term ambition (from the owner's requests)
A polished, "premium" arcade community: rich identity (cards, tags, effects), events and announcements, fair server-settled games,
strong staff tooling, and a release-quality presentation (trailer video, logo, update log). Exact business goals beyond that were not recorded.

## Project status snapshot — 2026-10-17

| Field | Value | Evidence |
|---|---|---|
| Development status | **Suspended** (financial reasons, owner 2026-10-17). Last code change 2026-10-12. | E-22, E-03 |
| Repository | `rayrxn/neon-arcade`, `main` at `2afcd46` before this handover commit; clean | E-01, E-02 |
| Deployment | Live; `public_html` build `c82f634` (3.1.1); host source at `2afcd46`; API healthy | E-04, E-05, E-11 |
| Database | `arcadebe_neon`, ~33 MB, all 28 migrations applied | E-06, E-09 |
| Owner Console | Enabled on production | E-12 |
| Verified working (local tests + earlier QA) | accounts, 2FA, sessions, wallet/ledger, max bet, converter, 20+ games, cases/battles, crash, chat, tickets, flags, feature flags, maintenance, announcements, console | `FEATURE_INVENTORY.md`, E-13 |
| Known defects | BUG-002 (exposed DB password), BUG-020 (2FA key tied to DB password), BUG-011 (no backups), BUG-010 (maybe-reset membership prices), minor UI items | `BUG_REGISTRY.md` |
| Outstanding critical work | T-01 backup, T-02 → T-03 key decoupling then password rotation, T-04 check prices | `MASTER_BACKLOG.md` |
| Blockers | Owner approval / owner actions; suspension | `MASTER_BACKLOG.md` |
| Data preservation | **Not secured**: no backups exist | `DATA_PRESERVATION.md` |
| Access limits of this audit | no earlier chat archive, no DB contents, no billing info, config file not opened | `EVIDENCE_LEDGER.md` |
| Last verified commit | `2afcd46` (code) — plus this handover's docs commit | — |
