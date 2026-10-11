import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Volume2, X } from 'lucide-react'
import { useT } from '@/i18n'

export const TRAILER_SRC = '/neon-arcade-1.0.0.mp4'
const key = (uid) => `neon-arcade:trailer-seen:${uid}`
export const trailerSeen = (uid) => {
  try { return localStorage.getItem(key(uid)) === '1' } catch { return false }
}
const markSeen = (uid) => {
  try { localStorage.setItem(key(uid), '1') } catch { /* storage blocked: may replay next visit */ }
}

/** Full-screen 1.0.0 trailer, played once per player on the first visit after the release. Skippable. */
export default function ReleaseTrailer({ userId, onDone }) {
  const { t } = useT()
  const ref = useRef(null)
  const [muted, setMuted] = useState(false)
  const finish = () => {
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
  return (
    <motion.div className="fixed inset-0 z-[90] grid place-items-center bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <video ref={ref} src={TRAILER_SRC} playsInline onEnded={finish} onError={finish} className="h-full w-full object-contain" />
      <div className="absolute right-4 top-4 flex gap-2">
        {muted && (
          <button type="button" onClick={() => { ref.current.muted = false; setMuted(false) }} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold text-white backdrop-blur hover:bg-white/25">
            <Volume2 className="h-4 w-4" /> {t('updates.soundOn')}
          </button>
        )}
        <button type="button" onClick={finish} className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold text-white backdrop-blur hover:bg-white/25">
          {t('updates.skip')} <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  )
}
