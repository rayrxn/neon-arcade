import { COSMETICS } from './cosmetics'

/**
 * Aturan ekonomi platform (di produksi: konfigurasi server).
 */

export const CURRENCIES = {
  AC: { code: 'AC', decimals: 0 },
  AG: { code: 'AG', decimals: 0 },
}

/** Limit transfer. AG ditahan sebentar (pending) sebagai pengaman mata uang langka. */
export const TRANSFER_LIMITS = {
  AC: { min: 10, max: 100_000, daily: 50_000 },
  AG: { min: 1, max: 10, daily: 3 },
}
export const AG_HOLD_MS = 60_000

/** Kemenangan ≥ nilai ini diumumkan sebagai jackpot di Global Chat. */
export const JACKPOT_THRESHOLD = 10_000

/** Paket Top Up — harga dalam Rupiah. Pembayaran belum terhubung (lihat services/payments.js). */
export const TOP_UP_PACKAGES = [
  { id: 'ag-1', currency: 'AG', amount: 1, price: 15_000 },
  { id: 'ag-5', currency: 'AG', amount: 5, price: 69_000, tag: 'popular' },
  { id: 'ag-12', currency: 'AG', amount: 12, price: 159_000, tag: 'best' },
  { id: 'ac-10k', currency: 'AC', amount: 10_000, price: 10_000 },
  { id: 'ac-50k', currency: 'AC', amount: 50_000, price: 45_000 },
  { id: 'ac-120k', currency: 'AC', amount: 120_000, price: 99_000 },
]

/** Item kosmetik (lihat config/cosmetics.js). */
export const ITEMS = COSMETICS

/**
 * Redeem code (di produksi tersimpan & divalidasi di server).
 * rewards: { kind: 'AC' | 'AG', amount } | { kind: 'item', id }
 */
export const REDEEM_CODES = {
  WELCOME500: { rewards: [{ kind: 'AC', amount: 500 }] },
  LUCKY777: { rewards: [{ kind: 'AC', amount: 777 }], expiresAt: '2026-12-31T23:59:59+07:00' },
  NEONARCADE: {
    rewards: [{ kind: 'AC', amount: 1_000 }, { kind: 'item', id: 'neon-frame' }],
    expiresAt: '2026-12-31T23:59:59+07:00',
  },
  GEMDROP: { rewards: [{ kind: 'AG', amount: 1 }], globalLimit: 3, expiresAt: '2026-12-31T23:59:59+07:00' },
  RAMADAN25: { rewards: [{ kind: 'AC', amount: 2_500 }], expiresAt: '2025-04-30T23:59:59+07:00' },
}
