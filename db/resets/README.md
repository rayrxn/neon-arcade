# Reset rilis

Satu file = satu reset, dijalankan sekali oleh `tools/hosting/after-sync.sh` setelah deploy
(dicatat di tabel `neon_migrations` dengan nama `reset:<file>`).

Nama file: `<tanggal>-<label>.<scope>`, scope `testers` atau `global`. Isi file = alasan (masuk audit log).

    2026-10-07-v1-2.testers   →  reset akun Tester saja
    2026-10-20-v2-0.global    →  reset semua akun

File hanya dibuat setelah pemilik memilih [RESET GLOBAL] / [RESET TESTER] / tanpa reset untuk rilis itu.
