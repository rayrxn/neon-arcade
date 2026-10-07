import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import AuthShowcase from '@/components/auth/AuthShowcase'
import AuthForm from '@/components/auth/AuthForm'
import AuthBackdrop from '@/components/auth/AuthBackdrop'
import { motion } from 'framer-motion'
import CoinIcon from '@/components/ui/CoinIcon'
import { useAuthStore } from '@/store/useAuthStore'
import { usePrefsStore } from '@/store/usePrefsStore'
import { resolveAppearance } from '@/components/runtime/ThemeController'
import { useT } from '@/i18n'
import { BUILD, formatRelease } from '@/config/build'

/** Bahasa & tema bisa diganti sebelum login. */
function QuickPrefs() {
  const { t } = useT()
  const { language, appearance, setLanguage, setAppearance } = usePrefsStore()
  const isLight = resolveAppearance(appearance) === 'light'
  return (
    <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.08]">
      {['id', 'en'].map((lang) => (
        <button key={lang} onClick={() => setLanguage(lang)} aria-pressed={language === lang} className={language === lang ? 'h-8 rounded-lg bg-white/[0.08] px-2.5 text-xs font-bold text-white' : 'h-8 rounded-lg px-2.5 text-xs font-bold text-slate-500 hover:text-white'}>
          {lang.toUpperCase()}
        </button>
      ))}
      <span className="mx-0.5 h-4 w-px bg-white/10" />
      <button onClick={() => setAppearance(isLight ? 'dark' : 'light')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:text-white" aria-label={t('settings.appearance.title')}>
        {isLight ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>
    </div>
  )
}

export default function AuthPage() {
  // Dicek sekali saat mount: user yang sudah login langsung ke Home,
  // tapi login yang baru berhasil tetap sempat menampilkan animasi "Berhasil".
  const { t, lang } = useT()
  const [alreadySignedIn] = useState(() => !!useAuthStore.getState().session)
  if (alreadySignedIn) return <Navigate to="/" replace />

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <AuthBackdrop />
      <AuthShowcase />
      <main className="relative flex flex-col items-center justify-center px-4 py-20 sm:px-8">
        <div className="absolute right-4 top-4 sm:right-6 sm:top-6">
          <QuickPrefs />
        </div>
        <motion.div className="mb-8 flex flex-col items-center gap-4 text-center lg:hidden" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }} aria-hidden><CoinIcon size={56} spin /></motion.div>
          <Logo />
          <p className="max-w-xs text-sm text-slate-400">{t('auth.showcase.line1')} <span className="auth-shine font-semibold">{t('auth.showcase.line2')}</span></p>
        </motion.div>
        <AuthForm />
        <p className="mt-6 flex flex-wrap items-center justify-center gap-x-2 text-xs text-slate-500">
          <Link to="/status" className="hover:text-slate-300">{t('status.title')}</Link>
          <span aria-hidden="true">·</span>
          <span className="font-mono">v{BUILD.version}</span>
          {BUILD.at && <><span aria-hidden="true">·</span><span>{t('updates.released', { time: formatRelease(BUILD.at, lang) })}</span></>}
        </p>
      </main>
    </div>
  )
}
