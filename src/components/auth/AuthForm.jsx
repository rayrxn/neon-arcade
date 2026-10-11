import { useEffect, useMemo, useState } from 'react'
import { CodeInput } from '@/components/settings/TwoFactorCard'
import HumanCheck from '@/components/auth/HumanCheck'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { AlertCircle, ArrowLeft, ArrowRight, AtSign, Check, Eye, EyeOff, Lock, Mail, ShieldCheck, Smartphone } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Field from '@/components/ui/Field'
import ForgotPassword from '@/components/auth/ForgotPassword'
import { CurrencyIcon } from '@/components/ui/Currency'
import { useAuthStore } from '@/store/useAuthStore'
import { SERVER_MODE } from '@/config/runtime'
import { STARTING_AC, STARTING_AG } from '@/store/useWalletStore'
import { formatCoins } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { passwordStrength, validateAuth } from '@/utils/validation'
import { useT } from '@/i18n'

const EASE = [0.22, 1, 0.36, 1]
const EMPTY = { username: '', email: '', password: '', confirm: '' }
const STRENGTH_COLORS = ['bg-neon-red', 'bg-neon-red', 'bg-neon-gold', 'bg-neon-green', 'bg-neon-cyan']

/** Field yang hanya muncul di mode Daftar — tinggi beranimasi saat tab berganti. */
function Collapsible({ show, children }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden">
          <div className="pb-4">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StrengthMeter({ password }) {
  const { t } = useT()
  const { score, labelKey } = passwordStrength(password)
  return (
    <div className="mt-2 flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <motion.span className={clsx('block h-full rounded-full', STRENGTH_COLORS[score])} initial={false} animate={{ width: i < score ? '100%' : '0%' }} transition={{ duration: 0.25 }} />
          </span>
        ))}
      </div>
      <span className="w-24 text-right text-[11px] font-semibold text-slate-500">{t(labelKey)}</span>
    </div>
  )
}

/** Second sign-in step: 6-digit code from the authenticator app or the email. Submits on the 6th digit. */
function TwoFactorStep({ challenge, onDone, onBack }) {
  const { t } = useT()
  const verify = useAuthStore((s) => s.verifyTwoFactor)
  const resend = useAuthStore((s) => s.resendTwoFactor)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [wait, setWait] = useState(challenge.method === 'email' ? 60 : 0)
  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])
  const submit = async (value = code) => {
    if (value.length !== 6 || busy) return
    setBusy(true); setError(null)
    try { await verify(challenge.ticket, value); onDone() } catch (err) {
      setBusy(false); setCode('')
      const k = errorKey(err)
      if (k === 'security.errors.expired' || k === 'security.errors.tooMany') { onBack(t(k)); return }
      setError(t(k, err?.vars))
    }
  }
  const doResend = async () => {
    try { const r = await resend(challenge.ticket); setWait(r?.resendIn ?? 60); setError(null) } catch (err) { setError(t(errorKey(err), err?.vars)); if (err?.vars?.seconds) setWait(Number(err.vars.seconds)) }
  }
  const Icon = challenge.method === 'email' ? Mail : Smartphone
  return (
    <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.35, ease: EASE }}>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-neon-cyan/10 text-neon-cyan ring-1 ring-inset ring-neon-cyan/25"><Icon className="h-6 w-6" /></span>
      <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-white">{t('security2fa.login.title')}</h2>
      <p className="mt-1.5 text-sm text-slate-400">{challenge.method === 'email' ? t('security2fa.login.email', { email: challenge.email }) : t('security2fa.login.totp')}</p>
      {challenge.strict && <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-neon-gold"><ShieldCheck className="h-3.5 w-3.5" /> {t('security2fa.login.strict')}</p>}
      <div className="mt-6"><CodeInput id="login-code" value={code} onChange={(v) => { setCode(v); setError(null); if (v.length === 6) submit(v) }} disabled={busy} autoFocus /></div>
      {error && <p className="mt-4 flex items-start gap-2 rounded-xl border border-neon-red/30 bg-neon-red/10 px-3.5 py-3 text-sm text-neon-red" role="alert"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
      <Button size="lg" className="mt-5 w-full" loading={busy} disabled={code.length !== 6} onClick={() => submit()}>{t('security2fa.login.verify')} <ArrowRight className="h-4 w-4" /></Button>
      <div className="mt-4 flex items-center justify-between text-xs">
        <button type="button" onClick={() => onBack()} className="flex items-center gap-1 font-semibold text-slate-500 hover:text-slate-300"><ArrowLeft className="h-3.5 w-3.5" /> {t('security2fa.login.back')}</button>
        {challenge.method === 'email' && (
          <button type="button" onClick={doResend} disabled={wait > 0} className="font-semibold text-neon-cyan/90 hover:text-neon-cyan disabled:text-slate-600">{wait > 0 ? t('security2fa.login.resendIn', { seconds: wait }) : t('security2fa.login.resend')}</button>
        )}
      </div>
    </motion.div>
  )
}

export default function AuthForm() {
  const { t } = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const login = useAuthStore((s) => s.login)
  const register = useAuthStore((s) => s.register)
  const shake = useAnimationControls()

  const [mode, setMode] = useState('login')
  const [values, setValues] = useState(EMPTY)
  const [touched, setTouched] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const [status, setStatus] = useState('idle') // idle | loading | success
  const [serverError, setServerError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [forgot, setForgot] = useState(() => SERVER_MODE && new URLSearchParams(location.search).get('forgot') === '1')
  const [challenge, setChallenge] = useState(null) // two-step sign-in ticket

  const errors = useMemo(() => validateAuth(mode, values), [mode, values])
  const errorFor = (name) => (touched[name] || submitted) && errors[name] ? t(errors[name]) : undefined
  const isRegister = mode === 'register'
  const busy = status !== 'idle'

  const bind = (name) => ({
    name,
    value: values[name],
    onChange: (e) => {
      setValues((v) => ({ ...v, [name]: e.target.value }))
      if (serverError) setServerError('')
    },
    onBlur: () => setTouched((tt) => ({ ...tt, [name]: true })),
    disabled: busy,
  })

  const switchMode = (next) => {
    if (next === mode || busy) return
    setMode(next)
    setTouched({})
    setSubmitted(false)
    setServerError('')
    setValues((v) => ({ ...EMPTY, email: v.email }))
  }

  const finishSignIn = () => {
    setStatus('success')
    const destination = location.state?.from && location.state.from !== '/auth' ? location.state.from : '/'
    setTimeout(() => navigate(destination, { replace: true }), 480)
  }

  const rattle = () => shake.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42 } })

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setServerError('')
    if (Object.keys(errors).length > 0) return rattle()

    setStatus('loading')
    try {
      if (isRegister) await register(values)
      else {
        const res = await login(values)
        if (res?.twofa) { setStatus('idle'); setChallenge(res.twofa); return }
      }
      finishSignIn()
    } catch (err) {
      setStatus('idle')
      setServerError({ code: errorKey(err), vars: err?.vars })
      rattle()
    }
  }

  const passwordToggle = (
    <button type="button" onClick={() => setShowPassword((s) => !s)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-white/5 hover:text-slate-200" aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}>
      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  )

  return (
    <motion.div animate={shake} className="w-full max-w-[420px]">
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: EASE }} className="auth-card relative overflow-hidden rounded-[22px] p-6 sm:p-9">
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/80 to-transparent" />
        <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-neon-cyan/10 blur-3xl" />
        {challenge ? (
          <TwoFactorStep challenge={challenge} onDone={finishSignIn} onBack={(msg) => { setChallenge(null); setValues((v) => ({ ...v, password: '' })); if (msg) setServerError({ code: msg }) }} />
        ) : forgot ? (
          <ForgotPassword initialEmail={values.email} onBack={() => setForgot(false)} />
        ) : (
        <>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-neon-cyan">{t(`auth.stage.${mode}Eyebrow`)}</p>
            <h2 className="mt-2 font-display text-[28px] font-extrabold leading-tight tracking-tight text-white">{t(`auth.${mode}.title`)}</h2>
            {isRegister ? (
              <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400">
                {t('auth.register.bonus')}
                <span className="inline-flex items-center gap-1 font-bold text-slate-200"><CurrencyIcon currency="AC" size={15} /> {formatCoins(STARTING_AC)} AC</span>
                <span className="text-slate-600">+</span>
                <span className="inline-flex items-center gap-1 font-bold text-slate-200"><CurrencyIcon currency="AG" size={15} /> {STARTING_AG} AG</span>
              </p>
            ) : (
              <p className="mt-1.5 text-sm text-slate-400">{t('auth.login.subtitle')}</p>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-6 grid grid-cols-2 rounded-xl bg-ink-950/70 p-1 ring-1 ring-inset ring-white/[0.07]" role="tablist">
          {['login', 'register'].map((id) => (
            <button key={id} role="tab" aria-selected={mode === id} onClick={() => switchMode(id)} className={clsx('relative h-10 rounded-lg text-sm font-bold transition-colors', mode === id ? 'text-white' : 'text-slate-500 hover:text-slate-300')}>
              {mode === id && <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-lg bg-white/[0.08] ring-1 ring-inset ring-white/10" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
              <span className="relative">{t(`auth.tabs.${id}`)}</span>
            </button>
          ))}
        </div>

        <form noValidate onSubmit={handleSubmit} className="mt-6">
          <Collapsible show={isRegister}>
            <Field id="auth-username" label={t('auth.username')} icon={AtSign} placeholder={t('auth.usernamePlaceholder')} autoComplete="username" error={errorFor('username')} {...bind('username')} />
          </Collapsible>

          <div className="pb-4">
            {isRegister ? (
              <Field id="auth-email" label={t('auth.email')} icon={Mail} type="email" inputMode="email" placeholder={t('auth.emailPlaceholder')} autoComplete="email" error={errorFor('email')} {...bind('email')} />
            ) : (
              <Field id="auth-email" label={t('auth.emailOrUsername')} icon={Mail} type="text" autoCapitalize="none" spellCheck={false} placeholder={t('auth.emailOrUsernamePlaceholder')} autoComplete="username" error={errorFor('email')} {...bind('email')} />
            )}
          </div>

          <div className="pb-4">
            <Field
              id="auth-password"
              label={t('auth.password')}
              icon={Lock}
              type={showPassword ? 'text' : 'password'}
              placeholder={isRegister ? t('auth.passwordPlaceholder') : '••••••••'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              error={errorFor('password')}
              trailing={passwordToggle}
              {...bind('password')}
            />
            {isRegister && values.password && <StrengthMeter password={values.password} />}
            {!isRegister && SERVER_MODE && (
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => setForgot(true)} disabled={busy} className="text-xs font-semibold text-neon-cyan/90 transition hover:text-neon-cyan">{t('account.forgot.link')}</button>
              </div>
            )}
          </div>

          <Collapsible show={isRegister}>
            <Field id="auth-confirm" label={t('auth.confirm')} icon={Lock} type={showPassword ? 'text' : 'password'} placeholder={t('auth.confirmPlaceholder')} autoComplete="new-password" error={errorFor('confirm')} {...bind('confirm')} />
          </Collapsible>

          <HumanCheck />

          <AnimatePresence>
            {serverError && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden" role="alert">
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-neon-red/30 bg-neon-red/10 px-3.5 py-3 text-sm text-neon-red">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {t(serverError.code, serverError.vars)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Button type="submit" size="lg" loading={status === 'loading'} disabled={status === 'success'} className="mt-2 w-full">
            {status === 'success' ? (
              <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-2">
                <Check className="h-4 w-4" /> {t('common.success')}
              </motion.span>
            ) : (
              <>
                {status === 'loading' ? t('common.processing') : t(`auth.${mode}.submit`)}
                {status === 'idle' && <ArrowRight className="h-4 w-4" />}
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">{t(SERVER_MODE ? 'auth.serverNote' : 'auth.localNote')}</p>
        {mode === 'register' && <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-600">{t('auth.ownerNote')}</p>}
        </>
        )}
      </motion.div>
    </motion.div>
  )
}
