# Neon Arcade — Project Handover Package

Audit date **2026-10-17**. Code audited: `main` at `2afcd46` (last code change `c82f634`, 2026-10-12). Live site checked read-only the same day.
This folder is the **source of truth** for project status. Older files (`PROJECT_CONTEXT.md`, `docs/BUGS.md`, `docs/ROADMAP.md`,
`docs/MASTER-UPDATE.md`, `REPORT.md`) are kept as history.

## Read first (new Claude conversation)
1. [`NEW_CHAT_BOOTSTRAP.md`](NEW_CHAT_BOOTSTRAP.md) — the prompt to paste into a new chat.
2. [`AI_COLLABORATION_RULES.md`](AI_COLLABORATION_RULES.md) — non-negotiable rules and past mistakes.
3. [`DEVELOPMENT_PREFERENCES.md`](DEVELOPMENT_PREFERENCES.md) — how the owner works and what he rejects.
4. [`MASTER_BACKLOG.md`](MASTER_BACKLOG.md) — everything still to do, in order.
5. [`BUG_REGISTRY.md`](BUG_REGISTRY.md) and [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md).

## All files
| File | Contents |
|---|---|
| [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) | What the project is, original vision vs now, **status snapshot** |
| [`PROJECT_TIMELINE.md`](PROJECT_TIMELINE.md) | Chronology from phase 1 to the suspension |
| [`DECISION_REGISTER.md`](DECISION_REGISTER.md) | 26 decisions + superseded ideas |
| [`FEATURE_INVENTORY.md`](FEATURE_INVENTORY.md) | Every feature with status and evidence |
| [`BUG_REGISTRY.md`](BUG_REGISTRY.md) | Bugs BUG-001 … BUG-020 |
| [`TECHNICAL_DEBT.md`](TECHNICAL_DEBT.md) | Debt items and whether they are worth fixing |
| [`SECURITY_AUDIT.md`](SECURITY_AUDIT.md) | Findings SEC-01 … SEC-11 and verified controls |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Stack, file map, request/deploy diagrams, authorization, data integrity |
| [`REPOSITORY_AND_DEPLOYMENT.md`](REPOSITORY_AND_DEPLOYMENT.md) | Repo layout, hosting snapshot, release routine, local dev |
| [`DEVELOPMENT_PREFERENCES.md`](DEVELOPMENT_PREFERENCES.md) | Owner's UI/UX and workflow preferences with evidence |
| [`AI_COLLABORATION_RULES.md`](AI_COLLABORATION_RULES.md) | Rule priority, non-negotiables, do-not-repeat list |
| [`MASTER_BACKLOG.md`](MASTER_BACKLOG.md) | Unified backlog, dependencies, approvals, order |
| [`TESTING_AND_VERIFICATION.md`](TESTING_AND_VERIFICATION.md) | How to test, latest results, test matrix |
| [`DATA_PRESERVATION.md`](DATA_PRESERVATION.md) | Where data lives, backups, restore, suspension rules |
| [`OPEN_QUESTIONS.md`](OPEN_QUESTIONS.md) | What we still don't know |
| [`EVIDENCE_LEDGER.md`](EVIDENCE_LEDGER.md) | Sources and evidence E-01 … E-30 |
| [`FINAL_REPORT.md`](FINAL_REPORT.md) | 15-point summary, do-not-repeat, quality bar |
| [`CHANGELOG.md`](CHANGELOG.md) | Changes to this package |

## Current status in one paragraph
Neon Arcade 3.1.1 ("1.1.1 Release") is live and healthy; GitHub, the deploy branch and the host are on the same build. All automated
API and render tests pass locally. Development is suspended for financial reasons. The most important open items are about **data
and credentials**, not features: there is **no database backup** (BUG-011), the DB password was exposed in a chat (BUG-002) and must
not be rotated before the 2FA key is decoupled from it (BUG-020), and VIP/VVIP prices should be checked (BUG-010).

## Limits of this audit
- Earlier Claude conversations were not available in full; only the docs and memory notes they left behind (see `EVIDENCE_LEDGER.md`).
- Production data was not queried; `~/neon-config.php` was not opened; billing was not visible.
- The browser e2e suite and the SQL tests were not run in this audit.
