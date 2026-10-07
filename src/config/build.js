/** Build info: stamped into index.html by tools/deploy.sh (window.NEON_BUILD), falling back to the update log. */
import CHANGELOG from './changelog'

const stamped = typeof window !== 'undefined' ? window.NEON_BUILD : null

export const BUILD = {
  version: stamped?.version ?? CHANGELOG[0].version,
  sha: stamped?.sha ?? null,
  at: stamped?.at ? Date.parse(stamped.at) : null,
}

/** "07 Okt 2026, 07:58 WIB" — release time in Jakarta time. */
export function formatRelease(ms, lang) {
  if (!ms) return null
  const s = new Date(ms).toLocaleString(lang === 'id' ? 'id-ID' : 'en-GB', { timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
  return `${s} WIB`
}

export { CHANGELOG }
