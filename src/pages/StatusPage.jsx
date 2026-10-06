import { Link } from 'react-router-dom'
import { Activity, ArrowLeft, CheckCircle2, CircleAlert, Wrench, XCircle } from 'lucide-react'
import clsx from 'clsx'
import Logo from '@/components/ui/Logo'
import { ErrorState, Skeleton, useQuery } from '@/components/ui/PageKit'
import { useAdminStore } from '@/store/useAdminStore'
import { maintenanceActive, overallStatus, serviceStatus } from '@/services/system'
import { useNow } from '@/hooks/useNow'
import { formatDateTime, formatTime } from '@/utils/format'
import { useT } from '@/i18n'

export const STATUS_META = {
  OPERATIONAL: { icon: CheckCircle2, cls: 'text-neon-green', bg: 'bg-neon-green/10 ring-neon-green/25' },
  DEGRADED: { icon: CircleAlert, cls: 'text-neon-gold', bg: 'bg-neon-gold/10 ring-neon-gold/25' },
  MAINTENANCE: { icon: Wrench, cls: 'text-neon-cyan', bg: 'bg-neon-cyan/10 ring-neon-cyan/25' },
  OUTAGE: { icon: XCircle, cls: 'text-neon-red', bg: 'bg-neon-red/10 ring-neon-red/25' },
}

/** Halaman publik /status — bisa dibuka tanpa login. */
export default function StatusPage() {
  const { t } = useT()
  const system = useAdminStore((s) => s.system)
  const gameConfig = useAdminStore((s) => s.gameConfig)
  const now = useNow(15_000)
  const query = useQuery(() => serviceStatus(), [system, gameConfig, now])
  const overall = query.data ? overallStatus(query.data) : 'OPERATIONAL'
  const meta = STATUS_META[overall]
  const m = system?.maintenance

  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-4 py-8 sm:py-12">
      <div className="flex items-center justify-between">
        <Logo />
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> {t('status.back')}</Link>
      </div>
      <h1 className="mt-8 flex items-center gap-2 font-display text-2xl font-bold text-white"><Activity className="h-6 w-6 text-neon-cyan" /> {t('status.title')}</h1>
      {query.loading ? (
        <Skeleton rows={7} />
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={query.retry} />
      ) : (
        <>
          <div className={clsx('mt-5 flex items-center gap-3 rounded-2xl px-5 py-4 ring-1 ring-inset', meta.bg)}>
            <meta.icon className={clsx('h-6 w-6', meta.cls)} />
            <div>
              <p className={clsx('font-display text-lg font-bold', meta.cls)}>{t(`status.overall.${overall}`)}</p>
              <p className="text-xs text-slate-400">{t('status.checked', { time: formatTime(now) })}</p>
            </div>
          </div>
          {maintenanceActive(now) && (
            <div className="mt-3 rounded-2xl bg-neon-cyan/[0.06] px-5 py-4 ring-1 ring-inset ring-neon-cyan/20">
              <p className="text-sm font-bold text-neon-cyan">{t('maintenance.title')}</p>
              <p className="mt-1 text-sm text-slate-300">{m.message || t('maintenance.defaultMessage')}</p>
              {m.until && <p className="mt-1 text-xs text-slate-500">{t('maintenance.eta', { time: formatDateTime(m.until) })}</p>}
            </div>
          )}
          <ul className="glass mt-5 divide-y divide-white/[0.05] rounded-2xl">
            {query.data.map((s) => {
              const sm = STATUS_META[s.status]
              return (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3.5">
                  <sm.icon className={clsx('h-5 w-5 shrink-0', sm.cls)} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-white">{t(`status.services.${s.id}`)}</p>
                    {s.note && <p className="text-xs text-slate-400">{s.note}</p>}
                    {s.id === 'games' && s.gamesOff > 0 && <p className="text-xs text-slate-500">{t('status.gamesOff', { n: s.gamesOff })}</p>}
                  </div>
                  <span className={clsx('text-xs font-extrabold uppercase tracking-wider', sm.cls)}>{t(`status.states.${s.status}`)}</span>
                </li>
              )
            })}
          </ul>
          <p className="mt-4 text-center text-[11px] text-slate-600">{t('status.localNote')}</p>
        </>
      )}
    </div>
  )
}
