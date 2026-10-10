import { SERVER_API } from '@/config/runtime'
import { useAuthStore } from '@/store/useAuthStore'
import { useWalletStore } from '@/store/useWalletStore'
import { useProgressStore } from '@/store/useProgressStore'
import { useFairnessStore } from '@/store/useFairnessStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { useUiStore, toast } from '@/store/useUiStore'
import { usePrefsStore } from '@/store/usePrefsStore'
import { useAdminStore } from '@/store/useAdminStore'
import { useExtrasStore } from '@/store/useExtrasStore'
import { can } from '@/config/roles'
import { AppError } from '@/utils/errors'
import { translate } from '@/i18n'
import { emit } from './events'
import { play } from './sound'
import { deferUntilReveal } from './reveal'
import { captchaProof, takePreparedCaptcha } from './captcha'

/**
 * Jembatan ke API server (mode produksi). Server memegang akun, saldo, game, dan progres;
 * frontend hanya menyimpan snapshot terakhir yang dikirim server ke store yang sama
 * (useWalletStore, useProgressStore, ...), jadi komponen UI tidak perlu tahu bedanya.
 */

/** Selisih jam server − jam browser (ms). Dipakai Crash supaya kurva sinkron. */
let clockOffset = 0
export const serverNow = () => Date.now() + clockOffset
export const toLocalTime = (serverMs) => serverMs - clockOffset

let openRounds = {}
export const serverOpenRound = (game) => openRounds[game] ?? null

const lang = () => usePrefsStore.getState().language

/**
 * Naik setiap kali sesi di browser dihapus (logout / sesi habis). Jawaban API yang dikirim
 * sebelum itu dibuang, supaya polling yang masih berjalan tidak "memasukkan" user lagi.
 */
let authGen = 0
const BANNED_CODES = new Set(['errors.bannedPermanent', 'errors.bannedUntil'])
const ACCOUNT_BLOCK_CODES = new Set(['errors.accountFrozen'])
const AUTH_PATHS = new Set(['auth/login', 'auth/register', 'auth/logout', 'auth/forgot', 'auth/reset/check', 'auth/reset', 'auth/verify'])
export const LOGOUT_KEY = 'neon-arcade:logout'
const CAPTCHA_PATHS = new Set(['auth/login', 'auth/register', 'auth/forgot'])

/** Panggil API. Error server → AppError dengan kode i18n yang sama seperti mode lokal. */
export async function api(path, body, { method } = {}) {
  const m = method ?? (body === undefined ? 'GET' : 'POST')
  const gen = authGen
  if (m === 'POST' && CAPTCHA_PATHS.has(path) && !body?.captcha) {
    // The visible check on the form (HumanCheck) prepares a proof; without one we solve it here.
    const captcha = takePreparedCaptcha() ?? (await captchaProof(() => api('captcha')))
    if (captcha) body = { ...body, captcha }
  }
  let res
  try {
    res = await fetch(`${SERVER_API}/${path}`, {
      method: m,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Neon': '1' },
      body: m === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new AppError('errors.network')
  }
  let json = null
  try {
    json = await res.json()
  } catch {
    throw new AppError(res.ok ? 'errors.generic' : 'errors.network')
  }
  if (gen !== authGen && !AUTH_PATHS.has(path)) throw new AppError('errors.sessionExpired')
  if (json?.ok) return json.data
  const code = json?.error?.code ?? 'errors.generic'
  const vars = json?.error?.vars ?? {}
  // Sesi habis / akun diblokir di server → keluar di browser juga.
  // Banned (on login or mid-session): show the dedicated banned screen instead of a toast.
  if (res.status === 403 && BANNED_CODES.has(code)) {
    if (useAuthStore.getState().session) clearSession()
    useAuthStore.setState({ banned: { code, ...vars } })
    throw new AppError(code, vars)
  }
  // Only a dead session (401) or a blocked account signs the player out. Other 403s (feature off,
  // staff permission, CSRF) are normal errors and must never kick anyone.
  if (res.status === 401 || (res.status === 403 && ACCOUNT_BLOCK_CODES.has(code))) {
    if (useAuthStore.getState().session && path !== 'auth/login') {
      clearSession()
      if (res.status === 403 && code !== 'errors.generic') {
        toast({ tone: 'error', title: translate(lang(), code, { ...vars, until: vars.until ? new Date(vars.until).toLocaleString() : '' }) })
      }
    }
  }
  throw new AppError(code, vars)
}

/** Simpan snapshot state dari server ke store (dompet, progres, seed, season, ronde terbuka). */
export function applyState(state, userId = useAuthStore.getState().session?.userId) {
  if (!state || !userId) return
  if (typeof state.serverTime === 'number') clockOffset = state.serverTime - Date.now()
  if (state.open) openRounds = state.open
  if (state.wallet) {
    useWalletStore.setState((s) => {
      const prev = s.wallets[userId]
      const lastTx = state.wallet.transactions?.[0]
      const changed = lastTx && prev?.transactions?.[0]?.id !== lastTx.id
      const delta = changed && lastTx.amount !== 0 && lastTx.type !== 'bet' ? { id: lastTx.id, amount: lastTx.amount, currency: lastTx.currency } : s.lastDelta
      return { wallets: { ...s.wallets, [userId]: state.wallet }, activeUserId: userId, lastDelta: delta }
    })
  }
  if (state.progress) useProgressStore.setState((s) => ({ byUser: { ...s.byUser, [userId]: state.progress } }))
  if (state.fairness) {
    useFairnessStore.setState({
      serverSeed: null,
      serverSeedHash: state.fairness.serverSeedHash,
      clientSeed: state.fairness.clientSeed,
      nonce: state.fairness.nonce,
      previous: state.fairness.previous,
    })
  }
  if (state.season) usePlatformStore.setState({ season: state.season })
  if (state.notifications) applyNotifications(userId, state.notifications)
  if (state.extras) useExtrasStore.setState((s) => ({ byUser: { ...s.byUser, [userId]: { ...state.extras, pass: state.pass ?? s.byUser[userId]?.pass ?? null } } }))
}

/** Jenis notifikasi yang bisa dimatikan pemain (Settings → Notifikasi). */
const PREF_FOR_KIND = {
  transferIn: 'transfers', transferOut: 'transfers', transferPending: 'transfers', transferFailed: 'transfers', redeem: 'redeem',
  jackpot: 'jackpots', mention: 'mentions', levelUp: 'progress', quest: 'progress', achievement: 'progress', daily: 'progress',
  reward: 'progress', friendRequest: 'friends', friendAccept: 'friends',
}

/** Notifikasi dari server → store (jenis yang dimatikan pemain disaring di sini). */
export function applyNotifications(userId, list) {
  const prefs = usePrefsStore.getState().notifications ?? {}
  const items = list.filter((n) => !(PREF_FOR_KIND[n.kind] && prefs[PREF_FOR_KIND[n.kind]] === false))
  useNotificationStore.setState((s) => ({ byUser: { ...s.byUser, [userId]: items } }))
}

/** Ganti daftar user lain di useAuthStore dengan data server (user aktif dipertahankan). */
function applyUsers(list) {
  const meId = useAuthStore.getState().session?.userId
  useAuthStore.setState((s) => {
    const users = {}
    for (const [k, u] of Object.entries(s.users)) if (u.id === meId) users[k] = u
    for (const u of list) if (u.id !== meId) users[u.email || u.key || `u:${u.id}`] = u
    return { users }
  })
}

let syncing = null
/** Selama data admin (superset: email, warning, dompet, flag) masih segar, sync publik tidak menimpanya. */
let adminFreshUntil = 0
/** Data bersama (pemain lain, chat, teman, notifikasi, pengumuman, sistem). */
export function sync() {
  if (!useAuthStore.getState().session) return Promise.resolve(null)
  if (syncing) return syncing
  syncing = api('sync')
    .then((data) => {
      const meId = useAuthStore.getState().session?.userId
      if (!meId || !data) return null
      if (typeof data.serverTime === 'number') clockOffset = data.serverTime - Date.now()
      if (Date.now() > adminFreshUntil) {
        applyUsers(data.users ?? [])
        useProgressStore.setState((s) => {
          const byUser = {}
          if (s.byUser[meId]) byUser[meId] = s.byUser[meId]
          for (const [id, p] of Object.entries(data.progress ?? {})) if (id !== meId) byUser[id] = p
          return { byUser }
        })
      }
      usePlatformStore.setState({ ...data.platform })
      const a = data.admin ?? {}
      useAdminStore.setState((s) => ({
        announcements: a.announcements ?? s.announcements,
        gameConfig: a.gameConfig ?? s.gameConfig,
        system: a.system ?? s.system,
        reports: a.reports ?? s.reports,
        tickets: a.tickets ?? s.tickets,
        codes: a.codes && Object.keys(a.codes).length ? a.codes : s.codes,
      }))
      if (data.notifications) applyNotifications(meId, data.notifications)
      return data
    })
    .catch(() => null)
    .finally(() => {
      syncing = null
    })
  return syncing
}

let adminSyncing = null
/** Data admin lengkap (semua user, dompet, progres, audit log, event). Hanya staff. */
export function adminSync() {
  const me = useAuthStore.getState().session?.userId
  const role = me ? Object.values(useAuthStore.getState().users).find((u) => u.id === me)?.role : null
  if (!can(role, 'dashboard')) return Promise.resolve(null)
  if (adminSyncing) return adminSyncing
  adminSyncing = api('admin/snapshot')
    .then((data) => {
      const meId = useAuthStore.getState().session?.userId
      if (!meId || !data) return null
      adminFreshUntil = Date.now() + 25_000
      applyUsers(data.users ?? [])
      // Data diri sendiri tetap dari snapshot pribadi (lebih lengkap); sisanya dari admin.
      useWalletStore.setState((s) => {
        const wallets = { ...data.wallets }
        if (s.wallets[meId]) wallets[meId] = s.wallets[meId]
        return { wallets }
      })
      useProgressStore.setState((s) => {
        const byUser = { ...data.progress }
        if (s.byUser[meId]) byUser[meId] = { ...s.byUser[meId], flags: data.progress?.[meId]?.flags ?? [] }
        return { byUser }
      })
      const a = data.admin ?? {}
      useAdminStore.setState((s) => ({ logs: a.logs ?? s.logs, events: a.events ?? s.events, errors: a.errors ?? s.errors, codes: a.codes ?? s.codes, v2: a.v2 ?? s.v2, v3: a.v3 ?? s.v3 }))
      return data
    })
    .catch(() => null)
    .finally(() => {
      adminSyncing = null
    })
  return adminSyncing
}

/** Aksi admin di server, lalu segarkan data admin & platform. */
export async function adminCall(name, args = {}) {
  const data = await api('admin/action', { name, args })
  // Urutan penting: data publik dulu, data admin (lebih lengkap) terakhir.
  await sync()
  await adminSync()
  return data.result
}

/** Aksi sosial di server (respons { result }), lalu sinkron. */
export async function social(path, body = {}) {
  const data = await api(path, body)
  await sync()
  return data.result
}

/** Perubahan optimistis: kirim ke server di belakang layar; kalau ditolak, tampilan dikembalikan dari server. */
export function background(path, body = {}) {
  api(path, body)
    .then(() => sync())
    .catch((err) => {
      toast({ tone: 'error', title: translate(lang(), err?.code ?? 'errors.generic', err?.vars) })
      sync()
    })
}

/** User dari server → useAuthStore (bentuk sama dengan akun lokal). */
export function applyUser(user) {
  if (!user) return
  useAuthStore.setState((s) => {
    const users = { ...s.users }
    // Hapus salinan lama akun ini (mis. email diganti).
    for (const [k, u] of Object.entries(users)) if (u.id === user.id && k !== user.email) delete users[k]
    users[user.email] = { ...users[user.email], ...user }
    return { users, session: { id: 'server', userId: user.id, email: user.email, createdAt: Date.now(), expiresAt: Date.now() + 7 * 86_400_000 } }
  })
}

export function clearSession() {
  authGen++
  useWalletStore.setState({ activeUserId: null, lastDelta: null })
  useAuthStore.setState({ session: null })
  openRounds = {}
}

/** Payload lengkap (login / register / me). */
export function applyPayload(data) {
  if (!data?.user) return null
  applyUser(data.user)
  applyState(data, data.user.id)
  if (data.out) applyOut(data.user.id, data.out)
  return data.user
}

/** Status hidrasi: website menunggu jawaban /api/me sebelum memutuskan sudah login atau belum. */
export async function hydrate() {
  try {
    const data = await api('me')
    if (data?.user) applyPayload(data)
    else {
      clearSession()
      if (typeof data?.serverTime === 'number') clockOffset = data.serverTime - Date.now()
    }
    return { ok: true }
  } catch (err) {
    // Server tidak terjangkau: jangan tampilkan data lama seolah-olah valid.
    clearSession()
    return { ok: false, error: err }
  }
}

/**
 * Efek UI dari hasil progres server (sama seperti commitOut di mode lokal):
 * notifikasi quest/achievement/level, event, overlay level up setelah animasi selesai.
 */
export function applyOut(userId, out) {
  if (!out || !userId) return
  // Notifikasi quest/achievement/level dibuat server (ikut di state.notifications).
  const notify = () => {}
  if (out.xp > 0) emit('XP_GAINED', { userId, xp: out.xp })
  for (const q of out.quests ?? []) {
    notify('quest', { scope: q.scope, quest: q.id })
    emit('QUEST_COMPLETED', { userId, quest: q.id, scope: q.scope })
  }
  for (const id of out.achievements ?? []) {
    notify('achievement', { achievement: id })
    emit('ACHIEVEMENT_UNLOCKED', { userId, achievement: id })
  }
  for (const m of out.milestones ?? []) emit('MILESTONE_REWARD', { userId, milestone: m.key, currency: m.reward?.kind, amount: m.reward?.amount })
  if (out.levelUp) {
    notify('levelUp', { level: out.levelUp.to, from: out.levelUp.from, rewards: (out.rewards ?? []).filter((r) => r.level) })
    emit('LEVEL_UP', { userId, from: out.levelUp.from, to: out.levelUp.to })
  }
  const levelUp = out.levelUp
  const snapshot = { ...out }
  deferUntilReveal(() => {
    if (levelUp) {
      play('levelup')
      useUiStore.getState().showLevelUp({ from: levelUp.from, to: levelUp.to, xp: snapshot.xp, rewards: snapshot.rewards ?? [] })
    } else if (snapshot.achievements?.length) play('achievement')
    else if (snapshot.quests?.length) play('quest')
  })
}

/** Aksi yang mengubah progres: { result, state } → simpan state, kembalikan result. */
export async function act(path, body) {
  const userId = useAuthStore.getState().session?.userId
  const data = await api(path, body ?? {})
  return { result: data.result, apply: () => applyState(data.state, userId), userId }
}
