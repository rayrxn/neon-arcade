import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Send } from 'lucide-react'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { AdminPage, Badge, Card, FormField, SearchInput, Table, Tabs, inputCls } from '@/components/admin/AdminKit'
import { TicketStatus, TicketThread } from '@/pages/SupportPage'
import { useAdminStore } from '@/store/useAdminStore'
import { toast } from '@/store/useUiStore'
import { staffList } from '@/services/admin'
import { addTicketNote, assignTicket, reopenTicket, replyTicket, setTicketStatus, TICKET_STATUSES } from '@/services/support'
import { formatDateTime, timeAgo } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

function TicketAdmin({ ticket, onClose }) {
  const { t } = useT()
  const [reply, setReply] = useState('')
  const [note, setNote] = useState('')
  const staff = staffList('support.manage')
  const run = async (fn) => {
    try {
      await fn()
      toast({ tone: 'success', title: t('admin.done') })
      return true
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
      return false
    }
  }
  return (
    <Modal open onClose={onClose} size="lg" title={`${ticket.id} · ${ticket.subject}`} description={`@${ticket.username} · ${t(`support.categories.${ticket.category}`)} · ${formatDateTime(ticket.createdAt)}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <TicketStatus status={ticket.status} />
          <Link to={`/admin/users/${ticket.userId}`} className="text-xs font-semibold text-neon-cyan hover:underline">{t('moderation.actions.openUser')}</Link>
          {ticket.info.sessionId && <span className="font-mono text-[11px] text-slate-500">session {ticket.info.sessionId}</span>}
          {ticket.info.txId && <span className="font-mono text-[11px] text-slate-500">tx {ticket.info.txId}</span>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <FormField label={t('support.statusLabel')}>
            <select value={ticket.status} onChange={(e) => run(() => setTicketStatus(ticket.id, e.target.value))} className={inputCls}>
              {TICKET_STATUSES.map((s) => <option key={s} value={s}>{t(`support.status.${s}`)}</option>)}
            </select>
          </FormField>
          <FormField label={t('moderation.assign')}>
            <select value={ticket.assignee?.id ?? ''} onChange={(e) => run(() => assignTicket(ticket.id, e.target.value || null))} className={inputCls}>
              <option value="">{t('moderation.unassigned')}</option>
              {staff.map((u) => <option key={u.id} value={u.id}>@{u.username}</option>)}
            </select>
          </FormField>
        </div>
        <div className="max-h-[40dvh] overflow-y-auto rounded-xl border hairline"><TicketThread ticket={ticket} staffView /></div>
        {ticket.status === 'CLOSED' || ticket.status === 'RESOLVED' ? (
          <Button size="sm" variant="ghost" onClick={() => run(() => reopenTicket(ticket.id))}>{t('support.reopen')}</Button>
        ) : (
          <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => replyTicket(ticket.id, reply))) setReply('') }} className="flex gap-2">
            <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={t('support.staffReplyPh')} className={inputCls} />
            <Button type="submit" size="sm" disabled={reply.trim().length < 2}><Send className="h-4 w-4" /></Button>
          </form>
        )}
        <form onSubmit={async (e) => { e.preventDefault(); if (await run(() => addTicketNote(ticket.id, note))) setNote('') }} className="flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('support.notePh')} className={inputCls} />
          <Button type="submit" size="sm" variant="ghost" disabled={note.trim().length < 2}>{t('moderation.actions.note')}</Button>
        </form>
        <div className="flex flex-wrap gap-2 border-t hairline pt-3">
          {ticket.status !== 'RESOLVED' && <Button size="sm" onClick={() => run(() => setTicketStatus(ticket.id, 'RESOLVED'))}>{t('support.markResolved')}</Button>}
          {ticket.status !== 'CLOSED' && <Button size="sm" variant="danger" onClick={() => run(() => setTicketStatus(ticket.id, 'CLOSED'))}>{t('support.close')}</Button>}
        </div>
      </div>
    </Modal>
  )
}

export function SupportAdmin() {
  const { t } = useT()
  const tickets = useAdminStore((s) => s.tickets)
  const [tab, setTab] = useState('OPEN')
  const [q, setQ] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    // Priority support: VVIP first, then VIP, then everyone else (newest first inside each group).
    const rank = (x) => (x.memberTier === 'vvip' ? 2 : x.memberTier === 'vip' ? 1 : 0)
    return tickets
      .filter((x) => x.status === tab)
      .filter((x) => !term || [x.id, x.username, x.subject].some((v) => v.toLowerCase().includes(term)))
      .sort((a, b) => rank(b) - rank(a) || b.updatedAt - a.updatedAt)
  }, [tickets, tab, q])
  const selected = tickets.find((x) => x.id === selectedId)
  return (
    <AdminPage title={t('admin.nav.support')} description={t('support.adminDesc')}>
      <Tabs value={tab} onChange={setTab} options={TICKET_STATUSES.map((s) => ({ value: s, label: t(`support.status.${s}`), count: tickets.filter((x) => x.status === s).length }))} />
      <SearchInput value={q} onChange={setQ} placeholder={t('support.search')} />
      <Card bodyClassName="">
        <Table
          rows={rows}
          empty={t('support.adminEmpty')}
          onRow={(x) => setSelectedId(x.id)}
          columns={[
            { key: 'id', label: 'ID', render: (x) => <span className="font-mono text-xs">{x.id}</span> },
            { key: 'user', label: t('admin.cols.user'), render: (x) => <span className="flex items-center gap-1.5">@{x.username} {x.memberTier && <Badge tone={x.memberTier === 'vvip' ? 'cyan' : 'purple'}>{x.memberTier.toUpperCase()}</Badge>}</span> },
            { key: 'subject', label: t('support.subject'), render: (x) => <span className="line-clamp-1">{x.subject}</span> },
            { key: 'cat', label: t('support.category'), render: (x) => t(`support.categories.${x.category}`) },
            { key: 'assignee', label: t('moderation.assignee'), render: (x) => (x.assignee ? `@${x.assignee.name}` : '—') },
            { key: 'upd', label: t('support.updated'), render: (x) => <span className="text-xs text-slate-500">{timeAgo(x.updatedAt)}</span> },
          ]}
        />
      </Card>
      {selected && <TicketAdmin key={selected.id} ticket={selected} onClose={() => setSelectedId(null)} />}
    </AdminPage>
  )
}
