import { useAdminStore } from '@/store/useAdminStore'
import { useAuthStore } from '@/store/useAuthStore'
import { GAMES } from '@/config/games'

/**
 * Status sistem & maintenance (tabel system_settings + service_status).
 * Status komponen dihitung dari pemeriksaan nyata di mode lokal, lalu bisa ditimpa
 * admin (mis. "Chat: DEGRADED — sedang investigasi").
 */
export const SERVICES = ['website', 'api', 'database', 'auth', 'games', 'chat', 'notifications']
export const STATUSES = ['OPERATIONAL', 'DEGRADED', 'MAINTENANCE', 'OUTAGE']

export const systemSettings = () => useAdminStore.getState().system ?? {}

export function maintenanceActive(now = Date.now()) {
  const m = systemSettings().maintenance
  return !!m?.enabled && (!m.startsAt || m.startsAt <= now) && (!m.until || m.until > now)
}

/** Scheduled maintenance that has not started yet (for the countdown banner). */
export function maintenanceUpcoming(now = Date.now()) {
  const m = systemSettings().maintenance
  return m?.enabled && m.startsAt && m.startsAt > now ? m : null
}

/** Same rule as the server: staff bypass when allowed, Testers when allowed, players never. */
export function maintenanceBlocks(role, now = Date.now()) {
  if (!maintenanceActive(now)) return false
  const m = systemSettings().maintenance
  if (['super_admin', 'admin', 'moderator', 'support'].includes(role)) return m.bypassAdmins === false
  if (role === 'developer') return m.bypassTesters === false
  return true
}

function storageOk() {
  try {
    const k = 'neon-arcade:health'
    localStorage.setItem(k, String(Date.now()))
    const ok = !!localStorage.getItem(k)
    localStorage.removeItem(k)
    return ok
  } catch {
    return false
  }
}

/** Status tiap komponen: pemeriksaan otomatis + override admin. */
export function serviceStatus() {
  const overrides = systemSettings().services ?? {}
  const maint = maintenanceActive()
  const config = useAdminStore.getState().gameConfig
  const playable = GAMES.filter((g) => g.load)
  const off = playable.filter((g) => (config[g.slug]?.status ?? 'live') !== 'live').length
  const db = storageOk()
  const auto = {
    website: 'OPERATIONAL',
    api: 'OPERATIONAL',
    database: db ? 'OPERATIONAL' : 'OUTAGE',
    auth: db && useAuthStore.persist ? 'OPERATIONAL' : 'DEGRADED',
    games: maint ? 'MAINTENANCE' : off === playable.length ? 'OUTAGE' : off > 0 ? 'DEGRADED' : 'OPERATIONAL',
    chat: maint ? 'MAINTENANCE' : 'OPERATIONAL',
    notifications: 'OPERATIONAL',
  }
  return SERVICES.map((id) => {
    const o = overrides[id]
    return { id, status: o?.status ?? auto[id], note: o?.note ?? null, auto: !o, gamesOff: id === 'games' ? off : undefined }
  })
}

export const overallStatus = (list) =>
  list.some((s) => s.status === 'OUTAGE') ? 'OUTAGE' : list.some((s) => s.status === 'MAINTENANCE') ? 'MAINTENANCE' : list.some((s) => s.status === 'DEGRADED') ? 'DEGRADED' : 'OPERATIONAL'
