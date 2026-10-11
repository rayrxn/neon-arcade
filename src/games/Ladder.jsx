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
import { LayerBoard, MolesBoard, SliceBoard } from './LadderArcade'
import Explosion from '@/components/play/Explosion'
import { useT } from '@/i18n'

/** One engine: Tower, Cross the Road, Pump, Slice, Moles and Layer. */
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
      <div>
        {slug === 'tower' && <TowerBoard cfg={cfg} mode={m} live={live} end={end} onPick={advance} />}
        {slug === 'cross' && <RoadBoard cfg={cfg} mode={m} live={live} end={end} />}
        {slug === 'pump' && <Balloon mode={m} step={step} live={live} end={end} pumps={pumps} />}
        {slug === 'slice' && <SliceBoard mode={m} step={step} live={live} end={end} onGo={() => advance(null)} />}
        {slug === 'moles' && <MolesBoard mode={m} step={step} live={live} end={end} onGo={() => advance(null)} />}
        {slug === 'layer' && <LayerBoard mode={m} step={step} end={end} />}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">{live ? t(`play.ladder.hint.${slug}`) : end?.lost ? t('play.ladder.lost', { step: end.step + 1 }) : t('play.ladder.idle')}</p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}

const STARS = Array.from({ length: 34 }, (_, i) => ({ x: (i * 37) % 100, y: (i * 61) % 100, r: 0.6 + (i % 3) * 0.5, d: (i % 5) * 0.6 }))

/** Tower: a castle wall at night. Each floor is a row of arched doors; open one to find treasure or a bomb. */
function Door({ open, bomb, chosen, active, onClick, delay }) {
  return (
    <button type="button" disabled={!active} onClick={onClick} className={clsx('group relative h-14 [perspective:600px] disabled:cursor-default', active && 'cursor-pointer')}>
      {/* doorway interior */}
      <span className={clsx('absolute inset-0 grid place-items-center rounded-t-[18px] rounded-b-md shadow-[inset_0_6px_14px_rgba(0,0,0,0.8)]',
        bomb ? (chosen ? 'bg-red-900' : 'bg-[#2a0f12]') : chosen ? 'bg-[radial-gradient(circle,#fde68a_0%,#b45309_70%)]' : 'bg-[#1b1626]')}>
        {open && (bomb
          ? <Bomb className={clsx('h-5 w-5', chosen ? 'text-white' : 'text-red-400/70')} />
          : <Gem className={clsx('h-5 w-5', chosen ? 'text-white drop-shadow-[0_0_6px_#fff]' : 'text-emerald-300/50')} />)}
      </span>
      {/* wooden door swinging open on its left hinge */}
      <motion.span className="absolute inset-0 origin-left rounded-t-[18px] rounded-b-md border-2 border-[#2b1a0e] bg-[repeating-linear-gradient(90deg,#8b5a2b_0_9px,#6f4521_9px_11px)] shadow-[inset_0_-4px_0_rgba(0,0,0,0.35)] [backface-visibility:hidden]"
        initial={false} animate={{ rotateY: open ? -105 : 0 }} transition={spring(0.6, 0.25, delay)}>
        <span className="absolute inset-x-1 top-[45%] h-1 rounded bg-[#3a2a1a]" />
        <span className="absolute right-1.5 top-[52%] h-1.5 w-1.5 rounded-full bg-amber-300" />
        {active && <span className="absolute inset-0 rounded-t-[18px] rounded-b-md ring-2 ring-amber-300/0 transition group-hover:ring-amber-300/80" />}
      </motion.span>
      {chosen && bomb && open && <Explosion size={110} />}
    </button>
  )
}

function Torch({ lit }) {
  return (
    <span className="relative flex h-10 w-3 flex-col items-center">
      {lit && <motion.span className="absolute -top-3 h-4 w-3 rounded-[50%_50%_40%_40%] bg-gradient-to-t from-orange-500 via-amber-300 to-yellow-100 shadow-[0_0_16px_6px_rgba(251,146,60,0.55)]" animate={{ scaleY: [1, 1.25, 0.9, 1.15, 1], x: [0, 0.5, -0.5, 0] }} transition={{ duration: 0.8, repeat: Infinity }} />}
      <span className="mt-1 h-7 w-1.5 rounded bg-[#5b3a1e]" />
    </span>
  )
}

function TowerBoard({ cfg, mode, live, end, onPick }) {
  const { cols, one } = cfg.modes[mode]
  const path = live?.path ?? end?.path ?? []
  const active = live ? live.step : -1
  const climbed = live ? live.step : end ? end.step : 0
  const lostRow = end?.lost ? end.step : -1
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-[#0b1026] via-[#151236] to-[#1e1633] px-3 pb-4 pt-6">
      {STARS.map((st, k) => (
        <span key={k} className="na-twinkle absolute rounded-full bg-white" style={{ left: `${st.x}%`, top: `${st.y * 0.25}%`, width: st.r * 2, height: st.r * 2, animationDelay: `${st.d}s` }} />
      ))}
      <div className="absolute right-6 top-3 h-10 w-10 rounded-full bg-amber-100 shadow-[0_0_40px_10px_rgba(254,243,199,0.2)]" />
      {/* battlements */}
      <div className="relative mx-auto flex max-w-[440px] justify-between px-2">{Array.from({ length: 9 }, (_, k) => <span key={k} className="h-4 w-8 rounded-t-sm bg-[#4b4560]" />)}</div>
      <div className="relative mx-auto flex max-w-[440px] flex-col-reverse gap-1.5 rounded-b-xl bg-[#3f3a52] bg-[linear-gradient(rgba(0,0,0,0.25)_2px,transparent_2px),linear-gradient(90deg,rgba(0,0,0,0.2)_2px,transparent_2px)] bg-[length:44px_22px] p-2.5 shadow-[inset_0_0_30px_rgba(0,0,0,0.5)]">
        {Array.from({ length: cfg.steps }, (_, row) => {
          const special = end?.layout?.[row]
          const isActive = row === active
          const past = row < climbed
          return (
            <div key={row} className={clsx('relative flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors', isActive && 'bg-amber-400/10 ring-1 ring-amber-300/40')}>
              <Torch lit={isActive || (past && !end?.lost)} />
              <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {Array.from({ length: cols }, (_, c) => {
                  const chosen = path[row] === c
                  const known = special != null
                  const isBomb = known ? (one === 'bomb' ? special === c : special !== c) : row === lostRow && chosen
                  return <Door key={c} open={known || (chosen && (past || row === lostRow))} bomb={isBomb} chosen={chosen} active={isActive} onClick={() => onPick(c)} delay={known && !chosen ? 0.03 * (row + c) : 0} />
                })}
              </div>
              <span className={clsx('w-14 shrink-0 rounded-md py-1 text-center font-mono text-[11px] font-black',
                isActive ? 'bg-amber-400 text-amber-950 shadow-[0_0_14px_rgba(251,191,36,0.6)]' : past ? 'bg-emerald-500/85 text-emerald-950' : 'bg-black/30 text-slate-400')}>
                {fmtMult(ladderMult('tower', mode, row + 1))}
              </span>
            </div>
          )
        })}
      </div>
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

const BALLOON_HUE = { easy: ['#6ee7b7', '#059669'], medium: ['#7dd3fc', '#6d28d9'], hard: ['#fdba74', '#db2777'], expert: ['#fda4af', '#b91c1c'] }

/** Pump: a hand pump feeds a balloon through a hose. Scale is a transform (GPU), so growth stays smooth. */
function Balloon({ mode, step, live, end, pumps }) {
  const popped = !!end?.lost
  const [c1, c2] = BALLOON_HUE[mode] ?? BALLOON_HUE.medium
  const scale = 0.55 + Math.min(step, 25) * 0.045
  const bits = useMemo(() => Array.from({ length: 16 }, (_, i) => ({ a: (i / 16) * Math.PI * 2, d: 90 + (i % 4) * 26, r: (i * 47) % 360 })), [])
  return (
    <div className="relative h-[380px] overflow-hidden rounded-2xl bg-[repeating-linear-gradient(90deg,#7f1d1d_0_44px,#1c1917_44px_88px)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/40 to-black/80" />
      <svg className="pointer-events-none absolute inset-x-0 top-0 h-14 w-full" viewBox="0 0 400 60" preserveAspectRatio="none"><path d="M0 0h400v18c-25 22-25 22-50 0-25 22-25 22-50 0-25 22-25 22-50 0-25 22-25 22-50 0-25 22-25 22-50 0-25 22-25 22-50 0-25 22-25 22-50 0-25 22-25 22-50 0z" fill="#b91c1c" /></svg>
      <svg viewBox="0 0 400 380" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="bal-g" cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#fff" stopOpacity="0.9" /><stop offset="0.18" stopColor={c1} /><stop offset="1" stopColor={c2} /></radialGradient>
          <linearGradient id="pump-g" x1="0" x2="1"><stop offset="0" stopColor="#991b1b" /><stop offset="0.5" stopColor="#ef4444" /><stop offset="1" stopColor="#7f1d1d" /></linearGradient>
        </defs>
        {/* floor */}
        <ellipse cx="200" cy="362" rx="190" ry="14" fill="#000" opacity="0.4" />
        {/* hose from pump to balloon nozzle */}
        <path d="M92 330 C92 372 200 372 200 336" fill="none" stroke="#1f2937" strokeWidth="7" strokeLinecap="round" />
        {/* hand pump */}
        <rect x="70" y="250" width="44" height="96" rx="8" fill="url(#pump-g)" />
        <rect x="64" y="340" width="56" height="10" rx="4" fill="#334155" />
        <motion.g key={`p${pumps}`} initial={{ y: 0 }} animate={{ y: [0, 26, 0] }} transition={{ duration: 0.38, ease: 'easeInOut' }}>
          <rect x="88" y="196" width="8" height="58" fill="#cbd5e1" />
          <rect x="62" y="188" width="60" height="12" rx="6" fill="#e2e8f0" />
        </motion.g>
        {/* nozzle */}
        <rect x="192" y="318" width="16" height="22" rx="3" fill="#475569" />
        {!popped && (
          <motion.g style={{ originX: '200px', originY: '320px' }} initial={false} animate={{ scale }} transition={{ type: 'spring', stiffness: 170, damping: 14 }}>
            <motion.g key={pumps} initial={{ scaleX: 1.06, scaleY: 0.94 }} animate={{ scaleX: 1, scaleY: 1 }} style={{ originX: '200px', originY: '320px' }} transition={{ type: 'spring', stiffness: 420, damping: 10 }}>
              <path d="M200 316 C120 300 96 200 120 140 C140 88 260 88 280 140 C304 200 280 300 200 316 Z" fill="url(#bal-g)" />
              <ellipse cx="158" cy="150" rx="16" ry="30" fill="#fff" opacity="0.35" transform="rotate(-25 158 150)" />
              <path d="M192 316 L208 316 L204 326 L196 326 Z" fill={c2} />
            </motion.g>
          </motion.g>
        )}
      </svg>
      {!popped && (
        <div className="pointer-events-none absolute inset-x-0 top-[52%] text-center">
          <motion.span key={step} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="num inline-block font-mono text-2xl font-black text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]">{fmtMult(ladderMult('pump', mode, step))}</motion.span>
        </div>
      )}
      {popped && (
        <div className="absolute inset-0 grid place-items-center">
          {bits.map((b, i) => (
            <motion.span key={i} className="absolute h-3 w-2 rounded-sm" style={{ background: i % 2 ? c1 : c2 }}
              initial={{ x: 0, y: -40, rotate: 0, opacity: 1 }} animate={{ x: Math.cos(b.a) * b.d * 1.4, y: Math.sin(b.a) * b.d + 40, rotate: b.r * 2, opacity: 0 }} transition={{ duration: 1.1, ease: 'easeOut' }} />
          ))}
          <motion.p initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 12 }} className="-mt-16 font-display text-5xl font-black text-neon-red drop-shadow">POP!</motion.p>
        </div>
      )}
      {live && step > 9 && <motion.div className="pointer-events-none absolute inset-0 ring-4 ring-inset ring-red-500/30" animate={{ opacity: [0.2, 0.7, 0.2] }} transition={{ duration: 0.9, repeat: Infinity }} />}
    </div>
  )
}
