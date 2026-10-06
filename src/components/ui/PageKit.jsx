import { Component, useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import clsx from 'clsx'
import { errorKey } from '@/utils/errors'
import { logError } from '@/services/errorLog'
import { t as translate, useT } from '@/i18n'
import { reportClientError } from '@/components/runtime/RootBoundary'

/** Judul halaman standar. */
export function PageHeader({ title, subtitle, actions, icon: Icon }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 font-display text-2xl font-bold tracking-tight text-white">
          {Icon && <Icon className="h-6 w-6 shrink-0 text-neon-cyan" />}
          <span className="truncate">{title}</span>
        </h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * Ambil data lewat service ("API") dengan state loading / error / retry.
 * fetcher boleh sinkron atau async; dijalankan ulang saat deps berubah.
 */
export function useQuery(fetcher, deps = [], { latency = 0 } = {}) {
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  // Data lokal (sinkron) langsung tampil tanpa kedip; data async → skeleton dulu.
  const [state, setState] = useState(() => {
    if (latency) return { data: undefined, loading: true, error: null }
    try {
      const data = fetcher()
      if (data && typeof data.then === 'function') return { data: undefined, loading: true, error: null, pending: data }
      return { data, loading: false, error: null }
    } catch (err) {
      if (!err?.code) logError('page.query', err)
      return { data: undefined, loading: false, error: err }
    }
  })
  const [attempt, setAttempt] = useState(0)
  const first = useRef(true)

  useEffect(() => {
    let alive = true
    const initial = first.current
    first.current = false
    const run = async () => {
      try {
        if (attempt > 0 && alive) setState((s) => ({ ...s, loading: true, error: null }))
        if ((initial || attempt > 0) && latency) await new Promise((r) => setTimeout(r, latency))
        const data = await (initial && state.pending ? state.pending : fetchRef.current())
        if (alive) setState({ data, loading: false, error: null })
      } catch (err) {
        if (!err?.code) logError('page.query', err)
        if (alive) setState({ data: undefined, loading: false, error: err })
      }
    }
    run()
    return () => {
      alive = false
    }
  }, [...deps, attempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return { data: state.data, loading: state.loading, error: state.error, retry }
}

export function Skeleton({ rows = 3, className }) {
  return (
    <div className={clsx('space-y-2.5 p-4', className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" style={{ opacity: 1 - i * 0.18 }} />
      ))}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact = false }) {
  const { t } = useT()
  return (
    <div className={clsx('flex flex-col items-center text-center', compact ? 'gap-2 p-4' : 'gap-3 px-6 py-10')} role="alert">
      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-neon-red/10 text-neon-red"><AlertTriangle className="h-5 w-5" /></span>
      <div>
        <p className="font-display text-sm font-bold text-white">{t('states.errorTitle')}</p>
        <p className="mt-1 max-w-sm text-xs text-slate-400">{t(errorKey(error), error?.vars)}</p>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="inline-flex items-center gap-1.5 rounded-xl bg-white/[0.06] px-3.5 py-2 text-xs font-bold text-white hover:bg-white/[0.1] focus-ring">
          <RefreshCw className="h-3.5 w-3.5" /> {t('states.retry')}
        </button>
      )}
    </div>
  )
}

/** Render sesuai state query: skeleton → error (retry) → empty → children(data). */
export function QueryView({ query, empty, isEmpty = (d) => Array.isArray(d) && d.length === 0, rows = 3, children }) {
  if (query.loading) return <Skeleton rows={rows} />
  if (query.error) return <ErrorState error={query.error} onRetry={query.retry} />
  if (isEmpty(query.data)) return empty ?? null
  return children(query.data)
}

export function Spinner({ className }) {
  return <Loader2 className={clsx('h-4 w-4 animate-spin', className)} />
}

/** Error boundary per halaman: crash UI tidak membuat seluruh app blank; ada tombol coba lagi. */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    reportClientError(error, info?.componentStack, this.props.name ?? 'page')
    logError(`ui:${this.props.name ?? 'page'}`, Object.assign(error, { componentStack: info?.componentStack?.slice(0, 600) }))
  }
  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="glass rounded-2xl">
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-neon-red/10 text-neon-red"><AlertTriangle className="h-6 w-6" /></span>
          <p className="font-display text-base font-bold text-white">{translate('states.crashTitle')}</p>
          <p className="max-w-md text-sm text-slate-400">{translate('states.crashBody')}</p>
          <button onClick={() => this.setState({ error: null })} className="inline-flex items-center gap-1.5 rounded-xl bg-neon-cyan px-4 py-2 text-sm font-bold text-onaccent focus-ring">
            <RefreshCw className="h-4 w-4" /> {translate('states.retry')}
          </button>
        </div>
      </div>
    )
  }
}
