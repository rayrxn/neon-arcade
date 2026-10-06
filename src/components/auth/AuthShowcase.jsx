import { motion } from 'framer-motion'
import clsx from 'clsx'
import Logo from '@/components/ui/Logo'
import CoinIcon from '@/components/ui/CoinIcon'
import { GemIcon } from '@/components/ui/Currency'
import { ACCENTS, GAMES } from '@/config/games'
import { useT } from '@/i18n'

function GameMarquee() {
  const items = [...GAMES, ...GAMES]
  const mask = 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)'
  return (
    <div className="relative overflow-hidden" style={{ maskImage: mask, WebkitMaskImage: mask }}>
      <div className="marquee-track flex w-max gap-3">
        {items.map((game, i) => {
          const Icon = game.icon
          return (
            <span key={`${game.slug}-${i}`} className="flex items-center gap-2 rounded-full border hairline bg-white/[0.03] py-2 pl-2 pr-4 text-sm font-semibold text-slate-300">
              <span className={clsx('grid h-7 w-7 place-items-center rounded-full ring-1 ring-inset', ACCENTS[game.accent].tile)}>
                <Icon className={clsx('h-3.5 w-3.5', ACCENTS[game.accent].text)} />
              </span>
              {game.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function AuthShowcase() {
  const { t } = useT()
  const stats = [
    { value: '11', label: t('auth.showcase.games') },
    { value: 'AC + AG', label: t('auth.showcase.currencies') },
    { value: 'SHA-256', label: t('auth.showcase.fair') },
  ]

  return (
    <aside className="relative hidden min-h-dvh flex-col justify-between overflow-hidden border-r hairline p-12 lg:flex xl:p-16">
      <Logo />

      <div className="relative">
        <motion.div className="pointer-events-none absolute -top-40 right-4 flex items-end gap-3 xl:right-16" animate={{ y: [0, -12, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} aria-hidden>
          <CoinIcon size={104} spin />
          <GemIcon size={56} className="mb-2" />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <p className="label-caps text-neon-cyan">{t('auth.showcase.eyebrow')}</p>
          <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.04] tracking-tight text-white xl:text-6xl">
            {t('auth.showcase.line1')}
            <br />
            <span className="text-slate-500">{t('auth.showcase.line2')}</span>
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-400">{t('auth.showcase.body')}</p>
        </motion.div>

        <motion.dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t hairline pt-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3, duration: 0.6 }}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="font-mono text-lg font-bold text-white">{stat.value}</dt>
              <dd className="mt-1 text-xs text-slate-500">{stat.label}</dd>
            </div>
          ))}
        </motion.dl>
      </div>

      <GameMarquee />
    </aside>
  )
}
