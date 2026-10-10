import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Loader2, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/services/server'
import { loadTurnstile, setPreparedCaptcha, solvePow } from '@/services/captcha'
import { SERVER_MODE } from '@/config/runtime'
import { useT } from '@/i18n'

/**
 * Visible anti-bot check, only on sign-in / sign-up / password reset.
 * Cloudflare Turnstile widget when the server has keys, otherwise a "not a robot" box that runs a short
 * proof-of-work in the browser. The proof is attached to the next auth request, then the box resets.
 */
export default function HumanCheck() {
  const { t } = useT()
  const [cfg, setCfg] = useState(null)
  const [state, setState] = useState('idle') // idle | working | done | error
  const box = useRef(null)
  const widget = useRef(null)

  const load = useCallback(() => {
    setState('idle')
    setPreparedCaptcha(null)
    api('captcha').then(setCfg).catch(() => setCfg({ mode: 'pow-lazy' }))
  }, [])

  useEffect(() => {
    if (!SERVER_MODE) return
    load()
    const reset = () => {
      if (widget.current != null && window.turnstile) {
        try { window.turnstile.reset(widget.current) } catch { /* gone */ }
        setState('idle')
      } else load()
    }
    window.addEventListener('neon-captcha-used', reset)
    return () => window.removeEventListener('neon-captcha-used', reset)
  }, [load])

  useEffect(() => {
    if (cfg?.mode !== 'turnstile' || !box.current) return
    let alive = true
    loadTurnstile().then((ts) => {
      if (!alive || !box.current) return
      widget.current = ts.render(box.current, {
        sitekey: cfg.siteKey,
        theme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
        callback: (token) => { setPreparedCaptcha({ token }); setState('done') },
        'expired-callback': () => { setPreparedCaptcha(null); setState('idle') },
        'error-callback': () => setState('error'),
      })
    }).catch(() => alive && setState('error'))
    return () => {
      alive = false
      if (widget.current != null) try { window.turnstile?.remove(widget.current) } catch { /* gone */ }
      widget.current = null
    }
  }, [cfg])

  if (!SERVER_MODE || !cfg || cfg.mode === 'off') return null
  if (cfg.mode === 'turnstile') {
    return (
      <div className="mb-4">
        <div ref={box} className="min-h-[65px]" />
        {state === 'error' && <p className="mt-1 text-xs text-neon-red">{t('auth.human.error')}</p>}
      </div>
    )
  }

  const verify = async () => {
    if (state === 'working' || state === 'done') return
    setState('working')
    try {
      const c = cfg.challenge ? cfg : await api('captcha')
      const solution = await solvePow(c.challenge, c.bits)
      setPreparedCaptcha({ challenge: c.challenge, solution })
      setState('done')
    } catch {
      setState('error')
    }
  }

  return (
    <button
      type="button"
      onClick={verify}
      aria-pressed={state === 'done'}
      className={clsx(
        'mb-4 flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-sm ring-1 ring-inset transition-colors',
        state === 'done' ? 'bg-neon-green/10 ring-neon-green/40' : state === 'error' ? 'bg-neon-red/10 ring-neon-red/40' : 'bg-white/[0.03] ring-white/10 hover:bg-white/[0.06]',
      )}
    >
      <span className={clsx('grid h-6 w-6 shrink-0 place-items-center rounded-md ring-1 ring-inset', state === 'done' ? 'bg-neon-green text-ink-950 ring-neon-green' : 'bg-ink-950/60 ring-white/20')}>
        {state === 'working' ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" /> : state === 'done' ? <Check className="h-4 w-4" /> : null}
      </span>
      <span className="flex-1 font-semibold text-slate-200">
        {state === 'working' ? t('auth.human.working') : state === 'done' ? t('auth.human.done') : state === 'error' ? t('auth.human.retry') : t('auth.human.check')}
      </span>
      <ShieldCheck className="h-5 w-5 shrink-0 text-slate-500" />
    </button>
  )
}
