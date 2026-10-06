/**
 * Aturan progres (di produksi: konfigurasi server).
 * XP → level, daily reward 7 hari, daily/weekly quest, achievement.
 * AG sengaja tidak ada di hadiah rutin — tetap hanya dari Top Up & kode tertentu.
 */

export const xpForNext = (level) => 100 + (level - 1) * 75

export function levelFromXp(xp) {
  let level = 1
  let rest = Math.max(0, Math.floor(xp))
  while (rest >= xpForNext(level)) {
    rest -= xpForNext(level)
    level++
  }
  return { level, into: rest, need: xpForNext(level) }
}

/** XP per ronde: dasar 10 + 1 per 100 AC taruhan (maks 60), +5 kalau menang. */
export const gameXp = ({ bet, win }) => Math.min(60, 10 + Math.floor(bet / 100)) + (win ? 5 : 0)

/** Daily reward — klaim sekali per hari kalender; bolos sehari → mulai lagi dari Day 1. */
export const DAILY_REWARDS = [
  { day: 1, rewards: [{ kind: 'AC', amount: 250 }] },
  { day: 2, rewards: [{ kind: 'AC', amount: 400 }] },
  { day: 3, rewards: [{ kind: 'XP', amount: 150 }] },
  { day: 4, rewards: [{ kind: 'AC', amount: 600 }] },
  { day: 5, rewards: [{ kind: 'item', id: 'gold-frame' }], fallback: { kind: 'AC', amount: 1_000 } },
  { day: 6, rewards: [{ kind: 'AC', amount: 800 }] },
  { day: 7, rewards: [{ kind: 'AC', amount: 1_500 }, { kind: 'XP', amount: 300 }, { kind: 'item', id: 'emote-fire' }], special: true },
]

/** metric: games | wins | wagered | xp | login | dailyQuests | bestMultiplier (nilai tertinggi, bukan jumlah). */
export const DAILY_QUESTS = [
  { id: 'login', metric: 'login', target: 1, reward: { AC: 100, XP: 20 } },
  { id: 'play3', metric: 'games', target: 3, reward: { AC: 300, XP: 60 } },
  { id: 'win1', metric: 'wins', target: 1, reward: { AC: 200, XP: 40 } },
  { id: 'wager1k', metric: 'wagered', target: 1_000, reward: { AC: 250, XP: 50 } },
  { id: 'xp200', metric: 'xp', target: 200, reward: { AC: 300 } },
  { id: 'chat3', metric: 'chat', target: 3, reward: { AC: 150, XP: 20 } },
]

export const WEEKLY_QUESTS = [
  { id: 'play20', metric: 'games', target: 20, reward: { AC: 2_000, XP: 300 } },
  { id: 'xp2500', metric: 'xp', target: 2_500, reward: { AC: 2_500 } },
  { id: 'daily10', metric: 'dailyQuests', target: 10, reward: { AC: 3_000, XP: 400 } },
  { id: 'multi10', metric: 'bestMultiplier', target: 10, reward: { AC: 1_500, XP: 200 } },
  { id: 'levelUp1', metric: 'levelUp', target: 1, reward: { AC: 1_000, XP: 100 } },
  { id: 'profile', metric: 'profile', target: 1, reward: { AC: 500, XP: 50 } },
]

export const MAX_METRICS = new Set(['bestMultiplier', 'profile'])

/** metric achievement: games | wins | streak | bestMultiplier | questsDone | level */
export const ACHIEVEMENTS = [
  { id: 'first-game', metric: 'games', target: 1, xp: 25 },
  { id: 'first-win', metric: 'wins', target: 1, xp: 25 },
  { id: 'games-10', metric: 'games', target: 10, xp: 50 },
  { id: 'games-100', metric: 'games', target: 100, xp: 200 },
  { id: 'streak-7', metric: 'streak', target: 7, xp: 150 },
  { id: 'high-score', metric: 'bestMultiplier', target: 50, xp: 200 },
  { id: 'quest-master', metric: 'questsDone', target: 25, xp: 250 },
  { id: 'veteran', metric: 'level', target: 10, xp: 300 },
  { id: 'first-levelup', metric: 'level', target: 2, xp: 25 },
  { id: 'level-15', metric: 'level', target: 15, xp: 300 },
  { id: 'level-50', metric: 'level', target: 50, xp: 1_000 },
  { id: 'quests-10', metric: 'questsDone', target: 10, xp: 150 },
  { id: 'streak-30', metric: 'streak', target: 30, xp: 500 },
]

/** Milestone level: setiap 15 level → 250.000 AC, setiap 50 level → 1 AG. Dicatat unik per user. */
export const LEVEL_MILESTONES = [
  { type: 'L15', every: 15, reward: { kind: 'AC', amount: 250_000 } },
  { type: 'L50', every: 50, reward: { kind: 'AG', amount: 1 } },
]
export const milestonesBetween = (from, to) => {
  const out = []
  for (let lv = from + 1; lv <= to; lv++) for (const m of LEVEL_MILESTONES) if (lv % m.every === 0) out.push({ ...m, level: lv, key: `${m.type}:${lv}` })
  return out
}
