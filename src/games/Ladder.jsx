import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bird, Bomb, Car, Gem } from 'lucide-react'
import clsx from 'clsx'
import { spring } from '@/lib/motion'
import Button from '@/components/ui/Button'
import { BetInput, Choice, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { ladderCashout, ladderStart, ladderStep, openRound } from '@/services/games'
import { LADDER, ladderMult } from '@/config/games2'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

/** One engine, three games: Tower (pick a tile per floor), Cross the Road (lane by lane), Pump (inflate until it pops). */
export default function Ladder({ game }) {
  const slug = game.slug
  const cfg = LADDER[slug]
  const { t } = useT()
  const { run } = useRunner()
  const resumed = openRound(slug)
  const [bet, setBet] = useState(resumed?.bet ?? 100)
  const [mode, setMode] = useState(resumed?.mode ?? Object.keys(cfg.modes)[1])
  const [round, setRound] = useState(resumed) // { id, mode, step, path }
  const [end, setEnd] = useState(null) // { lost, step, path, layout | failAt }
  const [outcome, setOutcome] = useState(null)
  const [pumps, setPumps] = useState(0) // bumps the balloon squash animation on every pump

  const live = round ?? null
  const step = live?.step ?? end?.step ?? 0
  const m = live?.mode ?? mode
  const current = ladderMult(slug, m, live?.step ?? 0)
  const next = ladderMult(slug, m, (live?.step ?? 0) + 1)

  const finish = (res) => {
    setRound(null)
    setEnd(res)
    setOutcome(res)
    if (!res.lost) playOutcome(res)
  }
  const start = async () => {
    const res = await run(() => ladderStart(slug, { bet, mode }))
    if (!res) return
    setEnd(null)
    setOutcome(null)
    setRound(res)
  }
  const advance = async (pick) => {
    if (!live) return
    setPumps((n) => n + 1)
    const res = await run(() => ladderStep(slug, live.id, pick))
    if (!res) return
    if (res.done) finish(res)
    else setRound(res)
  }
  const cashout = async () => {
    if (!live) return
    const res = await run(() => ladderCashout(slug, live.id))
    if (res?.done) finish(res)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={!!live} />
      <Field label={t('play.ladder.mode')}>
        <Choice options={Object.keys(cfg.modes).map((k) => ({ value: k, label: t(`play.ladder.modes.${k}`) }))} value={m} onChange={setMode} disabled={!!live} />
      </Field>
      {live ? (
        <div className="grid gap-2">
          {slug !== 'tower' && (
            <Button size="lg" className="w-full" onClick={() => advance(null)}>{t(`play.ladder.go.${slug}`)} · {fmtMult(next)}</Button>
          )}
          <Button size="lg" variant="gold" className="w-full" onClick={cashout}>
            {live.step ? `${t('play.crash.cashout')} · ${formatCoins(Math.floor(bet * current))} AC` : t('play.mines.cancel')}
          </Button>
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={start}>{t('play.play')}</Button>
      )}
      <dl className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-white/[0.03] py-2 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('play.multiplier')}</dt>
          <dd className="num font-mono text-sm font-bold text-white">{fmtMult(current)}</dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] py-2 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('play.mines.next')}</dt>
          <dd className="num font-mono text-sm font-bold text-neon-green">{fmtMult(next)}</dd>
        </div>
      </dl>
    </>
  )

  const stage = (
    <Stage className="p-4 sm:p-6">
      <div key={end?.lost ? `lost-${end.step}` : 'play'} className={clsx(end?.lost && 'na-shake')}>
        {slug === 'tower' && <TowerBoard cfg={cfg} mode={m} live={live} end={end} onPick={advance} />}
        {slug === 'cross' && <RoadBoard cfg={cfg} mode={m} live={live} end={end} />}
        {slug === 'pump' && <Balloon mode={m} step={step} live={live} end={end} pumps={pumps} />}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">{live ? t(`play.ladder.hint.${slug}`) : end?.lost ? t('play.ladder.lost', { step: end.step + 1 }) : t('play.ladder.idle')}</p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}

function TowerBoard({ cfg, mode, live, end, onPick }) {
  const { cols, one } = cfg.modes[mode]
  const path = live?.path ?? end?.path ?? []
  const active = live ? live.step : -1
  const climbed = live ? live.step : end ? end.step : 0
  return (
    <div className="relative mx-auto flex max-w-[380px] flex-col-reverse gap-1.5">
      {Array.from({ length: cfg.steps }, (_, row) => {
        const special = end?.layout?.[row]
        const isActive = row === active
        const past = row < climbed
        return (
          <motion.div key={row} className="flex items-center gap-2" animate={{ opacity: !live && !end ? 0.7 : row > active && live ? 0.55 : 1 }}>
            <span className={clsx('num w-14 shrink-0 text-right font-mono text-[11px] transition-colors', isActive ? 'font-bold text-neon-cyan' : past ? 'text-neon-green' : 'text-slate-500')}>
              {fmtMult(ladderMult('tower', mode, row + 1))}
            </span>
            <div className={clsx('grid flex-1 gap-1.5 rounded-lg p-0.5 transition-colors', isActive && 'bg-neon-cyan/[0.06] ring-1 ring-inset ring-neon-cyan/30')} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: cols }, (_, c) => {
                const chosen = path[row] === c
                const known = special != null
                const isBomb = known && (one === 'bomb' ? special === c : special !== c)
                const show = known || (chosen && past)
                return (
                  <motion.button
                    key={c}
                    whileHover={isActive ? { y: -2 } : undefined}
                    whileTap={isActive ? { scale: 0.9 } : undefined}
                    disabled={!isActive}
                    onClick={() => onPick(c)}
                    className="na-3d relative h-10 [perspective:600px]"
                  >
                    <motion.span
                      className="na-3d absolute inset-0"
                      initial={false}
                      animate={{ rotateX: show ? 180 : 0 }}
                      transition={spring(0.55, 0.3, known && !chosen ? 0.04 * (row + c) : 0)}
                    >
                      <span className={clsx('na-back absolute inset-0 rounded-lg ring-1 ring-inset', isActive ? 'bg-gradient-to-b from-violet-500/30 to-violet-700/20 ring-violet-300/40' : 'bg-white/[0.05] ring-white/[0.07]')} />
                      <span
                        className={clsx('na-back absolute inset-0 grid place-items-center rounded-lg ring-1 ring-inset [transform:rotateX(180deg)]',
                          isBomb ? (chosen ? 'bg-neon-red/35 ring-neon-red' : 'bg-neon-red/10 ring-neon-red/30') : chosen ? 'bg-neon-green/20 ring-neon-green/60' : 'bg-white/[0.04] ring-white/10')}
                      >
                        {isBomb ? <Bomb className="h-4 w-4 text-neon-red" /> : <Gem className={clsx('h-4 w-4', chosen ? 'text-neon-green' : 'text-slate-500')} />}
                      </span>
                    </motion.span>
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

const LANE_SPEED = [2.4, 1.7, 2.9, 2.0, 1.5, 2.6, 1.9, 3.2]
const CAR_COLORS = ['#ef4444', '#3b82f6', '#f59e0b', '#a855f7', '#10b981', '#ec4899', '#f97316', '#06b6d4']
const LANE_W = 78
const SIDE_W = 84

/** Top-down car, pointing down (flip for up lanes). */
function CarSvg({ color, className, style }) {
  return (
    <svg viewBox="0 0 40 70" className={className} style={style}>
      <rect x="3" y="2" width="34" height="66" rx="10" fill={color} />
      <rect x="3" y="2" width="34" height="66" rx="10" fill="url(#carShade)" />
      <rect x="8" y="44" width="24" height="14" rx="4" fill="#0f172a" opacity="0.85" />
      <rect x="8" y="14" width="24" height="12" rx="4" fill="#0f172a" opacity="0.7" />
      <rect x="6" y="64" width="8" height="3" rx="1.5" fill="#fef9c3" /><rect x="26" y="64" width="8" height="3" rx="1.5" fill="#fef9c3" />
      <rect x="6" y="3" width="7" height="2.5" rx="1" fill="#fca5a5" /><rect x="27" y="3" width="7" height="2.5" rx="1" fill="#fca5a5" />
    </svg>
  )
}

function ChickenSvg({ className }) {
  return (
    <svg viewBox="0 0 48 48" className={className}>
      <ellipse cx="24" cy="44" rx="13" ry="3" fill="#000" opacity="0.25" />
      <path d="M16 38l-2 5M22 39l-1 5M28 39l1 5M34 38l2 5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" />
      <ellipse cx="24" cy="27" rx="15" ry="13" fill="#f8fafc" />
      <path d="M11 26c-4 2-5 7-2 9 3-1 5-4 6-7z" fill="#e2e8f0" />
      <circle cx="30" cy="16" r="9" fill="#ffffff" />
      <path d="M27 8c1-4 4-5 5-2 2-3 5-1 4 2 3 0 3 4 0 4h-8z" fill="#ef4444" />
      <path d="M38 17l6 2-6 3z" fill="#f59e0b" />
      <path d="M35 22c1 3 0 5-2 5-1-2 0-4 2-5z" fill="#ef4444" />
      <circle cx="32" cy="15" r="1.8" fill="#0f172a" /><circle cx="32.6" cy="14.4" r="0.6" fill="#fff" />
    </svg>
  )
}

function RoadBoard({ cfg, mode, live, end }) {
  const box = useRef(null)
  const [vw, setVw] = useState(640)
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setVw(e.contentRect.width))
    if (box.current) ro.observe(box.current)
    return () => ro.disconnect()
  }, [])
  const pos = live ? live.step : end ? end.step : 0
  const lost = !!end?.lost
  const won = end && !lost && end.step > 0
  const total = SIDE_W * 2 + cfg.steps * LANE_W
  const chickenX = pos === 0 ? SIDE_W / 2 : SIDE_W + (pos - 1) * LANE_W + LANE_W / 2
  const camX = Math.max(0, Math.min(total - vw, chickenX - vw * 0.35))
  return (
    <div ref={box} className="relative h-[230px] overflow-hidden rounded-2xl ring-1 ring-white/10">
      <svg width="0" height="0" className="absolute"><defs><linearGradient id="carShade" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.25" /><stop offset="0.5" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.25" /></linearGradient></defs></svg>
      <motion.div className="absolute inset-y-0 left-0 flex" style={{ width: total }} animate={{ x: -camX }} transition={spring(0.7, 0.15)}>
        <div className="relative h-full bg-gradient-to-b from-emerald-700 to-emerald-900" style={{ width: SIDE_W }}>
          <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_30%,#86efac_2px,transparent_3px),radial-gradient(circle_at_70%_70%,#86efac_2px,transparent_3px)] [background-size:22px_22px]" />
          <div className="absolute inset-y-0 right-0 w-2 bg-slate-300/70" />
        </div>
        {Array.from({ length: cfg.steps }, (_, i) => {
          const crossed = i < pos && !(lost && i === end.step)
          const isNext = live && i === pos
          const crash = lost && i === end.step
          const down = i % 2 === 0
          return (
            <div key={i} className="relative h-full overflow-hidden bg-gradient-to-b from-slate-700 to-slate-800" style={{ width: LANE_W }}>
              <div className="absolute inset-y-0 right-0 w-0 border-r-2 border-dashed border-white/35" />
              <div className={clsx('absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-2 transition-colors',
                crossed ? 'bg-emerald-500/30 ring-emerald-300/70' : isNext ? 'bg-amber-400/20 ring-amber-300 na-glow' : 'bg-black/30 ring-white/15')} style={isNext ? { '--glow': '252 211 77' } : undefined}>
                <span className={clsx('num font-mono text-[10px] font-black', crossed ? 'text-emerald-200' : isNext ? 'text-amber-200' : 'text-slate-300')}>{fmtMult(ladderMult('cross', mode, i + 1))}</span>
              </div>
              {!crossed && !crash && (
                <span className="na-drive absolute left-1/2 -ml-[17px] block" style={{ top: 0, animationDuration: `${LANE_SPEED[i % 8]}s`, animationDelay: `-${(i * 0.53) % 2.4}s`, animationDirection: down ? 'normal' : 'reverse' }}>
                  <CarSvg color={CAR_COLORS[i % 8]} className="h-[60px] w-[34px]" style={{ transform: down ? 'none' : 'rotate(180deg)' }} />
                </span>
              )}
              {crossed && <div className="absolute inset-x-2 top-3 h-2 rounded bg-[repeating-linear-gradient(90deg,#ef4444_0_8px,#fff_8px_16px)] opacity-80" />}
              {crash && (
                <motion.span className="absolute left-1/2 -ml-[19px]" initial={{ top: -90 }} animate={{ top: 70 }} transition={{ duration: 0.22, ease: 'easeIn' }}>
                  <CarSvg color="#ef4444" className="h-[68px] w-[38px]" />
                </motion.span>
              )}
            </div>
          )
        })}
        <div className="relative h-full bg-gradient-to-b from-amber-600 to-amber-800" style={{ width: SIDE_W }}>
          <div className="absolute inset-y-0 left-0 w-2 bg-slate-300/70" />
          <p className="absolute inset-0 grid place-items-center font-display text-sm font-black text-amber-100">🏁</p>
        </div>
        <motion.div className="pointer-events-none absolute top-1/2 z-10 -mt-7" initial={false} animate={{ left: chickenX - 28 }} transition={spring(0.42, 0.2)}>
          <AnimatePresence mode="wait">
            {lost ? (
              <motion.div key="splat" className="relative h-14 w-14">
                {[...Array(10)].map((_, k) => (
                  <motion.span key={k} className="absolute left-1/2 top-1/2 h-3 w-1.5 rounded-full bg-white" initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
                    animate={{ x: Math.cos(k * 0.63) * 46, y: Math.sin(k * 0.63) * 46 - 10, rotate: k * 70, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
                ))}
              </motion.div>
            ) : (
              <motion.div key={`c${pos}`} initial={{ y: 0, scaleY: 1 }} animate={{ y: [0, -26, 0, 0], scaleY: [1, 1.08, 0.82, 1], scaleX: [1, 0.94, 1.14, 1] }} transition={{ duration: 0.42, times: [0, 0.45, 0.8, 1] }}>
                <motion.div animate={won ? { rotate: [0, -10, 10, 0], y: [0, -6, 0] } : { y: [0, -2, 0] }} transition={{ duration: won ? 0.6 : 1.4, repeat: Infinity }}>
                  <ChickenSvg className="h-14 w-14 drop-shadow-[0_6px_6px_rgba(0,0,0,0.4)]" />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </motion.div>
    </div>
  )
}

function Balloon({ mode, step, live, end, pumps }) {
  const popped = !!end?.lost
  const size = 92 + Math.min(step, 25) * 6.5
  const hue = mode === 'expert' ? 'from-rose-300 via-rose-500 to-red-700' : mode === 'hard' ? 'from-amber-200 via-orange-400 to-pink-600' : mode === 'medium' ? 'from-sky-200 via-sky-400 to-violet-600' : 'from-emerald-200 via-emerald-400 to-cyan-600'
  const bits = useMemo(() => Array.from({ length: 14 }, (_, i) => ({ a: (i / 14) * Math.PI * 2, d: 70 + (i % 4) * 22, r: (i * 47) % 360 })), [])
  const tension = Math.min(1, step / 18)
  return (
    <div className="relative grid h-[320px] place-items-center overflow-hidden">
      <AnimatePresence mode="wait">
        {popped ? (
          <motion.div key="pop" className="relative grid place-items-center" initial={{ opacity: 1 }} animate={{ opacity: 1 }}>
            {bits.map((b, i) => (
              <motion.span key={i} className={clsx('absolute h-3 w-2 rounded-sm bg-gradient-to-br', hue)}
                initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }} animate={{ x: Math.cos(b.a) * b.d, y: Math.sin(b.a) * b.d + 40, rotate: b.r, opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }} />
            ))}
            <motion.p initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="font-display text-5xl font-black text-neon-red">POP!</motion.p>
          </motion.div>
        ) : (
          <motion.div key="b" className="flex flex-col items-center" exit={{ scale: 1.25, opacity: 0, transition: { duration: 0.12 } }}>
            <motion.div key={pumps} initial={{ scaleX: 1.08, scaleY: 0.92 }} animate={{ scaleX: 1, scaleY: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 9 }}>
              <motion.div animate={{ width: size, height: size * 1.16 }} transition={{ type: 'spring', stiffness: 200, damping: 13 }}
                className={clsx('relative grid place-items-center rounded-[50%_50%_48%_48%] bg-gradient-to-br shadow-[inset_-14px_-18px_34px_rgba(0,0,0,0.28),0_18px_40px_-12px_rgba(0,0,0,0.6)]', hue, live ? 'na-breathe' : 'opacity-80')}
                style={{ filter: `saturate(${1 + tension * 0.4})` }}>
                <span className="absolute left-[20%] top-[14%] h-[20%] w-[13%] rotate-[-28deg] rounded-full bg-white/60 blur-[1px]" />
                <span className="num font-mono text-base font-black text-white drop-shadow">{fmtMult(ladderMult('pump', mode, step))}</span>
              </motion.div>
            </motion.div>
            <span className="-mt-0.5 h-2.5 w-3 rounded-b-full bg-slate-400/70" />
            <svg width="20" height="60" viewBox="0 0 20 60" className="text-slate-500"><path d="M10 0 C2 15 18 30 10 45 C6 52 10 58 10 60" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
          </motion.div>
        )}
      </AnimatePresence>
      {live && tension > 0.5 && <p className="absolute bottom-2 text-[11px] font-semibold text-amber-300/80">{'•'.repeat(Math.round(tension * 5))}</p>}
    </div>
  )
}
