/**
 * Mode runtime. Di arcadebet.my.id, index.html men-set `window.NEON_API = '/api'` sebelum
 * bundle dimuat → semua aturan (akun, saldo, game, progres) diputuskan server.
 * Tanpa flag itu (artifact, file lokal, tes) website tetap memakai service layer di browser.
 */
export const SERVER_API = typeof window !== 'undefined' && window.NEON_API ? String(window.NEON_API).replace(/\/$/, '') : null
export const SERVER_MODE = !!SERVER_API
