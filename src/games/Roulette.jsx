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

/** Wooden bowl, gold frets and turret; the ball orbits the other way and drops into the pocket under the pointer. */
function Wheel({ rotation, spin }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[250px]">
      <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,#7c4a1e_58%,#4a2a10_66%,#2b170a_72%,#7c4a1e_74%,#3b2210_100%)] shadow-[0_18px_40px_-10px_rgba(0,0,0,0.8),inset_0_0_0_3px_rgba(251,191,36,0.35)]" />
      <span className="absolute left-1/2 top-0 z-20 h-0 w-0 -translate-x-1/2 border-x-[8px] border-t-[13px] border-x-transparent border-t-amber-300 drop-shadow" />
      <motion.svg viewBox="-50 -50 100 100" className="absolute inset-[7%] h-[86%] w-[86%]" animate={{ rotate: rotation }} transition={{ duration: 3.2, ease: [0.15, 0.8, 0.25, 1] }}>
        {WHEEL.map((n, i) => {
          const a0 = ((i - 0.5) * SEG - 90) * (Math.PI / 180)
          const a1 = ((i + 0.5) * SEG - 90) * (Math.PI / 180)
          const p = (a, r) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`
          const mid = (i * SEG - 90) * (Math.PI / 180)
          return (
            <g key={n}>
              <path d={`M${p(a0, 30)} L${p(a0, 49)} A49,49 0 0 1 ${p(a1, 49)} L${p(a1, 30)} A30,30 0 0 0 ${p(a0, 30)} Z`} fill={FILL[colorOf(n)]} stroke="#d4a017" strokeWidth="0.35" />
              <text x={Math.cos(mid) * 43} y={Math.sin(mid) * 43} fill="#fff" fontSize="3.7" fontWeight="800" textAnchor="middle" dominantBaseline="central" transform={`rotate(${i * SEG} ${Math.cos(mid) * 43} ${Math.sin(mid) * 43})`}>{n}</text>
            </g>
          )
        })}
        <circle r="30" fill="#5b3415" stroke="#d4a017" strokeWidth="0.6" />
        <circle r="22" fill="url(#rw-cone)" />
        <defs><radialGradient id="rw-cone" cx="40%" cy="35%"><stop offset="0" stopColor="#fde68a" /><stop offset="0.6" stopColor="#b45309" /><stop offset="1" stopColor="#78350f" /></radialGradient></defs>
        {[0, 90, 180, 270].map((r) => <rect key={r} x="-1.2" y="-20" width="2.4" height="17" rx="1.2" fill="#fde68a" transform={`rotate(${r})`} />)}
        <circle r="4" fill="#fef3c7" stroke="#92400e" strokeWidth="0.6" />
      </motion.svg>
      {/* ball: spins the opposite way, spirals in and comes to rest at the top pocket */}
      <motion.div key={spin} className="pointer-events-none absolute inset-0 z-10" initial={{ rotate: spin ? 1440 : 0 }} animate={{ rotate: 0 }} transition={{ duration: 3.2, ease: [0.2, 0.75, 0.3, 1] }}>
        <motion.span className="absolute left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#cbd5e1_60%,#64748b)] shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
          initial={{ top: spin ? '4%' : '13%' }} animate={{ top: '13%' }} transition={{ duration: 3.2, ease: [0.6, 0, 0.8, 1] }} />
      </motion.div>
    </div>
  )
}

/** Casino chip used for bets placed on the layout. */
function Chip({ amount }) {
  return (
    <span className="absolute -right-1.5 -top-1.5 z-10 grid h-6 min-w-6 place-items-center rounded-full border-2 border-dashed border-white/80 bg-amber-400 px-1 font-mono text-[9px] font-black leading-none text-amber-950 shadow-[0_2px_0_#92400e]">
      {amount >= 1000 ? `${Math.floor(amount / 100) / 10}k` : amount}
    </span>
  )
}

export default function Roulette({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [chip, setChip] = useState(50)
  const currency = useBetCurrency()
  const [bets, setBets] = useState({})
  const [rotation, setRotation] = useState(0)
  const [spins, setSpins] = useState(0)
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
    setSpins((n) => n + 1)
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
      {bets[k] && <Chip amount={bets[k].amount} />}
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
    <Stage className="relative space-y-5 bg-[radial-gradient(ellipse_at_50%_25%,#166534_0%,#0b3b20_55%,#04140b_100%)] p-4 sm:p-5">
      <div className="pointer-events-none absolute inset-2 rounded-[20px] border-2 border-amber-300/25 shadow-[inset_0_0_40px_rgba(0,0,0,0.6)]" />
      <div className="grid items-center gap-5 sm:grid-cols-[240px_minmax(0,1fr)]">
        <Wheel rotation={rotation} spin={spins} />
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
                return <Spot key={n} k={`n:${n}`} type="straight" value={n} className={clsx('h-9', !spinning && outcome?.number === n && 'z-10 ring-2 ring-amber-300 shadow-[0_0_16px_rgba(252,211,77,0.7)]')} >{<span className="grid h-full w-full place-items-center rounded-md" style={{ background: FILL[colorOf(n)] }}>{n}</span>}</Spot>
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
