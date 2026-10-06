import { useEffect } from 'react'
import { usePrefsStore } from '@/store/usePrefsStore'
import { setFormatLanguage } from '@/utils/format'

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null)

export function resolveAppearance(appearance) {
  if (appearance === 'system') return media()?.matches ? 'light' : 'dark'
  return appearance === 'light' ? 'light' : 'dark'
}

/** Menerapkan tema & bahasa ke <html>. "System" ikut berubah saat OS berganti tema. */
export default function ThemeController() {
  const appearance = usePrefsStore((s) => s.appearance)
  const language = usePrefsStore((s) => s.language)

  useEffect(() => {
    const apply = () => {
      const resolved = resolveAppearance(appearance)
      document.documentElement.dataset.appearance = resolved
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f3f5fa' : '#06070c')
    }
    apply()
    if (appearance !== 'system') return
    const mq = media()
    mq?.addEventListener?.('change', apply)
    return () => mq?.removeEventListener?.('change', apply)
  }, [appearance])

  useEffect(() => {
    document.documentElement.lang = language
    setFormatLanguage(language)
  }, [language])

  return null
}
