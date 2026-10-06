import { useEffect, useRef, useState } from 'react'
import { motion, useAnimationControls } from 'framer-motion'
import { Clock3, Rocket, ShieldCheck, Users } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import { BetInput, useBetCurrency, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { CRASH_K, CRASH_MIN_CASHOUT, crashGlobalBet, crashGlobalCashout, crashGlobalResult, crashGlobalState, crashMultiplierAt } from '@/services/games'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'
import { drawFrame, makeParticles, themeColors } from './crashCanvas'

const POLL = { betting: 1000, flying: 450, crashed: 900 }

/**
 * Crash global: one shared round for everyone. Betting window → rocket leaves for all players at the
 * same moment → crash point revealed when it explodes → short pause → next round.
 */
export default function CrashGlobal({ game }) {
  const { t } = useT()
  const { run, busy } = useRunner()
  const me = useCurrentUser()
  const users = useAuthStore((s) => s.users)
  const currency = useBetCurrency()
  const [bet, setBet] = useState(100)
  const [auto, setAuto] = useState('')
  const [st, setSt] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [queued, setQueued] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const canvasRef = useRef(null)
  const draw = useRef({ elapsed: 0, multiplier: 1, active: false, end: null, particles: [] })
  const settledFor = useRef(null)
  const shake = useAnimationControls()

  // Poll the shared round.
  useEffect(() => {
    let alive = true
    let timer
    const tick = async () => {
      try {
        const s = await crashGlobalState()
        if (!alive) return
        setSt(s)
        timer = setTimeout(tick, POLL[s.round.phase] ?? 1000)
      } catch {
        if (alive) timer = setTimeout(tick, 2500)
      }
    }
    tick()
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [])

  const round = st?.round
  const crashed = round?.point != null
  const phase = !round ? 'loading' : crashed ? 'crashed' : now < round.startAt ? 'betting' : 'flying'
  const mine = st?.bets?.find((b) => b.userId === me?.id) ?? null
  const live = phase === 'flying' ? Math.max(1, crashMultiplierAt(now - round.startAt)) : crashed ? round.point : 1

  // Render loop: canvas + clock.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let colors = themeColors(canvas)
    let frames = 0
    let raf
    const loop = () => {
      const tnow = Date.now()
      if (++frames % 6 === 0) setNow(tnow)
      if (frames % 120 === 0) colors = themeColors(canvas)
      drawFrame(canvas, draw.current, colors)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Keep the drawing state in sync with the round.
  useEffect(() => {
    const d = draw.current
    if (!round) return
    if (phase === 'flying') {
      d.active = true
      d.end = null
      d.elapsed = now - round.startAt
      d.multiplier = live
    } else if (phase === 'crashed') {
      if (!d.end || d.end.round !== round.id) {
        d.active = false
        d.multiplier = round.point
        d.elapsed = (Math.log(Math.max(1.0001, round.point)) / CRASH_K) * 1000
        d.end = { crashed: true, point: round.point, at: performance.now(), round: round.id }
        d.particles = canvasRef.current ? makeParticles(themeColors(canvasRef.current)) : []
        play('explode')
        shake.start({ x: [0, -10, 8, -5, 3, 0], transition: { duration: 0.45 } })
      }
    } else {
      d.active = false
      d.end = null
      d.elapsed = 0
      d.multiplier = 1
    }
  }, [phase, now, round?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // When my round ends without a manual cash-out, fetch the settled result (balance, history, XP).
  useEffect(() => {
    if (phase !== 'crashed' || !mine || settledFor.current === round.id) return
    settledFor.current = round.id
    if (outcome?.round === round.id) return
    const id = st.mySession
    if (!id && mine.payout == null) return
    ;(id ? crashGlobalResult(id) : Promise.resolve(null)).then((res) => {
      if (res?.session) {
        setOutcome({ ...res, round: round.id })
        playOutcome(res)
      }
    }).catch(() => {})
  }, [phase, round?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Queued "bet next round": place it as soon as the next betting window opens.
  useEffect(() => {
    if (!queued || phase !== 'betting' || mine) return
    setQueued(false)
    placeBet()
  }, [queued, phase, round?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function placeBet() {
    const res = await run(() => crashGlobalBet({ bet, autoCashout: auto ? Number(auto) : null }))
    if (res) {
      setOutcome(null)
      setSt((s) => (s ? { ...s, mySession: res.id, bets: [{ userId: me.id, username: me.username, bet: res.bet, currency: res.currency, cashedAt: null, payout: null, auto: res.autoCashout }, ...s.bets.filter((b) => b.userId !== me.id)] } : s))
    }
  }

  async function cashout() {
    if (!st?.mySession || live < CRASH_MIN_CASHOUT) return
    const res = await run(() => crashGlobalCashout(st.mySession, round.startAt))
    if (res?.session) {
      play('reward')
      setOutcome({ ...res, round: round.id })
      if (!res.crashed) playOutcome(res)
      setSt((s) => (s ? { ...s, bets: s.bets.map((b) => (b.userId === me.id ? { ...b, cashedAt: res.cashedAt ?? null, payout: res.session.payout } : b)) } : s))
    }
  }

  // Space = bet / cash out.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== 'Space' || ['INPUT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) return
      e.preventDefault()
      if (phase === 'flying' && mine && mine.cashedAt == null) cashout()
      else if (phase === 'betting' && !mine) placeBet()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const inRound = !!mine
  const canCash = phase === 'flying' && inRound && mine.cashedAt == null && !!st?.mySession
  const secs = (ms) => Math.max(0, ms / 1000).toFixed(1)

  let action
  if (canCash) {
    action = (
      <Button size="lg" variant="gold" className="w-full" onClick={cashout} disabled={live < CRASH_MIN_CASHOUT || busy}>
        <span className="flex w-full items-center justify-between">
          <span>{live < CRASH_MIN_CASHOUT ? t('play.crash.cashoutFrom', { min: CRASH_MIN_CASHOUT.toFixed(2) }) : t('play.crash.cashout')}</span>
          <span className="num font-mono">{formatCoins(Math.floor(mine.bet * live))} {mine.currency}</span>
        </span>
      </Button>
    )
  } else if (phase === 'betting' && !inRound) {
    action = <Button size="lg" className="w-full" loading={busy} onClick={placeBet}><Rocket className="h-4 w-4" /> {t('crashg.bet', { s: secs(round.startAt - now) })}</Button>
  } else if (phase === 'betting' && inRound) {
    action = <Button size="lg" className="w-full" disabled><Clock3 className="h-4 w-4" /> {t('crashg.waiting', { s: secs(round.startAt - now) })}</Button>
  } else {
    action = (
      <Button size="lg" variant={queued ? 'ghost' : 'primary'} className="w-full" onClick={() => setQueued((q) => !q)}>
        {queued ? t('crashg.queued') : t('crashg.next')}
      </Button>
    )
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={inRound && phase !== 'crashed'} />
      <Field label={t('play.crash.auto')} hint={t('play.optional')}>
        <div className="input-shell flex items-center px-3">
          <input id="crash-auto" inputMode="decimal" placeholder="2.00" value={auto} disabled={inRound && phase !== 'crashed'} onChange={(e) => setAuto(e.target.value.replace(/[^0-9.]/g, ''))} className="num h-11 min-w-0 flex-1 bg-transparent font-mono font-bold text-white outline-none placeholder:text-slate-600" />
          <span className="font-mono text-sm text-slate-500">×</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {['1.5', '2', '3', '5', '10'].map((v) => (
            <button key={v} disabled={inRound && phase !== 'crashed'} onClick={() => setAuto(v)} className="h-7 flex-1 rounded-lg bg-white/[0.05] text-[11px] font-bold text-slate-300 transition hover:bg-white/[0.09] disabled:opacity-40">{v}×</button>
          ))}
        </div>
      </Field>
      {action}
      <p className="text-xs leading-relaxed text-slate-500">{t('crashg.hint', { currency })}</p>
    </>
  )

  const history = st?.history ?? []
  const bets = st?.bets ?? []
  const stage = (
    <motion.div animate={shake} className="space-y-3">
      <Stage>
        <div className="flex items-center gap-1.5 overflow-x-auto border-b hairline px-3 py-2 scrollbar-none">
          {history.length === 0 && <span className="text-xs text-slate-500">{t('play.noRounds')}</span>}
          {history.slice(0, 16).map((h) => (
            <span key={h.id} title={`#${h.id}`} className={clsx('shrink-0 rounded-md px-2 py-0.5 font-mono text-[11px] font-bold', h.point >= 10 ? 'bg-neon-gold/15 text-neon-gold' : h.point >= 2 ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-red/10 text-neon-red')}>{fmtMult(h.point)}</span>
          ))}
        </div>
        <div className="relative h-[300px] sm:h-[380px]">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              {phase === 'betting' ? (
                <>
                  <p className="label-caps text-slate-400">{t('crashg.startsIn')}</p>
                  <p className="num mt-1 font-mono text-6xl font-bold text-white sm:text-7xl">{secs(round.startAt - now)}s</p>
                  <p className="mt-2 text-sm text-slate-400">{t('crashg.players', { n: bets.length })}</p>
                </>
              ) : (
                <>
                  <p className={clsx('num font-mono text-6xl font-bold sm:text-8xl', phase === 'crashed' ? 'text-neon-red' : 'text-white')}>{fmtMult(live)}</p>
                  {phase === 'crashed' && <p className="mt-2 text-sm font-semibold text-neon-red">{t('crashg.crashed')}{round.nextAt ? ` · ${t('crashg.nextIn', { s: secs(round.nextAt - now) })}` : ''}</p>}
                  {phase === 'flying' && mine?.cashedAt && <p className="mt-2 text-sm font-semibold text-neon-green">{t('crashg.youCashed', { m: fmtMult(mine.cashedAt), amount: formatCoins(mine.payout ?? 0), currency: mine.currency })}</p>}
                  {phase === 'loading' && <p className="text-sm text-slate-500">…</p>}
                </>
              )}
            </div>
          </div>
        </div>
        {round && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t hairline px-3 py-2 text-[11px] text-slate-500">
            <span>{t('crashg.round', { id: round.id })}</span>
            <span className="flex min-w-0 items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-neon-green" /> <span className="truncate font-mono">{phase === 'crashed' && round.seed ? `seed ${round.seed.slice(0, 16)}…` : `hash ${round.seedHash.slice(0, 16)}…`}</span></span>
          </div>
        )}
      </Stage>

      <section className="glass rounded-2xl">
        <header className="flex items-center justify-between border-b hairline px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-white"><Users className="h-4 w-4 text-slate-400" /> {t('crashg.inRound')}</h3>
          <span className="text-xs text-slate-500">{bets.length}</span>
        </header>
        {bets.length === 0 ? (
          <p className="px-4 py-5 text-center text-sm text-slate-500">{t('crashg.empty')}</p>
        ) : (
          <ul className="max-h-72 divide-y divide-white/[0.04] overflow-y-auto">
            {bets.map((b) => {
              const u = Object.values(users).find((x) => x.id === b.userId)
              const lost = phase === 'crashed' && b.cashedAt == null
              return (
                <li key={b.userId} className={clsx('flex items-center gap-3 px-4 py-2 text-sm', b.userId === me?.id && 'bg-neon-cyan/[0.04]')}>
                  <Avatar user={u ?? { username: b.username }} name={b.username} size="xs" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-slate-200">{u?.displayName ?? b.username}</span>
                  <span className="num font-mono text-xs text-slate-400">{formatCoins(b.bet)} {b.currency}</span>
                  <span className={clsx('num w-24 text-right font-mono text-xs font-bold', b.cashedAt ? 'text-neon-green' : lost ? 'text-neon-red' : 'text-slate-500')}>
                    {b.cashedAt ? `${fmtMult(b.cashedAt)} · +${formatCoins(b.payout ?? 0)}` : lost ? t('crashg.lost') : b.auto ? t('crashg.auto', { m: fmtMult(b.auto) }) : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </motion.div>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome?.session ? outcome : null} />
}
