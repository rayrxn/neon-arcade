import { useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Choice, Field, GameShell, Stage, fmtMult, playOutcome, useLock, useRunner } from '@/components/play/GameKit'
import { playDice } from '@/services/games'
import { diceMultiplier, HOUSE_EDGE } from '@/utils/rng'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }
// Cube rotation that brings each face to the front.
const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] }
const FACE_POS = { 1: 'translateZ(28px)', 2: 'rotateY(90deg) translateZ(28px)', 3: 'rotateX(90deg) translateZ(28px)', 4: 'rotateX(-90deg) translateZ(28px)', 5: 'rotateY(-90deg) translateZ(28px)', 6: 'rotateY(180deg) translateZ(28px)' }

/** Red casino die that tumbles to a face picked from the roll (decoration; the roll number is the result). */
function Die({ roll, spin }) {
  const face = roll == null ? 1 : Math.min(6, Math.max(1, Math.ceil((roll / 100) * 6)))
  const [rx, ry] = FACE_ROT[face]
  return (
    <div className="h-14 w-14" style={{ perspective: 400 }}>
      <motion.div
        className="relative h-full w-full"
        style={{ transformStyle: 'preserve-3d' }}
        initial={false}
        animate={{ rotateX: rx + spin * 720, rotateY: ry + spin * 720 }}
        transition={{ duration: 0.65, ease: [0.2, 0.8, 0.3, 1] }}
      >
        {Object.entries(FACE_POS).map(([n, tf]) => (
          <span key={n} className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-0.5 rounded-xl bg-gradient-to-br from-red-500 to-red-700 p-2 shadow-[inset_0_0_0_2px_rgba(255,255,255,0.25)]" style={{ transform: tf, backfaceVisibility: 'hidden' }}>
            {Array.from({ length: 9 }, (_, i) => <i key={i} className={clsx('m-auto h-2 w-2 rounded-full', PIPS[n].includes(i) ? 'bg-white shadow-[inset_0_1px_1px_rgba(0,0,0,0.4)]' : '')} />)}
          </span>
        ))}
      </motion.div>
    </div>
  )
}

export default function Dice({ game }) {
  const { t } = useT()
  const { run, busy } = useRunner()
  const [locked, lock] = useLock()
  const [bet, setBet] = useState(100)
  const [target, setTarget] = useState(50)
  const [over, setOver] = useState(true)
  const [outcome, setOutcome] = useState(null)
  const [spins, setSpins] = useState(0)

  const chance = over ? 100 - target : target
  const multiplier = diceMultiplier(chance, HOUSE_EDGE)
  const roll = outcome?.roll
  const win = outcome?.session.result === 'win'

  const go = async () => {
    const res = await run(() => playDice({ bet, target, over }))
    if (!res) return
    lock(700)
    setSpins((n) => n + 1)
    setOutcome(res)
    playOutcome(res)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} />
      <Field label={t('play.dice.mode')}>
        <Choice value={over} onChange={setOver} options={[{ value: false, label: t('play.dice.under') }, { value: true, label: t('play.dice.over') }]} />
      </Field>
      <Button size="lg" className="w-full" onClick={go} disabled={busy || locked}>{t('play.play')}</Button>
    </>
  )

  const stage = (
    <Stage className="relative overflow-hidden bg-[radial-gradient(ellipse_at_50%_30%,#14532d_0%,#0b2e1b_60%,#05140c_100%)] p-5 sm:p-8">
      <div className="pointer-events-none absolute inset-3 rounded-[22px] border-2 border-amber-200/20" />
      <div className="flex min-h-[120px] items-center justify-center gap-5">
        <Die roll={roll} spin={spins} />
        <motion.span
          key={outcome?.session.id ?? 'idle'}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={clsx('num font-mono text-6xl font-bold sm:text-7xl', roll == null ? 'text-slate-600' : win ? 'text-neon-green' : 'text-neon-red')}
        >
          {roll == null ? '00.00' : roll.toFixed(2)}
        </motion.span>
      </div>

      <div className="relative mt-10 px-1">
        <div className="relative h-3 overflow-hidden rounded-full bg-neon-red/30">
          <div className={clsx('absolute inset-y-0 bg-neon-green/70', over ? 'right-0' : 'left-0')} style={{ width: `${chance}%` }} />
        </div>
        <div className="pointer-events-none absolute -top-2 grid h-7 w-5 -translate-x-1/2 place-items-center rounded-md bg-slate-100 shadow-lg ring-2 ring-black/20" style={{ left: `${target}%` }}>
          <span className="h-3 w-0.5 rounded bg-slate-400 shadow-[3px_0_0_#94a3b8,-3px_0_0_#94a3b8]" />
        </div>
        {roll != null && (
          <motion.div initial={{ left: '50%' }} animate={{ left: `${roll}%` }} transition={{ type: 'spring', stiffness: 200, damping: 20 }} className="pointer-events-none absolute -top-10 -translate-x-1/2">
            <span className={clsx('num block rounded-lg px-2 py-0.5 font-mono text-xs font-bold text-white shadow-lg', win ? 'bg-neon-green' : 'bg-neon-red')}>{roll.toFixed(2)}</span>
            <span className={clsx('mx-auto block h-2 w-2 -translate-y-1 rotate-45', win ? 'bg-neon-green' : 'bg-neon-red')} />
          </motion.div>
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
