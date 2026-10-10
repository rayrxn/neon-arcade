import { useEffect } from 'react'
import { usePrefsStore } from '@/store/usePrefsStore'
import { toast } from '@/store/useUiStore'
import { t } from '@/i18n'

/** Weak hardware or data saver: start in potato mode without measuring. */
export function lowSpecDevice() {
  if (typeof navigator === 'undefined') return false
  const mem = navigator.deviceMemory
  const cores = navigator.hardwareConcurrency
  return (mem != null && mem <= 2) || (cores != null && cores <= 2) || navigator.connection?.saveData === true
}

/** Is potato mode active right now? */
export function potatoActive(state = usePrefsStore.getState()) {
  if (state.performance === 'on') return true
  if (state.performance === 'off') return false
  return state.autoPotato === true || lowSpecDevice()
}
export const usePotato = () => usePrefsStore((s) => potatoActive(s))

/** Average frames per second over `ms`, measured with requestAnimationFrame. */
function measureFps(ms) {
  return new Promise((resolve) => {
    let frames = 0
    const start = performance.now()
    const tick = (now) => {
      frames++
      if (now - start < ms) requestAnimationFrame(tick)
      else resolve((frames * 1000) / (now - start))
    }
    requestAnimationFrame(tick)
  })
}

/**
 * Applies potato mode to <html data-potato> (index.css turns off blur, glows and decorative animation;
 * games keep their own motion). In "auto", the first visit measures the frame rate once while the
 * page is busy animating; under ~40 fps the device gets potato mode and the player is told.
 */
export default function PerformanceController() {
  const performanceMode = usePrefsStore((s) => s.performance)
  const autoPotato = usePrefsStore((s) => s.autoPotato)
  const active = usePotato()

  useEffect(() => {
    if (active) document.documentElement.dataset.potato = '1'
    else delete document.documentElement.dataset.potato
  }, [active])

  useEffect(() => {
    if (performanceMode !== 'auto' || autoPotato !== null || lowSpecDevice() || typeof requestAnimationFrame === 'undefined') return
    let cancelled = false
    const id = setTimeout(async () => {
      if (document.visibilityState !== 'visible') return
      const fps = await measureFps(2500)
      if (cancelled) return
      const slow = fps < 40
      usePrefsStore.getState().setAutoPotato(slow)
      if (slow) toast({ tone: 'info', title: t('perf.autoOnTitle'), body: t('perf.autoOnBody') })
    }, 2500)
    return () => {
      cancelled = true
      clearTimeout(id)
    }
  }, [performanceMode, autoPotato])

  return null
}
