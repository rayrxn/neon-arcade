import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import Button from '@/components/ui/Button'
import { BetInput, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { playLimbo } from '@/services/games'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

/** Angka "berputar" cepat lalu berhenti di hasil dari server. */
function useSpinNumber(final, key) {
  const [value, setValue] = useState(final)
  const raf = useRef()
  useEffect(() => {
    if (final == null) return
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - start) / 600)
      setValue(p < 1 ? 1 + Math.random() * Math.max(2, final * 1.5) : final)
      if (p < 1) raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [final, key])
  return value
}

export default function Limbo({ game }) {
  const { t } = useT()
  const { run, busy } = useRunner()
  const [bet, setBet] = useState(100)
  const [target, setTarget] = useState('2.00')
  const [outcome, setOutcome] = useState(null)
  const shown = useSpinNumber(outcome?.value ?? null, outcome?.session.id)
  const settled = outcome && shown === outcome.value
  const t2 = Math.max(1.01, Number(target) || 1.01)
  useEffect(() => {
    if (settled) playOutcome(outcome)
  }, [settled, outcome])

  const go = async () => {
    const res = await run(() => playLimbo({ bet, target: t2 }))
    if (res) setOutcome(res)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} />
      <Field label={t('play.limbo.target')} hint={`${t('play.chance')} ${((99 / t2)).toFixed(2)}%`}>
        <div className="input-shell flex items-center px-3">
          <input id="limbo-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^0-9.]/g, ''))} onBlur={() => setTarget(t2.toFixed(2))} className="num h-11 min-w-0 flex-1 bg-transparent font-mono font-bold text-white outline-none" />
          <span className="font-mono text-sm text-slate-500">×</span>
        </div>
      </Field>
      <div className="flex gap-1.5">
        {[1.5, 2, 5, 10, 100].map((v) => (
          <button key={v} onClick={() => setTarget(v.toFixed(2))} className="h-8 flex-1 rounded-lg bg-white/[0.05] text-xs font-bold text-slate-300 hover:bg-white/[0.09]">{v}×</button>
        ))}
      </div>
      <Button size="lg" className="w-full" onClick={go} disabled={busy || (outcome && !settled)}>{t('play.play')}</Button>
    </>
  )

  const stage = (
    <Stage className="relative grid min-h-[320px] place-items-center overflow-hidden bg-gradient-to-b from-[#030712] via-[#0b1736] to-[#1e1b4b] p-6">
      {Array.from({ length: 30 }, (_, k) => (
        <motion.span key={k} className="pointer-events-none absolute w-px rounded bg-white/70" style={{ left: `${(k * 37) % 100}%`, height: 6 + (k % 4) * 8 }} animate={{ top: ['-10%', '110%'] }} transition={{ duration: 1.6 + (k % 5) * 0.5, delay: -(k % 7) * 0.4, repeat: Infinity, ease: 'linear' }} />
      ))}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-violet-700/30 to-transparent" />
      <div className="text-center">
        <motion.p key={settled ? `s-${outcome?.session.id}` : 'run'} initial={settled ? { scale: 1.25 } : false} animate={{ scale: 1 }} transition={{ type: 'spring', duration: 0.55, bounce: 0.45 }}
          className={clsx('num font-mono text-6xl font-bold sm:text-8xl', !outcome ? 'text-slate-600' : !settled ? 'text-white' : outcome.session.result === 'win' ? 'text-neon-green drop-shadow-[0_0_24px_rgba(34,197,94,0.55)]' : 'text-neon-red')}>
          {fmtMult(outcome ? shown : 1)}
        </motion.p>
        <div className="mx-auto mt-5 h-1.5 w-64 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div className={clsx('h-full rounded-full', settled && outcome?.session.result !== 'win' ? 'bg-neon-red' : 'bg-neon-green')} animate={{ width: `${Math.min(100, (Math.log(Math.max(1, outcome ? shown : 1)) / Math.log(Math.max(1.01, t2))) * 100)}%` }} transition={{ duration: 0.1 }} />
        </div>
        <p className="mt-4 text-sm text-slate-500">
          {t('play.limbo.target')} <b className="text-slate-300">{fmtMult(t2)}</b> · {t('play.winPays', { amount: formatCoins(Math.floor(bet * t2)) })}
        </p>
      </div>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={settled ? outcome : null} />
}
