/** Fase 13 — master update v2.0. */
export default {
  play: {
    errors: {
      maxBet: 'Taruhan maksimal di sini {max} {currency}.',
      loyaltyMaxShort: 'Maks. taruhan di sini: {max} {currency}.',
      gameOff: 'Game ini sedang dimatikan.',
      gameMaintenance: 'Game ini sedang maintenance. Coba lagi nanti.',
      bettingOff: 'Taruhan untuk game ini sedang dijeda.',
      newSessionsOff: 'Ronde baru untuk game ini sedang dijeda. Ronde yang sudah berjalan tetap bisa diselesaikan.',
    },
  },
  banned: {
    title: 'Akun diblokir', subtitle: 'Akun ini tidak bisa memakai Neon Arcade saat ini.',
    status: 'Status', permanent: 'Blokir permanen', temporary: 'Blokir sementara', until: 'Berakhir', never: 'Tidak pernah', issued: 'Diberikan', by: 'Oleh', staff: 'Staf',
    reason: 'Alasan', noReason: 'Tidak ada alasan.', appeal: 'Merasa ini salah? Hubungi tim Neon Arcade lewat akun lain atau channel komunitas.', logout: 'Keluar',
  },
  missions: { status: { none: 'Belum diklaim' } },
  auth: {
    errors: {
      captcha: 'Cek anti-bot gagal. Coba lagi.',
      captchaExpired: 'Cek anti-bot kedaluwarsa. Coba lagi.',
    },
    checking: 'Memastikan kamu manusia…',
  },
  errors: { featureOff: '{feature} sedang tidak tersedia.' },
  maintenance: { upcoming: 'Maintenance terjadwal mulai {time}' },
  system: {
    startsAt: 'Mulai (opsional)', bypassAdmins: 'Staf tetap bisa masuk', bypassTesters: 'Tester tetap bisa masuk', preview: 'Pratinjau layar pemain',
  },
  support: {
    status: { CLAIMED: 'Diambil' },
    errors: { claimed: 'Tiket ini sudah diambil oleh @{name}.' },
    priority: { low: 'Rendah', normal: 'Normal', high: 'Tinggi', urgent: 'Darurat' },
    priorityLabel: 'Prioritas', escalated: 'Dieskalasi', claim: 'Ambil tiket', takeOver: 'Ambil alih', escalate: 'Eskalasi',
    escalatePh: 'Kenapa perlu admin senior?', closeMine: 'Masalahku sudah beres — tutup tiket ini',
  },
  admin: {
    serverOnly: 'Halaman ini hanya berjalan di server live.',
    errors: { confirm: 'Ketik kata konfirmasi dengan tepat.' },
    nav: { features: 'Feature flag', monitoring: 'Monitoring', qa: 'QA center' },
    cols: { severity: 'Tingkat', bet: 'Taruhan' },
    confidence: 'Keyakinan', trigger: 'Alasan ditandai',
    severity: { info: 'Info', low: 'Rendah', medium: 'Sedang', high: 'Tinggi', critical: 'Kritis' },
    severityNote: 'Klik cepat, retry, dan lag itu normal. Hanya kejadian tinggi/kritis dengan keyakinan kuat yang membuka laporan atau membekukan akun; sisanya menunggu dicek orang di sini.',
    flagTabs: { escalated: 'Dieskalasi' },
    flagStatus: { false_positive: 'Salah deteksi', escalated: 'Dieskalasi' },
    ac: { falsePositive: 'Salah deteksi', escalate: 'Eskalasi' },
    gc: {
      controls: 'Kontrol', bettingOff: 'Taruhan mati', newOff: 'Ronde baru mati', scheduled: 'Terjadwal', open: 'Ronde terbuka',
      emergency: 'Shutdown darurat', emergencyGo: 'Matikan sekarang', typeConfirm: 'Ketik {word} untuk konfirmasi',
      emergencyHint: 'Menyalakan maintenance situs, menghentikan ronde baru di semua game, dan membatalkan semua ronde terbuka dengan refund penuh. Pakai hanya saat ada masalah serius.',
      betting: 'Taruhan diizinkan', newSessions: 'Ronde baru diizinkan', from: 'Maintenance dari', until: 'Maintenance sampai', message: 'Pesan untuk pemain', messagePh: 'Tampil di halaman game',
      forceEnd: 'Sekalian akhiri ronde terbuka sekarang', forceEndHint: 'Semua ronde terbuka di game ini dibatalkan dan taruhannya dikembalikan.',
      openRounds: 'Ronde terbuka ({n})', noOpen: 'Tidak ada ronde terbuka.', end: 'Akhiri ronde', endAll: 'Akhiri semua ronde terbuka',
      endHint: 'Ronde dibatalkan dan pemain mendapat kembali taruhan {amount}.', endAllHint: '{n} ronde terbuka akan dibatalkan dan direfund.',
    },
    ann: {
      target: 'Penerima', priority: 'Prioritas', delivered: 'Terkirim', sound: 'Bunyikan suara', resend: 'Kirim ulang', preview: 'Pratinjau',
      priorities: { low: 'Rendah', normal: 'Normal', high: 'Tinggi', urgent: 'Darurat' },
      targets: {
        all: 'Semua pemain.', here: 'Pemain yang sedang online.', vip: 'Member VIP.', vvip: 'Member VVIP.', members: 'Semua member VIP dan VVIP.',
        tester: 'Hanya Tester.', moderator: 'Hanya Moderator.', staff: 'Semua staf.',
      },
    },
    features: {
      desc: 'Matikan fitur, buka dulu untuk Tester atau member VIP, atau jadikan publik. Server yang menegakkan.',
      feature: 'Fitur', note: 'Owner dan Admin selalu bisa membuka semua fitur untuk mengecek.',
      states: { off: 'Mati', tester: 'Tester', vip: 'VIP', public: 'Publik' },
    },
    monitor: {
      desc: 'Error server, request gagal, dan crash yang dilaporkan browser pemain.',
      load: 'Muat terbaru', clear: 'Hapus error lama', clearHint: 'Error yang lebih lama dari satu jam dihapus.', total24: 'Error (24 jam)', api: 'Server', client: 'Browser',
      top: 'Paling sering (24 jam)', none: 'Belum ada catatan.', where: 'Lokasi', code: 'Kode', last: 'Terakhir', loadHint: 'Tekan “Muat terbaru” untuk melihat catatan terbaru.',
      tabs: { all: 'Semua', api: 'Server', client: 'Browser' },
    },
    qa: {
      desc: 'Cek kesehatan read-only ke database live: tabel, fungsi, ledger wallet, hadiah dobel, ronde macet, keamanan, dan konfigurasi.',
      run: 'Jalankan cek', hint: 'Tekan “Jalankan cek”. Tidak ada yang diubah.', ranAt: 'Dijalankan {time} · {ms} ms',
      status: { pass: 'Lulus', info: 'Info', warn: 'Peringatan', error: 'Gagal' },
      groups: { database: 'Database', economy: 'Ekonomi', games: 'Game', system: 'Sistem', security: 'Keamanan' },
      checks: {
        db_connect: 'Koneksi database', db_tables: 'Tabel wajib', db_fn_game_start: 'Fungsi game_start', db_fn_raise_flag: 'Fungsi raise_flag', db_fn_flag_policy: 'Fungsi flag_policy',
        db_fn_maintenance_blocks: 'Fungsi maintenance_blocks', db_fn_game_blocked: 'Fungsi game_blocked', db_fn_wallet_post: 'Fungsi wallet_post',
        economy_ledger: 'Saldo wallet cocok dengan ledger', economy_negative: 'Tidak ada saldo minus', economy_doubleReward: 'Tidak ada hadiah dibayar dua kali',
        games_staleRounds: 'Tidak ada ronde macet', games_config: 'Batas taruhan valid', games_paused: 'Game yang dijeda',
        system_maintenance: 'Maintenance', system_errors1h: 'Tingkat error', security_captcha: 'Captcha anti-bot', security_critical: 'Kejadian keamanan kritis', mail_config: 'Pengiriman email', console_key: 'Owner console',
      },
    },
    eco: {
      players: 'Pemain', circAC: 'AC beredar', circAG: 'AG beredar', avg: 'rata²', median: 'median', alerts: 'Tanda pengaman',
      safeguards: 'Pengaman (tandai → cek → tindak)', safeguardNote: 'Ini hanya tanda. Tidak ada yang diubah sampai ada orang yang mengecek dan bertindak.',
      alert: { rtp: 'RTP di atas 105%', fastGain: 'Untung cepat (24 jam)' },
      flows: 'Dihasilkan / dibelanjakan (7 hari)', category: 'Kategori', generated: 'Dihasilkan', spent: 'Dibelanjakan',
      distribution: 'Sebaran AG', distributionNote: 'Jumlah pemain per saldo AG (akun test tidak dihitung).',
      games: 'Game (7 hari)', rounds: 'Ronde', wagered: 'Dipertaruhkan', top: 'Pemain terkaya',
    },
  },
}
