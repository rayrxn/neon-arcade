/**
 * Hand-drawn SVG icons for shop boosts and badges (replaces emoji glyphs, which render differently on every device).
 * Keyed by the item's style.glyph so existing catalog rows map without a migration.
 */
const P = {
  clover: <><circle cx="24" cy="16" r="8" /><circle cx="16" cy="24" r="8" /><circle cx="32" cy="24" r="8" /><circle cx="24" cy="32" r="8" /><path d="M24 30 C26 38 30 42 34 44" fill="none" strokeWidth="3" stroke="currentColor" /></>,
  bolt: <path d="M27 4 L10 27 H22 L19 44 L38 19 H26 Z" />,
  gift: <><rect x="8" y="20" width="32" height="22" rx="3" /><rect x="6" y="14" width="36" height="8" rx="2" /><path d="M24 14 V42" stroke="#0b0e18" strokeWidth="3" /><path d="M24 14 C18 4 10 8 14 14 M24 14 C30 4 38 8 34 14" fill="none" stroke="currentColor" strokeWidth="3" /></>,
  skull: <><path d="M24 6 C13 6 7 14 7 22 C7 29 11 32 13 34 V40 H35 V34 C37 32 41 29 41 22 C41 14 35 6 24 6 Z" /><circle cx="17" cy="23" r="4.5" fill="#0b0e18" /><circle cx="31" cy="23" r="4.5" fill="#0b0e18" /><path d="M22 31 L24 27 L26 31 Z" fill="#0b0e18" /></>,
  spade: <><path d="M24 4 C18 14 6 20 6 29 C6 35 11 38 16 37 C19 36.5 21 35 22 33 L20 44 H28 L26 33 C27 35 29 36.5 32 37 C37 38 42 35 42 29 C42 20 30 14 24 4 Z" /></>,
  crown: <><path d="M6 16 L14 26 L24 10 L34 26 L42 16 L38 38 H10 Z" /><rect x="10" y="38" width="28" height="5" rx="1.5" /></>,
  diamond: <><path d="M12 8 H36 L44 18 L24 42 L4 18 Z" /><path d="M4 18 H44 M16 8 L12 18 L24 42 L36 18 L32 8" fill="none" stroke="#0b0e18" strokeOpacity="0.35" strokeWidth="1.5" /></>,
  star: <path d="M24 4 L29.5 17 L43 18 L32.5 27 L36 41 L24 33 L12 41 L15.5 27 L5 18 L18.5 17 Z" />,
  sparkle: <path d="M24 4 C26 18 30 22 44 24 C30 26 26 30 24 44 C22 30 18 26 4 24 C18 22 22 18 24 4 Z" />,
  medal: <><path d="M16 4 H32 L28 18 H20 Z" opacity="0.7" /><circle cx="24" cy="30" r="13" /><path d="M24 22 L26.5 27.5 L32 28 L28 32 L29 38 L24 35 L19 38 L20 32 L16 28 L21.5 27.5 Z" fill="#0b0e18" fillOpacity="0.35" /></>,
  rocket: <><path d="M24 4 C32 10 34 22 30 34 H18 C14 22 16 10 24 4 Z" /><circle cx="24" cy="18" r="4" fill="#0b0e18" /><path d="M18 28 L10 36 L17 36 Z M30 28 L38 36 L31 36 Z" /><path d="M20 36 L24 45 L28 36 Z" fill="#fb923c" /></>,
  party: <><path d="M8 42 L18 12 L36 30 Z" /><circle cx="34" cy="10" r="3" /><circle cx="40" cy="20" r="2.5" /><path d="M26 6 L28 12 M40 30 L44 32" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></>,
  note: <><path d="M20 8 V34" stroke="currentColor" strokeWidth="4" /><path d="M20 8 L38 4 V12 L20 16 Z" /><ellipse cx="14" cy="36" rx="8" ry="6" /></>,
}

const BY_GLYPH = {
  '🍀': 'clover', '☘': 'clover', '⚡': 'bolt', '🎁': 'gift', '☠': 'skull', '♠': 'spade', '♔': 'crown', '♛': 'crown',
  '💎': 'diamond', '◆': 'diamond', '🌟': 'star', '★': 'star', '✦': 'sparkle', '✪': 'medal', '🚀': 'rocket', '🎉': 'party', '𝄞': 'note',
}

export function shopIconName(glyph) {
  return BY_GLYPH[glyph] ?? 'star'
}

export default function ShopIcon({ glyph, color = '#e2e8f0', size = 40, glow = true, className }) {
  const id = `si-${shopIconName(glyph)}-${color.replace('#', '')}`
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} style={{ color, filter: glow ? `drop-shadow(0 0 8px ${color}99)` : undefined }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="0.35" stopColor={color} />
          <stop offset="1" stopColor={color} stopOpacity="0.75" />
        </linearGradient>
      </defs>
      <g fill={`url(#${id})`}>{P[shopIconName(glyph)]}</g>
    </svg>
  )
}
