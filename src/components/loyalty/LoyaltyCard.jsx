import { useId } from 'react'
import clsx from 'clsx'

/**
 * Loyalty card face. Quality grows with the tier:
 *   No card / Silver / Gold  — clean metal faces
 *   Platinum                 — guilloché engraving + holographic sheen
 *   Infinite                 — deep-space nebula, twinkling stars, a glowing ∞ ribbon that draws itself
 *   Black                    — carbon weave, gold foil rails, embossed monogram
 *   Monarch                  — royal crimson, gold filigree, glitching crest
 *   Vivace                   — charcoal & silver concert card: engraved staff lines, a melody that plays across it,
 *                              treble-clef crest, ornamental frame. The most detailed face.
 * Pure CSS + inline SVG, scales with its container, calm under Potato mode / reduced motion.
 */
const FACES = {
  none: 'lc-face--none',
  silver: 'lc-face--silver',
  gold: 'lc-face--gold',
  platinum: 'lc-face--platinum',
  infinite: 'lc-face--infinite',
  black: 'lc-face--black',
  monarch: 'lc-face--monarch',
  vivace: 'lc-face--vivace',
}

const MARKS = { platinum: '⬡', infinite: '∞', black: '◆', monarch: '♛', vivace: '𝄞' }

/** Melody on the Vivace staff: [x, staff step (0 = bottom line, 8 = top line), kind]. */
const MELODY = [[18, 2, 'q'], [25, 4, 'q'], [32, 6, 'e'], [37, 5, 'e'], [44, 7, 'q'], [51, 4, 'h'], [60, 3, 'e'], [65, 5, 'e'], [72, 8, 'q'], [79, 6, 'q'], [86, 4, 'h']]

function VivaceArt() {
  const uid = useId().replace(/:/g, '')
  const top = 30
  const gap = 4.2
  const y = (step) => top + (8 - step) * (gap / 2)
  return (
    <svg className="lc-vivace-art" viewBox="0 0 100 63" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`vs${uid}`} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f8fafc" />
          <stop offset="0.45" stopColor="#94a3b8" />
          <stop offset="0.6" stopColor="#e2e8f0" />
          <stop offset="1" stopColor="#64748b" />
        </linearGradient>
        <linearGradient id={`vf${uid}`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.12" stopColor="#fff" stopOpacity="1" />
          <stop offset="0.88" stopColor="#fff" stopOpacity="1" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`vm${uid}`}><rect x="0" y="0" width="100" height="63" fill={`url(#vf${uid})`} /></mask>
      </defs>
      <g mask={`url(#vm${uid})`}>
        {[0, 1, 2, 3, 4].map((i) => <line key={i} className="lc-vv-line" x1="4" x2="96" y1={top + i * gap} y2={top + i * gap} />)}
        <line className="lc-vv-bar" x1="48" x2="48" y1={top} y2={top + 4 * gap} />
        <line className="lc-vv-bar" x1="93" x2="93" y1={top} y2={top + 4 * gap} />
      </g>
      {MELODY.map(([x, step, kind], i) => (
        <g key={i} className="lc-vv-note" style={{ '--i': i }}>
          <ellipse cx={x} cy={y(step)} rx="1.55" ry="1.1" transform={`rotate(-20 ${x} ${y(step)})`} className={kind === 'h' ? 'lc-vv-head lc-vv-head--open' : 'lc-vv-head'} />
          <line x1={x + 1.4} x2={x + 1.4} y1={y(step)} y2={y(step) - 7} className="lc-vv-stem" />
          {kind === 'e' && <path d={`M${x + 1.4} ${y(step) - 7} q 2.4 1.6 1.6 4.2`} className="lc-vv-flag" />}
        </g>
      ))}
      <path className="lc-vv-sweep" d={`M4 ${top + 2 * gap} H96`} />
    </svg>
  )
}

function InfiniteArt() {
  const uid = useId().replace(/:/g, '')
  return (
    <svg className="lc-inf-art" viewBox="0 0 100 63" aria-hidden="true">
      <defs>
        <linearGradient id={`ig${uid}`} x1="0" x2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="0.5" stopColor="#e0f2fe" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <path className="lc-inf-path" stroke={`url(#ig${uid})`} d="M50 34 C 42 22, 26 22, 26 34 C 26 46, 42 46, 50 34 C 58 22, 74 22, 74 34 C 74 46, 58 46, 50 34 Z" />
    </svg>
  )
}

export default function LoyaltyCard({ card, holder, className, size = 'md', dim = false }) {
  const slug = FACES[card?.slug] ? card.slug : 'custom'
  const tier = card?.slug === 'none' ? 'MEMBER' : (card?.name ?? '').toUpperCase()
  return (
    <div
      className={clsx('lc-face', FACES[slug] ?? 'lc-face--custom', `lc-face--${size}`, dim && 'lc-face--dim', className)}
      style={slug === 'custom' ? { '--lc': card?.color ?? '#64748b' } : undefined}
      role="img"
      aria-label={`${card?.name ?? 'No Card'} loyalty card`}
    >
      <span className="lc-pattern" aria-hidden="true" />
      {slug === 'platinum' && <span className="lc-holo" aria-hidden="true" />}
      {slug === 'infinite' && (
        <>
          <span className="lc-nebula" aria-hidden="true" />
          <span className="lc-stars" aria-hidden="true" />
          <InfiniteArt />
        </>
      )}
      {slug === 'black' && (
        <>
          <span className="lc-rails" aria-hidden="true" />
          <span className="lc-monogram" aria-hidden="true">NA</span>
        </>
      )}
      {slug === 'monarch' && (
        <>
          <span className="lc-crown" aria-hidden="true">♛</span>
          <span className="lc-filigree" aria-hidden="true" />
          <span className="lc-glitch" aria-hidden="true" />
          <span className="lc-dust" aria-hidden="true" />
        </>
      )}
      {slug === 'vivace' && (
        <>
          <span className="lc-vv-spot" aria-hidden="true" />
          <span className="lc-vv-clef" aria-hidden="true">𝄞</span>
          <VivaceArt />
          <span className="lc-vv-frame" aria-hidden="true"><i /><i /><i /><i /></span>
          <span className="lc-vv-keys" aria-hidden="true" />
        </>
      )}
      <span className="lc-shine" aria-hidden="true" />
      <div className="lc-top">
        <span className="lc-brand">NEON ARCADE</span>
        <span className="lc-tier" data-text={tier}>{slug === 'vivace' ? <><span className="lc-vv-tempo">♩= 168</span>{tier}</> : tier}</span>
      </div>
      <span className="lc-chip" aria-hidden="true" />
      <div className="lc-bottom">
        <span className="lc-holder">{holder ?? 'PLAYER'}</span>
        <span className="lc-mark" aria-hidden="true">{MARKS[card?.slug] ?? '✦'}</span>
      </div>
    </div>
  )
}
