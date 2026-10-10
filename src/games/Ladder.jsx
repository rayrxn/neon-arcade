import { useEffect, useRef, useState } from 'react'
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
      {slug === 'tower' && <TowerBoard cfg={cfg} mode={m} live={live} end={end} onPick={advance} />}
      {slug === 'cross' && <RoadBoard cfg={cfg} mode={m} step={step} live={live} end={end} />}
      {slug === 'pump' && <Balloon mode={m} step={step} live={live} end={end} />}
      <p className="mt-4 text-center text-xs text-slate-500">{live ? t(`play.ladder.hint.${slug}`) : end?.lost ? t('play.ladder.lost', { step: end.step + 1 }) : t('play.ladder.idle')}</p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}

function TowerBoard({ cfg, mode, live, end, onPick }) {
  const { cols, one } = cfg.modes[mode]
  const path = live?.path ?? end?.path ?? []
  const active = live ? live.step : -1
  return (
    <div className="mx-auto flex max-w-[360px] flex-col-reverse gap-1.5">
      {Array.from({ length: cfg.steps }, (_, row) => {
        const special = end?.layout?.[row]
        return (
          <div key={row} className="flex items-center gap-2">
            <span className="num w-14 shrink-0 text-right font-mono text-[11px] text-slate-500">{fmtMult(ladderMult('tower', mode, row + 1))}</span>
            <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: cols }, (_, c) => {
                const chosen = path[row] === c
                const known = special != null
                const isBomb = known && (one === 'bomb' ? special === c : special !== c)
                return (
                  <motion.button
                    key={c}
                    whileTap={row === active ? { scale: 0.92 } : undefined}
                    disabled={row !== active}
                    onClick={() => onPick(c)}
                    className={clsx(
                      'grid h-9 place-items-center rounded-lg ring-1 ring-inset transition-colors',
                      row === active ? 'bg-neon-purple/20 ring-neon-purple/40 hover:bg-neon-purple/30'
                        : chosen && !isBomb ? 'bg-neon-green/15 ring-neon-green/40'
                          : chosen && isBomb ? 'bg-neon-red/30 ring-neon-red'
                            : 'bg-white/[0.04] ring-white/[0.06]',
                      known && !chosen && 'opacity-60',
                    )}
                  >
                    {known ? (isBomb ? <Bomb className="h-4 w-4 text-neon-red" /> : <Gem className="h-4 w-4 text-neon-green" />) : chosen ? <Gem className="h-4 w-4 text-neon-green" /> : null}
                  </motion.button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function RoadBoard({ cfg, mode, step, live, end }) {
  const ref = useRef(null)
  const pos = live ? live.step : end ? (end.lost ? end.step : end.step) : 0
  useEffect(() => {
    const el = ref.current?.querySelector(`[data-lane="${Math.max(0, pos - 1)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [pos])
  return (
    <div ref={ref} className="overflow-x-auto pb-2 scrollbar-none">
      <div className="flex w-max items-stretch gap-1">
        <div className="grid w-14 place-items-center rounded-lg bg-neon-green/10 ring-1 ring-inset ring-neon-green/30">
          {pos === 0 && !end?.lost && <Bird className="h-6 w-6 text-neon-gold" />}
        </div>
        {Array.from({ length: cfg.steps }, (_, i) => {
          const crossed = i < pos
          const here = i === pos - 1 && !end?.lost
          const crash = end?.lost && i === end.step
          return (
            <div key={i} data-lane={i} className={clsx('relative flex h-36 w-14 flex-col items-center justify-between rounded-lg py-2 ring-1 ring-inset', crossed ? 'bg-white/[0.06] ring-white/10' : 'bg-ink-950/60 ring-white/[0.05]')}>
              <span className="num font-mono text-[10px] font-bold text-slate-400">{fmtMult(ladderMult('cross', mode, i + 1))}</span>
              <div className="h-full w-px border-l border-dashed border-white/10" />
              <AnimatePresence>
                {here && <motion.span key="b" initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="absolute top-1/2 -translate-y-1/2"><Bird className="h-6 w-6 text-neon-gold" /></motion.span>}
                {crash && <motion.span key="c" initial={{ y: -60 }} animate={{ y: 0 }} className="absolute top-1/2 -translate-y-1/2"><Car className="h-7 w-7 text-neon-red" /></motion.span>}
              </AnimatePresence>
              <span className="text-[10px] text-slate-600">{i + 1}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Balloon({ mode, step, live, end }) {
  const popped = end?.lost
  const size = 90 + Math.min(step, 25) * 7
  const hue = mode === 'expert' ? 'from-rose-400 to-red-600' : mode === 'hard' ? 'from-orange-300 to-pink-500' : mode === 'medium' ? 'from-sky-300 to-violet-500' : 'from-emerald-300 to-cyan-500'
  return (
    <div className="grid h-[300px] place-items-center">
      <AnimatePresence mode="wait">
        {popped ? (
          <motion.div key="pop" initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
            <p className="font-display text-4xl font-black text-neon-red">POP!</p>
            <p className="mt-1 text-xs text-slate-500">{fmtMult(ladderMult('pump', mode, step))}</p>
          </motion.div>
        ) : (
          <motion.div key="b" animate={{ width: size, height: size * 1.15 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}
            className={clsx('relative grid place-items-center rounded-[50%] bg-gradient-to-br shadow-[inset_-12px_-16px_30px_rgba(0,0,0,0.25)]', hue, !live && !end && 'opacity-70')}>
            <span className="absolute left-[22%] top-[16%] h-[18%] w-[12%] rotate-[-30deg] rounded-full bg-white/50" />
            <span className="num font-mono text-sm font-black text-white drop-shadow">{fmtMult(ladderMult('pump', mode, step))}</span>
            <span className="absolute -bottom-2 h-3 w-3 rotate-45 bg-inherit" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
