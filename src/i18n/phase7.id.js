/** Teks Fase 7: mode server (akun, saldo, game, progres disimpan di server). */
export default {
  errors: {
    network: 'Tidak bisa terhubung ke server. Cek koneksi lalu coba lagi.',
    serverSoon: 'Fitur ini sedang dipindahkan ke server. Untuk sementara belum bisa dipakai.',
    invalidInput: 'Data tidak valid.',
  },
  server: {
    loading: 'Memuat akun…',
    offlineTitle: 'Server tidak terjangkau',
    offlineBody: 'Data akun dan saldo disimpan di server. Coba lagi sebentar lagi.',
    retry: 'Coba lagi',
    adminBanner: 'Panel admin masih membaca data dari browser ini. Aksi admin dipindahkan ke server di tahap berikutnya.',
  },
  auth: {
    serverNote: 'Akun & saldo disimpan aman di server. AC dan AG tidak bernilai uang.',
  },
}
