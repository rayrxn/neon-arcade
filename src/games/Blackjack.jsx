import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, GameShell, Stage, playOutcome, useRunner } from '@/components/play/GameKit'
import { blackjackAction, blackjackStart, openRound } from '@/services/games'
import { useT } from '@/i18n'

/** Printed felt: curved rail, arc lettering, betting spot, card shoe and chip tray. Purely decorative. */
function Table() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 600 400" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id="bj-rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7c4a1e" /><stop offset="1" stopColor="#3b2210" /></linearGradient>
      </defs>
      <path d="M0 330 Q300 470 600 330 L600 400 L0 400 Z" fill="url(#bj-rail)" />
      <path d="M0 330 Q300 470 600 330" fill="none" stroke="#fcd34d" strokeOpacity="0.35" strokeWidth="2" />
      <ellipse cx="300" cy="335" rx="34" ry="13" fill="none" stroke="#fde68a" strokeOpacity="0.3" strokeWidth="1.5" />
      <g transform="translate(520 34)">
        <rect x="0" y="6" width="54" height="40" rx="5" fill="#0b0f14" stroke="#fcd34d" strokeOpacity="0.4" />
        {[0, 1, 2].map((i) => <rect key={i} x={8 + i * 3} y={-2 + i * 2} width="34" height="26" rx="3" fill="#7f1d1d" stroke="#fca5a5" strokeOpacity="0.5" />)}
      </g>
      <g transform="translate(24 352)">
        <rect width="76" height="26" rx="6" fill="#0b0f14" fillOpacity="0.7" stroke="#fcd34d" strokeOpacity="0.3" />
        {['#ef4444', '#22c55e', '#3b82f6', '#111827', '#a855f7'].map((c, i) => <rect key={c} x={6 + i * 14} y="5" width="10" height="16" rx="2" fill={c} stroke="#fff" strokeOpacity="0.35" />)}
      </g>
    </svg>
  )
}

/** Arc lettering printed in the middle of the felt (kept in its own svg so it never stretches). */
function Lettering({ children }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[44%] flex -translate-y-1/2 flex-col items-center">
      <svg viewBox="0 0 400 70" className="w-[min(78%,420px)]" aria-hidden>
        <defs>
          <path id="bj-arc" d="M30 18 Q200 70 370 18" />
          <path id="bj-arc2" d="M70 34 Q200 76 330 34" />
        </defs>
        <text fontSize="15" fontWeight="800" letterSpacing="4" fill="#fde68a" fillOpacity="0.4" textAnchor="middle" fontFamily="ui-sans-serif, system-ui"><textPath href="#bj-arc" startOffset="50%">BLACKJACK PAYS 3 TO 2</textPath></text>
        <text fontSize="9" fontWeight="700" letterSpacing="2.5" fill="#fde68a" fillOpacity="0.28" textAnchor="middle" fontFamily="ui-sans-serif, system-ui"><textPath href="#bj-arc2" startOffset="50%">DEALER STANDS ON ALL 17s</textPath></text>
      </svg>
      {children}
    </div>
  )
}

/** Empty card outline for the idle table. */
const Slot = () => <span className="h-20 w-14 rounded-lg border-2 border-dashed border-amber-200/20" />

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
    <div className="flex flex-col items-center">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-100/70">
        {label} <span className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-white">{total}</span>
      </p>
      <div className="flex min-h-[7rem] max-w-full justify-center gap-2 overflow-x-auto pb-1">
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
    <Stage className="relative min-h-[360px] space-y-6 bg-[radial-gradient(ellipse_at_50%_25%,#166534_0%,#0b3b20_55%,#04140b_100%)] p-4 sm:p-6">
      <Table />
      <Lettering>{!hand && <p className="rounded-full bg-black/30 px-3 py-1 text-xs font-semibold text-amber-100/70">{t('play.bj.idle')}</p>}</Lettering>
      {hand ? (
        <div className="relative space-y-6 pb-10">
          <Hand label={t('play.bj.dealer')} cards={hand.dealer} total={hand.dealerTotal} />
          <div className="h-6 text-center text-sm font-bold">
            {hand.done && <span className={hand.session?.result === 'win' ? 'text-neon-green' : hand.session?.result === 'push' ? 'text-slate-300' : 'text-neon-red'}>{t(`play.bj.outcomes.${hand.outcome}`)}</span>}
          </div>
          <Hand label={t('play.bj.you')} cards={hand.player} total={hand.playerTotal} />
        </div>
      ) : (
        <div className="relative flex min-h-[320px] flex-col items-center justify-between py-2">
          <div className="flex gap-2"><Slot /><Slot /></div>
          <div className="flex gap-2 pb-10"><Slot /><Slot /></div>
        </div>
      )}
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
