import { useState } from 'react'
import { motion } from 'framer-motion'
import Button from '@/components/ui/Button'
import { BetInput, Choice, Field, GameShell, Stage, playOutcome, useRunner } from '@/components/play/GameKit'
import { playCoinflip } from '@/services/games'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

function Face({ label, back }) {
  return (
    <span
      className="absolute inset-0 grid place-items-center rounded-full font-display text-3xl font-extrabold text-[#8a4e05]"
      style={{
        backfaceVisibility: 'hidden',
        transform: back ? 'rotateY(180deg)' : undefined,
        background: back
          ? 'radial-gradient(circle at 34% 28%, #f3f4f8 0 7%, #c9cfdc 30%, #8b95a8 70%, #5b6578 100%)'
          : 'radial-gradient(circle at 34% 28%, #fff6d2 0 7%, #ffd85e 24%, #f5a524 64%, #b4680a 100%)',
        boxShadow: 'inset 0 0 0 8px rgba(255,255,255,0.25)',
        color: back ? '#3b4252' : '#8a4e05',
      }}
    >
      {label}
    </span>
  )
}

export default function Coinflip({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [side, setSide] = useState('heads')
  const [outcome, setOutcome] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [landed, setLanded] = useState(true)

  const go = async () => {
    const res = await run(() => playCoinflip({ bet, side }))
    if (!res) return
    play('flip')
    setLanded(false)
    // 5 putaran penuh dari posisi bulat terdekat, lalu berhenti di sisi hasil server.
    setRotation((r) => Math.ceil(r / 360) * 360 + 5 * 360 + (res.outcome === 'tails' ? 180 : 0))
    setOutcome(res)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={!landed} />
      <Field label={t('play.coinflip.pick')}>
        <Choice value={side} onChange={setSide} disabled={!landed} options={[{ value: 'heads', label: t('play.coinflip.heads') }, { value: 'tails', label: t('play.coinflip.tails') }]} />
      </Field>
      <Button size="lg" className="w-full" onClick={go} disabled={!landed}>{t('play.coinflip.flip')}</Button>
      <p className="text-center text-xs text-slate-500">{t('play.winPays', { amount: formatCoins(Math.floor(bet * 1.98)) })}</p>
    </>
  )

  const stage = (
    <Stage className="grid min-h-[300px] place-items-center p-6" >
      <div style={{ perspective: 800 }} className="flex flex-col items-center gap-6">
        <motion.div
          className="relative h-36 w-36"
          style={{ transformStyle: 'preserve-3d' }}
          animate={{ rotateY: rotation, y: landed ? 0 : [0, -60, 0] }}
          transition={{ duration: 1.2, ease: [0.3, 0.7, 0.3, 1] }}
          onAnimationComplete={() => {
            if (!landed && outcome) playOutcome(outcome)
            setLanded(true)
          }}
        >
          <Face label="H" />
          <Face label="T" back />
        </motion.div>
        <p className="h-6 text-sm font-semibold text-slate-400">
          {landed && outcome ? t('play.coinflip.landed', { side: t(`play.coinflip.${outcome.outcome}`) }) : ''}
        </p>
      </div>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={landed ? outcome : null} />
}
