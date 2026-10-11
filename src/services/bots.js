/**
 * House bots: simulated players that keep the lobby lively. Always tagged "BOT" in the UI.
 * Deterministic from the clock, so every visitor sees the same bots at the same time. Turned on/off by admins
 * (platform.bots). They never touch wallets, leaderboards or real game data.
 */
import { usePlatformStore } from '@/store/usePlatformStore'

const NAMES = ['rizky_pratama', 'ayu.lestari', 'dimas_ardi', 'nadia.putri', 'bagus_s', 'sarah.wln', 'fajar.nugraha', 'intan_ps', 'rendy.kurnia', 'citra_dewi',
  'andre.gun', 'salsabila_r', 'yoga.pranata', 'nabila_az', 'kevin.hs', 'dinda.mrt', 'arif_rahman', 'putri.ayuu', 'gilang.ramadhan', 'tasya_ml',
  'reza.fahlevi', 'mega_sari', 'ilham.akbar', 'vania.kr', 'bayu_wicak', 'anisa.fitri', 'hendra_sp', 'laras.ati', 'farhan_m', 'sinta.rhm',
  'aldi.saputra', 'winda_ys', 'teguh.prasetyo', 'amelia.zs', 'rafi_hdyt', 'nurul.aini', 'yudha_p', 'clara.wjy', 'eko_setiawan', 'mira.lsr']
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

const LINES = ['gas lagi ah', 'crash tadi nyampe 12x anjir telat cashout', 'ada yang main plinko? lagi gacor nih', 'mines 3 bom aman sampe 6 tile wkwk',
  'pagi semua', 'malem guys', 'akhirnya naik gold card', 'quest harian udah beres semua', 'snake lagi jahat banget dari tadi', 'slice anggur 4% kena dong',
  'tower lantai 7 jatoh, sakit', 'ada yg tau cara dapet AG cepet?', 'tuker AC ke AG dulu ah', 'blackjack dapet 21 tiga kali berturut2', 'roulette merah terus dari tadi',
  'hoki banget hari ini', 'rugi dikit gpp', 'case battle siapa ikut?', 'pump tadi meledak di 1.9x', 'dice 50% aja aman', 'limbo 100x kena sekali seumur hidup',
  'gg', 'wkwkwk', 'mantap', 'semangat semua', 'coinflip 5x beruntun menang', 'trailer 1.0 keren juga', 'akhirnya keluar beta', 'keno 8 angka kena 6',
  'lagi ngumpulin buat VIP', 'frame baru di shop bagus', 'sweet free spin dapet 40x', 'horse race kuda no 3 juara terus', 'udah klaim daily belum?', 'brb makan']

/** Global chat lines from the house bots: one every ~40 s on average, deterministic so every viewer sees the same chat. */
export function botChat(now = Date.now(), count = 30) {
  const step = 20_000
  const out = []
  for (let s = Math.floor(now / step); out.length < count && s > Math.floor(now / step) - 400; s--) {
    if (rnd(s, 7) > 0.5) continue
    const i = Math.floor(rnd(s, 8) * NAMES.length)
    out.push({ id: `botmsg-${s}`, type: 'user', room: 'global', userId: `bot-${i}`, text: LINES[Math.floor(rnd(s, 9) * LINES.length)], at: s * step + Math.floor(rnd(s, 10) * step), bot: true })
  }
  return out.filter((m) => m.at <= now).reverse()
}
export const botUser = (id) => bot(Number(String(id).slice(4)))
