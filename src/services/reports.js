import { getCurrentUser, getUserById } from '@/store/useAuthStore'
import { useAdminStore } from '@/store/useAdminStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { getProgress } from '@/store/useProgressStore'
import { AppError } from '@/utils/errors'
import { randomHex } from '@/utils/rng'
import { emit } from './events'
import { atomic } from './tx'
import { SERVER_MODE } from '@/config/runtime'
import { social } from './server'

/**
 * Report dari user (tabel reports). Masuk ke antrean /admin/moderation dengan status `new`.
 * Proteksi: cooldown 60 detik, maks 5 report / jam, report ganda ke target yang sama
 * (masih terbuka, 24 jam terakhir) ditolak.
 */
export const REPORT_TYPES = ['player', 'message', 'profile', 'game', 'technical', 'other']
export const REPORT_REASONS = ['cheating', 'harassment', 'spam', 'offensive', 'scam', 'bug', 'other']
export const REPORT_STATUSES = ['new', 'investigating', 'escalated', 'resolved', 'dismissed']
export const OPEN_STATUSES = new Set(['new', 'investigating', 'escalated'])

const COOLDOWN = 60_000
const HOURLY_MAX = 5
const DUP_WINDOW = 86_400_000

const reports = () => useAdminStore.getState().reports

export function createReport({ targetType, targetUserId = null, messageId = null, sessionId = null, reason, description }) {
  const me = getCurrentUser()
  if (!me) throw new AppError('errors.sessionExpired')
  if (SERVER_MODE) {
    if (messageId) usePlatformStore.getState().hideMessage(me.id, messageId)
    return social('report', { targetType, targetUserId, messageId, sessionId, reason, description })
  }
  if (!REPORT_TYPES.includes(targetType) || !REPORT_REASONS.includes(reason)) throw new AppError('reports.errors.invalid')
  const text = String(description ?? '').replace(/\s+/g, ' ').trim()
  if (text.length < 10) throw new AppError('reports.errors.short')
  if (text.length > 1000) throw new AppError('reports.errors.long')
  const needsUser = ['player', 'message', 'profile', 'game'].includes(targetType)
  const target = targetUserId ? getUserById(targetUserId) : null
  if (needsUser && !target) throw new AppError('reports.errors.noTarget')
  if (target?.id === me.id) throw new AppError('reports.errors.self')

  const now = Date.now()
  const mine = reports().filter((r) => r.reporterId === me.id)
  if (mine.some((r) => now - r.at < COOLDOWN)) throw new AppError('reports.errors.cooldown')
  if (mine.filter((r) => now - r.at < 3_600_000).length >= HOURLY_MAX) throw new AppError('reports.errors.rate')
  const dup = mine.find(
    (r) => OPEN_STATUSES.has(r.status) && now - r.at < DUP_WINDOW && r.targetType === targetType &&
      (r.targetUserId ?? null) === (target?.id ?? null) && (r.messageId ?? null) === (messageId ?? null) && (r.sessionId ?? null) === (sessionId ?? null),
  )
  if (dup) throw new AppError('reports.errors.duplicate')

  // Bukti disalin saat report dibuat (pesan bisa dihapus / sesi bisa tergeser).
  const evidence = {}
  if (messageId) {
    const msg = usePlatformStore.getState().chat.find((m) => m.id === messageId)
    if (!msg) throw new AppError('reports.errors.noTarget')
    evidence.message = { id: msg.id, text: msg.text, at: msg.at, userId: msg.userId }
  }
  if (sessionId) {
    const s = getProgress((target ?? me).id).sessions.find((x) => x.id === sessionId)
    if (s) evidence.session = { id: s.id, game: s.game, bet: s.bet, payout: s.payout, multiplier: s.multiplier, status: s.status, at: s.at }
  }

  return atomic('report.create', () => {
    const report = {
      id: randomHex(6),
      at: now,
      reporterId: me.id,
      reporterName: me.username,
      targetType,
      targetUserId: target?.id ?? null,
      targetName: target?.username ?? null,
      messageId,
      sessionId,
      category: reason,
      description: text,
      evidence,
      status: 'new',
      priority: reason === 'cheating' || reason === 'scam' ? 'high' : 'normal',
      assignee: null,
      notes: [],
      history: [{ at: now, by: me.username, action: 'created', status: 'new' }],
    }
    useAdminStore.setState((s) => ({ reports: [report, ...s.reports].slice(0, 2000) }))
    if (messageId) usePlatformStore.getState().hideMessage(me.id, messageId)
    useNotificationStore.getState().notify(me.id, 'reportUpdate', { reportId: report.id, status: 'new' }, { force: true })
    emit('REPORT_CREATED', { reportId: report.id, reporterId: me.id, targetUserId: report.targetUserId, reportType: targetType })
    return report
  })
}

export const myReports = (userId) => reports().filter((r) => r.reporterId === userId)
export const reportsAbout = (userId) => reports().filter((r) => r.targetUserId === userId)
