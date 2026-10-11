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
  'Scrap Chip': (c) => (
    <>
      <path d="M18 18 H46 V46 H18 Z" fill={`${c}22`} stroke={c} transform="rotate(8 32 32)" />
      <path d="M24 12 V18 M32 12 V18 M40 12 V18 M24 46 V52 M40 46 V52 M12 26 H18 M12 38 H18 M46 30 H52" stroke={c} />
      <path d="M26 28 L34 36 L30 40" stroke={c} opacity="0.6" />
    </>
  ),
  'Bent Coin': (c) => (
    <>
      <path d="M14 30 C14 18 24 12 34 14 C46 16 52 26 48 36 C44 48 30 52 20 44 C16 41 14 36 14 30 Z" fill={`${c}22`} stroke={c} />
      <path d="M26 24 C30 30 30 36 26 42" stroke={c} opacity="0.6" />
    </>
  ),
  'Old Ticket': (c) => (
    <>
      <path d="M10 20 H54 V28 C50 28 50 36 54 36 V44 H10 V36 C14 36 14 28 10 28 Z" fill={`${c}22`} stroke={c} />
      <path d="M38 20 V44" stroke={c} strokeDasharray="3 3" />
      <path d="M18 30 H30 M18 36 H26" stroke={c} />
    </>
  ),
  'Lucky Dice': (c) => (
    <>
      <rect x="14" y="14" width="36" height="36" rx="8" fill={`${c}22`} stroke={c} transform="rotate(-10 32 32)" />
      {[[24, 24], [40, 24], [32, 32], [24, 40], [40, 40]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill={c} stroke="none" />)}
    </>
  ),
  'Neon Fuse': (c) => (
    <>
      <rect x="22" y="12" width="20" height="40" rx="6" fill={`${c}22`} stroke={c} />
      <path d="M22 20 H42 M22 44 H42" stroke={c} />
      <path d="M34 24 L28 33 H36 L30 41" stroke={c} />
    </>
  ),
  'Silver Chip': (c) => (
    <>
      <circle cx="32" cy="32" r="20" fill={`${c}22`} stroke={c} />
      <circle cx="32" cy="32" r="12" stroke={c} strokeDasharray="4 3" />
      <path d="M32 12 V18 M32 46 V52 M12 32 H18 M46 32 H52" stroke={c} />
    </>
  ),
  'Hologram': (c) => (
    <>
      <path d="M18 50 H46 L40 44 H24 Z" fill={`${c}33`} stroke={c} />
      <path d="M24 44 L32 14 L40 44" stroke={c} opacity="0.4" />
      <path d="M32 16 L42 22 L42 34 L32 40 L22 34 L22 22 Z" fill={`${c}22`} stroke={c} />
      <path d="M22 22 L32 28 L42 22 M32 28 V40" stroke={c} opacity="0.7" />
    </>
  ),
  'Laser Visor': (c) => (
    <>
      <path d="M8 30 C8 22 18 18 32 18 C46 18 56 22 56 30 C56 38 46 42 32 42 C18 42 8 38 8 30 Z" fill={`${c}22`} stroke={c} />
      <path d="M14 30 H50" stroke={c} strokeWidth="3.4" />
      <path d="M50 30 H60" stroke={c} opacity="0.5" />
    </>
  ),
  'Turbo Core': (c) => (
    <>
      <circle cx="32" cy="32" r="18" fill={`${c}22`} stroke={c} />
      {[0, 60, 120, 180, 240, 300].map((r) => <path key={r} d="M32 32 L32 16 C38 18 40 22 38 26" stroke={c} transform={`rotate(${r} 32 32)`} />)}
      <circle cx="32" cy="32" r="4" fill={c} stroke="none" />
    </>
  ),
  'Diamond Joystick': (c) => (
    <>
      <path d="M12 46 H52 L48 54 H16 Z" fill={`${c}33`} stroke={c} />
      <path d="M32 46 V28" stroke={c} />
      <path d="M24 16 H40 L44 21 L32 32 L20 21 Z" fill={`${c}55`} stroke={c} />
      <path d="M20 21 H44" stroke={c} opacity="0.6" />
    </>
  ),
  'Plasma Throne': (c) => (
    <>
      <path d="M20 10 H44 V34 H20 Z" fill={`${c}22`} stroke={c} />
      <path d="M14 34 H50 V42 H14 Z" fill={`${c}33`} stroke={c} />
      <path d="M18 42 V54 M46 42 V54 M14 26 V34 M50 26 V34" stroke={c} />
      <path d="M32 14 L28 22 H36 L32 30" stroke={c} />
    </>
  ),
  'Golden Arcade': (c) => (
    <>
      <path d="M18 8 H46 L44 20 V54 H20 V20 Z" fill={`${c}22`} stroke={c} />
      <rect x="24" y="20" width="16" height="12" rx="2" fill={`${c}55`} stroke={c} />
      <path d="M22 38 H42" stroke={c} />
      <circle cx="28" cy="44" r="2.5" fill={c} stroke="none" />
      <circle cx="36" cy="44" r="2.5" fill={c} stroke="none" />
      <path d="M10 14 L14 10 M54 14 L50 10 M8 26 H12 M56 26 H52" stroke={c} opacity="0.7" />
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
