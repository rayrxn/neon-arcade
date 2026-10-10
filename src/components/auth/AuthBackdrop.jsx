import { useEffect, useRef } from 'react'
import { usePotato } from '@/components/runtime/PerformanceController'

/**
 * Latar halaman awal: titik-titik cahaya yang melayang pelan + garis tipis antar titik yang berdekatan.
 * Canvas tunggal, berhenti saat tab tidak terlihat, diam saat prefers-reduced-motion.
 */
export default function AuthBackdrop() {
  const ref = useRef(null)
  const potato = usePotato()
  useEffect(() => {
    const canvas = ref.current
    const g = canvas?.getContext?.('2d')
    if (!g) return
    // Potato mode: draw the dots once, no animation loop.
    const reduce = potato || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const colors = ['34,225,255', '168,85,247', '250,204,21']
    let w = 0, h = 0, dpr = 1, raf = 0, dots = []
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.round(Math.min(70, (w * h) / 22000))
      dots = Array.from({ length: count }, (_, i) => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.12, vy: -0.05 - Math.random() * 0.14,
        r: 0.6 + Math.random() * 1.6, c: colors[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0], p: Math.random() * Math.PI * 2,
      }))
    }
    const frame = (t) => {
      g.clearRect(0, 0, w, h)
      for (const d of dots) {
        if (!reduce) {
          d.x += d.vx
          d.y += d.vy
          if (d.y < -10) { d.y = h + 10; d.x = Math.random() * w }
          if (d.x < -10) d.x = w + 10
          if (d.x > w + 10) d.x = -10
        }
        const a = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t / 1400 + d.p))
        g.beginPath()
        g.fillStyle = `rgba(${d.c},${a})`
        g.arc(d.x, d.y, d.r, 0, Math.PI * 2)
        g.fill()
      }
      g.lineWidth = 0.6
      for (let i = 0; i < dots.length; i++) {
        for (let j = i + 1; j < dots.length; j++) {
          const a = dots[i], b = dots[j]
          const dx = a.x - b.x, dy = a.y - b.y
          const dist = dx * dx + dy * dy
          if (dist < 9000) {
            g.strokeStyle = `rgba(34,225,255,${0.07 * (1 - dist / 9000)})`
            g.beginPath()
            g.moveTo(a.x, a.y)
            g.lineTo(b.x, b.y)
            g.stroke()
          }
        }
      }
      if (!reduce) raf = requestAnimationFrame(frame)
    }
    const onVis = () => {
      cancelAnimationFrame(raf)
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
    }
    resize()
    raf = requestAnimationFrame(frame)
    window.addEventListener('resize', resize)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [potato])
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden" aria-hidden>
      <div className="auth-aurora auth-aurora--a" />
      <div className="auth-aurora auth-aurora--b" />
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
    </div>
  )
}
