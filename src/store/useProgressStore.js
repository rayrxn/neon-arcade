import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Progres per akun (tabel di backend nanti: user_stats, game_sessions, user_quests,
 * daily_rewards, user_achievements, cheat_flags). Aturan ada di services/progression.js
 * dan services/games.js — store ini hanya menyimpan.
 */

export const emptyProgress = () => ({
  xp: 0,
  stats: { games: 0, wins: 0, losses: 0, pushes: 0, wagered: 0, won: 0, bestMultiplier: 0, biggestWin: 0, perGame: {} },
  daily: { streak: 0, lastClaimDay: null, claims: 0 },
  quests: {
    daily: { period: null, progress: {}, claimed: [] },
    weekly: { period: null, progress: {}, claimed: [] },
    completed: 0,
  },
  achievements: {}, // { [id]: unlockedAt }
  sessions: [], // game_sessions terbaru (maks 100)
  open: {}, // ronde yang belum selesai (crash/mines/blackjack) — bisa dilanjutkan setelah refresh
  flags: [], // cheat_flags
  loginDays: [],
  levelHistory: [], // { level, at, xp } — setiap naik level
  milestones: {}, // { 'L15:15': { type, level, rewardTxId, claimedAt } } — unik, tidak pernah dobel
  season: { id: null, xp: 0, tiersClaimed: [] },
  seasonHistory: [], // { id, xp, tier, rank }
  periodStats: {}, // { 'w:2026-10-05': { xp, games, wins }, 'm:2026-10': {...} }
  recentXp: [], // [{ at, xp }] jendela pendek untuk deteksi XP mustahil
})

export const useProgressStore = create(
  persist(
    (set, get) => ({
      byUser: {},

      /** Ubah progres user lewat fungsi murni (state lama → state baru). */
      update: (userId, fn) => {
        const current = { ...emptyProgress(), ...(get().byUser[userId] ?? {}) }
        const next = fn(structuredClone(current))
        set((s) => ({ byUser: { ...s.byUser, [userId]: next } }))
        return next
      },
    }),
    {
      name: 'neon-arcade:progress',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // v1 → v2: level history, milestone records, season, period stats.
      migrate: (state) => {
        for (const p of Object.values(state?.byUser ?? {})) {
          const fresh = emptyProgress()
          for (const k of Object.keys(fresh)) p[k] ??= fresh[k]
        }
        return state
      },
    },
  ),
)

const EMPTY = emptyProgress()
export const useProgress = (userId) => useProgressStore((s) => (userId ? s.byUser[userId] ?? EMPTY : EMPTY))
export const getProgress = (userId) => {
  const p = useProgressStore.getState().byUser[userId]
  return p ? { ...emptyProgress(), ...p } : emptyProgress()
}
