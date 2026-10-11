import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { playKeno } from '@/services/games'
import { KENO_PAY, KENO_POOL } from '@/config/games2'
import { useT } from '@/i18n'
import { spring } from '@/lib/motion'

const MAX_PICKS = 10

export default function Keno({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [picks, setPicks] = useState([])
  const [draw, setDraw] = useState(null) // { drawn, hits }
  const [outcome, setOutcome] = useState(null)
  const [shown, setShown] = useState(0) // balls revealed so far (draw animation)
  const timer = useRef(null)
  useEffect(() => () => clearInterval(timer.current), [])
  const drawing = draw && shown < draw.drawn.length

  const toggle = (n) => {
    if (drawing) return
    setDraw(null)
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length < MAX_PICKS ? [...p, n] : p))
  }
  const autoPick = () => {
    const pool = Array.from({ length: KENO_POOL }, (_, i) => i + 1)
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    setDraw(null)
    setPicks(pool.slice(0, Math.max(picks.length, 5)))
  }

  const play = async () => {
    const res = await run(() => playKeno({ bet, picks }))
    if (!res) return
    clearInterval(timer.current)
    setOutcome(null)
    setDraw({ drawn: res.drawn, hits: res.hits })
    setShown(0)
    let n = 0
    timer.current = setInterval(() => {
      n += 1
      setShown(n)
      if (n >= res.drawn.length) {
        clearInterval(timer.current)
        setTimeout(() => { setOutcome(res); playOutcome(res) }, 350)
      }
    }, 190)
  }

  const pay = KENO_PAY[picks.length] ?? []
  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} />
      <Field label={t('play.keno.picks')} hint={`${picks.length}/${MAX_PICKS}`}>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={autoPick}>{t('play.keno.auto')}</Button>
          <Button variant="ghost" onClick={() => (setPicks([]), setDraw(null))} disabled={!picks.length}>{t('play.keno.clear')}</Button>
        </div>
      </Field>
      <Button size="lg" className="w-full" disabled={!picks.length || drawing} onClick={play}>{t('play.play')}</Button>
      {picks.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-slate-500">{t('play.keno.payout')}</p>
          <div className="flex flex-wrap gap-1.5">
            {pay.map((m, k) => m > 0 && (
              <span key={k} className={clsx('rounded-md px-2 py-1 font-mono text-[11px] font-bold ring-1 ring-inset', draw && draw.hits.length === k ? 'bg-neon-green/15 text-neon-green ring-neon-green/40' : 'bg-white/[0.03] text-slate-300 ring-white/[0.06]')}>
                {k}× · {fmtMult(m)}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  )

  const stage = (
    <Stage className="relative overflow-hidden bg-[radial-gradient(circle_at_50%_0%,#3b0764_0%,#0b0f19_70%)] p-4 sm:p-6">
      <div className="relative mx-auto mb-3 h-[120px] w-[120px]">
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-white/[0.03] ring-2 ring-white/25 shadow-[inset_0_-10px_30px_rgba(168,85,247,0.35),0_0_40px_rgba(168,85,247,0.25)]" />
        {Array.from({ length: 12 }, (_, k) => (
          <motion.span key={k} className="absolute h-5 w-5 rounded-full shadow" style={{ left: 50, top: 50, background: ['#f8fafc', '#facc15', '#f472b6', '#22d3ee'][k % 4] }}
            animate={drawing ? { x: [0, Math.cos(k) * 40, Math.sin(k * 2) * 36, Math.cos(k * 3) * 42, 0], y: [0, Math.sin(k) * 40, Math.cos(k * 2) * 38, Math.sin(k * 3) * 30, 0] } : { x: Math.cos(k * 0.52) * (12 + (k % 3) * 9), y: 28 + Math.sin(k * 0.52) * 8 }}
            transition={drawing ? { duration: 0.6 + (k % 4) * 0.08, repeat: Infinity, ease: 'easeInOut' } : spring(0.8, 0.3)} />
        ))}
        <span className="absolute left-[18%] top-[10%] h-5 w-9 rotate-[-25deg] rounded-full bg-white/30 blur-[2px]" />
        <div className="absolute -bottom-3 left-1/2 h-4 w-16 -translate-x-1/2 rounded-b-xl bg-gradient-to-b from-slate-400 to-slate-600" />
      </div>
      <div className="mx-auto mb-4 flex h-10 max-w-[480px] items-center justify-center gap-1.5 rounded-full bg-black/40 px-2 ring-1 ring-white/10">
        <AnimatePresence>
          {draw?.drawn.slice(0, shown).map((n) => (
            <motion.span key={n} initial={{ y: -36, opacity: 0, scale: 0.5 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}
              className={clsx('num grid h-8 w-8 place-items-center rounded-full font-mono text-xs font-black shadow-lg', picks.includes(n) ? 'bg-gradient-to-br from-emerald-300 to-emerald-600 text-ink-950' : 'bg-gradient-to-br from-slate-200 to-slate-400 text-ink-950')}>
              {n}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
      <div className="mx-auto grid max-w-[480px] grid-cols-8 gap-1.5 rounded-2xl border border-amber-300/25 bg-gradient-to-b from-[#1b1530] to-[#120f22] p-2.5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)] sm:gap-2">
        {Array.from({ length: KENO_POOL }, (_, i) => {
          const n = i + 1
          const picked = picks.includes(n)
          const order = draw ? draw.drawn.indexOf(n) : -1
          const drawn = order >= 0 && order < shown
          const hit = picked && drawn
          return (
            <motion.button
              key={n}
              whileTap={{ scale: 0.92 }}
              onClick={() => toggle(n)}
              aria-pressed={picked}
              className={clsx(
                'num grid aspect-square place-items-center rounded-lg font-mono text-xs font-bold ring-1 ring-inset transition-colors sm:text-sm',
                hit ? 'na-glow bg-neon-green/25 text-neon-green ring-neon-green/60'
                  : picked ? 'bg-neon-purple/20 text-white ring-neon-purple/50'
                    : drawn ? 'bg-white/[0.1] text-slate-200 ring-white/20'
                      : 'bg-white/[0.04] text-slate-400 ring-white/[0.06] hover:bg-white/[0.08]',
              )}
            >
              {drawn ? (
                <motion.span key={`d${n}`} initial={{ scale: 0.3, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 16 }}>{n}</motion.span>
              ) : n}
            </motion.button>
          )
        })}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        {draw && !drawing ? t('play.keno.result', { hits: draw.hits.length, picks: picks.length }) : drawing ? '…' : t('play.keno.idle')}
      </p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
