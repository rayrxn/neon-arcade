import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Choice, Field, GameShell, Stage, playOutcome, useRunner } from '@/components/play/GameKit'
import { PLINKO_ROWS, PLINKO_TABLES, playPlinko } from '@/services/games'
import { play } from '@/services/sound'
import { useT } from '@/i18n'

const ROWS = PLINKO_ROWS
const S = 92 / (ROWS + 1) // jarak antar pasak (unit viewBox)
const TOP = 6
const GAP_Y = 5.2
const pegX = (r, j) => 50 + (j - (r + 2) / 2) * S
const pegY = (r) => TOP + r * GAP_Y
const BIN_Y = pegY(ROWS - 1) + 4

/** Warna bin: makin ke tepi makin "panas". */
function binTone(m) {
  if (m >= 100) return 'bg-neon-red text-onaccent'
  if (m >= 10) return 'bg-neon-pink text-onaccent'
  if (m >= 2) return 'bg-neon-gold text-onaccent'
  if (m >= 1) return 'bg-neon-cyan/70 text-onaccent'
  return 'bg-white/10 text-slate-300'
}

export default function Plinko({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [risk, setRisk] = useState('medium')
  const [balls, setBalls] = useState([])
  const [outcome, setOutcome] = useState(null)
  const [hitBin, setHitBin] = useState(null)
  const timers = useRef([])
  const table = PLINKO_TABLES[risk]

  const drop = () => {
    const res = run(() => playPlinko({ bet, risk }))
    if (!res) return
    // Lintasan: mulai di tengah, tiap baris geser ±½ jarak sesuai path dari server.
    const xs = [50]
    const ys = [0]
    let rights = 0
    res.path.forEach((step, r) => {
      rights += step
      xs.push(50 + (rights - (r + 1) / 2) * S)
      ys.push(pegY(r) - 1.6)
    })
    xs.push(50 + (res.bin - ROWS / 2) * S)
    ys.push(BIN_Y + 1)
    const id = res.session.id
    setBalls((b) => [...b, { id, xs, ys }])
    const duration = 2.2
    for (let i = 1; i <= ROWS; i += 3) timers.current.push(setTimeout(() => play('peg'), (i / (ROWS + 1)) * duration * 1000))
    timers.current.push(
      setTimeout(() => {
        setBalls((b) => b.filter((x) => x.id !== id))
        setHitBin({ bin: res.bin, id })
        setOutcome(res)
        playOutcome(res)
      }, duration * 1000),
    )
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} />
      <Field label={t('play.plinko.risk')}>
        <Choice value={risk} onChange={setRisk} disabled={balls.length > 0} options={['low', 'medium', 'high'].map((r) => ({ value: r, label: t(`play.plinko.${r}`) }))} />
      </Field>
      <Button size="lg" className="w-full" onClick={drop}>{t('play.plinko.drop')}</Button>
      <p className="text-center text-xs text-slate-500">{t('play.plinko.hint')}</p>
    </>
  )

  const stage = (
    <Stage className="p-3 sm:p-5">
      <svg viewBox={`0 0 100 ${BIN_Y + 3}`} className="mx-auto block w-full max-w-[560px]" role="img" aria-label="Plinko">
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: r + 3 }, (_, j) => <circle key={`${r}-${j}`} cx={pegX(r, j)} cy={pegY(r)} r={0.7} className="fill-slate-400" />),
        )}
        {balls.map((b) => (
          <motion.circle
            key={b.id}
            r={1.4}
            className="fill-neon-pink"
            initial={{ cx: 50, cy: 0 }}
            animate={{ cx: b.xs, cy: b.ys }}
            transition={{ duration: 2.2, ease: 'easeIn', times: b.xs.map((_, i) => i / (b.xs.length - 1)) }}
          />
        ))}
      </svg>
      <div className="mx-auto mt-1 grid max-w-[560px] gap-[2px]" style={{ gridTemplateColumns: `repeat(${table.length}, minmax(0, 1fr))` }}>
        {table.map((m, i) => (
          <motion.span
            key={`${risk}-${i}-${hitBin?.bin === i ? hitBin.id : ''}`}
            initial={hitBin?.bin === i ? { y: 4 } : false}
            animate={{ y: 0 }}
            className={clsx('grid h-7 place-items-center rounded font-mono text-[8px] font-bold sm:text-[10px]', binTone(m), hitBin?.bin === i && 'ring-2 ring-white')}
          >
            {m}
          </motion.span>
        ))}
      </div>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
