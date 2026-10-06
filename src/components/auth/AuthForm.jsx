import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { AlertCircle, ArrowRight, AtSign, Check, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Field from '@/components/ui/Field'
import { CurrencyIcon } from '@/components/ui/Currency'
import { useAuthStore } from '@/store/useAuthStore'
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

  const rattle = () => shake.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42 } })

  async function handleSubmit(event) {
    event.preventDefault()
    setSubmitted(true)
    setServerError('')
    if (Object.keys(errors).length > 0) return rattle()

    setStatus('loading')
    try {
      if (isRegister) await register(values)
      else await login(values)
      setStatus('success')
      const destination = location.state?.from && location.state.from !== '/auth' ? location.state.from : '/'
      setTimeout(() => navigate(destination, { replace: true }), 480)
    } catch (err) {
      setStatus('idle')
      setServerError(errorKey(err))
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
      <motion.div initial={{ opacity: 0, y: 20, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: EASE }} className="glass-strong relative overflow-hidden rounded-2xl p-6 sm:p-8">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-neon-cyan/70 to-transparent" />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">{t(`auth.${mode}.title`)}</h2>
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
            <Field id="auth-email" label={t('auth.email')} icon={Mail} type="email" inputMode="email" placeholder={t('auth.emailPlaceholder')} autoComplete="email" error={errorFor('email')} {...bind('email')} />
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
          </div>

          <Collapsible show={isRegister}>
            <Field id="auth-confirm" label={t('auth.confirm')} icon={Lock} type={showPassword ? 'text' : 'password'} placeholder={t('auth.confirmPlaceholder')} autoComplete="new-password" error={errorFor('confirm')} {...bind('confirm')} />
          </Collapsible>

          <AnimatePresence>
            {serverError && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden" role="alert">
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-neon-red/30 bg-neon-red/10 px-3.5 py-3 text-sm text-neon-red">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {t(serverError)}
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

        <p className="mt-6 text-center text-xs leading-relaxed text-slate-500">{t('auth.localNote')}</p>
        {mode === 'register' && <p className="mt-2 text-center text-[11px] leading-relaxed text-slate-600">{t('auth.ownerNote')}</p>}
      </motion.div>
    </motion.div>
  )
}
