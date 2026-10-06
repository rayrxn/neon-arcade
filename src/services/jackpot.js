import { getUserById, useAuthStore } from '@/store/useAuthStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { JACKPOT_THRESHOLDS } from '@/config/economy'
import { randomHex } from '@/utils/rng'
import { SERVER_MODE } from '@/config/runtime'

/**
 * Pengumuman jackpot. Game memanggil recordWin() setelah payout (lihat services/games.js).
 * Kemenangan ≥ JACKPOT_THRESHOLD masuk daftar jackpot, diumumkan di Global Chat,
 * dan dikirim sebagai notifikasi ke akun lain.
 */
export function recordWin({ userId, amount, game, currency = 'AC' }) {
  if (SERVER_MODE) return null // dicatat server saat payout
  if (!(amount > (JACKPOT_THRESHOLDS[currency] ?? Infinity))) return null
  const user = getUserById(userId)
  if (!user) return null
  const win = { id: randomHex(6), userId, username: user.username, amount, currency, game, at: Date.now() }
  const platform = usePlatformStore.getState()
  platform.addJackpot(win)
  platform.addMessage({ id: randomHex(6), type: 'jackpot', jackpotId: win.id, at: win.at })

  const notify = useNotificationStore.getState().notify
  for (const other of Object.values(useAuthStore.getState().users)) {
    if (!other.isDemo && other.id !== userId) notify(other.id, 'jackpot', { username: user.username, amount, game })
  }
  return win
}

export const biggestJackpot = (jackpots) => jackpots.reduce((best, j) => (!best || j.amount > best.amount ? j : best), null)
