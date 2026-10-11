import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { Volume2 } from 'lucide-react'
import { useT } from '@/i18n'

export const TRAILER_SRC = '/neon-arcade-1.0.0-reel.mp4'
const HOLD_MS = 3000
/**
 * Cutscene rule: the trailer plays once per player, the first time they arrive after 3+ hours away
 * (a first visit counts as away). Players who stay active are not interrupted; it can always be replayed by hand.
 */
export const AWAY_MS = 3 * 60 * 60 * 1000
const activeKey = (uid) => `neon-arcade:last-active:${uid}`
const seenKey = (uid) => `neon-arcade:trailer2-seen:${uid}`
const read = (k) => { try { return localStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { localStorage.setItem(k, v) } catch { /* storage blocked: may replay next visit */ } }
export const trailerSeen = (uid) => read(seenKey(uid)) === '1'
export const awayLong = (uid) => Date.now() - (Number(read(activeKey(uid))) || 0) > AWAY_MS
export const trailerDue = (uid) => !trailerSeen(uid) && awayLong(uid)
export const touchActive = (uid) => write(activeKey(uid), String(Date.now()))
const markSeen = (uid) => { write(seenKey(uid), '1'); touchActive(uid) }

/**
 * Full-screen 1.0.0 trailer, played once as a cutscene when a player comes back after 3 hours away. To skip, hold Space (or press and hold
 * anywhere on the screen) for 3 seconds: a ring fills around a white Space keycap.
 */
export default function ReleaseTrailer({ userId, onDone }) {
  const { t } = useT()
  const ref = useRef(null)
  const [muted, setMuted] = useState(false)
  const [progress, setProgress] = useState(0)
  const holding = useRef(false)
  const done = useRef(false)
  const [closing, setClosing] = useState(false)
  // Smooth exit: the sound fades out and the picture dissolves (~0.7 s) before the update log takes over.
  const finish = () => {
    if (done.current) return
    done.current = true
    holding.current = false
    if (userId) markSeen(userId)
    setClosing(true)
    const v = ref.current
    const v0 = v ? v.volume : 0
    const t0 = performance.now()
    let closed = false
    const close = () => { if (closed) return; closed = true; try { v?.pause() } catch { /* already gone */ } onDone() }
    const fade = () => {
      const k = Math.min(1, Math.max(0, (performance.now() - t0) / 650))
      try { if (v) v.volume = Math.min(1, Math.max(0, v0 * (1 - k))) } catch { /* some browsers lock volume */ }
      if (k < 1) requestAnimationFrame(fade)
      else close()
    }
    requestAnimationFrame(fade)
    setTimeout(close, 900) // safety net: never leave an invisible overlay on top of the app
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
        if (done.current) return p
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

  // Skip control: a pill keycap at the bottom centre; the ring starts at the top middle, runs clockwise and closes there.
  const touch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  const PW = 300, PH = 64, SW = 4
  const r = (PH - SW) / 2, x0 = SW / 2, y0 = SW / 2, x1 = PW - SW / 2, y1 = PH - SW / 2, cx = PW / 2
  const ring = `M${cx} ${y0} H${x1 - r} A${r} ${r} 0 0 1 ${x1 - r} ${y1} H${x0 + r} A${r} ${r} 0 0 1 ${x0 + r} ${y0} H${cx}`
  const stop = (e) => e.preventDefault()
  return (
    <motion.div
      className={clsx('fixed inset-0 z-[90] grid select-none place-items-center bg-black', closing && 'pointer-events-none')}
      style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', touchAction: 'none' }}
      initial={{ opacity: 0 }}
      animate={closing ? { opacity: 0, scale: 1.03, filter: 'blur(6px)' } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
      transition={{ duration: closing ? 0.65 : 0.4, ease: [0.22, 1, 0.36, 1] }}
      onContextMenu={stop}
      onPointerDown={() => { holding.current = true }}
      onPointerUp={() => { holding.current = false }}
      onPointerLeave={() => { holding.current = false }}
      onPointerCancel={() => { holding.current = false }}
    >
      <video ref={ref} src={TRAILER_SRC} playsInline onEnded={finish} onError={finish} onContextMenu={stop} controlsList="nodownload noplaybackrate noremoteplayback" disablePictureInPicture disableRemotePlayback
        className="pointer-events-none h-full w-full object-contain" style={{ WebkitTouchCallout: 'none' }} />
      {muted && (
        <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={() => { ref.current.muted = false; setMuted(false) }} className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold text-white backdrop-blur hover:bg-white/25">
          <Volume2 className="h-4 w-4" /> {t('updates.soundOn')}
        </button>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2">
        <div className="relative" style={{ width: PW, height: PH, maxWidth: '80vw' }}>
          <svg viewBox={`0 0 ${PW} ${PH}`} className="absolute inset-0 h-full w-full" aria-hidden>
            <path d={ring} fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.28)" strokeWidth={SW} />
            <path d={ring} fill="none" stroke="#fff" strokeWidth={SW} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - progress} />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-xl font-bold tracking-wide text-white" style={{ transform: `scale(${progress > 0 ? 0.96 : 1})` }}>{touch ? t('updates.hold') : 'Space'}</span>
        </div>
        <span className="text-xs font-semibold text-white/60">{t(touch ? 'updates.holdSkipTouch' : 'updates.holdSkip')}</span>
      </div>
    </motion.div>
  )
}
