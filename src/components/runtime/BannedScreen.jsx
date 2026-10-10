import { Ban, CalendarClock, LogOut, ShieldAlert, UserRound } from 'lucide-react'
import Button from '@/components/ui/Button'
import Logo from '@/components/ui/Logo'
import { useAuthStore } from '@/store/useAuthStore'
import { api } from '@/services/server'
import { formatDateTime } from '@/utils/format'
import { useT } from '@/i18n'

/**
 * Shown instead of the app when the account is banned (at sign-in or mid-session).
 * The server already ended every session and refuses all protected actions; the only action here is logging out.
 */
export default function BannedScreen() {
  const { t } = useT()
  const banned = useAuthStore((s) => s.banned)
  if (!banned) return null
  const logout = async () => {
    try {
      await api('auth/logout', {})
    } catch {
      /* the session is already gone on the server */
    }
    useAuthStore.setState({ banned: null, session: null })
    window.location.hash = '#/auth'
  }
  const rows = [
    [ShieldAlert, t('banned.status'), banned.permanent || !banned.until ? t('banned.permanent') : t('banned.temporary')],
    [CalendarClock, t('banned.until'), banned.until ? formatDateTime(banned.until) : t('banned.never')],
    [CalendarClock, t('banned.issued'), banned.at ? formatDateTime(banned.at) : '—'],
    [UserRound, t('banned.by'), banned.by ? `@${banned.by}` : t('banned.staff')],
  ]
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-ink-950 px-4 py-10" role="alertdialog" aria-modal="true" aria-labelledby="banned-title">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center"><Logo /></div>
        <div className="glass-strong overflow-hidden rounded-2xl">
          <div className="border-b border-neon-red/20 bg-neon-red/10 px-6 py-5 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-neon-red/15 text-neon-red ring-1 ring-inset ring-neon-red/30"><Ban className="h-7 w-7" /></span>
            <h1 id="banned-title" className="mt-3 font-display text-2xl font-bold text-white">{t('banned.title')}</h1>
            <p className="mt-1 text-sm text-slate-300">{t('banned.subtitle')}</p>
          </div>
          <div className="space-y-4 p-6">
            <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06]">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('banned.reason')}</p>
              <p className="mt-1 text-sm font-semibold text-white">{banned.reason && banned.reason !== '—' ? banned.reason : t('banned.noReason')}</p>
            </div>
            <dl className="space-y-2.5 text-sm">
              {rows.map(([Icon, k, v]) => (
                <div key={k} className="flex items-center justify-between gap-3">
                  <dt className="flex items-center gap-2 text-slate-400"><Icon className="h-4 w-4" /> {k}</dt>
                  <dd className="text-right font-semibold text-slate-100">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-xs leading-relaxed text-slate-500">{t('banned.appeal')}</p>
            <Button size="lg" variant="danger" className="w-full" onClick={logout}><LogOut className="h-4 w-4" /> {t('banned.logout')}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
