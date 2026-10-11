/**
 * House bots: simulated players that keep the lobby lively. Always tagged "BOT" in the UI.
 * Deterministic from the clock, so every visitor sees the same bots at the same time. Turned on/off by admins
 * (platform.bots). They never touch wallets, leaderboards or real game data.
 */
import { usePlatformStore } from '@/store/usePlatformStore'

const NAMES = ['NeonFox', 'LuckyLuna', 'RazorKid', 'PixelPanda', 'MoonWalker', 'Zyra', 'KopiSusu', 'BudiGG', 'SiregarX', 'TokekMas', 'Nayla77', 'RioRush',
  'Juragan', 'CryptoCat', 'AstraNova', 'Kenji', 'Dewi_ok', 'Bagas', 'Mbak_Rara', 'Gilang99', 'Sasuke_id', 'Wulan', 'HokiTerus', 'NgopiDulu', 'Arka', 'Vexa',
  'Tari', 'Fajar', 'Indah', 'Yoga_', 'Kirana', 'Raka', 'Salsa', 'Dimas', 'Putri', 'Jojo', 'Bima', 'Citra', 'Rendy', 'Mika']
const PRESETS = ['cyan', 'violet', 'sunset', 'mint', 'rose', 'gold']
const GAMES = ['crash', 'plinko', 'mines', 'dice', 'roulette', 'blackjack', 'sweet', 'cross', 'tower', 'keno', 'coinflip', 'limbo', 'snake', 'slice', 'tarot', 'pump']
const BETS = [100, 200, 250, 500, 1000, 2000, 5000, 10000, 25000]

const rnd = (a, b = 0) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export const useBotsEnabled = () => usePlatformStore((s) => s.bots !== false)

function bot(i) {
  const name = NAMES[i % NAMES.length]
  return { id: `bot-${i}`, username: name, displayName: name, bot: true, avatar: { kind: 'preset', id: PRESETS[i % PRESETS.length] } }
}

/** 8–14 bots online right now (rotates every 10 minutes), each with what it is playing. */
export function botsOnline(now = Date.now()) {
  const slot = Math.floor(now / 600_000)
  const n = 8 + Math.floor(rnd(slot, 1) * 7)
  const out = []
  for (let k = 0; out.length < n && k < 60; k++) {
    const i = Math.floor(rnd(slot, k + 2) * NAMES.length)
    if (out.some((b) => b.id === `bot-${i}`)) continue
    out.push({ ...bot(i), playing: GAMES[Math.floor(rnd(slot + i, 3) * GAMES.length)] })
  }
  return out
}

/** Simulated results for one game over the last minute (a row every ~6 s on average). */
export function botLive(slug, now = Date.now()) {
  const rows = []
  const base = Math.floor(now / 4000)
  const seed = [...slug].reduce((s, c) => s + c.charCodeAt(0), 0)
  for (let s = base; s > base - 15; s--) {
    if (rnd(s, seed) > 0.62) continue
    const b = bot(Math.floor(rnd(s, seed + 1) * NAMES.length))
    const bet = BETS[Math.floor(rnd(s, seed + 2) ** 2 * BETS.length)]
    const win = rnd(s, seed + 3) < 0.44
    const r = rnd(s, seed + 4)
    const multiplier = win ? Math.round((r < 0.85 ? 1.1 + r * 2.5 : 4 + (r - 0.85) * 300) * 100) / 100 : 0
    rows.push({ id: `bot-${slug}-${s}`, game: slug, userId: b.id, username: b.username, bot: true, bet, currency: 'AC', multiplier,
      payout: win ? Math.floor(bet * multiplier) : 0, result: win ? 'win' : 'loss', at: s * 4000 })
  }
  return rows
}
