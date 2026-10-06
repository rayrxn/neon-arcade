import { getCurrentUser, useAuthStore } from '@/store/useAuthStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { AppError } from '@/utils/errors'
import { randomHex } from '@/utils/rng'
import { COSMETICS } from '@/config/cosmetics'
import { emotesOf, equippedOf } from './cosmetics'
import { blockedBy } from './social'
import { trackMetric } from './progression'
import { createReport } from './reports'
import { emit } from './events'
import { play } from './sound'

/**
 * Global Chat — "API" mode lokal (pesan tersinkron antar-tab di browser yang sama).
 * Backend nanti: WebSocket channel `chat:global` + moderasi yang sama di server.
 *
 * Moderasi dasar:
 *   - maks 200 karakter, spasi berlebih dirapikan
 *   - slow mode: jeda 3 detik (atau sesuai slow mode admin) & maks 5 pesan / 30 detik
 *   - emote :kode: hanya jika dimiliki, badge chat terpasang ikut tersimpan di pesan
 *   - pesan dari user yang diblokir tidak ditampilkan
 *   - pesan identik berulang ditolak
 *   - link diblokir
 *   - kata kasar disensor (pesan ditandai `flagged`)
 *   - user bisa report pesan → disembunyikan untuknya
 */

export const MAX_LENGTH = 200
const MIN_GAP = 3_000
const BURST_WINDOW = 30_000
const BURST_MAX = 5

const BLOCKED_WORDS = ['anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'goblok', 'tolol', 'babi', 'kampret', 'fuck', 'shit', 'bitch', 'asshole']
const WORD_RE = new RegExp(`\\b(${BLOCKED_WORDS.join('|')})\\w*`, 'gi')
const LINK_RE = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|gg|id|xyz|me|ly)\b/i
const MENTION_RE = /@([a-zA-Z0-9_]{3,16})/g

export function moderate(text) {
  let flagged = false
  const masked = text.replace(WORD_RE, (word) => {
    flagged = true
    return word[0] + '*'.repeat(word.length - 1)
  })
  return { text: masked, flagged }
}

export async function sendMessage(raw) {
  const me = getCurrentUser()
  if (!me) throw new AppError('errors.sessionExpired')
  if (me.mutedUntil && me.mutedUntil > Date.now()) {
    if (me.mutedUntil > Date.now() + 365 * 86_400_000) throw new AppError('chat.errors.mutedPermanent')
    throw new AppError('chat.errors.muted', { until: new Date(me.mutedUntil).toLocaleString() })
  }
  if (me.status !== 'active' && me.status) throw new AppError('errors.accountFrozen')
  const clean = String(raw ?? '').replace(/\s+/g, ' ').trim()
  if (!clean) throw new AppError('chat.errors.empty')
  if (clean.length > MAX_LENGTH) throw new AppError('chat.errors.tooLong', { max: MAX_LENGTH })
  if (LINK_RE.test(clean)) throw new AppError('chat.errors.noLinks')

  const now = Date.now()
  const mine = usePlatformStore.getState().chat.filter((m) => m.type === 'user' && m.userId === me.id)
  const last = mine[mine.length - 1]
  const slow = (usePlatformStore.getState().chatSettings?.slowMode ?? 0) * 1000
  if (last && now - last.at < Math.max(MIN_GAP, slow)) throw new AppError(slow > MIN_GAP ? 'chat.errors.slowMode' : 'chat.errors.slowDown', { seconds: Math.ceil((Math.max(MIN_GAP, slow) - (now - last.at)) / 1000) })
  if (mine.filter((m) => now - m.at < BURST_WINDOW).length >= BURST_MAX) throw new AppError('chat.errors.slowDown')

  const moderated = moderate(clean)
  const flagged = moderated.flagged
  // Emote: :kode: → glyph, hanya untuk emote yang dimiliki pengirim.
  const owned = new Map(emotesOf(me.id).map((e) => [e.code, e.glyph]))
  const text = moderated.text.replace(/:([a-z]{2,12}):/g, (m, code) => owned.get(code) ?? m)
  if (last && now - last.at < 60_000 && last.text.toLowerCase() === text.toLowerCase()) throw new AppError('chat.errors.duplicate')

  const badge = equippedOf(me).chatBadge
  const message = { id: randomHex(6), type: 'user', userId: me.id, text, at: now, flagged, badge: badge && COSMETICS[badge] ? badge : null }
  usePlatformStore.getState().addMessage(message)
  emit('MESSAGE_SENT', { userId: me.id, messageId: message.id, flagged })
  if (flagged) emit('SECURITY_EVENT', { userId: me.id, kind: 'profanity', messageId: message.id })
  trackMetric(me.id, 'chat', 1)
  play('chat')

  // Mention → notifikasi untuk user yang disebut.
  const users = Object.values(useAuthStore.getState().users)
  const mentioned = new Set([...text.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase()))
  for (const user of users) {
    if (user.id !== me.id && mentioned.has(user.username.toLowerCase())) {
      useNotificationStore.getState().notify(user.id, 'mention', { username: me.username, text })
    }
  }
  return message
}

/** Sembunyikan pesan untuk diri sendiri (tanpa report). */
export function hideMessage(messageId) {
  const me = getCurrentUser()
  if (me) usePlatformStore.getState().hideMessage(me.id, messageId)
}

/** Report pesan → antrean moderasi (pesan juga disembunyikan untuk pelapor). */
export function reportMessage(messageId, reason = 'offensive', description = '') {
  const msg = usePlatformStore.getState().chat.find((m) => m.id === messageId)
  return createReport({ targetType: 'message', targetUserId: msg?.userId ?? null, messageId, reason, description })
}

/** Pesan yang terlihat oleh viewer (tanpa yang disembunyikan & dari user yang diblokir). */
export function visibleMessages(state, viewerId) {
  const hidden = new Set(state.hidden?.[viewerId] ?? [])
  const blocked = new Set(blockedBy(viewerId))
  return state.chat.filter((m) => !hidden.has(m.id) && !(m.userId && blocked.has(m.userId)))
}
