import { useAuthStore } from '@/store/useAuthStore'
import { useExtrasStore, emptyExtras } from '@/store/useExtrasStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { SERVER_MODE } from '@/config/runtime'
import { AppError } from '@/utils/errors'
import { randomHex } from '@/utils/rng'
import { api, applyState, applyUser, sync } from './server'
import { play } from './sound'

/** Server actions for platform v2 (converter, loyalty, shop, emotes, missions, memberships). */

const requestId = () => `r${randomHex(12)}`

async function call(path, body = {}) {
  if (!SERVER_MODE) throw new AppError('errors.serverOnly')
  const data = await api(path, body)
  applyState(data.state)
  if (data.user) applyUser(data.user)
  return data.result
}

export const convertAcToAg = (amount) => call('convert', { amount, requestId: requestId() }).then((r) => (play('reward'), r))
export const unlockLoyaltyCard = () => call('loyalty/unlock').then((r) => (play('levelup'), r))
export const buyItem = (itemId, id = requestId()) => call('shop/buy', { itemId, requestId: id }).then((r) => (play('reward'), r))
export const activateBoost = (itemId) => call('shop/use', { itemId })
export const equipStyle = (slot, itemId) => call('shop/equip', { slot, itemId: itemId ?? null })
export const favoriteEmote = (code, on) => call('emotes/favorite', { code, on })
export const claimMission = (missionId, proof) => call('missions/claim', { missionId, proof: String(proof ?? '').trim() })
export const requestMembership = (tier) => call('membership/request', { tier }).then((r) => (sync(), r))
// ── v3: perks, battle pass, banner, manager ──
export const claimPerk = (kind, tier) => call('perk/claim', tier ? { kind, tier } : { kind }).then((r) => (r?.ac || r?.ag ? play('reward') : null, r))
export const setNameAffix = (prefix, suffix) => call('profile/affix', { prefix, suffix })
export const uploadBanner = (image) => call('profile/banner', { image })
export const buyPass = () => call('pass/buy').then((r) => (play('levelup'), r))
export const claimPass = (track = 'all', tier = 0) => call('pass/claim', { track, tier }).then((r) => (play('reward'), r))
export const contactManager = (text) => call('manager/contact', { text }).then((r) => (sync(), r))
export async function fetchActivity(kind = 'all') {
  if (!SERVER_MODE) throw new AppError('errors.serverOnly')
  return api(`activity?kind=${encodeURIComponent(kind)}`)
}
export async function fetchPnl(days) {
  if (!SERVER_MODE) throw new AppError('errors.serverOnly')
  return api(`stats/pnl?days=${days}`)
}

// ── selectors ──
const EMPTY_CATALOG = { cards: [], roles: [], emotes: [], shop: [], missions: [], memberships: {}, economy: { acPerAg: 25000, convertMinAg: 1, convertMaxAgPerDay: 200 } }

export function useCatalog() {
  return usePlatformStore((s) => s.catalog) ?? EMPTY_CATALOG
}
export function useExtras(userId) {
  const me = useAuthStore((s) => s.session?.userId)
  return useExtrasStore((s) => s.byUser[userId ?? me]) ?? emptyExtras
}
export const getExtras = (userId = useAuthStore.getState().session?.userId) => useExtrasStore.getState().byUser[userId] ?? emptyExtras
export const getCatalog = () => usePlatformStore.getState().catalog ?? EMPTY_CATALOG

export const cardOf = (catalog, slug) => catalog.cards.find((c) => c.slug === slug) ?? catalog.cards[0] ?? { slug: 'none', name: 'No Card', rank: 0, color: '#64748b', maxBetAC: 250000, maxBetAG: 10, benefits: [] }
export const roleOf = (catalog, slug) => catalog.roles.find((r) => r.slug === slug) ?? null
export const itemOf = (catalog, id) => catalog.shop.find((i) => i.id === id) ?? null
export const emoteMap = (catalog) => Object.fromEntries(catalog.emotes.map((e) => [e.code, e]))
