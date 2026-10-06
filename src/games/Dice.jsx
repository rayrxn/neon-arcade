import { useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Choice, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { playDice } from '@/services/games'
import { diceMultiplier, HOUSE_EDGE } from '@/utils/rng'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

export default function Dice({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [target, setTarget] = useState(50)
  const [over, setOver] = useState(true)
  const [outcome, setOutcome] = useState(null)

  const chance = over ? 100 - target : target
  const multiplier = diceMultiplier(chance, HOUSE_EDGE)
  const roll = outcome?.roll
  const win = outcome?.session.result === 'win'

  const go = () => {
    const res = run(() => playDice({ bet, target, over }))
    if (!res) return
    setOutcome(res)
    playOutcome(res)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} />
      <Field label={t('play.dice.mode')}>
        <Choice value={over} onChange={setOver} options={[{ value: false, label: t('play.dice.under') }, { value: true, label: t('play.dice.over') }]} />
      </Field>
      <Button size="lg" className="w-full" onClick={go}>{t('play.play')}</Button>
    </>
  )

  const stage = (
    <Stage className="p-5 sm:p-8">
      <div className="flex min-h-[120px] items-center justify-center">
        <motion.span
          key={outcome?.session.id ?? 'idle'}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={clsx('num font-mono text-6xl font-bold sm:text-7xl', roll == null ? 'text-slate-600' : win ? 'text-neon-green' : 'text-neon-red')}
        >
          {roll == null ? '00.00' : roll.toFixed(2)}
        </motion.span>
      </div>

      <div className="relative mt-6 px-1">
        <div className="relative h-3 overflow-hidden rounded-full bg-neon-red/30">
          <div className={clsx('absolute inset-y-0 bg-neon-green/70', over ? 'right-0' : 'left-0')} style={{ width: `${chance}%` }} />
        </div>
        {roll != null && (
          <motion.div initial={{ left: '50%' }} animate={{ left: `${roll}%` }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} className="absolute -top-2 h-7 w-1.5 -translate-x-1/2 rounded-full bg-white shadow" />
        )}
        <input
          id="dice-target"
          type="range"
          min={2}
          max={98}
          step={1}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          className="absolute inset-x-0 -top-1 h-5 w-full cursor-pointer opacity-0"
          aria-label={t('play.dice.target')}
        />
        <div className="mt-2 flex justify-between text-[11px] text-slate-500"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
      </div>

      <dl className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[
          [t('play.dice.target'), `${over ? '>' : '<'} ${target}`],
          [t('play.chance'), `${chance.toFixed(0)}%`],
          [t('play.multiplier'), fmtMult(multiplier)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/[0.03] px-2 py-3 ring-1 ring-inset ring-white/[0.06]">
            <dt className="text-[11px] text-slate-500">{k}</dt>
            <dd className="num mt-0.5 font-mono text-sm font-bold text-white">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-center text-xs text-slate-500">{t('play.winPays', { amount: formatCoins(Math.floor(bet * multiplier)) })}</p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
