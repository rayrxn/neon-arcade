import { useState } from 'react'
import { motion } from 'framer-motion'
import Button from '@/components/ui/Button'
import { BetInput, Choice, Field, GameShell, Stage, playOutcome, useRunner } from '@/components/play/GameKit'
import { playCoinflip } from '@/services/games'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const METAL = {
  gold: { hi: '#fff4c4', mid: '#f6c443', lo: '#b8740c', deep: '#7a4a05', ink: '#6b3f03', edge: ['#c98a17', '#8f5a08'] },
  silver: { hi: '#ffffff', mid: '#d3d9e4', lo: '#8892a6', deep: '#4b5466', ink: '#3a4252', edge: ['#a3abbb', '#646d80'] },
}
const THICK = 10

/** Struck coin face: reeded rim, raised ring, lettering around the edge and a raised emblem. */
function Face({ side }) {
  const heads = side === 'heads'
  const m = heads ? METAL.gold : METAL.silver
  const id = `cf-${side}`
  return (
    <svg
      viewBox="0 0 200 200"
      className="absolute inset-0 h-full w-full"
      style={{ backfaceVisibility: 'hidden', transform: `${heads ? '' : 'rotateY(180deg) '}translateZ(${THICK / 2}px)` }}
      aria-hidden
    >
      <defs>
        <radialGradient id={`${id}-f`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor={m.hi} />
          <stop offset="0.35" stopColor={m.mid} />
          <stop offset="0.8" stopColor={m.lo} />
          <stop offset="1" stopColor={m.deep} />
        </radialGradient>
        <linearGradient id={`${id}-r`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={m.hi} />
          <stop offset="0.5" stopColor={m.lo} />
          <stop offset="1" stopColor={m.mid} />
        </linearGradient>
        <linearGradient id={`${id}-e`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={m.hi} />
          <stop offset="1" stopColor={m.lo} />
        </linearGradient>
        <path id={`${id}-t`} d="M100 100 m-66 0 a66 66 0 1 1 132 0 a66 66 0 1 1 -132 0" />
        <filter id={`${id}-emb`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="-1.2" dy="-1.2" stdDeviation="0.6" floodColor="#fff" floodOpacity="0.7" />
          <feDropShadow dx="1.6" dy="1.8" stdDeviation="1" floodColor={m.deep} floodOpacity="0.9" />
        </filter>
      </defs>
      {/* rim + reeding */}
      <circle cx="100" cy="100" r="99" fill={`url(#${id}-r)`} />
      {Array.from({ length: 90 }, (_, i) => (
        <line key={i} x1="100" y1="2" x2="100" y2="9" stroke={m.deep} strokeOpacity="0.45" strokeWidth="1.4" transform={`rotate(${i * 4} 100 100)`} />
      ))}
      <circle cx="100" cy="100" r="88" fill={`url(#${id}-f)`} stroke={m.deep} strokeOpacity="0.5" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="80" fill="none" stroke={`url(#${id}-e)`} strokeWidth="2.5" filter={`url(#${id}-emb)`} />
      {/* lettering */}
      <text fontSize="11" fontWeight="800" letterSpacing="3.2" fill={m.ink} fillOpacity="0.85" fontFamily="ui-sans-serif, system-ui" filter={`url(#${id}-emb)`}>
        <textPath href={`#${id}-t`} startOffset="0">NEON ARCADE ✦ PROVABLY FAIR ✦ {heads ? 'HEADS' : 'TAILS'} ✦</textPath>
      </text>
      <circle cx="100" cy="100" r="54" fill={m.lo} fillOpacity="0.18" stroke={m.deep} strokeOpacity="0.35" />
      {/* emblem */}
      <g filter={`url(#${id}-emb)`} fill={`url(#${id}-e)`} stroke={m.ink} strokeOpacity="0.55" strokeWidth="1.5" strokeLinejoin="round">
        {heads ? (
          <>
            <path d="M64 92 L76 70 L90 86 L100 60 L110 86 L124 70 L136 92 L130 112 H70 Z" />
            <rect x="70" y="116" width="60" height="9" rx="3" />
            <circle cx="100" cy="58" r="5" />
            <circle cx="76" cy="68" r="4" />
            <circle cx="124" cy="68" r="4" />
            <circle cx="100" cy="98" r="5" fill={m.deep} fillOpacity="0.5" stroke="none" />
          </>
        ) : (
          <>
            <path d="M100 56 L111 86 L143 87 L118 107 L127 138 L100 120 L73 138 L82 107 L57 87 L89 86 Z" />
            <circle cx="100" cy="100" r="9" fill={m.deep} fillOpacity="0.35" stroke="none" />
          </>
        )}
      </g>
      {/* specular sheen */}
      <ellipse cx="72" cy="58" rx="46" ry="22" fill="#fff" opacity="0.22" transform="rotate(-35 72 58)" />
    </svg>
  )
}

/** Coin edge: stacked discs between the faces give it real thickness; gold half under heads, silver half under tails. */
function Edge() {
  return Array.from({ length: THICK }, (_, i) => {
    const z = i - THICK / 2 + 0.5
    const m = z > 0 ? METAL.gold : METAL.silver
    return (
      <span
        key={i}
        className="absolute inset-0 rounded-full"
        style={{ transform: `translateZ(${z}px)`, background: `repeating-conic-gradient(${m.edge[0]} 0 2deg, ${m.edge[1]} 2deg 4deg)` }}
      />
    )
  })
}

export default function Coinflip({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [side, setSide] = useState('heads')
  const [outcome, setOutcome] = useState(null)
  const [rotation, setRotation] = useState(0)
  const [landed, setLanded] = useState(true)

  const go = async () => {
    const res = await run(() => playCoinflip({ bet, side }))
    if (!res) return
    play('flip')
    setLanded(false)
    // 5 putaran penuh dari posisi bulat terdekat, lalu berhenti di sisi hasil server.
    setRotation((r) => Math.ceil(r / 360) * 360 + 5 * 360 + (res.outcome === 'tails' ? 180 : 0))
    setOutcome(res)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={!landed} />
      <Field label={t('play.coinflip.pick')}>
        <Choice value={side} onChange={setSide} disabled={!landed} options={[{ value: 'heads', label: t('play.coinflip.heads') }, { value: 'tails', label: t('play.coinflip.tails') }]} />
      </Field>
      <Button size="lg" className="w-full" onClick={go} disabled={!landed}>{t('play.coinflip.flip')}</Button>
      <p className="text-center text-xs text-slate-500">{t('play.winPays', { amount: formatCoins(Math.floor(bet * 1.98)) })}</p>
    </>
  )

  const stage = (
    <Stage className="relative grid min-h-[340px] place-items-center overflow-hidden bg-[radial-gradient(ellipse_at_50%_35%,#3b1d4a_0%,#1a0f24_55%,#08060d_100%)] p-6" >
      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-72 -translate-x-1/2 bg-gradient-to-b from-amber-100/15 via-amber-100/5 to-transparent [clip-path:polygon(40%_0,60%_0,100%_100%,0_100%)]" />
      <motion.div
        className="pointer-events-none absolute bottom-12 left-1/2 h-6 w-44 -translate-x-1/2 rounded-[50%] bg-black/60 blur-md"
        animate={{ scale: landed ? 1 : [1, 0.55, 1], opacity: landed ? 1 : [1, 0.4, 1] }}
        transition={{ duration: 1.2, ease: [0.3, 0.7, 0.3, 1] }}
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-[60%] rounded-full bg-amber-300/10 blur-3xl" />
      <div style={{ perspective: 900 }} className="flex flex-col items-center gap-6">
        <motion.div
          className="relative h-40 w-40"
          style={{ transformStyle: 'preserve-3d', rotateX: 12 }}
          animate={{ rotateY: rotation, y: landed ? 0 : [0, -80, 0], scale: landed ? 1 : [1, 1.12, 1] }}
          transition={{ duration: 1.2, ease: [0.3, 0.7, 0.3, 1] }}
          onAnimationComplete={() => {
            if (!landed && outcome) playOutcome(outcome)
            setLanded(true)
          }}
        >
          <Edge />
          <Face side="heads" />
          <Face side="tails" />
        </motion.div>
        <p className="h-6 text-sm font-semibold text-slate-400">
          {landed && outcome ? t('play.coinflip.landed', { side: t(`play.coinflip.${outcome.outcome}`) }) : ''}
        </p>
      </div>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={landed ? outcome : null} />
}
