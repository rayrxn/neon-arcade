import { getProgress, useProgressStore } from '@/store/useProgressStore'
import { useWalletStore } from '@/store/useWalletStore'
import { getUserById, useAuthStore } from '@/store/useAuthStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { useUiStore } from '@/store/useUiStore'
import {
  ACHIEVEMENTS, DAILY_QUESTS, DAILY_REWARDS, MAX_METRICS, WEEKLY_QUESTS, gameXp, levelFromXp, milestonesBetween,
} from '@/config/progression'
import { ACHIEVEMENT_ITEMS, SEASON_TIERS } from '@/config/cosmetics'
import { ITEMS } from '@/config/economy'
import { AppError } from '@/utils/errors'
import { dayKey } from '@/utils/format'
import { play } from './sound'
import { atomic } from './tx'
import { emit } from './events'
import { flag } from './anticheat'
import { deferUntilReveal } from './reveal'
import { currentSeason, seasonTier } from './seasons'

/**
 * Progres "server-side": XP, level, milestone, quest, daily reward, achievement, season.
 * Semua nilai dihitung di sini dari kejadian yang sudah divalidasi (ronde selesai, klaim).
 * UI tidak pernah mengirim jumlah XP atau hadiah.
 *
 * Setiap hadiah ke wallet memakai idempotency key unik (mis. `milestone:L15:30`,
 * `daily:2026-10-06`, `quest:weekly:2026-10-05:play20`) → tidak mungkin dobel.
 */

const DAY = 86_400_000
const notify = (userId, kind, data, opts) => useNotificationStore.getState().notify(userId, kind, data, opts)
const update = (userId, fn) => useProgressStore.getState().update(userId, fn)

/** Batas XP wajar per sumber dan per menit (deteksi XP mustahil). */
const XP_CAP = { game: 70, quest: 500, daily: 400, achievement: 1_000, admin: Infinity, test: Infinity }
const XP_PER_MINUTE_LIMIT = 4_000

/** Awal minggu (Senin 00:00, waktu lokal). */
export function weekStart(ts = Date.now()) {
  const d = new Date(ts)
  const offset = (d.getDay() + 6) % 7
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset).getTime()
}
export const weekKey = (ts = Date.now()) => dayKey(weekStart(ts))
export const monthKey = (ts = Date.now()) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function rollPeriods(p, now = Date.now()) {
  if (p.quests.daily.period !== dayKey(now)) p.quests.daily = { period: dayKey(now), progress: {}, claimed: [] }
  if (p.quests.weekly.period !== weekKey(now)) p.quests.weekly = { period: weekKey(now), progress: {}, claimed: [] }
  return p
}

function periodBump(p, field, value, now = Date.now()) {
  for (const key of [`w:${weekKey(now)}`, `m:${monthKey(now)}`]) {
    const row = (p.periodStats[key] ??= { xp: 0, games: 0, wins: 0 })
    row[field] = (row[field] ?? 0) + value
  }
  // Simpan 12 periode terakhir saja.
  const keys = Object.keys(p.periodStats).sort().reverse()
  for (const k of keys.slice(24)) delete p.periodStats[k]
}

/** Tambah metrik ke quest harian & mingguan. */
function bump(p, metric, value, out) {
  for (const [scope, defs] of [['daily', DAILY_QUESTS], ['weekly', WEEKLY_QUESTS]]) {
    const bucket = p.quests[scope]
    for (const q of defs) {
      if (q.metric !== metric) continue
      const before = bucket.progress[q.id] ?? 0
      const after = MAX_METRICS.has(metric) ? Math.max(before, value) : before + value
      bucket.progress[q.id] = after
      if (before < q.target && after >= q.target) out.quests.push({ scope, id: q.id })
    }
  }
}

const levelOf = (p) => levelFromXp(p.xp).level

function metricValue(p, metric) {
  if (metric === 'streak') return p.daily.streak
  if (metric === 'questsDone') return p.quests.completed
  if (metric === 'level') return levelOf(p)
  return p.stats[metric] ?? 0
}

export const achievementProgress = (p, a) => Math.min(a.target, metricValue(p, a.metric))

/**
 * Satu-satunya jalan XP masuk. Mencatat level history, season XP, period stats,
 * milestone yang dicapai (diproses setelah commit), dan memeriksa XP mustahil.
 */
function applyXp(p, amount, out, source, userId) {
  if (!(amount > 0)) return
  const now = Date.now()
  const before = levelOf(p)
  if (amount > (XP_CAP[source] ?? 100)) out.suspicious.push({ type: 'impossibleXp', expected: `≤ ${XP_CAP[source] ?? 100} XP (${source})`, submitted: `${amount} XP` })
  p.recentXp = [...(p.recentXp ?? []).filter((r) => now - r.at < 60_000), { at: now, xp: amount }]
  const perMinute = p.recentXp.reduce((s, r) => s + r.xp, 0)
  if (perMinute > XP_PER_MINUTE_LIMIT && source !== 'admin' && source !== 'test') out.suspicious.push({ type: 'impossibleXp', expected: `≤ ${XP_PER_MINUTE_LIMIT} XP/menit`, submitted: `${perMinute} XP/menit` })

  p.xp += amount
  out.xp += amount
  bump(p, 'xp', amount, out)
  periodBump(p, 'xp', amount, now)

  // Season XP + hadiah tier.
  const season = currentSeason(now)
  if (p.season?.id !== season.id) p.season = { id: season.id, xp: 0, tiersClaimed: [] }
  const tierBefore = seasonTier(p.season.xp)
  p.season.xp += amount
  const tierAfter = seasonTier(p.season.xp)
  for (const t of SEASON_TIERS) if (t.tier > tierBefore && t.tier <= tierAfter && !p.season.tiersClaimed.includes(t.tier)) {
    p.season.tiersClaimed.push(t.tier)
    out.items.push({ id: t.item, source: 'season' })
  }

  const after = levelOf(p)
  if (after > before) {
    if (after - before > 5 && source !== 'admin' && source !== 'test') out.suspicious.push({ type: 'impossibleLevel', expected: '≤ 5 level per kejadian', submitted: `+${after - before} level` })
    for (let lv = before + 1; lv <= after; lv++) p.levelHistory = [{ level: lv, at: now, xp: p.xp }, ...p.levelHistory].slice(0, 200)
    out.levelUp = { from: out.levelUp?.from ?? before, to: after }
    bump(p, 'levelUp', after - before, out)
    for (const m of milestonesBetween(before, after)) if (!p.milestones[m.key]) out.milestones.push(m)
  }
}

function unlockAchievements(p, out) {
  for (let pass = 0; pass < 4; pass++) {
    let changed = false
    for (const a of ACHIEVEMENTS) {
      if (p.achievements[a.id] || metricValue(p, a.metric) < a.target) continue
      p.achievements[a.id] = Date.now()
      out.achievements.push(a.id)
      for (const item of ACHIEVEMENT_ITEMS[a.id] ?? []) out.items.push({ id: item, source: 'achievement' })
      applyXp(p, a.xp, out, 'achievement')
      changed = true
    }
    if (!changed) break
  }
}

const newOut = () => ({ xp: 0, quests: [], achievements: [], levelUp: null, milestones: [], items: [], suspicious: [], rewards: [] })

function postReward(userId, currency, amount, source, reference, idempotencyKey) {
  if (!(amount > 0)) return null
  const tx = useWalletStore.getState().post(userId, { type: 'reward', currency, amount, source, reference, idempotencyKey })
  emit('REWARD_GRANTED', { userId, currency, amount, source, txId: tx?.id })
  return tx
}

export function grantItem(userId, itemId) {
  if (!ITEMS[itemId]) return false
  let added = false
  useWalletStore.getState().patchWallet(userId, (w) => {
    added = !(w.inventory ?? []).includes(itemId)
    return { inventory: [...new Set([...(w.inventory ?? []), itemId])] }
  })
  return added
}

/**
 * Setelah state progres tersimpan: bayar milestone (unik), beri item, kirim notifikasi,
 * catat event, tampilkan overlay level up (ditahan sampai animasi game selesai).
 */
function commitOut(userId, out, isTest = false) {
  if (isTest) return
  for (const m of out.milestones) {
    const key = `milestone:${m.key}`
    const tx = postReward(userId, m.reward.kind, m.reward.amount, 'level', `level ${m.level}`, key)
    update(userId, (p) => {
      p.milestones[m.key] ??= { type: m.type, level: m.level, rewardTxId: tx?.id ?? null, reward: m.reward, claimedAt: Date.now() }
      return p
    })
    out.rewards.push({ kind: m.reward.kind, amount: m.reward.amount, level: m.level })
    emit('MILESTONE_REWARD', { userId, milestone: m.key, currency: m.reward.kind, amount: m.reward.amount, txId: tx?.id })
  }
  for (const item of out.items) if (grantItem(userId, item.id)) out.rewards.push({ kind: 'item', id: item.id })

  for (const s of out.suspicious) flag(userId, s.type, 'high', { expected: s.expected, submitted: s.submitted })
  if (out.xp > 0) emit('XP_GAINED', { userId, xp: out.xp })
  for (const q of out.quests) {
    notify(userId, 'quest', { scope: q.scope, quest: q.id })
    emit('QUEST_COMPLETED', { userId, quest: q.id, scope: q.scope })
  }
  for (const id of out.achievements) {
    notify(userId, 'achievement', { achievement: id })
    emit('ACHIEVEMENT_UNLOCKED', { userId, achievement: id })
  }
  if (out.levelUp) {
    notify(userId, 'levelUp', { level: out.levelUp.to, from: out.levelUp.from, rewards: out.rewards.filter((r) => r.level) })
    emit('LEVEL_UP', { userId, from: out.levelUp.from, to: out.levelUp.to })
  }
  const levelUp = out.levelUp
  const snapshot = { ...out }
  deferUntilReveal(() => {
    if (levelUp) {
      play('levelup')
      useUiStore.getState().showLevelUp({ from: levelUp.from, to: levelUp.to, xp: snapshot.xp, rewards: snapshot.rewards })
    } else if (snapshot.achievements.length) play('achievement')
    else if (snapshot.quests.length) play('quest')
  })
}

// ───────────────────────────── Game ─────────────────────────────

/**
 * Catat ronde selesai (game_sessions) + statistik, XP, quest, achievement.
 * Dipanggil engine di dalam transaksi atomik, hanya untuk sesi yang sudah divalidasi.
 * Sesi test (isTest) dan sesi INVALID tidak menyentuh statistik, quest, maupun XP.
 */
export function recordGame(userId, session) {
  const out = newOut()
  let best = 0
  const counts = !session.isTest && session.status !== 'INVALID'
  const xp = counts ? gameXp({ bet: session.bet, win: session.result === 'win' }) : 0
  session.xp = xp
  const p = update(userId, (p) => {
    rollPeriods(p)
    p.sessions = [session, ...p.sessions].slice(0, 100)
    if (!counts) return p
    const s = p.stats
    const win = session.result === 'win'
    s.games++
    s.wagered += session.bet
    s.won += session.payout
    if (win) s.wins++
    else if (session.result === 'push') s.pushes++
    else s.losses++
    s.biggestWin = Math.max(s.biggestWin, session.payout)
    s.bestMultiplier = Math.max(s.bestMultiplier, win ? session.multiplier : 0)
    const g = (s.perGame[session.game] ??= { played: 0, wins: 0, best: 0, bestPayout: 0, lastAt: 0 })
    g.played++
    g.lastAt = session.at
    if (win) g.wins++
    g.best = Math.max(g.best, win ? session.multiplier : 0)
    g.bestPayout = Math.max(g.bestPayout, session.payout)
    best = g.best
    periodBump(p, 'games', 1)
    if (win) periodBump(p, 'wins', 1)

    bump(p, 'games', 1, out)
    if (win) bump(p, 'wins', 1, out)
    bump(p, 'wagered', session.bet, out)
    if (win) bump(p, 'bestMultiplier', session.multiplier, out)
    applyXp(p, xp, out, 'game')
    unlockAchievements(p, out)
    return p
  })
  commitOut(userId, out, !counts)
  return { ...out, best, level: levelFromXp(p.xp), questsState: p.quests }
}

/** Metrik non-game (chat, profil) → quest. */
export function trackMetric(userId, metric, value = 1) {
  return atomic('progress.metric', () => {
    const out = newOut()
    update(userId, (p) => {
      rollPeriods(p)
      bump(p, metric, value, out)
      return p
    })
    commitOut(userId, out)
    return out
  })
}

// ───────────────────────────── Login & daily ─────────────────────────────

export function markLogin(userId) {
  const out = newOut()
  update(userId, (p) => {
    rollPeriods(p)
    const today = dayKey(Date.now())
    if (!p.loginDays.includes(today)) p.loginDays = [today, ...p.loginDays].slice(0, 60)
    if (!(p.quests.daily.progress.login >= 1)) bump(p, 'login', 1, out)
    // Integritas: level dari XP tidak boleh melompati level history yang tercatat.
    const recorded = p.levelHistory[0]?.level ?? 1
    const actual = levelFromXp(p.xp).level
    if (actual > recorded + 1 && p.levelHistory.length > 0) out.suspicious.push({ type: 'impossibleLevel', expected: `level ${recorded}`, submitted: `level ${actual} tanpa riwayat` })
    return p
  })
  commitOut(userId, out)
}

export function dailyState(p, now = Date.now()) {
  const today = dayKey(now)
  const yesterday = dayKey(now - DAY)
  const claimedToday = p.daily.lastClaimDay === today
  const continues = p.daily.lastClaimDay === yesterday || claimedToday
  const streak = continues ? p.daily.streak : 0
  const tomorrow = new Date(now)
  tomorrow.setHours(24, 0, 0, 0)
  return {
    claimedToday,
    streak,
    missed: !continues && p.daily.streak > 0,
    nextDay: (streak % 7) + 1,
    cycleClaimed: claimedToday ? ((streak - 1) % 7) + 1 : streak % 7,
    resetsAt: tomorrow.getTime(),
    lastClaimAt: p.daily.lastClaimAt ?? null,
  }
}

export async function claimDailyReward(userId) {
  await new Promise((r) => setTimeout(r, 300))
  return atomic('daily.claim', () => {
    const p0 = getProgress(userId)
    const state = dailyState(p0)
    if (state.claimedToday) throw new AppError('rewards.errors.claimedToday')
    const today = dayKey(Date.now())
    const def = DAILY_REWARDS[state.nextDay - 1]
    const wallet = useWalletStore.getState().wallets[userId]
    const out = newOut()
    const granted = []
    for (const r of def.rewards) {
      if (r.kind === 'item') {
        if (wallet?.inventory?.includes(r.id) && def.fallback) {
          postReward(userId, def.fallback.kind, def.fallback.amount, 'daily', `day-${def.day}`, `daily:${today}:fallback`)
          granted.push(def.fallback)
        } else if (grantItem(userId, r.id)) granted.push(r)
      } else if (r.kind !== 'XP') {
        postReward(userId, r.kind, r.amount, 'daily', `day-${def.day}`, `daily:${today}:${r.kind}`)
        granted.push(r)
      } else granted.push(r)
    }
    update(userId, (p) => {
      rollPeriods(p)
      p.daily = { streak: state.streak + 1, lastClaimDay: today, lastClaimAt: Date.now(), claims: p.daily.claims + 1 }
      applyXp(p, def.rewards.filter((r) => r.kind === 'XP').reduce((s, r) => s + r.amount, 0), out, 'daily')
      unlockAchievements(p, out)
      return p
    })
    notify(userId, 'daily', { day: def.day, rewards: granted })
    emit('DAILY_CLAIMED', { userId, day: def.day, streak: state.streak + 1 })
    play('daily')
    commitOut(userId, out)
    return { day: def.day, rewards: granted, ...out }
  })
}

// ───────────────────────────── Quest ─────────────────────────────

export async function claimQuest(userId, scope, questId) {
  await new Promise((r) => setTimeout(r, 250))
  return atomic('quest.claim', () => {
    const def = (scope === 'daily' ? DAILY_QUESTS : WEEKLY_QUESTS).find((q) => q.id === questId)
    if (!def) throw new AppError('errors.notFound')
    const p0 = rollPeriods(structuredClone(getProgress(userId)))
    const bucket = p0.quests[scope]
    if (bucket.claimed.includes(questId)) throw new AppError('rewards.errors.claimed')
    if ((bucket.progress[questId] ?? 0) < def.target) throw new AppError('rewards.errors.notDone')

    const out = newOut()
    update(userId, (p) => {
      rollPeriods(p)
      p.quests[scope].claimed.push(questId)
      p.quests.completed++
      if (scope === 'daily') bump(p, 'dailyQuests', 1, out)
      applyXp(p, def.reward.XP ?? 0, out, 'quest')
      unlockAchievements(p, out)
      return p
    })
    postReward(userId, 'AC', def.reward.AC ?? 0, 'quest', `${scope}:${questId}`, `quest:${scope}:${bucket.period}:${questId}`)
    play('reward')
    commitOut(userId, out)
    return { reward: def.reward, ...out }
  })
}

/** Tampilan quest (progres mengikuti periode saat ini) + waktu kedaluwarsa. */
export function questView(p, scope, now = Date.now()) {
  const current = rollPeriods(structuredClone({ ...p, quests: p.quests ?? { daily: {}, weekly: {}, completed: 0 } }), now).quests[scope]
  const tomorrow = new Date(now)
  tomorrow.setHours(24, 0, 0, 0)
  const weekEnd = new Date(weekStart(now) + 7 * DAY + 3 * 3_600_000).setHours(0, 0, 0, 0) // aman terhadap DST
  const expiresAt = scope === 'daily' ? tomorrow.getTime() : weekEnd
  return (scope === 'daily' ? DAILY_QUESTS : WEEKLY_QUESTS).map((q) => {
    const progress = Math.min(q.target, current.progress[q.id] ?? 0)
    return { ...q, scope, progress, done: progress >= q.target, claimed: current.claimed.includes(q.id), expiresAt }
  })
}

/** Grant XP oleh admin / test mode (tercatat sebagai sumber khusus). */
export function grantXp(userId, amount, source = 'admin') {
  return atomic('xp.grant', () => {
    const out = newOut()
    update(userId, (p) => {
      rollPeriods(p)
      applyXp(p, amount, out, source)
      unlockAchievements(p, out)
      return p
    })
    commitOut(userId, out, source === 'test')
    return out
  })
}

export const levelInfo = (p) => levelFromXp(p.xp)
export const findUserName = (id) => getUserById(id)?.username ?? '—'
export const allUsers = () => Object.values(useAuthStore.getState().users)
