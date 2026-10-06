import { getCurrentUser, getUserById, useAuthStore } from '@/store/useAuthStore'
import { usePlatformStore, isOnline } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { getProgress } from '@/store/useProgressStore'
import { GAMES } from '@/config/games'
import { AppError } from '@/utils/errors'
import { randomHex } from '@/utils/rng'
import { emit } from './events'

/**
 * Teman, blokir, favorit (tabel friendships, user_blocks, favorites).
 * Friendship: satu baris per pasangan (unik), status pending → accepted.
 */
const MAX_FRIENDS = 200
const HOURLY_REQUESTS = 20

const me = () => {
  const user = getCurrentUser()
  if (!user) throw new AppError('errors.sessionExpired')
  return user
}
const platform = () => usePlatformStore.getState()
const pairOf = (a, b) => platform().friendships.find((f) => (f.from === a && f.to === b) || (f.from === b && f.to === a))
const notify = (userId, kind, data) => useNotificationStore.getState().notify(userId, kind, data)

export const blockedBy = (userId) => platform().blocks[userId] ?? []
export const isBlockedEither = (a, b) => blockedBy(a).includes(b) || blockedBy(b).includes(a)

export function friendIds(userId, state = platform()) {
  return state.friendships.filter((f) => f.status === 'accepted' && (f.from === userId || f.to === userId)).map((f) => (f.from === userId ? f.to : f.from))
}
export const incomingRequests = (userId, state = platform()) => state.friendships.filter((f) => f.status === 'pending' && f.to === userId)
export const outgoingRequests = (userId, state = platform()) => state.friendships.filter((f) => f.status === 'pending' && f.from === userId)

export function findUserByName(name) {
  const key = String(name ?? '').trim().replace(/^@/, '').toLowerCase()
  return Object.values(useAuthStore.getState().users).find((u) => u.username.toLowerCase() === key) ?? null
}

export async function sendFriendRequest(username) {
  await new Promise((r) => setTimeout(r, 200))
  const user = me()
  const target = findUserByName(username)
  if (!target) throw new AppError('friends.errors.notFound')
  if (target.id === user.id) throw new AppError('friends.errors.self')
  if (isBlockedEither(user.id, target.id)) throw new AppError('friends.errors.blocked')
  const existing = pairOf(user.id, target.id)
  if (existing?.status === 'accepted') throw new AppError('friends.errors.already')
  if (existing?.from === user.id) throw new AppError('friends.errors.pending')
  if (existing && existing.to === user.id) return acceptFriend(existing.id)
  if (friendIds(user.id).length >= MAX_FRIENDS) throw new AppError('friends.errors.limit')
  const recent = platform().friendships.filter((f) => f.from === user.id && Date.now() - f.at < 3_600_000)
  if (recent.length >= HOURLY_REQUESTS) throw new AppError('friends.errors.rate')
  const row = { id: randomHex(6), from: user.id, to: target.id, status: 'pending', at: Date.now(), acceptedAt: null }
  usePlatformStore.setState((s) => ({ friendships: [row, ...s.friendships] }))
  notify(target.id, 'friendRequest', { username: user.username, requestId: row.id })
  emit('FRIEND_REQUEST_SENT', { userId: user.id, targetId: target.id })
  return row
}

export function acceptFriend(requestId) {
  const user = me()
  const row = platform().friendships.find((f) => f.id === requestId)
  if (!row || row.to !== user.id || row.status !== 'pending') throw new AppError('friends.errors.noRequest')
  usePlatformStore.setState((s) => ({ friendships: s.friendships.map((f) => (f.id === requestId ? { ...f, status: 'accepted', acceptedAt: Date.now() } : f)) }))
  notify(row.from, 'friendAccept', { username: user.username })
  emit('FRIEND_ACCEPTED', { userId: user.id, friendId: row.from })
  return row
}

export function declineFriend(requestId) {
  const user = me()
  const row = platform().friendships.find((f) => f.id === requestId)
  if (!row || row.status !== 'pending' || (row.to !== user.id && row.from !== user.id)) throw new AppError('friends.errors.noRequest')
  usePlatformStore.setState((s) => ({ friendships: s.friendships.filter((f) => f.id !== requestId) }))
}

export function removeFriend(friendId) {
  const user = me()
  const row = pairOf(user.id, friendId)
  if (!row) throw new AppError('friends.errors.noRequest')
  usePlatformStore.setState((s) => ({ friendships: s.friendships.filter((f) => f.id !== row.id) }))
  emit('FRIEND_REMOVED', { userId: user.id, friendId })
}

export function blockUser(targetId) {
  const user = me()
  if (targetId === user.id || !getUserById(targetId)) throw new AppError('friends.errors.notFound')
  usePlatformStore.setState((s) => ({
    blocks: { ...s.blocks, [user.id]: [...new Set([...(s.blocks[user.id] ?? []), targetId])] },
    friendships: s.friendships.filter((f) => !((f.from === user.id && f.to === targetId) || (f.from === targetId && f.to === user.id))),
  }))
  emit('USER_BLOCKED', { userId: user.id, targetId })
}

export function unblockUser(targetId) {
  const user = me()
  usePlatformStore.setState((s) => ({ blocks: { ...s.blocks, [user.id]: (s.blocks[user.id] ?? []).filter((id) => id !== targetId) } }))
}

/** Daftar teman lengkap untuk halaman Friends. */
export function friendList(userId, state = platform(), now = Date.now()) {
  return friendIds(userId, state)
    .map((id) => {
      const u = getUserById(id)
      if (!u) return null
      const p = getProgress(id)
      const recent = p.sessions[0]
      return { user: u, online: isOnline(state.presence, id, now), lastSeen: state.presence[id] ?? u.lastLoginAt, recentGame: recent?.game ?? null, recentAt: recent?.at ?? null, xp: p.xp }
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.online) - Number(a.online) || (b.lastSeen ?? 0) - (a.lastSeen ?? 0))
}

// ── Favorit ──
export function toggleFavorite(slug) {
  const user = me()
  if (!GAMES.some((g) => g.slug === slug)) throw new AppError('errors.notFound')
  const list = platform().favorites[user.id] ?? []
  const on = !list.includes(slug)
  usePlatformStore.setState((s) => ({ favorites: { ...s.favorites, [user.id]: on ? [slug, ...list] : list.filter((x) => x !== slug) } }))
  return on
}
export const favoritesOf = (userId, state = platform()) => state.favorites[userId] ?? []
export function favoriteCounts(state = platform()) {
  const counts = {}
  for (const list of Object.values(state.favorites)) for (const slug of list) counts[slug] = (counts[slug] ?? 0) + 1
  return counts
}
