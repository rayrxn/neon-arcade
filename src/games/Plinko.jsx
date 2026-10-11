import { useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Choice, Field, GameShell, Stage, playOutcome, useBetCurrency, useRunner } from '@/components/play/GameKit'
import { PLINKO_ROWS, PLINKO_TABLES, playPlinko } from '@/services/games'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const ROWS = PLINKO_ROWS
const S = 92 / (ROWS + 1) // jarak antar pasak (unit viewBox)
const TOP = 6
const GAP_Y = 5.2
const pegX = (r, j) => 50 + (j - (r + 2) / 2) * S
const pegY = (r) => TOP + r * GAP_Y
const BIN_Y = pegY(ROWS - 1) + 4

/** Bin colour by distance from centre: cool gold in the middle → hot red at the edges. */
function binHeat(i, n) {
  const d = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2)
  const h = (48 - 56 * d + 360) % 360
  return { top: `hsl(${h} 95% ${62 - d * 6}%)`, side: `hsl(${h} 80% ${30 - d * 4}%)`, glow: `hsl(${h} 100% 60%)`, ink: d > 0.55 ? '#fff' : '#2a1405' }
}

/** Warna chip hasil terakhir. */
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
  const currency = useBetCurrency()
  const [bet, setBet] = useState(100)
  const [risk, setRisk] = useState('medium')
  const [balls, setBalls] = useState([])
  const [outcome, setOutcome] = useState(null)
  const [hits, setHits] = useState({})
  const [recent, setRecent] = useState([])
  const [count, setCount] = useState(1)
  const [dropping, setDropping] = useState(0)
  const timers = useRef([])
  const table = PLINKO_TABLES[risk]

  const DURATION = 2.2
  const STAGGER = 0.11

  const ballPath = (path, bin) => {
    // Lintasan: mulai di tengah, tiap baris geser ±½ jarak sesuai path dari server.
    const xs = [50]
    const ys = [0]
    let rights = 0
    path.forEach((step, r) => {
      rights += step
      xs.push(50 + (rights - (r + 1) / 2) * S)
      ys.push(pegY(r) - 1.6)
    })
    xs.push(50 + (bin - ROWS / 2) * S)
    ys.push(BIN_Y + 0.6)
    return { xs, ys }
  }

  // All balls are settled by the server in one round, then fall together with a short stagger.
  const drop = async () => {
    if (dropping) return
    setDropping(count)
    const res = await run(() => playPlinko({ bet, risk, balls: count }))
    if (!res) return setDropping(0)
    const list = res.balls ?? [{ path: res.path, bin: res.bin, multiplier: res.multiplier }]
    const sid = res.session.id
    setBalls((b) => [...b, ...list.map((x, i) => ({ id: `${sid}-${i}`, delay: i * STAGGER, ...ballPath(x.path, x.bin) }))])
    list.forEach((x, i) => {
      const t0 = i * STAGGER * 1000
      for (let r = 2; r <= ROWS; r += 4) timers.current.push(setTimeout(() => play('peg'), t0 + (r / (ROWS + 1)) * DURATION * 1000))
      timers.current.push(setTimeout(() => {
        const id = `${sid}-${i}`
        setBalls((b) => b.filter((y) => y.id !== id))
        setHits((h) => ({ ...h, [x.bin]: (h[x.bin] ?? 0) + 1 }))
        setRecent((r) => [{ id, m: x.multiplier }, ...r].slice(0, 12))
      }, t0 + DURATION * 1000))
    })
    timers.current.push(setTimeout(() => {
      setOutcome(res)
      playOutcome(res)
      setDropping(0)
    }, (list.length - 1) * STAGGER * 1000 + DURATION * 1000 + 60))
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} />
      <Field label={t('play.plinko.risk')}>
        <Choice value={risk} onChange={setRisk} disabled={balls.length > 0 || dropping > 0} options={['low', 'medium', 'high'].map((r) => ({ value: r, label: t(`play.plinko.${r}`) }))} />
      </Field>
      <Field label={t('play.plinko.balls')} hint={<span className="num font-mono font-bold text-white">{count}</span>}>
        <input
          type="range"
          min={1}
          max={16}
          step={1}
          value={count}
          disabled={dropping > 0}
          onChange={(e) => setCount(Number(e.target.value))}
          className="plinko-range w-full"
          style={{ '--fill': `${((count - 1) / 15) * 100}%` }}
          aria-label={t('play.plinko.balls')}
        />
        <div className="mt-1 flex justify-between text-[10px] font-semibold text-slate-500"><span>1</span><span>16</span></div>
      </Field>
      {count > 1 && <p className="flex justify-between text-xs text-slate-400"><span>{t('play.plinko.totalBet')}</span><span className="num font-mono font-bold text-white">{formatCoins(bet * count)} {currency}</span></p>}
      <Button size="lg" className="w-full" onClick={drop} disabled={dropping > 0} loading={dropping > 0}>
        {count > 1 ? t('play.plinko.dropN', { n: count }) : t('play.plinko.drop')}
      </Button>
      <p className="text-center text-xs text-slate-500">{t('play.plinko.hint')}</p>
    </>
  )

  const stage = (
    <Stage className="relative overflow-hidden bg-[radial-gradient(ellipse_at_50%_0%,#4a044e_0%,#1a0b2e_50%,#07050f_100%)] p-3 sm:p-5">
      <div className="pointer-events-none absolute inset-x-6 top-2 flex justify-between">{Array.from({ length: 16 }, (_, k) => <motion.span key={k} className="h-1.5 w-1.5 rounded-full bg-pink-300" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 1, delay: (k % 5) * 0.2, repeat: Infinity }} />)}</div>
      {recent.length > 0 && (
        <ol className="absolute right-2 top-2 z-10 flex flex-col gap-1 sm:right-3 sm:top-3" aria-label={t('play.plinko.recent')}>
          <AnimatePresence initial={false}>
            {recent.map((r, i) => (
              <motion.li key={r.id} layout initial={{ opacity: 0, scale: 0.6, x: 8 }} animate={{ opacity: 1 - i * 0.06, scale: 1, x: 0 }} exit={{ opacity: 0 }} className={clsx('grid h-6 w-12 place-items-center rounded-md font-mono text-[10px] font-bold', binTone(r.m))}>
                {r.m}×
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
      )}
      <svg viewBox={`0 0 100 ${BIN_Y + 7}`} className="mx-auto block w-full max-w-[560px]" role="img" aria-label="Plinko">
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: r + 3 }, (_, j) => <circle key={`${r}-${j}`} cx={pegX(r, j)} cy={pegY(r)} r={0.7} className="fill-slate-400" />),
        )}
        <defs>
          <radialGradient id="plk-ball" cx="35%" cy="30%" r="70%">
            <stop offset="0" stopColor="#fff" />
            <stop offset="0.35" stopColor="#ff8ac2" />
            <stop offset="1" stopColor="#d61f74" />
          </radialGradient>
          <filter id="plk-glow" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="0.8" /></filter>
        </defs>
        {table.map((m, i) => {
          const c = binHeat(i, table.length)
          const x = 50 + (i - ROWS / 2) * S
          const w = S * 0.9
          const n = hits[i] ?? 0
          return (
            <motion.g
              key={`${risk}-${i}-${n}`}
              initial={n ? { y: 1.6 } : false}
              animate={{ y: 0 }}
              transition={{ type: 'spring', stiffness: 520, damping: 14 }}
            >
              {n > 0 && <motion.rect x={x - w / 2} y={BIN_Y + 1.4} width={w} height={4.2} rx={1} fill={c.glow} filter="url(#plk-glow)" initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} transition={{ duration: 0.7 }} />}
              <rect x={x - w / 2} y={BIN_Y + 2.2} width={w} height={4.2} rx={1} fill={c.side} />
              <rect x={x - w / 2} y={BIN_Y + 1.4} width={w} height={4.2} rx={1} fill={c.top} />
              <rect x={x - w / 2 + 0.4} y={BIN_Y + 1.7} width={w - 0.8} height={1.1} rx={0.5} fill="#fff" opacity={0.28} />
              <text x={x} y={BIN_Y + 4.4} textAnchor="middle" fontSize={m >= 100 ? 1.55 : 1.8} fontWeight="900" fill={c.ink} fontFamily="ui-monospace, monospace">{m}{m < 100 ? '×' : ''}</text>
            </motion.g>
          )
        })}
        {balls.map((b) => (
          <motion.g key={b.id} initial={{ x: 50, y: 0, opacity: 0 }} animate={{ x: b.xs, y: b.ys, opacity: 1 }} transition={{ duration: DURATION, delay: b.delay, ease: 'easeIn', times: b.xs.map((_, i) => i / (b.xs.length - 1)), opacity: { duration: 0.15, delay: b.delay } }}>
            <circle r={1.9} fill="#ff4fa3" opacity={0.45} filter="url(#plk-glow)" />
            <circle r={1.25} fill="url(#plk-ball)" />
          </motion.g>
        ))}
      </svg>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
