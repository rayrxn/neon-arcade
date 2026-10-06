# Neon Arcade — Fase 1–6

Platform arcade virtual (React + Vite + Tailwind + Framer Motion + Zustand + React Router).
AC dan AG tidak bernilai uang. Semua data masih disimpan di `localStorage` browser (mode lokal).

## Menjalankan

```bash
npm install
npm run dev            # http://localhost:5173
npm run dev -- --host  # tes dari HP di jaringan yang sama
```

Tanpa install: buka `neon-arcade-standalone.html` (klik dua kali, butuh internet untuk CDN).

Build & tes (Fase 6):

```bash
npm run build:standalone   # → dist/neon-arcade-standalone.html (1 file, library dari CDN)
npm test                   # 220+ tes alur + render semua halaman ID/EN (butuh build di atas)
npm run test:i18n          # semua kunci teks ada di kamus ID & EN
npm run test:db            # PostgreSQL: schema + fungsi server + 83 tes constraint/aturan
```
Jangan buka `index.html` langsung — file itu hanya kerangka untuk Vite dan akan tampil kosong.

## Isi Fase 3

| Fitur | Halaman / komponen | Logika |
|---|---|---|
| AC + AG (dua saldo terpisah) | `BalanceChip`, `BalanceCards` | `store/useWalletStore.js` (migrasi v1 → v2 otomatis, akun lama dapat 1 AG) |
| Send / Receive | `modals/SendModal`, `ReceiveModal` | `services/transfers.js` — AC langsung, AG pending ±1 menit, limit harian → Failed |
| Wallet + riwayat | `pages/WalletPage` | filter jenis & mata uang, status di setiap baris, detail per transaksi |
| Top Up | `modals/TopUpModal` | `services/payments.js` — **belum terhubung payment gateway**, checkout sengaja ditolak |
| Redeem Code | `pages/RedeemPage` | `services/redeem.js` + `config/economy.js` — preview hadiah, expired/used/sold out |
| Global Chat | `pages/ChatPage`, `chat/ChatRoom` | `services/chat.js` — sensor kata kasar, blok link, slow mode, report, mention |
| Jackpot | `pages/JackpotPage`, `jackpot/JackpotBanner` | `services/jackpot.js` — menang ≥ 10.000 AC diumumkan otomatis |
| Profile & Settings | `pages/ProfilePage`, `SettingsPage`, `EditProfileModal` | `store/useAuthStore.js` — username unik, avatar/foto, ganti password |
| ID / EN | `i18n/id.js`, `i18n/en.js` | `useT()`; pilihan disimpan di `store/usePrefsStore.js` |
| Dark / Light / System | `runtime/ThemeController` | token warna di `index.css`, disimpan di prefs |

## Phase 4 — sudah jalan

- **10 game playable**: Case Opening, Case Battle, Crash, Plinko, Mines, Dice, Limbo, Coinflip, Roulette, Blackjack
  (`src/games/*.jsx`, UI bersama di `components/play/GameKit.jsx`). Reme belum.
- **Engine "server-authoritative"** (`services/games.js`): hasil dihitung dari RNG provably fair di service,
  UI hanya kirim pilihan. Titik crash, posisi ranjau, dan kartu dealer tidak dikirim ke UI selama ronde berjalan.
  Ronde Crash/Mines/Blackjack tersimpan dan berlanjut setelah refresh.
- **Anti-cheat dasar**: validasi taruhan, rate limit (8 ronde/detik), aksi di sesi tak dikenal = flag `replay`,
  klik ganda tidak membayar dua kali. Flag tersimpan di `progress.flags` (siap untuk panel admin).
- **Progres** (`services/progression.js`, `config/progression.js`): XP & level, daily reward 7 hari dengan streak,
  daily & weekly quest (reset otomatis), 8 achievement, notifikasi level up / quest / achievement.
- **Sound** (`services/sound.js`): efek Web Audio + musik latar opsional; master/musik/SFX/mute di Settings & header.
- **Teruji**: 81 tes alur + simulasi ribuan ronde per game (perubahan saldo = payout − taruhan di setiap ronde).

## Admin panel (`/admin`)

- **Akses**: akun pertama yang terdaftar di browser = **Super Admin**. Role lain diberikan lewat Admin → Users → Change role.
- **RBAC** (`config/roles.js`): Super Admin, Admin, Moderator, Support, Developer/QA. Permission dicek di
  `services/admin.js` (bukan hanya disembunyikan di UI); admin tidak bisa menindak role yang setara/lebih tinggi.
- **Halaman**: Dashboard, Users (cari username/email/ID, detail lengkap), Wallets, Games (status & max bet),
  Game Sessions, Anti-Cheat (investigasi + bukti), Moderation, Rewards, Daily Rewards, Quests, Achievements,
  Redeem Codes, Global Chat, Announcements, Reports, Analytics, Admin Logs, Test Mode, Settings (matriks RBAC).
- **Setiap aksi sensitif**: konfirmasi → alasan wajib → identitas admin + waktu → audit log append-only
  (`store/useAdminStore.js`, tanpa API hapus). Perubahan saldo menampilkan Before → Change → After.
- **Fairness enforcement**: sesi dibatalkan dengan hasil asli tetap tersimpan (`session.invalidated`:
  original result, violation, action, admin, reason, time); keuntungan bersih ditarik dari wallet.
- **Ban / freeze**: temporary & permanent ban, freeze account (logout paksa), freeze wallet (game/transfer/redeem diblokir),
  mute chat. User langsung dikeluarkan dan menerima notifikasi keamanan.
- **Test Mode**: hanya akun `is_test = true`. Force Win/Loss + simulasi; sesi test tidak memotong saldo dan
  tidak masuk statistik, quest, leaderboard, maupun jackpot. Banner "TEST MODE — RESULTS ARE SIMULATED".

## Fase 6 — master prompt

**Inti keandalan** (`src/services/tx.js`, `reveal.js`, `events.js`, `anticheat.js`)
- `atomic()` — snapshot semua store; kalau satu langkah gagal, semua perubahan dibatalkan.
- Idempotency key di ledger (`game:<id>:bet`, `milestone:L15:30`, `daily:<hari>`, `reversal:<tx>`) — tidak ada transaksi dobel.
- Reveal gate — payout dikredit atomik saat hasil final, tapi saldo yang tampil baru naik setelah animasi hasil selesai.
- Status sesi `WON / LOST / DRAW / CANCELLED / INVALID`, verifikasi server, batas multiplier per game.
- Event bus (`USER_REGISTERED` … `REPORT_RESOLVED`) tersimpan dan terlihat di Admin → Logs → Event.
- Anti-cheat: replay, request terlalu cepat, submit ganda, state tidak valid, reward/XP/level mustahil → flag, security event,
  kasus otomatis di antrean moderasi, bukti disimpan, auto-freeze opsional. Hasil user asli tidak pernah dimanipulasi.

**Progres**: XP seumur hidup, level history, milestone setiap 15 level (+250.000 AC) dan 50 level (+1 AG) dicatat unik,
overlay level up, season 28 hari (SXP, tier, hadiah kosmetik, arsip leaderboard), daily reward dengan kalender & aturan bolos,
quest harian/mingguan (chat, login, profil, naik level), achievement baru (Level 15/50, 10 Quest, Streak 30).

**Halaman baru**: `/history` (+ detail sesi), `/leaderboard` (global, mingguan, bulanan, per game, teman, season),
`/friends`, `/inventory` (equip/unequip/preview/filter/search), `/u/:username`, `/notifications`, `/support`,
`/status` (publik), layar maintenance. Games: search, favorit, trending, baru, rekomendasi, paling sering dimainkan.

**Admin**: `/admin/moderation` (new / investigating / escalated / resolved / dismissed, assign, catatan internal),
`/admin/support`, `/admin/system` (maintenance + ETA, status layanan, auto-freeze, slow mode, akhiri season, log error),
warn / hapus warning / mute sementara & permanen / unmute / reverse transaksi / reset profil, dashboard KPI baru,
audit log dengan kode `ADMIN_*`, target ID, entity ID, metadata perangkat.

**Keamanan**: password PBKDF2-SHA256 (hash lama di-upgrade otomatis), rate limit login (5 gagal / 15 menit),
sesi berlaku 7 hari, RBAC SUPER ADMIN / ADMIN / MODERATOR / SUPPORT, rate limit & cooldown report/tiket/chat/teman.

**Database & server** (`db/`)
- `schema.sql` — PostgreSQL: FK, unique, index, CHECK (saldo ≥ 0, milestone unik, satu reversal per transaksi,
  hasil paksa hanya akun test), trigger: riwayat transaksi & audit log tidak bisa diubah/dihapus.
- `functions.sql` — aturan bisnis sebagai fungsi server (RPC): ledger idempoten dengan row lock, register,
  game start/settle + dice provably fair (hasil identik dengan JS), XP/level/milestone, daily, admin (RBAC + audit), report.
- `functions_test.sql`, `constraints_test.sql`, `run-tests.sh` — sudah dijalankan di PostgreSQL 16: 83/83 lulus.

## Produksi: arcadebet.my.id (mode server, Tahap 1)

Website live di **https://arcadebet.my.id** memakai API PHP di hosting Domainesia + PostgreSQL 16.
`index.html` produksi men-set `window.NEON_API = "/api"`; tanpa flag itu (artifact, file lokal, tes) website
tetap memakai service layer di browser seperti sebelumnya.

- **Diputuskan server:** registrasi & login (argon2id, cookie httpOnly 7 hari, rate limit 5 gagal/15 menit),
  saldo AC/AG (ledger `wallet_post`, idempoten, tidak bisa minus), 10 game (port 1:1 dari `services/games.js`,
  RNG provably fair identik — `api/tests/rng_compare.mjs`), daily reward, quest, XP/level/milestone L15/L50,
  achievement, season, seed provably fair, profil & kosmetik. Flag anti-cheat tetap tersimpan walau request ditolak.
- **Masih di browser (Tahap 2):** transfer antar pemain & redeem kode (sementara dinonaktifkan di mode server),
  panel admin (membaca data lokal; aksi admin dinonaktifkan), teman, chat, notifikasi, laporan, tiket support.
- **Kode:** `api/` (router `index.php`, aturan di `api/lib/*.php`), `db/migrations/*.sql`, `src/services/server.js`,
  `src/config/runtime.js`, `src/components/runtime/ServerGate.jsx`.
- **Tes:** `bash api/tests/run.sh` (API + RNG vs JS), `node tests/server-mode.cjs` (bundle frontend asli ↔ API lokal),
  ditambah `npm test` & `npm run test:db` untuk mode lokal dan database.

### Alur deploy

1. Commit ke `main` → push ke GitHub.
2. `bash tools/deploy.sh` (butuh `TAILWIND_BIN` untuk build ulang CSS) menyusun branch `deploy`
   (`index.html`, `api/`, `.htaccess`) dan mem-push-nya.
3. Cron di hosting (`~/bin/neon-sync.sh`, salinan di `tools/hosting/`) tiap 2 menit menarik `deploy` ke `public_html`,
   `main` ke `~/neon-src`, lalu menjalankan migrasi baru di `db/migrations/` (sekali per file). Log: `~/logs/neon-sync.log`.

Rahasia tidak pernah masuk repo: kredensial database ada di `~/neon-config.php` (API) dan `~/.pgpass` (cron),
keduanya di luar `public_html`.

## Batas mode lokal (jujur)

Website live memakai `localStorage` (tidak ada server yang bisa di-host dari artifact). Semua aturan berjalan di
service layer yang terpisah dari UI, tapi karena tetap di browser, pengguna yang membuka DevTools bisa mengubah
datanya sendiri. Untuk produksi: jalankan `db/schema.sql` + `db/functions.sql` di PostgreSQL dan arahkan
`src/services/*` ke API yang memanggil fungsi tersebut — aturan & kode error-nya sudah sama.
Chat, presence, dan notifikasi real-time hanya antar-tab di browser yang sama sampai ada WebSocket.

## Kode redeem untuk testing

`WELCOME500` (500 AC) · `LUCKY777` (777 AC) · `NEONARCADE` (1.000 AC + Bingkai Neon) ·
`GEMDROP` (1 AG, kuota 3 klaim) · `RAMADAN25` (contoh kode expired).

## Mode lokal vs backend

Semua aturan bisnis ada di `src/services/*` dengan kontrak async yang sama seperti API nanti
(lihat komentar di tiap file). Saat backend siap, ganti isi service-nya; komponen tidak perlu diubah.

- Akun demo (`rayhan`, `nadia_x`, …) diisi `services/platformSeed.js` supaya Send, Chat, dan
  Jackpot punya data. Ditandai label "Demo" dan tidak bisa login.
- Global Chat & presence tersinkron antar-tab di browser yang sama, belum antar perangkat.
- Top Up menampilkan paket dan harga, tetapi tidak menagih atau menambah saldo.

## Kontrak untuk game (fase berikutnya)

```js
import { startRound, finishRound } from '@/services/games'

const round = startRound({ game: 'crash', bet: 100, floats: 1 })   // potong AC + angka provably fair
if (!round.ok) return toast({ tone: 'error', title: t(round.error) })
const point = crashPoint(round.floats[0])
// ...animasi...
finishRound({ game: 'crash', payout: 100 * cashedOutAt })          // kredit + umumkan jackpot otomatis
```

Daftarkan komponen game di `config/games.js` lewat `load: () => import('@/games/crash/CrashGame.jsx')`.

## Catatan provably fair

`utils/rng.js` memakai commit–reveal: hash server seed ditampilkan sebelum bermain,
hasil = HMAC-SHA256(serverSeed, `clientSeed:nonce:cursor`), dan seed lama dibuka saat rotasi
(panel di halaman Games mencocokkan hash-nya). Di mode lokal server seed tersimpan di browser;
untuk produksi pindahkan `roll()` ke server tanpa mengubah API-nya.
