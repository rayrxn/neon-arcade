import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { randomHex } from '@/utils/rng'
import { hashPassword, verifyPassword } from '@/utils/password'
import { emit } from '@/services/events'
import { AppError } from '@/utils/errors'
import { USERNAME_RE } from '@/utils/validation'
import { useWalletStore } from './useWalletStore'

/**
 * Mock authentication + profil user.
 * "Database" user disimpan di localStorage; password di-hash SHA-256 + salt per user.
 * Untuk backend nanti: ganti isi action dengan fetch ke API — kontraknya tetap
 * (async, lempar AppError berkode i18n), jadi UI tidak perlu diubah.
 */

const NETWORK_LATENCY = 600
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const normalizeEmail = (email) => email.trim().toLowerCase()

/** Sesi berlaku 7 hari dan diperpanjang selama dipakai. */
export const SESSION_TTL = 7 * 86_400_000
const newSession = (user) => ({ userId: user.id, email: user.email, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL, id: randomHex(12) })
/** Rate limit login: 5 gagal dalam 15 menit → dikunci 15 menit (per email). */
const LOGIN_WINDOW = 15 * 60_000
const LOGIN_MAX_FAILS = 5

export const AVATAR_PRESETS = ['cyan', 'violet', 'sunset', 'mint', 'rose', 'steel']
export const presetFor = (seed = '') => AVATAR_PRESETS[[...seed].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_PRESETS.length]

const usernameTaken = (users, name, exceptId) =>
  Object.values(users).some((u) => u.id !== exceptId && u.username.toLowerCase() === name.toLowerCase())

export const useAuthStore = create(
  persist(
    (set, get) => ({
      users: {}, // { [email]: { id, username, displayName, email, salt, passwordHash, avatar, frame, createdAt, lastLoginAt, isDemo } }
      session: null, // { id, userId, email, createdAt, expiresAt }
      attempts: {}, // { [email]: [ts gagal] } — rate limit login

      register: async ({ username, email, password }) => {
        await wait(NETWORK_LATENCY)
        const key = normalizeEmail(email)
        const name = username.trim()
        const { users } = get()
        if (users[key]) throw new AppError('errors.emailTaken')
        if (usernameTaken(users, name)) throw new AppError('errors.usernameTaken')

        const salt = randomHex(16)
        const now = Date.now()
        // Akun pertama di platform = owner (Super Admin). Akun berikutnya = user biasa.
        const isFirst = !Object.values(users).some((u) => !u.isDemo)
        const user = {
          id: randomHex(12),
          username: name,
          displayName: name,
          email: key,
          salt,
          passwordHash: await hashPassword(password, salt),
          avatar: { kind: 'preset', id: presetFor(name) },
          frame: null,
          createdAt: now,
          lastLoginAt: now,
          role: isFirst ? 'super_admin' : 'user',
          status: 'active', // active | frozen | banned
          ban: null, // { until: ts | null (permanen), reason, by, at }
          walletFrozen: false,
          isTest: false,
          testControl: 'off', // off | win | loss (hanya akun test)
          mutedUntil: null,
          loginHistory: [{ at: now, ok: true, kind: 'register' }],
          warnings: [],
          equipped: {},
        }
        if (get().users[key]) throw new AppError('errors.emailTaken') // cek ulang setelah hashing (race)
        useWalletStore.getState().activate(user.id) // 10.000 AC + 1 AG
        set((s) => ({ users: { ...s.users, [key]: user }, session: newSession(user) }))
        emit('USER_REGISTERED', { userId: user.id })
        return user
      },

      login: async ({ email, password }) => {
        await wait(NETWORK_LATENCY)
        const key = normalizeEmail(email)
        const user = get().users[key]
        const record = (ok, kind) =>
          user && set((s) => ({ users: { ...s.users, [key]: { ...s.users[key], loginHistory: [{ at: Date.now(), ok, kind }, ...(s.users[key].loginHistory ?? [])].slice(0, 30) } } }))
        const now = Date.now()
        const fails = (get().attempts[key] ?? []).filter((t) => now - t < LOGIN_WINDOW)
        if (fails.length >= LOGIN_MAX_FAILS) {
          const minutes = Math.max(1, Math.ceil((fails[0] + LOGIN_WINDOW - now) / 60_000))
          throw new AppError('errors.tooManyAttempts', { minutes })
        }
        const check = user && !user.isDemo ? await verifyPassword(password, user.salt, user.passwordHash) : { ok: false }
        if (!check.ok) {
          record(false, 'password')
          set((s) => ({ attempts: { ...s.attempts, [key]: [...fails, now] } }))
          emit('LOGIN_FAILED', { userId: user?.id ?? null })
          throw new AppError(fails.length + 1 >= LOGIN_MAX_FAILS ? 'errors.tooManyAttempts' : 'errors.wrongCredentials', { minutes: 15 })
        }
        // Upgrade hash lama (SHA-256) → PBKDF2 tanpa mengganggu user.
        const upgraded = check.legacy ? { passwordHash: await hashPassword(password, user.salt) } : {}
        const block = accountBlock(user)
        if (block) {
          record(false, block.code)
          throw new AppError(block.code, block.vars)
        }

        useWalletStore.getState().activate(user.id)
        record(true, 'login')
        set((s) => ({
          users: { ...s.users, [key]: { ...s.users[key], ...upgraded, lastLoginAt: Date.now() } },
          session: newSession(user),
          attempts: { ...s.attempts, [key]: [] },
        }))
        emit('USER_LOGIN', { userId: user.id })
        return user
      },

      logout: (reason = 'manual') => {
        const userId = get().session?.userId
        useWalletStore.getState().deactivate()
        set({ session: null })
        if (userId) emit(reason === 'expired' ? 'SESSION_EXPIRED' : 'USER_LOGOUT', { userId, reason })
      },

      /** Perpanjang sesi yang masih aktif (dipanggil berkala selama tab terbuka). */
      touchSession: () => {
        const s = get().session
        if (s && s.expiresAt > Date.now()) set({ session: { ...s, expiresAt: Date.now() + SESSION_TTL } })
      },

      updateProfile: async (patch) => {
        await wait(350)
        const { session, users } = get()
        const user = session && users[session.email]
        if (!user) throw new AppError('errors.sessionExpired')

        const next = { ...user }
        if (patch.displayName !== undefined) {
          const displayName = patch.displayName.trim()
          if (displayName.length < 2 || displayName.length > 24) throw new AppError('errors.displayNameLength')
          next.displayName = displayName
        }
        if (patch.username !== undefined && patch.username.trim() !== user.username) {
          const username = patch.username.trim()
          if (!USERNAME_RE.test(username)) throw new AppError('validation.usernameFormat')
          if (usernameTaken(users, username, user.id)) throw new AppError('errors.usernameTaken')
          next.username = username
        }
        if (patch.avatar !== undefined) {
          next.avatar = patch.avatar
          next.avatarSet = true
        }
        if (patch.frame !== undefined) next.frame = patch.frame

        set({ users: { ...users, [user.email]: next } })
        return next
      },

      changePassword: async ({ current, next }) => {
        await wait(NETWORK_LATENCY)
        const { session, users } = get()
        const user = session && users[session.email]
        if (!user) throw new AppError('errors.sessionExpired')
        if (!(await verifyPassword(current, user.salt, user.passwordHash)).ok) throw new AppError('errors.wrongPassword')
        const salt = randomHex(16)
        const passwordHash = await hashPassword(next, salt)
        set((s) => ({ users: { ...s.users, [user.email]: { ...s.users[user.email], salt, passwordHash } } }))
      },

      /** Dipakai services/admin.js (setelah cek permission & audit log). */
      adminPatchUser: (userId, patch) =>
        set((s) => {
          const entry = Object.entries(s.users).find(([, u]) => u.id === userId)
          if (!entry) return {}
          const [email, user] = entry
          return { users: { ...s.users, [email]: { ...user, ...(typeof patch === 'function' ? patch(user) : patch) } } }
        }),

      /** Dipakai seed platform untuk membuat akun demo (tidak bisa login). */
      upsertDemoUser: (user) => set((s) => ({ users: { ...s.users, [user.email]: { ...user, isDemo: true } } })),
    }),
    {
      name: 'neon-arcade:auth',
      version: 4,
      storage: createJSONStorage(() => localStorage),
      // v1 (Fase 2) → v2: displayName, avatar, frame. v2 → v3: role, status, ban, login history.
      migrate: (state, version) => {
        if (version < 2 && state?.users) {
          for (const user of Object.values(state.users)) {
            user.displayName ??= user.username
            user.avatar ??= { kind: 'preset', id: presetFor(user.username) }
            user.frame ??= null
            user.lastLoginAt ??= user.createdAt
          }
          if (state.session) state.session = { userId: state.session.userId, email: state.session.email }
        }
        if (version < 3 && state?.users) {
          const real = Object.values(state.users).filter((u) => !u.isDemo).sort((a, b) => a.createdAt - b.createdAt)
          for (const user of Object.values(state.users)) {
            user.role ??= !user.isDemo && real[0]?.id === user.id ? 'super_admin' : 'user'
            user.status ??= 'active'
            user.ban ??= null
            user.walletFrozen ??= false
            user.isTest ??= false
            user.testControl ??= 'off'
            user.mutedUntil ??= null
            user.loginHistory ??= []
          }
        }
        // v3 → v4: warnings, kosmetik terpasang, sesi dengan masa berlaku.
        if (version < 4 && state?.users) {
          for (const user of Object.values(state.users)) {
            user.warnings ??= []
            user.equipped ??= {}
          }
          if (state.session && !state.session.expiresAt) state.session = { ...state.session, createdAt: Date.now(), expiresAt: Date.now() + SESSION_TTL }
          state.attempts ??= {}
        }
        return state
      },
    },
  ),
)

/** Alasan akun tidak boleh dipakai (ban aktif / dibekukan), atau null. */
export function accountBlock(user, now = Date.now()) {
  if (!user) return null
  if (user.status === 'banned' && user.ban && (user.ban.until == null || user.ban.until > now))
    return { code: user.ban.until ? 'errors.bannedUntil' : 'errors.bannedPermanent', vars: { reason: user.ban.reason ?? '—', until: user.ban.until } }
  if (user.status === 'frozen') return { code: 'errors.accountFrozen', vars: {} }
  return null
}

// ── Selectors ──
const findById = (users, id) => Object.values(users).find((u) => u.id === id) ?? null

export const sessionValid = (session, now = Date.now()) => !!session && (!session.expiresAt || session.expiresAt > now)
export const useCurrentUser = () => useAuthStore((s) => (s.session ? s.users[s.session.email] ?? null : null))
export const useUserById = (id) => useAuthStore((s) => (id ? findById(s.users, id) : null))
export const getUserById = (id) => findById(useAuthStore.getState().users, id)
export const getCurrentUser = () => {
  const { session, users } = useAuthStore.getState()
  return session ? users[session.email] ?? null : null
}
