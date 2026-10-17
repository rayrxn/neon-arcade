# Development Preferences (the owner's working style)

Owner: **Ray** (GitHub `rayrxn`), "21 Development Project". Co-founder & Creative Director: Mirelix.
Sources: the memory file (S2, statements from earlier chats), this conversation (S1, 2026-10-11 → 17), earlier handover docs (S4).
Strength: **Mandatory** = said explicitly and/or repeated; **Strong** = clear, said once with emphasis; **Inferred** = from behaviour.

## UI / UX

| Preference | Evidence | Confidence | Strength | Practical rule |
|---|---|---|---|---|
| Nothing may look "AI-made" | memory ("no AI-sounding wording"), profile, repeated in S1 | VERIFIED | Mandatory | Product-specific layouts and copy; no generic hero + gradient blobs + glass cards by default |
| No emoji as icons | S1 (asked for a "📜" scroll icon → delivered as a drawn icon, owner accepted); standing rule in session notes | VERIFIED | Mandatory | Use lucide or hand-drawn SVG in theme colours |
| No overlapping elements | S1, several times (sign-in brand mark, video frames, trailer overlay) | VERIFIED | Mandatory | Check screenshots at 390 px and desktop before calling UI done |
| Short, natural copy in Bahasa Indonesia + English | memory | VERIFIED | Mandatory | Every new string in both languages; plain words, no poetic marketing |
| Dark, neon arcade identity; "as good as possible", "fresh look", premium feel | S1 ("sebagus mungkin", login rehaul, video "dark themed") | VERIFIED | Strong | Keep the established palette (cyan/purple/gold on ink), HUD details, chip-ring logo |
| Compact, not long | S1 ("ui kepanjangan" about the update log; version text "kecil aja jangan makan banyak space") | VERIFIED | Strong | Prefer dense, scannable layouts; small secondary info |
| User-friendly admin tooling | S1 ("se user friendly mungkin", console help "lebih membantu") | VERIFIED | Strong | Plain-language help, guided forms, examples, explain errors |
| Mobile matters (owner tests on his iPhone) | S1 screenshots from iPhone Chrome | VERIFIED | Strong | Test at phone width; no horizontal overflow; long-press must not open browser menus on hold-to-skip |
| Motion is welcome when purposeful (trailer, cutscenes, animated logo), and smooth closing/skip | S1 ("buat saat close atau skip video lebih smooth") | VERIFIED | Strong | Animate entrances and exits; keep Potato mode / reduced motion working |
| Staff tags: Owner green, Admin red, Moderator yellow, Helper blue, Tester orange, shimmering, left of the name | memory | VERIFIED | Mandatory | — |

### Anti-AI-slop checklist (derived from the rules above)
A screen passes when: it has one clear purpose; spacing and type follow the existing tokens; colour is used for meaning (currency, rank, state);
every state exists (loading, empty, error, disabled); animations explain something (reveal, result, transition) and respect Potato mode;
copy is short and specific to Neon Arcade (AC, AG, cards, rounds); no decorative metrics, no emoji, no text over busy art, nothing overlaps at 390 px.

## Implementation philosophy

| Preference | Evidence | Confidence | Strength |
|---|---|---|---|
| Do not rebuild existing features; continue from what exists | memory ("not to rebuild from scratch between phases"), `PROJECT_CONTEXT.md` §8 | VERIFIED | Mandatory |
| Deliver a live, directly usable site — finish end to end, then deploy | memory; every request in S1 ended with deploy | VERIFIED | Mandatory |
| Push every update to GitHub `main`; repo mirrors hosting 1:1 (uses graphify on it) | memory | VERIFIED | Mandatory |
| Ask before every release: Tanpa reset / Reset tester dulu / Reset global — usually "tanpa reset" | memory | VERIFIED | Mandatory |
| "Hemat token": work efficiently, in phases | memory, S1 | VERIFIED | Strong |
| Server-authoritative, anti-cheat first | decisions D-03 | VERIFIED | Strong |
| Fix "simple mistakes" immediately when pointed out | S1 ("simple mistakes, versi 1.0.0 padahal udah 1.1.1") | VERIFIED | Strong |
| Test before declaring done | INFERRED from owner reports of untested bugs ("masih banyak bug di console") | INFERRED | Strong |

## How the owner gives feedback

- Short Indonesian messages, often with phone screenshots and drawn arrows/dots (e.g. the hold-to-skip ring path).
- Points at the problem, expects Claude to find the cause and ship the fix in the same turn (no plan approval step).
- Clarifies with corrections the same night (trailer rule changed twice) — the **latest message wins**.
- Values honesty about limits (agreed to per-device trailer storage when told).
- Answers in his own words; the summary reply should be short, in Indonesian, saying what changed and that it is live.

## What the owner rejects

- UI that looks generic or AI-made, emoji icons, overlapping elements, long modals, wrong version numbers, features that "do nothing" (console), anything unverified presented as done.

## Model and tools

- Uses **Claude Opus** as the development and maintenance agent (memory: "using Claude Opus as development/maintenance agent"; handover request asks not to switch models voluntarily).
- Uses DomaiNesia cPanel MCP for hosting access; GitHub for the code; graphify on the repo.
