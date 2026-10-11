import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { playSweet } from '@/services/games'
import { useT } from '@/i18n'

const SYMBOLS = ['🍇', '🍎', '🍑', '🍌', '🍬', '🍭', '🧁', '💎']
const IDLE = Array.from({ length: 6 }, (_, c) => Array.from({ length: 5 }, (_, r) => ({ s: (c * 5 + r * 3) % 8, id: `i${c}${r}` })))

/** Give every candy a stable id across tumbles: survivors keep theirs, new ones get fresh ids, so only changes animate. */
function withIds(steps) {
  let n = 0
  const out = []
  steps.forEach((st, k) => {
    if (k === 0) { out.push(st.grid.map((col) => col.map((cell) => ({ ...cell, id: `c${n++}` })))); return }
    const gone = new Set(steps[k - 1].wins.map((w) => w.s))
    out.push(st.grid.map((col, c) => {
      const kept = out[k - 1][c].filter((cell) => !gone.has(cell.s))
      const fresh = col.length - kept.length
      return col.map((cell, r) => ({ ...cell, id: r < fresh ? `c${n++}` : kept[r - fresh].id }))
    }))
  })
  return out
}

/** Tumble slot: 8+ of a symbol anywhere pays, winners pop, new candy falls in, bombs multiply the win. */
export default function Sweet({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [spin, setSpin] = useState(null)
  const [step, setStep] = useState(0)
  const [popping, setPopping] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const play = async () => {
    clearTimeout(timer.current)
    const res = await run(() => playSweet({ bet }))
    if (!res) return
    setOutcome(null)
    setPopping(false)
    setSpin(res)
    setStep(0)
    // Each tumble: show the grid with winners glowing → winners pop → survivors fall, new candy drops.
    const advance = (i) => {
      if (i < res.steps.length - 1) {
        timer.current = setTimeout(() => {
          setPopping(true)
          timer.current = setTimeout(() => { setPopping(false); setStep(i + 1); advance(i + 1) }, 320)
        }, 780)
      } else {
        timer.current = setTimeout(() => { setOutcome(res); playOutcome(res) }, res.bombs && res.mult > 0 ? 1100 : 450)
      }
    }
    advance(0)
  }

  const frames = useMemo(() => (spin ? withIds(spin.steps) : null), [spin])
  const cur = spin?.steps[step]
  const grid = frames?.[step] ?? IDLE
  const last = spin && step === spin.steps.length - 1
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
      <div className="relative mx-auto grid max-w-[440px] grid-cols-6 gap-1.5 overflow-hidden rounded-2xl bg-gradient-to-b from-pink-500/15 via-fuchsia-500/5 to-violet-600/10 p-2 ring-1 ring-inset ring-pink-300/25 sm:gap-2 sm:p-3">
        {grid.map((col, c) => (
          <div key={c} className="flex flex-col gap-1.5 sm:gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {col.map((cell, r) => {
                const win = winSyms.has(cell.s)
                return (
                  <motion.div
                    key={cell.id}
                    layout
                    initial={{ y: -90 - r * 18, opacity: 0 }}
                    animate={{ y: 0, opacity: 1, scale: popping && win ? 1.25 : 1, rotate: popping && win ? 12 : 0 }}
                    exit={{ scale: 0, opacity: 0, rotate: 30, transition: { duration: 0.18 } }}
                    transition={{ type: 'spring', stiffness: 520, damping: 30, mass: 0.7, delay: spin ? r * 0.025 + c * 0.015 : 0 }}
                    className={clsx('relative grid aspect-square place-items-center rounded-lg text-xl sm:text-2xl', win ? 'bg-neon-gold/25 ring-2 ring-inset ring-neon-gold na-glow' : 'bg-white/[0.05]')}
                    style={win ? { '--glow': '250 204 21' } : undefined}
                  >
                    {cell.s === 8 ? (
                      <motion.span animate={last && spin?.mult > 0 ? { scale: [1, 1.35, 1] } : {}} transition={{ duration: 0.5, repeat: last ? 1 : 0 }}
                        className="grid h-full w-full place-items-center rounded-lg bg-gradient-to-br from-fuchsia-400 to-amber-300 font-mono text-[11px] font-black text-ink-950 sm:text-xs">×{cell.b}</motion.span>
                    ) : <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]">{SYMBOLS[cell.s]}</span>}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        ))}
        <AnimatePresence>
          {last && spin.mult > 0 && (
            <motion.div key="win" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 14, delay: 0.25 }}
              className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35 backdrop-blur-[1px]">
              <div className="text-center">
                {spin.bombs > 0 && <p className="font-mono text-sm font-bold text-amber-200">{fmtMult(spin.base)} × {spin.bombs}</p>}
                <p className="font-display text-4xl font-black text-neon-gold drop-shadow-[0_0_18px_rgba(250,204,21,0.6)]">{fmtMult(spin.mult)}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        {cur?.wins?.length ? cur.wins.map((w) => `${SYMBOLS[w.s]} ×${w.n} → ${fmtMult(w.pay)}`).join(' · ') : spin && !running ? (spin.mult <= 0 ? t('play.sweet.noWin') : spin.bombs ? t('play.sweet.total', { base: fmtMult(spin.base), mult: fmtMult(spin.mult) }) : t('play.sweet.win', { mult: fmtMult(spin.mult) })) : t('play.sweet.idle')}
      </p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
