import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Copy, KeyRound, Lock, Mail, ShieldCheck, ShieldOff, Smartphone, Timer } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Field from '@/components/ui/Field'
import { Switch } from '@/components/ui/Controls'
import { useCurrentUser } from '@/store/useAuthStore'
import { toast } from '@/store/useUiStore'
import { disableTwoFactor, enableTwoFactor, sendSecurityCode, setStrictSessions, startTwoFactor } from '@/services/account'
import { qrPath } from '@/utils/qr'
import { errorKey } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { useT } from '@/i18n'

/** Six-box code input (paste-friendly). */
export function CodeInput({ value, onChange, disabled, autoFocus, id = 'code' }) {
  return (
    <label htmlFor={id} className="relative block">
      <input id={id} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus={autoFocus} disabled={disabled}
        className="absolute inset-0 h-full w-full cursor-text opacity-0" aria-label="6-digit code" />
      <span className="flex justify-between gap-2" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={clsx('grid h-14 flex-1 place-items-center rounded-xl font-mono text-2xl font-bold ring-1 ring-inset transition',
            value[i] ? 'bg-white/[0.06] text-white ring-neon-cyan/50' : 'bg-ink-950/60 text-slate-600 ring-white/10', i === value.length && !disabled && 'ring-2 ring-neon-cyan')}>
            {value[i] ?? '·'}
          </span>
        ))}
      </span>
    </label>
  )
}

function Qr({ text }) {
  const { d, size } = useMemo(() => qrPath(text), [text])
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-44 w-44 rounded-xl bg-white p-1" role="img" aria-label="QR code" shapeRendering="crispEdges">
      <path d={d} fill="#0b0d14" />
    </svg>
  )
}

/**
 * Settings → Security: two-step sign-in (authenticator app or email code) and, for Owners/Admins,
 * strict sessions (3 hours, authenticator on every sign-in).
 */
export default function TwoFactorCard() {
  const { t } = useT()
  const user = useCurrentUser()
  const sec = user?.security ?? { method: null, strict: false, strictAllowed: false, sessionHours: 168 }
  const [flow, setFlow] = useState(null) // { kind: 'setup'|'disable'|'strict', method, secret, uri, email, on }
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  const reset = () => { setFlow(null); setCode(''); setPassword(''); setError(null) }
  const fail = (err) => setError(t(errorKey(err), err?.vars))
  const run = async (fn) => {
    setBusy(true); setError(null)
    try { await fn() } catch (err) { fail(err) } finally { setBusy(false) }
  }

  const begin = (method) => run(async () => {
    const r = await startTwoFactor(method)
    setFlow({ kind: 'setup', method, secret: r.secret, uri: r.uri, email: r.email })
  })
  const confirmSetup = () => run(async () => {
    await enableTwoFactor(flow.method, code, password)
    toast({ tone: 'success', title: t('security2fa.enabled') })
    reset()
  })
  const beginDisable = () => run(async () => {
    let email = null
    if (sec.method === 'email') email = (await sendSecurityCode()).email
    setFlow({ kind: 'disable', method: sec.method, email })
  })
  const confirmDisable = () => run(async () => {
    await disableTwoFactor(code, password)
    toast({ tone: 'success', title: t('security2fa.disabled') })
    reset()
  })
  const beginStrict = (on) => setFlow({ kind: 'strict', method: 'totp', on })
  const confirmStrict = () => run(async () => {
    await setStrictSessions(flow.on, code)
    toast({ tone: 'success', title: t(flow.on ? 'security2fa.strictOn' : 'security2fa.strictOff') })
    reset()
  })

  const copySecret = async () => {
    try { await navigator.clipboard.writeText(flow.secret); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
  }

  const methodLabel = sec.method === 'totp' ? t('security2fa.methodTotp') : sec.method === 'email' ? t('security2fa.methodEmail') : t('security2fa.off')
  const hours = sec.sessionHours ?? 168
  const sessionText = hours >= 24 ? t('security2fa.sessionDays', { n: Math.round(hours / 24) }) : t('security2fa.sessionHours', { n: hours })

  return (
    <div className="mt-6 space-y-4 border-t hairline pt-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className={clsx('grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset', sec.method ? 'bg-neon-green/10 text-neon-green ring-neon-green/25' : 'bg-white/[0.04] text-slate-400 ring-white/10')}>
          {sec.method ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
            {t('security2fa.title')}
            <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider', sec.method ? 'bg-neon-green/10 text-neon-green' : 'bg-white/[0.06] text-slate-400')}>{methodLabel}</span>
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{sec.method ? t('security2fa.onHint', { date: sec.since ? formatDateTime(sec.since) : '—' }) : t('security2fa.offHint')}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Timer className="h-3.5 w-3.5" /> {sessionText}</p>
        </div>
        {!flow && sec.method && <Button size="sm" variant="ghost" onClick={beginDisable} loading={busy}>{t('security2fa.turnOff')}</Button>}
      </div>

      {!flow && !sec.method && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" disabled={busy} onClick={() => begin('totp')} className="group flex items-start gap-3 rounded-xl bg-white/[0.03] p-4 text-left ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.06] hover:ring-neon-cyan/40">
            <Smartphone className="mt-0.5 h-5 w-5 text-neon-cyan" />
            <span><span className="flex items-center gap-2 text-sm font-bold text-white">{t('security2fa.methodTotp')} <span className="rounded bg-neon-cyan/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-neon-cyan">{t('security2fa.recommended')}</span></span><span className="mt-1 block text-xs text-slate-400">{t('security2fa.totpHint')}</span></span>
          </button>
          <button type="button" disabled={busy} onClick={() => begin('email')} className="group flex items-start gap-3 rounded-xl bg-white/[0.03] p-4 text-left ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.06] hover:ring-neon-cyan/40">
            <Mail className="mt-0.5 h-5 w-5 text-neon-purple" />
            <span><span className="text-sm font-bold text-white">{t('security2fa.methodEmail')}</span><span className="mt-1 block text-xs text-slate-400">{t('security2fa.emailHint')}</span></span>
          </button>
        </div>
      )}

      <AnimatePresence>
        {flow && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <div className="space-y-4 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/10 sm:p-5">
              {flow.kind === 'setup' && flow.method === 'totp' && (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <Qr text={flow.uri} />
                  <ol className="min-w-0 flex-1 space-y-2 text-sm text-slate-300">
                    <li><b className="text-white">1.</b> {t('security2fa.step1')}</li>
                    <li><b className="text-white">2.</b> {t('security2fa.step2')}</li>
                    <li className="text-xs text-slate-500">{t('security2fa.manual')}
                      <button type="button" onClick={copySecret} className="mt-1 flex w-full items-center justify-between gap-2 rounded-lg bg-ink-950/70 px-3 py-2 font-mono text-[13px] tracking-wider text-slate-200 ring-1 ring-inset ring-white/10 hover:text-white">
                        <span className="truncate">{flow.secret.match(/.{1,4}/g).join(' ')}</span>{copied ? <Check className="h-4 w-4 text-neon-green" /> : <Copy className="h-4 w-4" />}
                      </button>
                    </li>
                    <li><b className="text-white">3.</b> {t('security2fa.step3')}</li>
                  </ol>
                </div>
              )}
              {flow.kind === 'setup' && flow.method === 'email' && <p className="text-sm text-slate-300">{t('security2fa.emailSent', { email: flow.email })}</p>}
              {flow.kind === 'disable' && <p className="text-sm text-slate-300">{flow.method === 'email' ? t('security2fa.emailSent', { email: flow.email }) : t('security2fa.disableTotp')}</p>}
              {flow.kind === 'strict' && <p className="text-sm text-slate-300">{t(flow.on ? 'security2fa.strictConfirmOn' : 'security2fa.strictConfirmOff')}</p>}

              <CodeInput value={code} onChange={(v) => { setCode(v); setError(null) }} disabled={busy} autoFocus id="sec-code" />
              {flow.kind !== 'strict' && <Field id="sec-pw" label={t('settings.security.current')} icon={Lock} type="password" autoComplete="current-password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }} disabled={busy} />}
              {error && <p className="rounded-xl bg-neon-red/10 px-3.5 py-3 text-sm font-semibold text-neon-red" role="alert">{error}</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={flow.kind === 'setup' ? confirmSetup : flow.kind === 'disable' ? confirmDisable : confirmStrict} loading={busy} disabled={code.length !== 6 || (flow.kind !== 'strict' && !password)}>
                  <KeyRound className="h-4 w-4" /> {t(flow.kind === 'setup' ? 'security2fa.confirmOn' : flow.kind === 'disable' ? 'security2fa.confirmOff' : 'security2fa.confirm')}
                </Button>
                <Button variant="ghost" onClick={reset} disabled={busy}>{t('common.cancel')}</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {sec.strictAllowed && (
        <div className="rounded-2xl bg-neon-gold/[0.04] p-4 ring-1 ring-inset ring-neon-gold/20">
          <Switch id="strict-session" checked={!!sec.strict} onChange={(v) => (sec.method === 'totp' ? beginStrict(v) : setError(t('security.errors.needTotp')))} label={t('security2fa.strictTitle')} />
          <p className="mt-2 text-xs leading-relaxed text-slate-400">{t('security2fa.strictHint')}</p>
          {sec.method !== 'totp' && <p className="mt-1 text-xs font-semibold text-neon-gold">{t('security.errors.needTotp')}</p>}
        </div>
      )}
    </div>
  )
}
