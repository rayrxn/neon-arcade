import clsx from 'clsx'
import { getAccent } from '@/config/games'

/**
 * Thumbnail SVG per game/event — satu bahasa visual: garis 2px warna aksen,
 * isi transparan tipis, latar grid lembut. Tidak ada gambar eksternal.
 */

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
const soft = (o) => ({ fill: 'currentColor', fillOpacity: o })

const Sparkle = ({ x, y, r = 4 }) => (
  <path d={`M${x} ${y - r}L${x + r * 0.25} ${y - r * 0.25}L${x + r} ${y}L${x + r * 0.25} ${y + r * 0.25}L${x} ${y + r}L${x - r * 0.25} ${y + r * 0.25}L${x - r} ${y}L${x - r * 0.25} ${y - r * 0.25}Z`} fill="currentColor" />
)

const Crate = () => (
  <g>
    <path d="M48 40 80 28 112 40 80 52Z" {...S} {...soft(0.28)} />
    <path d="M48 40V68L80 80V52Z" {...S} {...soft(0.1)} />
    <path d="M112 40V68L80 80V52Z" {...S} {...soft(0.18)} />
    <path d="M62 45.5V73.5M98 45.5V73.5" {...S} strokeOpacity="0.45" />
    <rect x="76.5" y="58" width="7" height="9" rx="2" fill="currentColor" />
  </g>
)

const Card = ({ x, y, label, rotate = 0, cx = x + 17, cy = y + 23 }) => (
  <g transform={`rotate(${rotate} ${cx} ${cy})`}>
    <rect x={x} y={y} width="34" height="46" rx="5" {...S} {...soft(0.12)} />
    <text x={x + 7} y={y + 15} fontSize="12" fontWeight="800" fill="currentColor" fontFamily="Unbounded, sans-serif">{label}</text>
    <path d={`M${x + 17} ${y + 25}c-4 4-7 6-7 9a3.5 3.5 0 0 0 7 1 3.5 3.5 0 0 0 7-1c0-3-3-5-7-9z`} fill="currentColor" fillOpacity="0.7" />
  </g>
)

const ART = {
  'case-opening': () => (
    <>
      <Crate />
      <Sparkle x={38} y={30} />
      <Sparkle x={124} y={26} r={5} />
      <Sparkle x={120} y={72} r={3} />
    </>
  ),
  'case-battle': () => (
    <>
      <g transform="translate(6 22) scale(.55)"><Crate /></g>
      <g transform="translate(70 22) scale(.55)"><Crate /></g>
      <text x="80" y="54" textAnchor="middle" fontSize="13" fontWeight="800" fill="currentColor" fontFamily="Unbounded, sans-serif">VS</text>
    </>
  ),
  crash: () => (
    <>
      <path d="M20 80H140M20 62H140M20 44H140" stroke="currentColor" strokeOpacity="0.12" />
      <path d="M20 80C70 79 100 62 126 24L126 80Z" {...soft(0.14)} />
      <path d="M20 80C70 79 100 62 126 24" {...S} strokeWidth="3" />
      <circle cx="126" cy="24" r="5" fill="currentColor" />
      <path d="M126 12v-4M138 24h4M134 16l3-3M134 32l3 3" {...S} />
      <text x="22" y="32" fontSize="15" fontWeight="700" fill="currentColor" fontFamily="JetBrains Mono, monospace">2.47×</text>
    </>
  ),
  plinko: () => (
    <>
      {[0, 1, 2, 3, 4].map((row) =>
        Array.from({ length: row + 3 }, (_, i) => (
          <circle key={`${row}-${i}`} cx={80 + (i - (row + 2) / 2) * 15} cy={18 + row * 12} r="2.2" fill="currentColor" fillOpacity="0.55" />
        )),
      )}
      <circle cx="87.5" cy="27" r="4.5" fill="currentColor" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} x={27 + i * 15.5} y="80" width="12.5" height="8" rx="2" fill="currentColor" fillOpacity={[0.9, 0.55, 0.3, 0.15, 0.3, 0.55, 0.9][i]} />
      ))}
    </>
  ),
  mines: () => (
    <>
      {[0, 1, 2].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={53 + c * 19} y={21 + r * 19} width="16" height="16" rx="4" {...S} strokeOpacity="0.5" {...soft(r === 1 && c === 1 ? 0.3 : 0.08)} />),
      )}
      <path d="M80 34l5 5-5 6.5-5-6.5z" fill="currentColor" />
      <circle cx="99" cy="48" r="4.5" fill="currentColor" fillOpacity="0.9" />
      <path d="M102 44.5l2.5-2.5" {...S} strokeWidth="1.5" />
    </>
  ),
  chess: () => (
    <>
      {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => (r + c) % 2 ? <rect key={`${r}${c}`} x={56 + c * 12} y={26 + r * 12} width="12" height="12" {...soft(0.18)} /> : null))}
      <rect x="56" y="26" width="48" height="48" rx="3" {...S} strokeOpacity="0.5" />
      <path d="M74 66h12l-2-12 4-6-4-4 2-5h-4l-2 3-2-3h-4l2 5-4 4 4 6z" {...S} {...soft(0.5)} />
    </>
  ),
  horse: () => (
    <>
      {[0, 1, 2].map((r) => <path key={r} d={`M44 ${32 + r * 16}H116`} {...S} strokeOpacity="0.25" />)}
      <path d="M112 24V76" {...S} strokeDasharray="3 3" />
      <circle cx="96" cy="32" r="5" {...S} {...soft(0.5)} />
      <circle cx="76" cy="48" r="5" {...S} {...soft(0.3)} />
      <circle cx="64" cy="64" r="5" {...S} {...soft(0.2)} />
    </>
  ),
  tarot: () => (
    <>
      {[-14, 0, 14].map((r, i) => (
        <rect key={r} x="66" y="22" width="28" height="44" rx="5" transform={`rotate(${r} 80 70)`} {...S} {...soft(i === 1 ? 0.3 : 0.1)} />
      ))}
      <Sparkle x={80} y={42} r={6} />
    </>
  ),
  sweet: () => (
    <>
      <circle cx="62" cy="50" r="13" {...S} {...soft(0.25)} />
      <path d="M62 37v26M49 50h26" {...S} strokeOpacity="0.5" />
      <path d="M86 40h22l-4 22H90z" {...S} {...soft(0.18)} />
      <path d="M97 40c0-6 4-9 8-9" {...S} />
      <Sparkle x={112} y={26} r={4} />
    </>
  ),
  keno: () => (
    <>
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3, 4].map((c) => {
          const on = (r * 5 + c) % 4 === 1
          return <circle key={`${r}${c}`} cx={50 + c * 15} cy={30 + r * 15} r="5.5" {...S} strokeOpacity={on ? 1 : 0.4} {...soft(on ? 0.45 : 0.06)} />
        }),
      )}
    </>
  ),
  tower: () => (
    <>
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={57 + c * 16} y={68 - r * 14} width="13" height="10" rx="3" {...S} strokeOpacity={r === 3 ? 1 : 0.45} {...soft(r < 3 && c === (r % 3) ? 0.4 : 0.06)} />),
      )}
      <Sparkle x={112} y={24} r={5} />
    </>
  ),
  cross: () => (
    <>
      {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${46 + i * 17} 22V78`} {...S} strokeOpacity="0.3" strokeDasharray="4 5" />)}
      <rect x="86" y="30" width="18" height="11" rx="4" {...S} {...soft(0.35)} />
      <circle cx="62" cy="60" r="7" {...S} {...soft(0.3)} />
      <path d="M69 59l5-1.5-5-1.5" {...S} strokeWidth="1.5" />
    </>
  ),
  pump: () => (
    <>
      <ellipse cx="80" cy="44" rx="20" ry="23" {...S} {...soft(0.22)} />
      <path d="M72 32a9 9 0 0 1 8-5" {...S} strokeOpacity="0.6" />
      <path d="M80 67l-3 4h6z" fill="currentColor" />
      <path d="M80 71c-3 6 3 9 0 14" {...S} strokeWidth="1.5" strokeOpacity="0.6" />
    </>
  ),
  dice: () => (
    <>
      <g transform="rotate(-12 62 50)">
        <rect x="46" y="34" width="32" height="32" rx="7" {...S} {...soft(0.14)} />
        {[[54, 42], [70, 58], [62, 50]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill="currentColor" />)}
      </g>
      <g transform="rotate(14 100 48)">
        <rect x="84" y="32" width="32" height="32" rx="7" {...S} {...soft(0.24)} />
        {[[92, 40], [108, 40], [92, 56], [108, 56]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.6" fill="currentColor" />)}
      </g>
    </>
  ),
  limbo: () => (
    <>
      <circle cx="74" cy="50" r="27" {...S} strokeOpacity="0.4" />
      <circle cx="74" cy="50" r="17" {...S} {...soft(0.1)} />
      <circle cx="74" cy="50" r="6" fill="currentColor" />
      <path d="M124 18 80 46" {...S} />
      <path d="M86 36l-6 10 11-2" {...S} />
      <text x="104" y="80" fontSize="12" fontWeight="700" fill="currentColor" fontFamily="JetBrains Mono, monospace">100×</text>
    </>
  ),
  coinflip: () => (
    <>
      <ellipse cx="56" cy="50" rx="9" ry="24" {...S} strokeOpacity="0.35" {...soft(0.08)} />
      <circle cx="94" cy="48" r="25" {...S} {...soft(0.18)} />
      <circle cx="94" cy="48" r="18" {...S} strokeOpacity="0.5" />
      <text x="94" y="54" textAnchor="middle" fontSize="16" fontWeight="800" fill="currentColor" fontFamily="Unbounded, sans-serif">A</text>
      <path d="M40 30c-6 8-6 30 0 38" {...S} strokeOpacity="0.3" />
    </>
  ),
  roulette: () => (
    <>
      <circle cx="80" cy="48" r="33" {...S} />
      <circle cx="80" cy="48" r="24" fill="none" stroke="currentColor" strokeWidth="10" strokeOpacity="0.45" strokeDasharray="6.28 6.28" />
      <circle cx="80" cy="48" r="9" {...S} {...soft(0.25)} />
      <path d="M80 39v18M71 48h18" {...S} strokeWidth="1.5" />
      <circle cx="98" cy="25" r="3.2" fill="currentColor" />
    </>
  ),
  blackjack: () => (
    <>
      <Card x={52} y={22} label="A" rotate={-9} />
      <Card x={76} y={26} label="K" rotate={9} />
      <text x="128" y="30" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor" fontFamily="JetBrains Mono, monospace">21</text>
    </>
  ),
  reme: () => (
    <>
      {[-27, -9, 9, 27].map((angle, i) => (
        <g key={angle} transform={`rotate(${angle} 80 96)`}>
          <rect x="66" y="22" width="28" height="40" rx="4" {...S} {...soft(0.08 + i * 0.06)} />
          <text x="72" y="35" fontSize="10" fontWeight="800" fill="currentColor" fontFamily="Unbounded, sans-serif">{['7', '8', '9', '10'][i]}</text>
        </g>
      ))}
    </>
  ),
  jackpot: () => (
    <>
      <rect x="42" y="18" width="70" height="62" rx="9" {...S} {...soft(0.1)} />
      <rect x="50" y="32" width="54" height="26" rx="4" {...S} {...soft(0.18)} />
      {[59, 77, 95].map((x) => (
        <text key={x} x={x} y="50.5" textAnchor="middle" fontSize="15" fontWeight="800" fill="currentColor" fontFamily="Unbounded, sans-serif">7</text>
      ))}
      <path d="M68 32v26M86 32v26" stroke="currentColor" strokeOpacity="0.35" />
      <path d="M50 68h30" {...S} strokeOpacity="0.5" />
      <path d="M120 30v24c0 3-2 5-5 5h-3" {...S} />
      <circle cx="120" cy="26" r="4.5" fill="currentColor" />
      <Sparkle x={34} y={26} />
      <Sparkle x={130} y={74} r={3} />
    </>
  ),
}

export default function GameArt({ slug, className }) {
  const accent = getAccent(slug)
  const Art = ART[slug] ?? ART['case-opening']
  return (
    <div className={clsx('relative overflow-hidden', accent.soft, className)}>
      <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--grid-line)_1px,transparent_1px)] [background-size:16px_16px]" />
      <svg viewBox="0 0 160 96" className={clsx('relative h-full w-full', accent.text)} aria-hidden>
        <Art />
      </svg>
    </div>
  )
}
