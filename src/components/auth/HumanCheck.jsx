import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { api } from '@/services/server'
import { setPreparedCaptcha, solvePow } from '@/services/captcha'
import { SERVER_MODE } from '@/config/runtime'
import { useT } from '@/i18n'

/**
 * Visible anti-bot check, only on sign-in / sign-up / password reset.
 * A "not a robot" box that runs a short proof-of-work in the browser. The proof is attached to the next auth request, then the box resets.
 */
export default function HumanCheck() {
  const { t } = useT()
  const [cfg, setCfg] = useState(null)
  const [state, setState] = useState('idle') // idle | working | done | error

  const load = useCallback(() => {
    setState('idle')
    setPreparedCaptcha(null)
    api('captcha').then(setCfg).catch(() => setCfg({ mode: 'pow-lazy' }))
  }, [])

  useEffect(() => {
    if (!SERVER_MODE) return
    load()
    window.addEventListener('neon-captcha-used', load)
    return () => window.removeEventListener('neon-captcha-used', load)
  }, [load])

  if (!SERVER_MODE || !cfg || cfg.mode === 'off') return null

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
