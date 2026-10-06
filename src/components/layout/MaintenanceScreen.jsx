import { Link } from 'react-router-dom'
import { Wrench } from 'lucide-react'
import { useAdminStore } from '@/store/useAdminStore'
import { useNow } from '@/hooks/useNow'
import { formatCountdown, formatDateTime } from '@/utils/format'
import { useT } from '@/i18n'

/** Ditampilkan ke user biasa saat maintenance aktif. Staff tetap bisa masuk. */
export default function MaintenanceScreen() {
  const { t } = useT()
  const m = useAdminStore((s) => s.system?.maintenance)
  const now = useNow(1000)
  return (
    <div className="glass mx-auto max-w-lg rounded-3xl px-6 py-12 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-neon-cyan/10 text-neon-cyan"><Wrench className="h-7 w-7" /></span>
      <h1 className="mt-4 font-display text-2xl font-bold text-white">{t('maintenance.title')}</h1>
      <p className="mt-2 text-sm text-slate-300">{m?.message || t('maintenance.defaultMessage')}</p>
      {m?.until && (
        <p className="mt-3 text-sm text-slate-400">
          {t('maintenance.eta', { time: formatDateTime(m.until) })} · <span className="num font-mono text-neon-cyan">{formatCountdown(Math.max(0, m.until - now))}</span>
        </p>
      )}
      <p className="mt-1 text-xs text-slate-500">{t('maintenance.status')}</p>
      <Link to="/status" className="mt-6 inline-flex h-10 items-center rounded-xl bg-white/[0.06] px-4 text-sm font-bold text-white hover:bg-white/[0.1]">{t('maintenance.viewStatus')}</Link>
    </div>
  )
}
