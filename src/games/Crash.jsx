import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { Rocket, Users } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import { BetInput, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { CRASH_K, crashCashout, crashMultiplierAt, crashStart, crashTick, openRound } from '@/services/games'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useProgress } from '@/store/useProgressStore'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

/** Warna dari token tema (canvas tidak bisa membaca kelas Tailwind). */
function themeColors(el) {
  const css = getComputedStyle(el)
  const v = (name) => `rgb(${css.getPropertyValue(name).trim().split(' ').join(',')})`
  const a = (name, alpha) => `rgba(${css.getPropertyValue(name).trim().split(' ').join(',')},${alpha})`
  return { cyan: v('--neon-cyan'), cyanA: (x) => a('--neon-cyan', x), red: v('--neon-red'), redA: (x) => a('--neon-red', x), green: v('--neon-green'), grid: a('--white', 0.06), label: a('--white', 0.35) }
}

/** Skala sumbu yang "rapi" (1×, 1.5×, 2×, 5×, 10× …). */
function niceStep(range) {
  const raw = range / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow
}

/**
 * Menggambar ronde Crash di canvas: grid & label bersekala, area gradasi,
 * garis dengan glow, roket di ujung, dan partikel ledakan saat crash.
 */
function drawFrame(canvas, state, colors) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const padL = 44
  const padB = 26
  const padT = 18
  const padR = 18
  const plotW = w - padL - padR
  const plotH = h - padT - padB
  const seconds = Math.max(6, state.elapsed / 1000 * 1.12)
  const current = state.multiplier
  const maxM = Math.max(2, current * 1.2)
  const x = (s) => padL + (s / seconds) * plotW
  const y = (m) => padT + plotH - ((m - 1) / (maxM - 1)) * plotH

  // Grid + label
  ctx.font = '600 11px "JetBrains Mono", monospace'
  ctx.fillStyle = colors.label
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 1
  const mStep = niceStep(maxM - 1)
  for (let m = 1; m <= maxM + 0.001; m += mStep) {
    const yy = Math.round(y(m)) + 0.5
    ctx.beginPath()
    ctx.moveTo(padL, yy)
    ctx.lineTo(w - padR, yy)
    ctx.stroke()
    ctx.textAlign = 'right'
    ctx.fillText(`${m.toFixed(m < 10 ? 1 : 0)}×`, padL - 8, yy + 4)
  }
  const sStep = niceStep(seconds)
  ctx.textAlign = 'center'
  for (let s = 0; s <= seconds; s += sStep) ctx.fillText(`${Math.round(s)}s`, x(s), h - 8)

  if (!state.active && !state.end) return

  const crashed = state.end?.crashed
  const line = crashed ? colors.red : colors.cyan
  const lineA = crashed ? colors.redA : colors.cyanA
  const now = state.elapsed / 1000
  const pts = []
  for (let i = 0; i <= 80; i++) {
    const s = (now * i) / 80
    pts.push([x(s), y(Math.min(current, Math.exp(CRASH_K * s)))])
  }
  const [tx, ty] = pts[pts.length - 1]

  // Area
  const grad = ctx.createLinearGradient(0, ty, 0, padT + plotH)
  grad.addColorStop(0, lineA(0.28))
  grad.addColorStop(1, lineA(0))
  ctx.beginPath()
  ctx.moveTo(pts[0][0], padT + plotH)
  pts.forEach(([px, py]) => ctx.lineTo(px, py))
  ctx.lineTo(tx, padT + plotH)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // Garis + glow
  ctx.save()
  ctx.shadowColor = line
  ctx.shadowBlur = 14
  ctx.strokeStyle = line
  ctx.lineWidth = 3.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
  ctx.stroke()
  ctx.restore()

  // Garis cash out pemain
  if (state.end && !crashed && state.end.cashedAt) {
    const yy = y(state.end.cashedAt)
    ctx.setLineDash([5, 5])
    ctx.strokeStyle = colors.green
    ctx.beginPath()
    ctx.moveTo(padL, yy)
    ctx.lineTo(w - padR, yy)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (crashed) {
    // Ledakan: partikel memudar dari titik crash.
    const t = Math.min(1, (performance.now() - state.end.at) / 900)
    for (const p of state.particles) {
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = p.c
      ctx.beginPath()
      ctx.arc(tx + p.vx * t * 70, ty + p.vy * t * 70 + t * t * 30, p.r * (1 - t * 0.5), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  } else {
    // Roket mengikuti arah kurva.
    const [px, py] = pts[pts.length - 4] ?? pts[0]
    const angle = Math.atan2(ty - py, tx - px)
    ctx.save()
    ctx.translate(tx, ty)
    ctx.rotate(angle)
    const flicker = 6 + Math.random() * 5
    ctx.fillStyle = 'rgba(255,170,60,0.9)'
    ctx.beginPath()
    ctx.moveTo(-10, -3)
    ctx.lineTo(-10 - flicker, 0)
    ctx.lineTo(-10, 3)
    ctx.fill()
    ctx.fillStyle = '#f2f5ff'
    ctx.beginPath()
    ctx.moveTo(12, 0)
    ctx.quadraticCurveTo(4, -7, -10, -5)
    ctx.lineTo(-10, 5)
    ctx.quadraticCurveTo(4, 7, 12, 0)
    ctx.fill()
    ctx.fillStyle = line
    ctx.beginPath()
    ctx.arc(3, 0, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

const makeParticles = (colors) =>
  Array.from({ length: 26 }, () => {
    const a = Math.random() * Math.PI * 2
    const s = 0.4 + Math.random()
    return { vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.5 + Math.random() * 3, c: Math.random() < 0.5 ? colors.red : 'rgba(255,190,90,0.95)' }
  })

/** Pemain lain di ronde ini (bot/demo) — hanya tampilan, cash out acak di bawah titik crash. */
function useCrowd(active, roundId) {
  const users = useAuthStore((s) => s.users)
  const [crowd, setCrowd] = useState([])
  useEffect(() => {
    if (!active) return
    const demo = Object.values(users).filter((u) => u.isDemo).sort(() => Math.random() - 0.5).slice(0, 4)
    setCrowd(demo.map((u) => ({ user: u, bet: [50, 100, 250, 500, 1000][Math.floor(Math.random() * 5)], target: 1.2 + Math.random() * 3, cashed: null })))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundId])
  return [crowd, setCrowd]
}

export default function Crash({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const user = useCurrentUser()
  const progress = useProgress(user?.id)
  const [bet, setBet] = useState(100)
  const [auto, setAuto] = useState('')
  const [round, setRound] = useState(() => openRound('crash'))
  const [live, setLive] = useState(1)
  const [outcome, setOutcome] = useState(null)
  const [end, setEnd] = useState(null)
  const [crowd, setCrowd] = useCrowd(!!round, round?.id)
  const canvasRef = useRef(null)
  const wrapRef = useRef(null)
  const state = useRef({ elapsed: 0, multiplier: 1, active: false, end: null, particles: [] })
  const raf = useRef()
  const shake = useAnimationControls()

  // Satu loop render: menggambar canvas setiap frame dan bertanya ke "server" status ronde.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let colors = themeColors(canvas)
    let frames = 0
    let lastUi = 0
    const loop = (now) => {
      const s = state.current
      if (s.active && s.round) {
        const res = crashTick(s.round.id)
        if (res.done) settle(res)
        else {
          s.elapsed = Date.now() - s.round.startedAt
          s.multiplier = res.multiplier
          if (now - lastUi > 60) {
            lastUi = now
            setLive(res.multiplier)
          }
        }
      }
      if (++frames % 120 === 0) colors = themeColors(canvas)
      drawFrame(canvas, s, colors)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Resume ronde setelah refresh.
  useEffect(() => {
    if (round) Object.assign(state.current, { round, active: true, end: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Bot cash out saat multiplier melewati target masing-masing.
  useEffect(() => {
    if (!round) return
    setCrowd((list) => list.map((p) => (!p.cashed && live >= p.target ? { ...p, cashed: p.target } : p)))
  }, [live, round, setCrowd])

  function settle(res) {
    const s = state.current
    s.active = false
    setRound(null)
    if (res.stale || !res.session) return
    const point = res.crashed ? res.point : res.cashedAt
    s.multiplier = res.crashed ? res.point : Math.max(s.multiplier, res.cashedAt)
    s.elapsed = (Math.log(Math.max(1.0001, s.multiplier)) / CRASH_K) * 1000
    const endInfo = { crashed: res.crashed, point: res.point, cashedAt: res.cashedAt, at: performance.now() }
    s.end = endInfo
    if (res.crashed) s.particles = makeParticles(themeColors(canvasRef.current))
    setEnd(endInfo)
    setLive(point)
    setOutcome(res)
    if (res.crashed) shake.start({ x: [0, -12, 10, -7, 4, 0], y: [0, 4, -3, 2, 0, 0], transition: { duration: 0.5 } })
    else playOutcome(res)
  }

  const start = () => {
    const res = run(() => crashStart({ bet, autoCashout: auto ? Number(auto) : null }))
    if (!res) return
    setEnd(null)
    setOutcome(null)
    setLive(1)
    Object.assign(state.current, { round: res, active: true, end: null, elapsed: 0, multiplier: 1 })
    setRound(res)
  }

  const cashout = () => {
    if (!round) return
    const res = run(() => crashCashout(round.id))
    if (res) {
      play('reward')
      settle(res)
    }
  }

  // Spasi = main / cash out.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || ['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return
      e.preventDefault()
      if (state.current.active) cashout()
      else start()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const history = progress.sessions.filter((s) => s.game === 'crash' && s.detail?.point).slice(0, 14)
  const potential = Math.floor(bet * live)

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={!!round} />
      <Field label={t('play.crash.auto')} hint={t('play.optional')}>
        <div className="input-shell flex items-center px-3">
          <input id="crash-auto" inputMode="decimal" placeholder="2.00" value={auto} disabled={!!round} onChange={(e) => setAuto(e.target.value.replace(/[^0-9.]/g, ''))} className="num h-11 min-w-0 flex-1 bg-transparent font-mono font-bold text-white outline-none placeholder:text-slate-600" />
          <span className="font-mono text-sm text-slate-500">×</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {['1.5', '2', '3', '5', '10'].map((v) => (
            <button key={v} disabled={!!round} onClick={() => setAuto(v)} className="h-7 flex-1 rounded-lg bg-white/[0.05] text-[11px] font-bold text-slate-300 transition hover:bg-white/[0.09] disabled:opacity-40">{v}×</button>
          ))}
        </div>
      </Field>
      {round ? (
        <motion.div initial={{ scale: 0.98 }} animate={{ scale: 1 }}>
          <Button size="lg" variant="gold" className="w-full" onClick={cashout}>
            <span className="flex w-full items-center justify-between">
              <span>{t('play.crash.cashout')}</span>
              <span className="num font-mono">{formatCoins(potential)} AC</span>
            </span>
          </Button>
        </motion.div>
      ) : (
        <Button size="lg" className="w-full" onClick={start}>
          <Rocket className="h-4 w-4" /> {t('play.crash.launch')}
        </Button>
      )}
      <p className="text-xs leading-relaxed text-slate-500">{t('play.crash.hint')}</p>
    </>
  )

  const stage = (
    <motion.div animate={shake} className="space-y-3">
      <Stage>
        <div className="flex items-center gap-1.5 overflow-x-auto border-b hairline px-3 py-2 scrollbar-none">
          {history.length === 0 && <span className="text-xs text-slate-500">{t('play.noRounds')}</span>}
          {history.map((s) => (
            <span key={s.id} className={clsx('shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold', s.detail.point >= 10 ? 'bg-neon-gold/15 text-neon-gold' : s.detail.point >= 2 ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-red/10 text-neon-red')}>
              {fmtMult(s.detail.point)}
            </span>
          ))}
        </div>
        <div ref={wrapRef} className="relative">
          <canvas ref={canvasRef} className="block h-[260px] w-full sm:h-[340px]" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <motion.p
                key={end ? `end-${end.at}` : 'live'}
                initial={end ? { scale: 1.25 } : false}
                animate={{ scale: 1 }}
                className={clsx('num font-mono text-5xl font-bold tracking-tight drop-shadow-lg sm:text-7xl', end?.crashed ? 'text-neon-red' : end ? 'text-neon-green' : round ? 'text-white' : 'text-slate-600')}
              >
                {fmtMult(end ? (end.crashed ? end.point : end.cashedAt) : live)}
              </motion.p>
              <p className={clsx('mt-1 h-5 text-sm font-semibold', end?.crashed ? 'text-neon-red' : end ? 'text-neon-green' : 'text-slate-400')}>
                {end?.crashed ? t('play.crash.crashed', { point: fmtMult(end.point) }) : end ? `${t('play.crash.cashedAt', { point: fmtMult(end.cashedAt) })} · +${formatCoins(Math.floor(outcome.session.payout - outcome.session.bet))} AC` : round ? t('play.crash.running') : t('play.crash.ready')}
              </p>
            </div>
          </div>
        </div>
      </Stage>

      {(round || end) && crowd.length > 0 && (
        <Stage className="px-4 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400"><Users className="h-3.5 w-3.5" /> {t('play.crash.players')}</p>
          <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {crowd.map((p) => {
              const busted = end?.crashed ? !p.cashed || p.cashed > end.point : false
              return (
                <li key={p.user.id} className="flex items-center gap-2 text-sm">
                  <Avatar user={p.user} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-slate-300">{p.user.username}</span>
                  <span className="num font-mono text-xs text-slate-500">{formatCoins(p.bet)}</span>
                  <span className={clsx('num w-16 text-right font-mono text-xs font-bold', p.cashed && !busted ? 'text-neon-green' : busted ? 'text-neon-red' : 'text-slate-500')}>
                    {p.cashed && !busted ? fmtMult(p.cashed) : busted ? '—' : '…'}
                  </span>
                </li>
              )
            })}
          </ul>
        </Stage>
      )}
    </motion.div>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}

export { crashMultiplierAt }
