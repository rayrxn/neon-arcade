import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Music, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import clsx from 'clsx'
import { usePrefsStore } from '@/store/usePrefsStore'
import { TRACKS, getPlayerState, musicNext, musicPlayTrack, musicPrev, musicToggle, subscribePlayer } from '@/services/sound'
import { useT } from '@/i18n'

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function usePlayer(open) {
  const [state, setState] = useState(getPlayerState)
  const sound = usePrefsStore((s) => s.sound)
  useEffect(() => subscribePlayer(setState), [])
  useEffect(() => setState(getPlayerState()), [sound])
  // Progress bar hanya diperbarui saat panel terbuka.
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setState(getPlayerState()), 500)
    return () => clearInterval(id)
  }, [open])
  return state
}

/** Tombol musik di header + panel pemutar: lagu sekarang, progress, prev/play/next, volume, playlist. */
export default function MusicPlayer() {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const p = usePlayer(open)
  const volume = usePrefsStore((s) => s.sound?.music ?? 0.4)
  const setSound = usePrefsStore((s) => s.setSound)

  useEffect(() => {
    if (!open) return
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  const on = p.enabled && p.playing
  const pct = p.duration ? Math.min(100, (p.elapsed / p.duration) * 100) : 0
  const ctrl = 'grid h-9 w-9 place-items-center rounded-xl text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-ring'

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={t('music.title')} title={t('music.title')} className={clsx('grid h-9 w-9 place-items-center rounded-xl transition hover:bg-white/5 focus-ring', on ? 'text-neon-cyan' : 'text-slate-500')}>
        {on ? <Music className="h-[18px] w-[18px]" /> : <Music2 className="h-[18px] w-[18px] opacity-60" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="glass-strong fixed right-3 top-[calc(env(safe-area-inset-top,0px)+4.25rem)] z-40 w-[min(320px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl sm:absolute sm:right-0 sm:top-11"
            role="dialog"
            aria-label={t('music.title')}
          >
            <div className="p-4">
              <p className="label-caps">{t('music.nowPlaying')}</p>
              <p className="mt-1 truncate font-display text-base font-bold text-white">{p.track.name}</p>
              <p className="text-xs text-slate-500">{p.track.bpm} BPM · {t('music.synth')}</p>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.08]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <div className="h-full rounded-full bg-neon-cyan transition-[width] duration-500 ease-linear" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500"><span>{mmss(p.elapsed)}</span><span>{mmss(p.duration)}</span></div>
              <div className="mt-2 flex items-center justify-center gap-2">
                <button onClick={musicPrev} className={ctrl} aria-label={t('music.prev')}><SkipBack className="h-4 w-4" /></button>
                <button onClick={musicToggle} className="grid h-11 w-11 place-items-center rounded-full bg-neon-cyan text-onaccent transition hover:brightness-110 focus-ring" aria-label={on ? t('music.pause') : t('music.play')}>
                  {on ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-px" />}
                </button>
                <button onClick={musicNext} className={ctrl} aria-label={t('music.next')}><SkipForward className="h-4 w-4" /></button>
              </div>
              <label className="mt-3 flex items-center gap-3 text-xs text-slate-400">
                <span className="w-14 shrink-0">{t('music.volume')}</span>
                <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setSound({ music: Number(e.target.value), musicOff: Number(e.target.value) === 0 })} className="w-full accent-[rgb(var(--neon-cyan))]" aria-label={t('music.volume')} />
              </label>
              {p.failed && <p className="mt-2 text-xs text-neon-red">{t('music.failed')}</p>}
            </div>
            <ul className="max-h-56 overflow-y-auto border-t hairline py-1">
              {TRACKS.map((tr, i) => {
                const current = i === p.index
                return (
                  <li key={tr.id}>
                    <button onClick={() => musicPlayTrack(i)} className={clsx('flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition hover:bg-white/[0.04]', current ? 'text-neon-cyan' : 'text-slate-300')}>
                      <span className="w-4 font-mono text-[11px] text-slate-500">{current && on ? <span className="eq-bars" aria-hidden><i /><i /><i /></span> : i + 1}</span>
                      <span className="flex-1 truncate font-semibold">{tr.name}</span>
                      <span className="font-mono text-[11px] text-slate-500">{mmss((tr.bars * 4 * 60) / tr.bpm)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
