import { motion } from 'framer-motion'

const SHARDS = Array.from({ length: 12 }, (_, i) => ({ a: (i / 12) * Math.PI * 2 + (i % 2) * 0.2, d: 0.7 + (i % 3) * 0.18, c: ['#fde047', '#fb923c', '#ef4444'][i % 3] }))
const SMOKE = Array.from({ length: 6 }, (_, i) => ({ x: Math.cos(i) * 0.35, y: -0.15 - (i % 3) * 0.12, s: 0.5 + (i % 2) * 0.25 }))

/** Bomb blast: white flash, fireball, flying shards and rising smoke. Plays once; place it inside a relative box. */
export default function Explosion({ size = 160, className = '' }) {
  const h = size / 2
  return (
    <div className={`pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox={`${-h} ${-h} ${size} ${size}`} width={size} height={size} overflow="visible">
        <defs>
          <radialGradient id="exp-fire">
            <stop offset="0" stopColor="#fff7ed" />
            <stop offset="0.35" stopColor="#fde047" />
            <stop offset="0.7" stopColor="#f97316" />
            <stop offset="1" stopColor="#dc2626" stopOpacity="0" />
          </radialGradient>
        </defs>
        {SMOKE.map((p, i) => (
          <motion.circle key={`s${i}`} cx={p.x * h} r={h * 0.28 * p.s} fill="#475569" initial={{ cy: 0, opacity: 0, scale: 0.4 }} animate={{ cy: p.y * size, opacity: [0, 0.55, 0], scale: 1.4 }} transition={{ duration: 1.3, delay: 0.15 + i * 0.04, ease: 'easeOut' }} />
        ))}
        <motion.circle r={h} fill="url(#exp-fire)" initial={{ scale: 0.1, opacity: 1 }} animate={{ scale: [0.1, 1.1, 1.25], opacity: [1, 1, 0] }} transition={{ duration: 0.7, ease: 'easeOut' }} />
        {SHARDS.map((p, i) => (
          <motion.rect key={i} x={-3} y={-3} width={6} height={10} rx={2} fill={p.c} initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }} animate={{ x: Math.cos(p.a) * h * p.d, y: Math.sin(p.a) * h * p.d, rotate: 240, opacity: 0 }} transition={{ duration: 0.75, ease: [0.2, 0.7, 0.3, 1] }} />
        ))}
        <motion.circle r={h * 0.6} fill="#fff" initial={{ opacity: 0.95, scale: 0.3 }} animate={{ opacity: 0, scale: 1.6 }} transition={{ duration: 0.3 }} />
      </svg>
    </div>
  )
}
