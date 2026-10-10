import { useState } from 'react'
import { motion } from 'framer-motion'
import { Anchor, Castle, Crown, Eye, Feather, Flame, Gem, Heart, Lamp, Moon, Scale, Scroll, Shield, Skull, Sparkles, Star, Sun, Swords, Wand2, Globe, Hourglass, Bell } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Choice, Field, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { playTarot } from '@/services/games'
import { TAROT_CARDS, TAROT_PAY } from '@/config/games2'
import { useT } from '@/i18n'

const RISKS = ['low', 'medium', 'high']
const GLYPH = {
  tower: Castle, death: Skull, devil: Flame, hanged: Anchor, moon: Moon, hermit: Lamp, fool: Feather, temperance: Hourglass, justice: Scale,
  hierophant: Bell, priestess: Eye, strength: Shield, emperor: Crown, empress: Gem, lovers: Heart, chariot: Swords, magician: Wand2,
  judgement: Scroll, wheel: Sparkles, star: Star, sun: Sun, world: Globe,
}

/** Draw three major arcana; the payout is the product of their multipliers. */
export default function Tarot({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [risk, setRisk] = useState('medium')
  const [cards, setCards] = useState(null)
  const [deal, setDeal] = useState(0)
  const [outcome, setOutcome] = useState(null)

  const play = async () => {
    const res = await run(() => playTarot({ bet, risk }))
    if (!res) return
    setCards(res.cards)
    setDeal((d) => d + 1)
    setOutcome(null)
    setTimeout(() => { setOutcome(res); playOutcome(res) }, 1500)
  }

  const best = Math.max(...TAROT_PAY[risk])
  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} />
      <Field label={t('play.tarot.risk')} hint={`${t('play.tarot.max')} ${fmtMult(Math.floor(best ** 3 * 100) / 100)}`}>
        <Choice options={RISKS.map((r) => ({ value: r, label: t(`play.tarot.risks.${r}`) }))} value={risk} onChange={setRisk} />
      </Field>
      <Button size="lg" className="w-full" onClick={play}>{t('play.tarot.draw')}</Button>
      <p className="text-[11px] leading-relaxed text-slate-500">{t('play.tarot.rule')}</p>
    </>
  )

  const stage = (
    <Stage className="p-4 sm:p-8">
      <div className="mx-auto grid max-w-[460px] grid-cols-3 gap-3 sm:gap-5" style={{ perspective: 900 }}>
        {[0, 1, 2].map((i) => {
          const c = cards?.[i]
          const Icon = c ? GLYPH[c.card] ?? Sparkles : Sparkles
          const good = c && c.mult >= 1
          return (
            <motion.div key={`${deal}-${i}`} initial={{ rotateY: cards ? 180 : 0, y: cards ? -12 : 0 }} animate={{ rotateY: 0, y: 0 }}
              transition={{ delay: cards ? 0.35 * i : 0, duration: 0.5 }} style={{ transformStyle: 'preserve-3d' }}
              className={clsx('relative flex aspect-[2/3] flex-col items-center justify-between rounded-2xl p-2.5 ring-1 ring-inset sm:p-3',
                !c ? 'bg-gradient-to-b from-violet-950 to-ink-950 ring-violet-400/25' : good ? 'bg-gradient-to-b from-amber-200/15 to-ink-950 ring-amber-300/50' : 'bg-gradient-to-b from-slate-500/10 to-ink-950 ring-white/10')}>
              {c ? (
                <>
                  <span className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-300 sm:text-xs">{t(`play.tarot.cards.${c.card}`)}</span>
                  <Icon className={clsx('h-10 w-10 sm:h-12 sm:w-12', good ? 'text-amber-300' : 'text-slate-500')} />
                  <span className={clsx('num font-mono text-sm font-black sm:text-base', c.mult === 0 ? 'text-neon-red' : good ? 'text-neon-green' : 'text-slate-300')}>{fmtMult(c.mult)}</span>
                </>
              ) : (
                <div className="grid h-full w-full place-items-center rounded-xl border border-violet-300/20"><Sparkles className="h-8 w-8 text-violet-300/60" /></div>
              )}
            </motion.div>
          )
        })}
      </div>
      <p className="mt-5 text-center text-xs text-slate-500">{cards ? `${cards.map((c) => fmtMult(c.mult)).join(' × ')}` : t('play.tarot.idle')}</p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
