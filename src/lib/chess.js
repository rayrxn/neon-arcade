/**
 * Small chess rules engine (mirrored 1:1 in api/lib/chess.php — the server is the referee for PvP).
 * Board: 64-char string, index = rank*8 + file, rank 0 = the 8th rank. Uppercase = white, '.' = empty.
 * State: { b, t: 'w'|'b', c: castling 'KQkq' subset, e: en-passant square or -1, h: halfmove clock, n: plies }.
 */
export const START = { b: 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR', t: 'w', c: 'KQkq', e: -1, h: 0, n: 0 }

const N = [-17, -15, -10, -6, 6, 10, 15, 17]
const K = [-9, -8, -7, -1, 1, 7, 8, 9]
const DIAG = [-9, -7, 7, 9]
const ORTH = [-8, -1, 1, 8]
const fileOf = (i) => i & 7
const isWhite = (p) => p >= 'A' && p <= 'Z'
const own = (p, t) => p !== '.' && (t === 'w' ? isWhite(p) : !isWhite(p))
const step = (from, d) => {
  const to = from + d
  if (to < 0 || to > 63) return -1
  return Math.abs(fileOf(to) - fileOf(from)) > 2 ? -1 : to
}

/** Is square `sq` attacked by side `by`? */
export function attacked(b, sq, by) {
  const P = by === 'w' ? 'P' : 'p'
  const pd = by === 'w' ? [7, 9] : [-7, -9]
  for (const d of pd) { const f = step(sq, d); if (f >= 0 && b[f] === P) return true }
  const kn = by === 'w' ? 'N' : 'n'
  for (const d of N) { const f = step(sq, d); if (f >= 0 && b[f] === kn) return true }
  const kg = by === 'w' ? 'K' : 'k'
  for (const d of K) { const f = step(sq, d); if (f >= 0 && b[f] === kg) return true }
  const slide = (dirs, set) => {
    for (const d of dirs) {
      let f = sq
      for (;;) {
        const n = step(f, d)
        if (n < 0 || Math.abs(fileOf(n) - fileOf(f)) > 1) break
        f = n
        if (b[f] === '.') continue
        if (set.includes(b[f])) return true
        break
      }
    }
    return false
  }
  return slide(DIAG, by === 'w' ? 'BQ' : 'bq') || slide(ORTH, by === 'w' ? 'RQ' : 'rq')
}

export const inCheck = (s, side = s.t) => attacked(s.b, s.b.indexOf(side === 'w' ? 'K' : 'k'), side === 'w' ? 'b' : 'w')

function pseudo(s) {
  const { b, t } = s
  const out = []
  const add = (f, to) => {
    const p = b[f].toLowerCase()
    if (p === 'p' && (to < 8 || to > 55)) for (const pr of 'qrbn') out.push({ f, t: to, p: pr })
    else out.push({ f, t: to })
  }
  for (let f = 0; f < 64; f++) {
    const pc = b[f]
    if (!own(pc, t)) continue
    const p = pc.toLowerCase()
    if (p === 'p') {
      const dir = t === 'w' ? -8 : 8
      const one = f + dir
      if (one >= 0 && one < 64 && b[one] === '.') {
        add(f, one)
        const startRank = t === 'w' ? 6 : 1
        if (f >> 3 === startRank && b[one + dir] === '.') out.push({ f, t: one + dir })
      }
      for (const d of t === 'w' ? [-9, -7] : [7, 9]) {
        const to = step(f, d)
        if (to < 0 || Math.abs(fileOf(to) - fileOf(f)) !== 1) continue
        if ((b[to] !== '.' && !own(b[to], t)) || to === s.e) add(f, to)
      }
    } else if (p === 'n' || p === 'k') {
      for (const d of p === 'n' ? N : K) {
        const to = step(f, d)
        if (to >= 0 && !own(b[to], t)) out.push({ f, t: to })
      }
      if (p === 'k') {
        const opp = t === 'w' ? 'b' : 'w'
        const home = t === 'w' ? 60 : 4
        if (f === home && !attacked(b, home, opp)) {
          const [ks, qs] = t === 'w' ? ['K', 'Q'] : ['k', 'q']
          if (s.c.includes(ks) && b[home + 1] === '.' && b[home + 2] === '.' && !attacked(b, home + 1, opp)) out.push({ f, t: home + 2 })
          if (s.c.includes(qs) && b[home - 1] === '.' && b[home - 2] === '.' && b[home - 3] === '.' && !attacked(b, home - 1, opp)) out.push({ f, t: home - 2 })
        }
      }
    } else {
      const dirs = p === 'b' ? DIAG : p === 'r' ? ORTH : [...DIAG, ...ORTH]
      for (const d of dirs) {
        let cur = f
        for (;;) {
          const to = step(cur, d)
          if (to < 0 || Math.abs(fileOf(to) - fileOf(cur)) > 1) break
          if (own(b[to], t)) break
          out.push({ f, t: to })
          if (b[to] !== '.') break
          cur = to
        }
      }
    }
  }
  return out
}

/** Play a move (no legality check). Returns the new state. */
export function apply(s, m) {
  const b = s.b.split('')
  const pc = b[m.f]
  const p = pc.toLowerCase()
  const cap = b[m.t] !== '.'
  b[m.t] = m.p ? (s.t === 'w' ? m.p.toUpperCase() : m.p) : pc
  b[m.f] = '.'
  if (p === 'p' && m.t === s.e) b[m.t + (s.t === 'w' ? 8 : -8)] = '.'
  if (p === 'k' && Math.abs(m.t - m.f) === 2) {
    const rookFrom = m.t > m.f ? m.f + 3 : m.f - 4
    b[(m.f + m.t) >> 1] = b[rookFrom]
    b[rookFrom] = '.'
  }
  let c = s.c
  const strip = (ch) => { c = c.replace(ch, '') }
  if (pc === 'K') { strip('K'); strip('Q') }
  if (pc === 'k') { strip('k'); strip('q') }
  for (const sq of [m.f, m.t]) {
    if (sq === 63) strip('K')
    if (sq === 56) strip('Q')
    if (sq === 7) strip('k')
    if (sq === 0) strip('q')
  }
  return {
    b: b.join(''),
    t: s.t === 'w' ? 'b' : 'w',
    c,
    e: p === 'p' && Math.abs(m.t - m.f) === 16 ? (m.f + m.t) >> 1 : -1,
    h: p === 'p' || cap ? 0 : s.h + 1,
    n: s.n + 1,
  }
}

export function legalMoves(s) {
  return pseudo(s).filter((m) => !inCheck(apply(s, m), s.t))
}

/** 'checkmate' | 'stalemate' | 'insufficient' | 'fifty' | null */
export function status(s) {
  if (!legalMoves(s).length) return inCheck(s) ? 'checkmate' : 'stalemate'
  if (s.h >= 100) return 'fifty'
  const rest = s.b.replace(/[.kK]/g, '')
  if (rest === '' || rest === 'n' || rest === 'N' || rest === 'b' || rest === 'B') return 'insufficient'
  return null
}

export const sqName = (i) => 'abcdefgh'[i & 7] + (8 - (i >> 3))

// ── Practice bot (browser only, no wagers) ──
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }
const CENTER = (i) => 3.5 - Math.max(Math.abs(3.5 - (i & 7)), Math.abs(3.5 - (i >> 3)))
function evaluate(s) {
  let v = 0
  for (let i = 0; i < 64; i++) {
    const pc = s.b[i]
    if (pc === '.') continue
    const p = pc.toLowerCase()
    let x = VAL[p] + (p === 'n' || p === 'b' ? CENTER(i) * 8 : p === 'p' ? (isWhite(pc) ? 6 - (i >> 3) : (i >> 3) - 1) * 6 + CENTER(i) * 3 : 0)
    v += isWhite(pc) ? x : -x
  }
  return s.t === 'w' ? v : -v
}
function negamax(s, depth, a, bta) {
  const moves = legalMoves(s)
  if (!moves.length) return inCheck(s) ? -100000 - depth : 0
  if (depth === 0) return evaluate(s)
  moves.sort((x, y) => (s.b[y.t] !== '.' ? VAL[s.b[y.t].toLowerCase()] : 0) - (s.b[x.t] !== '.' ? VAL[s.b[x.t].toLowerCase()] : 0))
  let best = -Infinity
  for (const m of moves) {
    const v = -negamax(apply(s, m), depth - 1, -bta, -a)
    if (v > best) best = v
    if (v > a) a = v
    if (a >= bta) break
  }
  return best
}
/** level: 'normal' (depth 1 + mistakes), 'medium' (depth 2), 'hard' (depth 3). */
export function botMove(s, level) {
  const moves = legalMoves(s)
  if (!moves.length) return null
  const depth = level === 'hard' ? 3 : level === 'medium' ? 2 : 1
  const noise = level === 'normal' ? 90 : level === 'medium' ? 25 : 4
  let best = null
  let bestV = -Infinity
  for (const m of moves) {
    const v = -negamax(apply(s, m), depth - 1, -Infinity, Infinity) + Math.random() * noise
    if (v > bestV) { bestV = v; best = m }
  }
  return best
}
