import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { SERVER_API } from '@/config/runtime'
import { translate } from '@/i18n'
import { usePrefsStore } from '@/store/usePrefsStore'

/** Kirim error UI ke server (mode server) supaya penyebabnya bisa dilacak tanpa akses ke browser pemain. */
export function reportClientError(error, componentStack, where) {
  if (!SERVER_API) return
  try {
    fetch(`${SERVER_API}/client-error`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Neon': '1' },
      body: JSON.stringify({
        where: String(where ?? 'root').slice(0, 60),
        message: String(error?.message ?? error).slice(0, 1000),
        stack: String(error?.stack ?? '').slice(0, 2000),
        componentStack: String(componentStack ?? '').slice(0, 2000),
        path: typeof location !== 'undefined' ? `${location.pathname}${location.hash}`.slice(0, 200) : '',
      }),
    }).catch(() => {})
  } catch {
    // diabaikan
  }
}

/**
 * Boundary paling luar: error yang lolos dari boundary halaman tidak lagi membuat seluruh
 * aplikasi kosong. Menampilkan pesan + tombol muat ulang, dan melaporkan detailnya ke server.
 */
export default class RootBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    reportClientError(error, info?.componentStack, this.props.name ?? 'root')
  }
  render() {
    if (!this.state.error) return this.props.children
    const lang = usePrefsStore.getState().language
    return (
      <div className="relative z-10 mx-auto mt-[12vh] max-w-md px-4">
        <div className="glass rounded-2xl p-6 text-center" role="alert">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-neon-red/10 text-neon-red"><AlertTriangle className="h-6 w-6" /></span>
          <p className="mt-3 font-display text-base font-bold text-white">{translate(lang, 'states.crashTitle')}</p>
          <p className="mt-1.5 text-sm text-slate-400">{translate(lang, 'states.crashBody')}</p>
          <p className="mt-3 break-words font-mono text-[11px] text-slate-500">{String(this.state.error?.message ?? '').slice(0, 240)}</p>
          <button
            onClick={() => (window.location.href = '/')}
            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-neon-cyan px-4 py-2 text-sm font-bold text-onaccent focus-ring"
          >
            <RefreshCw className="h-4 w-4" /> {translate(lang, 'states.retry')}
          </button>
        </div>
      </div>
    )
  }
}
