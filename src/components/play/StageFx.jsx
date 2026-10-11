import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { coinBurst, lossShake, winPop } from '@/lib/motion'
import { formatCoins } from '@/utils/format'

/**
 * Shared result effects for every game stage (Figma Motion Kit): on a win, coins burst from the centre and a
 * multiplier badge pops; on a loss, the stage shakes. Plays once per round, after the game's own reveal.
 */
export default function StageFx({ outcome, children }) {
  const s = outcome?.session
  const id = s?.id ?? null
  const [fx, setFx] = useState(null)
  useEffect(() => {
    if (!s || outcome?.duplicate) return
    const kind = s.result === 'win' || (s.payout > s.bet && s.result !== 'push') ? 'win' : s.result === 'push' ? null : 'loss'
    if (!kind) return
    setFx({ id, kind, mult: s.multiplier, net: s.payout - s.bet, cur: s.currency ?? 'AC' })
    const t = setTimeout(() => setFx(null), kind === 'win' ? 1700 : 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  const coins = fx?.kind === 'win' ? Math.min(24, 10 + Math.floor(Math.log2(Math.max(1, fx.mult)) * 3)) : 0
  return (
    <motion.div className="relative" key={fx?.kind === 'loss' ? `l-${fx.id}` : 'stage'} animate={fx?.kind === 'loss' ? lossShake.animate : undefined} transition={lossShake.transition}>
      {children}
      <AnimatePresence>
        {fx?.kind === 'win' && (
          <motion.div key={fx.id} className="pointer-events-none absolute inset-0 z-30 grid place-items-center overflow-hidden rounded-2xl" exit={{ opacity: 0, transition: { duration: 0.25 } }}>
            <motion.div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(250,204,21,0.18),transparent_60%)]" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.6] }} transition={{ duration: 0.6 }} />
            {Array.from({ length: coins }, (_, k) => {
              const c = coinBurst(k, coins, 110)
              return <motion.span key={k} {...c} className="absolute h-4 w-4 rounded-full bg-gradient-to-br from-amber-200 to-amber-500 shadow-[0_0_8px_rgba(250,204,21,0.7)] ring-1 ring-amber-700/40" />
            })}
            <motion.div {...winPop} className="relative rounded-2xl bg-ink-950/80 px-5 py-2.5 text-center ring-2 ring-neon-gold/70 shadow-[0_0_40px_-6px_rgba(250,204,21,0.6)] backdrop-blur-sm">
              <p className="num font-display text-3xl font-black text-neon-gold sm:text-4xl">{(fx.mult ?? 0).toFixed(2)}×</p>
              <p className="num font-mono text-sm font-bold text-neon-green">+{formatCoins(fx.net)} {fx.cur}</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
