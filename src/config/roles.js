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
  'release.reset', // reset saldo & progres saat rilis update (Owner)
  'economy.manage', // kurs AC→AG, transaksi mencurigakan (Owner)
  'loyalty.manage', // kartu loyalty, XP, batas taruhan (Owner)
  'playerroles.manage', // role progres pemain (Owner)
  'shop.manage', // item shop
  'emotes.manage', // katalog emote
  'rewards.manage', // misi & klaim hadiah
  'memberships.manage', // VIP / VVIP (Owner)
  'moderation.config', // kata terlarang & tingkat moderasi
  'sessions.terminate', // end open rounds (refund) and sign players out
  'security.review', // security events: dismiss, false positive, review, escalate
  'features.manage', // feature flags OFF / TESTER / VIP / PUBLIC (Owner)
  'maintenance.manage', // global + per-game maintenance
  'errors.view', // error monitoring
  'qa.run', // QA center checks
]

const ALL = new Set(PERMISSIONS)

/**
 * Label di UI: super_admin = Owner, admin = Admin, moderator = Moderator, support = Helper, developer = Tester.
 * Harus sama dengan tabel role_permissions di database (db/functions.sql + migrasi 003).
 */
export const ROLE_PERMISSIONS = {
  super_admin: ALL,
  admin: new Set(PERMISSIONS.filter((p) => !['roles.manage', 'testmode', 'release.reset', 'economy.manage', 'loyalty.manage', 'playerroles.manage', 'memberships.manage', 'features.manage'].includes(p))),
  moderator: new Set(['dashboard', 'users.view', 'users.ban', 'users.warn', 'moderation', 'reports.view', 'reports.manage', 'sessions.view', 'logs.view', 'security.review']),
  support: new Set(['dashboard', 'users.view', 'users.warn', 'sessions.view', 'rewards.view', 'reports.view', 'support.manage']),
  developer: new Set(['dashboard', 'testmode', 'sessions.view', 'errors.view', 'qa.run']),
  user: new Set(),
}

/** Urutan kekuatan role: staf tidak boleh menindak role yang setara/lebih tinggi. */
export const ROLE_RANK = { super_admin: 5, admin: 4, moderator: 3, support: 2, developer: 1, user: 0 }

export const can = (role, permission) => (Array.isArray(permission) ? permission.some((p) => can(role, p)) : !!ROLE_PERMISSIONS[role ?? 'user']?.has(permission))
export const isStaff = (role) => STAFF_ROLES.has(role)
