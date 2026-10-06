import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LifeBuoy, MessageSquarePlus, RotateCcw, Send } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { EmptyState, Panel } from '@/components/ui/Controls'
import { PageHeader, QueryView, useQuery } from '@/components/ui/PageKit'
import { useCurrentUser } from '@/store/useAuthStore'
import { useAdminStore } from '@/store/useAdminStore'
import { toast } from '@/store/useUiStore'
import { createTicket, myTickets, reopenTicket, replyTicket, TICKET_CATEGORIES } from '@/services/support'
import { formatDateTime, timeAgo } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

export const TICKET_TONE = {
  OPEN: 'bg-neon-cyan/10 text-neon-cyan',
  IN_PROGRESS: 'bg-neon-purple/10 text-neon-purple',
  WAITING_FOR_USER: 'bg-neon-gold/10 text-neon-gold',
  RESOLVED: 'bg-neon-green/10 text-neon-green',
  CLOSED: 'bg-white/[0.06] text-slate-400',
}
export function TicketStatus({ status }) {
  const { t } = useT()
  return <span className={clsx('inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider', TICKET_TONE[status])}>{t(`support.status.${status}`)}</span>
}

/** Percakapan tiket (dipakai user & staff). Catatan internal hanya untuk staff. */
export function TicketThread({ ticket, staffView = false }) {
  const { t } = useT()
  const items = [...ticket.messages.map((m) => ({ ...m, type: 'msg' })), ...(staffView ? ticket.notes.map((n) => ({ ...n, type: 'note' })) : [])].sort((a, b) => a.at - b.at)
  return (
    <ul className="space-y-3 p-4 sm:p-5">
      {items.map((m) => (
        <li key={m.id} className={clsx('rounded-2xl px-4 py-3 ring-1 ring-inset', m.type === 'note' ? 'bg-neon-gold/[0.06] ring-neon-gold/20' : m.staff ? 'bg-neon-cyan/[0.06] ring-neon-cyan/20' : 'bg-white/[0.03] ring-white/[0.06]')}>
          <p className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-white">{m.type === 'note' ? m.by : m.name}</span>
            {m.staff && <span className="rounded bg-neon-cyan/15 px-1 text-[9px] font-extrabold uppercase text-neon-cyan">{t('support.staff')}</span>}
            {m.type === 'note' && <span className="rounded bg-neon-gold/15 px-1 text-[9px] font-extrabold uppercase text-neon-gold">{t('support.internal')}</span>}
            <span className="text-slate-500">{formatDateTime(m.at)}</span>
          </p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-slate-300">{m.text}</p>
        </li>
      ))}
    </ul>
  )
}

function NewTicket({ onDone }) {
  const { t } = useT()
  const [form, setForm] = useState({ category: 'account', subject: '', message: '', sessionId: '', txId: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }))
    setError(null)
  }
  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await new Promise((r) => setTimeout(r, 300))
      const ticket = await createTicket(form)
      toast({ tone: 'success', title: t('support.created', { id: ticket.id }) })
      onDone(ticket)
    } catch (err) {
      setError(t(errorKey(err), err?.vars))
    } finally {
      setBusy(false)
    }
  }
  const input = 'input-shell h-10 w-full px-3 text-sm text-white outline-none placeholder:text-slate-600'
  return (
    <form onSubmit={submit} className="space-y-3 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <label className="text-xs font-semibold text-slate-400">
          {t('support.category')}
          <select value={form.category} onChange={set('category')} className={clsx(input, 'mt-1.5')}>
            {TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{t(`support.categories.${c}`)}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-slate-400">
          {t('support.subject')}
          <input value={form.subject} onChange={set('subject')} maxLength={80} placeholder={t('support.subjectPh')} className={clsx(input, 'mt-1.5')} />
        </label>
      </div>
      <label className="block text-xs font-semibold text-slate-400">
        {t('support.message')}
        <textarea value={form.message} onChange={set('message')} rows={5} maxLength={2000} placeholder={t('support.messagePh')} className="input-shell mt-1.5 w-full resize-none px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-slate-400">
          {t('support.sessionId')}
          <input value={form.sessionId} onChange={set('sessionId')} placeholder={t('common.optional')} className={clsx(input, 'mt-1.5 font-mono')} />
        </label>
        <label className="text-xs font-semibold text-slate-400">
          {t('support.txId')}
          <input value={form.txId} onChange={set('txId')} placeholder={t('common.optional')} className={clsx(input, 'mt-1.5 font-mono')} />
        </label>
      </div>
      {error && <p className="text-xs font-semibold text-neon-red" role="alert">{error}</p>}
      <div className="flex justify-end"><Button type="submit" loading={busy}><Send className="h-4 w-4" /> {t('support.submit')}</Button></div>
    </form>
  )
}

function Reply({ ticket }) {
  const { t } = useT()
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const send = async (e) => {
    e.preventDefault()
    try {
      await replyTicket(ticket.id, text)
      setText('')
    } catch (err) {
      setError(t(errorKey(err), err?.vars))
    }
  }
  if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED')
    return (
      <div className="flex items-center justify-between gap-3 border-t hairline px-4 py-3 sm:px-5">
        <p className="text-xs text-slate-500">{t('support.closedNote')}</p>
        <Button size="sm" variant="ghost" onClick={async () => { try { await reopenTicket(ticket.id) } catch (err) { toast({ tone: 'error', title: t(errorKey(err), err?.vars) }) } }}><RotateCcw className="h-4 w-4" /> {t('support.reopen')}</Button>
      </div>
    )
  return (
    <form onSubmit={send} className="border-t hairline p-3 sm:p-4">
      <div className="flex gap-2">
        <input value={text} onChange={(e) => { setText(e.target.value); setError(null) }} placeholder={t('support.replyPh')} className="input-shell h-11 min-w-0 flex-1 px-3.5 text-sm text-white outline-none placeholder:text-slate-600" />
        <Button type="submit" disabled={text.trim().length < 2}><Send className="h-4 w-4" /></Button>
      </div>
      {error && <p className="mt-1.5 text-xs font-semibold text-neon-red">{error}</p>}
    </form>
  )
}

export default function SupportPage() {
  const { t } = useT()
  const user = useCurrentUser()
  const { id } = useParams()
  const navigate = useNavigate()
  const tickets = useAdminStore((s) => s.tickets)
  const [creating, setCreating] = useState(false)
  const query = useQuery(() => myTickets(user.id), [tickets, user?.id])
  const ticket = useMemo(() => (id ? (query.data ?? []).find((x) => x.id === id) : null), [id, query.data])

  if (id && ticket)
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/support')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> {t('support.back')}</button>
        <Panel title={`${ticket.id} · ${ticket.subject}`} icon={LifeBuoy} action={<TicketStatus status={ticket.status} />}>
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b hairline px-4 py-2.5 text-[11px] text-slate-500 sm:px-5">
            <span>{t(`support.categories.${ticket.category}`)}</span>
            <span>{t('support.opened', { time: formatDateTime(ticket.createdAt) })}</span>
            {ticket.assignee && <span>{t('support.assignedTo', { name: ticket.assignee.name })}</span>}
            {ticket.info.sessionId && <span className="font-mono">session {ticket.info.sessionId}</span>}
            {ticket.info.txId && <span className="font-mono">tx {ticket.info.txId}</span>}
          </div>
          <TicketThread ticket={ticket} />
          <Reply ticket={ticket} />
        </Panel>
      </div>
    )

  return (
    <div className="space-y-6">
      <PageHeader title={t('support.title')} subtitle={t('support.subtitle')} actions={<Button size="sm" onClick={() => setCreating((c) => !c)}><MessageSquarePlus className="h-4 w-4" /> {t('support.new')}</Button>} />
      {creating && (
        <Panel title={t('support.new')} icon={MessageSquarePlus}>
          <NewTicket onDone={(tk) => { setCreating(false); navigate(`/support/${tk.id}`) }} />
        </Panel>
      )}
      <Panel title={t('support.mine')} icon={LifeBuoy}>
        <QueryView query={query} rows={3} empty={<EmptyState icon={LifeBuoy} title={t('support.empty')} body={t('support.emptyBody')} />}>
          {(list) => (
            <ul className="divide-y divide-white/[0.05]">
              {list.map((tk) => (
                <li key={tk.id}>
                  <button onClick={() => navigate(`/support/${tk.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] focus-ring sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">{tk.subject}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500"><span className="font-mono">{tk.id}</span> · {t(`support.categories.${tk.category}`)} · {timeAgo(tk.updatedAt)}</p>
                    </div>
                    <TicketStatus status={tk.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Panel>
    </div>
  )
}
