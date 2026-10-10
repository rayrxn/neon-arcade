import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { playSweet } from '@/services/games'
import { useT } from '@/i18n'

const SYMBOLS = ['🍇', '🍎', '🍑', '🍌', '🍬', '🍭', '🧁', '💎']
const IDLE = Array.from({ length: 6 }, (_, c) => Array.from({ length: 5 }, (_, r) => ({ s: (c * 5 + r * 3) % 8 })))

/** Tumble slot: 8+ of a symbol anywhere pays, winners pop, new candy falls in, bombs multiply the win. */
export default function Sweet({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [spin, setSpin] = useState(null)
  const [step, setStep] = useState(0)
  const [outcome, setOutcome] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const play = async () => {
    clearTimeout(timer.current)
    const res = await run(() => playSweet({ bet }))
    if (!res) return
    setOutcome(null)
    setSpin(res)
    setStep(0)
    const advance = (i) => {
      if (i < res.steps.length - 1) {
        timer.current = setTimeout(() => { setStep(i + 1); advance(i + 1) }, 900)
      } else {
        timer.current = setTimeout(() => { setOutcome(res); playOutcome(res) }, 500)
      }
    }
    advance(0)
  }

  const cur = spin?.steps[step]
  const grid = cur?.grid ?? IDLE
  const winSyms = new Set((cur?.wins ?? []).map((w) => w.s))
  const running = spin && step < spin.steps.length - 1

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={running} />
      <Button size="lg" className="w-full" onClick={play} disabled={running}>{t('play.sweet.spin')}</Button>
      <dl className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-white/[0.03] py-2 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('play.sweet.tumble')}</dt>
          <dd className="num font-mono text-sm font-bold text-white">{spin ? step : 0}</dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] py-2 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('play.sweet.bombs')}</dt>
          <dd className="num font-mono text-sm font-bold text-neon-gold">{spin && !running && spin.bombs ? `×${spin.bombs}` : '—'}</dd>
        </div>
      </dl>
      <p className="text-[11px] leading-relaxed text-slate-500">{t('play.sweet.rule')}</p>
    </>
  )

  const stage = (
    <Stage className="p-3 sm:p-6">
      <div className="mx-auto grid max-w-[440px] grid-cols-6 gap-1.5 rounded-2xl bg-gradient-to-b from-pink-500/10 to-violet-500/5 p-2 ring-1 ring-inset ring-pink-300/20 sm:gap-2 sm:p-3">
        {grid.map((col, c) => (
          <div key={c} className="grid grid-rows-5 gap-1.5 sm:gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {col.map((cell, r) => (
                <motion.div key={`${step}-${c}-${r}`} layout initial={{ y: -40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: 0.3, delay: r * 0.03 }}
                  className={clsx('relative grid aspect-square place-items-center rounded-lg text-xl sm:text-2xl', winSyms.has(cell.s) ? 'bg-neon-gold/25 ring-2 ring-inset ring-neon-gold' : 'bg-white/[0.04]')}>
                  {cell.s === 8 ? (
                    <span className="grid h-full w-full place-items-center rounded-lg bg-gradient-to-br from-fuchsia-400 to-amber-300 font-mono text-[11px] font-black text-ink-950 sm:text-xs">×{cell.b}</span>
                  ) : SYMBOLS[cell.s]}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        {cur?.wins?.length ? cur.wins.map((w) => `${SYMBOLS[w.s]} ×${w.n} → ${fmtMult(w.pay)}`).join(' · ') : spin && !running ? (spin.mult <= 0 ? t('play.sweet.noWin') : spin.bombs ? t('play.sweet.total', { base: fmtMult(spin.base), mult: fmtMult(spin.mult) }) : t('play.sweet.win', { mult: fmtMult(spin.mult) })) : t('play.sweet.idle')}
      </p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
