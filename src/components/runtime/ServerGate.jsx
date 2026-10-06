import { useEffect, useState } from 'react'
import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import Button from '@/components/ui/Button'
import { SERVER_MODE } from '@/config/runtime'
import { hydrate } from '@/services/server'
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
    setStatus(res.ok ? 'ready' : 'offline')
  }

  useEffect(() => {
    if (!SERVER_MODE) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!SERVER_MODE || status !== 'ready') return
    const refresh = () => {
      if (document.visibilityState === 'visible' && useAuthStore.getState().session) hydrate()
    }
    const id = setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [status])

  if (status === 'ready') return children
  return (
    <div className="relative z-10 flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      {status === 'loading' ? (
        <Loader2 className="h-5 w-5 animate-spin text-neon-cyan" aria-label={t('server.loading')} />
      ) : (
        <div className="glass max-w-sm rounded-2xl p-6">
          <WifiOff className="mx-auto h-6 w-6 text-neon-red" />
          <p className="mt-3 font-display text-sm font-bold text-white">{t('server.offlineTitle')}</p>
          <p className="mt-1.5 text-sm text-slate-400">{t('server.offlineBody')}</p>
          <Button className="mt-4 w-full" onClick={load}>
            <RefreshCw className="h-4 w-4" /> {t('server.retry')}
          </Button>
        </div>
      )}
    </div>
  )
}
