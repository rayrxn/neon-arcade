import { useEffect, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import clsx from 'clsx'
import Logo from '@/components/ui/Logo'
import CoinIcon from '@/components/ui/CoinIcon'
import { GemIcon } from '@/components/ui/Currency'
import { ACCENTS, GAMES } from '@/config/games'
import { useT } from '@/i18n'
import LiveRound from './LiveRound'

const EASE = [0.22, 1, 0.36, 1]
const PLAYABLE = GAMES.filter((g) => g.load).length

/** The 1.0 mark, large: chip ring segments drifting around the arcade A. */
export function BrandMark({ size = 280, className }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={clsx('overflow-visible', className)} aria-hidden>
      <defs>
        <linearGradient id="bm-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22e1ff" /><stop offset="1" stopColor="#7c5cff" /></linearGradient>
        <radialGradient id="bm-glow"><stop offset="0" stopColor="#22e1ff" stopOpacity="0.28" /><stop offset="1" stopColor="#22e1ff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="16" cy="16" r="22" fill="url(#bm-glow)" />
      <circle cx="16" cy="16" r="15" fill="#0a0d18" />
      <g className="brand-ring"><circle cx="16" cy="16" r="13.2" fill="none" stroke="url(#bm-ring)" strokeWidth="2.6" strokeDasharray="7.37 3" transform="rotate(-128.5 16 16)" /></g>
      <circle cx="16" cy="16" r="9.4" fill="none" stroke="#22e1ff" strokeOpacity="0.22" strokeWidth="0.8" />
      <circle cx="16" cy="16" r="17.6" fill="none" stroke="rgba(236,232,223,0.14)" strokeWidth="0.25" strokeDasharray="0.6 1.4" className="brand-orbit" />
      <motion.path d="M10.6 21.6 16 10.2 21.4 21.6" fill="none" stroke="#f4f1ea" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.2, ease: EASE }} />
      <motion.circle cx="16" cy="18" r="2.1" fill="#ffc83d" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.1, type: 'spring', stiffness: 380, damping: 14 }} />
    </svg>
  )
}

function GameTicker() {
  const items = [...GAMES, ...GAMES]
  const mask = 'linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)'
  return (
    <div className="relative overflow-hidden" style={{ maskImage: mask, WebkitMaskImage: mask }}>
      <div className="marquee-track flex w-max gap-2.5">
        {items.map((game, i) => {
          const Icon = game.icon
          return (
            <span key={`${game.slug}-${i}`} className="flex items-center gap-2 rounded-lg border hairline bg-white/[0.025] py-1.5 pl-1.5 pr-3 text-[13px] font-semibold text-slate-300">
              <span className={clsx('grid h-6 w-6 place-items-center rounded-md ring-1 ring-inset', ACCENTS[game.accent].tile)}><Icon className={clsx('h-3.5 w-3.5', ACCENTS[game.accent].text)} /></span>
              {game.name}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function Clock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id) }, [])
  return <span className="tabular-nums">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
}

const Corner = ({ className }) => <span className={clsx('pointer-events-none absolute h-6 w-6 border-white/40', className)} aria-hidden />

/**
 * Sign-in stage (desktop): HUD frame, the big brand mark, a kinetic headline, live round card and a game ticker.
 * Same visual language as the 1.0 release reel.
 */
export default function AuthShowcase() {
  const { t } = useT()
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 50, damping: 16 })
  const sy = useSpring(my, { stiffness: 50, damping: 16 })
  const markX = useTransform(sx, (v) => v * 10)
  const markY = useTransform(sy, (v) => v * 8)
  const cardX = useTransform(sx, (v) => v * -12)
  const cardY = useTransform(sy, (v) => v * -10)
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    mx.set((e.clientX - r.left) / r.width - 0.5)
    my.set((e.clientY - r.top) / r.height - 0.5)
  }
  const stats = [
    { value: String(PLAYABLE), label: t('auth.showcase.games') },
    { value: 'AC · AG', label: t('auth.showcase.currencies') },
    { value: 'SHA-256', label: t('auth.showcase.fair') },
  ]

  return (
    <aside onPointerMove={onMove} className="auth-stage relative hidden min-h-dvh flex-col justify-between overflow-hidden border-r hairline px-12 py-10 lg:flex xl:px-16">
      <Corner className="left-6 top-6 border-l-2 border-t-2" />
      <Corner className="right-6 top-6 border-r-2 border-t-2" />
      <Corner className="bottom-6 left-6 border-b-2 border-l-2" />
      <Corner className="bottom-6 right-6 border-b-2 border-r-2" />

      <div className="relative flex items-center justify-between">
        <Logo />
        <span className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500"><span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-neon-green align-middle" />{t('auth.stage.live')} · <Clock /></span>
      </div>

      <div className="relative grid flex-1 items-center">
        <div className="relative max-w-xl">
          <motion.div style={{ x: markX, y: markY }} className="pointer-events-none mb-8 w-fit" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 1, ease: EASE }}>
            <BrandMark size={132} />
          </motion.div>
          <motion.p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-neon-cyan" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, ease: EASE }}>{t('auth.showcase.eyebrow')}</motion.p>
          <h1 className="auth-headline mt-5 text-white">
            {[t('auth.showcase.line1', { count: PLAYABLE }), t('auth.showcase.line2')].map((line, li) => (
              <span key={li} className="block overflow-hidden pb-[0.06em]">
                <motion.span className={clsx('inline-block', li === 1 && 'auth-shine')} initial={{ y: '105%' }} animate={{ y: 0 }} transition={{ delay: 0.15 + li * 0.14, duration: 0.8, ease: EASE }}>{line}</motion.span>
              </span>
            ))}
          </h1>
          <motion.p className="mt-6 max-w-md text-[15px] leading-relaxed text-slate-400" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.6, ease: EASE }}>{t('auth.showcase.body')}</motion.p>

          <motion.dl className="mt-9 grid max-w-md grid-cols-3 border-y hairline" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65, duration: 0.6, ease: EASE }}>
            {stats.map((s, i) => (
              <div key={s.label} className={clsx('py-4', i > 0 && 'border-l hairline pl-5')}>
                <dt className="font-mono text-lg font-bold text-white">{s.value}</dt>
                <dd className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</dd>
              </div>
            ))}
          </motion.dl>

          <motion.div className="mt-8 flex items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            <motion.span animate={{ y: [0, -5, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}><CoinIcon size={34} /></motion.span>
            <motion.span animate={{ y: [0, -5, 0] }} transition={{ duration: 4.5, delay: 0.6, repeat: Infinity, ease: 'easeInOut' }}><GemIcon size={30} /></motion.span>
            <span className="text-xs text-slate-500">{t('auth.stage.bonus')}</span>
          </motion.div>
        </div>

        <motion.div style={{ x: cardX, y: cardY }} className="absolute bottom-6 right-0 hidden 2xl:block">
          <LiveRound label={t('auth.showcase.liveLabel')} crashedLabel={t('auth.showcase.crashed')} />
        </motion.div>
      </div>

      <motion.div className="relative space-y-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9, duration: 0.8 }}>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">{t('auth.stage.playing')}</p>
        <GameTicker />
      </motion.div>
    </aside>
  )
}
