import { useAuthStore } from '@/store/useAuthStore'
import { useWalletStore } from '@/store/useWalletStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { randomHex } from '@/utils/rng'

/**
 * Isi awal mode lokal: beberapa akun demo (tidak bisa login) supaya Send, Global Chat,
 * dan Biggest Jackpot punya data nyata untuk dipakai. Akun demo diberi label "Demo" di UI.
 * Saat backend aktif, file ini tidak dipakai lagi.
 */

const DAY = 86_400_000
const HOUR = 3_600_000
const MIN = 60_000

export const DEMO_PLAYERS = [
  { id: 'demo-rayhan', username: 'rayhan', displayName: 'Rayhan', preset: 'sunset', ac: 48_200, ag: 6, joined: 210 },
  { id: 'demo-nadia', username: 'nadia_x', displayName: 'Nadia', preset: 'rose', ac: 31_750, ag: 3, joined: 140 },
  { id: 'demo-kevin', username: 'kev_in', displayName: 'Kevin', preset: 'cyan', ac: 12_900, ag: 1, joined: 96 },
  { id: 'demo-sekar', username: 'sekarwangi', displayName: 'Sekar', preset: 'mint', ac: 22_400, ag: 2, joined: 61 },
  { id: 'demo-bima', username: 'bimagg', displayName: 'Bima', preset: 'violet', ac: 8_150, ag: 0, joined: 33 },
  { id: 'demo-ayu', username: 'ayuplays', displayName: 'Ayu', preset: 'steel', ac: 5_600, ag: 1, joined: 12 },
]

export function seedPlatform() {
  const now = Date.now()
  const auth = useAuthStore.getState()
  const wallet = useWalletStore.getState()
  const existing = new Set(Object.values(auth.users).map((u) => u.id))

  for (const p of DEMO_PLAYERS) {
    if (!existing.has(p.id)) {
      auth.upsertDemoUser({
        id: p.id,
        username: p.username,
        displayName: p.displayName,
        email: `${p.username}@demo.arcade`,
        avatar: { kind: 'preset', id: p.preset },
        frame: p.id === 'demo-rayhan' ? 'gold-frame' : null,
        createdAt: now - p.joined * DAY,
        lastLoginAt: now - HOUR,
      })
    }
    wallet.ensureWallet(p.id, { ac: p.ac, ag: p.ag, withGrants: false })
  }

  if (usePlatformStore.getState().seededAt) return

  const jackpots = [
    { userId: 'demo-rayhan', username: 'rayhan', amount: 25_000, game: 'jackpot', at: now - 2 * HOUR },
    { userId: 'demo-nadia', username: 'nadia_x', amount: 18_450, game: 'crash', at: now - 5 * HOUR },
    { userId: 'demo-kevin', username: 'kev_in', amount: 12_000, game: 'plinko', at: now - 26 * HOUR },
    { userId: 'demo-sekar', username: 'sekarwangi', amount: 10_800, game: 'case-opening', at: now - 49 * HOUR },
    { userId: 'demo-bima', username: 'bimagg', amount: 10_250, game: 'limbo', at: now - 74 * HOUR },
  ].map((j) => ({ id: randomHex(6), currency: 'AC', ...j }))

  const say = (userId, text, ago) => ({ id: randomHex(6), type: 'user', userId, text, at: now - ago })
  const chat = [
    { id: randomHex(6), type: 'jackpot', jackpotId: jackpots[0].id, at: jackpots[0].at },
    say('demo-nadia', 'gg rayhan, 25rb 🔥', 118 * MIN),
    say('demo-rayhan', 'makasih, ga nyangka kena', 116 * MIN),
    say('demo-kevin', 'crash tadi nyangkut di 1.02x, sakit', 64 * MIN),
    say('demo-sekar', 'case opening udah ada belum sih?', 41 * MIN),
    say('demo-bima', 'belum, katanya fase berikutnya', 39 * MIN),
    say('demo-ayu', 'anyone got a redeem code? mine just expired lol', 22 * MIN),
    say('demo-nadia', '@ayuplays coba WELCOME500, masih jalan', 20 * MIN),
    say('demo-ayu', 'works, thx!', 19 * MIN),
    say('demo-kevin', 'daily bonus jangan lupa diklaim', 6 * MIN),
  ].sort((a, b) => a.at - b.at)

  usePlatformStore.getState().markSeeded({ jackpots, chat })
}
