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
  ctx.save()
  ctx.shadowColor = line
  ctx.shadowBlur = 14
  ctx.strokeStyle = line
  ctx.lineWidth = 3.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.beginPath()
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)))
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

