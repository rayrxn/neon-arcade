import { useAuthStore } from '@/store/useAuthStore'
import { useProgressStore } from '@/store/useProgressStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { levelFromXp } from '@/config/progression'
import { friendIds } from './social'
import { currentSeason, seasonXpOf } from './seasons'
import { monthKey, weekKey } from './progression'

/**
 * Leaderboard (di backend: materialized view per periode).
 * Akun test, akun demo, dan akun yang di-ban tidak pernah masuk peringkat.
 *
 * scope: global | weekly | monthly | game | friends | season
 * category: level | xp | games | wins | achievements
 */
export const LB_SCOPES = ['global', 'weekly', 'monthly', 'game', 'friends', 'season']
export const LB_CATEGORIES = ['level', 'xp', 'games', 'wins', 'achievements']

export function eligibleUsers(users = useAuthStore.getState().users) {
  return Object.values(users).filter((u) => !u.isDemo && !u.isTest && u.status !== 'banned')
}

function valueFor(p, scope, category, game, now) {
  if (scope === 'season') return seasonXpOf(p, currentSeason(now).id)
  if (scope === 'weekly' || scope === 'monthly') {
    const row = p.periodStats?.[scope === 'weekly' ? `w:${weekKey(now)}` : `m:${monthKey(now)}`] ?? {}
    if (category === 'games') return row.games ?? 0
    if (category === 'wins') return row.wins ?? 0
    return row.xp ?? 0 // level/xp/achievements per periode → XP periode
  }
  if (scope === 'game') {
    const g = p.stats.perGame[game] ?? {}
    if (category === 'wins') return g.wins ?? 0
    return g.played ?? 0
  }
  if (category === 'level' || category === 'xp') return p.xp
  if (category === 'games') return p.stats.games
  if (category === 'wins') return p.stats.wins
  if (category === 'achievements') return Object.keys(p.achievements).length
  return 0
}

export function leaderboard({ scope = 'global', category = 'level', game = null, viewerId = null, limit = 100 }, now = Date.now()) {
  const byUser = useProgressStore.getState().byUser
  let users = eligibleUsers()
  if (scope === 'friends') {
    const ids = new Set([...friendIds(viewerId, usePlatformStore.getState()), viewerId])
    users = Object.values(useAuthStore.getState().users).filter((u) => ids.has(u.id) && !u.isTest && !u.isDemo)
  }
  const rows = users
    .map((u) => {
      const p = byUser[u.id]
      if (!p) return null
      const value = valueFor(p, scope, category, game, now)
      return { user: u, value, level: levelFromXp(p.xp).level, xp: p.xp }
    })
    .filter((r) => r && (r.value > 0 || r.user.id === viewerId))
    .sort((a, b) => b.value - a.value || b.xp - a.xp)
  rows.forEach((r, i) => (r.rank = i + 1))
  return { rows: rows.slice(0, limit), me: rows.find((r) => r.user.id === viewerId) ?? null, total: rows.length }
}
