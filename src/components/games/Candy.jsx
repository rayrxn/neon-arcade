/** Hand-drawn candy symbols for Sweet (SVG, theme-independent, crisp at any size). Index 0–7 low → high, 8 = bomb. */
const G = ({ id, a, b }) => (
  <radialGradient id={id} cx="35%" cy="30%" r="75%">
    <stop offset="0" stopColor={a} />
    <stop offset="1" stopColor={b} />
  </radialGradient>
)
const Shine = ({ x = 13, y = 11, w = 7, h = 4 }) => <ellipse cx={x} cy={y} rx={w} ry={h} fill="#fff" opacity="0.55" transform={`rotate(-30 ${x} ${y})`} />

const SYMBOLS = [
  // 0 berries
  () => (<><G id="c0" a="#d8b4fe" b="#7e22ce" />{[[14, 15], [26, 15], [20, 25], [11, 26], [29, 26], [20, 33]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="6.5" fill="url(#c0)" stroke="#581c87" strokeWidth="1" />)}<path d="M20 8c0-3 3-5 6-5" stroke="#16a34a" strokeWidth="2.5" fill="none" strokeLinecap="round" /><Shine x={12} y={13} w={3} h={2} /></>),
  // 1 heart candy
  () => (<><G id="c1" a="#fda4af" b="#be123c" /><path d="M20 34C8 25 4 19 6.5 13a7.5 7.5 0 0 1 13.5-2 7.5 7.5 0 0 1 13.5 2C36 19 32 25 20 34z" fill="url(#c1)" stroke="#881337" strokeWidth="1.2" /><Shine x={13} y={13} /></>),
  // 2 orange drop
  () => (<><G id="c2" a="#fed7aa" b="#ea580c" /><circle cx="20" cy="21" r="13" fill="url(#c2)" stroke="#9a3412" strokeWidth="1.2" />{[0, 60, 120].map((r) => <path key={r} d="M20 9v24" stroke="#fff7ed" strokeWidth="1" opacity="0.5" transform={`rotate(${r} 20 21)`} />)}<Shine x={14} y={14} /></>),
  // 3 star candy
  () => (<><G id="c3" a="#fef08a" b="#ca8a04" /><path d="M20 4l4.7 9.6 10.6 1.5-7.7 7.4 1.8 10.5L20 28l-9.4 5 1.8-10.5-7.7-7.4 10.6-1.5z" fill="url(#c3)" stroke="#854d0e" strokeWidth="1.2" strokeLinejoin="round" /><Shine x={16} y={13} w={4} h={2.5} /></>),
  // 4 wrapped candy
  () => (<><G id="c4" a="#bae6fd" b="#0284c7" /><path d="M9 20L2 13v14zM31 20l7-7v14z" fill="#38bdf8" stroke="#075985" strokeWidth="1" strokeLinejoin="round" /><ellipse cx="20" cy="20" rx="12" ry="9.5" fill="url(#c4)" stroke="#075985" strokeWidth="1.2" /><path d="M13 15l4 10M19 13l4 13M25 14l3 10" stroke="#fff" strokeWidth="1.6" opacity="0.6" /><Shine x={15} y={15} w={4} h={2} /></>),
  // 5 lollipop
  () => (<><rect x="18.8" y="22" width="2.4" height="15" rx="1.2" fill="#e2e8f0" /><G id="c5" a="#bbf7d0" b="#15803d" /><circle cx="20" cy="16" r="12" fill="url(#c5)" stroke="#14532d" strokeWidth="1.2" /><path d="M20 16m-7 0a7 7 0 1 0 7-7a4.5 4.5 0 1 1-4.5 4.5a2.3 2.3 0 1 0 2.3-2.3" stroke="#f0fdf4" strokeWidth="1.8" fill="none" opacity="0.75" /></>),
  // 6 cupcake
  () => (<><path d="M9 21h22l-3 14H12z" fill="#f9a8d4" stroke="#9d174d" strokeWidth="1.2" strokeLinejoin="round" /><path d="M13 22l1 12M20 22v12M27 22l-1 12" stroke="#be185d" strokeWidth="1" opacity="0.6" /><G id="c6" a="#fff1f2" b="#f472b6" /><path d="M7 21c0-6 5-11 13-11s13 5 13 11z" fill="url(#c6)" stroke="#9d174d" strokeWidth="1.2" /><circle cx="20" cy="7" r="3" fill="#e11d48" /><Shine x={14} y={15} w={4} h={2} /></>),
  // 7 gem
  () => (<><linearGradient id="c7" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stopColor="#a5f3fc" /><stop offset="0.5" stopColor="#22d3ee" /><stop offset="1" stopColor="#6366f1" /></linearGradient><path d="M10 7h20l7 9-17 18L3 16z" fill="url(#c7)" stroke="#312e81" strokeWidth="1.2" strokeLinejoin="round" /><path d="M3 16h34M14 7l-4 9 10 18 10-18-4-9" stroke="#e0f2fe" strokeWidth="1" fill="none" opacity="0.7" /><Shine x={14} y={11} w={4} h={2} /></>),
]

export function CandyIcon({ s, b, className }) {
  if (s === 8) {
    return (
      <svg viewBox="0 0 40 40" className={className}>
        <defs><radialGradient id="cb" cx="35%" cy="30%" r="80%"><stop offset="0" stopColor="#fef9c3" /><stop offset="0.45" stopColor="#f472b6" /><stop offset="1" stopColor="#7c3aed" /></radialGradient></defs>
        <circle cx="20" cy="20" r="16" fill="url(#cb)" stroke="#4c1d95" strokeWidth="1.5" />
        <Shine x={13} y={12} w={5} h={3} />
        <text x="20" y="25" textAnchor="middle" fontSize="12" fontWeight="900" fill="#1e1b4b" fontFamily="ui-monospace, monospace">×{b}</text>
      </svg>
    )
  }
  const Sym = SYMBOLS[s] ?? SYMBOLS[0]
  return <svg viewBox="0 0 40 40" className={className}><defs /><Sym /></svg>
}
