import { useMemo } from 'react'
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { randomHex } from '@/utils/rng'
import { usePrefsStore } from './usePrefsStore'
import { SERVER_MODE } from '@/config/runtime'
import { background } from '@/services/server'

/**
 * Notifikasi per akun (ikon lonceng di header).
 * item: { id, kind, data, at, read }
 *   kind: transferIn | transferOut | transferPending | transferFailed | redeem | jackpot | mention
 * Jenis yang dimatikan di Settings → Notifications tidak dibuat.
 */

const PREF_FOR_KIND = {
  transferIn: 'transfers',
  transferOut: 'transfers',
  transferPending: 'transfers',
  transferFailed: 'transfers',
  redeem: 'redeem',
  jackpot: 'jackpots',
  mention: 'mentions',
  levelUp: 'progress',
  quest: 'progress',
  achievement: 'progress',
  daily: 'progress',
  reward: 'progress',
  friendRequest: 'friends',
  friendAccept: 'friends',
}

/**
 * Jenis lain (selalu dikirim): security (warning/restriction), reportUpdate, ticket,
 * announcement, adminCredit, milestone.
 */

export const useNotificationStore = create(
  persist(
    (set) => ({
      byUser: {},

      /** opts.force: notifikasi keamanan/admin selalu dikirim, tidak bisa dimatikan. */
      notify: (userId, kind, data, opts = {}) => {
        const pref = PREF_FOR_KIND[kind]
        if (!opts.force && pref && usePrefsStore.getState().notifications[pref] === false) return null
        const item = { id: randomHex(6), kind, data, at: Date.now(), read: false }
        set((s) => ({ byUser: { ...s.byUser, [userId]: [item, ...(s.byUser[userId] ?? [])].slice(0, 200) } }))
        return item
      },
      markRead: (userId, id) => {
        set((s) => ({ byUser: { ...s.byUser, [userId]: (s.byUser[userId] ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)) } }))
        if (SERVER_MODE) background('notifications', { action: 'read', id })
      },
      markAllRead: (userId) => {
        set((s) => ({ byUser: { ...s.byUser, [userId]: (s.byUser[userId] ?? []).map((n) => ({ ...n, read: true })) } }))
        if (SERVER_MODE) background('notifications', { action: 'readAll' })
      },
      clear: (userId) => {
        set((s) => ({ byUser: { ...s.byUser, [userId]: [] } }))
        if (SERVER_MODE) background('notifications', { action: 'clear' })
      },
    }),
    { name: 'neon-arcade:notifications', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)

const EMPTY = []
export const useNotifications = (userId) => useNotificationStore((s) => (userId ? s.byUser[userId] ?? EMPTY : EMPTY))

/** Moderation actions and staff announcements are shown as a pop-up on screen, not in the bell. */
export const POPUP_KINDS = new Set(['security', 'announcement'])
export function useBellNotifications(userId) {
  const all = useNotifications(userId)
  return useMemo(() => all.filter((n) => !POPUP_KINDS.has(n.kind)), [all])
}
