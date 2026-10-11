import { isRelease } from '@/config/release'
import { GAMES } from '@/config/games'
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Moon, Sun } from 'lucide-react'
import { motion } from 'framer-motion'
import Logo from '@/components/ui/Logo'
import AuthShowcase, { BrandMark } from '@/components/auth/AuthShowcase'
import AuthForm from '@/components/auth/AuthForm'
import AuthBackdrop from '@/components/auth/AuthBackdrop'
import { useAuthStore } from '@/store/useAuthStore'
import { usePrefsStore } from '@/store/usePrefsStore'
import { resolveAppearance } from '@/components/runtime/ThemeController'
import { useT } from '@/i18n'
import { BUILD, CHANGELOG, versionLabel } from '@/config/build'

/** Language & theme before signing in. */
function QuickPrefs() {
  const { t } = useT()
  const { language, appearance, setLanguage, setAppearance } = usePrefsStore()
  const isLight = resolveAppearance(appearance) === 'light'
  return (
    <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.08] backdrop-blur">
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
  // Checked once on mount: signed-in players go home, a fresh sign-in still shows its "success" moment.
  const { t } = useT()
  const [alreadySignedIn] = useState(() => !!useAuthStore.getState().session)
  if (alreadySignedIn) return <Navigate to="/" replace />
  const version = versionLabel(CHANGELOG.find((e) => isRelease(e.version))?.version ?? BUILD.version)

  return (
    <div className="auth-page relative grid min-h-dvh lg:grid-cols-[minmax(0,1.25fr)_minmax(440px,1fr)]">
      <AuthBackdrop />
      <AuthShowcase />
      <main className="relative flex flex-col px-4 pb-8 pt-5 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden"><Logo /></span>
          <QuickPrefs />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center py-8">
          <motion.div className="mb-7 flex flex-col items-center gap-3 text-center lg:hidden" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}>
            <BrandMark size={96} />
            <p className="auth-headline auth-headline--sm text-white">{t('auth.showcase.line1', { count: GAMES.filter((g) => g.load).length })} <span className="auth-shine">{t('auth.showcase.line2')}</span></p>
          </motion.div>
          <AuthForm />
        </div>
        <p className="flex flex-wrap items-center justify-center gap-x-2 text-xs text-slate-500">
          <Link to="/status" className="hover:text-slate-300">{t('status.title')}</Link>
          <span aria-hidden="true">·</span>
          <span className="font-mono">v{version}</span>
          <span aria-hidden="true">·</span>
          <span>{t('auth.stage.footer')}</span>
        </p>
      </main>
    </div>
  )
}
