import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Volume2 } from 'lucide-react'
import { useT } from '@/i18n'

export const TRAILER_SRC = '/neon-arcade-1.0.0.mp4'
const HOLD_MS = 3000
const key = (uid) => `neon-arcade:trailer-seen:${uid}`
export const trailerSeen = (uid) => {
  try { return localStorage.getItem(key(uid)) === '1' } catch { return false }
}
const markSeen = (uid) => {
  try { localStorage.setItem(key(uid), '1') } catch { /* storage blocked: may replay next visit */ }
}

/**
 * Full-screen 1.0.0 trailer, played once per player after the release. To skip, hold Space (or press and hold
 * anywhere on the screen) for 3 seconds: a ring fills around a white Space keycap.
 */
export default function ReleaseTrailer({ userId, onDone }) {
  const { t } = useT()
  const ref = useRef(null)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const holding = useRef(false)
  const done = useRef(false)
  const finish = () => {
    if (done.current) return
    done.current = true
    if (userId) markSeen(userId)
    onDone()
  }

  useEffect(() => {
    const v = ref.current
    if (!v) return
    // Browsers block autoplay with sound until the user interacts: fall back to muted with a "sound on" button.
    v.play().catch(() => {
      v.muted = true
      setMuted(true)
      v.play().catch(() => {})
    })
  }, [])

  // Hold-to-skip: the ring fills while held and drains quickly when released.
  useEffect(() => {
    let raf
    let last = performance.now()
    const tick = (now) => {
      const dt = now - last
      last = now
      setProgress((p) => {
        const next = holding.current ? Math.min(1, p + dt / HOLD_MS) : Math.max(0, p - dt / 600)
        if (next >= 1) setTimeout(finish, 0)
        return next
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    const down = (e) => { if (e.code === 'Space') { e.preventDefault(); holding.current = true } }
    const up = (e) => { if (e.code === 'Space') holding.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const R = 38
  const C = 2 * Math.PI * R
  return (
    <motion.div
      className="fixed inset-0 z-[90] grid select-none place-items-center bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onPointerDown={() => { holding.current = true }}
      onPointerUp={() => { holding.current = false }}
      onPointerLeave={() => { holding.current = false }}
      onPointerCancel={() => { holding.current = false }}
    >
      <video ref={ref} src={TRAILER_SRC} playsInline onEnded={finish} onError={finish} className="pointer-events-none h-full w-full object-contain" />
      {muted && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => { ref.current.muted = false; setMuted(false) }} className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold text-white backdrop-blur hover:bg-white/25">
          <Volume2 className="h-4 w-4" /> {t('updates.soundOn')}
        </button>
      )}
      <div className="pointer-events-none absolute bottom-6 right-6 flex items-center gap-3">
        <span className="text-sm font-semibold text-white/80 drop-shadow">{t('updates.holdSkip')}</span>
        <div className="relative grid h-24 w-24 place-items-center">
          <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="50" cy="50" r={R} fill="rgba(0,0,0,0.45)" stroke="rgba(255,255,255,0.18)" strokeWidth="6" />
            <circle cx="50" cy="50" r={R} fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
          </svg>
          <span className="relative rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-[11px] font-black tracking-wider text-slate-800 shadow-[0_3px_0_#94a3b8]" style={{ transform: `translateY(${progress > 0 ? 2 : 0}px)` }}>SPACE</span>
        </div>
      </div>
    </motion.div>
  )
}
