import { Bird, Bomb, Candy, Crown, Flag, Castle, CircleDot, Coins, Dice5, Grid3x3, Layers, Package, Spade, Swords, Target, Triangle, TrendingUp, Trophy, Wand2, Wind } from 'lucide-react'

/**
 * Registry game — satu-satunya tempat mendaftarkan mode baru.
 *
 * Untuk memasang game cukup isi `load`:
 *   load: () => import('@/games/crash/CrashGame.jsx')
 * Route /games/:slug, halaman Games, Home, dan pencarian otomatis ikut.
 * Teks (tagline) ada di i18n: games.<slug>.tagline
 * Visual kartu ada di components/games/GameArt.jsx (per slug).
 */

export const GAME_CATEGORIES = [
  { id: 'cases', labelKey: 'games.categories.cases' },
  { id: 'originals', labelKey: 'games.categories.originals' },
  { id: 'table', labelKey: 'games.categories.table' },
  { id: 'slots', labelKey: 'games.categories.slots' },
]

/** Kelas Tailwind lengkap per aksen (ditulis utuh supaya terdeteksi JIT). */
export const ACCENTS = {
  cyan: { text: 'text-neon-cyan', tile: 'bg-neon-cyan/10 ring-neon-cyan/25', soft: 'bg-neon-cyan/[0.07]', blob: 'bg-neon-cyan', bar: 'bg-neon-cyan', line: 'via-neon-cyan/70' },
  gold: { text: 'text-neon-gold', tile: 'bg-neon-gold/10 ring-neon-gold/25', soft: 'bg-neon-gold/[0.07]', blob: 'bg-neon-gold', bar: 'bg-neon-gold', line: 'via-neon-gold/70' },
  purple: { text: 'text-neon-purple', tile: 'bg-neon-purple/10 ring-neon-purple/30', soft: 'bg-neon-purple/[0.07]', blob: 'bg-neon-purple', bar: 'bg-neon-purple', line: 'via-neon-purple/70' },
  pink: { text: 'text-neon-pink', tile: 'bg-neon-pink/10 ring-neon-pink/25', soft: 'bg-neon-pink/[0.07]', blob: 'bg-neon-pink', bar: 'bg-neon-pink', line: 'via-neon-pink/70' },
  green: { text: 'text-neon-green', tile: 'bg-neon-green/10 ring-neon-green/25', soft: 'bg-neon-green/[0.07]', blob: 'bg-neon-green', bar: 'bg-neon-green', line: 'via-neon-green/70' },
  red: { text: 'text-neon-red', tile: 'bg-neon-red/10 ring-neon-red/25', soft: 'bg-neon-red/[0.07]', blob: 'bg-neon-red', bar: 'bg-neon-red', line: 'via-neon-red/70' },
}

export const GAMES = [
  { slug: 'case-opening', name: 'Case Opening', category: 'cases', icon: Package, accent: 'gold', featured: true, load: () => import('@/games/CaseOpening.jsx') },
  { slug: 'case-battle', name: 'Case Battle', category: 'cases', icon: Swords, accent: 'purple', load: () => import('@/games/CaseBattle.jsx') },
  { slug: 'crash', name: 'Crash', category: 'originals', icon: TrendingUp, accent: 'red', featured: true, badge: 'hot', load: () => import('@/games/Crash.jsx') },
  { slug: 'plinko', name: 'Plinko', category: 'originals', icon: Triangle, accent: 'pink', featured: true, load: () => import('@/games/Plinko.jsx') },
  { slug: 'mines', name: 'Mines', category: 'originals', icon: Bomb, accent: 'green', load: () => import('@/games/Mines.jsx') },
  { slug: 'keno', name: 'Keno', category: 'originals', icon: Grid3x3, accent: 'purple', load: () => import('@/games/Keno.jsx') },
  { slug: 'tower', name: 'Tower', category: 'originals', icon: Castle, accent: 'cyan', load: () => import('@/games/Ladder.jsx') },
  { slug: 'cross', name: 'Cross the Road', category: 'originals', icon: Bird, accent: 'gold', load: () => import('@/games/Ladder.jsx') },
  { slug: 'pump', name: 'Pump', category: 'originals', icon: Wind, accent: 'pink', load: () => import('@/games/Ladder.jsx') },
  { slug: 'chess', name: 'Chess', category: 'table', icon: Crown, accent: 'cyan', featured: true, load: () => import('@/games/Chess.jsx') },
  { slug: 'horse', name: 'Horse Racing', category: 'originals', icon: Flag, accent: 'green', featured: true, load: () => import('@/games/HorseRacing.jsx') },
  { slug: 'tarot', name: 'Tarot', category: 'originals', icon: Wand2, accent: 'purple', load: () => import('@/games/Tarot.jsx') },
  { slug: 'sweet', name: 'Sweet', category: 'slots', icon: Candy, accent: 'pink', featured: true, load: () => import('@/games/Sweet.jsx') },
  { slug: 'dice', name: 'Dice', category: 'originals', icon: Dice5, accent: 'cyan', load: () => import('@/games/Dice.jsx') },
  { slug: 'limbo', name: 'Limbo', category: 'originals', icon: Target, accent: 'purple', load: () => import('@/games/Limbo.jsx') },
  { slug: 'coinflip', name: 'Coinflip', category: 'originals', icon: Coins, accent: 'gold', load: () => import('@/games/Coinflip.jsx') },
  { slug: 'roulette', name: 'Roulette', category: 'table', icon: CircleDot, accent: 'red', load: () => import('@/games/Roulette.jsx') },
  { slug: 'blackjack', name: 'Blackjack', category: 'table', icon: Spade, accent: 'cyan', featured: true, load: () => import('@/games/Blackjack.jsx') },
  { slug: 'reme', name: 'Reme', category: 'table', icon: Layers, accent: 'green', load: null },
]

/** Jackpot adalah event platform (halaman /jackpot), bukan route /games. */
export const JACKPOT_EVENT = { slug: 'jackpot', name: 'Jackpot', icon: Trophy, accent: 'gold' }

const BY_SLUG = Object.fromEntries([...GAMES, JACKPOT_EVENT].map((g) => [g.slug, g]))
export const getGame = (slug) => (slug === 'jackpot' ? null : BY_SLUG[slug] ?? null)
export const getGameName = (slug) => BY_SLUG[slug]?.name ?? 'Arcade'
export const getAccent = (slug) => ACCENTS[BY_SLUG[slug]?.accent ?? 'cyan']
export const categoryKey = (id) => GAME_CATEGORIES.find((c) => c.id === id)?.labelKey ?? ''
export const isPlayable = (game) => !!game.load
