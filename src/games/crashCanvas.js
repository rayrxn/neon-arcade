import { CRASH_K } from '@/services/games'

/** Warna dari token tema (canvas tidak bisa membaca kelas Tailwind). */
export function themeColors(el) {
  const css = getComputedStyle(el)
  const v = (name) => `rgb(${css.getPropertyValue(name).trim().split(' ').join(',')})`
  const a = (name, alpha) => `rgba(${css.getPropertyValue(name).trim().split(' ').join(',')},${alpha})`
  return { cyan: v('--neon-cyan'), cyanA: (x) => a('--neon-cyan', x), red: v('--neon-red'), redA: (x) => a('--neon-red', x), green: v('--neon-green'), grid: a('--white', 0.06), label: a('--white', 0.35) }
}

/** Skala sumbu yang "rapi" (1×, 1.5×, 2×, 5×, 10× …). */
function niceStep(range) {
  const raw = range / 4
  const pow = 10 ** Math.floor(Math.log10(raw))
  const n = raw / pow
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * pow
}

/**
 * Menggambar ronde Crash di canvas: grid & label bersekala, area gradasi,
 * garis dengan glow, roket di ujung, dan partikel ledakan saat crash.
 */
export function drawFrame(canvas, state, colors) {
  const dpr = window.devicePixelRatio || 1
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  drawSpace(ctx, w, h, state)

  const padL = 44
  const padB = 26
  const padT = 18
  const padR = 18
  const plotW = w - padL - padR
  const plotH = h - padT - padB
  const seconds = Math.max(6, state.elapsed / 1000 * 1.12)
  const current = state.multiplier
  const maxM = Math.max(2, current * 1.2)
  const x = (s) => padL + (s / seconds) * plotW
  const y = (m) => padT + plotH - ((m - 1) / (maxM - 1)) * plotH

  // Grid + label
  ctx.font = '600 11px "JetBrains Mono", monospace'
  ctx.fillStyle = colors.label
  ctx.strokeStyle = colors.grid
  ctx.lineWidth = 1
  const mStep = niceStep(maxM - 1)
  for (let m = 1; m <= maxM + 0.001; m += mStep) {
    const yy = Math.round(y(m)) + 0.5
    ctx.beginPath()
    ctx.moveTo(padL, yy)
    ctx.lineTo(w - padR, yy)
    ctx.stroke()
    ctx.textAlign = 'right'
    ctx.fillText(`${m.toFixed(m < 10 ? 1 : 0)}×`, padL - 8, yy + 4)
  }
  const sStep = niceStep(seconds)
  ctx.textAlign = 'center'
  for (let s = 0; s <= seconds; s += sStep) ctx.fillText(`${Math.round(s)}s`, x(s), h - 8)

  if (!state.active && !state.end) return

  const crashed = state.end?.crashed
  const line = crashed ? colors.red : colors.cyan
  const lineA = crashed ? colors.redA : colors.cyanA
  const now = state.elapsed / 1000
  const pts = []
  for (let i = 0; i <= 80; i++) {
    const s = (now * i) / 80
    pts.push([x(s), y(Math.min(current, Math.exp(CRASH_K * s)))])
  }
  const [tx, ty] = pts[pts.length - 1]

  // Area
  const grad = ctx.createLinearGradient(0, ty, 0, padT + plotH)
  grad.addColorStop(0, lineA(0.28))
  grad.addColorStop(1, lineA(0))
  ctx.beginPath()
  ctx.moveTo(pts[0][0], padT + plotH)
  pts.forEach(([px, py]) => ctx.lineTo(px, py))
  ctx.lineTo(tx, padT + plotH)
  ctx.closePath()
  ctx.fillStyle = grad
  ctx.fill()

  // Garis + glow
  // Glow as a wide translucent stroke under the line (shadowBlur every frame was the main cause of lag).
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
  ctx.strokeStyle = lineA(0.25)
  ctx.lineWidth = 11
  ctx.stroke()
  ctx.strokeStyle = line
  ctx.lineWidth = 3.5
  ctx.stroke()
  ctx.restore()

  // Garis cash out pemain
  if (state.end && !crashed && state.end.cashedAt) {
    const yy = y(state.end.cashedAt)
    ctx.setLineDash([5, 5])
    ctx.strokeStyle = colors.green
    ctx.beginPath()
    ctx.moveTo(padL, yy)
    ctx.lineTo(w - padR, yy)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (crashed) {
    // Ledakan: partikel memudar dari titik crash.
    const t = Math.min(1, (performance.now() - state.end.at) / 900)
    for (const p of state.particles) {
      ctx.globalAlpha = 1 - t
      ctx.fillStyle = p.c
      ctx.beginPath()
      ctx.arc(tx + p.vx * t * 70, ty + p.vy * t * 70 + t * t * 30, p.r * (1 - t * 0.5), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  } else {
    // Roket mengikuti arah kurva.
    const [px, py] = pts[pts.length - 4] ?? pts[0]
    const angle = Math.atan2(ty - py, tx - px)
    ctx.save()
    ctx.translate(tx, ty)
    ctx.rotate(angle)
    ctx.scale(1.9, 1.9)
    const flicker = 6 + Math.random() * 5
    ctx.fillStyle = 'rgba(255,170,60,0.9)'
    ctx.beginPath()
    ctx.moveTo(-10, -3)
    ctx.lineTo(-10 - flicker, 0)
    ctx.lineTo(-10, 3)
    ctx.fill()
    ctx.fillStyle = '#f2f5ff'
    ctx.beginPath()
    ctx.moveTo(12, 0)
    ctx.quadraticCurveTo(4, -7, -10, -5)
    ctx.lineTo(-10, 5)
    ctx.quadraticCurveTo(4, 7, 12, 0)
    ctx.fill()
    ctx.fillStyle = line
    ctx.beginPath()
    ctx.arc(3, 0, 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

export const makeParticles = (colors) =>
  Array.from({ length: 26 }, () => {
    const a = Math.random() * Math.PI * 2
    const s = 0.4 + Math.random()
    return { vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 1.5 + Math.random() * 3, c: Math.random() < 0.5 ? colors.red : 'rgba(255,190,90,0.95)' }
  })


// Deep-space backdrop: a cached nebula + planets layer (drawn once per size) and three parallax star layers
// that stream faster as the multiplier climbs.
const STAR_LAYERS = [0.15, 0.4, 0.9].map((speed, l) => ({ speed, stars: Array.from({ length: 46 - l * 12 }, (_, i) => ({ x: (i * 97 + l * 31) % 1000 / 1000, y: (i * 57 + l * 71) % 1000 / 1000, r: 0.5 + l * 0.6 })) }))
let bgCache = null
function backdrop(w, h) {
  const dpr = window.devicePixelRatio || 1
  if (bgCache && bgCache.w === w && bgCache.h === h) return bgCache.c
  const c = document.createElement('canvas')
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
  const g = c.getContext('2d')
  g.scale(dpr, dpr)
  const sky = g.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#04030d'); sky.addColorStop(0.55, '#0c0a24'); sky.addColorStop(1, '#1d0f33')
  g.fillStyle = sky
  g.fillRect(0, 0, w, h)
  for (const [x, y, r, col] of [[0.25, 0.3, 0.45, '124,58,237'], [0.7, 0.65, 0.4, '236,72,153'], [0.5, 0.15, 0.3, '34,211,238']]) {
    const n = g.createRadialGradient(x * w, y * h, 0, x * w, y * h, r * Math.max(w, h))
    n.addColorStop(0, `rgba(${col},0.18)`); n.addColorStop(1, `rgba(${col},0)`)
    g.fillStyle = n
    g.fillRect(0, 0, w, h)
  }
  // Ringed planet
  const px = w * 0.82, py = h * 0.24, pr = Math.min(w, h) * 0.11
  g.strokeStyle = 'rgba(244,114,182,0.35)'; g.lineWidth = 3
  g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.42, -0.35, Math.PI, Math.PI * 2); g.stroke()
  const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr)
  pg.addColorStop(0, '#e9d5ff'); pg.addColorStop(0.35, '#a855f7'); pg.addColorStop(1, '#3b0764')
  g.fillStyle = pg
  g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill()
  g.strokeStyle = 'rgba(244,114,182,0.6)'
  g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.42, -0.35, 0, Math.PI); g.stroke()
  // Small moon
  const mx = w * 0.12, my = h * 0.18, mr = Math.min(w, h) * 0.035
  const mg = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 0, mx, my, mr)
  mg.addColorStop(0, '#f1f5f9'); mg.addColorStop(1, '#64748b')
  g.fillStyle = mg
  g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill()
  // Planet horizon at the bottom
  const hz = g.createLinearGradient(0, h * 0.86, 0, h)
  hz.addColorStop(0, 'rgba(56,189,248,0.0)'); hz.addColorStop(1, 'rgba(56,189,248,0.22)')
  g.fillStyle = hz
  g.beginPath(); g.ellipse(w / 2, h * 1.55, w * 1.1, h * 0.7, 0, 0, Math.PI * 2); g.fill()
  bgCache = { w, h, c }
  return c
}
function drawSpace(ctx, w, h, state) {
  ctx.drawImage(backdrop(w, h), 0, 0, w, h)
  const t = (state.elapsed ?? 0) / 1000
  const boost = Math.min(6, Math.log2(Math.max(1, state.multiplier ?? 1)) + 1)
  for (const layer of STAR_LAYERS) {
    ctx.fillStyle = `rgba(226,232,240,${0.35 + layer.speed * 0.6})`
    const len = layer.speed * boost * 3
    for (const st of layer.stars) {
      const x = (((st.x - t * layer.speed * 0.05 * boost) % 1) + 1) % 1
      const y = (((st.y + t * layer.speed * 0.03 * boost) % 1) + 1) % 1
      ctx.fillRect(x * w, y * h, st.r + len, st.r)
    }
  }
}
