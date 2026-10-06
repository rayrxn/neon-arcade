/**
 * Gambar item case — SVG sederhana per item, diwarnai sesuai tier.
 * Satu gaya garis (stroke 2.2, sudut membulat) supaya konsisten dengan ikon Arcade.
 */

const ART = {
  'Sticker Pack': (c) => (
    <>
      <rect x="14" y="12" width="30" height="36" rx="5" fill={`${c}22`} stroke={c} />
      <rect x="20" y="16" width="30" height="36" rx="5" fill="#0b0e18" stroke={c} />
      <path d="M50 40 L40 52" stroke={c} />
      <circle cx="35" cy="32" r="7" fill={`${c}55`} stroke={c} />
    </>
  ),
  'Pixel Badge': (c) => (
    <>
      <path d="M32 10 L50 18 V34 C50 44 42 50 32 54 C22 50 14 44 14 34 V18 Z" fill={`${c}22`} stroke={c} />
      <rect x="26" y="24" width="5" height="5" fill={c} stroke="none" />
      <rect x="33" y="24" width="5" height="5" fill={c} stroke="none" />
      <rect x="26" y="31" width="12" height="5" fill={c} stroke="none" />
    </>
  ),
  'Arcade Token': (c) => (
    <>
      <circle cx="32" cy="32" r="20" fill={`${c}22`} stroke={c} />
      <circle cx="32" cy="32" r="13" stroke={c} />
      <path d="M27 38 L32 25 L37 38 M29 34 H35" stroke={c} />
    </>
  ),
  'Neon Keycap': (c) => (
    <>
      <path d="M14 40 L20 18 H44 L50 40 Z" fill={`${c}22`} stroke={c} />
      <path d="M14 40 V46 H50 V40" stroke={c} />
      <path d="M28 27 H36 M32 27 V34" stroke={c} />
    </>
  ),
  'Glow Strap': (c) => (
    <>
      <path d="M18 14 C10 26 10 38 18 50" stroke={c} />
      <path d="M46 14 C54 26 54 38 46 50" stroke={c} />
      <rect x="22" y="24" width="20" height="16" rx="4" fill={`${c}33`} stroke={c} />
      <path d="M27 32 H37" stroke={c} />
    </>
  ),
  'Chrome Pin': (c) => (
    <>
      <path d="M32 10 L37 24 L52 24 L40 33 L45 48 L32 39 L19 48 L24 33 L12 24 L27 24 Z" fill={`${c}22`} stroke={c} />
      <path d="M32 39 V54" stroke={c} />
    </>
  ),
  'Holo Card': (c) => (
    <>
      <rect x="16" y="10" width="32" height="44" rx="5" fill={`${c}22`} stroke={c} />
      <path d="M16 36 L48 20" stroke={c} opacity="0.6" />
      <path d="M16 44 L48 28" stroke={c} opacity="0.35" />
      <circle cx="32" cy="22" r="5" stroke={c} />
    </>
  ),
  'Visor Skin': (c) => (
    <>
      <path d="M10 28 C10 20 18 16 32 16 C46 16 54 20 54 28 V34 C54 42 46 44 40 40 L32 36 L24 40 C18 44 10 42 10 34 Z" fill={`${c}22`} stroke={c} />
      <path d="M16 28 H48" stroke={c} opacity="0.6" />
    </>
  ),
  'Synth Pad': (c) => (
    <>
      <rect x="10" y="16" width="44" height="32" rx="5" fill={`${c}22`} stroke={c} />
      {[0, 1, 2].map((r) => [0, 1, 2, 3].map((k) => <rect key={`${r}${k}`} x={16 + k * 9} y={22 + r * 8} width="6" height="5" rx="1" fill={(r + k) % 3 === 0 ? c : 'none'} stroke={c} strokeWidth="1.4" />))}
    </>
  ),
  'Gold Joystick': (c) => (
    <>
      <path d="M12 46 H52 L48 54 H16 Z" fill={`${c}33`} stroke={c} />
      <path d="M32 46 V24" stroke={c} />
      <circle cx="32" cy="18" r="8" fill={`${c}55`} stroke={c} />
      <circle cx="44" cy="42" r="2.5" fill={c} stroke="none" />
    </>
  ),
  'Plasma Blade': (c) => (
    <>
      <path d="M44 8 L50 14 L24 40 L18 34 Z" fill={`${c}33`} stroke={c} />
      <path d="M14 38 L26 50 M20 44 L12 52" stroke={c} />
      <path d="M40 14 L46 20" stroke={c} opacity="0.5" />
    </>
  ),
  'Founder Crown': (c) => (
    <>
      <path d="M10 22 L20 32 L32 14 L44 32 L54 22 L50 46 H14 Z" fill={`${c}33`} stroke={c} />
      <path d="M14 50 H50" stroke={c} />
      <circle cx="32" cy="34" r="3" fill={c} stroke="none" />
      <circle cx="10" cy="22" r="2.5" fill={c} stroke="none" />
      <circle cx="54" cy="22" r="2.5" fill={c} stroke="none" />
      <circle cx="32" cy="14" r="2.5" fill={c} stroke="none" />
    </>
  ),
}

export default function ItemArt({ name, color, size = 56, className }) {
  const draw = ART[name] ?? ART['Arcade Token']
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <defs>
        <radialGradient id={`glow-${name.replace(/\s/g, '')}`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="30" fill={`url(#glow-${name.replace(/\s/g, '')})`} stroke="none" />
      {draw(color)}
    </svg>
  )
}

/** Gambar peti per case (dipakai di pilihan case & preview). */
export function CaseArt({ tone = '#22e1ff', size = 72, className }) {
  return (
    <svg viewBox="0 0 80 64" width={size} height={size * 0.8} className={className} fill="none" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
      <ellipse cx="40" cy="58" rx="28" ry="4" fill={tone} opacity="0.15" />
      <path d="M12 26 H68 V52 C68 54 66 56 64 56 H16 C14 56 12 54 12 52 Z" fill={`${tone}1f`} stroke={tone} />
      <path d="M10 18 C10 14 13 12 16 12 H64 C67 12 70 14 70 18 V26 H10 Z" fill={`${tone}33`} stroke={tone} />
      <path d="M26 12 V56 M54 12 V56" stroke={tone} opacity="0.45" />
      <rect x="34" y="22" width="12" height="11" rx="2.5" fill="#0b0e18" stroke={tone} />
      <circle cx="40" cy="27.5" r="1.8" fill={tone} stroke="none" />
    </svg>
  )
}
