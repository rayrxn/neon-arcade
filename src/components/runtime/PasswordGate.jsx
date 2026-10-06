import { useState } from 'react'
import { KeyRound, Lock, LogOut } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Field from '@/components/ui/Field'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { toast } from '@/store/useUiStore'
import { errorKey } from '@/utils/errors'
import { passwordRules } from '@/utils/validation'
import { useT } from '@/i18n'

/** Akun dengan password bawaan (akun staf awal) wajib ganti password sebelum memakai website. */
export default function PasswordGate() {
  const user = useCurrentUser()
  if (!user?.mustChangePassword) return null
  return <GateDialog key={user.id} />
}

function GateDialog() {
  const { t } = useT()
  const changePassword = useAuthStore((s) => s.changePassword)
  const logout = useAuthStore((s) => s.logout)
  const [values, setValues] = useState({ current: '', next: '', confirm: '' })
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const errors = {
    ...(!values.current ? { current: 'validation.passwordRequired' } : {}),
    ...(values.next ? passwordRules(values.next, 'next') : { next: 'validation.passwordRequired' }),
    ...(values.next && values.next === values.current ? { next: 'validation.passwordSame' } : {}),
    ...(values.confirm !== values.next ? { confirm: 'validation.confirmMismatch' } : {}),
  }
  const show = (k) => (submitted && errors[k] ? t(errors[k]) : undefined)
  const bind = (k) => ({ value: values[k], onChange: (e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setError(null) }, type: 'password', disabled: busy })

  const submit = async (e) => {
    e?.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length) return
    setBusy(true)
    try {
      await changePassword({ current: values.current, next: values.next })
      toast({ tone: 'success', title: t('settings.security.passwordChanged') })
    } catch (err) {
      setError(errorKey(err))
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      locked
      onClose={() => {}}
      title={t('auth.forceChange.title')}
      description={t('auth.forceChange.body')}
      icon={KeyRound}
      footer={
        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={() => logout()}><LogOut className="h-4 w-4" /> {t('auth.forceChange.logout')}</Button>
          <Button loading={busy} onClick={submit}>{t('settings.security.update')}</Button>
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field id="force-current" label={t('settings.security.current')} icon={Lock} autoComplete="current-password" error={show('current')} {...bind('current')} />
        <Field id="force-next" label={t('settings.security.new')} icon={KeyRound} autoComplete="new-password" error={show('next')} {...bind('next')} />
        <Field id="force-confirm" label={t('settings.security.confirm')} icon={KeyRound} autoComplete="new-password" error={show('confirm')} {...bind('confirm')} />
        {error && <p className="rounded-xl bg-neon-red/10 px-3.5 py-3 text-sm font-semibold text-neon-red" role="alert">{t(error)}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
