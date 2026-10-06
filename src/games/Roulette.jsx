import { useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, GameShell, Stage, playOutcome, useBetCurrency, useRunner } from '@/components/play/GameKit'
import { RED, playRoulette } from '@/services/games'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26]
const SEG = 360 / WHEEL.length
const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black')
const FILL = { green: '#14a06a', red: '#d6243f', black: '#1b2030' }

function Wheel({ rotation }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[240px]">
      <span className="absolute left-1/2 top-0 z-10 h-0 w-0 -translate-x-1/2 border-x-[9px] border-t-[14px] border-x-transparent border-t-neon-gold" />
      <motion.svg viewBox="-50 -50 100 100" className="h-full w-full" animate={{ rotate: rotation }} transition={{ duration: 3.2, ease: [0.15, 0.8, 0.25, 1] }}>
        {WHEEL.map((n, i) => {
          const a0 = ((i - 0.5) * SEG - 90) * (Math.PI / 180)
          const a1 = ((i + 0.5) * SEG - 90) * (Math.PI / 180)
          const p = (a, r) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`
          const mid = (i * SEG - 90) * (Math.PI / 180)
          return (
            <g key={n}>
              <path d={`M0,0 L${p(a0, 48)} A48,48 0 0 1 ${p(a1, 48)} Z`} fill={FILL[colorOf(n)]} stroke="#0b0e18" strokeWidth="0.3" />
              <text x={Math.cos(mid) * 41} y={Math.sin(mid) * 41} fill="#fff" fontSize="3.6" fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * SEG} ${Math.cos(mid) * 41} ${Math.sin(mid) * 41})`}>
                {n}
              </text>
            </g>
          )
        })}
        <circle r="28" fill="#0b0e18" />
        <circle r="26" className="fill-ink-800" />
      </motion.svg>
    </div>
  )
}

export default function Roulette({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [chip, setChip] = useState(50)
  const currency = useBetCurrency()
  const [bets, setBets] = useState({})
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [outcome, setOutcome] = useState(null)
  const [last, setLast] = useState([])
  const total = Object.values(bets).reduce((s, b) => s + b.amount, 0)

  const place = (key, type, value) => {
    if (spinning) return
    play('click')
    setBets((b) => ({ ...b, [key]: { type, value, amount: (b[key]?.amount ?? 0) + chip } }))
  }

  const spin = async () => {
    const list = Object.values(bets)
    const res = await run(() => playRoulette({ bets: list }))
    if (!res) return
    const idx = WHEEL.indexOf(res.number)
    setSpinning(true)
    setOutcome(null)
    setRotation((r) => Math.ceil(r / 360) * 360 + 5 * 360 - idx * SEG)
    setTimeout(() => {
      setSpinning(false)
      setOutcome(res)
      setLast((l) => [res.number, ...l].slice(0, 12))
      playOutcome(res)
    }, 3300)
  }

  const Spot = ({ k, type, value, children, className }) => (
    <button
      type="button"
      onClick={() => place(k, type, value)}
      className={clsx('relative grid place-items-center rounded-md text-[11px] font-bold text-white transition hover:brightness-125 sm:text-xs', className)}
    >
      {children}
      {bets[k] && <span className="absolute -right-1 -top-1 z-10 min-w-[18px] rounded-full bg-neon-gold px-1 font-mono text-[9px] leading-[18px] text-onaccent">{bets[k].amount >= 1000 ? `${Math.floor(bets[k].amount / 1000)}k` : bets[k].amount}</span>}
    </button>
  )

  const numbers = Array.from({ length: 12 }, (_, c) => [3 + c * 3, 2 + c * 3, 1 + c * 3])

  const controls = (
    <>
      <BetInput value={chip} onChange={setChip} disabled={spinning} label={t('play.roulette.chip')} />
      <div className="rounded-xl bg-white/[0.03] p-3 text-sm ring-1 ring-inset ring-white/[0.06]">
        <div className="flex justify-between"><span className="text-slate-400">{t('play.roulette.total')}</span><b className="num font-mono text-white">{formatCoins(total)} {currency}</b></div>
        <div className="mt-1 flex justify-between"><span className="text-slate-400">{t('play.roulette.spots')}</span><b className="text-white">{Object.keys(bets).length}</b></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" disabled={spinning || !total} onClick={() => setBets({})}>{t('play.roulette.clear')}</Button>
        <Button disabled={spinning || !total} loading={spinning} onClick={spin}>{t('play.roulette.spin')}</Button>
      </div>
      <p className="text-xs text-slate-500">{t('play.roulette.hint')}</p>
    </>
  )

  const stage = (
    <Stage className="space-y-5 p-4 sm:p-5">
      <div className="grid items-center gap-5 sm:grid-cols-[240px_minmax(0,1fr)]">
        <Wheel rotation={rotation} />
        <div className="text-center sm:text-left">
          <p className="label-caps">{t('play.roulette.result')}</p>
          <p className={clsx('num mt-1 font-mono text-6xl font-bold', !outcome ? 'text-slate-600' : outcome.color === 'red' ? 'text-[#ff5b72]' : outcome.color === 'green' ? 'text-neon-green' : 'text-white')}>
            {outcome ? outcome.number : '—'}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-1 sm:justify-start">
            {last.map((n, i) => (
              <span key={i} className="grid h-6 w-6 place-items-center rounded-md font-mono text-[10px] font-bold text-white" style={{ background: FILL[colorOf(n)] }}>{n}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto pb-1">
        <div className="min-w-[520px] space-y-1.5">
          <div className="grid grid-cols-[34px_repeat(12,minmax(0,1fr))] gap-1">
            <Spot k="n:0" type="straight" value={0} className="row-span-3 h-auto bg-[#14a06a]">0</Spot>
            {[0, 1, 2].map((row) =>
              numbers.map((col) => {
                const n = col[row]
                return <Spot key={n} k={`n:${n}`} type="straight" value={n} className="h-9" >{<span className="grid h-full w-full place-items-center rounded-md" style={{ background: FILL[colorOf(n)] }}>{n}</span>}</Spot>
              }),
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 pl-[38px]">
            {[1, 2, 3].map((d) => <Spot key={d} k={`d:${d}`} type="dozen" value={d} className="h-9 bg-white/[0.07]">{t('play.roulette.dozen', { from: (d - 1) * 12 + 1, to: d * 12 })}</Spot>)}
          </div>
          <div className="grid grid-cols-6 gap-1 pl-[38px]">
            <Spot k="low" type="low" className="h-9 bg-white/[0.07]">1–18</Spot>
            <Spot k="even" type="even" className="h-9 bg-white/[0.07]">{t('play.roulette.even')}</Spot>
            <Spot k="red" type="red" className="h-9 bg-[#d6243f]">{t('play.roulette.red')}</Spot>
            <Spot k="black" type="black" className="h-9 bg-[#1b2030] ring-1 ring-inset ring-white/10">{t('play.roulette.black')}</Spot>
            <Spot k="odd" type="odd" className="h-9 bg-white/[0.07]">{t('play.roulette.odd')}</Spot>
            <Spot k="high" type="high" className="h-9 bg-white/[0.07]">19–36</Spot>
          </div>
        </div>
      </div>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
