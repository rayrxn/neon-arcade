import { getCurrentUser, getUserById, useAuthStore } from '@/store/useAuthStore'
import { FIELD, useWalletStore } from '@/store/useWalletStore'
import { emptyProgress, getProgress, useProgressStore } from '@/store/useProgressStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { useAdminStore } from '@/store/useAdminStore'
import { ROLE_RANK, ROLES, can } from '@/config/roles'
import { ITEMS, REDEEM_CODES } from '@/config/economy'
import { GAMES } from '@/config/games'
import { AppError } from '@/utils/errors'
import { SERVER_MODE } from '@/config/runtime'
import { adminCall } from './server'
import { round2 } from '@/utils/format'
import { randomHex } from '@/utils/rng'
import { play } from './sound'
import { atomic } from './tx'
import { emit } from './events'
import { ensureSeason } from './seasons'
import { SERVICES, STATUSES, overallStatus, serviceStatus } from './system'
import { OPEN_STATUSES, REPORT_STATUSES } from './reports'

/**
 * Admin "API" mode lokal. Setiap aksi:
 *   1. cek permission role admin (RBAC)   2. wajib alasan
 *   3. simpan identitas admin + waktu      4. tulis audit log (append-only)
 * UI juga meminta konfirmasi sebelum memanggil fungsi di sini.
 * Backend nanti: endpoint /admin/* dengan pengecekan yang sama di server.
 */

const notify = (userId, kind, data) => useNotificationStore.getState().notify(userId, kind, data, { force: true })

export function currentAdmin() {
  const admin = getCurrentUser()
  if (!admin) throw new AppError('errors.sessionExpired')
  return admin
}

export function requirePerm(permission) {
  const admin = currentAdmin()
  if (!can(admin.role, permission)) throw new AppError('admin.errors.forbidden')
  return admin
}

function requireReason(reason) {
  if (!reason || String(reason).trim().length < 5) throw new AppError('admin.errors.reason')
  return String(reason).trim().slice(0, 300)
}

/** Admin tidak boleh menindak dirinya sendiri atau role yang setara/lebih tinggi. */
function requireTarget(admin, userId, { allowSelf = false } = {}) {
  const target = getUserById(userId)
  if (!target) throw new AppError('admin.errors.noUser')
  if (!allowSelf && target.id === admin.id) throw new AppError('admin.errors.self')
  if (target.id !== admin.id && (ROLE_RANK[target.role] ?? 0) >= (ROLE_RANK[admin.role] ?? 0)) throw new AppError('admin.errors.rank')
  return target
}

/** Kode audit standar (ADMIN_*). Aksi lain → ADMIN_<AKSI>. */
const CODES = {
  'user.ban': 'ADMIN_BAN',
  'user.tempban': 'ADMIN_TEMP_BAN',
  'user.unban': 'ADMIN_UNBAN',
  'user.warn': 'ADMIN_WARN',
  'user.unwarn': 'ADMIN_REMOVE_WARNING',
  'user.freeze': 'ADMIN_FREEZE_ACCOUNT',
  'user.unfreeze': 'ADMIN_UNFREEZE_ACCOUNT',
  'chat.mute': 'ADMIN_MUTE',
  'chat.unmute': 'ADMIN_UNMUTE',
  'wallet.freeze': 'ADMIN_FREEZE_WALLET',
  'wallet.unfreeze': 'ADMIN_UNFREEZE_WALLET',
  'wallet.reverse': 'ADMIN_REVERSE_TRANSACTION',
  'user.role': 'ADMIN_CHANGE_ROLE',
  'report.resolve': 'ADMIN_RESOLVE_REPORT',
  'report.dismiss': 'ADMIN_DISMISS_REPORT',
  'report.escalate': 'ADMIN_ESCALATE_REPORT',
  'report.investigate': 'ADMIN_INVESTIGATE_REPORT',
  'report.assign': 'ADMIN_ASSIGN_REPORT',
  'report.note': 'ADMIN_REPORT_NOTE',
}
export const codeFor = (action, currency) =>
  action === 'wallet.add' || action === 'wallet.remove' || action === 'wallet.reset'
    ? `ADMIN_${currency ?? 'AC'}_ADJUSTMENT`
    : CODES[action] ?? `ADMIN_${action.replace(/[.\-]/g, '_').toUpperCase()}`

/** Metadata perangkat admin. IP asli hanya bisa dicatat server; mode lokal menulis "local". */
function device() {
  try {
    const ua = navigator.userAgent
    const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
    const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '—'
    return { ip: 'local', agent: `${browser} · ${os}`, screen: `${window.screen?.width ?? 0}×${window.screen?.height ?? 0}` }
  } catch {
    return { ip: 'local', agent: 'server', screen: null }
  }
}

/**
 * Tulis audit log (append-only, tidak bisa dihapus/diubah).
 * target: objek user (id+username dicatat) atau teks bebas (kode, slug, judul).
 */
export function log(admin, action, target, reason, before = null, after = null, extra = {}) {
  const isUser = target && typeof target === 'object'
  const entry = {
    id: randomHex(8),
    at: Date.now(),
    code: extra.code ?? codeFor(action, extra.currency),
    adminId: admin.id,
    adminName: admin.username,
    role: admin.role,
    action,
    target: isUser ? target.username : target,
    targetId: isUser ? target.id : extra.targetId ?? null,
    entityId: extra.entityId ?? (isUser ? target.id : null),
    reason,
    before,
    after,
    device: device(),
  }
  useAdminStore.getState().appendLog(entry)
  return entry
}

const patchUser = (userId, patch) => useAuthStore.getState().adminPatchUser(userId, patch)

/** Catat panel admin dibuka (sekali per sesi tab). */
export function logAdminLogin() {
  const admin = getCurrentUser()
  if (!admin || !can(admin.role, 'dashboard')) return
  try {
    if (sessionStorage.getItem('neon-arcade:admin-login') === admin.id) return
    sessionStorage.setItem('neon-arcade:admin-login', admin.id)
  } catch {
    /* sessionStorage tidak tersedia */
  }
  if (SERVER_MODE) {
    adminCall('logAdminLogin').catch(() => {})
    return
  }
  log(admin, 'admin.login', null, '—')
}

// ───────────────────────────── Users ─────────────────────────────

export function editUser(userId, patch, reason) {
  if (SERVER_MODE) return adminCall('editUser', { userId, patch, reason })
  const admin = requirePerm('users.edit')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId, { allowSelf: true })
  const next = {}
  if (patch.displayName != null) {
    const d = patch.displayName.trim()
    if (d.length < 2 || d.length > 24) throw new AppError('errors.displayNameLength')
    next.displayName = d
  }
  if (patch.username != null && patch.username !== target.username) {
    const u = patch.username.trim()
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(u)) throw new AppError('validation.usernameFormat')
    if (Object.values(useAuthStore.getState().users).some((x) => x.id !== userId && x.username.toLowerCase() === u.toLowerCase())) throw new AppError('errors.usernameTaken')
    next.username = u
  }
  if (patch.resetAvatar) next.avatar = { kind: 'preset', id: 'steel' }
  patchUser(userId, next)
  log(admin, 'user.edit', target, r, { displayName: target.displayName, username: target.username }, next)
}

export function setRole(userId, role, reason) {
  if (SERVER_MODE) return adminCall('setRole', { userId, role, reason })
  const admin = requirePerm('roles.manage')
  const r = requireReason(reason)
  if (!ROLES.includes(role)) throw new AppError('admin.errors.invalid')
  const target = requireTarget(admin, userId)
  patchUser(userId, { role })
  log(admin, 'user.role', target, r, target.role, role)
  emit('ROLE_CHANGED', { userId, from: target.role, to: role, adminId: admin.id })
}

/** hours = null → permanen. Moderator hanya boleh ban sementara (maks 72 jam). */
export function banUser(userId, hours, reason) {
  if (SERVER_MODE) return adminCall('banUser', { userId, hours, reason })
  const admin = requirePerm('users.ban')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId)
  if (hours == null && !can(admin.role, 'users.freeze')) throw new AppError('admin.errors.tempOnly')
  if (hours != null && (!(hours > 0) || (admin.role === 'moderator' && hours > 72))) throw new AppError('admin.errors.invalid')
  const until = hours == null ? null : Date.now() + hours * 3_600_000
  const ban = { until, reason: r, by: admin.username, at: Date.now() }
  patchUser(userId, { status: 'banned', ban })
  notify(userId, 'security', { event: until ? 'suspended' : 'banned', until })
  log(admin, hours == null ? 'user.ban' : 'user.tempban', target, r, target.status, { status: 'banned', until })
  emit('USER_BANNED', { userId, until, adminId: admin.id })
}

export function unbanUser(userId, reason) {
  if (SERVER_MODE) return adminCall('unbanUser', { userId, reason })
  const admin = requirePerm('users.ban')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId)
  patchUser(userId, { status: 'active', ban: null })
  notify(userId, 'security', { event: 'restored' })
  log(admin, 'user.unban', target, r, target.status, 'active')
  emit('USER_UNBANNED', { userId, adminId: admin.id })
}

export function freezeAccount(userId, frozen, reason) {
  if (SERVER_MODE) return adminCall('freezeAccount', { userId, frozen, reason })
  const admin = requirePerm('users.freeze')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId)
  patchUser(userId, { status: frozen ? 'frozen' : 'active' })
  notify(userId, 'security', { event: frozen ? 'frozen' : 'restored' })
  log(admin, frozen ? 'user.freeze' : 'user.unfreeze', target, r, target.status, frozen ? 'frozen' : 'active')
}

export function freezeWallet(userId, frozen, reason) {
  if (SERVER_MODE) return adminCall('freezeWallet', { userId, frozen, reason })
  const admin = requirePerm('users.freeze')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId, { allowSelf: false })
  patchUser(userId, { walletFrozen: frozen })
  notify(userId, 'security', { event: frozen ? 'walletFrozen' : 'restored' })
  log(admin, frozen ? 'wallet.freeze' : 'wallet.unfreeze', target, r, target.walletFrozen, frozen)
  emit(frozen ? 'WALLET_FROZEN' : 'WALLET_UNFROZEN', { userId, adminId: admin.id })
}

// ───────────────────────────── Currency ─────────────────────────────

/** Tambah (delta > 0) atau kurangi (delta < 0) saldo. Saldo tidak boleh negatif. */
export function adjustCurrency(userId, currency, delta, reason) {
  if (SERVER_MODE) return adminCall('adjustCurrency', { userId, currency, delta, reason })
  const admin = requirePerm('wallet.manage')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId, { allowSelf: true })
  if (!FIELD[currency] || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100_000_000) throw new AppError('admin.errors.invalid')
  const wallets = useWalletStore.getState()
  wallets.ensureWallet(userId)
  const before = wallets.wallets[userId][FIELD[currency]]
  if (before + delta < 0) throw new AppError('admin.errors.negative')
  const tx = useWalletStore.getState().post(userId, { type: 'adjust', currency, amount: delta, source: 'admin', category: 'admin', adminId: admin.id, adminName: admin.username, reason: r, reference: `admin:${admin.username}`, note: r })
  const after = round2(before + delta)
  notify(userId, delta > 0 ? 'adminCredit' : 'adminDebit', { amount: Math.abs(delta), currency })
  log(admin, delta > 0 ? 'wallet.add' : 'wallet.remove', target, r, { [currency]: before }, { [currency]: after }, { currency, entityId: tx.id })
  emit('ADMIN_ADJUSTMENT', { userId, currency, amount: delta, txId: tx.id, adminId: admin.id })
  return { before, change: delta, after }
}

export function resetCurrency(userId, which, reason) {
  if (SERVER_MODE) return adminCall('resetCurrency', { userId, which, reason })
  const admin = requirePerm('wallet.manage')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId, { allowSelf: true })
  const wallet = useWalletStore.getState().wallets[userId]
  if (!wallet) throw new AppError('admin.errors.noUser')
  const list = which === 'both' ? ['AC', 'AG'] : [which]
  const before = {}
  for (const c of list) {
    before[c] = wallet[FIELD[c]]
    if (before[c] !== 0) useWalletStore.getState().post(userId, { type: 'adjust', currency: c, amount: -before[c], source: 'admin', category: 'admin', adminId: admin.id, adminName: admin.username, reason: r, reference: `admin:${admin.username}`, note: r })
  }
  log(admin, 'wallet.reset', target, r, before, Object.fromEntries(list.map((c) => [c, 0])), { currency: list.join('+') === 'AC+AG' ? 'AC' : list[0] })
}

// ───────────────────────────── Progress ─────────────────────────────

export function resetProgress(userId, part, reason) {
  if (SERVER_MODE) return adminCall('resetProgress', { userId, part, reason })
  const admin = requirePerm('progress.reset')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId, { allowSelf: true })
  const fresh = emptyProgress()
  const before = getProgress(userId)
  useProgressStore.getState().update(userId, (p) => {
    if (part === 'progression') return { ...p, xp: 0, achievements: {}, stats: fresh.stats }
    if (part === 'quests') return { ...p, quests: fresh.quests }
    if (part === 'daily') return { ...p, daily: fresh.daily }
    if (part === 'profile') return p
    throw new AppError('admin.errors.invalid')
  })
  // Reset non-sensitif: nama tampilan, avatar, kosmetik terpasang (saldo, riwayat, login tidak disentuh).
  if (part === 'profile') patchUser(userId, { displayName: target.username, avatar: { kind: 'preset', id: 'steel' }, frame: null, equipped: {}, avatarSet: false })
  log(admin, `progress.reset.${part}`, target, r, part === 'progression' ? { xp: before.xp } : part === 'daily' ? before.daily : null, null)
}

// ───────────────────────────── Sessions & anti-cheat ─────────────────────────────

export function allSessions() {
  const users = useAuthStore.getState().users
  const byId = Object.fromEntries(Object.values(users).map((u) => [u.id, u]))
  return Object.entries(useProgressStore.getState().byUser)
    .flatMap(([userId, p]) => p.sessions.map((s) => ({ ...s, userId, username: byId[userId]?.username ?? '—' })))
    .sort((a, b) => b.at - a.at)
}

export function allFlags() {
  const users = useAuthStore.getState().users
  const byId = Object.fromEntries(Object.values(users).map((u) => [u.id, u]))
  return Object.entries(useProgressStore.getState().byUser)
    .flatMap(([userId, p]) => p.flags.map((f) => ({ ...f, userId, username: byId[userId]?.username ?? '—' })))
    .sort((a, b) => b.at - a.at)
}

export function updateFlag(userId, flagId, status, reason) {
  if (SERVER_MODE) return adminCall('updateFlag', { userId, flagId, status, reason })
  const admin = requirePerm('anticheat')
  const r = requireReason(reason)
  const target = getUserById(userId)
  let before = null
  useProgressStore.getState().update(userId, (p) => ({
    ...p,
    flags: p.flags.map((f) => {
      if (f.id !== flagId) return f
      before = f.status
      return { ...f, status, reviewedBy: admin.username, reviewedAt: Date.now(), reviewReason: r }
    }),
  }))
  log(admin, `anticheat.${status}`, target ?? userId, r, before, status, { entityId: flagId })
}

/**
 * Fairness enforcement: batalkan sesi mencurigakan. Hasil asli tetap disimpan
 * (session.invalidated berisi hasil asli, pelanggaran, aksi, admin, alasan, waktu).
 * Keuntungan bersih dari sesi itu ditarik kembali dari wallet (tidak sampai negatif).
 */
export function invalidateSession(userId, sessionId, reason, violation = 'manual') {
  if (SERVER_MODE) return adminCall('invalidateSession', { userId, sessionId, reason, violation })
  const admin = requirePerm('sessions.invalidate')
  const r = requireReason(reason)
  const target = getUserById(userId)
  const session = getProgress(userId).sessions.find((s) => s.id === sessionId)
  if (!session) throw new AppError('admin.errors.noSession')
  if (session.invalidated) throw new AppError('admin.errors.alreadyDone')
  const gain = round2(session.payout - session.bet)
  const balance = useWalletStore.getState().wallets[userId]?.balance ?? 0
  const removed = gain > 0 ? Math.min(gain, balance) : 0
  if (removed > 0)
    useWalletStore.getState().post(userId, {
      type: 'reversal', currency: 'AC', amount: -removed, source: 'admin', category: 'reversal', reversalOf: session.payoutTxId ?? null,
      sessionId, adminId: admin.id, adminName: admin.username, reason: r, reference: `fairness:${sessionId}`, note: r, idempotencyKey: `invalidate:${sessionId}`,
    })
  const record = {
    originalResult: { result: session.result, payout: session.payout, multiplier: session.multiplier },
    violation,
    action: removed > 0 ? 'rewardRemoved' : 'sessionInvalidated',
    removed,
    admin: admin.username,
    reason: r,
    at: Date.now(),
  }
  useProgressStore.getState().update(userId, (p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === sessionId ? { ...s, invalidated: record, status: 'INVALID' } : s)) }))
  notify(userId, 'security', { event: 'sessionInvalidated', game: session.game })
  log(admin, 'anticheat.invalidate', target ?? userId, r, record.originalResult, { removed }, { entityId: sessionId })
  return record
}

// ───────────────────────────── Moderation ─────────────────────────────

export function deleteMessage(messageId, reason) {
  if (SERVER_MODE) return adminCall('deleteMessage', { messageId, reason })
  const admin = requirePerm('moderation')
  const r = requireReason(reason)
  const msg = usePlatformStore.getState().chat.find((m) => m.id === messageId)
  if (!msg) throw new AppError('admin.errors.invalid')
  usePlatformStore.setState((s) => ({ chat: s.chat.map((m) => (m.id === messageId ? { ...m, deleted: { by: admin.username, at: Date.now(), reason: r } } : m)) }))
  log(admin, 'chat.delete', getUserById(msg.userId) ?? '—', r, msg.text, null, { entityId: messageId })
  emit('MESSAGE_DELETED', { messageId, adminId: admin.id })
}

/**
 * minutes > 0 → mute sementara, minutes = null → mute permanen, minutes = 0 → unmute.
 * Moderator maks 7 hari; mute permanen butuh users.freeze (admin ke atas).
 */
export function muteUser(userId, minutes, reason) {
  if (SERVER_MODE) return adminCall('muteUser', { userId, minutes, reason })
  const admin = requirePerm('moderation')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId)
  if (minutes == null && !can(admin.role, 'users.freeze')) throw new AppError('admin.errors.tempOnly')
  if (minutes != null && (minutes < 0 || (admin.role === 'moderator' && minutes > 7 * 1440))) throw new AppError('admin.errors.invalid')
  const until = minutes == null ? Infinity : minutes > 0 ? Date.now() + minutes * 60_000 : null
  const stored = until === Infinity ? 8.64e15 : until
  patchUser(userId, { mutedUntil: stored, muteReason: until ? r : null })
  notify(userId, 'security', until ? { event: 'muted', until: until === Infinity ? null : until, permanent: until === Infinity, reason: r } : { event: 'unmuted' })
  log(admin, until ? 'chat.mute' : 'chat.unmute', target, r, target.mutedUntil, until === Infinity ? 'permanent' : until)
  emit(until ? 'USER_MUTED' : 'USER_UNMUTED', { userId, until: stored, adminId: admin.id })
}

export const unmuteUser = (userId, reason) => muteUser(userId, 0, reason)

/** Warning tercatat di profil moderasi user; 3 warning aktif → saran tindakan di panel. */
export function warnUser(userId, reason) {
  if (SERVER_MODE) return adminCall('warnUser', { userId, reason })
  const admin = requirePerm('users.warn')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId)
  const warning = { id: randomHex(5), reason: r, by: admin.username, byId: admin.id, at: Date.now(), removedAt: null }
  patchUser(userId, (u) => ({ warnings: [warning, ...(u.warnings ?? [])] }))
  notify(userId, 'security', { event: 'warning', reason: r })
  log(admin, 'user.warn', target, r, (target.warnings ?? []).filter((w) => !w.removedAt).length, (target.warnings ?? []).filter((w) => !w.removedAt).length + 1, { entityId: warning.id })
  emit('USER_WARNED', { userId, warningId: warning.id, adminId: admin.id })
  return warning
}

export function removeWarning(userId, warningId, reason) {
  if (SERVER_MODE) return adminCall('removeWarning', { userId, warningId, reason })
  const admin = requirePerm('users.warn')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId)
  const w = (target.warnings ?? []).find((x) => x.id === warningId)
  if (!w || w.removedAt) throw new AppError('admin.errors.alreadyDone')
  patchUser(userId, (u) => ({ warnings: (u.warnings ?? []).map((x) => (x.id === warningId ? { ...x, removedAt: Date.now(), removedBy: admin.username, removeReason: r } : x)) }))
  notify(userId, 'security', { event: 'warningRemoved' })
  log(admin, 'user.unwarn', target, r, w.reason, null, { entityId: warningId })
}

export const activeWarnings = (user) => (user?.warnings ?? []).filter((w) => !w.removedAt)

// ───────────────────────────── Reversal ─────────────────────────────

/**
 * Reversal: buat transaksi REVERSAL baru yang menunjuk transaksi asli (reversalOf).
 * Transaksi asli tidak diubah nilainya — hanya diberi tautan `reversedBy`.
 * Idempotency key `reversal:<txId>` → satu transaksi tidak bisa di-reverse dua kali.
 */
export function reverseTransaction(userId, txId, reason) {
  if (SERVER_MODE) return adminCall('reverseTransaction', { userId, txId, reason })
  const admin = requirePerm('wallet.reverse')
  const r = requireReason(reason)
  const target = requireTarget(admin, userId, { allowSelf: true })
  const wallet = useWalletStore.getState().wallets[userId]
  const tx = wallet?.transactions.find((t) => t.id === txId)
  if (!tx) throw new AppError('admin.errors.noTx')
  if (tx.type === 'reversal') throw new AppError('admin.errors.reverseReversal')
  if (tx.reversedBy || wallet.transactions.some((t) => t.reversalOf === txId && t.type === 'reversal')) throw new AppError('admin.errors.alreadyDone')
  if (tx.status !== 'success' || !tx.amount) throw new AppError('admin.errors.invalid')
  return atomic('admin.reverse', () => {
    let rev
    try {
      rev = useWalletStore.getState().post(userId, {
        type: 'reversal', currency: tx.currency, amount: -tx.amount, source: 'admin', category: 'reversal', reversalOf: tx.id,
        sessionId: tx.sessionId ?? null, adminId: admin.id, adminName: admin.username, reason: r, note: r, reference: `reversal:${tx.id}`, idempotencyKey: `reversal:${tx.id}`,
      })
    } catch (err) {
      if (err?.code === 'errors.insufficient') throw new AppError('admin.errors.negative')
      throw err
    }
    useWalletStore.getState().updateTx(userId, tx.id, { reversedBy: rev.id })
    notify(userId, 'security', { event: 'reversal', amount: -tx.amount, currency: tx.currency })
    log(admin, 'wallet.reverse', target, r, { txId: tx.id, amount: tx.amount, currency: tx.currency }, { reversalId: rev.id, amount: rev.amount }, { entityId: tx.id })
    emit('TRANSACTION_REVERSED', { userId, txId: tx.id, reversalId: rev.id, adminId: admin.id })
    return rev
  })
}

// ───────────────────────────── Report queue ─────────────────────────────

const REPORT_ACTIONS = { investigate: 'investigating', resolve: 'resolved', dismiss: 'dismissed', escalate: 'escalated', reopen: 'investigating' }

/**
 * Aksi antrean moderasi. action: investigate | assign | resolve | dismiss | escalate | note | reopen.
 * Reporter mendapat notifikasi setiap status berubah (tanpa detail internal).
 */
export function reportAction(reportId, action, { reason = '', assigneeId = null, note = '', resolution = '' } = {}) {
  if (SERVER_MODE) return adminCall('reportAction', { reportId, action, reason, assigneeId, note, resolution })
  const admin = requirePerm('reports.manage')
  const report = useAdminStore.getState().reports.find((x) => x.id === reportId)
  if (!report) throw new AppError('errors.notFound')
  const now = Date.now()
  let patch = {}
  let histEntry = { at: now, by: admin.username, action }
  let r = '—'
  if (action === 'note') {
    const text = String(note).trim()
    if (text.length < 2) throw new AppError('admin.errors.reason')
    patch = { notes: [...report.notes, { id: randomHex(4), by: admin.username, text: text.slice(0, 1000), at: now }] }
  } else if (action === 'assign') {
    const assignee = assigneeId ? getUserById(assigneeId) : null
    if (assigneeId && (!assignee || !can(assignee.role, 'reports.manage'))) throw new AppError('admin.errors.invalid')
    patch = { assignee: assignee ? { id: assignee.id, name: assignee.username } : null }
    histEntry.to = assignee?.username ?? '—'
  } else if (REPORT_ACTIONS[action]) {
    const status = REPORT_ACTIONS[action]
    if (report.status === status) throw new AppError('admin.errors.alreadyDone')
    if ((action === 'resolve' || action === 'dismiss' || action === 'escalate') && !OPEN_STATUSES.has(report.status)) throw new AppError('admin.errors.invalid')
    if (action === 'reopen' && OPEN_STATUSES.has(report.status)) throw new AppError('admin.errors.invalid')
    if (action !== 'investigate') r = requireReason(reason || resolution)
    patch = {
      status,
      assignee: report.assignee ?? (action === 'investigate' ? { id: admin.id, name: admin.username } : null),
      ...(action === 'resolve' || action === 'dismiss' ? { resolution: r, resolvedAt: now, resolvedBy: admin.username } : {}),
    }
    histEntry = { ...histEntry, status, reason: r }
  } else throw new AppError('admin.errors.invalid')

  useAdminStore.setState((s) => ({ reports: s.reports.map((x) => (x.id === reportId ? { ...x, ...patch, history: [...x.history, histEntry] } : x)) }))
  if (patch.status && report.reporterId && report.reporterId !== 'system') useNotificationStore.getState().notify(report.reporterId, 'reportUpdate', { reportId, status: patch.status }, { force: true })
  if (patch.status === 'resolved' && report.flagId && report.targetUserId) {
    useProgressStore.getState().update(report.targetUserId, (p) => ({ ...p, flags: p.flags.map((f) => (f.id === report.flagId ? { ...f, status: 'confirmed', reviewedBy: admin.username, reviewedAt: now } : f)) }))
  }
  if (patch.status === 'dismissed' && report.flagId && report.targetUserId) {
    useProgressStore.getState().update(report.targetUserId, (p) => ({ ...p, flags: p.flags.map((f) => (f.id === report.flagId ? { ...f, status: 'dismissed', reviewedBy: admin.username, reviewedAt: now } : f)) }))
  }
  const target = report.targetUserId ? getUserById(report.targetUserId) : null
  log(admin, `report.${action}`, target ?? report.id, action === 'note' ? note.slice(0, 120) : r, report.status, patch.status ?? patch.assignee?.name ?? null, { entityId: reportId })
  if (patch.status === 'resolved') emit('REPORT_RESOLVED', { reportId, adminId: admin.id })
  else emit('REPORT_UPDATED', { reportId, action, adminId: admin.id })
}

export function staffList(permission) {
  return Object.values(useAuthStore.getState().users).filter((u) => !u.isDemo && can(u.role, permission))
}

// ───────────────────────────── System ─────────────────────────────

export function setMaintenance({ enabled, message, until }, reason) {
  if (SERVER_MODE) return adminCall('setMaintenance', { enabled, message, until, reason })
  const admin = requirePerm('system.manage')
  const r = requireReason(reason)
  const before = useAdminStore.getState().system.maintenance
  const next = { enabled: !!enabled, message: String(message ?? '').trim().slice(0, 300), until: until || null }
  useAdminStore.setState((s) => ({ system: { ...s.system, maintenance: next } }))
  log(admin, enabled ? 'system.maintenance.on' : 'system.maintenance.off', 'maintenance', r, before, next)
  emit(enabled ? 'MAINTENANCE_STARTED' : 'MAINTENANCE_ENDED', { adminId: admin.id, until: next.until })
}

/** status = null → kembali ke pemeriksaan otomatis. note tampil di halaman /status. */
export function setServiceStatus(service, status, reason, note = '') {
  if (SERVER_MODE) return adminCall('setServiceStatus', { service, status, reason, note })
  const admin = requirePerm('system.manage')
  const r = requireReason(reason)
  if (!SERVICES.includes(service) || (status && !STATUSES.includes(status))) throw new AppError('admin.errors.invalid')
  const before = useAdminStore.getState().system.services[service]?.status ?? 'auto'
  useAdminStore.setState((s) => {
    const services = { ...s.system.services }
    if (status) services[service] = { status, note: String(note ?? '').trim().slice(0, 200) || null, by: admin.username, at: Date.now() }
    else delete services[service]
    return { system: { ...s.system, services } }
  })
  log(admin, 'system.service', service, r, before, status ?? 'auto')
}

export function setAutoFreeze(on, reason) {
  if (SERVER_MODE) return adminCall('setAutoFreeze', { on, reason })
  const admin = requirePerm('system.manage')
  const r = requireReason(reason)
  useAdminStore.setState((s) => ({ system: { ...s.system, autoFreezeCritical: !!on } }))
  log(admin, 'system.autofreeze', 'anticheat', r, !on, !!on)
}

export function setSlowMode(seconds, reason) {
  if (SERVER_MODE) return adminCall('setSlowMode', { seconds, reason })
  const admin = requirePerm('moderation')
  const r = requireReason(reason)
  const v = Math.max(0, Math.min(300, Math.round(Number(seconds) || 0)))
  const before = usePlatformStore.getState().chatSettings?.slowMode ?? 0
  usePlatformStore.setState((s) => ({ chatSettings: { ...(s.chatSettings ?? {}), slowMode: v } }))
  log(admin, 'chat.slowmode', 'global-chat', r, before, v)
}

/** Akhiri season sekarang: hasil dibekukan, leaderboard diarsipkan, season baru dimulai. */
export function endSeasonNow(reason) {
  if (SERVER_MODE) return adminCall('endSeasonNow', { reason })
  const admin = requirePerm('system.manage')
  const r = requireReason(reason)
  const now = Date.now()
  const season = ensureSeason(now)
  usePlatformStore.setState({ season: { ...season, endAt: now } })
  const next = ensureSeason(now)
  log(admin, 'season.end', `season-${season.id}`, r, season.id, next.id)
  return next
}

// ───────────────────────────── Redeem codes ─────────────────────────────

/** Semua kode: bawaan config + buatan admin (admin bisa menimpa status aktif). */
export function allCodes() {
  const custom = useAdminStore.getState().codes
  const usage = usePlatformStore.getState().codeUsage
  const builtIn = Object.entries(REDEEM_CODES).map(([code, def]) => ({ code, builtIn: true, active: true, perUser: 1, maxUses: def.globalLimit ?? null, ...def, ...(custom[code] ?? {}) }))
  const extra = Object.entries(custom).filter(([code]) => !REDEEM_CODES[code]).map(([code, def]) => ({ code, ...def }))
  return [...extra, ...builtIn].map((c) => ({ ...c, used: usage[c.code] ?? 0 }))
}

export function createCode({ code, kind, amount, itemId, maxUses, perUser, expiresAt, active }, reason) {
  if (SERVER_MODE) return adminCall('createCode', { code, kind, amount, itemId, maxUses, perUser, expiresAt, active, reason })
  const admin = requirePerm('codes.manage')
  const r = requireReason(reason)
  const key = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!/^[A-Z0-9]{4,16}$/.test(key)) throw new AppError('redeem.errors.format')
  if (REDEEM_CODES[key] || useAdminStore.getState().codes[key]) throw new AppError('admin.errors.codeExists')
  let reward
  if (kind === 'item') {
    if (!ITEMS[itemId]) throw new AppError('admin.errors.invalid')
    reward = { kind: 'item', id: itemId }
  } else {
    if (!['AC', 'AG'].includes(kind) || !Number.isInteger(amount) || amount < 1) throw new AppError('admin.errors.invalid')
    if (kind === 'AG' && amount > 10) throw new AppError('admin.errors.agLimit')
    reward = { kind, amount }
  }
  const def = {
    rewards: [reward],
    globalLimit: maxUses > 0 ? maxUses : null,
    maxUses: maxUses > 0 ? maxUses : null,
    perUser: Math.max(1, Math.min(10, perUser || 1)),
    expiresAt: expiresAt || null,
    active: !!active,
    createdAt: Date.now(),
    createdBy: admin.username,
  }
  useAdminStore.getState().upsertCode(key, def)
  log(admin, 'code.create', key, r, null, { reward, maxUses: def.maxUses, perUser: def.perUser, expiresAt: def.expiresAt })
}

export function setCodeActive(code, active, reason) {
  if (SERVER_MODE) return adminCall('setCodeActive', { code, active, reason })
  const admin = requirePerm('codes.manage')
  const r = requireReason(reason)
  const existing = useAdminStore.getState().codes[code] ?? {}
  useAdminStore.getState().upsertCode(code, { ...existing, active })
  log(admin, active ? 'code.enable' : 'code.disable', code, r, !active, active)
}

// ───────────────────────────── Announcements ─────────────────────────────

export function saveAnnouncement(data, reason) {
  if (SERVER_MODE) return adminCall('saveAnnouncement', { data, reason })
  const admin = requirePerm('announcements.manage')
  const r = requireReason(reason)
  const title = String(data.title ?? '').trim()
  const message = String(data.message ?? '').trim()
  if (title.length < 3 || message.length < 3) throw new AppError('admin.errors.announcement')
  const isNew = !data.id
  const a = {
    id: data.id ?? randomHex(6),
    title: title.slice(0, 80),
    message: message.slice(0, 400),
    type: ['info', 'event', 'update', 'maintenance'].includes(data.type) ? data.type : 'info',
    startAt: data.startAt || Date.now(),
    endAt: data.endAt || null,
    active: !!data.active,
    createdAt: data.createdAt ?? Date.now(),
    createdBy: data.createdBy ?? admin.username,
  }
  useAdminStore.getState().upsertAnnouncement(a)
  if (isNew && a.active) {
    for (const u of Object.values(useAuthStore.getState().users)) if (!u.isDemo) useNotificationStore.getState().notify(u.id, 'announcement', { title: a.title, message: a.message })
  }
  log(admin, isNew ? 'announcement.create' : 'announcement.update', a.title, r, null, { active: a.active, type: a.type })
  return a
}

// ───────────────────────────── Games ─────────────────────────────

export function setGameStatus(slug, status, reason) {
  if (SERVER_MODE) return adminCall('setGameStatus', { slug, status, reason })
  const admin = requirePerm('games.manage')
  const r = requireReason(reason)
  if (!GAMES.some((g) => g.slug === slug) || !['live', 'maintenance', 'disabled'].includes(status)) throw new AppError('admin.errors.invalid')
  const before = useAdminStore.getState().gameConfig[slug]?.status ?? 'live'
  useAdminStore.getState().setGameConfig(slug, { status })
  log(admin, 'game.status', slug, r, before, status)
}

export function setGameMaxBet(slug, maxBet, reason) {
  if (SERVER_MODE) return adminCall('setGameMaxBet', { slug, maxBet, reason })
  const admin = requirePerm('games.manage')
  const r = requireReason(reason)
  if (!Number.isInteger(maxBet) || maxBet < 10 || maxBet > 100_000_000) throw new AppError('admin.errors.invalid')
  const before = useAdminStore.getState().gameConfig[slug]?.maxBet ?? 20_000_000
  useAdminStore.getState().setGameConfig(slug, { maxBet })
  log(admin, 'game.maxBet', slug, r, before, maxBet)
}

// ───────────────────────────── Test mode ─────────────────────────────

export function setTestAccount(userId, isTest, reason) {
  if (SERVER_MODE) return adminCall('setTestAccount', { userId, isTest, reason })
  const admin = requirePerm('testmode')
  const r = requireReason(reason)
  const target = getUserById(userId)
  if (!target || target.isDemo) throw new AppError('admin.errors.noUser')
  if (target.id !== admin.id && (ROLE_RANK[target.role] ?? 0) >= (ROLE_RANK[admin.role] ?? 0)) throw new AppError('admin.errors.rank')
  patchUser(userId, { isTest, testControl: 'off' })
  log(admin, isTest ? 'test.enable' : 'test.disable', target, r, !isTest, isTest)
}

export function setTestControl(userId, mode, reason) {
  if (SERVER_MODE) return adminCall('setTestControl', { userId, mode, reason })
  const admin = requirePerm('testmode')
  const r = requireReason(reason)
  const target = getUserById(userId)
  if (!target?.isTest) throw new AppError('admin.errors.notTest')
  if (!['off', 'win', 'loss'].includes(mode)) throw new AppError('admin.errors.invalid')
  patchUser(userId, { testControl: mode })
  log(admin, 'test.control', target, r, target.testControl, mode)
}

/** Simulasi untuk akun test — hanya sesi/notifikasi bertanda TEST, tanpa saldo & statistik asli. */
export function simulate(userId, kind, reason) {
  if (SERVER_MODE) return adminCall('simulate', { userId, kind, reason })
  const admin = requirePerm('testmode')
  const r = requireReason(reason)
  const target = getUserById(userId)
  if (!target?.isTest) throw new AppError('admin.errors.notTest')
  const n = useNotificationStore.getState().notify
  const testSession = (win) => ({
    id: randomHex(8), game: 'dice', bet: 100, payout: win ? 198 : 0, multiplier: win ? 1.98 : 0,
    result: win ? 'win' : 'loss', at: Date.now(), isTest: true, nonce: 0, detail: { simulated: true },
  })
  if (kind === 'wins10' || kind === 'losses10') {
    useProgressStore.getState().update(userId, (p) => ({ ...p, sessions: [...Array.from({ length: 10 }, () => testSession(kind === 'wins10')), ...p.sessions].slice(0, 100) }))
  } else if (kind === 'jackpot') n(userId, 'jackpot', { username: target.username, amount: 25_000, game: 'jackpot', test: true }, { force: true })
  else if (kind === 'reward') n(userId, 'adminCredit', { amount: 500, currency: 'AC', test: true }, { force: true })
  else if (kind === 'levelUp') n(userId, 'levelUp', { level: 99, test: true }, { force: true })
  else if (kind === 'quest') n(userId, 'quest', { scope: 'daily', quest: 'play3', test: true }, { force: true })
  else if (kind === 'daily') n(userId, 'daily', { day: 7, rewards: [{ kind: 'AC', amount: 1500 }], test: true }, { force: true })
  else throw new AppError('admin.errors.invalid')
  play('success')
  log(admin, `test.simulate.${kind}`, target, r, null, { isTest: true })
}

// ───────────────────────────── Analytics ─────────────────────────────

const DAY = 86_400_000
const DISTRIBUTED = new Set(['reward', 'grant', 'bonus', 'redeem', 'adjust'])

/** XP yang dihasilkan & AC/AG yang dibagikan platform (hadiah, grant, redeem, kredit admin). */
function distribution(users, wallets, progress) {
  const out = { xpGenerated: 0, acDistributed: 0, agDistributed: 0 }
  for (const u of users) {
    if (u.isTest) continue
    out.xpGenerated += progress[u.id]?.xp ?? 0
    for (const tx of wallets[u.id]?.transactions ?? []) {
      if (!DISTRIBUTED.has(tx.type) || !(tx.amount > 0) || tx.status !== 'success') continue
      if (tx.currency === 'AG') out.agDistributed += tx.amount
      else out.acDistributed += tx.amount
    }
  }
  return out
}

export function analytics(now = Date.now()) {
  const users = Object.values(useAuthStore.getState().users).filter((u) => !u.isDemo)
  const progress = useProgressStore.getState().byUser
  const wallets = useWalletStore.getState().wallets
  const presence = usePlatformStore.getState().presence
  const sessions = allSessions().filter((s) => !s.isTest)
  const perGame = {}
  for (const p of Object.values(progress)) for (const [slug, g] of Object.entries(p.stats.perGame)) perGame[slug] = (perGame[slug] ?? 0) + g.played
  const mostPlayed = Object.entries(perGame).sort((a, b) => b[1] - a[1])[0]
  const flags = allFlags()
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = new Date(now - (6 - i) * DAY)
    start.setHours(0, 0, 0, 0)
    const end = start.getTime() + DAY
    return { label: start.toLocaleDateString(undefined, { weekday: 'short' }), games: sessions.filter((s) => s.at >= start.getTime() && s.at < end).length }
  })
  return {
    totalUsers: users.length,
    activeUsers: users.filter((u) => now - Math.max(u.lastLoginAt ?? 0, presence[u.id] ?? 0) < DAY).length,
    newUsers: users.filter((u) => now - u.createdAt < 7 * DAY).length,
    gamesPlayed: Object.values(progress).reduce((s, p) => s + p.stats.games, 0),
    mostPlayed: mostPlayed ? { slug: mostPlayed[0], count: mostPlayed[1] } : null,
    perGame,
    questsCompleted: Object.values(progress).reduce((s, p) => s + p.quests.completed, 0),
    dailyClaims: Object.values(progress).reduce((s, p) => s + p.daily.claims, 0),
    acCirculation: users.reduce((s, u) => s + (wallets[u.id]?.balance ?? 0), 0),
    agCirculation: users.reduce((s, u) => s + (wallets[u.id]?.gems ?? 0), 0),
    flaggedAccounts: new Set(flags.filter((f) => f.status === 'open' || f.status === 'reviewing').map((f) => f.userId)).size,
    activeBans: users.filter((u) => u.status === 'banned' && (u.ban?.until == null || u.ban.until > now)).length,
    suspiciousSessions: flags.filter((f) => f.sessionId).length,
    ...distribution(users, wallets, progress),
    pendingReports: useAdminStore.getState().reports.filter((r) => OPEN_STATUSES.has(r.status)).length,
    openTickets: useAdminStore.getState().tickets.filter((x) => !['RESOLVED', 'CLOSED'].includes(x.status)).length,
    systemStatus: overallStatus(serviceStatus()),
    openFlags: flags.filter((f) => f.status === 'open').length,
    days,
  }
}

/** Reset saat rilis update (Owner). scope: 'testers' | 'global'. Hanya di mode server. */
export async function releaseReset(scope, confirm, reason) {
  if (!['testers', 'global'].includes(scope)) throw new AppError('admin.errors.invalid')
  if (confirm !== (scope === 'global' ? 'RESET GLOBAL' : 'RESET TESTER')) throw new AppError('admin.errors.confirmPhrase')
  if (!SERVER_MODE) throw new AppError('admin.errors.serverOnly')
  return adminCall('releaseReset', { scope, confirm, reason })
}
