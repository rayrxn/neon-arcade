/** Fase 8 — role staf (Owner/Admin/Moderator/Helper/Tester), ganti password wajib, reset rilis. */
export default {
  auth: {
    emailOrUsername: 'Email atau username',
    emailOrUsernamePlaceholder: 'kamu@email.com atau username',
    forceChange: {
      title: 'Ganti password dulu',
      body: 'Akun ini masih pakai password bawaan. Ganti sekarang sebelum lanjut.',
      logout: 'Keluar',
    },
  },
  validation: {
    loginRequired: 'Isi email atau username.',
    loginFormat: 'Masukkan email atau username yang valid.',
    passwordSame: 'Password baru harus beda dari yang lama.',
  },
  errors: {
    mustChangePassword: 'Ganti password akun ini dulu.',
  },
  notifications: {
    releaseReset: { title: 'Update baru, data direset', body: 'Saldo dan progres kembali ke awal. Kosmetik kamu tetap ada.' },
  },
  admin: {
    roles: { super_admin: 'Owner', admin: 'Admin', moderator: 'Moderator', support: 'Helper', developer: 'Tester', user: 'User' },
    serverMode: 'Server · data langsung dari database',
    settingsDesc: 'Hak akses per role. Hanya Owner yang bisa mengganti role.',
    backendNoteServer: 'Semua hak akses dicek ulang di server. Menu yang tidak boleh juga disembunyikan.',
    errors: {
      confirmPhrase: 'Teks konfirmasi tidak cocok.',
      serverOnly: 'Hanya tersedia di website live.',
    },
    actions: { 'release.reset': 'reset rilis' },
    release: {
      title: 'Reset rilis',
      body: 'Dipakai saat rilis update. Saldo kembali ke 10.000 AC + 1 AG, level, XP, quest, daily, statistik, dan achievement dihapus.',
      keeps: 'Akun, role, nama, avatar, kosmetik, dan audit log tetap ada.',
      typePhrase: 'Ketik {phrase} untuk lanjut',
      testers: { title: 'Reset akun tester', body: 'Hanya akun Tester dan akun test mode.', button: 'Reset tester' },
      global: { title: 'Reset global', body: 'Semua akun, termasuk staf.', button: 'Reset global' },
    },
  },
}
