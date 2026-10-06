import { usePlatformStore } from '@/store/usePlatformStore'
import { useProgressStore } from '@/store/useProgressStore'
import { useAuthStore } from '@/store/useAuthStore'
import { SEASON_LENGTH_DAYS, SEASON_TIER_XP } from '@/config/cosmetics'
import { emit } from './events'

/**
 * Season (tabel seasons + season_archive). Satu season = 28 hari.
 * Saat season berakhir: hasil dibekukan, leaderboard diarsipkan, riwayat pemain disimpan,
 * season baru dimulai. Progres season pemain di-reset saat ia pertama kali main di season baru.
 */
const DAY = 86_400_000
export const seasonTier = (xp) => Math.floor((xp ?? 0) / SEASON_TIER_XP)

export function currentSeason(now = Date.now()) {
  const s = usePlatformStore.getState().season
  if (s && now < s.endAt) return s
  return ensureSeason(now)
}

/** Season yang tercatat untuk progres pemain (reset bila id berbeda). */
export const seasonXpOf = (p, seasonId) => (p?.season?.id === seasonId ? p.season.xp : 0)

function ranking(seasonId) {
  const users = Object.values(useAuthStore.getState().users).filter((u) => !u.isDemo && !u.isTest)
  const byUser = useProgressStore.getState().byUser
  return users
    .map((u) => ({ userId: u.id, username: u.username, xp: seasonXpOf(byUser[u.id], seasonId) }))
    .filter((r) => r.xp > 0)
    .sort((a, b) => b.xp - a.xp)
    .map((r, i) => ({ ...r, rank: i + 1, tier: seasonTier(r.xp) }))
}

/** Arsipkan season yang sudah lewat dan buat season berikutnya. Aman dipanggil berkali-kali. */
export function ensureSeason(now = Date.now()) {
  const platform = usePlatformStore.getState()
  let season = platform.season
  if (!season) {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    season = { id: 1, startAt: start.getTime(), endAt: start.getTime() + SEASON_LENGTH_DAYS * DAY }
    usePlatformStore.setState({ season, seasonArchive: platform.seasonArchive ?? [] })
    return season
  }
  while (now >= season.endAt) {
    const leaderboard = ranking(season.id)
    const archive = { ...season, endedAt: Math.min(now, season.endAt), leaderboard: leaderboard.slice(0, 100) }
    // Riwayat pemain: simpan peringkat & tier final di progres masing-masing.
    for (const row of leaderboard) {
      useProgressStore.getState().update(row.userId, (p) => {
        if (!p.seasonHistory.some((h) => h.id === season.id)) p.seasonHistory = [{ id: season.id, xp: row.xp, tier: row.tier, rank: row.rank }, ...p.seasonHistory].slice(0, 50)
        return p
      })
    }
    emit('SEASON_ENDED', { seasonId: season.id, players: leaderboard.length })
    const next = { id: season.id + 1, startAt: season.endAt, endAt: season.endAt + SEASON_LENGTH_DAYS * DAY }
    usePlatformStore.setState((s) => ({ season: next, seasonArchive: [archive, ...(s.seasonArchive ?? [])].slice(0, 24) }))
    season = next
  }
  return season
}

export const seasonLeaderboard = (seasonId = currentSeason().id) => ranking(seasonId)
