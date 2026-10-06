import { getCurrentUser, useAuthStore } from '@/store/useAuthStore'
import { useWalletStore } from '@/store/useWalletStore'
import { COSMETICS, FREE_ITEMS } from '@/config/cosmetics'
import { AppError } from '@/utils/errors'
import { emit } from './events'
import { trackMetric } from './progression'
import { SERVER_MODE } from '@/config/runtime'
import { toast } from '@/store/useUiStore'
import { api, applyPayload, hydrate } from './server'
import { translate } from '@/i18n'
import { usePrefsStore } from '@/store/usePrefsStore'
import { errorKey } from '@/utils/errors'

/**
 * Inventory & kosmetik (tabel user_items, user_equipped).
 * Server memeriksa kepemilikan sebelum equip — UI tidak bisa memasang item yang tidak dimiliki.
 * Slot: avatar, frame, title, chatBadge, banner (satu item) dan badges (maks 3).
 */
export const MAX_BADGES = 3

export function ownedItems(userId) {
  const inv = useWalletStore.getState().wallets[userId]?.inventory ?? []
  return [...new Set([...FREE_ITEMS, ...inv])].filter((id) => COSMETICS[id])
}
export const owns = (userId, itemId) => ownedItems(userId).includes(itemId)

export function equippedOf(user) {
  const e = user?.equipped ?? {}
  return { avatar: e.avatar ?? null, frame: user?.frame ?? null, title: e.title ?? null, chatBadge: e.chatBadge ?? null, banner: e.banner ?? null, badges: e.badges ?? [] }
}

export function isEquipped(user, itemId) {
  const e = equippedOf(user)
  return e.avatar === itemId || e.frame === itemId || e.title === itemId || e.chatBadge === itemId || e.banner === itemId || e.badges.includes(itemId)
}

const patch = (userId, fn) => useAuthStore.getState().adminPatchUser(userId, fn)

/**
 * Mode server: perubahan kosmetik langsung tampil (optimistis), lalu disimpan ke server.
 * Kalau server menolak (mis. item tidak dimiliki), tampilan dikembalikan dari data server.
 */
function pushProfile(userId, { withAvatar = false } = {}) {
  const u = Object.values(useAuthStore.getState().users).find((x) => x.id === userId)
  if (!u) return
  const body = { frame: u.frame ?? null, equipped: u.equipped ?? {} }
  if (withAvatar) body.avatar = u.avatar
  api('profile', body)
    .then((data) => {
      applyPayload(data)
      checkProfileQuest(userId)
    })
    .catch((err) => {
      toast({ tone: 'error', title: translate(usePrefsStore.getState().language, errorKey(err), err?.vars) })
      hydrate()
    })
}

/** Pasang item. Emote tidak dipasang (otomatis bisa dipakai di chat kalau dimiliki). */
export function equip(itemId) {
  const me = getCurrentUser()
  if (!me) throw new AppError('errors.sessionExpired')
  const item = COSMETICS[itemId]
  if (!item) throw new AppError('errors.notFound')
  if (!owns(me.id, itemId)) throw new AppError('inventory.errors.notOwned')
  if (item.kind === 'emote') throw new AppError('inventory.errors.emote')
  patch(me.id, (u) => {
    const e = { ...(u.equipped ?? {}) }
    if (item.kind === 'frame') return { frame: itemId }
    if (item.kind === 'avatar') return { avatar: { kind: 'preset', id: item.preset }, avatarSet: true, equipped: { ...e, avatar: itemId } }
    if (item.kind === 'badge') {
      const badges = (e.badges ?? []).filter((b) => b !== itemId)
      if (badges.length >= MAX_BADGES) throw new AppError('inventory.errors.badgeLimit', { max: MAX_BADGES })
      return { equipped: { ...e, badges: [...badges, itemId] } }
    }
    return { equipped: { ...e, [item.kind]: itemId } }
  })
  emit('ITEM_EQUIPPED', { userId: me.id, itemId })
  if (SERVER_MODE) pushProfile(me.id, { withAvatar: item.kind === 'avatar' })
  else checkProfileQuest(me.id)
}

export function unequip(itemId) {
  const me = getCurrentUser()
  if (!me) throw new AppError('errors.sessionExpired')
  const item = COSMETICS[itemId]
  if (!item) throw new AppError('errors.notFound')
  patch(me.id, (u) => {
    const e = { ...(u.equipped ?? {}) }
    if (item.kind === 'frame') return u.frame === itemId ? { frame: null } : {}
    if (item.kind === 'badge') return { equipped: { ...e, badges: (e.badges ?? []).filter((b) => b !== itemId) } }
    if (item.kind === 'avatar') return e.avatar === itemId ? { equipped: { ...e, avatar: null } } : {}
    return e[item.kind] === itemId ? { equipped: { ...e, [item.kind]: null } } : {}
  })
  if (SERVER_MODE) pushProfile(me.id)
}

/** Emote yang boleh dipakai user di chat. */
export function emotesOf(userId) {
  const owned = new Set(ownedItems(userId))
  return Object.entries(COSMETICS).filter(([id, it]) => it.kind === 'emote' && owned.has(id)).map(([id, it]) => ({ id, ...it }))
}

/** Profil lengkap = nama tampilan, avatar, title, bingkai. Selesai → quest mingguan "profile". */
export function profileSteps(user) {
  const e = equippedOf(user)
  return [
    { id: 'displayName', done: !!user?.displayName && user.displayName !== user.username },
    { id: 'avatar', done: !!user?.avatarSet || user?.avatar?.kind === 'image' },
    { id: 'title', done: !!e.title },
    { id: 'frame', done: !!e.frame },
  ]
}

export function checkProfileQuest(userId) {
  const user = Object.values(useAuthStore.getState().users).find((u) => u.id === userId)
  if (user && profileSteps(user).every((s) => s.done)) trackMetric(userId, 'profile', 1)
}
