import { useEffect, useRef } from 'react'
import { accountBlock, getCurrentUser, sessionValid, useAuthStore } from '@/store/useAuthStore'
import { useWalletStore } from '@/store/useWalletStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { usePrefsStore } from '@/store/usePrefsStore'
import { useFairnessStore } from '@/store/useFairnessStore'
import { useProgressStore } from '@/store/useProgressStore'
import { useAdminStore } from '@/store/useAdminStore'
import { toast } from '@/store/useUiStore'
import { seedPlatform } from '@/services/platformSeed'
import { settlePendingTransfers } from '@/services/transfers'
import { markLogin } from '@/services/progression'
import { initSound, play } from '@/services/sound'
import { ensureSeason } from '@/services/seasons'
import { describeNotification } from '@/components/notifications/describe'
import { translate } from '@/i18n'

/** Store yang disinkronkan antar-tab lewat event `storage` (mode lokal). */
const SYNCED = {
  'neon-arcade:auth': useAuthStore,
  'neon-arcade:wallet': useWalletStore,
  'neon-arcade:platform': usePlatformStore,
  'neon-arcade:notifications': useNotificationStore,
  'neon-arcade:prefs': usePrefsStore,
  'neon-arcade:fairness': useFairnessStore,
  'neon-arcade:progress': useProgressStore,
  'neon-arcade:admin': useAdminStore,
}

/** Notifikasi yang juga ditampilkan sebagai toast (kejadian di latar belakang). */
const TOAST_KINDS = new Set(['transferIn', 'transferOut', 'jackpot', 'mention', 'quest', 'achievement', 'security', 'adminCredit', 'adminDebit', 'announcement', 'friendRequest', 'friendAccept', 'reportUpdate', 'ticket'])

/**
 * Proses latar platform. Di produksi, sebagian besar tugas ini dipegang server
 * (settlement transfer, presence via WebSocket); di mode lokal dijalankan di browser.
 */
export default function PlatformRuntime() {
  const userId = useAuthStore((s) => s.session?.userId)
  const startedAt = useRef(Date.now())

  // Seed akun demo + selesaikan transfer AG yang sudah lewat masa tahan.
  useEffect(() => {
    seedPlatform()
    settlePendingTransfers()
    ensureSeason()
    const id = setInterval(() => {
      settlePendingTransfers()
      ensureSeason()
    }, 5_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => initSound(), [])

  // Login harian → quest "Login today" + riwayat login.
  useEffect(() => {
    if (userId) markLogin(userId)
  }, [userId])

  // Sesi: kedaluwarsa setelah 7 hari tanpa aktivitas; akun yang di-ban/dibekukan langsung keluar.
  useEffect(() => {
    if (!userId) return
    const check = () => {
      const { session, logout, touchSession } = useAuthStore.getState()
      const lang = usePrefsStore.getState().language
      if (!sessionValid(session)) {
        logout('expired')
        toast({ tone: 'error', title: translate(lang, 'errors.sessionExpired') })
        return
      }
      const block = accountBlock(getCurrentUser())
      if (block) {
        logout('blocked')
        toast({ tone: 'error', title: translate(lang, block.code, { ...block.vars, until: block.vars.until ? new Date(block.vars.until).toLocaleString() : '' }) })
        return
      }
      touchSession()
    }
    check()
    const id = setInterval(check, 30_000)
    return () => clearInterval(id)
  }, [userId])

  // Presence: tandai online selama tab terbuka.
  useEffect(() => {
    if (!userId) return
    const ping = () => usePlatformStore.getState().ping(userId)
    ping()
    const id = setInterval(ping, 30_000)
    return () => clearInterval(id)
  }, [userId])

  // Sinkronisasi antar-tab.
  useEffect(() => {
    const onStorage = (e) => {
      const store = SYNCED[e.key]
      store?.persist?.rehydrate?.()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Toast untuk notifikasi baru milik user aktif.
  useEffect(() => {
    if (!userId) return
    let seen = new Set((useNotificationStore.getState().byUser[userId] ?? []).map((n) => n.id))
    return useNotificationStore.subscribe((state) => {
      const items = state.byUser[userId] ?? []
      for (const n of items) {
        if (seen.has(n.id)) continue
        seen.add(n.id)
        if (n.at < startedAt.current) continue
        if (!['levelUp', 'achievement', 'quest', 'daily'].includes(n.kind)) play('notification')
        if (!TOAST_KINDS.has(n.kind)) continue
        const lang = usePrefsStore.getState().language
        const info = describeNotification((key, vars) => translate(lang, key, vars), lang, n)
        toast({ tone: n.kind === 'security' ? 'error' : ['transferIn', 'levelUp', 'quest', 'achievement', 'adminCredit'].includes(n.kind) ? 'success' : 'info', title: info.title, body: info.body })
      }
      seen = new Set(items.map((n) => n.id))
    })
  }, [userId])

  return null
}
