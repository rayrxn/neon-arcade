import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, CheckCircle2, Search, UserCheck, XCircle } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ReasonDialog from '@/components/admin/ReasonDialog'
import { AdminPage, Badge, Card, FormField, SearchInput, Table, Tabs, inputCls } from '@/components/admin/AdminKit'
import { useAdminStore } from '@/store/useAdminStore'
import { useCurrentUser } from '@/store/useAuthStore'
import { toast } from '@/store/useUiStore'
import { can } from '@/config/roles'
import { getGameName } from '@/config/games'
import { reportAction, staffList } from '@/services/admin'
import { REPORT_STATUSES } from '@/services/reports'
import { formatCoins, formatDateTime, timeAgo } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

export const REPORT_TONE = { new: 'cyan', investigating: 'purple', escalated: 'red', resolved: 'green', dismissed: 'slate' }

function ReportDetail({ report, onClose }) {
  const { t } = useT()
  const me = useCurrentUser()
  const manage = can(me.role, 'reports.manage')
  const [dialog, setDialog] = useState(null) // resolve | dismiss | escalate | reopen
  const [note, setNote] = useState('')
  const [assignee, setAssignee] = useState(report?.assignee?.id ?? '')
  if (!report) return null
  const staff = staffList('reports.manage')
  const run = (action, opts = {}) => {
    try {
      reportAction(report.id, action, opts)
      toast({ tone: 'success', title: t('admin.done') })
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    }
  }
  const open = ['new', 'investigating', 'escalated'].includes(report.status)
  const ev = report.evidence ?? {}

  return (
    <Modal open onClose={onClose} size="lg" title={`${t('moderation.report')} #${report.id}`} description={formatDateTime(report.at)}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={REPORT_TONE[report.status]}>{t(`moderation.status.${report.status}`)}</Badge>
          <Badge tone={report.priority === 'high' ? 'red' : 'slate'}>{t(`moderation.priority.${report.priority ?? 'normal'}`)}</Badge>
          <Badge>{t(`reports.types.${report.targetType}`)}</Badge>
          <Badge>{t(`reports.reasons.${report.category}`)}</Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">{t('moderation.reporter')}</dt><dd className="text-slate-200">{report.reporterId === 'system' ? t('moderation.system') : <Link className="hover:underline" to={`/admin/users/${report.reporterId}`}>@{report.reporterName}</Link>}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('moderation.reported')}</dt><dd className="text-slate-200">{report.targetUserId ? <Link className="hover:underline" to={`/admin/users/${report.targetUserId}`}>@{report.targetName}</Link> : '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('moderation.session')}</dt><dd className="font-mono text-xs text-slate-300">{report.sessionId ?? '—'}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('moderation.assignee')}</dt><dd className="text-slate-200">{report.assignee ? `@${report.assignee.name}` : '—'}</dd></div>
        </dl>
        <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.06]">
          <p className="text-xs font-semibold text-slate-500">{t('moderation.description')}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{report.description}</p>
        </div>
        {(ev.message || ev.session || ev.expected || report.flagId) && (
          <div className="rounded-xl bg-neon-gold/[0.05] p-3 ring-1 ring-inset ring-neon-gold/20">
            <p className="text-xs font-semibold text-neon-gold">{t('moderation.evidence')}</p>
            {ev.message && <p className="mt-1 text-sm text-slate-200">“{ev.message.text}” <span className="text-xs text-slate-500">· {formatDateTime(ev.message.at)}</span></p>}
            {ev.session && <p className="mt-1 text-sm text-slate-200">{getGameName(ev.session.game)} · {formatCoins(ev.session.bet)} → {formatCoins(ev.session.payout)} AC · {(ev.session.multiplier ?? 0).toFixed(2)}× · {ev.session.status ?? ''}</p>}
            {(ev.expected || ev.submitted) && <p className="mt-1 font-mono text-xs text-slate-300">expected {ev.expected ?? '—'} · submitted {ev.submitted ?? '—'}</p>}
            {report.flagId && <p className="mt-1 font-mono text-[11px] text-slate-500">flag #{report.flagId}</p>}
          </div>
        )}

        {manage && (
          <div className="space-y-3 rounded-xl border hairline p-3">
            <div className="flex flex-wrap gap-2">
              {report.status === 'new' && <Button size="sm" onClick={() => run('investigate')}><Search className="h-4 w-4" /> {t('moderation.actions.investigate')}</Button>}
              {open && <Button size="sm" variant="primary" onClick={() => setDialog('resolve')}><CheckCircle2 className="h-4 w-4" /> {t('moderation.actions.resolve')}</Button>}
              {open && <Button size="sm" variant="ghost" onClick={() => setDialog('dismiss')}><XCircle className="h-4 w-4" /> {t('moderation.actions.dismiss')}</Button>}
              {open && report.status !== 'escalated' && <Button size="sm" variant="danger" onClick={() => setDialog('escalate')}><ArrowUpRight className="h-4 w-4" /> {t('moderation.actions.escalate')}</Button>}
              {!open && <Button size="sm" variant="ghost" onClick={() => setDialog('reopen')}>{t('moderation.actions.reopen')}</Button>}
              {report.targetUserId && <Link to={`/admin/users/${report.targetUserId}`}><Button size="sm" variant="ghost"><UserCheck className="h-4 w-4" /> {t('moderation.actions.openUser')}</Button></Link>}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <FormField label={t('moderation.assign')}>
                <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={inputCls}>
                  <option value="">{t('moderation.unassigned')}</option>
                  {staff.map((u) => <option key={u.id} value={u.id}>@{u.username} · {t(`admin.roles.${u.role}`)}</option>)}
                </select>
              </FormField>
              <Button size="sm" variant="ghost" className="self-end" onClick={() => run('assign', { assigneeId: assignee || null })}>{t('moderation.actions.assign')}</Button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('moderation.notePh')} className={inputCls} />
              <Button size="sm" variant="ghost" disabled={note.trim().length < 2} onClick={() => { run('note', { note }); setNote('') }}>{t('moderation.actions.note')}</Button>
            </div>
          </div>
        )}

        {report.notes.length > 0 && (
          <div>
            <p className="label-caps mb-1.5">{t('moderation.notes')}</p>
            <ul className="space-y-1.5">
              {report.notes.map((n) => <li key={n.id} className="rounded-lg bg-neon-gold/[0.05] px-3 py-2 text-sm text-slate-200 ring-1 ring-inset ring-neon-gold/15">{n.text} <span className="text-xs text-slate-500">· @{n.by} · {timeAgo(n.at)}</span></li>)}
            </ul>
          </div>
        )}
        <div>
          <p className="label-caps mb-1.5">{t('moderation.history')}</p>
          <ul className="space-y-1 text-xs text-slate-400">
            {report.history.map((h, i) => <li key={i}>{formatDateTime(h.at)} · @{h.by} · {t(`moderation.hist.${h.action}`, { defaultValue: h.action })}{h.status ? ` → ${t(`moderation.status.${h.status}`)}` : ''}{h.to ? ` → @${h.to}` : ''}{h.reason && h.reason !== '—' ? ` · “${h.reason}”` : ''}</li>)}
          </ul>
        </div>
      </div>
      <ReasonDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        adminName={me.username}
        tone={dialog === 'resolve' || dialog === 'reopen' ? 'primary' : 'danger'}
        title={dialog ? t(`moderation.actions.${dialog}`) : ''}
        description={`#${report.id}`}
        onConfirm={(reason) => reportAction(report.id, dialog, { reason })}
      />
    </Modal>
  )
}

/** /admin/moderation — antrean report: new, investigating, escalated, resolved, dismissed. */
export function ModerationQueue() {
  const { t } = useT()
  const reports = useAdminStore((s) => s.reports)
  const [tab, setTab] = useState('new')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const counts = useMemo(() => Object.fromEntries(REPORT_STATUSES.map((s) => [s, reports.filter((r) => r.status === s).length])), [reports])
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return reports.filter((r) => r.status === tab).filter((r) => !term || [r.id, r.reporterName, r.targetName, r.description, r.sessionId].some((x) => String(x ?? '').toLowerCase().includes(term)))
  }, [reports, tab, q])
  const selected = reports.find((r) => r.id === selectedId)

  return (
    <AdminPage title={t('admin.nav.moderation')} description={t('moderation.desc')}>
      <Tabs value={tab} onChange={setTab} options={['new', 'investigating', 'escalated', 'resolved', 'dismissed'].map((s) => ({ value: s, label: t(`moderation.status.${s}`), count: counts[s] }))} />
      <SearchInput value={q} onChange={setQ} placeholder={t('moderation.search')} />
      <Card bodyClassName="">
        <Table
          rows={rows}
          empty={t('moderation.empty')}
          onRow={(r) => setSelectedId(r.id)}
          columns={[
            { key: 'at', label: t('admin.cols.time'), render: (r) => <span className="whitespace-nowrap text-xs">{timeAgo(r.at)}</span> },
            { key: 'prio', label: '', render: (r) => <span className={clsx('inline-block h-2 w-2 rounded-full', r.priority === 'high' ? 'bg-neon-red' : 'bg-slate-600')} /> },
            { key: 'reporter', label: t('moderation.reporter'), render: (r) => (r.reporterId === 'system' ? <Badge tone="gold">{t('moderation.system')}</Badge> : `@${r.reporterName}`) },
            { key: 'target', label: t('moderation.reported'), render: (r) => (r.targetName ? `@${r.targetName}` : '—') },
            { key: 'type', label: t('admin.cols.type'), render: (r) => <span className="whitespace-nowrap text-xs">{t(`reports.types.${r.targetType}`)} · {t(`reports.reasons.${r.category}`)}</span> },
            { key: 'desc', label: t('moderation.description'), render: (r) => <span className="line-clamp-1 text-xs text-slate-400">{r.description}</span> },
            { key: 'assignee', label: t('moderation.assignee'), render: (r) => (r.assignee ? `@${r.assignee.name}` : <span className="text-slate-600">—</span>) },
          ]}
        />
      </Card>
      {selected && <ReportDetail key={selected.id} report={selected} onClose={() => setSelectedId(null)} />}
    </AdminPage>
  )
}
