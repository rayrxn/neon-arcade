import { useAuthStore } from '@/store/useAuthStore'
import { useProgressStore } from '@/store/useProgressStore'
import { GAMES, isPlayable } from '@/config/games'

/**
 * Discovery game: trending (24 jam), most played (sepanjang waktu), new, recommended,
 * recently played. Dihitung dari game_sessions asli (tanpa akun test/demo).
 */
const DAY = 86_400_000
/** Game yang ditambahkan di update terakhir (badge "Baru"). */
export const NEW_GAMES = ['sweet', 'tarot', 'keno', 'tower', 'cross', 'pump']

function realProgress() {
  const users = useAuthStore.getState().users
  const ok = new Set(Object.values(users).filter((u) => !u.isTest && !u.isDemo).map((u) => u.id))
  return Object.entries(useProgressStore.getState().byUser).filter(([id]) => ok.has(id)).map(([, p]) => p)
}

export function playCounts(windowMs = null, now = Date.now()) {
  const counts = {}
  for (const p of realProgress()) {
    if (windowMs == null) for (const [slug, g] of Object.entries(p.stats.perGame)) counts[slug] = (counts[slug] ?? 0) + g.played
    else for (const s of p.sessions) if (!s.isTest && now - s.at < windowMs) counts[s.game] = (counts[s.game] ?? 0) + 1
  }
  return counts
}

const playable = GAMES.filter(isPlayable)
const bySlug = Object.fromEntries(GAMES.map((g) => [g.slug, g]))

export function trending(now = Date.now()) {
  const c = playCounts(DAY, now)
  const list = Object.entries(c).sort((a, b) => b[1] - a[1]).map(([slug, n]) => ({ game: bySlug[slug], plays: n })).filter((r) => r.game)
  return list.length ? list : playable.filter((g) => g.badge === 'hot' || g.featured).map((game) => ({ game, plays: 0 }))
}

export function mostPlayed() {
  const c = playCounts()
  return playable.map((game) => ({ game, plays: c[game.slug] ?? 0 })).sort((a, b) => b.plays - a.plays)
}

export const newGames = () => NEW_GAMES.map((s) => bySlug[s]).filter(Boolean)

export function recentlyPlayed(progress) {
  return Object.entries(progress?.stats?.perGame ?? {})
    .filter(([, g]) => g.lastAt)
    .sort((a, b) => b[1].lastAt - a[1].lastAt)
    .map(([slug, g]) => ({ game: bySlug[slug], lastAt: g.lastAt, played: g.played }))
    .filter((r) => r.game)
}

/** Rekomendasi: kategori yang paling sering dimainkan user, tapi game yang belum/jarang dimainkan. */
export function recommended(progress, limit = 4) {
  const per = progress?.stats?.perGame ?? {}
  const catScore = {}
  for (const [slug, g] of Object.entries(per)) if (bySlug[slug]) catScore[bySlug[slug].category] = (catScore[bySlug[slug].category] ?? 0) + g.played
  const popular = playCounts()
  return [...playable]
    .map((game) => ({ game, score: (catScore[game.category] ?? 0) * 2 - (per[game.slug]?.played ?? 0) * 3 + (popular[game.slug] ?? 0) * 0.1 + (game.featured ? 1 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.game)
}

export function searchGames(query, category = 'all', t = (k) => k) {
  const q = String(query ?? '').trim().toLowerCase()
  return GAMES.filter((g) => (category === 'all' || g.category === category) && (!q || g.name.toLowerCase().includes(q) || g.slug.includes(q) || String(t(`games.${g.slug}.tagline`)).toLowerCase().includes(q)))
}
