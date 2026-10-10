import { useEffect, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import clsx from 'clsx'
import Logo from '@/components/ui/Logo'
import CoinIcon from '@/components/ui/CoinIcon'
import { GemIcon } from '@/components/ui/Currency'
import { ACCENTS, GAMES } from '@/config/games'
import { useT } from '@/i18n'
import LiveRound from './LiveRound'

function GameMarquee() {
  const items = [...GAMES, ...GAMES]
  const mask = 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)'
  return (
    <div className="relative overflow-hidden" style={{ maskImage: mask, WebkitMaskImage: mask }}>
      <div className="marquee-track flex w-max gap-3">
        {items.map((game, i) => {
          const Icon = game.icon
          return (
            <span key={`${game.slug}-${i}`} className="flex items-center gap-2 rounded-full border hairline bg-white/[0.03] py-2 pl-2 pr-4 text-sm font-semibold text-slate-300 transition hover:-translate-y-0.5 hover:border-white/20 hover:text-white">
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

const EASE = [0.22, 1, 0.36, 1]

/** Judul muncul per kata dari balik garis bawah. */
function Words({ text, delay = 0, className }) {
  return (
    <span className="block">
      {text.split(' ').map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
          <motion.span className={clsx('inline-block', className)} initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: delay + i * 0.08, duration: 0.7, ease: EASE }}>
            {w}{'\u00a0'}
          </motion.span>
        </span>
      ))}
    </span>
  )
}

/** Angka statistik yang naik saat pertama tampil. */
function CountUp({ value }) {
  const n = Number(value)
  const [v, setV] = useState(Number.isFinite(n) ? 0 : value)
  useEffect(() => {
    if (!Number.isFinite(n)) return
    const start = performance.now()
    let raf = 0
    const step = (now) => {
      const k = Math.min(1, (now - start) / 900)
      setV(Math.round(n * (1 - (1 - k) ** 3)))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    const t = setTimeout(() => (raf = requestAnimationFrame(step)), 450)
    return () => { clearTimeout(t); cancelAnimationFrame(raf) }
  }, [n])
  return v
}

const PLAYABLE = GAMES.filter((g) => g.load).length

export default function AuthShowcase() {
  const { t } = useT()
  const stats = [
    { value: String(PLAYABLE), label: t('auth.showcase.games') },
    { value: 'AC + AG', label: t('auth.showcase.currencies') },
    { value: 'SHA-256', label: t('auth.showcase.fair') },
  ]

  // Parallax halus mengikuti kursor.
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 60, damping: 18 })
  const sy = useSpring(my, { stiffness: 60, damping: 18 })
  const coinX = useTransform(sx, (v) => v * 18)
  const coinY = useTransform(sy, (v) => v * 14)
  const cardX = useTransform(sx, (v) => v * -10)
  const cardY = useTransform(sy, (v) => v * -8)
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width - 0.5)
    my.set((e.clientY - r.top) / r.height - 0.5)
  }

  return (
    <aside onPointerMove={onMove} className="relative hidden min-h-dvh flex-col justify-between overflow-hidden border-r hairline p-12 lg:flex xl:p-16">
      <Logo />

      <div className="relative">
        <motion.div style={{ x: coinX, y: coinY }} className="pointer-events-none absolute -top-44 right-4 xl:right-16" aria-hidden>
          <motion.div className="flex items-end gap-3" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1, y: [0, -12, 0] }} transition={{ opacity: { duration: 0.5 }, scale: { duration: 0.8, ease: EASE }, y: { duration: 6, repeat: Infinity, ease: 'easeInOut' } }}>
            <CoinIcon size={104} spin />
            <GemIcon size={56} className="mb-2" />
          </motion.div>
        </motion.div>
        <motion.div style={{ x: cardX, y: cardY }} className="absolute -bottom-24 right-0 hidden 2xl:block xl:right-6">
          <LiveRound label={t('auth.showcase.liveLabel')} crashedLabel={t('auth.showcase.crashed')} />
        </motion.div>

        <div>
          <motion.p className="label-caps text-neon-cyan" initial={{ opacity: 0, letterSpacing: '0.3em' }} animate={{ opacity: 1, letterSpacing: '0.16em' }} transition={{ duration: 0.8, ease: EASE }}>{t('auth.showcase.eyebrow')}</motion.p>
          <h1 className="mt-5 font-display text-5xl font-extrabold leading-[1.04] tracking-tight text-white xl:text-6xl">
            <Words text={t('auth.showcase.line1', { count: PLAYABLE })} delay={0.1} />
            <Words text={t('auth.showcase.line2')} delay={0.3} className="auth-shine" />
          </h1>
          <motion.p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-400" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55, duration: 0.6, ease: EASE }}>{t('auth.showcase.body')}</motion.p>
        </div>

        <motion.dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t hairline pt-6" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.6, ease: EASE }}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="font-mono text-lg font-bold text-white"><CountUp value={stat.value} /></dt>
              <dd className="mt-1 text-xs text-slate-500">{stat.label}</dd>
            </div>
          ))}
        </motion.dl>
      </div>

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.8 }}>
        <GameMarquee />
      </motion.div>
    </aside>
  )
}
