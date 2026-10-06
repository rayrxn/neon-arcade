/**
 * Role-Based Access Control. Permission dicek di services/admin.js (bukan cuma di UI).
 * Di produksi daftar ini dipakai server; UI hanya menyembunyikan menu yang tidak boleh.
 */

export const ROLES = ['super_admin', 'admin', 'moderator', 'support', 'developer', 'user']
export const STAFF_ROLES = new Set(['super_admin', 'admin', 'moderator', 'support', 'developer'])

export const PERMISSIONS = [
  'dashboard',
  'users.view',
  'users.sensitive', // email, login history, security flags
  'users.edit',
  'users.ban',
  'users.freeze',
  'wallet.manage',
  'progress.reset',
  'games.manage',
  'sessions.view',
  'sessions.invalidate',
  'anticheat',
  'moderation',
  'rewards.view',
  'codes.manage',
  'announcements.manage',
  'analytics',
  'logs.view',
  'roles.manage',
  'testmode',
  'users.warn', // warning & hapus warning
  'reports.view',
  'reports.manage', // antrean moderasi: investigate, assign, resolve, dismiss, escalate
  'support.manage', // tiket support
  'wallet.reverse', // reversal transaksi
  'system.manage', // maintenance, status layanan, season, slow mode
]

const ALL = new Set(PERMISSIONS)

export const ROLE_PERMISSIONS = {
  super_admin: ALL,
  admin: new Set(PERMISSIONS.filter((p) => !['roles.manage', 'testmode'].includes(p))),
  moderator: new Set(['dashboard', 'users.view', 'users.ban', 'users.warn', 'moderation', 'reports.view', 'reports.manage', 'sessions.view', 'logs.view']),
  support: new Set(['dashboard', 'users.view', 'sessions.view', 'rewards.view', 'reports.view', 'support.manage']),
  developer: new Set(['dashboard', 'testmode', 'sessions.view', 'games.manage']), // khusus test mode
  user: new Set(),
}

/** Urutan kekuatan role: admin tidak boleh menindak role yang setara/lebih tinggi. */
export const ROLE_RANK = { super_admin: 5, admin: 4, moderator: 3, support: 2, developer: 2, user: 0 }

export const can = (role, permission) => !!ROLE_PERMISSIONS[role ?? 'user']?.has(permission)
export const isStaff = (role) => STAFF_ROLES.has(role)
