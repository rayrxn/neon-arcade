import { useState } from 'react'
import HumanCheck from '@/components/auth/HumanCheck'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, ArrowLeft, ArrowRight, MailCheck, Mail } from 'lucide-react'
import Button from '@/components/ui/Button'
import Field from '@/components/ui/Field'
import { requestPasswordReset } from '@/services/account'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** "Forgot password" panel on the sign-in card: email → link sent. Same answer whether or not the email has an account. */
export default function ForgotPassword({ initialEmail = '', onBack }) {
  const { t } = useT()
  const [email, setEmail] = useState(initialEmail.includes('@') ? initialEmail : '')
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)
  const [error, setError] = useState(null)
  const invalid = !EMAIL_RE.test(email.trim())

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (invalid) return
    setBusy(true)
    setError(null)
    try {
      const r = await requestPasswordReset(email)
      setSent({ email: email.trim(), minutes: r?.ttlMinutes ?? 30 })
    } catch (err) {
      setError({ code: errorKey(err), vars: err?.vars })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      {sent ? (
        <motion.div key="sent" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-neon-green/10 text-neon-green ring-1 ring-inset ring-neon-green/25"><MailCheck className="h-7 w-7" /></span>
          <h2 className="mt-4 font-display text-2xl font-bold tracking-tight text-white">{t('account.forgot.sentTitle')}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">{t('account.forgot.sentBody', { email: sent.email, minutes: sent.minutes })}</p>
          <ul className="mt-5 space-y-1.5 rounded-xl bg-white/[0.03] p-3.5 text-left text-xs leading-relaxed text-slate-400 ring-1 ring-inset ring-white/[0.06]">
            <li>• {t('account.forgot.tipSpam')}</li>
            <li>• {t('account.forgot.tipNoAccount')}</li>
          </ul>
          <div className="mt-5 grid gap-2">
            <Button size="lg" className="w-full" onClick={onBack}><ArrowLeft className="h-4 w-4" /> {t('account.forgot.backToLogin')}</Button>
            <button type="button" onClick={() => setSent(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-300">{t('account.forgot.tryAnother')}</button>
          </div>
        </motion.div>
      ) : (
        <motion.form key="ask" noValidate onSubmit={submit} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
          <button type="button" onClick={onBack} className="-ml-1 mb-4 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-xs font-semibold text-slate-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> {t('account.forgot.backToLogin')}</button>
          <h2 className="font-display text-2xl font-bold tracking-tight text-white">{t('account.forgot.title')}</h2>
          <p className="mt-1.5 text-sm text-slate-400">{t('account.forgot.subtitle')}</p>
          <div className="mt-6 pb-4">
            <Field
              id="forgot-email"
              label={t('auth.email')}
              icon={Mail}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              disabled={busy}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              onBlur={() => setTouched(true)}
              error={touched && invalid ? t('validation.emailFormat') : undefined}
            />
          </div>
          <HumanCheck />
          {error && (
            <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-neon-red/30 bg-neon-red/10 px-3.5 py-3 text-sm text-neon-red" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {t(error.code, error.vars)}
            </div>
          )}
          <Button type="submit" size="lg" loading={busy} className="w-full">
            {busy ? t('common.processing') : t('account.forgot.submit')} {!busy && <ArrowRight className="h-4 w-4" />}
          </Button>
        </motion.form>
      )}
    </AnimatePresence>
  )
}
