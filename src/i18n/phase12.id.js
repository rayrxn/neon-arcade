/** Fase 12 — update log, versi situs, tukar ke Rupiah (prank). */
export default {
  updates: {
    title: 'Update log', older: 'Update sebelumnya', ok: 'Mantap!', reload: 'Muat ulang untuk update', live: 'Baru',
    released: 'rilis {time}',
    tags: { new: 'Baru', improve: 'Lebih baik', fix: 'Diperbaiki' },
  },
  exchange: {
    rateAg: '1 AG = Rp1.000', rateAc: '100 AC = Rp1',
    gross: 'Nilai tukar', fee: 'Biaya admin',
    accountLabel: 'Nomor rekening {bank}', accountPlaceholder: 'Nomor rekening {n} digit', phoneLabel: 'Nomor HP {method}',
    holderLabel: 'Nama pemilik rekening', holderPlaceholder: 'Sesuai nama di bank', secure: 'Terenkripsi dan terlindungi',
    confirmTitle: 'Cek penarikanmu', rowAmount: 'Jumlah', rowTo: 'Kirim ke', rowAccount: 'Nomor rekening', rowPhone: 'Nomor HP', rowHolder: 'Pemilik rekening',
    eta: 'Dana biasanya masuk dalam 1–5 menit. Pastikan data sudah benar, transfer tidak bisa dibatalkan.',
    stages: { verify: 'Memverifikasi akun', check: 'Mengecek data {method}', send: 'Mengirim dana ke {method}' },
    errors: { balance: 'Saldo tidak cukup.', min: 'Minimal penarikan {min}.', account: 'Nomor rekening {bank} terdiri dari {n} digit.', phone: 'Masukkan nomor HP yang valid (08…).', holder: 'Masukkan nama pemilik rekening.' },
    action: 'Rupiah', title: 'Tukar ke Rupiah', subtitle: 'Tarik koinmu jadi Rupiah, langsung dikirim ke bank atau e-wallet.',
    amount: 'Jumlah yang ditukar', balance: 'Saldo: {amount} {currency}', youGet: 'Kamu terima', next: 'Lanjut', back: 'Kembali',
    bank: 'Transfer bank', ewallet: 'E-wallet', choose: 'Pilih tujuan', confirmTo: 'Kirim ke {method}',
    processing: 'Memproses penarikan…', processingTo: 'Menghubungi {method}',
    prankBody: 'AC dan AG adalah koin mainan Neon Arcade. Sampai kapan pun tidak bisa ditukar ke uang asli.',
    prankNote: 'Saldomu aman, tidak berkurang. Data rekening yang kamu ketik tidak pernah dikirim atau disimpan, dan sudah dihapus.',
    prankOk: 'Kena deh 😅',
  },
}
