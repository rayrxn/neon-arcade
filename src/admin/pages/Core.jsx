import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, Play, RefreshCw, XCircle } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import ReasonDialog from '@/components/admin/ReasonDialog'
import { AdminPage, Badge, Card, Kpi, Table, Tabs } from '@/components/admin/AdminKit'
import { adminCall } from '@/services/server'
import { useAdminStore } from '@/store/useAdminStore'
import { useCurrentUser } from '@/store/useAuthStore'
import { toast } from '@/store/useUiStore'
import { can } from '@/config/roles'
import { SERVER_MODE } from '@/config/runtime'
import { errorKey } from '@/utils/errors'
import { formatCoins, formatDateTime, timeAgo } from '@/utils/format'
import { useT } from '@/i18n'

const useV3 = () => useAdminStore((s) => s.v3) ?? {}

function ServerOnly({ title }) {
  const { t } = useT()
  return <AdminPage title={title}><Card><p className="p-6 text-center text-sm text-slate-500">{t('admin.serverOnly')}</p></Card></AdminPage>
}

// ───────────────────────────── Feature flags ─────────────────────────────

const STATES = ['off', 'tester', 'vip', 'public']
const STATE_TONE = { off: 'red', tester: 'orange', vip: 'purple', public: 'green' }

export function FeaturesAdmin() {
  const { t } = useT()
  const me = useCurrentUser()
  const { features = {} } = useV3()
  const [pending, setPending] = useState(null)
  if (!SERVER_MODE) return <ServerOnly title={t('admin.nav.features')} />
  return (
    <AdminPage title={t('admin.nav.features')} description={t('admin.features.desc')}>
      <Card bodyClassName="">
        <Table
          rows={Object.entries(features).map(([key, f]) => ({ id: key, key, ...f }))}
          columns={[
            { key: 'l', label: t('admin.features.feature'), render: (f) => <span><span className="font-semibold text-white">{f.label}</span> <span className="font-mono text-[11px] text-slate-500">{f.key}</span></span> },
            { key: 's', label: t('admin.cols.status'), render: (f) => <Badge tone={STATE_TONE[f.state ?? 'public']}>{t(`admin.features.states.${f.state ?? 'public'}`)}</Badge> },
            { key: 'a', label: '', align: 'right', render: (f) => (
              <span className="inline-flex overflow-hidden rounded-lg ring-1 ring-inset ring-white/10">
                {STATES.map((s) => (
                  <button key={s} disabled={!can(me.role, 'features.manage') || (f.state ?? 'public') === s} onClick={() => setPending({ key: f.key, label: f.label, state: s })}
                    className={clsx('px-2.5 py-1 text-[11px] font-bold transition disabled:cursor-default', (f.state ?? 'public') === s ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-white')}>
                    {t(`admin.features.states.${s}`)}
                  </button>
                ))}
              </span>
            ) },
          ]}
        />
      </Card>
      <p className="text-[11px] text-slate-500">{t('admin.features.note')}</p>
      {pending && (
        <ReasonDialog open onClose={() => setPending(null)} adminName={me.username} tone="primary" title={`${pending.label} → ${t(`admin.features.states.${pending.state}`)}`}
          onConfirm={(r) => adminCall('setFeature', { key: pending.key, state: pending.state, reason: r })} />
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Error monitoring ─────────────────────────────

export function MonitoringAdmin() {
  const { t } = useT()
  const me = useCurrentUser()
  const { errorSummary = [] } = useV3()
  const [tab, setTab] = useState('all')
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)
  const [clear, setClear] = useState(false)
  if (!SERVER_MODE) return <ServerOnly title={t('admin.nav.monitoring')} />
  const load = async (ctx = tab) => {
    setBusy(true)
    try {
      setRows(await adminCall('errorLog', { context: ctx === 'all' ? '' : `${ctx}:` }))
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    } finally {
      setBusy(false)
    }
  }
  const total = errorSummary.reduce((n, e) => n + e.count, 0)
  const api = errorSummary.filter((e) => e.context.startsWith('api')).reduce((n, e) => n + e.count, 0)
  const client = errorSummary.filter((e) => e.context.startsWith('client')).reduce((n, e) => n + e.count, 0)
  return (
    <AdminPage title={t('admin.nav.monitoring')} description={t('admin.monitor.desc')}
      actions={<span className="flex gap-2"><Button size="sm" variant="ghost" loading={busy} onClick={() => load()}><RefreshCw className="h-4 w-4" /> {t('admin.monitor.load')}</Button>{can(me.role, 'system.manage') && <Button size="sm" variant="ghost" onClick={() => setClear(true)}>{t('admin.monitor.clear')}</Button>}</span>}>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label={t('admin.monitor.total24')} value={total} tone={total > 50 ? 'text-neon-red' : undefined} />
        <Kpi label={t('admin.monitor.api')} value={api} />
        <Kpi label={t('admin.monitor.client')} value={client} />
      </div>
      <Card title={t('admin.monitor.top')} bodyClassName="">
        <Table rows={errorSummary.map((e, i) => ({ id: i, ...e }))} empty={t('admin.monitor.none')} columns={[
          { key: 'c', label: t('admin.monitor.where'), render: (e) => <span className="font-mono text-xs">{e.context}</span> },
          { key: 'k', label: t('admin.monitor.code'), render: (e) => <span className="font-mono text-xs text-slate-400">{e.code ?? '—'}</span> },
          { key: 'n', label: '×', align: 'right', mono: true, render: (e) => e.count },
          { key: 'l', label: t('admin.monitor.last'), render: (e) => <span className="text-xs">{timeAgo(e.last)}</span> },
        ]} />
      </Card>
      <Tabs value={tab} onChange={(v) => { setTab(v); if (rows) load(v) }} options={['all', 'api', 'client'].map((v) => ({ value: v, label: t(`admin.monitor.tabs.${v}`) }))} />
      <Card bodyClassName="">
        {rows == null ? (
          <p className="p-6 text-center text-sm text-slate-500">{t('admin.monitor.loadHint')}</p>
        ) : (
          <Table rows={rows} empty={t('admin.monitor.none')} onRow={setOpen} columns={[
            { key: 't', label: t('admin.cols.time'), render: (e) => <span className="text-xs">{formatDateTime(e.at)}</span> },
            { key: 'c', label: t('admin.monitor.where'), render: (e) => <span className="font-mono text-xs">{e.context}</span> },
            { key: 'm', label: t('admin.cols.message'), render: (e) => <span className="line-clamp-1 text-xs text-slate-300">{e.message}</span> },
          ]} />
        )}
      </Card>
      {open && (
        <Card title={`${open.context} · ${formatDateTime(open.at)}`} actions={<Button size="sm" variant="ghost" onClick={() => setOpen(null)}>{t('common.close')}</Button>} bodyClassName="p-4">
          <p className="text-sm text-slate-200">{open.message}</p>
          {open.userId && <Link to={`/admin/users/${open.userId}`} className="mt-1 inline-block text-xs text-neon-cyan">{t('moderation.actions.openUser')}</Link>}
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-black/30 p-3 font-mono text-[11px] text-slate-400">{open.stack}</pre>
        </Card>
      )}
      {clear && <ReasonDialog open onClose={() => setClear(false)} adminName={me.username} title={t('admin.monitor.clear')} onConfirm={(r) => adminCall('clearErrors', { reason: r }).then(() => setRows(null))}><p className="text-sm text-slate-400">{t('admin.monitor.clearHint')}</p></ReasonDialog>}
    </AdminPage>
  )
}

// ───────────────────────────── QA center ─────────────────────────────

const QA_ICON = { pass: CheckCircle2, info: Info, warn: AlertTriangle, error: XCircle }
const QA_TONE = { pass: 'text-neon-green', info: 'text-neon-cyan', warn: 'text-neon-gold', error: 'text-neon-red' }

export function QaCenter() {
  const { t } = useT()
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  if (!SERVER_MODE) return <ServerOnly title={t('admin.nav.qa')} />
  const run = async () => {
    setBusy(true)
    try {
      setRes(await adminCall('qaRun', {}))
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    } finally {
      setBusy(false)
    }
  }
  const groups = res ? [...new Set(res.checks.map((c) => c.group))] : []
  return (
    <AdminPage title={t('admin.nav.qa')} description={t('admin.qa.desc')} actions={<Button size="sm" loading={busy} onClick={run}><Play className="h-4 w-4" /> {t('admin.qa.run')}</Button>}>
      {!res ? (
        <Card><p className="p-6 text-center text-sm text-slate-500">{t('admin.qa.hint')}</p></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {['pass', 'info', 'warn', 'error'].map((k) => <Kpi key={k} label={t(`admin.qa.status.${k}`)} value={res.summary[k]} tone={QA_TONE[k]} />)}
          </div>
          <p className="text-xs text-slate-500">{t('admin.qa.ranAt', { time: formatDateTime(res.at), ms: res.ms })}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((g) => (
              <Card key={g} title={t(`admin.qa.groups.${g}`)} bodyClassName="">
                <ul className="divide-y divide-white/[0.05]">
                  {res.checks.filter((c) => c.group === g).map((c) => {
                    const Icon = QA_ICON[c.status]
                    return (
                      <li key={c.id} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                        <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', QA_TONE[c.status])} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-slate-200">{t(`admin.qa.checks.${c.id.replace(/\./g, '_')}`, { defaultValue: c.id })}</span>
                          {c.detail != null && <span className="block break-words text-xs text-slate-500">{String(c.detail)}</span>}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Economy analytics ─────────────────────────────

export function EconomyAnalytics() {
  const { t } = useT()
  const { economy } = useV3()
  if (!economy) return null
  const max = Math.max(1, ...Object.values(economy.distributionAG ?? {}))
  const BUCKETS = ['<100', '100-1K', '1K-10K', '10K-100K', '100K+']
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('admin.eco.players')} value={formatCoins(economy.players)} />
        <Kpi label={t('admin.eco.circAC')} value={formatCoins(economy.circulation.AC)} sub={`${t('admin.eco.avg')} ${formatCoins(economy.average.AC)} · ${t('admin.eco.median')} ${formatCoins(economy.median.AC)}`} />
        <Kpi label={t('admin.eco.circAG')} value={formatCoins(economy.circulation.AG)} sub={`${t('admin.eco.avg')} ${formatCoins(economy.average.AG)} · ${t('admin.eco.median')} ${formatCoins(economy.median.AG)}`} />
        <Kpi label={t('admin.eco.alerts')} value={economy.alerts.length} tone={economy.alerts.length ? 'text-neon-gold' : undefined} />
      </div>
      {economy.alerts.length > 0 && (
        <Card title={t('admin.eco.safeguards')} bodyClassName="">
          <ul className="divide-y divide-white/[0.05] text-sm">
            {economy.alerts.map((a, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                <Badge tone={a.level === 'high' ? 'red' : 'gold'}>{t(`admin.eco.alert.${a.code}`)}</Badge>
                <span className="min-w-0 flex-1 truncate text-slate-300">{a.username ? <Link to={`/admin/users/${a.userId}`} className="text-neon-cyan">@{a.username}</Link> : a.game} · <span className="num font-mono">{a.code === 'rtp' ? `${a.value}%` : `+${formatCoins(a.value)} ${a.currency}`}</span></span>
              </li>
            ))}
          </ul>
          <p className="border-t hairline px-4 py-2 text-[11px] text-slate-500">{t('admin.eco.safeguardNote')}</p>
        </Card>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('admin.eco.flows')} bodyClassName="">
          <Table rows={economy.flows7d.map((f, i) => ({ id: i, ...f }))} columns={[
            { key: 'c', label: t('admin.eco.category'), render: (f) => <span>{f.category} <span className="text-slate-500">{f.currency}</span></span> },
            { key: 'g', label: t('admin.eco.generated'), align: 'right', mono: true, render: (f) => <span className="text-neon-green">+{formatCoins(f.generated)}</span> },
            { key: 's', label: t('admin.eco.spent'), align: 'right', mono: true, render: (f) => <span className="text-neon-red">−{formatCoins(f.spent)}</span> },
          ]} />
        </Card>
        <Card title={t('admin.eco.distribution')} bodyClassName="space-y-2 p-4">
          {BUCKETS.map((b) => (
            <div key={b} className="flex items-center gap-3 text-xs">
              <span className="w-16 shrink-0 font-mono text-slate-400">{b}</span>
              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]"><span className="block h-full rounded-full bg-neon-purple" style={{ width: `${((economy.distributionAG?.[b] ?? 0) / max) * 100}%` }} /></span>
              <span className="w-10 text-right font-mono text-slate-300">{economy.distributionAG?.[b] ?? 0}</span>
            </div>
          ))}
          <p className="pt-2 text-[11px] text-slate-500">{t('admin.eco.distributionNote')}</p>
        </Card>
        <Card title={t('admin.eco.games')} bodyClassName="">
          <Table rows={economy.games7d.map((g, i) => ({ id: i, ...g }))} columns={[
            { key: 'g', label: t('admin.cols.game'), render: (g) => <span>{g.game} <span className="text-slate-500">{g.currency}</span></span> },
            { key: 'r', label: t('admin.eco.rounds'), align: 'right', mono: true, render: (g) => formatCoins(g.rounds) },
            { key: 'w', label: t('admin.eco.wagered'), align: 'right', mono: true, render: (g) => formatCoins(g.wagered) },
            { key: 'p', label: 'RTP', align: 'right', mono: true, render: (g) => (g.rtp == null ? '—' : <span className={g.rtp > 100 ? 'text-neon-red' : ''}>{g.rtp}%</span>) },
          ]} />
        </Card>
        <Card title={t('admin.eco.top')} bodyClassName="">
          <Table rows={economy.top.map((u) => ({ id: u.userId, ...u }))} columns={[
            { key: 'u', label: t('admin.cols.user'), render: (u) => <Link to={`/admin/users/${u.userId}`} className="text-neon-cyan">@{u.username}</Link> },
            { key: 'ag', label: 'AG', align: 'right', mono: true, render: (u) => formatCoins(u.ag) },
            { key: 'ac', label: 'AC', align: 'right', mono: true, render: (u) => formatCoins(u.ac) },
          ]} />
        </Card>
      </div>
    </div>
  )
}
