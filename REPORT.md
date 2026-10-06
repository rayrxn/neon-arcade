# Laporan Fase 6 — Master Prompt

Status: **IMPLEMENTED** = jalan end-to-end di website live dan dites · **PARTIAL** = ada bagian yang belum ·
**BLOCKED** = butuh server yang di-host (tidak bisa dari artifact).

Batasan utama (berlaku untuk semua baris): website live tidak punya server; semua aturan "server" berjalan di
service layer browser (`src/services`). Aturan yang sama sudah ditulis sebagai fungsi PostgreSQL (`db/functions.sql`)
dan lulus 83/83 tes di PostgreSQL 16, tapi belum tersambung ke website live.

| # | Fitur | Status | Catatan |
|---|---|---|---|
| 1 | Authentication | IMPLEMENTED | PBKDF2-SHA256 + upgrade hash lama, rate limit login 5/15 menit, sesi 7 hari, logout, keluar paksa saat ban/freeze |
| 2 | Database | PARTIAL | Schema PostgreSQL (FK, unique, index, CHECK, trigger append-only) + fungsi server teruji; website live masih localStorage (BLOCKED: hosting) |
| 3 | AC | IMPLEMENTED | Ledger, tidak bisa negatif |
| 4 | AG | IMPLEMENTED | Hanya dari milestone L50, redeem, admin |
| 5 | Wallet | IMPLEMENTED | Kategori Game/Daily/Quest/Level/Redeem/Admin/System/Reversal/Refund/Other, saldo tampil ditahan sampai hasil terlihat |
| 6 | Transactions | IMPLEMENTED | ID, user, currency, amount, type, reason, source, waktu, sesi, admin, status, idempotency key |
| 7 | XP | IMPLEMENTED | Dihitung service, lifetime XP, XP ke level berikutnya, progress bar |
| 8 | Levels | IMPLEMENTED | Level history + waktu, overlay level lama→baru, notifikasi, event |
| 9 | Level 15 reward | IMPLEMENTED | +250.000 AC tiap 15 level, catatan unik, tidak pernah dobel (dites) |
| 10 | Level 50 reward | IMPLEMENTED | +1 AG tiap 50 level, catatan unik (dites) |
| 11 | Game engine | IMPLEMENTED | 10 game; Reme masih "segera hadir" seperti sebelumnya |
| 12 | Game validation | PARTIAL | Status WON/LOST/DRAW/CANCELLED/INVALID, batas multiplier, submit ganda, atomik — di service browser; versi SQL baru untuk Dice |
| 13 | Game history | IMPLEMENTED | `/history` + detail sesi + laporkan masalah |
| 14 | Daily rewards | IMPLEMENTED | Klaim, streak, kalender, aturan bolos, waktu klaim, anti dobel |
| 15 | Quests | IMPLEMENTED | Harian & mingguan (chat, login, profil, naik level), progres, target, hadiah, kedaluwarsa, status klaim |
| 16 | Achievements | IMPLEMENTED | Termasuk First Level Up, Level 15/50, 100 Games, 10 Quest, Streak 7/30 — otomatis |
| 17 | Leaderboards | IMPLEMENTED | Global, mingguan, bulanan, per game, teman, season; tanpa akun test/demo |
| 18 | Friends | IMPLEMENTED | Add/accept/decline/remove/block, online, terakhir main, leaderboard teman (online hanya antar-tab) |
| 19 | Inventory | IMPLEMENTED | Equip, unequip, preview, filter, search, cek kepemilikan |
| 20 | Cosmetics | IMPLEMENTED | Avatar, frame, badge, title, badge chat, banner (tema profil), emote |
| 21 | Seasons | IMPLEMENTED | 28 hari, SXP, tier + hadiah, arsip leaderboard, akhiri season manual |
| 22 | Notifications | IMPLEMENTED | `/notifications`, baca/belum, tandai satu/semua, filter, riwayat |
| 23 | Chat | PARTIAL | Moderasi, mute, slow mode, hapus, blokir, report, filter, emote, riwayat; real-time hanya antar-tab (BLOCKED: WebSocket) |
| 24 | Moderation | IMPLEMENTED | Warn, mute sementara/permanen, ban sementara/permanen, unban, hapus warning, freeze akun/wallet, reset profil |
| 25 | Reports | IMPLEMENTED | Form semua jenis, cooldown, rate limit, deteksi duplikat, antrean `/admin/moderation` |
| 26 | Anti-cheat | IMPLEMENTED | Replay, request cepat, submit ganda, state invalid, reward/XP/level mustahil → flag + kasus + bukti |
| 27 | Audit logs | IMPLEMENTED | Kode ADMIN_*, before/after, alasan, target, entity, perangkat; append-only (IP asli butuh server) |
| 28 | Admin panel | IMPLEMENTED | Dashboard KPI data asli, user detail lengkap, support, sistem |
| 29 | Support | IMPLEMENTED | Tiket user + staff (assign, balas, status, tutup/buka, catatan internal) |
| 30 | Search | IMPLEMENTED | Game, inventory, admin users (username/ID/email/status), log, laporan, tiket |
| 31 | Favorites | IMPLEMENTED | Favorit/unfavorit, jumlah, seksi favorit |
| 32 | Sound | IMPLEMENTED | Bus master/UI/game/musik + mute; belum diuji audio di browser asli fase ini |
| 33 | Theme | IMPLEMENTED | Dark/Light/System |
| 34 | Language | IMPLEMENTED | ID/EN, 950 kunci dicek otomatis |
| 35 | Maintenance | IMPLEMENTED | Pesan, ETA, status; staff tetap bisa masuk |
| 36 | Status page | IMPLEMENTED | `/status` publik, 7 layanan, 4 status, override admin |
| 37 | Security | PARTIAL | Hash, RBAC, validasi, rate limit, sanitasi, constraint; enforcement sungguhan butuh server (BLOCKED) |
| 38 | Error handling | IMPLEMENTED | Pesan spesifik per kode, log error di Admin → Sistem, error boundary + retry |
| 39 | Responsive UI | IMPLEMENTED | Dicek 390 px & 1280 px, tanpa scroll horizontal |
| 40 | Automated tests | IMPLEMENTED | 176 tes alur + 50 halaman × 2 bahasa + cek i18n + 83 tes PostgreSQL |

## Perubahan

- **Database**: `db/schema.sql` (40 tabel/view), `db/functions.sql` (ledger idempoten + row lock, register, game start/settle,
  dice provably fair identik JS, XP/level/milestone, daily, admin RBAC + audit, report), `db/*_test.sql`, `db/run-tests.sh`.
- **Backend (service layer)**: `tx.js` (atomik + rollback), `reveal.js`, `events.js`, `anticheat.js`, `system.js`, `seasons.js`,
  `reports.js`, `social.js`, `cosmetics.js`, `leaderboard.js`, `discovery.js`, `support.js`; `progression.js`, `admin.js`,
  `chat.js`, `games.js` diperluas.
- **Frontend**: 8 halaman user baru, 3 halaman admin baru, overlay level up, dialog report, error boundary, favorit, emote,
  filter wallet, detail transaksi, panel season.
- **Keamanan**: PBKDF2, rate limit login, sesi kedaluwarsa, izin baru (reports, support, reverse, system), "Cash out" → "Ambil".
- **Tes**: `npm test`, `npm run test:i18n`, `npm run test:db`.

## Sisa blocker

1. Server + database yang di-host (artifact hanya halaman statis). Semua aturan sudah siap dipindah: `db/functions.sql`.
2. WebSocket untuk chat/presence/notifikasi lintas perangkat.
3. IP asli di audit log dan CSRF hanya bermakna setelah ada server.
