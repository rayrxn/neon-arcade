import { SERVER_API } from '@/config/runtime'
import { useAuthStore } from '@/store/useAuthStore'
import { useWalletStore } from '@/store/useWalletStore'
import { useProgressStore } from '@/store/useProgressStore'
import { useFairnessStore } from '@/store/useFairnessStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { useUiStore, toast } from '@/store/useUiStore'
import { usePrefsStore } from '@/store/usePrefsStore'
import { AppError } from '@/utils/errors'
import { translate } from '@/i18n'
import { emit } from './events'
import { play } from './sound'
import { deferUntilReveal } from './reveal'

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

/** Panggil API. Error server → AppError dengan kode i18n yang sama seperti mode lokal. */
export async function api(path, body, { method } = {}) {
  const m = method ?? (body === undefined ? 'GET' : 'POST')
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
  if (json?.ok) return json.data
  const code = json?.error?.code ?? 'errors.generic'
  const vars = json?.error?.vars ?? {}
  // Sesi habis / akun diblokir di server → keluar di browser juga.
  if (res.status === 401 || res.status === 403) {
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
  const notify = (kind, data) => useNotificationStore.getState().notify(userId, kind, data)
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
