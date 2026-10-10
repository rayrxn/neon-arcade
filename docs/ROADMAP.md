# Master TODO (ordered by dependency) — 2026-10-10

| ID | Task | Status | Prio | Depends | Done when / verify |
|---|---|---|---|---|---|
| T1 | Browser QA pass (server-mode suite + mobile/tablet/desktop, light/dark/potato screenshots) | planned | **blocker** | – | `tests/run-server-mode.sh` green; issues logged in BUGS.md |
| T2 | Crash curve tests (BUG-005) | done | high | – | stage8 crash block passes |
| T3 | Enforce feature flags in endpoints (BUG-006) | done | high | – | stage8 test: flag off → `errors.featureOff` per feature |
| T4 | Mirror 1:1: save `cp_errordocument.shtml`, deploy.sh copies `public_html-extra/` (BUG-007) | done | medium | – | file list of host public_html == `hosting/public_html` |
| T5 | Light-mode audit of remaining dark panels (BUG-004) | partial | medium | T1 | screenshots readable in light |
| T6 | Placeholder / icon / spacing / responsive sweep | planned | medium | T1 | no `{var}` or raw keys (i18n check + window.__missingI18n) |
| T7 | Reward rebalance (daily/weekly/monthly/one-time AC/AG) in central config | done (migration 014, v2.1) | medium | – | values in one config; tests updated |
| T8 | Notification center categories + filters | done (System group, unread count per filter) | medium | – | categories on /notifications |
| T9 | Activity history page (games, AG, LXP, rewards, cases, security) | done (`GET activity`, History → Activity) | medium | – | page lists server events |
| T10 | Session recovery UI (resume open round after reload) | done (in-game resume + global OpenRoundBanner) | medium | – | reload mid-round restores state |
| T11 | Music on mobile (unlock on gesture) | done-unverified (needs a real iOS/Android tap test) | low | – | plays on iOS/Android after tap |
| T12 | New games, each server-settled (Keno, Pump, Tower, Cross the Road, Sweet, Tarot first; then Horse shared rounds; Chess/Racing PvP; skill arcades Snake/Slice/Layer/Moles with capped XP) | planned | high | T3 (flags per game) | API tests per game + RTP check in QA |
| T13 | Case opening + battle expansion | planned | medium | – | new cases in catalog, tests |
| T13.1 | Admin power tools: captcha/Turnstile settings in panel, reset announcements (+3-day default end), ban/kick/mute lines in chat, Crash ×10,000 card in Settings, Jam Gacor luck boost | done (v2.2, stage8 tests) | high | – | stage8 "v2.2" block passes |
| T15 | Ops: console key (BUG-001), rotate DB password (BUG-002) | user action | high | user | console/state enabled:true |

Rule for every task: ask the reset question before release, push `main` + run `deploy.sh`, regenerate `hosting/public_html`, update docs.
