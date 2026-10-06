import { accountBlock, getCurrentUser, useAuthStore } from '@/store/useAuthStore'
import { useAdminStore } from '@/store/useAdminStore'
import { useWalletStore } from '@/store/useWalletStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { ITEMS, REDEEM_CODES } from '@/config/economy'
import { AppError } from '@/utils/errors'

/**
 * Redeem code — "API" mode lokal.
 * Backend nanti:  GET  /redeem/:code  → preview hadiah (checkCode)
 *                 POST /redeem/:code  → klaim (redeemCode)
 * Kode yang sudah dipakai disimpan per akun (wallet.redeemed); kuota global di platform store.
 */

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export const normalizeCode = (raw = '') => raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)

function resolve(code, userId, now = Date.now()) {
  if (!/^[A-Z0-9]{4,16}$/.test(code)) throw new AppError('redeem.errors.format')
  // Kode bawaan + kode buatan admin (admin juga bisa menonaktifkan kode bawaan).
  const custom = useAdminStore.getState().codes[code]
  const def = REDEEM_CODES[code] || custom ? { perUser: 1, active: true, ...REDEEM_CODES[code], ...custom } : null
  if (!def || def.active === false) throw new AppError('redeem.errors.invalid')
  const expires = typeof def.expiresAt === 'number' ? def.expiresAt : def.expiresAt ? Date.parse(def.expiresAt) : null
  if (expires && now > expires) throw new AppError('redeem.errors.expired')
  const wallet = useWalletStore.getState().wallets[userId]
  if ((wallet?.redeemed ?? []).filter((r) => r.code === code).length >= (def.perUser ?? 1)) throw new AppError('redeem.errors.used')
  const used = usePlatformStore.getState().codeUsage[code] ?? 0
  if (def.globalLimit && used >= def.globalLimit) throw new AppError('redeem.errors.soldOut')
  return {
    code,
    rewards: def.rewards,
    expiresAt: expires,
    remaining: def.globalLimit ? def.globalLimit - used : null,
    rare: def.rewards.some((r) => r.kind === 'AG'),
  }
}

export async function checkCode(raw) {
  await wait(450)
  const me = getCurrentUser()
  if (!me) throw new AppError('errors.sessionExpired')
  return resolve(normalizeCode(raw), me.id)
}

export async function redeemCode(raw) {
  await wait(650)
  const me = getCurrentUser()
  if (!me) throw new AppError('errors.sessionExpired')
  const block = accountBlock(me)
  if (block) throw new AppError(block.code, block.vars)
  if (me.walletFrozen) throw new AppError('errors.walletFrozen')
  const info = resolve(normalizeCode(raw), me.id)
  const wallet = useWalletStore.getState()

  for (const reward of info.rewards) {
    if (reward.kind === 'AC' || reward.kind === 'AG') {
      wallet.post(me.id, { type: 'redeem', currency: reward.kind, amount: reward.amount, code: info.code })
    }
  }
  const items = info.rewards.filter((r) => r.kind === 'item' && ITEMS[r.id]).map((r) => r.id)
  wallet.patchWallet(me.id, (w) => ({
    inventory: [...new Set([...(w.inventory ?? []), ...items])],
    redeemed: [{ code: info.code, rewards: info.rewards, at: Date.now() }, ...(w.redeemed ?? [])],
  }))
  // Bingkai pertama langsung dipasang supaya hadiahnya terlihat.
  const frame = items.find((id) => ITEMS[id].kind === 'frame')
  if (frame && !me.frame) await useAuthStore.getState().updateProfile({ frame }).catch(() => {})

  usePlatformStore.getState().incrementCode(info.code)
  useNotificationStore.getState().notify(me.id, 'redeem', { code: info.code, rewards: info.rewards })
  return info
}
