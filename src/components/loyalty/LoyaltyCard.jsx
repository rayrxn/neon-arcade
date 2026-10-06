import clsx from 'clsx'

/**
 * Loyalty card face. Each tier has its own material: brushed silver, gold, platinum,
 * a starry "infinite" blue and gold-on-black. Pure CSS, scales with its container.
 */
const FACES = {
  none: 'lc-face--none',
  silver: 'lc-face--silver',
  gold: 'lc-face--gold',
  platinum: 'lc-face--platinum',
  infinite: 'lc-face--infinite',
  black: 'lc-face--black',
}

export default function LoyaltyCard({ card, holder, className, size = 'md', dim = false }) {
  const slug = FACES[card?.slug] ? card.slug : 'custom'
  return (
    <div
      className={clsx('lc-face', FACES[slug] ?? 'lc-face--custom', `lc-face--${size}`, dim && 'lc-face--dim', className)}
      style={slug === 'custom' ? { '--lc': card?.color ?? '#64748b' } : undefined}
      role="img"
      aria-label={`${card?.name ?? 'No Card'} loyalty card`}
    >
      <span className="lc-pattern" aria-hidden="true" />
      <span className="lc-shine" aria-hidden="true" />
      <div className="lc-top">
        <span className="lc-brand">NEON ARCADE</span>
        <span className="lc-tier">{card?.slug === 'none' ? 'MEMBER' : (card?.name ?? '').toUpperCase()}</span>
      </div>
      <span className="lc-chip" aria-hidden="true" />
      <div className="lc-bottom">
        <span className="lc-holder">{holder ?? 'PLAYER'}</span>
        <span className="lc-mark" aria-hidden="true">{card?.slug === 'infinite' ? '∞' : card?.slug === 'black' ? '◆' : '✦'}</span>
      </div>
    </div>
  )
}
