import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, GameShell, Stage, playOutcome, useRunner } from '@/components/play/GameKit'
import { blackjackAction, blackjackStart, openRound } from '@/services/games'
import { useT } from '@/i18n'

const SUIT = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }

function Card({ card, index }) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  return (
    <motion.div
      initial={{ y: -30, opacity: 0, rotateY: 90 }}
      animate={{ y: 0, opacity: 1, rotateY: 0 }}
      transition={{ delay: index * 0.08, duration: 0.3 }}
      className={clsx(
        'relative grid h-24 w-16 shrink-0 place-items-center rounded-xl shadow-pop sm:h-28 sm:w-20',
        card.hidden ? 'bg-gradient-to-br from-[#1c2a52] to-[#0c1430] ring-1 ring-inset ring-neon-cyan/30' : 'bg-[#f7f8fb] ring-1 ring-black/10',
      )}
    >
      {!card.hidden && (
        <>
          <span className={clsx('absolute left-1.5 top-1 font-mono text-sm font-bold leading-none', red ? 'text-[#d6243f]' : 'text-[#141822]')}>{card.rank}</span>
          <span className={clsx('text-3xl', red ? 'text-[#d6243f]' : 'text-[#141822]')}>{SUIT[card.suit]}</span>
        </>
      )}
    </motion.div>
  )
}

function Hand({ label, cards, total }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-400">
        {label} <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-white">{total}</span>
      </p>
      <div className="flex min-h-[7rem] gap-2 overflow-x-auto pb-1">
        <AnimatePresence>{cards.map((c, i) => <Card key={c.id + i} card={c} index={i} />)}</AnimatePresence>
      </div>
    </div>
  )
}

export default function Blackjack({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [hand, setHand] = useState(() => openRound('blackjack'))
  const [outcome, setOutcome] = useState(null)
  const active = hand && !hand.done

  const apply = (res) => {
    if (!res) return
    setHand(res)
    if (res.done && res.session) {
      setOutcome(res)
      setTimeout(() => playOutcome(res), 400)
    }
  }

  const deal = async () => {
    setOutcome(null)
    apply(await run(() => blackjackStart({ bet })))
  }
  const act = async (a) => apply(await run(() => blackjackAction(hand.id, a)))

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={active} />
      {active ? (
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => act('hit')}>{t('play.bj.hit')}</Button>
          <Button variant="ghost" onClick={() => act('stand')}>{t('play.bj.stand')}</Button>
          <Button variant="gold" disabled={!hand.canDouble} onClick={() => act('double')}>{t('play.bj.double')}</Button>
        </div>
      ) : (
        <Button size="lg" className="w-full" onClick={deal}>{t('play.bj.deal')}</Button>
      )}
      <p className="text-xs leading-relaxed text-slate-500">{t('play.bj.rules')}</p>
    </>
  )

  const stage = (
    <Stage className="space-y-6 p-4 sm:p-6">
      {hand ? (
        <>
          <Hand label={t('play.bj.dealer')} cards={hand.dealer} total={hand.dealerTotal} />
          <div className="h-6 text-center text-sm font-bold">
            {hand.done && <span className={hand.session?.result === 'win' ? 'text-neon-green' : hand.session?.result === 'push' ? 'text-slate-300' : 'text-neon-red'}>{t(`play.bj.outcomes.${hand.outcome}`)}</span>}
          </div>
          <Hand label={t('play.bj.you')} cards={hand.player} total={hand.playerTotal} />
        </>
      ) : (
        <div className="grid min-h-[280px] place-items-center text-sm text-slate-500">{t('play.bj.idle')}</div>
      )}
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
