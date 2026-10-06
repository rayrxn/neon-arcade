import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { generateClientSeed, generateFloats, generateServerSeed, sha256Hex } from '@/utils/rng'

/**
 * Sesi provably fair: menyimpan seed aktif & nonce, dan menjadi SATU-SATUNYA pintu
 * untuk mengambil angka acak di semua game.
 *
 * Catatan jujur: di versi mock ini serverSeed tersimpan di browser (bisa diintip lewat DevTools).
 * Di produksi, serverSeed + roll() dipindah ke server; client hanya menerima hash & hasil.
 * API store ini sengaja dibuat sama supaya perpindahannya tidak mengubah kode game.
 */

const freshServerSeed = () => {
  const serverSeed = generateServerSeed()
  return { serverSeed, serverSeedHash: sha256Hex(serverSeed) }
}

const sanitizeClientSeed = (seed) => String(seed ?? '').trim().slice(0, 64)

export const useFairnessStore = create(
  persist(
    (set, get) => ({
      ...freshServerSeed(),
      clientSeed: generateClientSeed(),
      nonce: 0,
      /** Seed sebelumnya yang sudah dibuka untuk verifikasi. */
      previous: null,

      /** Ambil `count` float untuk satu taruhan, lalu naikkan nonce. */
      roll: (count = 1) => {
        const { serverSeed, serverSeedHash, clientSeed, nonce } = get()
        const floats = generateFloats({ serverSeed, clientSeed, nonce, count })
        set({ nonce: nonce + 1 })
        return { floats, proof: { serverSeedHash, clientSeed, nonce } }
      },

      /** Buka server seed lama, buat yang baru, reset nonce. Opsional: ganti client seed. */
      rotateSeeds: (nextClientSeed) => {
        const { serverSeed, serverSeedHash, clientSeed, nonce } = get()
        set({
          previous: { serverSeed, serverSeedHash, clientSeed, rounds: nonce, revealedAt: Date.now() },
          ...freshServerSeed(),
          clientSeed: sanitizeClientSeed(nextClientSeed) || clientSeed,
          nonce: 0,
        })
      },
    }),
    {
      name: 'neon-arcade:fairness',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
