import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, MailCheck, MailX } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Field from '@/components/ui/Field'
import Logo from '@/components/ui/Logo'
import AuthBackdrop from '@/components/auth/AuthBackdrop'
import { checkResetLink, resetPassword, verifyEmail } from '@/services/account'
import { useAuthStore } from '@/store/useAuthStore'
import { errorKey } from '@/utils/errors'
import { passwordStrength } from '@/utils/validation'
import { useT } from '@/i18n'

const STRENGTH_COLORS = ['bg-neon-red', 'bg-neon-red', 'bg-neon-gold', 'bg-neon-green', 'bg-neon-cyan']

/** Same backdrop and card as the sign-in page, centered. */
function LinkShell({ children }) {
  return (
    <div className="relative grid min-h-dvh place-items-center px-4 py-16">
      <AuthBackdrop />
      <div className="relative w-full max-w-[420px]">
        <Link to="/auth" className="mb-6 flex justify-center"><Logo /></Link>
        <motion.div initial={{ opacity: 0, y: 16, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="glass-strong relative overflow-hidden rounded-2xl p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/70 to-transparent" />
          {children}
        </motion.div>
      </div>
    </div>
  )
}

function StateBlock({ icon: Icon, tone, title, body, children }) {
  return (
    <div className="text-center">
      <span className={clsx('mx-auto grid h-14 w-14 place-items-center rounded-2xl ring-1 ring-inset', tone)}><Icon className="h-7 w-7" /></span>
      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-white">{title}</h1>
      {body && <p className="mt-2 text-sm leading-relaxed text-slate-400">{body}</p>}
      {children && <div className="mt-6 grid gap-2">{children}</div>}
    </div>
  )
}

const Loading = () => (
  <div className="grid place-items-center py-10 text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
)

/** /reset-password?token=… — opened from the reset email. */
export function ResetPasswordPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [link, setLink] = useState(null) // null = checking, false = invalid, object = ok
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    let alive = true
    checkResetLink(token).then((r) => alive && setLink(r)).catch(() => alive && setLink(false))
    return () => { alive = false }
  }, [token])

  const tooShort = password.length < 8
  const mismatch = confirm !== password
  const { score, labelKey } = passwordStrength(password)

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (tooShort || mismatch) return
    setBusy(true)
    setError(null)
    try {
      await resetPassword(token, password)
      // Every device is signed out by the reset, this one included.
      useAuthStore.setState({ session: null })
      setDone(true)
    } catch (err) {
      const code = errorKey(err)
      if (code === 'auth.errors.linkInvalid') setLink(false)
      else setError({ code, vars: err?.vars })
    } finally {
      setBusy(false)
    }
  }

  const toggle = (
    <button type="button" onClick={() => setShow((s) => !s)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-200" aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}>
      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )

  return (
    <LinkShell>
      {link === null ? (
        <Loading />
      ) : link === false ? (
        <StateBlock icon={MailX} tone="bg-neon-red/10 text-neon-red ring-neon-red/25" title={t('account.reset.invalidTitle')} body={t('account.reset.invalidBody')}>
          <Button size="lg" className="w-full" onClick={() => navigate('/auth?forgot=1')}>{t('account.reset.newLink')} <ArrowRight className="h-4 w-4" /></Button>
          <Link to="/auth" className="text-xs font-semibold text-slate-500 hover:text-slate-300">{t('account.forgot.backToLogin')}</Link>
        </StateBlock>
      ) : done ? (
        <StateBlock icon={CheckCircle2} tone="bg-neon-green/10 text-neon-green ring-neon-green/25" title={t('account.reset.doneTitle')} body={t('account.reset.doneBody')}>
          <Button size="lg" className="w-full" onClick={() => navigate('/auth', { replace: true })}>{t('account.reset.signIn')} <ArrowRight className="h-4 w-4" /></Button>
        </StateBlock>
      ) : (
        <form noValidate onSubmit={submit}>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-inset ring-neon-cyan/25"><KeyRound className="h-6 w-6" /></span>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-white">{t('account.reset.title')}</h1>
          <p className="mt-1.5 text-sm text-slate-400">{t('account.reset.subtitle', { user: link.username, email: link.email })}</p>
          <div className="mt-6 space-y-4">
            <div>
              <Field id="reset-password" label={t('account.reset.newPassword')} icon={Lock} type={show ? 'text' : 'password'} autoComplete="new-password" autoFocus placeholder={t('auth.passwordPlaceholder')} value={password} disabled={busy} trailing={toggle}
                onChange={(e) => { setPassword(e.target.value); setError(null) }} error={touched && tooShort ? t('validation.passwordLength') : undefined} />
              {password && (
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex flex-1 gap-1">{[0, 1, 2, 3].map((i) => <span key={i} className={clsx('h-1 flex-1 rounded-full', i < score ? STRENGTH_COLORS[score] : 'bg-white/[0.08]')} />)}</div>
                  <span className="w-24 text-right text-[11px] font-semibold text-slate-500">{t(labelKey)}</span>
                </div>
              )}
            </div>
            <Field id="reset-confirm" label={t('auth.confirm')} icon={Lock} type={show ? 'text' : 'password'} autoComplete="new-password" placeholder={t('auth.confirmPlaceholder')} value={confirm} disabled={busy}
              onChange={(e) => setConfirm(e.target.value)} error={touched && mismatch ? t('validation.confirmMismatch') : undefined} />
          </div>
          {error && (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-neon-red/30 bg-neon-red/10 px-3.5 py-3 text-sm text-neon-red" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {t(error.code, error.vars)}</div>
          )}
          <Button type="submit" size="lg" loading={busy} className="mt-6 w-full">{busy ? t('common.processing') : t('account.reset.submit')}</Button>
          <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">{t('account.reset.signOutNote')}</p>
        </form>
      )}
    </LinkShell>
  )
}

/** /verify-email?token=… — opened from the verification email; verifies on load. */
export function VerifyEmailPage() {
  const { t } = useT()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const signedIn = useAuthStore((s) => !!s.session)
  const [state, setState] = useState('loading') // loading | ok | invalid | error
  const [errorCode, setErrorCode] = useState(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    verifyEmail(token)
      .then(() => setState('ok'))
      .catch((err) => {
        const code = errorKey(err)
        setErrorCode(code)
        setState(code === 'auth.errors.linkInvalid' ? 'invalid' : 'error')
      })
  }, [token])

  return (
    <LinkShell>
      {state === 'loading' ? (
        <Loading />
      ) : state === 'ok' ? (
        <StateBlock icon={MailCheck} tone="bg-neon-green/10 text-neon-green ring-neon-green/25" title={t('account.verify.doneTitle')} body={t('account.verify.doneBody')}>
          <Link to={signedIn ? '/settings' : '/auth'} className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-neon-cyan text-sm font-bold text-ink-950 transition hover:brightness-110">
            {signedIn ? t('account.verify.toSettings') : t('account.reset.signIn')} <ArrowRight className="h-4 w-4" />
          </Link>
        </StateBlock>
      ) : (
        <StateBlock icon={MailX} tone="bg-neon-red/10 text-neon-red ring-neon-red/25" title={t(state === 'invalid' ? 'account.verify.invalidTitle' : 'states.errorTitle')} body={state === 'invalid' ? t('account.verify.invalidBody') : t(errorCode ?? 'errors.generic')}>
          <Link to={signedIn ? '/settings' : '/auth'} className="inline-flex h-12 w-full items-center justify-center rounded-xl bg-white/[0.06] text-sm font-bold text-white ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.1]">
            {signedIn ? t('account.verify.toSettings') : t('account.forgot.backToLogin')}
          </Link>
        </StateBlock>
      )}
    </LinkShell>
  )
}
