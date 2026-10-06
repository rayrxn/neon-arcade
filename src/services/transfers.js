import { accountBlock, getCurrentUser, getUserById } from '@/store/useAuthStore'
import { FIELD, useWalletStore } from '@/store/useWalletStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { AG_HOLD_MS, TRANSFER_LIMITS } from '@/config/economy'
import { AppError } from '@/utils/errors'
import { dayKey } from '@/utils/format'

/**
 * Transfer saldo antar user — "API" mode lokal.
 * Kontrak untuk backend: POST /transfers { toUserId, currency, amount, note } → { status, tx }
 *
 * Status:
 *   success  → AC langsung masuk ke penerima
 *   pending  → AG ditahan AG_HOLD_MS (pengaman), lalu diselesaikan settlePendingTransfers()
 *   failed   → ditolak aturan server (limit harian); saldo tidak berubah, tetap tercatat di riwayat
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export function sentToday(userId, currency, now = Date.now()) {
  const wallet = useWalletStore.getState().wallets[userId]
  if (!wallet) return 0
  const today = dayKey(now)
  return wallet.transactions
    .filter((tx) => tx.type === 'send' && tx.currency === currency && tx.status !== 'failed' && dayKey(tx.at) === today)
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)
}

/** Validasi yang sama dipakai form (realtime) dan service. Mengembalikan { code, vars } atau null. */
export function validateTransfer({ fromUserId, toUserId, currency, amount }) {
  const wallet = useWalletStore.getState().wallets[fromUserId]
  const limits = TRANSFER_LIMITS[currency]
  if (!toUserId) return { code: 'send.errors.noRecipient' }
  if (toUserId === fromUserId) return { code: 'send.errors.self' }
  if (!Number.isFinite(amount) || amount <= 0) return { code: 'errors.invalidAmount' }
  if (!Number.isInteger(amount)) return { code: 'send.errors.wholeNumber' }
  if (amount < limits.min) return { code: 'send.errors.min', vars: { min: limits.min, currency } }
  if (amount > limits.max) return { code: 'send.errors.max', vars: { max: limits.max, currency } }
  if (!wallet || amount > wallet[FIELD[currency]]) return { code: 'errors.insufficient' }
  return null
}

export async function sendTransfer({ toUserId, currency, amount, note = '' }) {
  await wait(750)
  const me = getCurrentUser()
  if (!me) throw new AppError('errors.sessionExpired')
  const block = accountBlock(me)
  if (block) throw new AppError(block.code, block.vars)
  if (me.walletFrozen) throw new AppError('errors.walletFrozen')
  if (me.isTest) throw new AppError('errors.testAccount')
  const recipient = getUserById(toUserId)
  if (!recipient) throw new AppError('send.errors.noRecipient')

  const problem = validateTransfer({ fromUserId: me.id, toUserId, currency, amount })
  if (problem) throw new AppError(problem.code, problem.vars)

  const wallet = useWalletStore.getState()
  const notify = useNotificationStore.getState().notify
  wallet.ensureWallet(recipient.id)
  const counterparty = { userId: recipient.id, username: recipient.username }
  const cleanNote = note.trim().slice(0, 80)

  // Aturan server: limit harian → tercatat sebagai Failed tanpa memotong saldo.
  if (sentToday(me.id, currency) + amount > TRANSFER_LIMITS[currency].daily) {
    const tx = wallet.post(me.id, { type: 'send', currency, amount: -amount, status: 'failed', reason: 'dailyLimit', counterparty, note: cleanNote }, { adjust: false })
    notify(me.id, 'transferFailed', { amount, currency, username: recipient.username, reason: 'dailyLimit' })
    return { status: 'failed', reason: 'dailyLimit', tx }
  }

  if (currency === 'AG') {
    const tx = wallet.post(me.id, { type: 'send', currency, amount: -amount, status: 'pending', releaseAt: Date.now() + AG_HOLD_MS, counterparty, note: cleanNote })
    notify(me.id, 'transferPending', { amount, currency, username: recipient.username })
    return { status: 'pending', tx }
  }

  const tx = wallet.post(me.id, { type: 'send', currency, amount: -amount, counterparty, note: cleanNote })
  wallet.post(recipient.id, { type: 'receive', currency, amount, counterparty: { userId: me.id, username: me.username }, note: cleanNote })
  notify(recipient.id, 'transferIn', { amount, currency, username: me.username })
  return { status: 'success', tx }
}

/** Selesaikan transfer AG yang masa tahannya sudah lewat. Dipanggil berkala oleh PlatformRuntime. */
export function settlePendingTransfers(now = Date.now()) {
  const store = useWalletStore.getState()
  const notify = useNotificationStore.getState().notify
  let settled = 0
  for (const [userId, wallet] of Object.entries(store.wallets)) {
    for (const tx of wallet.transactions) {
      if (tx.type !== 'send' || tx.status !== 'pending' || (tx.releaseAt ?? 0) > now) continue
      const sender = getUserById(userId)
      const recipientId = tx.counterparty?.userId
      store.updateTx(userId, tx.id, { status: 'success', settledAt: now })
      if (recipientId) {
        store.ensureWallet(recipientId)
        useWalletStore.getState().post(recipientId, {
          type: 'receive',
          currency: tx.currency,
          amount: Math.abs(tx.amount),
          counterparty: { userId, username: sender?.username ?? '—' },
          note: tx.note,
        })
        notify(recipientId, 'transferIn', { amount: Math.abs(tx.amount), currency: tx.currency, username: sender?.username ?? '—' })
      }
      notify(userId, 'transferOut', { amount: Math.abs(tx.amount), currency: tx.currency, username: tx.counterparty?.username })
      settled++
    }
  }
  return settled
}
