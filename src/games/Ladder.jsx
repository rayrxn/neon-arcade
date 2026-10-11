import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bird, Bomb, Car, Gem } from 'lucide-react'
import clsx from 'clsx'
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
                      transition={{ type: 'spring', stiffness: 260, damping: 22, delay: known && !chosen ? 0.04 * (row + c) : 0 }}
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

const LANE_SPEED = [2.6, 1.9, 3.1, 2.2, 1.6, 2.8, 2.0, 3.4]

function RoadBoard({ cfg, mode, live, end }) {
  const ref = useRef(null)
  const pos = live ? live.step : end ? end.step : 0
  const lost = !!end?.lost
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-lane="${Math.max(0, pos - 2)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' })
  }, [pos])
  const LANE_W = 60
  return (
    <div ref={ref} className="overflow-x-auto pb-2 scrollbar-none">
      <div className="relative flex w-max items-stretch">
        <div data-lane="-1" className="grid h-40 w-16 place-items-center rounded-l-xl bg-gradient-to-b from-emerald-800/40 to-emerald-900/40" />
        {Array.from({ length: cfg.steps }, (_, i) => {
          const crossed = i < pos
          const crash = lost && i === end.step
          return (
            <div key={i} data-lane={i} className={clsx('relative h-40 overflow-hidden border-l border-dashed border-white/15', crossed ? 'bg-slate-700/40' : 'bg-slate-800/70')} style={{ width: LANE_W }}>
              <span className={clsx('absolute left-1/2 top-1.5 z-10 -translate-x-1/2 rounded bg-black/40 px-1 font-mono text-[10px] font-bold', crossed ? 'text-neon-green' : 'text-slate-300')}>
                {fmtMult(ladderMult('cross', mode, i + 1))}
              </span>
              {!crossed && !crash && (
                <span className="na-drive absolute left-1/2 top-0 -ml-3.5" style={{ animationDuration: `${LANE_SPEED[i % 8]}s`, animationDelay: `-${(i * 0.37) % 2}s` }}>
                  <Car className="h-7 w-7 rotate-90 text-slate-400/70" />
                </span>
              )}
              {crash && (
                <motion.span initial={{ y: -120 }} animate={{ y: 52 }} transition={{ duration: 0.25, ease: 'easeIn' }} className="absolute left-1/2 top-0 -ml-4">
                  <Car className="h-8 w-8 rotate-90 text-neon-red" />
                </motion.span>
              )}
            </div>
          )
        })}
        <div className="grid h-40 w-12 place-items-center rounded-r-xl bg-gradient-to-b from-emerald-800/40 to-emerald-900/40">
          <span className="font-mono text-[10px] font-bold text-neon-gold">END</span>
        </div>
        <motion.span
          className="pointer-events-none absolute top-1/2 z-20 -mt-4"
          initial={false}
          animate={{ left: (pos === 0 ? 32 : 64 + (pos - 1) * LANE_W + LANE_W / 2) - 16, opacity: lost ? 0 : 1, scale: lost ? 0.4 : 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <motion.span key={pos} className="block" initial={{ y: 0 }} animate={{ y: [0, -14, 0] }} transition={{ duration: 0.35 }}>
            <Bird className="h-8 w-8 text-neon-gold drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
          </motion.span>
        </motion.span>
      </div>
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
