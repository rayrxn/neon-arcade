import { useEffect, useState } from 'react'
import { RefreshCw, WifiOff } from 'lucide-react'
import CoinIcon from '@/components/ui/CoinIcon'
import Logo from '@/components/ui/Logo'
import Button from '@/components/ui/Button'
import { SERVER_MODE } from '@/config/runtime'
import { api, hydrate, sync, LOGOUT_KEY } from '@/services/server'
import { gameBusy } from '@/services/games'
import { useAuthStore } from '@/store/useAuthStore'
import { useT } from '@/i18n'

/**
 * Mode server: tunggu /api/me sebelum menampilkan halaman, supaya status login & saldo
 * selalu dari server (bukan sisa data lama di browser). Setelah itu data disegarkan
 * berkala dan saat tab kembali aktif.
 */
export default function ServerGate({ children }) {
  const { t } = useT()
  const [status, setStatus] = useState(SERVER_MODE ? 'loading' : 'ready')

  const load = async () => {
    setStatus('loading')
    const res = await hydrate()
    if (res.ok) await sync()
    setStatus(res.ok ? 'ready' : 'offline')
  }

  useEffect(() => {
    if (!SERVER_MODE) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!SERVER_MODE || status !== 'ready') return
    // Data akun penuh tiap 60 detik; data bersama (chat, teman, notifikasi) lebih sering —
    // 4 detik saat halaman chat terbuka, 15 detik di halaman lain. Berhenti saat tab disembunyikan.
    // Live updates without reloading: every 4 s a tiny /pulse call returns fingerprints of the account
    // (balance, progress, notifications…) and of shared data (chat, announcements, games). Only what
    // changed is pulled. Full refresh stays as a safety net (60 s account, 16 s shared).
    let tick = 0
    let last = null
    const loop = async () => {
      if (document.visibilityState !== 'visible' || !useAuthStore.getState().session) return
      tick++
      const onChat = /chat/.test(window.location.hash || window.location.pathname)
      let pulse = null
      try { pulse = await api('pulse') } catch { /* offline: fall back to the timers below */ }
      const acct = tick % 15 === 0 || (pulse && last && pulse.account !== last.account)
      const shared = onChat || tick % 4 === 0 || (pulse && last && pulse.shared !== last.shared)
      const wait = acct && gameBusy() // retry on the next tick instead of losing the change
      if (pulse && !wait) last = pulse
      if (acct && !wait) await hydrate()
      if (shared || acct) sync()
    }
    const id = setInterval(loop, 4_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && useAuthStore.getState().session) hydrate().then(() => sync())
    }
    document.addEventListener('visibilitychange', onVisible)
    // Logout / login di tab lain → samakan status tab ini.
    const onStorage = (e) => {
      if (e.key === LOGOUT_KEY && useAuthStore.getState().session) useAuthStore.getState().logout('remote')
      if (e.key === 'neon-arcade:login' && !useAuthStore.getState().session) hydrate().then(() => sync())
    }
    window.addEventListener('storage', onStorage)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('storage', onStorage)
    }
  }, [status])

  if (status === 'ready') return children
  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      {status === 'loading' ? (
        <div className="boot-stack" role="status" aria-label={t('server.loading')}>
          <div className="boot-mark" aria-hidden="true">
            <span className="boot-ring" />
            <span className="boot-coin"><CoinIcon size={30} /></span>
            <span className="boot-shadow" />
          </div>
          <Logo />
          <div className="h-1 w-36 overflow-hidden rounded-full bg-white/[0.06]"><div className="boot-bar h-full w-1/3 rounded-full bg-neon-cyan" /></div>
        </div>
      ) : (
        <>
        <Logo />
        <div className="glass max-w-sm rounded-2xl p-6">
          <WifiOff className="mx-auto h-6 w-6 text-neon-red" />
          <p className="mt-3 font-display text-sm font-bold text-white">{t('server.offlineTitle')}</p>
          <p className="mt-1.5 text-sm text-slate-400">{t('server.offlineBody')}</p>
          <Button className="mt-4 w-full" onClick={load}>
            <RefreshCw className="h-4 w-4" /> {t('server.retry')}
          </Button>
        </div>
        </>
      )}
    </div>
  )
}
