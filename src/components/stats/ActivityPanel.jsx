import { useEffect, useState } from 'react'
import { Activity, KeyRound, ShieldAlert, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { EmptyState, Panel, Segmented } from '@/components/ui/Controls'
import { fetchActivity } from '@/services/platform2'
import { SERVER_MODE } from '@/config/runtime'
import { formatCoins, formatDateTime } from '@/utils/format'
import { useT } from '@/i18n'

const KINDS = ['all', 'games', 'rewards', 'ac', 'ag', 'lxp', 'security']

/** One merged timeline of wallet entries, Loyalty XP and sign-ins (server only, last 90 days). */
export default function ActivityPanel() {
  const { t, lang } = useT()
  const [kind, setKind] = useState('all')
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!SERVER_MODE) return
    let alive = true
    setRows(null)
    setError(false)
    fetchActivity(kind).then((d) => alive && setRows(d)).catch(() => alive && setError(true))
    return () => { alive = false }
  }, [kind])

  if (!SERVER_MODE) return null

  const label = (r) => {
    if (r.kind === 'login') return r.ok ? t('activity.loginOk') : t('activity.loginFail')
    if (r.kind === 'lxp') return t('activity.lxp', { source: r.source })
    return r.reason && r.type !== 'bet' && r.type !== 'win' ? r.reason : t(`activity.type.${r.type}`)
  }

  return (
    <Panel title={t('activity.title')} icon={Activity}>
      <div className="overflow-x-auto border-b hairline px-3 py-2.5 scrollbar-none sm:px-4">
        <Segmented size="sm" layoutId="act-kind" value={kind} onChange={setKind} className="w-max" options={KINDS.map((k) => ({ value: k, label: t(`activity.kind.${k}`) }))} />
      </div>
      {error ? (
        <p className="p-4 text-sm text-slate-400">{t('activity.error')}</p>
      ) : rows === null ? (
        <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-lg bg-white/[0.04]" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Activity} title={t('activity.empty')} body={t('activity.emptyBody')} />
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {rows.map((r, i) => {
            const plus = r.kind === 'lxp' || (r.kind === 'wallet' && r.amount > 0)
            const Icon = r.kind === 'login' ? (r.ok ? KeyRound : ShieldAlert) : r.kind === 'lxp' ? Sparkles : null
            return (
              <li key={`${r.at}-${i}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                {Icon ? <Icon className={clsx('h-4 w-4 shrink-0', r.kind === 'login' && !r.ok ? 'text-neon-red' : 'text-slate-400')} /> : <span className={clsx('h-2 w-2 shrink-0 rounded-full', plus ? 'bg-neon-green' : 'bg-neon-red')} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-200">{label(r)}</p>
                  <p className="text-[11px] text-slate-500">{formatDateTime(r.at, lang)}{r.kind === 'login' && r.ip ? ` · ${r.ip}` : ''}</p>
                </div>
                {r.kind === 'wallet' && (
                  <span className={clsx('num shrink-0 font-mono text-xs font-bold', plus ? 'text-neon-green' : 'text-slate-300')}>
                    {plus ? '+' : '−'}{formatCoins(Math.abs(r.amount))} {r.currency}
                  </span>
                )}
                {r.kind === 'lxp' && <span className="num shrink-0 font-mono text-xs font-bold text-neon-cyan">+{formatCoins(r.amount)} LXP</span>}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
