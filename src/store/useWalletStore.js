import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { round2 } from '@/utils/format'
import { randomHex } from '@/utils/rng'
import { heldAmount, useRevealStore } from '@/services/reveal'
import { SERVER_MODE } from '@/config/runtime'

/**
 * Ledger dompet per akun. Dua mata uang terpisah:
 *   AC (Arcade Coin) → field `balance`  (tetap dari Fase 2, data lama aman)
 *   AG (Arcade Gems) → field `gems`     (hanya dari Top Up & Redeem Code tertentu)
 *
 * Transaksi: { id, type, currency, amount (bertanda), balanceAfter, at, status,
 *              counterparty: { userId, username } | null, game, code, note, reason, releaseAt }
 *   type   : grant | bonus | bet | win | refund | send | receive | topup | redeem
 *   status : success | pending | failed
 *
 * Aturan bisnis (limit, transfer, redeem) ada di src/services — store ini hanya ledger.
 * Kontrak game (Fase berikutnya): placeBet(amount, game) → payout(amount, game).
 */

export const STARTING_AC = 10_000
export const STARTING_AG = 1
export const DAILY_BONUS = 1_000
export const DAILY_BONUS_COOLDOWN = 24 * 60 * 60 * 1000
const MAX_TRANSACTIONS = 200

export const FIELD = { AC: 'balance', AG: 'gems' }

const makeTx = (fields) => ({
  id: randomHex(8),
  at: Date.now(),
  status: 'success',
  counterparty: null,
  game: null,
  ...fields,
})

export const createWallet = ({ ac = STARTING_AC, ag = STARTING_AG, withGrants = true } = {}) => ({
  balance: ac,
  gems: ag,
  totalWagered: 0,
  totalWon: 0,
  rounds: 0,
  wins: 0,
  biggestWin: null,
  lastBonusAt: null,
  inventory: [],
  redeemed: [],
  transactions: withGrants
    ? [
        makeTx({ type: 'grant', currency: 'AG', amount: ag, balanceAfter: ag }),
        makeTx({ type: 'grant', currency: 'AC', amount: ac, balanceAfter: ac }),
      ]
    : [],
})

const fail = (code) => ({ ok: false, error: code })

/** Kategori riwayat wallet (dipakai filter & laporan). */
export const TX_CATEGORIES = ['game', 'daily', 'quest', 'level', 'achievement', 'redeem', 'admin', 'system', 'reversal', 'refund', 'transfer', 'other']
export function categoryOf(tx) {
  if (tx.type === 'bet' || tx.type === 'win') return 'game'
  if (tx.type === 'reward') return ['daily', 'quest', 'level', 'achievement', 'season'].includes(tx.source) ? (tx.source === 'season' ? 'system' : tx.source) : 'system'
  if (tx.type === 'redeem') return 'redeem'
  if (tx.type === 'adjust') return 'admin'
  if (tx.type === 'reversal') return 'reversal'
  if (tx.type === 'refund') return 'refund'
  if (tx.type === 'grant' || tx.type === 'bonus') return 'system'
  if (tx.type === 'send' || tx.type === 'receive') return 'transfer'
  return 'other'
}

export const useWalletStore = create(
  persist(
    (set, get) => {
      /** Tambah transaksi ke dompet `userId`. Jika `adjust`, saldo mata uangnya ikut berubah. */
      /**
       * Satu-satunya cara mengubah saldo. `idempotencyKey` = unique constraint: transaksi
       * dengan key yang sama tidak pernah dibuat dua kali (double click, refresh, retry).
       * Saldo tidak boleh minus — permintaan seperti itu ditolak (throw), bukan dipotong diam-diam.
       */
      const post = (userId, fields, { adjust = true, patch } = {}) => {
        const { wallets, activeUserId } = get()
        const wallet = wallets[userId]
        if (!wallet) return null
        if (fields.idempotencyKey) {
          const existing = wallet.transactions.find((tx) => tx.idempotencyKey === fields.idempotencyKey)
          if (existing) return { ...existing, duplicate: true }
        }
        const field = FIELD[fields.currency]
        const before = wallet[field]
        const value = adjust ? round2(before + fields.amount) : before
        if (adjust && value < 0) throw Object.assign(new Error('errors.insufficient'), { code: 'errors.insufficient' })
        const tx = makeTx({ ...fields, amount: round2(fields.amount), balanceBefore: before, balanceAfter: value, category: fields.category ?? categoryOf(fields) })
        set({
          wallets: {
            ...wallets,
            [userId]: {
              ...wallet,
              ...(patch ? patch(wallet) : null),
              [field]: value,
              transactions: [tx, ...wallet.transactions].slice(0, MAX_TRANSACTIONS),
            },
          },
          lastDelta: adjust && userId === activeUserId && tx.amount !== 0 ? { id: tx.id, amount: tx.amount, currency: tx.currency } : get().lastDelta,
        })
        return tx
      }

      const active = () => get().wallets[get().activeUserId]

      return {
        activeUserId: null,
        wallets: {},
        lastDelta: null, // { id, amount, currency } — animasi header, tidak dipersist

        activate: (userId) =>
          set((s) => ({
            activeUserId: userId,
            lastDelta: null,
            // Mode server: dompet hanya datang dari snapshot server, tidak pernah dibuat di browser.
            wallets: s.wallets[userId] || SERVER_MODE ? s.wallets : { ...s.wallets, [userId]: createWallet() },
          })),
        deactivate: () => set({ activeUserId: null, lastDelta: null }),

        /** Buat dompet tanpa mengaktifkan (akun demo, penerima transfer). */
        ensureWallet: (userId, options) => {
          if (get().wallets[userId]) return
          set((s) => ({ wallets: { ...s.wallets, [userId]: createWallet(options) } }))
        },

        post,

        /** Ubah transaksi yang sudah ada (mis. pending → success). */
        updateTx: (userId, txId, patch) => {
          const wallet = get().wallets[userId]
          if (!wallet) return
          set((s) => ({
            wallets: {
              ...s.wallets,
              [userId]: { ...wallet, transactions: wallet.transactions.map((tx) => (tx.id === txId ? { ...tx, ...patch } : tx)) },
            },
          }))
        },

        patchWallet: (userId, patch) => {
          const wallet = get().wallets[userId]
          if (!wallet) return
          set((s) => ({ wallets: { ...s.wallets, [userId]: { ...wallet, ...patch(wallet) } } }))
        },

        // ── Kontrak game (AC) ──
        placeBet: (amount, game, extra = {}) => {
          const wallet = active()
          const value = round2(amount)
          if (!wallet) return fail('errors.sessionExpired')
          if (!Number.isFinite(value) || value <= 0) return fail('errors.invalidAmount')
          if (value > wallet.balance) return fail('errors.insufficient')
          const tx = post(get().activeUserId, { type: 'bet', currency: 'AC', amount: -value, game, source: 'game', ...extra }, {
            patch: (w) => ({ totalWagered: round2(w.totalWagered + value), rounds: w.rounds + 1 }),
          })
          return { ok: true, txId: tx.id }
        },

        payout: (amount, game, extra = {}) => {
          const wallet = active()
          const value = round2(amount)
          if (!wallet) return fail('errors.sessionExpired')
          if (!Number.isFinite(value) || value < 0) return fail('errors.invalidAmount')
          if (value === 0) return { ok: true, txId: null }
          const tx = post(get().activeUserId, { type: 'win', currency: 'AC', amount: value, game, source: 'game', ...extra }, {
            patch: (w) => ({
              totalWon: round2(w.totalWon + value),
              wins: (w.wins ?? 0) + 1,
              biggestWin: !w.biggestWin || value > w.biggestWin.amount ? { amount: value, game, at: Date.now() } : w.biggestWin,
            }),
          })
          return { ok: true, txId: tx.id }
        },

        refund: (amount, game) => {
          const wallet = active()
          const value = round2(amount)
          if (!wallet) return fail('errors.sessionExpired')
          if (!Number.isFinite(value) || value <= 0) return fail('errors.invalidAmount')
          const tx = post(get().activeUserId, { type: 'refund', currency: 'AC', amount: value, game }, {
            patch: (w) => ({ totalWagered: round2(Math.max(0, w.totalWagered - value)), rounds: Math.max(0, w.rounds - 1) }),
          })
          return { ok: true, txId: tx.id }
        },

        claimDailyBonus: () => {
          const wallet = active()
          if (!wallet) return fail('errors.sessionExpired')
          if (Date.now() < (wallet.lastBonusAt ?? 0) + DAILY_BONUS_COOLDOWN) return fail('errors.bonusNotReady')
          const tx = post(get().activeUserId, { type: 'bonus', currency: 'AC', amount: DAILY_BONUS }, { patch: () => ({ lastBonusAt: Date.now() }) })
          return { ok: true, txId: tx.id }
        },
      }
    },
    {
      name: 'neon-arcade:wallet',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeUserId: state.activeUserId, wallets: state.wallets }),
      // v1 (Fase 2, hanya AC) → v2: tambah AG (1 AG hadiah registrasi), status, statistik.
      migrate: (state, version) => {
        if (version < 2 && state?.wallets) {
          for (const wallet of Object.values(state.wallets)) {
            wallet.transactions = (wallet.transactions ?? []).map((tx) => ({ currency: 'AC', status: 'success', counterparty: null, ...tx }))
            if (wallet.gems == null) {
              wallet.gems = STARTING_AG
              wallet.transactions.unshift(makeTx({ type: 'grant', currency: 'AG', amount: STARTING_AG, balanceAfter: STARTING_AG }))
            }
            wallet.wins ??= 0
            wallet.biggestWin ??= null
            wallet.inventory ??= []
            wallet.redeemed ??= []
          }
        }
        return state
      },
    },
  ),
)

// ── Selectors ──
export const useActiveWallet = () => useWalletStore((s) => s.wallets[s.activeUserId] ?? null)
export const useBalance = (currency = 'AC') => useWalletStore((s) => s.wallets[s.activeUserId]?.[FIELD[currency]] ?? 0)

/** Saldo yang ditampilkan: saldo ledger dikurangi payout game yang belum di-reveal. */
export function useDisplayBalance(currency = 'AC') {
  const ledger = useBalance(currency)
  const held = useRevealStore((s) => heldAmount(s.held, currency))
  return Math.round((ledger - held) * 100) / 100
}
