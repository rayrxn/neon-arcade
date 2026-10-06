import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { Rocket, Users } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import { BetInput, useBetCurrency, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { CRASH_K, CRASH_MIN_CASHOUT, crashCashout, crashMultiplierAt, crashStart, crashTick, openRound } from '@/services/games'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useProgress } from '@/store/useProgressStore'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'
import { drawFrame, makeParticles, themeColors } from './crashCanvas'
import CrashGlobal from './CrashGlobal'
import { SERVER_MODE } from '@/config/runtime'

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

export default function Crash(props) {
  return SERVER_MODE ? <CrashGlobal {...props} /> : <CrashLocal {...props} />
}

function CrashLocal({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const user = useCurrentUser()
  const progress = useProgress(user?.id)
  const [bet, setBet] = useState(100)
  const currency = useBetCurrency()
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

  const start = async () => {
    const res = await run(() => crashStart({ bet, autoCashout: auto ? Number(auto) : null }))
    if (!res) return
    setEnd(null)
    setOutcome(null)
    setLive(1)
    Object.assign(state.current, { round: res, active: true, end: null, elapsed: 0, multiplier: 1 })
    setRound(res)
  }

  const cashout = async () => {
    if (!round || state.current.multiplier < CRASH_MIN_CASHOUT) return
    const res = await run(() => crashCashout(round.id))
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
          <Button size="lg" variant="gold" className="w-full" onClick={cashout} disabled={live < CRASH_MIN_CASHOUT}>
            <span className="flex w-full items-center justify-between">
              <span>{live < CRASH_MIN_CASHOUT ? t('play.crash.cashoutFrom', { min: CRASH_MIN_CASHOUT.toFixed(2) }) : t('play.crash.cashout')}</span>
              <span className="num font-mono">{formatCoins(potential)} {round?.currency ?? currency}</span>
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
