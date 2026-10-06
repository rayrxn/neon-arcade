import { useAdminStore } from '@/store/useAdminStore'
import { randomHex } from '@/utils/rng'

/**
 * Event bus platform (tabel events). Setiap kejadian penting dicatat dengan tipe tetap,
 * supaya analytics, audit, dan integrasi backend nanti membaca satu sumber.
 */
export const EVENT_TYPES = [
  'USER_REGISTERED', 'USER_LOGIN', 'USER_LOGOUT', 'LOGIN_FAILED', 'SESSION_EXPIRED',
  'GAME_STARTED', 'GAME_COMPLETED', 'GAME_WON', 'GAME_LOST', 'XP_GAINED', 'LEVEL_UP', 'MILESTONE_REWARD',
  'QUEST_COMPLETED', 'ACHIEVEMENT_UNLOCKED', 'DAILY_CLAIMED', 'REWARD_GRANTED', 'ITEM_EQUIPPED',
  'ADMIN_ADJUSTMENT', 'TRANSACTION_REVERSED', 'USER_WARNED', 'USER_MUTED', 'USER_UNMUTED', 'USER_BANNED', 'USER_UNBANNED',
  'WALLET_FROZEN', 'WALLET_UNFROZEN', 'ROLE_CHANGED', 'MESSAGE_DELETED', 'MESSAGE_SENT',
  'REPORT_CREATED', 'REPORT_UPDATED', 'REPORT_RESOLVED', 'SECURITY_EVENT',
  'FRIEND_REQUEST_SENT', 'FRIEND_ACCEPTED', 'FRIEND_REMOVED', 'USER_BLOCKED',
  'TICKET_CREATED', 'TICKET_UPDATED', 'SEASON_ENDED', 'MAINTENANCE_STARTED', 'MAINTENANCE_ENDED',
]

const listeners = new Set()
export const onEvent = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function emit(type, data = {}) {
  const event = { ...data, id: randomHex(8), type, at: Date.now() }
  useAdminStore.setState((s) => ({ events: [event, ...(s.events ?? [])].slice(0, 3000) }))
  listeners.forEach((fn) => {
    try {
      fn(event)
    } catch {
      /* listener UI tidak boleh menggagalkan operasi */
    }
  })
  return event
}
