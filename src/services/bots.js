/**
 * House players: simulated players that keep the lobby lively (gamertags, drawn avatars, cosmetics, chat in several
 * languages). Their mini profile says they are house players.
 * Deterministic from the clock, so every visitor sees the same bots at the same time. Turned on/off by admins
 * (platform.bots). They never touch wallets, leaderboards or real game data.
 */
import { usePlatformStore } from '@/store/usePlatformStore'

const NAMES = ['Zephyrr', 'NightOwl_77', 'KairoX', 'lunaticxd', 'Vortexia', 'ShadowByte', 'mochiii', 'Rekt_Ronin', 'PixelDrift', 'xVenomz',
  'Sakura_Blitz', 'GhostPepper', 'NovaStrike', 'kuroneko', 'TurboTaco', 'Frostbyte', 'ilyzzz', 'HexHunter', 'Dr4gonFly', 'CaptainCrit',
  'yuki.exe', 'BlazeRunner', 'LowkeyLucky', 'Ravenclawz', 'neonbunny', 'Sn1perWolf', 'Glitchy', 'MangoMadness', 'Orbitz', 'Starlight_Ash',
  'CoffeeAndCrash', 'Kitsu_', 'RiskyBizz', 'Aether', 'p1nkfloyd', 'LilJackpot', 'MidnightMarauder', 'Echo_9', 'Tofu_King', 'SilentStorm']
const PRESETS = ['cyan', 'violet', 'sunset', 'mint', 'rose', 'gold']
const GAMES = ['crash', 'plinko', 'mines', 'dice', 'roulette', 'blackjack', 'sweet', 'cross', 'tower', 'keno', 'coinflip', 'limbo', 'snake', 'slice', 'tarot', 'pump']
const BETS = [100, 200, 250, 500, 1000, 2000, 5000, 10000, 25000]
const MEMBERS = [null, null, null, 'vip', 'vip', 'vvip']
const CARDS = ['none', 'silver', 'silver', 'gold', 'gold', 'platinum', 'infinite', 'black', 'monarch']
const FRAMES = [null, null, 'frame-holo', 'frame-ice', 'frame-magma', 'frame-plasma', 'frame-void', 'frame-gold-card', 'frame-monarch']
const NAME_FX = [null, null, null, 'name-aurora', 'name-gold', 'name-neon', 'name-ocean', 'name-sunset', 'name-prism', 'name-volt', 'name-glitch', 'name-inferno']
const BADGES = [null, null, 'badge-bolt', 'badge-clover', 'badge-crown', 'badge-diamond', 'badge-skull', 'badge-high-roller']
const THEMES = [null, 'theme-crimson', 'theme-cyber', 'theme-emerald', 'theme-midnight', 'theme-rose']

const rnd = (a, b = 0) => {
  const x = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453
  return x - Math.floor(x)
}
const pick = (arr, i, salt) => arr[Math.floor(rnd(i, salt) * arr.length)]

// Drawn profile pictures (no real photos): a character on a gradient, generated per player.
const HUES = [[190, 260], [280, 330], [20, 350], [140, 190], [40, 10], [220, 280], [330, 260], [160, 220]]
function pfp(i) {
  const [h1, h2] = HUES[i % HUES.length]
  const kind = Math.floor(rnd(i, 21) * 6)
  const eye = `hsl(${h1} 100% 85%)`
  const body = {
    0: `<path d="M18 44 L18 26 L24 30 L32 22 L40 30 L46 26 L46 44 Z" fill="#0b1020"/><circle cx="26" cy="36" r="3" fill="${eye}"/><circle cx="38" cy="36" r="3" fill="${eye}"/>`, // cat
    1: `<rect x="17" y="22" width="30" height="24" rx="6" fill="#0b1020"/><rect x="22" y="30" width="20" height="7" rx="3.5" fill="${eye}"/><line x1="32" y1="22" x2="32" y2="15" stroke="#0b1020" stroke-width="2.5"/><circle cx="32" cy="14" r="2.6" fill="${eye}"/>`, // robot
    2: `<path d="M18 48 L18 32 A14 14 0 0 1 46 32 L46 48 L41 44 L36 48 L32 44 L28 48 L23 44 Z" fill="#0b1020"/><ellipse cx="26.5" cy="33" rx="2.6" ry="3.6" fill="${eye}"/><ellipse cx="37.5" cy="33" rx="2.6" ry="3.6" fill="${eye}"/>`, // ghost
    3: `<ellipse cx="32" cy="34" rx="13" ry="15" fill="#0b1020"/><ellipse cx="26" cy="33" rx="4" ry="2.4" transform="rotate(25 26 33)" fill="${eye}"/><ellipse cx="38" cy="33" rx="4" ry="2.4" transform="rotate(-25 38 33)" fill="${eye}"/>`, // alien
    4: `<path d="M14 30 Q32 18 50 30 L50 36 Q32 44 14 36 Z" fill="#0b1020"/><path d="M20 31 L28 31 L28 35 L20 34 Z M36 31 L44 31 L44 34 L36 35 Z" fill="${eye}"/><path d="M22 44 Q32 50 42 44" stroke="#0b1020" stroke-width="3" fill="none"/>`, // visor
    5: `<path d="M16 46 L22 22 L32 32 L42 22 L48 46 Z" fill="#0b1020"/><path d="M24 38 L29 36 M40 38 L35 36" stroke="${eye}" stroke-width="3" stroke-linecap="round"/>`, // fox
  }[kind]
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h1} 90% 58%)"/><stop offset="1" stop-color="hsl(${h2} 85% 45%)"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="50" cy="12" r="10" fill="#fff" opacity=".12"/>${body}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export const useBotsEnabled = () => usePlatformStore((s) => s.bots !== false)

const cache = new Map()
function bot(i) {
  if (cache.has(i)) return cache.get(i)
  const name = NAMES[i % NAMES.length]
  const card = pick(CARDS, i, 31)
  const membership = card === 'monarch' || card === 'black' ? pick(['vip', 'vvip', 'vvip'], i, 32) : pick(MEMBERS, i, 33)
  const u = {
    id: `bot-${i}`, username: name, displayName: name, bot: true,
    avatar: rnd(i, 30) < 0.85 ? { kind: 'image', src: pfp(i) } : { kind: 'preset', id: PRESETS[i % PRESETS.length] },
    membership, loyaltyCard: card, level: 5 + Math.floor(rnd(i, 34) ** 1.6 * 80),
    style: { frame: pick(FRAMES, i, 35), nameEffect: membership ? pick(NAME_FX, i, 36) : null, badge: pick(BADGES, i, 37), theme: pick(THEMES, i, 38) },
    createdAt: Date.UTC(2026, 9, 2) + Math.floor(rnd(i, 39) * 8) * 86_400_000,
  }
  cache.set(i, u)
  return u
}
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

const LINES = [
  // English (most of the chat)
  'gl everyone', 'crash just went 14x and i cashed at 1.5 lol', 'plinko is cooking rn', 'mines 3 bombs, cleared 6 tiles, im out', 'gm', 'gn guys',
  'finally hit gold card', 'dailies done', 'snake is brutal today', 'hit the 4% grape on slice no way', 'tower floor 7 and boom', 'any tips for getting AG faster?',
  'blackjack 21 three times in a row', 'red 6 times in a row on roulette', 'feeling lucky tonight', 'down a bit, its fine', 'anyone up for case battle?',
  'pump popped at 1.9x again', 'just doing 50% dice, safe and boring', 'limbo 100x once in my life', 'gg', 'lmao', 'nice', 'lets goooo', 'trailer was clean ngl',
  'out of beta finally', 'keno 6 of 8', 'saving up for vip', 'new frames in the shop look sick', 'sweet bonus paid 40x', 'horse 3 keeps winning', 'claimed daily?', 'brb food',
  'who else grinding the battle pass', 'monarch card looks so good', 'crash at 1.01 hurts every time', 'coinflip streak 5', 'tarot gave me the tower card lmao',
  // Indonesian
  'gas lagi ah', 'malem semua', 'hoki banget hari ini', 'wkwkwk', 'mantap', 'rugi dikit gpp', 'quest harian udah beres', 'udah klaim daily belum?',
  // Japanese
  'こんばんは〜', 'クラッシュ難しい…', 'おつかれ！', 'やった！勝った', 'プリンコ楽しい',
  // Chinese
  '大家好', '今天运气不错', '加油！', '又输了哈哈', '这个游戏好玩',
]

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
