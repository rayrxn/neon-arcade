import { getProgress, useProgressStore } from '@/store/useProgressStore'
import { getUserById, useAuthStore } from '@/store/useAuthStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { useAdminStore } from '@/store/useAdminStore'
import { randomHex } from '@/utils/rng'
import { emit } from './events'

/**
 * Anti-cheat / fairness (tabel cheat_flags + security_events).
 *
 * Prinsip: hasil game tidak pernah diubah diam-diam. Sistem hanya mendeteksi, menyimpan
 * bukti, dan mengirim kasus ke moderasi. Tindakan (batalkan reward, freeze, ban) diambil
 * admin secara transparan dan tercatat di audit log.
 *
 * Risk: low | medium | high | critical.
 *   high/critical → security event + kasus otomatis di antrean moderasi + notifikasi ke user.
 *   critical + setting "auto-freeze" aktif → wallet dibekukan sambil menunggu review.
 */
export const FLAG_TYPES = [
  'replay', 'rapidRequests', 'modifiedState', 'abnormalReward', 'impossibleDuration', 'suspiciousPattern',
  'abnormalCurrency', 'duplicateSubmission', 'invalidState', 'impossibleXp', 'impossibleLevel',
]

export function flag(userId, type, risk, detail = {}) {
  const recent = getProgress(userId).flags.find((f) => f.type === type && Date.now() - f.at < 600_000 && f.status === 'open')
  if (recent) {
    // Flag sejenis dalam 10 menit digabung (jumlah kejadian bertambah, bukti pertama tetap).
    useProgressStore.getState().update(userId, (p) => ({ ...p, flags: p.flags.map((f) => (f.id === recent.id ? { ...f, count: (f.count ?? 1) + 1, lastAt: Date.now() } : f)) }))
    return recent
  }
  const entry = { id: randomHex(6), type, risk, ...detail, at: Date.now(), status: 'open', count: 1, evidence: { ...detail, recordedAt: Date.now() } }
  useProgressStore.getState().update(userId, (p) => {
    p.flags = [entry, ...p.flags].slice(0, 200)
    return p
  })
  emit('SECURITY_EVENT', { userId, flag: type, risk, sessionId: detail.sessionId ?? null })

  if (risk === 'high' || risk === 'critical') {
    useNotificationStore.getState().notify(userId, 'security', { event: 'suspicious' }, { force: true })
    openCase(userId, entry)
    if (risk === 'critical' && useAdminStore.getState().system?.autoFreezeCritical) {
      useAuthStore.getState().adminPatchUser(userId, { walletFrozen: true })
      useAdminStore.getState().appendLog({
        id: randomHex(8), at: Date.now(), code: 'SYSTEM_FREEZE_WALLET', adminId: 'system', adminName: 'system', role: 'system',
        action: 'wallet.freeze', target: getUserById(userId)?.username ?? userId, targetId: userId, entityId: entry.id,
        reason: `Auto-freeze: ${type}`, before: false, after: true,
      })
    }
  }
  return entry
}

/** Kasus moderasi otomatis dari sistem anti-cheat (reporter = system). */
function openCase(userId, entry) {
  const target = getUserById(userId)
  const report = {
    id: randomHex(6),
    at: Date.now(),
    reporterId: 'system',
    reporterName: 'Anti-cheat',
    targetType: 'game',
    targetUserId: userId,
    targetName: target?.username ?? '—',
    category: 'cheating',
    description: `${entry.type} (${entry.risk})`,
    sessionId: entry.sessionId ?? null,
    flagId: entry.id,
    evidence: entry.evidence,
    status: 'new',
    priority: entry.risk === 'critical' ? 'urgent' : 'high',
    assignee: null,
    notes: [],
    history: [{ at: Date.now(), by: 'system', action: 'created' }],
  }
  useAdminStore.setState((s) => ({ reports: [report, ...(s.reports ?? [])].slice(0, 2000) }))
  emit('REPORT_CREATED', { reportId: report.id, targetUserId: userId, by: 'system' })
}
