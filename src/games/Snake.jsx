import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Play } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Choice, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { openRound, snakeCashout, snakeRoll, snakeStart } from '@/services/games'
import { SNAKE_BOARD } from '@/config/games2'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

// Ring of 12 cells around a 4×4 grid, clockwise from the start cell (top-left). Ring index r ↔ board tile r − 1.
const RING = [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [3, 1], [3, 0], [2, 0], [1, 0]]
const MODES = Object.keys(SNAKE_BOARD)
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }

function SnakeArt() {
  return (
    <svg viewBox="0 0 100 100" className="h-[70%] w-[70%]" aria-hidden>
      <ellipse cx="50" cy="82" rx="34" ry="9" fill="#14532d" opacity="0.5" />
      <path d="M22 78 C10 70 20 58 38 62 C60 66 80 60 72 48 C66 38 46 44 48 30" stroke="#65a30d" strokeWidth="13" fill="none" strokeLinecap="round" />
      <path d="M22 78 C10 70 20 58 38 62 C60 66 80 60 72 48 C66 38 46 44 48 30" stroke="#a3e635" strokeWidth="4" strokeDasharray="3 7" fill="none" strokeLinecap="round" />
      <ellipse cx="50" cy="24" rx="12" ry="10" fill="#4d7c0f" />
      <circle cx="45" cy="21" r="2.6" fill="#fef08a" /><circle cx="55" cy="21" r="2.6" fill="#fef08a" />
      <path d="M50 33 L50 40 M50 40 L46 44 M50 40 L54 44" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function Die({ n, rolling }) {
  return (
    <motion.span
      className="grid h-12 w-12 grid-cols-3 grid-rows-3 rounded-xl bg-gradient-to-br from-white to-slate-300 p-1.5 shadow-[0_4px_0_#94a3b8] sm:h-14 sm:w-14"
      animate={rolling ? { rotate: [0, 200, 360], y: [0, -18, 0] } : { rotate: 0, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={clsx('m-auto h-2 w-2 rounded-full', PIPS[n]?.includes(i) && 'bg-slate-900')} />)}
    </motion.span>
  )
}

export default function Snake({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const resumed = openRound('snake')
  const [bet, setBet] = useState(resumed?.bet ?? 100)
  const [mode, setMode] = useState(resumed?.mode ?? 'medium')
  const [round, setRound] = useState(resumed)
  const [dice, setDice] = useState([1, 1])
  const [rolling, setRolling] = useState(false)
  const [token, setToken] = useState(0) // ring index the token sits on
  const [landed, setLanded] = useState(null) // { ring, bad }
  const [outcome, setOutcome] = useState(null)
  const [mult, setMult] = useState(resumed?.multiplier ?? 1)
  const timers = useRef([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const live = round && !outcome
  const m = round?.mode ?? mode
  const board = SNAKE_BOARD[m]
  const busy = rolling

  const start = async () => {
    const res = await run(() => snakeStart({ bet, mode }))
    if (!res) return
    setOutcome(null)
    setLanded(null)
    setToken(0)
    setMult(1)
    setRound(res)
  }

  const roll = async () => {
    if (!live || busy) return
    setRolling(true)
    setLanded(null)
    const res = await run(() => snakeRoll(round.id))
    if (!res) return setRolling(false)
    setDice(res.dice)
    const target = res.tile + 1
    // Token hops from the start cell around the ring to the tile picked by the dice sum.
    setToken(0)
    for (let r = 1; r <= target; r++) timers.current.push(setTimeout(() => { setToken(r); play('tick') }, 450 + r * 70))
    timers.current.push(setTimeout(() => {
      setRolling(false)
      setLanded({ ring: target, bad: !!res.lost })
      play(res.lost ? 'explode' : 'reveal')
      if (res.done) {
        setOutcome(res)
        setRound(null)
        playOutcome(res)
      } else {
        setMult(res.multiplier)
        setRound(res)
      }
    }, 450 + target * 70 + 120))
  }

  const cashout = async () => {
    if (!live || busy) return
    const res = await run(() => snakeCashout(round.id))
    if (!res?.done) return
    setOutcome(res)
    setRound(null)
    playOutcome(res)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={!!live} />
      <Field label={t('play.ladder.mode')}>
        <Choice options={MODES.map((k) => ({ value: k, label: t(`play.ladder.modes.${k}`) }))} value={m} onChange={setMode} disabled={!!live} />
      </Field>
      {live ? (
        <div className="grid gap-2">
          <Button size="lg" className="w-full" onClick={roll} disabled={busy}>{t('play.ladder.snake.roll')}</Button>
          <Button size="lg" variant="gold" className="w-full" onClick={cashout} disabled={busy}>
            {round.rolls?.length ? `${t('play.crash.cashout')} · ${formatCoins(Math.floor(bet * mult))} AC` : t('play.mines.cancel')}
          </Button>
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={start}>{t('play.play')}</Button>
      )}
      <p className="text-xs leading-relaxed text-slate-500">{t('play.ladder.snake.hint')}</p>
    </>
  )

  const shownMult = outcome ? (outcome.lost ? 0 : outcome.multiplier ?? 1) : mult
  const stage = (
    <Stage className="relative overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#2f7a3a_0%,#14532d_55%,#052e16_100%)] p-4 sm:p-6">
      {[['left-0 top-0', ''], ['right-0 top-0', '-scale-x-100'], ['left-0 bottom-0', '-scale-y-100'], ['right-0 bottom-0', '-scale-100']].map(([pos, flip]) => (
        <svg key={pos} viewBox="0 0 120 120" className={clsx('pointer-events-none absolute h-28 w-28 opacity-70', pos, flip)} aria-hidden>
          <path d="M0 0 C40 10 70 30 90 70 C60 50 30 40 0 40 Z" fill="#166534" /><path d="M0 0 C20 30 30 60 30 100 C15 70 5 40 0 30 Z" fill="#15803d" /><path d="M0 0 C50 0 90 10 120 30 C80 25 40 20 0 15 Z" fill="#22c55e" opacity="0.6" />
        </svg>
      ))}
      <div className="mx-auto grid max-w-[460px] grid-cols-4 grid-rows-4 gap-2 sm:gap-2.5">
        {RING.map(([row, col], r) => {
          const v = r === 0 ? null : board[r - 1]
          const snake = v === 0
          const here = token === r && (rolling || landed)
          const hit = landed?.ring === r
          return (
            <motion.div
              key={r}
              style={{ gridRow: row + 1, gridColumn: col + 1 }}
              className={clsx(
                'relative grid aspect-square place-items-center rounded-xl font-display text-sm font-black transition-colors sm:text-lg',
                r === 0 ? 'bg-gradient-to-b from-emerald-400 to-emerald-700 shadow-[0_5px_0_#065f46]' :
                snake ? 'bg-[radial-gradient(circle_at_50%_60%,#0b1f0e_0%,#14532d_55%,#166534_100%)] shadow-[0_5px_0_#052e16]' :
                v >= 2 ? 'bg-gradient-to-b from-amber-200 to-amber-500 text-amber-950 shadow-[0_5px_0_#92400e,0_0_18px_rgba(251,191,36,0.35)]' :
                'bg-gradient-to-b from-[#e7d7ae] to-[#b89b62] text-[#4a3412] shadow-[0_5px_0_#6b532a]',
                hit && (landed.bad ? 'bg-red-900/70 ring-2 ring-neon-red' : 'bg-emerald-700/60 ring-2 ring-neon-green'),
              )}
              animate={hit && landed.bad ? { x: [0, -6, 6, -4, 4, 0] } : hit ? { scale: [1, 1.12, 1] } : {}}
              transition={{ duration: 0.45 }}
            >
              {r === 0 ? <Play className="h-7 w-7 fill-white text-white" /> : snake ? <SnakeArt /> : fmtMult(v)}
              {here && (
                <motion.span layoutId="snake-token" className="pointer-events-none absolute -top-3 left-1/2 z-10 -translate-x-1/2" transition={{ type: 'spring', stiffness: 700, damping: 35 }}>
                  <svg viewBox="0 0 24 32" className="h-8 w-6 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)]" aria-hidden><circle cx="12" cy="8" r="6" fill="#22d3ee" stroke="#0e7490" strokeWidth="1.5" /><path d="M7 14 H17 L20 28 H4 Z" fill="#06b6d4" stroke="#0e7490" strokeWidth="1.5" /><ellipse cx="12" cy="29" rx="9" ry="2.5" fill="#0e7490" /><circle cx="10" cy="6" r="1.8" fill="#fff" opacity="0.7" /></svg>
                </motion.span>
              )}
            </motion.div>
          )
        })}
        <div className="col-span-2 col-start-2 row-span-2 row-start-2 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[repeating-linear-gradient(90deg,#6b4220_0_18px,#5a3719_18px_20px)] p-3 shadow-[inset_0_0_30px_rgba(0,0,0,0.55),0_6px_0_#3b2412]">
          <div className="flex gap-2"><Die n={dice[0]} rolling={rolling} /><Die n={dice[1]} rolling={rolling} /></div>
          <span className={clsx('num rounded-lg bg-black/50 px-4 py-1.5 font-mono text-2xl font-black ring-1 ring-amber-300/30', outcome?.lost ? 'text-neon-red' : 'text-amber-200')}>{fmtMult(shownMult)}</span>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">{outcome?.lost ? t('play.ladder.snake.lost') : live ? t('play.ladder.snake.hint') : t('play.ladder.snake.idle')}</p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
