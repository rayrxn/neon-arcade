/**
 * Format angka & waktu yang mengikuti bahasa aktif.
 * Bahasa di-set dari i18n (setFormatLanguage) — id: 10.000 / en: 10,000.
 */

let language = 'id'
const LOCALES = { id: 'id-ID', en: 'en-US' }
export const setFormatLanguage = (lang) => {
  language = LOCALES[lang] ? lang : 'id'
}
export const currentLocale = () => LOCALES[language]

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100

const formatters = new Map()
function getFormatter(decimals) {
  const key = `${language}:${decimals}`
  if (!formatters.has(key)) {
    formatters.set(
      key,
      new Intl.NumberFormat(currentLocale(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    )
  }
  return formatters.get(key)
}

/** 10000 → "10.000" (id) / "10,000" (en). Desimal hanya muncul jika perlu. */
export function formatCoins(value, decimals) {
  const n = Number.isFinite(value) ? value : 0
  const d = decimals ?? (Number.isInteger(round2(n)) ? 0 : 2)
  return getFormatter(d).format(d === 0 ? Math.round(n) : n)
}

export function formatSigned(value) {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${formatCoins(Math.abs(value))}`
}

export function shortHash(hash, head = 10, tail = 6) {
  if (!hash) return '—'
  return hash.length <= head + tail ? hash : `${hash.slice(0, head)}…${hash.slice(-tail)}`
}

const AGO = {
  id: { now: 'baru saja', s: (n) => `${n} dtk lalu`, m: (n) => `${n} mnt lalu`, h: (n) => `${n} jam lalu`, d: (n) => `${n} hari lalu` },
  en: { now: 'just now', s: (n) => `${n}s ago`, m: (n) => `${n}m ago`, h: (n) => `${n}h ago`, d: (n) => `${n}d ago` },
}

export function timeAgo(timestamp, now = Date.now()) {
  const L = AGO[language]
  const s = Math.max(0, Math.round((now - timestamp) / 1000))
  if (s < 10) return L.now
  if (s < 60) return L.s(s)
  const m = Math.floor(s / 60)
  if (m < 60) return L.m(m)
  const h = Math.floor(m / 60)
  if (h < 24) return L.h(h)
  return L.d(Math.floor(h / 24))
}

export const formatTime = (ts) => new Intl.DateTimeFormat(currentLocale(), { hour: '2-digit', minute: '2-digit' }).format(ts)

export const formatDate = (ts, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Intl.DateTimeFormat(currentLocale(), opts).format(ts)

export const formatDateTime = (ts) =>
  new Intl.DateTimeFormat(currentLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(ts)

/** Label grup riwayat: "Hari ini", "Kemarin", atau tanggal. */
export function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function formatCountdown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export const initials = (name = '') => name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '??'

/** Sisa waktu ringkas: "3d 4h", "5h 12m", "12m". */
export function formatLeft(ms) {
  const total = Math.max(0, Math.floor(ms / 60_000))
  const d = Math.floor(total / 1440)
  const h = Math.floor((total % 1440) / 60)
  const m = total % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
