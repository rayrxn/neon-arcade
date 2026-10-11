import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import Explosion from '@/components/play/Explosion'
import { fmtMult } from '@/components/play/GameKit'
import { ladderMult, ladderP } from '@/config/games2'
import { useT } from '@/i18n'

/** Chance + next multiplier pill shared by Slice, Moles and Layer. */
function Odds({ game, mode, step, className }) {
  const { t } = useT()
  return (
    <div className={clsx('flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 font-mono text-xs font-bold text-white backdrop-blur', className)}>
      <span className="text-neon-green">{fmtMult(ladderMult(game, mode, step + 1))}</span>
      <span className="text-white/40">·</span>
      <span>{t('play.ladder.chance')} {(ladderP(game, mode) * 100).toFixed(2)}%</span>
    </div>
  )
}

/** Running multiplier + one chip per cleared step. */
function Tally({ game, mode, step }) {
  const { t } = useT()
  return (
    <div className="absolute left-3 top-3 z-10 max-w-[60%] rounded-xl bg-black/45 p-2.5 backdrop-blur">
      <p className="flex items-center gap-3 text-xs font-semibold text-white/70">{t('play.multiplier')} <b className="num font-mono text-base text-white">{fmtMult(ladderMult(game, mode, step))}</b></p>
      {step > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {Array.from({ length: Math.min(step, 8) }, (_, i) => {
            const k = step - Math.min(step, 8) + i + 1
            return <span key={k} className="rounded bg-neon-green px-1.5 py-0.5 font-mono text-[10px] font-black text-ink-950">{fmtMult(ladderMult(game, mode, k))}</span>
          })}
        </div>
      )}
    </div>
  )
}

// ───────────────────────────── Slice ─────────────────────────────

const FRUITS = [
  { c: '#ef4444', in: '#fca5a5', seed: '#1f2937', leaf: '#16a34a' }, // watermelon (red flesh)
  { c: '#facc15', in: '#fef08a', seed: '#a16207', leaf: '#65a30d' }, // pineapple
  { c: '#f97316', in: '#fed7aa', seed: '#fff7ed', leaf: '#15803d' }, // orange
  { c: '#84cc16', in: '#d9f99d', seed: '#3f6212', leaf: '#4d7c0f' }, // lime
  { c: '#e11d48', in: '#fecdd3', seed: '#78350f', leaf: '#166534' }, // apple
]

function Fruit({ f, half }) {
  // half: undefined = whole, 'l' / 'r' = cut halves showing the inside.
  const clip = half === 'l' ? 'inset(0 50% 0 0)' : half === 'r' ? 'inset(0 0 0 50%)' : undefined
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_10px_14px_rgba(0,0,0,0.45)]" style={{ clipPath: clip }} aria-hidden>
      <path d="M50 14 C46 4 40 2 34 4 C40 8 44 12 46 18 Z" fill={f.leaf} />
      <path d="M52 16 C58 6 66 4 72 8 C64 10 58 14 54 20 Z" fill={f.leaf} />
      <circle cx="50" cy="56" r="36" fill={f.c} />
      {half ? (
        <>
          <circle cx="50" cy="56" r="30" fill={f.in} />
          {[0, 60, 120, 180, 240, 300].map((a) => <ellipse key={a} cx={50 + Math.cos((a * Math.PI) / 180) * 16} cy={56 + Math.sin((a * Math.PI) / 180) * 16} rx="2.5" ry="4" fill={f.seed} transform={`rotate(${a} ${50 + Math.cos((a * Math.PI) / 180) * 16} ${56 + Math.sin((a * Math.PI) / 180) * 16})`} />)}
        </>
      ) : (
        <ellipse cx="36" cy="42" rx="10" ry="6" fill="#fff" opacity="0.35" transform="rotate(-30 36 42)" />
      )}
    </svg>
  )
}

function BombSvg() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <path d="M62 22 Q70 8 82 10" stroke="#a16207" strokeWidth="4" fill="none" />
      <circle cx="84" cy="10" r="5" fill="#fde047" />
      <rect x="54" y="20" width="16" height="12" rx="3" fill="#334155" transform="rotate(35 62 26)" />
      <circle cx="46" cy="58" r="34" fill="#1e293b" />
      <ellipse cx="34" cy="44" rx="10" ry="6" fill="#fff" opacity="0.25" transform="rotate(-30 34 44)" />
    </svg>
  )
}

export function SliceBoard({ mode, live, end, step, onGo }) {
  const lost = end?.lost
  const f = FRUITS[step % FRUITS.length]
  const prev = FRUITS[(step + FRUITS.length - 1) % FRUITS.length]
  return (
    <div className="relative h-[380px] overflow-hidden rounded-xl bg-[repeating-linear-gradient(180deg,#8b5a2b_0_58px,#6b4220_58px_62px)] shadow-[inset_0_0_80px_rgba(0,0,0,0.45)]">
      <Tally game="slice" mode={mode} step={step} />
      <AnimatePresence>
        {step > 0 && !lost && (
          <motion.div key={`cut${step}`} className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 0.6, duration: 0.4 }}>
            <motion.div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(239,68,68,0.55),transparent_65%)]" initial={{ scale: 0.3 }} animate={{ scale: 1.8 }} transition={{ duration: 0.5 }} />
            <motion.div className="absolute inset-0" initial={{ x: 0, rotate: 0 }} animate={{ x: -70, y: 40, rotate: -35 }} transition={{ duration: 0.6 }}><Fruit f={prev} half="l" /></motion.div>
            <motion.div className="absolute inset-0" initial={{ x: 0, rotate: 0 }} animate={{ x: 70, y: 40, rotate: 35 }} transition={{ duration: 0.6 }}><Fruit f={prev} half="r" /></motion.div>
            <motion.span className="absolute left-1/2 top-0 -translate-x-1/2 font-display text-3xl font-black text-neon-green drop-shadow" initial={{ y: 0, opacity: 1 }} animate={{ y: -50, opacity: 0 }} transition={{ duration: 0.9 }}>+{fmtMult(ladderMult('slice', mode, step))}</motion.span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        {!lost && <Odds game="slice" mode={mode} step={step} />}
        <motion.button
          key={lost ? 'bomb' : `f${step}`}
          type="button"
          disabled={!live}
          onClick={onGo}
          aria-label="Slice"
          className="relative h-32 w-32 disabled:cursor-default"
          initial={{ y: -260, rotate: -40 }}
          animate={{ y: [null, 0], rotate: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 14, delay: step > 0 && !lost ? 0.25 : 0 }}
          whileHover={live ? { scale: 1.06, rotate: 4 } : undefined}
        >
          {lost ? <BombSvg /> : <Fruit f={f} />}
        </motion.button>
      </div>
      {lost && <Explosion size={260} />}
    </div>
  )
}

// ───────────────────────────── Moles ─────────────────────────────

function Mole() {
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" aria-hidden>
      <ellipse cx="50" cy="62" rx="30" ry="34" fill="#8b5e3c" />
      <ellipse cx="50" cy="72" rx="18" ry="16" fill="#d2a679" />
      <circle cx="40" cy="50" r="5" fill="#111827" /><circle cx="60" cy="50" r="5" fill="#111827" />
      <circle cx="41.5" cy="48.5" r="1.6" fill="#fff" /><circle cx="61.5" cy="48.5" r="1.6" fill="#fff" />
      <ellipse cx="50" cy="60" rx="7" ry="5" fill="#f472b6" />
      <rect x="45" y="64" width="4" height="6" rx="1" fill="#fff" /><rect x="51" y="64" width="4" height="6" rx="1" fill="#fff" />
    </svg>
  )
}

export function MolesBoard({ mode, live, end, step, onGo }) {
  const [hole, setHole] = useState(4)
  const lost = end?.lost
  const hit = (i) => {
    if (!live) return
    setHole(i)
    onGo()
  }
  return (
    <div className="relative h-[380px] overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_50%_20%,#4ade80_0%,#16a34a_45%,#14532d_100%)]">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:repeating-linear-gradient(100deg,transparent_0_14px,rgba(0,0,0,0.12)_14px_16px)]" />
      <Tally game="moles" mode={mode} step={step} />
      {!lost && <Odds game="moles" mode={mode} step={step} className="absolute right-3 top-3 z-10" />}
      <div className="absolute inset-x-0 bottom-6 top-20 mx-auto grid max-w-[420px] grid-cols-3 gap-x-4 gap-y-2 px-4">
        {Array.from({ length: 9 }, (_, i) => {
          const here = i === hole
          return (
            <button key={i} type="button" onClick={() => hit(i)} disabled={!live} aria-label={`Hole ${i + 1}`} className="group relative flex items-end justify-center disabled:cursor-default">
              <span className="absolute bottom-1 h-8 w-[88%] rounded-[50%] bg-[#3b2414] shadow-[inset_0_6px_10px_rgba(0,0,0,0.7)]" />
              <span className="relative h-[72%] w-[70%] overflow-hidden" style={{ clipPath: 'inset(-40% -20% 12% -20%)' }}>
                <AnimatePresence>
                  {here && (step > 0 || lost) && (
                    <motion.span key={`${step}-${lost}`} className="absolute inset-0" initial={{ y: '100%' }} animate={{ y: '-6%' }} exit={{ y: '100%' }} transition={{ type: 'spring', stiffness: 380, damping: 18 }}>
                      {lost ? <BombSvg /> : <Mole />}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <span className="absolute bottom-0 h-3 w-[96%] rounded-[50%] bg-[#5b3a1e]" />
              {live && <span className="absolute inset-x-[10%] bottom-2 h-6 rounded-[50%] opacity-0 ring-2 ring-white/60 transition group-hover:opacity-100" />}
              {here && lost && <Explosion size={170} />}
              {here && step > 0 && !lost && (
                <motion.span key={`p${step}`} className="pointer-events-none absolute -top-2 font-display text-lg font-black text-white drop-shadow" initial={{ y: 0, opacity: 1 }} animate={{ y: -30, opacity: 0 }} transition={{ duration: 0.9 }}>+{fmtMult(ladderMult('moles', mode, step))}</motion.span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ───────────────────────────── Layer (isometric 3D stack) ─────────────────────────────

const W = 120
const D = 60
const H = 20
const HUES = [190, 210, 250, 280, 320, 350, 20, 45]

function Block({ i, falling }) {
  const hue = HUES[i % HUES.length]
  const y = -i * H
  return (
    <motion.g
      initial={falling ? false : { x: -260, y: y - 80, opacity: 0 }}
      animate={falling ? { x: 220, y: y + 260, rotate: 70, opacity: 0 } : { x: 0, y, opacity: 1 }}
      transition={falling ? { duration: 1, ease: [0.4, 0, 0.8, 0.6] } : { type: 'spring', stiffness: 260, damping: 20 }}
    >
      <polygon points={`${-W / 2},0 0,${D / 2} 0,${D / 2 + H} ${-W / 2},${H}`} fill={`hsl(${hue} 70% 38%)`} />
      <polygon points={`0,${D / 2} ${W / 2},0 ${W / 2},${H} 0,${D / 2 + H}`} fill={`hsl(${hue} 70% 28%)`} />
      <polygon points={`0,${-D / 2} ${W / 2},0 0,${D / 2} ${-W / 2},0`} fill={`hsl(${hue} 80% 58%)`} />
      <polygon points={`0,${-D / 2} ${W / 2},0 0,${D / 2} ${-W / 2},0`} fill="url(#lay-sheen)" />
    </motion.g>
  )
}

export function LayerBoard({ mode, end, step }) {
  const lost = end?.lost
  const n = lost ? end.step : step
  const shown = Math.min(n, 12)
  const first = n - shown
  const [shake, setShake] = useState(0)
  useEffect(() => { if (lost) setShake((s) => s + 1) }, [lost])
  return (
    <div className="relative h-[400px] overflow-hidden rounded-xl bg-[linear-gradient(180deg,#0b1026_0%,#1e1b4b_55%,#312e81_100%)]">
      <div className="pointer-events-none absolute inset-0 [background-image:radial-gradient(circle,rgba(255,255,255,0.5)_1px,transparent_1.5px)] [background-size:38px_38px] opacity-25" />
      <Tally game="layer" mode={mode} step={step} />
      {!lost && <Odds game="layer" mode={mode} step={step} className="absolute right-3 top-3 z-10" />}
      <motion.svg key={shake} viewBox="-200 -330 400 400" className="absolute inset-0 h-full w-full" animate={lost ? { x: [0, -8, 8, -5, 5, 0] } : {}} transition={{ duration: 0.5 }} aria-hidden>
        <defs>
          <linearGradient id="lay-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="0.35" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        </defs>
        <ellipse cx="0" cy="58" rx="110" ry="26" fill="#000" opacity="0.35" />
        <polygon points={`0,${-D / 2 + 30} ${W / 2 + 14},30 0,${D / 2 + 30 + 2} ${-W / 2 - 14},30`} fill="#334155" />
        <motion.g animate={{ y: Math.max(0, shown - 6) * H }} transition={{ type: 'spring', stiffness: 120, damping: 20 }}>
          {Array.from({ length: shown }, (_, k) => <Block key={first + k} i={first + k} />)}
          {lost && <Block key={`fall${n}`} i={n} falling />}
        </motion.g>
      </motion.svg>
      {lost && <div className="absolute left-1/2 top-[30%]"><Explosion size={200} /></div>}
    </div>
  )
}
