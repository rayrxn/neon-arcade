import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Bomb, Play, Trophy } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { GameShell, Stage } from '@/components/play/GameKit'
import { act, api } from '@/services/server'
import { SERVER_MODE } from '@/config/runtime'
import { play as sfx } from '@/services/sound'
import { winPop, lossShake } from '@/lib/motion'
import { useT } from '@/i18n'
import { toast } from '@/store/useUiStore'

/** Skill arcades: played in the browser, score checked by the server, pays capped XP only. */
export default function Arcade({ game }) {
  const slug = game.slug
  const { t } = useT()
  const [board, setBoard] = useState(null)
  const [phase, setPhase] = useState('idle') // idle | playing | over
  const [score, setScore] = useState(0)
  const [result, setResult] = useState(null)
  const run = useRef(null)
  const [round, setRound] = useState(0)
  const [stake, setStake] = useState(0)

  const loadBoard = useCallback(() => {
    if (SERVER_MODE) api(`arcade/board?game=${slug}`).then(setBoard).catch(() => {})
  }, [slug])
  useEffect(loadBoard, [loadBoard])

  const start = async () => {
    setResult(null)
    setScore(0)
    run.current = null
    if (SERVER_MODE) {
      try {
        const { result: r, apply } = await act('arcade/start', { game: slug, stake })
        apply()
        run.current = r.runId
      } catch (err) {
        if (stake > 0) { toast({ tone: 'error', title: t(err?.code ?? 'errors.generic', err?.vars) }); return }
      }
    }
    sfx('start')
    setRound((n) => n + 1)
    setPhase('playing')
  }

  const over = useCallback(async (final) => {
    setPhase('over')
    setScore(final)
    sfx(final > 0 ? 'win' : 'lose')
    if (!SERVER_MODE || !run.current) { setResult({ score: final, xp: 0 }); return }
    try {
      const { result: r, apply } = await act('arcade/finish', { runId: run.current, score: final })
      apply()
      setResult(r)
    } catch {
      setResult({ score: final, xp: 0 })
    }
    run.current = null
    loadBoard()
  }, [loadBoard])

  const Game = GAMES[slug]
  const controls = (
    <>
      <div>
        <p className="mb-1.5 text-[11px] font-semibold text-slate-500">{t('play.arcade.stake')}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 100, 500, 1000, 5000, 10000].map((v) => (
            <button key={v} type="button" disabled={phase === 'playing'} onClick={() => setStake(v)}
              className={clsx('rounded-lg py-1.5 font-mono text-xs font-bold ring-1 ring-inset transition disabled:opacity-50', stake === v ? 'bg-neon-gold/15 text-neon-gold ring-neon-gold/40' : 'bg-white/[0.04] text-slate-300 ring-white/[0.08] hover:bg-white/[0.08]')}>
              {v === 0 ? t('play.arcade.free') : `${v >= 1000 ? `${v / 1000}K` : v}`}
            </button>
          ))}
        </div>
        {stake > 0 && board?.tiers && (
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            {board.tiers.map(([need, mult]) => (
              <div key={need} className="rounded-md bg-white/[0.03] py-1 ring-1 ring-inset ring-white/[0.06]">
                <p className="text-[10px] text-slate-500">{t('play.arcade.reach', { n: need })}</p>
                <p className="num font-mono text-xs font-bold text-neon-green">{mult}× · {Math.floor(stake * mult)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <Button size="lg" className="w-full" onClick={start} disabled={phase === 'playing'}><Play className="mr-1.5 h-4 w-4" />{phase === 'over' ? t('play.arcade.again') : t('play.arcade.start')}</Button>
      <dl className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-white/[0.03] py-2 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('play.arcade.score')}</dt>
          <dd className="num font-mono text-lg font-bold text-white">{score}</dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] py-2 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('play.arcade.best')}</dt>
          <dd className="num font-mono text-lg font-bold text-neon-gold">{board?.best ?? 0}</dd>
        </div>
      </dl>
      {board && <p className="text-[11px] text-slate-500">{t('play.arcade.xpNote', { per: board.xpPer, left: board.xpLeft, cap: board.runCap })}</p>}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-slate-300"><Trophy className="h-3.5 w-3.5 text-neon-gold" />{t('play.arcade.today')}</p>
        {board?.top?.length ? (
          <ol className="space-y-1">
            {board.top.map((r, i) => (
              <li key={r.username} className="flex justify-between rounded-md bg-white/[0.03] px-2 py-1 text-xs">
                <span className="text-slate-300"><span className="mr-1.5 font-mono text-slate-500">{i + 1}.</span>{r.username}</span>
                <span className="num font-mono font-bold text-white">{r.score}</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-xs text-slate-500">{t('play.arcade.noScores')}</p>}
      </div>
    </>
  )

  const stage = (
    <Stage className="relative p-3 sm:p-5">
      <Game key={round} playing={phase === 'playing'} onScore={setScore} onOver={over} />
      <AnimatePresence>
        {phase !== 'playing' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center bg-ink-950/70 backdrop-blur-[2px]">
            {phase === 'idle' ? (
              <motion.button {...winPop} type="button" onClick={start} className="grid place-items-center gap-2 rounded-2xl bg-white/[0.06] px-8 py-6 ring-1 ring-white/10 hover:bg-white/[0.1]">
                <Play className="h-10 w-10 text-neon-cyan" />
                <span className="font-display text-lg font-bold text-white">{t('play.arcade.tapStart')}</span>
                <span className="max-w-[240px] text-center text-xs text-slate-400">{t(`play.arcade.hint.${slug}`)}</span>
              </motion.button>
            ) : (
              <motion.div {...winPop} className="grid place-items-center gap-1 rounded-2xl bg-ink-900/90 px-8 py-6 text-center ring-1 ring-white/10">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('play.arcade.gameOver')}</p>
                <p className="num font-display text-5xl font-black text-white">{result?.score ?? score}</p>
                {result && <p className="num font-mono text-sm font-bold text-neon-cyan">+{result.xp} XP</p>}
                {result?.stake > 0 && (
                  <p className={clsx('num font-mono text-base font-black', result.payout > 0 ? 'text-neon-green' : 'text-neon-red')}>
                    {result.payout > 0 ? `+${result.payout - result.stake} AC` : `−${result.stake} AC`}
                  </p>
                )}
                {result?.valid === false && <p className="text-xs text-neon-red">{t('play.arcade.invalid')}</p>}
                <Button className="mt-3" onClick={start}>{t('play.arcade.again')}</Button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </Stage>
  )
  return <GameShell game={game} controls={controls} stage={stage} outcome={null} />
}

// ───────────────────────────── Snake ─────────────────────────────
const N = 18
function Snake({ playing, onScore, onOver }) {
  const cv = useRef(null)
  const st = useRef(null)
  const turn = useCallback((dx, dy) => {
    const s = st.current
    if (!s) return
    const [cx, cy] = s.queue.length ? s.queue[s.queue.length - 1] : s.dir
    if (cx === -dx && cy === -dy) return
    if (s.queue.length < 3) s.queue.push([dx, dy])
  }, [])
  useEffect(() => {
    const food = (snake) => {
      for (;;) {
        const f = [Math.floor(Math.random() * N), Math.floor(Math.random() * N)]
        if (!snake.some(([x, y]) => x === f[0] && y === f[1])) return f
      }
    }
    const snake = [[8, 9], [7, 9], [6, 9]]
    st.current = { snake, dir: [1, 0], queue: [], food: food(snake), score: 0, last: 0, alive: true, t0: performance.now() }
    const ctx = cv.current.getContext('2d')
    let raf
    const draw = (now) => {
      const s = st.current
      const W = cv.current.width
      const c = W / N
      const speed = Math.max(65, 140 - s.score * 3)
      if (playing && s.alive && now - s.last > speed) {
        s.last = now
        if (s.queue.length) s.dir = s.queue.shift()
        const head = [s.snake[0][0] + s.dir[0], s.snake[0][1] + s.dir[1]]
        if (head[0] < 0 || head[1] < 0 || head[0] >= N || head[1] >= N || s.snake.some(([x, y]) => x === head[0] && y === head[1])) {
          s.alive = false
          onOver(s.score)
        } else {
          s.snake.unshift(head)
          if (head[0] === s.food[0] && head[1] === s.food[1]) { s.score++; onScore(s.score); s.food = food(s.snake); sfx('reveal') } else s.snake.pop()
        }
      }
      ctx.clearRect(0, 0, W, W)
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { ctx.fillStyle = (i + j) % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.045)'; ctx.fillRect(i * c, j * c, c, c) }
      const pulse = 1 + Math.sin(now / 160) * 0.12
      ctx.fillStyle = '#f43f5e'
      ctx.shadowColor = '#f43f5e'; ctx.shadowBlur = 14
      ctx.beginPath(); ctx.arc((s.food[0] + 0.5) * c, (s.food[1] + 0.5) * c, c * 0.32 * pulse, 0, Math.PI * 2); ctx.fill()
      ctx.shadowBlur = 0
      s.snake.forEach(([x, y], i) => {
        const k = 1 - i / Math.max(8, s.snake.length + 4)
        ctx.fillStyle = `hsl(${165 + i * 2}, 85%, ${45 + k * 15}%)`
        const p = i === 0 ? 1 : 2
        ctx.beginPath(); ctx.roundRect(x * c + p, y * c + p, c - p * 2, c - p * 2, c * 0.3); ctx.fill()
      })
      const [hx, hy] = s.snake[0]
      ctx.fillStyle = '#0b0f19'
      const ex = s.dir[1] !== 0 ? [0.3, 0.7] : [0.5, 0.5]; const ey = s.dir[0] !== 0 ? [0.3, 0.7] : [0.5, 0.5]
      for (let e = 0; e < 2; e++) { ctx.beginPath(); ctx.arc((hx + ex[e] + s.dir[0] * 0.15) * c, (hy + ey[e] + s.dir[1] * 0.15) * c, c * 0.09, 0, Math.PI * 2); ctx.fill() }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    const key = (e) => {
      const m = { ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] }[e.key]
      if (m) { e.preventDefault(); turn(...m) }
    }
    window.addEventListener('keydown', key)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', key) }
  }, [playing, onOver, onScore, turn])
  const touch = useRef(null)
  return (
    <div className="mx-auto max-w-[460px]">
      <canvas ref={cv} width={540} height={540} className="aspect-square w-full touch-none rounded-xl ring-1 ring-white/10"
        onTouchStart={(e) => { touch.current = [e.touches[0].clientX, e.touches[0].clientY] }}
        onTouchEnd={(e) => {
          if (!touch.current) return
          const dx = e.changedTouches[0].clientX - touch.current[0]; const dy = e.changedTouches[0].clientY - touch.current[1]
          if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) turn(Math.abs(dx) > Math.abs(dy) ? Math.sign(dx) : 0, Math.abs(dy) >= Math.abs(dx) ? Math.sign(dy) : 0)
        }} />
      <div className="mx-auto mt-3 grid w-40 grid-cols-3 gap-1.5 sm:hidden">
        {[[null], [ArrowUp, 0, -1], [null], [ArrowLeft, -1, 0], [ArrowDown, 0, 1], [ArrowRight, 1, 0]].map(([Icon, dx, dy], i) => Icon ? (
          <button key={i} type="button" onClick={() => turn(dx, dy)} className="grid h-11 place-items-center rounded-lg bg-white/[0.07] active:bg-white/[0.15]"><Icon className="h-5 w-5 text-slate-200" /></button>
        ) : <span key={i} />)}
      </div>
    </div>
  )
}

// ───────────────────────────── Moles ─────────────────────────────
const MOLE_TIME = 30
function Moles({ playing, onScore, onOver }) {
  const [holes, setHoles] = useState(() => Array(9).fill(null)) // null | { id, bomb }
  const [left, setLeft] = useState(MOLE_TIME)
  const [pops, setPops] = useState([])
  const [shake, setShake] = useState(0)
  const score = useRef(0)
  useEffect(() => {
    if (!playing) return
    const t0 = Date.now()
    let id = 0
    const timers = []
    const spawn = () => {
      const el = (Date.now() - t0) / 1000
      if (el >= MOLE_TIME) return
      const i = Math.floor(Math.random() * 9)
      const m = { id: ++id, bomb: Math.random() < 0.16 }
      setHoles((h) => (h[i] ? h : Object.assign([...h], { [i]: m })))
      timers.push(setTimeout(() => setHoles((h) => (h[i]?.id === m.id ? Object.assign([...h], { [i]: null }) : h)), Math.max(560, 1000 - el * 14)))
      timers.push(setTimeout(spawn, Math.max(330, 700 - el * 12)))
    }
    spawn()
    const clock = setInterval(() => {
      const l = Math.max(0, MOLE_TIME - Math.floor((Date.now() - t0) / 1000))
      setLeft(l)
      if (l === 0) { clearInterval(clock); onOver(score.current) }
    }, 200)
    return () => { timers.forEach(clearTimeout); clearInterval(clock) }
  }, [playing, onOver])
  const hit = (i) => {
    const m = holes[i]
    if (!playing || !m) return
    setHoles((h) => Object.assign([...h], { [i]: null }))
    score.current = Math.max(0, score.current + (m.bomb ? -3 : 1))
    onScore(score.current)
    setPops((p) => [...p.slice(-6), { id: m.id, i, txt: m.bomb ? '−3' : '+1', bad: m.bomb }])
    if (m.bomb) { setShake((s) => s + 1); sfx('explode') } else sfx('reveal')
  }
  return (
    <div className="mx-auto max-w-[420px]">
      <div className="mb-3 h-2 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className="h-full bg-neon-cyan" animate={{ width: `${(left / MOLE_TIME) * 100}%` }} transition={{ duration: 0.2 }} /></div>
      <motion.div key={shake} animate={shake ? lossShake.animate : undefined} transition={lossShake.transition} className="grid grid-cols-3 gap-3">
        {holes.map((m, i) => (
          <button key={i} type="button" onPointerDown={() => hit(i)} className="relative aspect-square overflow-hidden rounded-[40%] bg-gradient-to-b from-amber-950 to-stone-900 shadow-[inset_0_10px_18px_rgba(0,0,0,0.6)] ring-1 ring-black/40">
            <AnimatePresence>
              {m && (
                <motion.span key={m.id} initial={{ y: '90%' }} animate={{ y: '12%' }} exit={{ y: '95%', transition: { duration: 0.12 } }} transition={{ type: 'spring', duration: 0.35, bounce: 0.45 }}
                  className="absolute inset-x-[14%] bottom-0 grid h-[86%] place-items-start justify-center rounded-t-full pt-[18%] text-4xl sm:text-5xl" style={{ background: m.bomb ? 'linear-gradient(#475569,#1e293b)' : 'linear-gradient(#a16207,#713f12)' }}>
                  {m.bomb ? <Bomb className="h-10 w-10 text-neon-red" /> : '🐹'}
                </motion.span>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {pops.filter((p) => p.i === i).map((p) => (
                <motion.span key={p.id} initial={{ y: 0, opacity: 1, scale: 0.8 }} animate={{ y: -50, opacity: 0, scale: 1.3 }} transition={{ duration: 0.6 }} onAnimationComplete={() => setPops((x) => x.filter((q) => q.id !== p.id))}
                  className={clsx('pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 font-display text-2xl font-black', p.bad ? 'text-neon-red' : 'text-neon-green')}>{p.txt}</motion.span>
              ))}
            </AnimatePresence>
          </button>
        ))}
      </motion.div>
      <p className="mt-3 text-center font-mono text-sm font-bold text-slate-300">{left}s</p>
    </div>
  )
}

// ───────────────────────────── Slice ─────────────────────────────
const FRUITS = ['🍉', '🍊', '🍎', '🍍', '🥝', '🍋', '🍑']
function Slice({ playing, onScore, onOver }) {
  const cv = useRef(null)
  const st = useRef({ items: [], halves: [], trail: [], score: 0, miss: 0, alive: true, next: 0, splats: [] })
  useEffect(() => {
    const s = { items: [], halves: [], trail: [], score: 0, miss: 0, alive: true, next: 0, splats: [] }
    st.current = s
    const ctx = cv.current.getContext('2d')
    let raf; let last = performance.now()
    const W = 640; const H = 480
    const loop = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000); last = now
      if (playing && s.alive && now > s.next) {
        const n = 1 + Math.floor(Math.random() * Math.min(4, 1 + s.score / 12))
        for (let k = 0; k < n; k++) s.items.push({ x: 80 + Math.random() * (W - 160), y: H + 30, vx: (Math.random() - 0.5) * 220, vy: -(560 + Math.random() * 160), r: 30, rot: 0, vr: (Math.random() - 0.5) * 6, bomb: Math.random() < 0.1, f: FRUITS[Math.floor(Math.random() * FRUITS.length)] })
        s.next = now + Math.max(520, 1100 - s.score * 12)
      }
      ctx.clearRect(0, 0, W, H)
      for (const sp of s.splats) { ctx.globalAlpha = Math.max(0, sp.a); ctx.fillStyle = sp.c; ctx.beginPath(); ctx.arc(sp.x, sp.y, sp.r, 0, Math.PI * 2); ctx.fill(); sp.a -= dt * 0.8 }
      ctx.globalAlpha = 1
      s.splats = s.splats.filter((p) => p.a > 0)
      for (const it of s.items) {
        it.vy += 900 * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt
        ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot); ctx.font = '56px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(it.bomb ? '💣' : it.f, 0, 0); ctx.restore()
        if (it.y > H + 60 && it.vy > 0 && !it.gone) { it.gone = true; if (!it.bomb && playing && s.alive) { s.miss++; if (s.miss >= 3) { s.alive = false; onOver(s.score) } } }
      }
      s.items = s.items.filter((i) => !i.gone)
      for (const h of s.halves) {
        h.vy += 900 * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(h.rot); ctx.beginPath(); ctx.rect(h.side < 0 ? -40 : 0, -40, 40, 80); ctx.clip()
        ctx.font = '56px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(h.f, 0, 0); ctx.restore()
      }
      s.halves = s.halves.filter((h) => h.y < H + 80)
      s.trail = s.trail.filter((p) => now - p.t < 140)
      if (s.trail.length > 1) {
        ctx.lineCap = 'round'
        for (let i = 1; i < s.trail.length; i++) { ctx.strokeStyle = `rgba(186,230,253,${i / s.trail.length})`; ctx.lineWidth = 2 + (i / s.trail.length) * 6; ctx.beginPath(); ctx.moveTo(s.trail[i - 1].x, s.trail[i - 1].y); ctx.lineTo(s.trail[i].x, s.trail[i].y); ctx.stroke() }
      }
      ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#f87171'; ctx.textAlign = 'right'; ctx.fillText('✕'.repeat(s.miss) + '·'.repeat(3 - s.miss), W - 14, 30)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, onOver])
  const move = (e) => {
    const s = st.current
    if (!playing || !s.alive || !(e.buttons || e.pointerType === 'touch')) return
    const r = cv.current.getBoundingClientRect()
    const p = { x: ((e.clientX - r.left) / r.width) * 640, y: ((e.clientY - r.top) / r.height) * 480, t: performance.now() }
    const prev = s.trail[s.trail.length - 1]
    s.trail.push(p)
    if (!prev) return
    for (const it of s.items) {
      if (it.gone) continue
      const dx = p.x - prev.x; const dy = p.y - prev.y; const L = dx * dx + dy * dy || 1
      const k = Math.max(0, Math.min(1, ((it.x - prev.x) * dx + (it.y - prev.y) * dy) / L))
      if (Math.hypot(prev.x + k * dx - it.x, prev.y + k * dy - it.y) < it.r) {
        it.gone = true
        if (it.bomb) { s.alive = false; sfx('explode'); onOver(s.score); return }
        s.score++; onScore(s.score); sfx('reveal')
        for (const side of [-1, 1]) s.halves.push({ x: it.x, y: it.y, vx: it.vx + side * 120, vy: it.vy * 0.4 - 80, rot: it.rot, vr: side * 4, f: it.f, side })
        s.splats.push({ x: it.x, y: it.y, r: 26, a: 0.5, c: ['#f43f5e', '#fb923c', '#facc15', '#4ade80'][Math.floor(Math.random() * 4)] })
      }
    }
  }
  return (
    <canvas ref={cv} width={640} height={480} onPointerMove={move} onPointerDown={(e) => { st.current.trail = []; move(e) }}
      className="mx-auto block aspect-[4/3] w-full max-w-[640px] touch-none rounded-xl bg-[radial-gradient(circle_at_50%_30%,#1e293b,#0b0f19)] ring-1 ring-white/10" />
  )
}

// ───────────────────────────── Layer ─────────────────────────────
const LW = 300
const LH = 22
function Layer({ playing, onScore, onOver }) {
  const [stack, setStack] = useState([{ x: 50, w: 200, hue: 190 }])
  const [cur, setCur] = useState(null) // { x, w, dir, speed }
  const [chips, setChips] = useState([])
  const [perfect, setPerfect] = useState(0)
  const curRef = useRef(null)
  useEffect(() => {
    if (!playing) return
    const top = { x: 0, w: 200, dir: 1, speed: 160 }
    curRef.current = top
    setCur({ ...top })
    let raf; let last = performance.now()
    const loop = (now) => {
      const c = curRef.current
      if (c) {
        c.x += c.dir * c.speed * ((now - last) / 1000)
        if (c.x <= -c.w * 0.4) { c.x = -c.w * 0.4; c.dir = 1 }
        if (c.x + c.w >= LW + c.w * 0.4) { c.x = LW + c.w * 0.4 - c.w; c.dir = -1 }
        setCur({ ...c })
      }
      last = now
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])
  const drop = () => {
    const c = curRef.current
    if (!playing || !c) return
    const below = stack[stack.length - 1]
    let x = c.x; let w = c.w
    if (Math.abs(x - below.x) < 5) { x = below.x; setPerfect((p) => p + 1); sfx('levelup') } else sfx('reveal')
    const l = Math.max(x, below.x); const r = Math.min(x + w, below.x + below.w)
    if (r - l <= 0) { curRef.current = null; setChips((ch) => [...ch, { id: Date.now(), x, w, y: stack.length }]); onOver(stack.length - 1); return }
    if (x < below.x) setChips((ch) => [...ch.slice(-4), { id: Date.now(), x, w: below.x - x, y: stack.length }])
    if (x + w > below.x + below.w) setChips((ch) => [...ch.slice(-4), { id: Date.now() + 1, x: below.x + below.w, w: x + w - below.x - below.w, y: stack.length }])
    const next = [...stack, { x: l, w: r - l, hue: (below.hue + 9) % 360 }]
    setStack(next)
    onScore(next.length - 1)
    curRef.current = { x: next.length % 2 ? -(r - l) * 0.4 : LW, w: r - l, dir: next.length % 2 ? 1 : -1, speed: Math.min(420, 160 + next.length * 9) }
  }
  const shift = Math.max(0, stack.length - 9) * LH
  return (
    <button type="button" onPointerDown={drop} className="relative mx-auto block h-[380px] w-full max-w-[300px] overflow-hidden rounded-xl bg-gradient-to-b from-indigo-950 to-ink-950 ring-1 ring-white/10" style={{ width: LW }}>
      <motion.div className="absolute inset-0" animate={{ y: shift }} transition={{ type: 'spring', duration: 0.5, bounce: 0.2 }}>
        {stack.map((b, i) => (
          <motion.div key={i} initial={i ? { scaleY: 0.4 } : false} animate={{ scaleY: 1 }} transition={{ type: 'spring', duration: 0.35, bounce: 0.5 }}
            className="absolute rounded-[3px]" style={{ left: b.x, width: b.w, height: LH - 2, bottom: 20 + i * LH, background: `linear-gradient(180deg,hsl(${b.hue} 80% 62%),hsl(${b.hue} 70% 45%))` }} />
        ))}
        {cur && playing && (
          <div className="absolute rounded-[3px] shadow-[0_0_16px_rgba(255,255,255,0.25)]" style={{ left: cur.x, width: cur.w, height: LH - 2, bottom: 20 + stack.length * LH, background: `hsl(${(stack[stack.length - 1].hue + 9) % 360} 85% 66%)` }} />
        )}
        <AnimatePresence>
          {chips.map((c) => (
            <motion.div key={c.id} initial={{ y: 0, rotate: 0, opacity: 1 }} animate={{ y: 300, rotate: c.x < 150 ? -40 : 40, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeIn' }}
              className="absolute rounded-[3px] bg-white/40" style={{ left: c.x, width: c.w, height: LH - 2, bottom: 20 + c.y * LH }} />
          ))}
        </AnimatePresence>
      </motion.div>
      <AnimatePresence>
        {perfect > 0 && <motion.span key={perfect} initial={{ opacity: 1, y: 0, scale: 0.8 }} animate={{ opacity: 0, y: -30, scale: 1.2 }} transition={{ duration: 0.7 }} className="absolute left-1/2 top-10 -translate-x-1/2 font-display text-lg font-black text-neon-gold">PERFECT</motion.span>}
      </AnimatePresence>
    </button>
  )
}

const GAMES = { snake: Snake, moles: Moles, slice: Slice, layer: Layer }
