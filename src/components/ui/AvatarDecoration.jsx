/**
 * Avatar decorations: ornate SVG frames drawn around the avatar (laurels, crystals, flames, orbit, crown …).
 * Picked by frame id; the frame colour tints the design. Overlay only — the avatar keeps its own ring.
 */
const leaf = (x, y, r, s = 1) => <ellipse key={`${x}${y}`} cx={x} cy={y} rx={5 * s} ry={2.4 * s} transform={`rotate(${r} ${x} ${y})`} />

const DESIGNS = {
  laurel: (c) => (
    <>
      <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="3" />
      <g fill={c}>
        {[[18, 70, -60], [14, 60, -80], [13, 49, -95], [15, 38, -115], [20, 28, -130], [82, 70, 60], [86, 60, 80], [87, 49, 95], [85, 38, 115], [80, 28, 130]].map(([x, y, r]) => leaf(x, y, r, 1.3))}
      </g>
      <path d="M50 4 L53 11 L60 11 L54.5 15.5 L56.5 22.5 L50 18.5 L43.5 22.5 L45.5 15.5 L40 11 L47 11 Z" fill="#fde68a" stroke={c} strokeWidth="1" />
      <path d="M38 88 Q50 96 62 88" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  crystal: (c) => (
    <>
      <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="2.5" strokeDasharray="2 3" />
      <g fill={c} stroke="#e0f2fe" strokeWidth="0.8" opacity="0.95">
        <path d="M50 2 L55 14 L50 20 L45 14 Z" /><path d="M36 6 L41 15 L36 20 L33 12 Z" /><path d="M64 6 L67 12 L64 20 L59 15 Z" />
        <path d="M8 40 L18 44 L18 50 L8 48 Z" /><path d="M92 40 L92 48 L82 50 L82 44 Z" /><path d="M24 86 L30 80 L34 86 L28 94 Z" /><path d="M76 86 L72 94 L66 86 L70 80 Z" />
      </g>
    </>
  ),
  flame: (c) => (
    <>
      <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="3" />
      <g className="adeco-flicker" fill={c}>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2
          const x = 50 + Math.cos(a) * 40, y = 50 + Math.sin(a) * 40
          return <path key={i} d={`M${x - 4} ${y} Q${x} ${y - 14} ${x + 4} ${y} Q${x} ${y + 3} ${x - 4} ${y} Z`} transform={`rotate(${(i / 10) * 360} ${x} ${y})`} />
        })}
      </g>
      <g className="adeco-flicker" fill="#fde047" opacity="0.8" style={{ animationDelay: '-0.3s' }}>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + 0.3
          const x = 50 + Math.cos(a) * 40, y = 50 + Math.sin(a) * 40
          return <path key={i} d={`M${x - 2} ${y} Q${x} ${y - 8} ${x + 2} ${y} Z`} transform={`rotate(${(i / 10) * 360 + 17} ${x} ${y})`} />
        })}
      </g>
    </>
  ),
  orbit: (c) => (
    <>
      <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="2" opacity="0.7" />
      <g className="adeco-spin"><ellipse cx="50" cy="50" rx="46" ry="16" fill="none" stroke={c} strokeWidth="1.6" transform="rotate(-25 50 50)" /><circle cx="94" cy="38" r="4" fill={c} /><circle cx="8" cy="62" r="2.6" fill="#fff" /></g>
      <g className="adeco-spin-rev"><circle cx="50" cy="6" r="2.4" fill="#fff" /><circle cx="50" cy="94" r="3" fill={c} /></g>
    </>
  ),
  holo: (c) => (
    <>
      <defs><linearGradient id="adeco-holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f472b6" /><stop offset="0.33" stopColor="#facc15" /><stop offset="0.66" stopColor="#22d3ee" /><stop offset="1" stopColor="#a855f7" /></linearGradient></defs>
      <circle className="adeco-spin" cx="50" cy="50" r="39" fill="none" stroke="url(#adeco-holo)" strokeWidth="4" />
      {[[12, 20], [88, 26], [84, 82], [16, 84], [50, 3]].map(([x, y], i) => <path key={i} className="adeco-twinkle" style={{ animationDelay: `${i * 0.4}s` }} d={`M${x} ${y - 5} L${x + 1.4} ${y - 1.4} L${x + 5} ${y} L${x + 1.4} ${y + 1.4} L${x} ${y + 5} L${x - 1.4} ${y + 1.4} L${x - 5} ${y} L${x - 1.4} ${y - 1.4} Z`} fill={i % 2 ? c : '#fff'} />)}
    </>
  ),
  plasma: (c) => (
    <>
      <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="2.5" />
      <circle className="adeco-spin" cx="50" cy="50" r="43" fill="none" stroke={c} strokeWidth="1.5" strokeDasharray="10 6 2 6" />
      <g stroke="#e0f2fe" strokeWidth="1.6" fill="none" className="adeco-twinkle">
        <path d="M12 30 L18 34 L14 38 L20 42" /><path d="M88 62 L82 66 L86 70 L80 74" /><path d="M60 3 L58 9 L63 10 L60 16" />
      </g>
    </>
  ),
  crown: (c) => (
    <>
      <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="3.5" />
      <circle cx="50" cy="50" r="42" fill="none" stroke="#fbbf24" strokeWidth="1" />
      <path d="M30 18 L34 4 L42 12 L50 0 L58 12 L66 4 L70 18 Z" fill="#fbbf24" stroke="#92400e" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="50" cy="9" r="2.4" fill={c} /><circle cx="36" cy="12" r="1.8" fill={c} /><circle cx="64" cy="12" r="1.8" fill={c} />
      {[[10, 60], [90, 60], [50, 92]].map(([x, y]) => <path key={x} d={`M${x} ${y - 4} L${x + 4} ${y} L${x} ${y + 4} L${x - 4} ${y} Z`} fill="#fbbf24" />)}
    </>
  ),
  melody: (c) => (
    <>
      <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="2.5" />
      <g fill={c} className="adeco-bob">
        <path d="M14 22 V34" stroke={c} strokeWidth="2" /><ellipse cx="11" cy="35" rx="4" ry="3" />
        <path d="M86 18 V30 M92 16 V28 M86 18 L92 16" stroke={c} strokeWidth="2" fill="none" /><ellipse cx="83" cy="31" rx="4" ry="3" /><ellipse cx="89" cy="29" rx="4" ry="3" />
        <path d="M88 76 V88" stroke={c} strokeWidth="2" /><ellipse cx="85" cy="89" rx="4" ry="3" />
      </g>
    </>
  ),
  roses: (c) => (
    <>
      <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="2.5" />
      {[[16, 80, 1.2], [84, 20, 1], [10, 62, 0.7], [70, 8, 0.7], [30, 90, 0.7], [92, 38, 0.6]].map(([x, y, s], i) => (
        <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
          <circle r="8" fill={c} /><path d="M-5 -1 Q0 -7 5 -1 Q0 3 -5 -1 Z M-3 3 Q0 -2 3 3" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="1.2" />
          <ellipse cx="-9" cy="5" rx="5" ry="2.2" fill="#15803d" transform="rotate(30 -9 5)" />
        </g>
      ))}
    </>
  ),
  neon: (c) => (
    <>
      <circle cx="50" cy="50" r="38" fill="none" stroke={c} strokeWidth="3" />
      <circle className="adeco-spin" cx="50" cy="50" r="43" fill="none" stroke={c} strokeOpacity="0.5" strokeWidth="1.2" strokeDasharray="1 8" strokeLinecap="round" />
      <g className="adeco-spin"><circle cx="50" cy="7" r="3" fill="#fff" /></g>
    </>
  ),
}

const BY_FRAME = {
  'frame-ice': 'crystal', 'frame-magma': 'flame', 'frame-void': 'orbit', 'frame-gold-card': 'laurel', 'frame-holo': 'holo', 'frame-plasma': 'plasma',
  'frame-monarch': 'crown', 'frame-vivace': 'melody', 'gold-frame': 'laurel', 'violet-frame': 'orbit', 'crimson-frame': 'roses', 'mint-frame': 'neon', 'neon-frame': 'plasma',
}

export const decoFor = (id, style) => style?.deco ?? BY_FRAME[id] ?? 'neon'

export default function AvatarDecoration({ design, color = '#22d3ee' }) {
  const draw = DESIGNS[design] ?? DESIGNS.neon
  return (
    <svg viewBox="0 0 100 100" className="pointer-events-none absolute -inset-[24%] z-10 h-[148%] w-[148%] overflow-visible drop-shadow-[0_0_4px_rgba(0,0,0,0.6)]" aria-hidden>
      {draw(color)}
    </svg>
  )
}
