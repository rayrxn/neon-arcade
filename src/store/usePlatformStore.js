import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Data bersama seluruh platform: global chat, riwayat jackpot, kuota redeem code, presence.
 * Mode lokal: disimpan di localStorage dan disinkronkan antar-tab (lihat PlatformRuntime).
 * Di produksi, state ini berasal dari server (REST + WebSocket); services/ sudah memisahkan
 * aksesnya supaya penggantiannya tidak menyentuh komponen.
 */

const MAX_CHAT = 200
const MAX_JACKPOTS = 50

export const usePlatformStore = create(
  persist(
    (set) => ({
      seededAt: null,
      chat: [], // { id, type: 'user'|'jackpot'|'system', userId, text, at, flagged, reports }
      jackpots: [], // { id, userId, username, amount, currency, game, at }
      codeUsage: {}, // { [CODE]: jumlah dipakai di seluruh platform }
      presence: {}, // { [userId]: lastSeen }
      hidden: {}, // { [userId]: [messageId] } pesan yang di-report/disembunyikan user
      season: null, // { id, startAt, endAt }
      seasonArchive: [], // season yang sudah selesai + leaderboard final (dibekukan)
      friendships: [], // { id, from, to, status: 'pending'|'accepted', at, acceptedAt }
      blocks: {}, // { [userId]: [blockedUserId] }
      favorites: {}, // { [userId]: [gameId] }
      chatSettings: { slowMode: 0 }, // detik antar pesan per user (0 = mati)

      addMessage: (message) => set((s) => ({ chat: [...s.chat, message].slice(-MAX_CHAT) })),
      addJackpot: (win) => set((s) => ({ jackpots: [win, ...s.jackpots].slice(0, MAX_JACKPOTS) })),
      incrementCode: (code) => set((s) => ({ codeUsage: { ...s.codeUsage, [code]: (s.codeUsage[code] ?? 0) + 1 } })),
      ping: (userId) => set((s) => ({ presence: { ...s.presence, [userId]: Date.now() } })),
      hideMessage: (userId, messageId) =>
        set((s) => ({
          hidden: { ...s.hidden, [userId]: [...new Set([...(s.hidden[userId] ?? []), messageId])] },
          chat: s.chat.map((m) => (m.id === messageId ? { ...m, reports: (m.reports ?? 0) + 1 } : m)),
        })),
      markSeeded: (payload) => set({ seededAt: Date.now(), ...payload }),
    }),
    {
      name: 'neon-arcade:platform',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (state) => ({ seasonArchive: [], friendships: [], blocks: {}, favorites: {}, chatSettings: { slowMode: 0 }, season: null, ...state }),
    },
  ),
)

export const ONLINE_WINDOW = 75_000
export const isOnline = (presence, userId, now = Date.now()) => now - (presence[userId] ?? 0) < ONLINE_WINDOW
