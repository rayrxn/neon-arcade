import { useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { playKeno } from '@/services/games'
import { KENO_PAY, KENO_POOL } from '@/config/games2'
import { useT } from '@/i18n'

const MAX_PICKS = 10

export default function Keno({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [picks, setPicks] = useState([])
  const [draw, setDraw] = useState(null) // { drawn, hits }
  const [outcome, setOutcome] = useState(null)

  const toggle = (n) => {
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
    setDraw({ drawn: res.drawn, hits: res.hits })
    setOutcome(res)
    playOutcome(res)
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
      <Button size="lg" className="w-full" disabled={!picks.length} onClick={play}>{t('play.play')}</Button>
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
    <Stage className="p-4 sm:p-6">
      <div className="mx-auto grid max-w-[480px] grid-cols-8 gap-1.5 sm:gap-2">
        {Array.from({ length: KENO_POOL }, (_, i) => {
          const n = i + 1
          const picked = picks.includes(n)
          const drawn = draw?.drawn.includes(n)
          const hit = picked && drawn
          return (
            <motion.button
              key={n}
              whileTap={{ scale: 0.92 }}
              onClick={() => toggle(n)}
              aria-pressed={picked}
              className={clsx(
                'num grid aspect-square place-items-center rounded-lg font-mono text-xs font-bold ring-1 ring-inset transition-colors sm:text-sm',
                hit ? 'bg-neon-green/25 text-neon-green ring-neon-green/60'
                  : picked ? 'bg-neon-purple/20 text-white ring-neon-purple/50'
                    : drawn ? 'bg-white/[0.1] text-slate-200 ring-white/20'
                      : 'bg-white/[0.04] text-slate-400 ring-white/[0.06] hover:bg-white/[0.08]',
              )}
            >
              {hit ? <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }}>{n}</motion.span> : n}
            </motion.button>
          )
        })}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">
        {draw ? t('play.keno.result', { hits: draw.hits.length, picks: picks.length }) : t('play.keno.idle')}
      </p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
