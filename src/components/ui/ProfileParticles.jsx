/** Particle profile effects (falling leaves, snow, sakura, embers, hearts …). Pure CSS animation, no JS per frame. */
const SHAPES = {
  leaf: <><path d="M12 2 C19 6 21 14 12 22 C3 14 5 6 12 2 Z" /><path d="M12 4 V21" stroke="#00000033" strokeWidth="1.2" fill="none" /></>,
  petal: <path d="M12 3 C17 7 17 15 12 21 C7 15 7 7 12 3 Z M12 3 L10.5 6 L12 5 L13.5 6 Z" />,
  snow: <path d="M11 2h2v7.3l5.2-3 1 1.7-5.2 3 5.2 3-1 1.7-5.2-3V22h-2v-7.3l-5.2 3-1-1.7 5.2-3-5.2-3 1-1.7 5.2 3z" />,
  heart: <path d="M12 21 C4 15 2 11 3.5 7.5 A4.5 4.5 0 0 1 12 6 A4.5 4.5 0 0 1 20.5 7.5 C22 11 20 15 12 21 Z" />,
  ember: <circle cx="12" cy="12" r="5" />,
  bubble: <><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="9" cy="9" r="2" /></>,
  confetti: <rect x="8" y="4" width="8" height="16" rx="1.5" />,
  coin: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5.5" fill="none" stroke="#00000040" strokeWidth="1.5" /></>,
  bolt: <path d="M13 2 L5 14 H11 L9 22 L19 9 H13 Z" />,
  note: <><path d="M10 4 V16" stroke="currentColor" strokeWidth="2" /><path d="M10 4 L19 2 V6 L10 8 Z" /><ellipse cx="7" cy="17" rx="4" ry="3" /></>,
  star: <path d="M12 2 L14.6 9 L22 9.3 L16.2 14 L18.2 21.2 L12 17 L5.8 21.2 L7.8 14 L2 9.3 L9.4 9 Z" />,
  pixel: <rect x="6" y="6" width="12" height="12" />,
  feather: <path d="M18 3 C10 5 5 11 6 21 L8 19 C9 15 12 11 16 9 C13 10 10 12 9 14 C9 9 13 5 18 3 Z" />,
}

/** kind → shape, motion (fall | rise | float | sway), count, size range px, duration range s. */
export const PARTICLE_FX = {
  leaves: { shape: 'leaf', motion: 'fall', count: 14, size: [12, 22], dur: [6, 10] },
  sakura: { shape: 'petal', motion: 'fall', count: 18, size: [8, 14], dur: [7, 11] },
  snow: { shape: 'snow', motion: 'fall', count: 22, size: [6, 13], dur: [8, 13] },
  hearts: { shape: 'heart', motion: 'rise', count: 12, size: [10, 18], dur: [5, 8] },
  embers: { shape: 'ember', motion: 'rise', count: 26, size: [3, 7], dur: [3, 6], glow: true },
  bubbles: { shape: 'bubble', motion: 'rise', count: 14, size: [8, 18], dur: [6, 10] },
  confetti: { shape: 'confetti', motion: 'fall', count: 26, size: [5, 9], dur: [4, 7] },
  coins: { shape: 'coin', motion: 'fall', count: 12, size: [12, 18], dur: [4, 7] },
  storm: { shape: 'bolt', motion: 'float', count: 6, size: [16, 28], dur: [2.5, 4], glow: true },
  melody: { shape: 'note', motion: 'rise', count: 10, size: [12, 18], dur: [6, 9] },
  stardust: { shape: 'star', motion: 'float', count: 18, size: [6, 12], dur: [3, 6], glow: true },
  pixels: { shape: 'pixel', motion: 'fall', count: 30, size: [4, 8], dur: [3, 5] },
  fireflies: { shape: 'ember', motion: 'float', count: 16, size: [3, 6], dur: [4, 8], glow: true },
  feathers: { shape: 'feather', motion: 'fall', count: 10, size: [14, 22], dur: [8, 12] },
}

// Deterministic pseudo-random so the layout never jumps between renders.
const rnd = (i, k) => {
  const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export default function ProfileParticles({ kind, colors }) {
  const fx = PARTICLE_FX[kind]
  if (!fx) return null
  return (
    <span className="pfx-particles" aria-hidden="true">
      {Array.from({ length: fx.count }, (_, i) => {
        const size = fx.size[0] + rnd(i, 1) * (fx.size[1] - fx.size[0])
        const dur = fx.dur[0] + rnd(i, 2) * (fx.dur[1] - fx.dur[0])
        const color = colors[i % colors.length]
        return (
          <span
            key={i}
            className={`pfx-p pfx-p--${fx.motion}`}
            style={{
              left: `${rnd(i, 3) * 100}%`,
              top: fx.motion === 'float' ? `${rnd(i, 4) * 90}%` : undefined,
              width: size,
              height: size,
              color,
              animationDuration: `${dur}s`,
              animationDelay: `${-rnd(i, 5) * dur}s`,
              '--sway': `${(rnd(i, 6) - 0.5) * 60}px`,
              '--spin': `${(rnd(i, 7) - 0.5) * 720}deg`,
              filter: fx.glow ? `drop-shadow(0 0 4px ${color})` : undefined,
            }}
          >
            <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor">{SHAPES[fx.shape]}</svg>
          </span>
        )
      })}
    </span>
  )
}
