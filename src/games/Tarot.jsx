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
    setTimeout(() => { setOutcome(res); playOutcome(res) }, 1900)
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
    <Stage className="relative overflow-hidden bg-[radial-gradient(ellipse_at_50%_40%,#4c1d95_0%,#1e1035_55%,#0b0716_100%)] p-4 sm:p-8">
      <div className="pointer-events-none absolute inset-3 rounded-[22px] border border-amber-300/30" />
      <div className="pointer-events-none absolute inset-5 rounded-[18px] border border-amber-300/10" />
      {[{ l: '5%' }, { r: '5%' }].map((pos, i) => (
        <div key={i} className="pointer-events-none absolute bottom-6 hidden flex-col items-center sm:flex" style={pos.l ? { left: pos.l } : { right: pos.r }}>
          <motion.span className="h-6 w-3 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-gradient-to-t from-orange-500 via-amber-300 to-yellow-100 shadow-[0_0_24px_8px_rgba(251,191,36,0.35)]"
            animate={{ scaleY: [1, 1.18, 0.92, 1], rotate: [-3, 3, -2, 0] }} transition={{ duration: 0.9 + i * 0.2, repeat: Infinity }} />
          <span className="h-0.5 w-0.5 bg-slate-900" />
          <span className="h-16 w-5 rounded-sm bg-gradient-to-b from-amber-50 to-amber-200/80" />
        </div>
      ))}
      <motion.div className="pointer-events-none absolute left-1/2 top-[58%] h-40 w-72 -translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" animate={{ opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 3, repeat: Infinity }} />
      <div className="mx-auto grid max-w-[460px] grid-cols-3 gap-3 sm:gap-5">
        {[0, 1, 2].map((i) => {
          const c = cards?.[i]
          const Icon = c ? GLYPH[c.card] ?? Sparkles : Sparkles
          const good = c && c.mult >= 1
          return (
            <motion.div key={`${deal}-${i}`} className="relative aspect-[2/3] [perspective:1000px]"
              initial={cards ? { y: -40, opacity: 0, rotate: -6 + i * 6 } : false} animate={{ y: 0, opacity: 1, rotate: 0 }} transition={{ delay: 0.08 * i, type: 'spring', stiffness: 260, damping: 20 }}>
              <motion.div className="na-3d absolute inset-0" initial={false} animate={{ rotateY: c ? 180 : 0 }}
                transition={{ delay: cards ? 0.45 + 0.4 * i : 0, duration: 0.6, ease: [0.3, 1.4, 0.5, 1] }}>
                <div className="na-back absolute inset-0 grid place-items-center rounded-2xl bg-gradient-to-b from-violet-900 via-indigo-950 to-ink-950 p-2 ring-1 ring-inset ring-violet-400/30">
                  <div className="grid h-full w-full place-items-center rounded-xl border border-violet-300/25 bg-[radial-gradient(circle_at_50%_40%,rgba(167,139,250,0.25),transparent_60%)]">
                    <Sparkles className="h-9 w-9 text-violet-300/70" />
                  </div>
                </div>
                <div className={clsx('na-back absolute inset-0 flex flex-col items-center justify-between rounded-2xl p-2.5 ring-1 ring-inset [transform:rotateY(180deg)] sm:p-3',
                  good ? 'bg-gradient-to-b from-amber-200/20 via-amber-900/10 to-ink-950 ring-amber-300/60 shadow-[0_0_30px_-6px_rgba(251,191,36,0.55)]' : c?.mult === 0 ? 'bg-gradient-to-b from-red-500/15 to-ink-950 ring-red-400/30' : 'bg-gradient-to-b from-slate-500/10 to-ink-950 ring-white/10')}>
                  <span className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-200 sm:text-xs">{c ? t(`play.tarot.cards.${c.card}`) : ''}</span>
                  <Icon className={clsx('h-10 w-10 sm:h-12 sm:w-12', good ? 'text-amber-300' : 'text-slate-500')} />
                  <span className={clsx('num font-mono text-sm font-black sm:text-base', c?.mult === 0 ? 'text-neon-red' : good ? 'text-neon-green' : 'text-slate-300')}>{c ? fmtMult(c.mult) : ''}</span>
                </div>
              </motion.div>
            </motion.div>
          )
        })}
      </div>
      <p className="mt-5 text-center text-xs text-slate-500">{cards ? `${cards.map((c) => fmtMult(c.mult)).join(' × ')}` : t('play.tarot.idle')}</p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
