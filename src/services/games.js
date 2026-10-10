import { useWalletStore } from '@/store/useWalletStore'
import { useFairnessStore } from '@/store/useFairnessStore'
import { accountBlock, getCurrentUser } from '@/store/useAuthStore'
import { useAdminStore } from '@/store/useAdminStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { getProgress, useProgressStore } from '@/store/useProgressStore'
import { AppError } from '@/utils/errors'
import { round2 } from '@/utils/format'
import {
  HOUSE_EDGE, coinflipSide, crashPoint, createDeck, diceMultiplier, diceRoll, limboResult,
  minePositions, pickWeighted, plinkoPath, randomHex, rouletteNumber, shuffleWithFloats,
} from '@/utils/rng'
import { recordWin } from './jackpot'
import { recordGame } from './progression'
import { flag } from './anticheat'
import { atomic } from './tx'
import { emit } from './events'
import { holdReveal } from './reveal'
import { maintenanceActive } from './system'
import { isStaff } from '@/config/roles'
import { play } from './sound'
import { SERVER_MODE } from '@/config/runtime'
import { usePrefsStore } from '@/store/usePrefsStore'
import { act, api, applyOut, serverOpenRound, toLocalTime } from './server'

/**
 * Game engine — "server" mode lokal.
 *
 * Aturan utama (sama seperti nanti di backend):
 *  - Hasil dihitung DI SINI dari RNG provably fair. UI hanya mengirim pilihan (taruhan,
 *    target, petak, aksi) dan menganimasikan hasil. Payout tidak pernah diterima dari UI.
 *  - Saldo dipotong saat ronde dimulai, dikredit saat ronde selesai.
 *  - Ronde multi-langkah (Crash, Mines, Blackjack) disimpan di progress.open sehingga
 *    tetap jalan setelah refresh dan tidak bisa "diulang".
 *  - Permintaan aneh (aksi di ronde yang sudah selesai, spam, parameter rusak) dicatat
 *    sebagai cheat flag untuk Admin → Anti-Cheat.
 */

export const LIMITS = { minBet: 1, maxBet: 100_000 }
const RATE_WINDOW = 1_000
const RATE_MAX = 8
const recentStarts = []

// ───────────────────────────── Infrastruktur ─────────────────────────────

/** Deteksi pola setelah sesi tersimpan. */
function detect(round, session) {
  const { userId } = round
  if (session.payout >= 250_000 || session.multiplier >= 1_000)
    flag(userId, 'abnormalReward', session.payout >= 1_000_000 ? 'critical' : 'high', { game: round.game, sessionId: session.id, expected: `≤ ${PLINKO_TABLES.high[0]}×`, submitted: `${session.multiplier}× · ${session.payout} AC`, reward: session.payout })
  if (round.game === 'mines' && (session.detail?.picks ?? 0) >= 5 && session.durationMs < 400)
    flag(userId, 'impossibleDuration', 'medium', { game: round.game, sessionId: session.id, expected: '≥ 400 ms', submitted: `${session.durationMs} ms`, reward: session.payout })
  const recent = getProgress(userId).sessions.filter((s) => !s.isTest).slice(0, 20)
  if (recent.length >= 20 && recent.filter((s) => s.result === 'win').length >= 18)
    flag(userId, 'suspiciousPattern', 'medium', { game: round.game, sessionId: session.id, expected: '≈ 50% win', submitted: `${recent.filter((s) => s.result === 'win').length}/20 win`, reward: session.payout })
  const net = getProgress(userId).sessions.slice(0, 50).reduce((sum, s) => sum + (s.payout - s.bet), 0)
  if (net >= 500_000) flag(userId, 'abnormalCurrency', 'high', { game: round.game, sessionId: session.id, expected: '< 500.000 AC / 50 ronde', submitted: `+${Math.round(net)} AC`, reward: net })
}

/**
 * Akun test dengan Force Win/Loss: acak ulang (Math.random, bukan provably fair) sampai
 * hasilnya sesuai, supaya animasi tetap konsisten. Akun biasa tidak pernah lewat sini.
 */
function forced(round, count, isWin) {
  if (!round.isTest || round.control === 'off') return round.floats
  const want = round.control === 'win'
  for (let i = 0; i < 500; i++) {
    const floats = Array.from({ length: count }, Math.random)
    if (isWin(floats) === want) return floats
  }
  return round.floats
}

function me() {
  const user = getCurrentUser()
  if (!user) throw new AppError('errors.sessionExpired')
  return user
}

function checkBet(userId, bet) {
  if (!Number.isFinite(bet) || !Number.isInteger(bet)) throw new AppError('play.errors.wholeBet')
  if (bet < LIMITS.minBet) throw new AppError('play.errors.minBet', { min: LIMITS.minBet })
  if (bet > LIMITS.maxBet) throw new AppError('play.errors.maxBet', { max: LIMITS.maxBet.toLocaleString() })
  const now = Date.now()
  while (recentStarts.length && now - recentStarts[0] > RATE_WINDOW) recentStarts.shift()
  if (recentStarts.length >= RATE_MAX) {
    flag(userId, 'rapidRequests', 'medium', { expected: `≤ ${RATE_MAX} ronde/detik`, submitted: `${recentStarts.length + 1} ronde/detik` })
    throw new AppError('play.errors.tooFast')
  }
  recentStarts.push(now)
}

function saveOpen(round) {
  useProgressStore.getState().update(round.userId, (p) => ({ ...p, open: { ...p.open, [round.game]: round } }))
}
function clearOpen(round) {
  useProgressStore.getState().update(round.userId, (p) => {
    const open = { ...p.open }
    delete open[round.game]
    return { ...p, open }
  })
}
const loadOpen = (userId, game, id) => {
  const round = getProgress(userId).open[game]
  return round && (!id || round.id === id) ? round : null
}

/** Potong taruhan + ambil angka acak. Akun test: tidak memotong saldo (hasil simulasi). */
function begin(game, bet, floatCount, extra = {}) {
  const user = me()
  const block = accountBlock(user)
  if (block) throw new AppError(block.code, block.vars)
  if (user.walletFrozen) throw new AppError('errors.walletFrozen')
  if (maintenanceActive() && !isStaff(user.role)) throw new AppError('errors.maintenance')
  const cfg = useAdminStore.getState().gameConfig[game]
  if (cfg?.status && cfg.status !== 'live') throw new AppError('play.errors.gameOff')
  checkBet(user.id, bet)
  if (cfg?.maxBet && bet > cfg.maxBet) throw new AppError('play.errors.maxBet', { max: cfg.maxBet.toLocaleString() })
  if (getProgress(user.id).open[game]) throw new AppError('play.errors.roundOpen')
  const id = randomHex(8)
  return atomic('game.begin', () => {
    let betTxId = null
    if (!user.isTest) {
      const res = useWalletStore.getState().placeBet(bet, game, { sessionId: id, idempotencyKey: `game:${id}:bet` })
      if (!res.ok) throw new AppError(res.error)
      betTxId = res.txId
    }
    const { floats, proof } = useFairnessStore.getState().roll(floatCount)
    emit('GAME_STARTED', { userId: user.id, game, sessionId: id, bet, isTest: !!user.isTest })
    play('start')
    return { id, userId: user.id, game, bet, floats, proof, betTxId, startedAt: Date.now(), isTest: !!user.isTest, control: user.isTest ? user.testControl ?? 'off' : 'off', ...extra }
  })
}

/**
 * Batas hasil yang mungkin per game (validasi spesifik game). Hasil di luar batas ini
 * tidak mungkin terjadi lewat aturan game → sesi ditandai INVALID, tidak dibayar, dan flag kritis.
 */
const MAX_MULTIPLIER = {
  dice: 49.5, limbo: 1_000_000, coinflip: 1.98, plinko: 1000, roulette: 36, 'case-opening': 20,
  'case-battle': 40, crash: 1_000_000_000, mines: 6_000_000, blackjack: 2.5,
}
const STATUS_OF = { win: 'WON', loss: 'LOST', push: 'DRAW' }

/**
 * Kredit payout, catat sesi & progres.
 * `multiplier` = kelipatan yang benar-benar dibayar (0 saat kalah, <1 untuk payout parsial
 * seperti Plinko 0,2× atau item case yang lebih murah dari harganya).
 */
const classify = (multiplier) => (multiplier > 1 ? 'win' : multiplier === 1 ? 'push' : 'loss')
function finish(round, { multiplier, result, detail, status }) {
  // Idempotent: sesi yang sudah diselesaikan tidak pernah diproses dua kali.
  const settled = getProgress(round.userId).sessions.find((x) => x.id === round.id)
  if (settled) {
    flag(round.userId, 'duplicateSubmission', 'low', { game: round.game, sessionId: round.id, expected: 'satu penyelesaian per sesi', submitted: 'penyelesaian ulang' })
    return { session: settled, summary: null, duplicate: true }
  }
  return atomic('game.finish', () => {
    const payout = result === 'push' ? round.bet : round2(round.bet * multiplier)
    const valid = Number.isFinite(multiplier) && multiplier >= 0 && ['win', 'loss', 'push'].includes(result) &&
      multiplier <= (MAX_MULTIPLIER[round.game] ?? 1) && (result !== 'loss' || payout <= round.bet)
    const session = {
      id: round.id,
      game: round.game,
      bet: round.bet,
      payout: valid ? payout : 0,
      multiplier: !valid ? 0 : result === 'push' ? 1 : multiplier,
      result: valid ? result : 'loss',
      status: !valid ? 'INVALID' : status ?? STATUS_OF[result],
      verification: valid ? 'verified' : 'rejected',
      detail,
      at: Date.now(),
      durationMs: Date.now() - round.startedAt,
      nonce: round.proof.nonce,
      serverSeedHash: round.proof.serverSeedHash,
      betTxId: round.betTxId ?? null,
      payoutTxId: null,
      isTest: !!round.isTest,
    }
    if (!valid) {
      flag(round.userId, 'invalidState', 'critical', { game: round.game, sessionId: round.id, expected: `≤ ${MAX_MULTIPLIER[round.game]}×`, submitted: `${multiplier}× (${result})`, reward: payout })
    }
    if (valid && !round.isTest && payout > 0) {
      const res = useWalletStore.getState().payout(payout, round.game, { sessionId: round.id, idempotencyKey: `game:${round.id}:payout` })
      if (!res.ok) throw new AppError(res.error)
      session.payoutTxId = res.txId
      holdReveal(round.id, 'AC', payout)
    }
    const summary = recordGame(round.userId, session)
    emit('GAME_COMPLETED', { userId: round.userId, game: round.game, sessionId: round.id, status: session.status, isTest: session.isTest })
    if (valid) emit(session.result === 'win' ? 'GAME_WON' : session.result === 'loss' ? 'GAME_LOST' : 'GAME_COMPLETED', { userId: round.userId, game: round.game, sessionId: round.id, payout: session.payout, isTest: session.isTest })
    if (valid && !round.isTest && result === 'win' && payout > 0) recordWin({ userId: round.userId, amount: payout, game: round.game, currency: round.currency ?? 'AC' })
    if (!round.isTest) detect(round, session)
    // Suara menang/kalah + saldo baru ditampilkan UI saat animasi selesai (playOutcome di GameKit).
    return { session, summary }
  })
}

/**
 * Aksi pada ronde yang sudah selesai: kalau sesinya ada (klik ganda / balapan dengan
 * auto cash out) kembalikan hasil lama tanpa efek apa pun. ID yang tidak pernah ada
 * = indikasi replay / request palsu → cheat flag.
 */
function staleRound(userId, game, id) {
  const session = getProgress(userId).sessions.find((s) => s.id === id)
  if (session) return { done: true, stale: true, session }
  flag(userId, 'replay', 'high', { game, sessionId: id, expected: 'session aktif', submitted: `sessionId ${id}` })
  throw new AppError('play.errors.settled')
}

// ───────────────────────────── Mode server ─────────────────────────────
// Hasil dihitung API (port 1:1 dari aturan di file ini). Permintaan diproses berurutan;
// permintaan identik yang masih berjalan (klik ganda) memakai promise yang sama.

let serverQueue = Promise.resolve()
const inflight = new Map()

function remote(action, args = {}) {
  const key = `${action}:${JSON.stringify(args)}`
  if (inflight.has(key)) return inflight.get(key)
  const task = serverQueue.catch(() => {}).then(async () => {
    const { result, apply, userId } = await act(`game/${action}`, args)
    const s = result?.session
    // Saldo baru baru terlihat setelah animasi selesai (reveal gate) → tahan dulu, baru simpan state.
    if (s && !result.duplicate && !result.stale && !s.isTest && s.payout > 0) holdReveal(s.id, s.currency ?? 'AC', s.payout)
    apply()
    if (result?.summary) applyOut(userId, result.summary)
    return result
  })
  serverQueue = task
  inflight.set(key, task)
  const clean = () => inflight.delete(key)
  task.then(clean, clean)
  return task
}

/** Currency of new rounds (chosen in the bet box). Cases are always AC. */
export const betCurrency = () => (SERVER_MODE ? usePrefsStore.getState().betCurrency ?? 'AC' : 'AC')

const remoteStart = (action, args) => {
  play('start')
  return remote(action, action.startsWith('case-') ? args : { ...args, currency: betCurrency() })
}

// Crash: kurva digambar dari jam lokal (disinkronkan ke server), status ditanyakan ~3×/detik.
const crashPoll = { id: null, startedAt: null, inflight: false, last: 0, result: null, cashing: false }

function serverCrashTick(id) {
  if (crashPoll.result && crashPoll.result.id === id) {
    const res = crashPoll.result.res
    crashPoll.result = null
    if (res.crashed) play('explode')
    return res
  }
  let startedAt = crashPoll.id === id ? crashPoll.startedAt : null
  if (startedAt == null) {
    const open = serverOpenRound('crash')
    if (open?.id !== id) return { done: true }
    Object.assign(crashPoll, { id, startedAt: toLocalTime(open.startedAt) })
    startedAt = crashPoll.startedAt
  }
  if (!crashPoll.inflight && !crashPoll.cashing && Date.now() - crashPoll.last > 300) {
    crashPoll.inflight = true
    crashPoll.last = Date.now()
    remote('crash-tick', { id })
      .then((res) => {
        if (res?.done && !crashPoll.cashing) crashPoll.result = { id, res }
      })
      .catch(() => {})
      .finally(() => {
        crashPoll.inflight = false
      })
  }
  return { done: false, multiplier: Math.max(1, crashMultiplierAt(Date.now() - startedAt)) }
}

async function serverCrashCashout(id) {
  crashPoll.cashing = true
  try {
    const elapsed = crashPoll.id === id && crashPoll.startedAt != null ? Date.now() - crashPoll.startedAt : undefined
    const res = await remote('crash-cashout', { id, elapsed })
    if (res?.crashed) play('explode')
    return res
  } finally {
    crashPoll.cashing = false
    if (crashPoll.result?.id === id) crashPoll.result = null
  }
}

// ───────────────────────────── Game instan ─────────────────────────────

export function playDice({ bet, target, over }) {
  if (SERVER_MODE) return remoteStart('dice', { bet, target: Number(target), over: !!over })
  const t = Math.round(Number(target) * 100) / 100
  if (!(t >= 2 && t <= 98)) throw new AppError('play.errors.invalid')
  const chance = over ? 100 - t : t
  const multiplier = diceMultiplier(chance, HOUSE_EDGE)
  const round = begin('dice', bet, 1)
  const hit = (f) => (over ? diceRoll(f[0]) > t : diceRoll(f[0]) < t)
  const roll = diceRoll(forced(round, 1, hit)[0])
  const win = over ? roll > t : roll < t
  return { roll, target: t, over: !!over, chance, ...finish(round, { multiplier: win ? multiplier : 0, result: win ? 'win' : 'loss', detail: { roll, target: t, over: !!over } }) }
}

export function playLimbo({ bet, target }) {
  if (SERVER_MODE) return remoteStart('limbo', { bet, target: Number(target) })
  const t = Math.floor(Number(target) * 100) / 100
  if (!(t >= 1.01 && t <= 1_000_000)) throw new AppError('play.errors.invalid')
  const round = begin('limbo', bet, 1)
  const value = limboResult(forced(round, 1, (f) => limboResult(f[0], HOUSE_EDGE) >= t)[0], HOUSE_EDGE)
  const win = value >= t
  return { value, target: t, ...finish(round, { multiplier: win ? t : 0, result: win ? 'win' : 'loss', detail: { value, target: t } }) }
}

export function playCoinflip({ bet, side }) {
  if (SERVER_MODE) return remoteStart('coinflip', { bet, side })
  if (side !== 'heads' && side !== 'tails') throw new AppError('play.errors.invalid')
  const round = begin('coinflip', bet, 1)
  const outcome = coinflipSide(forced(round, 1, (f) => coinflipSide(f[0]) === side)[0])
  const win = outcome === side
  return { outcome, side, ...finish(round, { multiplier: win ? 1.98 : 0, result: win ? 'win' : 'loss', detail: { side, outcome } }) }
}

/** Plinko 16 baris. Tabel = RTP ±99% (lihat README). */
export const PLINKO_ROWS = 16
export const PLINKO_TABLES = {
  low: [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
  medium: [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
  high: [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
}

export function playPlinko({ bet, risk }) {
  if (SERVER_MODE) return remoteStart('plinko', { bet, risk })
  const table = PLINKO_TABLES[risk]
  if (!table) throw new AppError('play.errors.invalid')
  const round = begin('plinko', bet, PLINKO_ROWS)
  const { path, bin } = plinkoPath(forced(round, PLINKO_ROWS, (f) => table[plinkoPath(f, PLINKO_ROWS).bin] > 1), PLINKO_ROWS)
  const multiplier = table[bin]
  return { path, bin, risk, multiplier, ...finish(round, { multiplier, result: classify(multiplier), detail: { bin, risk } }) }
}

/** Roulette Eropa. bets: [{ type, value?, amount }] */
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36])
const ROULETTE_PAYOUT = { straight: 36, red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2, dozen: 3 }
function rouletteHit(bet, n) {
  if (bet.type === 'straight') return n === bet.value
  if (n === 0) return false
  if (bet.type === 'red') return RED.has(n)
  if (bet.type === 'black') return !RED.has(n)
  if (bet.type === 'odd') return n % 2 === 1
  if (bet.type === 'even') return n % 2 === 0
  if (bet.type === 'low') return n <= 18
  if (bet.type === 'high') return n >= 19
  if (bet.type === 'dozen') return Math.ceil(n / 12) === bet.value
  return false
}

export function playRoulette({ bets }) {
  if (SERVER_MODE) return remoteStart('roulette', { bets })
  if (!Array.isArray(bets) || bets.length === 0 || bets.length > 40) throw new AppError('play.errors.noBets')
  for (const b of bets) {
    if (!ROULETTE_PAYOUT[b.type] || !Number.isInteger(b.amount) || b.amount < 1) throw new AppError('play.errors.invalid')
    if (b.type === 'straight' && !(Number.isInteger(b.value) && b.value >= 0 && b.value <= 36)) throw new AppError('play.errors.invalid')
    if (b.type === 'dozen' && ![1, 2, 3].includes(b.value)) throw new AppError('play.errors.invalid')
  }
  const total = bets.reduce((s, b) => s + b.amount, 0)
  const round = begin('roulette', total, 1)
  const returnedFor = (n) => bets.reduce((s, b) => s + (rouletteHit(b, n) ? b.amount * ROULETTE_PAYOUT[b.type] : 0), 0)
  const number = rouletteNumber(forced(round, 1, (f) => returnedFor(rouletteNumber(f[0])) > total)[0])
  const returned = returnedFor(number)
  const multiplier = returned / total // tidak dibulatkan: payout = returned persis
  const result = returned > total ? 'win' : returned === total ? 'push' : 'loss'
  return { number, color: number === 0 ? 'green' : RED.has(number) ? 'red' : 'black', returned, ...finish(round, { multiplier, result, detail: { number, bets: bets.length } }) }
}

// ───────────────────────────── Cases ─────────────────────────────

export const CASES = [
  { id: 'starter', price: 100, tone: 'cyan' },
  { id: 'neon', price: 500, tone: 'purple' },
  { id: 'elite', price: 2_500, tone: 'gold' },
]

/** Item per tier: mult = nilai item × harga case. EV total 0,975. */
export const CASE_ITEMS = {
  common: [{ name: 'Sticker Pack', mult: 0.15 }, { name: 'Pixel Badge', mult: 0.25 }, { name: 'Arcade Token', mult: 0.35 }],
  rare: [{ name: 'Neon Keycap', mult: 0.5 }, { name: 'Glow Strap', mult: 0.7 }, { name: 'Chrome Pin', mult: 0.9 }],
  epic: [{ name: 'Holo Card', mult: 1.2 }, { name: 'Visor Skin', mult: 1.6 }, { name: 'Synth Pad', mult: 2 }],
  legendary: [{ name: 'Gold Joystick', mult: 4 }, { name: 'Plasma Blade', mult: 6 }],
  secret: [{ name: 'Founder Crown', mult: 20 }],
}
export const TIERS = [
  { id: 'common', weight: 50, color: '#9aa4b8' },
  { id: 'rare', weight: 30, color: '#3b9bff' },
  { id: 'epic', weight: 15, color: '#a35bff' },
  { id: 'legendary', weight: 4, color: '#ffc83d' },
  { id: 'secret', weight: 1, color: '#ff4d8d' },
]

function drawItem(f1, f2, price) {
  const tier = pickWeighted(f1, TIERS)
  const pool = CASE_ITEMS[tier.id]
  const item = pool[Math.min(pool.length - 1, Math.floor(f2 * pool.length))]
  return { tier: tier.id, color: tier.color, name: item.name, value: round2(item.mult * price) }
}

/** Item acak untuk strip animasi (bukan hasil — hasil tetap dari server). */
export function decoyItems(count, price) {
  return Array.from({ length: count }, () => drawItem(Math.random(), Math.random(), price))
}

export function openCase({ caseId }) {
  if (SERVER_MODE) return remoteStart('case-open', { caseId })
  const def = CASES.find((c) => c.id === caseId)
  if (!def) throw new AppError('play.errors.invalid')
  const round = begin('case-opening', def.price, 2)
  const f = forced(round, 2, (x) => drawItem(x[0], x[1], def.price).value > def.price)
  const item = drawItem(f[0], f[1], def.price)
  const multiplier = item.value / def.price
  return { item, ...finish(round, { multiplier, result: classify(multiplier), detail: { case: caseId, item: item.name, tier: item.tier } }) }
}

/** Case Battle vs bot: masing-masing buka `rounds` case. Pemenang ambil semua; seri = dibagi. */
export function playCaseBattle({ caseId, rounds }) {
  if (SERVER_MODE) return remoteStart('case-battle', { caseId, rounds })
  const def = CASES.find((c) => c.id === caseId)
  if (!def || ![1, 2, 3].includes(rounds)) throw new AppError('play.errors.invalid')
  const round = begin('case-battle', def.price * rounds, rounds * 4)
  const totals = (fl) => {
    let a = 0
    let b = 0
    for (let i = 0; i < rounds; i++) {
      a += drawItem(fl[i * 4], fl[i * 4 + 1], def.price).value
      b += drawItem(fl[i * 4 + 2], fl[i * 4 + 3], def.price).value
    }
    return a > b
  }
  const f = forced(round, rounds * 4, totals)
  const player = []
  const bot = []
  for (let i = 0; i < rounds; i++) {
    player.push(drawItem(f[i * 4], f[i * 4 + 1], def.price))
    bot.push(drawItem(f[i * 4 + 2], f[i * 4 + 3], def.price))
  }
  const sum = (items) => round2(items.reduce((s, it) => s + it.value, 0))
  const pt = sum(player)
  const bt = sum(bot)
  const result = pt > bt ? 'win' : pt === bt ? 'push' : 'loss'
  const multiplier = result === 'win' ? (pt + bt) / round.bet : 0
  return { player, bot, playerTotal: pt, botTotal: bt, ...finish(round, { multiplier, result, detail: { case: caseId, rounds, pt, bt } }) }
}

// ───────────────────────────── Crash ─────────────────────────────

/** Kurva multiplier: m(t) = e^(k·detik). 2× ≈ 5,8 dtk, 10× ≈ 19 dtk. */
export const CRASH_K = 0.12
export const CRASH_MIN_CASHOUT = 1.05
export const crashMultiplierAt = (ms) => Math.floor(Math.exp((CRASH_K * ms) / 1000) * 100) / 100
const crashTimeOf = (point) => (Math.log(point) / CRASH_K) * 1000

export function crashStart({ bet, autoCashout }) {
  if (SERVER_MODE) {
    return remoteStart('crash-start', { bet, autoCashout: autoCashout || null }).then((r) => {
      const startedAt = toLocalTime(r.startedAt)
      Object.assign(crashPoll, { id: r.id, startedAt, last: Date.now(), result: null })
      return { ...r, startedAt }
    })
  }
  const auto = autoCashout ? Math.floor(Number(autoCashout) * 100) / 100 : null
  if (auto !== null && !(auto >= CRASH_MIN_CASHOUT && auto <= 10_000)) throw new AppError('play.crash.minCashout', { min: CRASH_MIN_CASHOUT.toFixed(2) })
  const round = begin('crash', bet, 1, { autoCashout: auto })
  round.point = round.control === 'win' ? 1_000 : round.control === 'loss' ? 1 : crashPoint(round.floats[0], HOUSE_EDGE)
  saveOpen(round)
  // Titik crash tidak dikirim ke UI.
  return { id: round.id, startedAt: round.startedAt, autoCashout: auto }
}

/** Status ronde berdasarkan waktu "server". Menyelesaikan ronde saat crash / auto cash out. */
export function crashTick(id) {
  if (SERVER_MODE) return serverCrashTick(id)
  const user = me()
  const round = loadOpen(user.id, 'crash', id)
  if (!round) return { done: true }
  const elapsed = Date.now() - round.startedAt
  const current = crashMultiplierAt(elapsed)
  if (round.autoCashout && round.autoCashout <= round.point && current >= round.autoCashout) {
    clearOpen(round)
    return { done: true, crashed: false, point: round.point, cashedAt: round.autoCashout, ...finish(round, { multiplier: round.autoCashout, result: 'win', detail: { point: round.point, cashedAt: round.autoCashout, auto: true } }) }
  }
  if (elapsed >= crashTimeOf(round.point)) {
    clearOpen(round)
    play('explode')
    return { done: true, crashed: true, point: round.point, ...finish(round, { multiplier: 0, result: 'loss', detail: { point: round.point } }) }
  }
  return { done: false, multiplier: current }
}

export function crashCashout(id) {
  if (SERVER_MODE) return serverCrashCashout(id)
  const user = me()
  const round = loadOpen(user.id, 'crash', id)
  if (!round) return staleRound(user.id, 'crash', id)
  const elapsed = Date.now() - round.startedAt
  if (elapsed >= crashTimeOf(round.point)) return crashTick(id) // terlambat → sudah crash
  const at = Math.max(1, crashMultiplierAt(elapsed))
  if (at < CRASH_MIN_CASHOUT) throw new AppError('play.crash.minCashout', { min: CRASH_MIN_CASHOUT.toFixed(2) })
  clearOpen(round)
  return { done: true, crashed: false, point: round.point, cashedAt: at, ...finish(round, { multiplier: at, result: at > 1 ? 'win' : 'push', detail: { point: round.point, cashedAt: at } }) }
}

// ───────────────────────────── Mines ─────────────────────────────

export const minesMultiplier = (mines, picks) => {
  let m = 1 - HOUSE_EDGE
  for (let i = 0; i < picks; i++) m *= (25 - i) / (25 - mines - i)
  return Math.floor(m * 100) / 100
}

export function minesStart({ bet, mines }) {
  if (SERVER_MODE) return remoteStart('mines-start', { bet, mines })
  if (!(Number.isInteger(mines) && mines >= 1 && mines <= 24)) throw new AppError('play.errors.invalid')
  const round = begin('mines', bet, 24, { mines, revealed: [] })
  round.positions = minePositions(round.floats, mines)
  saveOpen(round)
  return { id: round.id, mines, revealed: [] }
}

export function minesReveal(id, index) {
  if (SERVER_MODE) {
    return remote('mines-reveal', { id, index }).then((r) => {
      play(r?.hit != null ? 'explode' : 'reveal')
      return r
    })
  }
  const user = me()
  const round = loadOpen(user.id, 'mines', id)
  if (!round) return staleRound(user.id, 'mines', id)
  if (!(Number.isInteger(index) && index >= 0 && index < 25)) throw new AppError('play.errors.invalid')
  if (round.revealed.includes(index)) {
    flag(user.id, 'modifiedState', 'low', { game: 'mines', sessionId: id, expected: 'petak belum dibuka', submitted: `petak ${index} (sudah dibuka)` })
    throw new AppError('play.errors.invalid')
  }
  // Akun test: pindahkan ranjau supaya hasil sesuai Force Win/Loss.
  if (round.isTest && round.control !== 'off') {
    const isMine = round.positions.includes(index)
    if (round.control === 'loss' && !isMine) round.positions = [index, ...round.positions.slice(1)]
    if (round.control === 'win' && isMine) {
      const free = [...Array(25).keys()].find((i) => !round.positions.includes(i) && !round.revealed.includes(i) && i !== index)
      round.positions = round.positions.map((p) => (p === index ? free : p))
    }
  }
  if (round.positions.includes(index)) {
    clearOpen(round)
    play('explode')
    return { done: true, hit: index, mines: round.positions, revealed: round.revealed, ...finish(round, { multiplier: 0, result: 'loss', detail: { mines: round.mines, picks: round.revealed.length } }) }
  }
  round.revealed = [...round.revealed, index]
  play('reveal')
  const multiplier = minesMultiplier(round.mines, round.revealed.length)
  if (round.revealed.length === 25 - round.mines) return minesCashout(id, round)
  saveOpen(round)
  return { done: false, revealed: round.revealed, multiplier, next: minesMultiplier(round.mines, round.revealed.length + 1) }
}

export function minesCashout(id, loaded) {
  if (SERVER_MODE) return remote('mines-cashout', { id })
  const user = me()
  const round = loaded ?? loadOpen(user.id, 'mines', id)
  if (!round) return staleRound(user.id, 'mines', id)
  clearOpen(round)
  if (round.revealed.length === 0) {
    // Belum membuka petak: taruhan dikembalikan.
    return { done: true, mines: round.positions, revealed: [], ...finish(round, { multiplier: 1, result: 'push', status: 'CANCELLED', detail: { mines: round.mines, picks: 0 } }) }
  }
  const multiplier = minesMultiplier(round.mines, round.revealed.length)
  return { done: true, mines: round.positions, revealed: round.revealed, multiplier, ...finish(round, { multiplier, result: 'win', detail: { mines: round.mines, picks: round.revealed.length } }) }
}

// ───────────────────────────── Blackjack ─────────────────────────────

const cardValue = (rank) => (rank === 'A' ? 11 : ['K', 'Q', 'J'].includes(rank) ? 10 : Number(rank))
export function handValue(cards) {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += cardValue(c.rank)
    if (c.rank === 'A') aces++
  }
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return total
}
const isBlackjack = (cards) => cards.length === 2 && handValue(cards) === 21

/** Tampilan untuk UI: kartu tertutup dealer tidak dikirim selama ronde berjalan. */
function bjView(round, reveal) {
  return {
    id: round.id,
    bet: round.bet,
    player: round.player,
    dealer: reveal ? round.dealer : [round.dealer[0], { hidden: true, id: 'hidden' }],
    playerTotal: handValue(round.player),
    dealerTotal: reveal ? handValue(round.dealer) : handValue([round.dealer[0]]),
    canDouble: round.player.length === 2 && !round.doubled,
  }
}

function bjSettle(round) {
  const p = handValue(round.player)
  const playDealer = (dealer, deck) => {
    while (p <= 21 && handValue(dealer) < 17) dealer.push(deck.pop())
    const d = handValue(dealer)
    return p > 21 ? 'loss' : d > 21 || p > d ? 'win' : p === d ? 'push' : 'loss'
  }
  if (round.isTest && round.control !== 'off' && p <= 21) {
    // Akun test: coba urutan kartu dealer lain sampai hasil sesuai Force Win/Loss.
    for (let i = 0; i < 300; i++) {
      const dealer = [...round.dealer]
      const deck = [...round.deck].sort(() => Math.random() - 0.5)
      if (playDealer(dealer, deck) === round.control) {
        round.dealer = dealer
        round.deck = deck
        break
      }
    }
  }
  if (handValue(round.dealer) < 17 && p <= 21) playDealer(round.dealer, round.deck)
  const d = handValue(round.dealer)
  const result = p > 21 ? 'loss' : d > 21 || p > d ? 'win' : p === d ? 'push' : 'loss'
  clearOpen(round)
  return { done: true, ...bjView(round, true), outcome: p > 21 ? 'bust' : d > 21 ? 'dealerBust' : result, ...finish(round, { multiplier: result === 'win' ? 2 : 0, result, detail: { player: p, dealer: d, doubled: !!round.doubled } }) }
}

export function blackjackStart({ bet }) {
  if (SERVER_MODE) {
    play('card')
    return remoteStart('blackjack-start', { bet })
  }
  const round = begin('blackjack', bet, 51)
  const deck = shuffleWithFloats(createDeck(), round.floats)
  round.player = [deck.pop(), deck.pop()]
  round.dealer = [deck.pop(), deck.pop()]
  round.deck = deck
  play('card')
  if (isBlackjack(round.player) || isBlackjack(round.dealer)) {
    const both = isBlackjack(round.player) && isBlackjack(round.dealer)
    const result = both ? 'push' : isBlackjack(round.player) ? 'win' : 'loss'
    return { done: true, ...bjView(round, true), outcome: both ? 'push' : result === 'win' ? 'blackjack' : 'dealerBlackjack', ...finish(round, { multiplier: result === 'win' ? 2.5 : 0, result, detail: { blackjack: true } }) }
  }
  saveOpen(round)
  return { done: false, ...bjView(round, false) }
}

export function blackjackAction(id, action) {
  if (SERVER_MODE) {
    play('card')
    return remote('blackjack-action', { id, action })
  }
  const user = me()
  const round = loadOpen(user.id, 'blackjack', id)
  if (!round) return staleRound(user.id, 'blackjack', id)
  play('card')
  if (action === 'hit') {
    if (round.isTest && round.control === 'win') {
      const safe = round.deck.findIndex((c) => handValue([...round.player, c]) <= 21)
      if (safe >= 0) round.deck.push(round.deck.splice(safe, 1)[0])
    }
    round.player = [...round.player, round.deck.pop()]
    if (handValue(round.player) >= 21) return bjSettle(round)
    saveOpen(round)
    return { done: false, ...bjView(round, false) }
  }
  if (action === 'double') {
    if (round.player.length !== 2 || round.doubled) throw new AppError('play.errors.invalid')
    if (!round.isTest) {
      const res = useWalletStore.getState().placeBet(round.bet, 'blackjack')
      if (!res.ok) throw new AppError(res.error)
    }
    round.bet *= 2
    round.doubled = true
    round.player = [...round.player, round.deck.pop()]
    return bjSettle(round)
  }
  if (action === 'stand') return bjSettle(round)
  throw new AppError('play.errors.invalid')
}

// ───────────────────────────── Resume & kontrak lama ─────────────────────────────

/** Ronde yang masih terbuka untuk game ini (dipakai UI setelah refresh). */
export function openRound(game) {
  if (SERVER_MODE) {
    const r = serverOpenRound(game)
    if (r && game === 'crash') return { ...r, startedAt: toLocalTime(r.startedAt) }
    return r
  }
  const user = getCurrentUser()
  const round = user && loadOpen(user.id, game)
  if (!round) return null
  if (game === 'crash') return { id: round.id, startedAt: round.startedAt, autoCashout: round.autoCashout }
  if (game === 'mines') return { id: round.id, mines: round.mines, revealed: round.revealed, bet: round.bet, multiplier: minesMultiplier(round.mines, round.revealed.length) }
  if (game === 'blackjack') return { done: false, ...bjView(round, false) }
  return null
}

/** Kontrak umum (README) untuk game baru: startRound → hitung hasil di server → finishRound. */
export function startRound({ game, bet, floats = 1 }) {
  try {
    const round = begin(game, bet, floats)
    return { ok: true, round, floats: round.floats, proof: round.proof }
  } catch (e) {
    return { ok: false, error: e.code ?? 'errors.generic' }
  }
}
export const finishRound = ({ round, multiplier, result, detail }) => finish(round, { multiplier, result, detail })

// ───────────────────────────── Crash global (mode server) ─────────────────────────────
// Satu ronde untuk semua pemain: taruhan dibuka ±7 detik, roket berangkat bersamaan, titik crash
// baru diungkap setelah meledak. Status ditanya berkala lewat /api/crash/state.

/** Status ronde global + jam server → waktu lokal. */
export async function crashGlobalState() {
  const data = await api('crash/state')
  const local = (ms) => (ms == null ? null : toLocalTime(ms))
  return { ...data, round: { ...data.round, startAt: local(data.round.startAt), crashAt: local(data.round.crashAt), nextAt: local(data.round.nextAt) } }
}

export function crashGlobalBet({ bet, autoCashout }) {
  return remoteStart('crash-bet', { bet, autoCashout: autoCashout || null }).then((r) => ({ ...r, startedAt: toLocalTime(r.startedAt) }))
}

export async function crashGlobalCashout(id, startAtLocal) {
  const res = await remote('crash-cashout', { id, elapsed: startAtLocal != null ? Date.now() - startAtLocal : undefined })
  if (res?.crashed) play('explode')
  return res
}

/** Hasil taruhan saya setelah ronde selesai (diselesaikan server walau halaman ditutup). */
export const crashGlobalResult = (id) => remote('crash-tick', { id })

// ── v2.2 games (server only) ──
const serverOnly = () => {
  throw new AppError('errors.serverOnly')
}
export const playKeno = ({ bet, picks }) => (SERVER_MODE ? remoteStart('keno', { bet, picks }) : serverOnly())
export const ladderStart = (game, { bet, mode }) => (SERVER_MODE ? remoteStart(`${game}-start`, { bet, mode }) : serverOnly())
export const ladderStep = (game, id, pick) =>
  SERVER_MODE ? remote(`${game}-step`, pick == null ? { id } : { id, pick }).then((r) => (play(r?.lost ? 'explode' : 'reveal'), r)) : serverOnly()
export const ladderCashout = (game, id) => (SERVER_MODE ? remote(`${game}-cashout`, { id }) : serverOnly())
export const playTarot = ({ bet, risk }) => (SERVER_MODE ? remoteStart('tarot', { bet, risk }) : serverOnly())
export const playSweet = ({ bet }) => (SERVER_MODE ? remoteStart('sweet', { bet }) : serverOnly())
