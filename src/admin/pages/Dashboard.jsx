import { Link } from 'react-router-dom'
import { AdminPage, Badge, BarChart, Card, Kpi, RISK_TONE } from '@/components/admin/AdminKit'
import { useAuthStore } from '@/store/useAuthStore'
import { useProgressStore } from '@/store/useProgressStore'
import { useWalletStore } from '@/store/useWalletStore'
import { useAdminStore } from '@/store/useAdminStore'
import { allFlags, analytics } from '@/services/admin'
import { getGameName } from '@/config/games'
import { formatCoins, timeAgo } from '@/utils/format'
import { useT } from '@/i18n'

/** Re-render saat data apa pun yang dipakai analytics berubah. */
export function useAnalytics() {
  useAuthStore((s) => s.users)
  useProgressStore((s) => s.byUser)
  useWalletStore((s) => s.wallets)
  useAdminStore((s) => s.reports)
  useAdminStore((s) => s.tickets)
  useAdminStore((s) => s.system)
  return analytics()
}

export default function Dashboard({ full = false }) {
  const { t } = useT()
  const a = useAnalytics()
  const logs = useAdminStore((s) => s.logs).slice(0, 6)
  const flags = allFlags().filter((f) => f.status === 'open').slice(0, 5)
  const perGame = Object.entries(a.perGame).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([slug, value]) => ({ label: getGameName(slug).split(' ')[0], value }))

  const kpis = [
    [t('admin.kpi.totalUsers'), formatCoins(a.totalUsers)],
    [t('admin.kpi.activeUsers'), formatCoins(a.activeUsers), t('admin.kpi.last24h')],
    [t('admin.kpi.newUsers'), formatCoins(a.newUsers), t('admin.kpi.last7d')],
    [t('admin.kpi.gamesPlayed'), formatCoins(a.gamesPlayed)],
    [t('admin.kpi.mostPlayed'), a.mostPlayed ? getGameName(a.mostPlayed.slug) : '—', a.mostPlayed ? t('admin.kpi.rounds', { count: a.mostPlayed.count }) : null],
    [t('admin.kpi.quests'), formatCoins(a.questsCompleted)],
    [t('admin.kpi.dailyClaims'), formatCoins(a.dailyClaims)],
    [t('admin.kpi.acCirculation'), formatCoins(a.acCirculation)],
    [t('admin.kpi.agCirculation'), formatCoins(a.agCirculation)],
    [t('admin.kpi.flagged'), formatCoins(a.flaggedAccounts), null, a.flaggedAccounts ? 'text-neon-gold' : null],
    [t('admin.kpi.bans'), formatCoins(a.activeBans), null, a.activeBans ? 'text-neon-red' : null],
    [t('admin.kpi.suspicious'), formatCoins(a.suspiciousSessions)],
    [t('admin.kpi.xpGenerated'), formatCoins(a.xpGenerated)],
    [t('admin.kpi.acDistributed'), formatCoins(a.acDistributed)],
    [t('admin.kpi.agDistributed'), formatCoins(a.agDistributed)],
    [t('admin.kpi.pendingReports'), formatCoins(a.pendingReports), null, a.pendingReports ? 'text-neon-gold' : null, '/admin/moderation'],
    [t('admin.kpi.openTickets'), formatCoins(a.openTickets), null, a.openTickets ? 'text-neon-cyan' : null, '/admin/support'],
    [t('admin.kpi.system'), t(`status.states.${a.systemStatus}`), null, a.systemStatus === 'OPERATIONAL' ? 'text-neon-green' : 'text-neon-gold', '/admin/system'],
  ]

  return (
    <AdminPage title={full ? t('admin.nav.analytics') : t('admin.nav.dashboard')} description={t('admin.dashboardDesc')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        {kpis.map(([label, value, sub, tone, to]) => (to ? <Link key={label} to={to} className="block rounded-xl focus-ring"><Kpi label={label} value={value} sub={sub} tone={tone} /></Link> : <Kpi key={label} label={label} value={value} sub={sub} tone={tone} />))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('admin.charts.gamesPerDay')}>
          <BarChart data={a.days.map((d) => ({ label: d.label, value: d.games }))} />
        </Card>
        <Card title={t('admin.charts.perGame')}>
          {perGame.length ? <BarChart data={perGame} tone="fill-neon-purple" /> : <p className="py-10 text-center text-sm text-slate-500">{t('admin.empty')}</p>}
        </Card>
      </div>

      {!full && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('admin.openFlags')} actions={<Link to="/admin/anticheat" className="text-xs font-semibold text-slate-400 hover:text-white">{t('common.viewAll')}</Link>} bodyClassName="divide-y divide-white/[0.05]">
            {flags.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t('admin.noFlags')}</p>}
            {flags.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <Badge tone={RISK_TONE[f.risk]}>{t(`admin.risk.${f.risk}`)}</Badge>
                <span className="min-w-0 flex-1 truncate text-slate-300">{t(`admin.flags.${f.type}`)} · @{f.username}</span>
                <span className="text-xs text-slate-500">{timeAgo(f.at)}</span>
              </div>
            ))}
          </Card>
          <Card title={t('admin.recentLogs')} actions={<Link to="/admin/logs" className="text-xs font-semibold text-slate-400 hover:text-white">{t('common.viewAll')}</Link>} bodyClassName="divide-y divide-white/[0.05]">
            {logs.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{t('admin.empty')}</p>}
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="num font-mono text-xs text-slate-500">{timeAgo(l.at)}</span>
                <span className="min-w-0 flex-1 truncate text-slate-300"><b className="text-white">@{l.adminName}</b> {t(`admin.actions.${l.action}`, { defaultValue: l.action })} {l.target ? `· ${l.target}` : ''}</span>
              </div>
            ))}
          </Card>
        </div>
      )}
    </AdminPage>
  )
}
