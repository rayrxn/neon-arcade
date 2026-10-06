import { getCurrentUser, getUserById } from '@/store/useAuthStore'
import { useAdminStore } from '@/store/useAdminStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { can } from '@/config/roles'
import { AppError } from '@/utils/errors'
import { randomHex } from '@/utils/rng'
import { emit } from './events'
import { atomic } from './tx'
import { log } from './admin'
import { SERVER_MODE } from '@/config/runtime'
import { adminCall, social } from './server'

/**
 * Support center (tabel support_tickets, ticket_messages).
 * User: buat tiket, balas, lihat status, buka lagi. Staff (support.manage): assign, balas,
 * ubah status, tutup/buka, catatan internal (tidak terlihat user).
 */
export const TICKET_CATEGORIES = ['account', 'wallet', 'game', 'bug', 'report', 'other']
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED']
const OPEN_LIMIT = 3
const CREATE_COOLDOWN = 120_000
const REOPEN_WINDOW = 7 * 86_400_000

const tickets = () => useAdminStore.getState().tickets
const save = (id, fn) => useAdminStore.setState((s) => ({ tickets: s.tickets.map((t) => (t.id === id ? fn(t) : t)) }))
const me = () => {
  const u = getCurrentUser()
  if (!u) throw new AppError('errors.sessionExpired')
  return u
}
const clean = (text, min, max) => {
  const v = String(text ?? '').replace(/[ \t]+/g, ' ').trim()
  if (v.length < min) throw new AppError('support.errors.short', { min })
  if (v.length > max) throw new AppError('support.errors.long', { max })
  return v
}
function staff(reasonless = true) {
  const u = me()
  if (!can(u.role, 'support.manage')) throw new AppError('admin.errors.forbidden')
  return u
}
const notify = (userId, data) => useNotificationStore.getState().notify(userId, 'ticket', data, { force: true })

export function createTicket({ category, subject, message, sessionId = '', txId = '' }) {
  if (SERVER_MODE) return social('ticket/create', { category, subject, message, sessionId, txId })
  const user = me()
  if (!TICKET_CATEGORIES.includes(category)) throw new AppError('support.errors.category')
  const s = clean(subject, 4, 80)
  const m = clean(message, 10, 2000)
  const mine = tickets().filter((t) => t.userId === user.id)
  if (mine.filter((t) => !['RESOLVED', 'CLOSED'].includes(t.status)).length >= OPEN_LIMIT) throw new AppError('support.errors.openLimit', { max: OPEN_LIMIT })
  if (mine.some((t) => Date.now() - t.createdAt < CREATE_COOLDOWN)) throw new AppError('support.errors.cooldown')
  return atomic('ticket.create', () => {
    const now = Date.now()
    const ticket = {
      id: `T-${randomHex(3).toUpperCase()}`,
      userId: user.id,
      username: user.username,
      category,
      subject: s,
      status: 'OPEN',
      assignee: null,
      info: { sessionId: String(sessionId).trim().slice(0, 32), txId: String(txId).trim().slice(0, 32) },
      createdAt: now,
      updatedAt: now,
      messages: [{ id: randomHex(4), by: user.id, name: user.username, staff: false, text: m, at: now }],
      notes: [],
      history: [{ at: now, by: user.username, status: 'OPEN' }],
    }
    useAdminStore.setState((st) => ({ tickets: [ticket, ...st.tickets].slice(0, 2000) }))
    emit('TICKET_CREATED', { ticketId: ticket.id, userId: user.id, category })
    return ticket
  })
}

export const myTickets = (userId) => tickets().filter((t) => t.userId === userId)

/** Balasan user (pemilik tiket) atau staff. */
export function replyTicket(ticketId, text) {
  if (SERVER_MODE) return social('ticket/reply', { ticketId, text })
  const user = me()
  const ticket = tickets().find((t) => t.id === ticketId)
  if (!ticket) throw new AppError('errors.notFound')
  const isOwner = ticket.userId === user.id
  const isStaff = can(user.role, 'support.manage')
  if (!isOwner && !isStaff) throw new AppError('admin.errors.forbidden')
  if (ticket.status === 'CLOSED') throw new AppError('support.errors.closed')
  const body = clean(text, 2, 2000)
  const now = Date.now()
  const asStaff = isStaff && !isOwner
  const status = asStaff ? (ticket.status === 'OPEN' ? 'WAITING_FOR_USER' : ticket.status === 'IN_PROGRESS' ? 'WAITING_FOR_USER' : ticket.status) : ticket.status === 'WAITING_FOR_USER' || ticket.status === 'RESOLVED' ? 'OPEN' : ticket.status
  save(ticketId, (t) => ({
    ...t,
    status,
    updatedAt: now,
    messages: [...t.messages, { id: randomHex(4), by: user.id, name: user.username, staff: asStaff, text: body, at: now }],
    history: status !== t.status ? [...t.history, { at: now, by: user.username, status }] : t.history,
  }))
  if (asStaff) {
    notify(ticket.userId, { ticketId, event: 'reply' })
    log(user, 'ticket.reply', getUserById(ticket.userId) ?? ticket.username, '—', null, { ticketId }, { entityId: ticketId })
  }
  emit('TICKET_UPDATED', { ticketId, by: user.id, status })
}

export function setTicketStatus(ticketId, status) {
  if (SERVER_MODE) return adminCall('setTicketStatus', { ticketId, status })
  const user = staff()
  if (!TICKET_STATUSES.includes(status)) throw new AppError('admin.errors.invalid')
  const ticket = tickets().find((t) => t.id === ticketId)
  if (!ticket) throw new AppError('errors.notFound')
  if (ticket.status === status) return
  const now = Date.now()
  save(ticketId, (t) => ({ ...t, status, updatedAt: now, closedAt: status === 'CLOSED' ? now : t.closedAt ?? null, history: [...t.history, { at: now, by: user.username, status }] }))
  notify(ticket.userId, { ticketId, event: 'status', status })
  log(user, 'ticket.status', getUserById(ticket.userId) ?? ticket.username, '—', ticket.status, status, { entityId: ticketId })
  emit('TICKET_UPDATED', { ticketId, by: user.id, status })
}

export function assignTicket(ticketId, adminId) {
  if (SERVER_MODE) return adminCall('assignTicket', { ticketId, adminId })
  const user = staff()
  const ticket = tickets().find((t) => t.id === ticketId)
  if (!ticket) throw new AppError('errors.notFound')
  const assignee = adminId ? getUserById(adminId) : null
  if (adminId && (!assignee || !can(assignee.role, 'support.manage'))) throw new AppError('admin.errors.invalid')
  const now = Date.now()
  save(ticketId, (t) => ({
    ...t,
    assignee: assignee ? { id: assignee.id, name: assignee.username } : null,
    status: t.status === 'OPEN' && assignee ? 'IN_PROGRESS' : t.status,
    updatedAt: now,
    history: [...t.history, { at: now, by: user.username, action: 'assign', to: assignee?.username ?? '—' }],
  }))
  log(user, 'ticket.assign', getUserById(ticket.userId) ?? ticket.username, '—', ticket.assignee?.name ?? null, assignee?.username ?? null, { entityId: ticketId })
}

export function addTicketNote(ticketId, text) {
  if (SERVER_MODE) return adminCall('addTicketNote', { ticketId, text })
  const user = staff()
  const body = clean(text, 2, 1000)
  save(ticketId, (t) => ({ ...t, notes: [...t.notes, { id: randomHex(4), by: user.username, text: body, at: Date.now() }] }))
}

/** User bisa membuka lagi tiket RESOLVED/CLOSED dalam 7 hari; staff kapan saja. */
export function reopenTicket(ticketId) {
  if (SERVER_MODE) return social('ticket/reopen', { ticketId })
  const user = me()
  const ticket = tickets().find((t) => t.id === ticketId)
  if (!ticket) throw new AppError('errors.notFound')
  const isStaff = can(user.role, 'support.manage')
  if (ticket.userId !== user.id && !isStaff) throw new AppError('admin.errors.forbidden')
  if (!['RESOLVED', 'CLOSED'].includes(ticket.status)) throw new AppError('admin.errors.invalid')
  if (!isStaff && Date.now() - ticket.updatedAt > REOPEN_WINDOW) throw new AppError('support.errors.reopenWindow')
  const now = Date.now()
  save(ticketId, (t) => ({ ...t, status: 'OPEN', updatedAt: now, history: [...t.history, { at: now, by: user.username, status: 'OPEN', action: 'reopen' }] }))
  emit('TICKET_UPDATED', { ticketId, by: user.id, status: 'OPEN' })
}
