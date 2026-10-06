import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Crown, ExternalLink, Flame, Gem, WalletCards } from 'lucide-react'
import clsx from 'clsx'
import { useCatalog, useExtras } from '@/services/platform2'
import { SERVER_MODE } from '@/config/runtime'
import { formatLeft } from '@/utils/format'
import { useNow } from '@/hooks/useNow'
import { useT } from '@/i18n'

const ROBLOX = 'https://www.roblox.com/games/87122632491799/Merge-Inc'

/**
 * Event banner on the dashboard: battle pass, VVIP, loyalty and the Roblox mission, rotating every 7 s.
 * Hover or focus pauses the rotation; dots switch slides.
 */
export default function EventBanner() {
  const { t } = useT()
  const catalog = useCatalog()
  const { pass, membership, loyalty } = useExtras()
  const now = useNow(60_000)
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)

  const slides = [
    pass && {
      key: 'pass', to: '/pass', icon: Flame, tone: 'event--pass',
      eyebrow: t('event.pass.eyebrow', { id: pass.seasonId, time: formatLeft(pass.endAt - now) }),
      title: t('event.pass.title'),
      body: pass.premium ? t('event.pass.bodyPremium', { tier: pass.tier }) : t('event.pass.body', { tier: pass.tier }),
      cta: t('event.pass.cta'),
    },
    !membership && {
      key: 'vvip', to: '/membership', icon: Gem, tone: 'event--vvip',
      eyebrow: t('event.vvip.eyebrow'), title: t('event.vvip.title'), body: t('event.vvip.body'), cta: t('event.vvip.cta'),
    },
    membership && {
      key: 'member', to: '/membership', icon: Crown, tone: 'event--vvip',
      eyebrow: membership.tier.toUpperCase(), title: t('event.member.title'), body: t('event.member.body'), cta: t('event.member.cta'),
    },
    {
      key: 'roblox', href: ROBLOX, icon: ExternalLink, tone: 'event--roblox',
      eyebrow: t('event.roblox.eyebrow'), title: 'Merge Inc.', body: t('event.roblox.body'), cta: t('event.roblox.cta'), secondary: { to: '/rewards', label: t('event.roblox.claim') },
    },
    loyalty && catalog.cards?.length > 0 && {
      key: 'loyalty', to: '/loyalty', icon: WalletCards, tone: 'event--loyalty',
      eyebrow: t('event.loyalty.eyebrow'), title: t('event.loyalty.title'), body: t('event.loyalty.body'), cta: t('event.loyalty.cta'),
    },
  ].filter(Boolean)

  const n = slides.length
  useEffect(() => {
    if (paused || n < 2) return
    const id = setInterval(() => setI((x) => (x + 1) % n), 7000)
    return () => clearInterval(id)
  }, [paused, n])

  if (!SERVER_MODE || !n) return null
  const s = slides[i % n]
  const Icon = s.icon
  const Cta = s.href ? 'a' : Link
  const ctaProps = s.href ? { href: s.href, target: '_blank', rel: 'noreferrer noopener' } : { to: s.to }

  return (
    <section
      className={clsx('event-banner relative isolate overflow-hidden rounded-2xl ring-1 ring-inset ring-white/10', s.tone)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      <span className="event-banner__shine" aria-hidden="true" />
      <AnimatePresence mode="wait">
        <motion.div
          key={s.key}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="relative grid min-h-[176px] gap-5 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-7"
        >
          <div className="min-w-0">
            <p className="label-caps text-white/70">{s.eyebrow}</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{s.title}</h2>
            <p className="mt-2 max-w-xl text-sm text-white/75">{s.body}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Cta {...ctaProps} className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-ink-950 transition hover:brightness-95 focus-ring">
                {s.cta} <ArrowRight className="h-4 w-4" />
              </Cta>
              {s.secondary && <Link to={s.secondary.to} className="inline-flex h-10 items-center rounded-xl bg-white/10 px-4 text-sm font-bold text-white transition hover:bg-white/15">{s.secondary.label}</Link>}
            </div>
          </div>
          <span className="event-banner__icon hidden h-28 w-28 place-items-center rounded-3xl sm:grid" aria-hidden="true"><Icon className="h-12 w-12" /></span>
        </motion.div>
      </AnimatePresence>
      {n > 1 && (
        <div className="absolute bottom-3 right-4 flex gap-1.5">
          {slides.map((x, k) => (
            <button key={x.key} onClick={() => setI(k)} aria-label={x.title} aria-current={k === i % n} className={clsx('h-1.5 rounded-full transition-all', k === i % n ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70')} />
          ))}
        </div>
      )}
    </section>
  )
}
