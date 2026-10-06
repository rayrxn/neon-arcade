import { useState } from 'react'
import { motion } from 'framer-motion'
import { Bomb, Gem } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { minesCashout, minesMultiplier, minesReveal, minesStart, openRound } from '@/services/games'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

export default function Mines({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const resumed = openRound('mines')
  const [bet, setBet] = useState(resumed?.bet ?? 100)
  const [mines, setMines] = useState(resumed?.mines ?? 3)
  const [round, setRound] = useState(resumed) // { id, mines, revealed }
  const [board, setBoard] = useState(null) // { mines: [...], revealed: [...], hit }
  const [outcome, setOutcome] = useState(null)

  const picks = round?.revealed.length ?? 0
  const current = round ? minesMultiplier(round.mines, picks) : 1
  const next = round ? minesMultiplier(round.mines, picks + 1) : minesMultiplier(mines, 1)

  const finishRound = (res) => {
    setRound(null)
    setBoard({ mines: res.mines, revealed: res.revealed, hit: res.hit })
    setOutcome(res)
    if (res.hit == null) playOutcome(res)
  }

  const start = async () => {
    const res = await run(() => minesStart({ bet, mines }))
    if (!res) return
    setBoard(null)
    setOutcome(null)
    setRound(res)
  }

  const reveal = async (i) => {
    if (!round || round.revealed.includes(i)) return
    const res = await run(() => minesReveal(round.id, i))
    if (!res) return
    if (res.done) finishRound(res)
    else setRound((r) => (r && r.id === round.id ? { ...r, revealed: res.revealed } : r))
  }

  const cashout = async () => {
    if (!round) return
    const res = await run(() => minesCashout(round.id))
    if (res?.done) finishRound(res)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={!!round} />
      <Field label={t('play.mines.count')} hint={`${25 - mines} ${t('play.mines.gems')}`}>
        <div className="flex items-center gap-3">
          <input id="mines-count" type="range" min={1} max={24} value={mines} disabled={!!round} onChange={(e) => setMines(Number(e.target.value))} className="flex-1 accent-[rgb(var(--neon-green))]" />
          <span className="num w-8 text-right font-mono text-sm font-bold text-white">{mines}</span>
        </div>
      </Field>
      {round ? (
        <Button size="lg" variant="gold" className="w-full" onClick={cashout}>
          {picks ? `${t('play.crash.cashout')} · ${formatCoins(Math.floor(bet * current))} AC` : t('play.mines.cancel')}
        </Button>
      ) : (
        <Button size="lg" className="w-full" onClick={start}>{t('play.play')}</Button>
      )}
      <dl className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-xl bg-white/[0.03] py-2 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('play.multiplier')}</dt>
          <dd className="num font-mono text-sm font-bold text-white">{fmtMult(current)}</dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] py-2 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('play.mines.next')}</dt>
          <dd className="num font-mono text-sm font-bold text-neon-green">{fmtMult(next)}</dd>
        </div>
      </dl>
    </>
  )

  const revealed = round?.revealed ?? board?.revealed ?? []
  const stage = (
    <Stage className="p-4 sm:p-6">
      <div className="mx-auto grid max-w-[440px] grid-cols-5 gap-2 sm:gap-2.5">
        {Array.from({ length: 25 }, (_, i) => {
          const isGem = revealed.includes(i)
          const isMine = board?.mines?.includes(i)
          const shown = isGem || (board && isMine)
          return (
            <motion.button
              key={i}
              whileTap={round && !isGem ? { scale: 0.92 } : undefined}
              disabled={!round || isGem}
              onClick={() => reveal(i)}
              aria-label={`${t('play.mines.tile')} ${i + 1}`}
              className={clsx(
                'grid aspect-square place-items-center rounded-xl transition-colors',
                !shown && (round ? 'bg-white/[0.07] hover:bg-white/[0.12] ring-1 ring-inset ring-white/[0.08]' : 'bg-white/[0.04] ring-1 ring-inset ring-white/[0.05]'),
                isGem && 'bg-neon-green/15 ring-1 ring-inset ring-neon-green/40',
                board && isMine && (board.hit === i ? 'bg-neon-red/30 ring-2 ring-inset ring-neon-red' : 'bg-neon-red/10'),
                board && !isGem && !isMine && 'opacity-40',
              )}
            >
              {isGem && <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}><Gem className="h-6 w-6 text-neon-green sm:h-7 sm:w-7" /></motion.span>}
              {board && isMine && <Bomb className="h-6 w-6 text-neon-red sm:h-7 sm:w-7" />}
            </motion.button>
          )
        })}
      </div>
      <p className="mt-4 text-center text-xs text-slate-500">{round ? t('play.mines.pick') : t('play.mines.idle')}</p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
