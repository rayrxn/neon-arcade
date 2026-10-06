import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, Globe, Volume2, VolumeX, KeyRound, Lock, LogOut, Mail, MailCheck, Monitor, Moon, Palette, Pencil, ShieldCheck, Sun, Trash2, UserRound } from 'lucide-react'
import clsx from 'clsx'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import Field from '@/components/ui/Field'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Switch } from '@/components/ui/Controls'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { NOTIFICATION_KEYS, usePrefsStore } from '@/store/usePrefsStore'
import { openModal, toast } from '@/store/useUiStore'
import { passwordRules } from '@/utils/validation'
import { errorKey } from '@/utils/errors'
import { formatDateTime } from '@/utils/format'
import { play } from '@/services/sound'
import { sendVerificationEmail } from '@/services/account'
import { SERVER_MODE } from '@/config/runtime'
import { useT } from '@/i18n'

const SECTIONS = [
  { id: 'account', icon: UserRound },
  { id: 'appearance', icon: Palette },
  { id: 'language', icon: Globe },
  { id: 'notifications', icon: Bell },
  { id: 'sound', icon: Volume2 },
  { id: 'security', icon: ShieldCheck },
]

/** Pengaturan suara — disimpan di prefs, langsung dipakai services/sound.js. */
function SoundSettings() {
  const { t } = useT()
  const sound = usePrefsStore((s) => s.sound)
  const setSound = usePrefsStore((s) => s.setSound)
  const rows = [
    ['master', t('settings.sound.master')],
    ['music', t('settings.sound.music')],
    ['ui', t('settings.sound.ui')],
    ['sfx', t('settings.sound.game')],
  ]
  return (
    <div className="space-y-4">
      {rows.map(([key, label]) => (
        <div key={key} className="flex items-center gap-4">
          <label htmlFor={`sound-${key}`} className="w-28 shrink-0 text-sm font-bold text-slate-200">{label}</label>
          <input
            id={`sound-${key}`}
            type="range"
            min={0}
            max={100}
            value={Math.round((sound[key] ?? 0.7) * 100)}
            disabled={sound.muted}
            onChange={(e) => setSound({ [key]: Number(e.target.value) / 100 })}
            onPointerUp={() => key !== 'music' && play(key === 'sfx' ? 'win' : 'notification')}
            className="min-w-0 flex-1 accent-[rgb(var(--neon-cyan))] disabled:opacity-40"
          />
          <span className="num w-10 text-right font-mono text-xs text-slate-400">{Math.round((sound[key] ?? 0.7) * 100)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4 border-t hairline pt-4">
        <label htmlFor="sound-music-on" className="text-sm font-bold text-slate-200">{t('settings.sound.lobbyMusic')}</label>
        <Switch id="sound-music-on" checked={!sound.musicOff && sound.music > 0} onChange={(v) => setSound({ musicOff: !v, music: sound.music > 0 ? sound.music : 0.4 })} label={t('settings.sound.lobbyMusic')} />
      </div>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor="sound-muted" className="flex items-center gap-2 text-sm font-bold text-slate-200">
          {sound.muted ? <VolumeX className="h-4 w-4 text-neon-red" /> : <Volume2 className="h-4 w-4 text-slate-400" />} {t('settings.sound.mute')}
        </label>
        <Switch id="sound-muted" checked={sound.muted} onChange={(v) => setSound({ muted: v })} label={t('settings.sound.mute')} />
      </div>
      <p className="text-xs text-slate-500">{t('settings.sound.note')}</p>
    </div>
  )
}

function Section({ id, title, description, children }) {
  return (
    <section id={`settings-${id}`} className="glass scroll-mt-24 rounded-2xl">
      <header className="border-b hairline px-4 py-4 sm:px-6">
        <h2 className="font-display text-base font-bold text-white">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </header>
      <div className="px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </section>
  )
}

function OptionCard({ active, onClick, icon: Icon, label, hint, preview }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'relative flex flex-col gap-3 rounded-xl p-3 text-left ring-1 ring-inset transition focus-ring',
        active ? 'bg-neon-cyan/[0.07] ring-neon-cyan/50' : 'bg-white/[0.02] ring-white/[0.08] hover:ring-white/20',
      )}
    >
      {preview}
      <span className="flex items-center gap-2">
        {Icon && <Icon className={clsx('h-4 w-4', active ? 'text-neon-cyan' : 'text-slate-500')} />}
        <span className="text-sm font-bold text-white">{label}</span>
        {active && <Check className="ml-auto h-4 w-4 text-neon-cyan" />}
      </span>
      {hint && <span className="-mt-2 text-xs text-slate-500">{hint}</span>}
    </button>
  )
}

/** Mini pratinjau tema — warnanya sengaja literal, menggambarkan tema yang dipilih. */
function ThemePreview({ mode }) {
  const dark = { bg: '#06070c', card: '#141826', line: '#262c40', text: '#e2e8f0', accent: '#22e1ff' }
  const light = { bg: '#f3f5fa', card: '#ffffff', line: '#e0e4ee', text: '#1e2436', accent: '#068cb0' }
  const Pane = ({ c }) => (
    <div className="flex h-full flex-1 flex-col gap-1.5 p-2" style={{ background: c.bg }}>
      <div className="h-1.5 w-8 rounded-full" style={{ background: c.accent }} />
      <div className="flex-1 rounded-md" style={{ background: c.card, border: `1px solid ${c.line}` }}>
        <div className="m-1.5 h-1 w-10 rounded-full" style={{ background: c.text, opacity: 0.7 }} />
        <div className="mx-1.5 h-1 w-6 rounded-full" style={{ background: c.text, opacity: 0.35 }} />
      </div>
    </div>
  )
  return (
    <div className="flex h-20 overflow-hidden rounded-lg ring-1 ring-inset ring-white/10">
      {mode === 'light' ? <Pane c={light} /> : mode === 'dark' ? <Pane c={dark} /> : (<><Pane c={dark} /><Pane c={light} /></>)}
    </div>
  )
}

function ChangePassword() {
  const { t } = useT()
  const changePassword = useAuthStore((s) => s.changePassword)
  const [values, setValues] = useState({ current: '', next: '', confirm: '' })
  const [submitted, setSubmitted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const errors = {
    ...(!values.current ? { current: 'validation.passwordRequired' } : {}),
    ...(values.next ? passwordRules(values.next, 'next') : { next: 'validation.passwordRequired' }),
    ...(values.confirm !== values.next ? { confirm: 'validation.confirmMismatch' } : {}),
  }
  const show = (k) => (submitted && errors[k] ? t(errors[k]) : undefined)
  const bind = (k) => ({ value: values[k], onChange: (e) => { setValues((v) => ({ ...v, [k]: e.target.value })); setError(null) }, type: 'password', disabled: busy })

  const submit = async (e) => {
    e.preventDefault()
    setSubmitted(true)
    if (Object.keys(errors).length) return
    setBusy(true)
    try {
      await changePassword({ current: values.current, next: values.next })
      toast({ tone: 'success', title: t('settings.security.passwordChanged') })
      setValues({ current: '', next: '', confirm: '' })
      setSubmitted(false)
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Field id="pw-current" className="sm:col-span-2" label={t('settings.security.current')} icon={Lock} autoComplete="current-password" error={show('current')} {...bind('current')} />
      <Field id="pw-next" label={t('settings.security.new')} icon={KeyRound} autoComplete="new-password" error={show('next')} {...bind('next')} />
      <Field id="pw-confirm" label={t('settings.security.confirm')} icon={KeyRound} autoComplete="new-password" error={show('confirm')} {...bind('confirm')} />
      {error && <p className="rounded-xl bg-neon-red/10 px-3.5 py-3 text-sm font-semibold text-neon-red sm:col-span-2" role="alert">{t(error)}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" loading={busy}>{t('settings.security.update')}</Button>
      </div>
    </form>
  )
}

/** Email address with its verification status; sends the verification link (server mode). */
function EmailStatus({ user }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const [sentTo, setSentTo] = useState(null)
  const [wait, setWait] = useState(0)
  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(id)
  }, [wait])
  if (!SERVER_MODE || !user?.email) return null
  const verified = !!user.emailVerified
  const send = async () => {
    setBusy(true)
    try {
      const r = await sendVerificationEmail()
      setSentTo(r.email)
      setWait(r.resendIn ?? 60)
      toast({ tone: 'success', title: t('account.verify.sentToast'), body: t('account.verify.sentBody', { email: r.email }) })
    } catch (err) {
      if (err?.vars?.seconds) setWait(Number(err.vars.seconds))
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={clsx('mt-5 flex flex-col gap-3 rounded-xl p-3.5 ring-1 ring-inset sm:flex-row sm:items-center', verified ? 'bg-neon-green/[0.05] ring-neon-green/20' : 'bg-neon-gold/[0.05] ring-neon-gold/20')}>
      <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', verified ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-gold/10 text-neon-gold')}>{verified ? <MailCheck className="h-5 w-5" /> : <Mail className="h-5 w-5" />}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-white">
          <span className="truncate">{user.email}</span>
          <span className={clsx('rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider', verified ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-gold/10 text-neon-gold')}>{verified ? t('account.verify.verified') : t('account.verify.unverified')}</span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-400">{verified ? t('account.verify.verifiedHint') : sentTo ? t('account.verify.sentBody', { email: sentTo }) : t('account.verify.unverifiedHint')}</p>
      </div>
      {!verified && (
        <Button size="sm" variant={sentTo ? 'ghost' : 'gold'} loading={busy} disabled={wait > 0} onClick={send} className="shrink-0">
          {wait > 0 ? t('account.verify.resendIn', { seconds: wait }) : sentTo ? t('account.verify.resend') : t('account.verify.send')}
        </Button>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const { t } = useT()
  const navigate = useNavigate()
  const user = useCurrentUser()
  const logout = useAuthStore((s) => s.logout)
  const { language, appearance, notifications, setLanguage, setAppearance, setNotification } = usePrefsStore()
  const [confirm, setConfirm] = useState(null) // 'logout' | 'reset'

  const resetLocalData = () => {
    Object.keys(localStorage).filter((k) => k.startsWith('neon-arcade:')).forEach((k) => localStorage.removeItem(k))
    window.location.reload()
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav className="sticky top-24 space-y-0.5">
          <h1 className="mb-4 font-display text-2xl font-bold tracking-tight text-white">{t('nav.settings')}</h1>
          {SECTIONS.map(({ id, icon: Icon }) => (
            <a key={id} href={`#settings-${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`settings-${id}`)?.scrollIntoView({ behavior: 'smooth' }) }} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-slate-400 transition hover:bg-white/[0.04] hover:text-white">
              <Icon className="h-4 w-4" /> {t(`settings.${id}.title`)}
            </a>
          ))}
        </nav>
      </aside>

      <div className="min-w-0 space-y-5">
        <h1 className="font-display text-2xl font-bold tracking-tight text-white lg:hidden">{t('nav.settings')}</h1>

        <Section id="account" title={t('settings.account.title')} description={t('settings.account.description')}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar user={user} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">{user?.displayName}</p>
              <p className="truncate text-sm text-slate-500">@{user?.username} · {user?.email}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => openModal('editProfile')}><Pencil className="h-4 w-4" /> {t('settings.account.edit')}</Button>
          </div>
          <EmailStatus user={user} />
        </Section>

        <Section id="appearance" title={t('settings.appearance.title')} description={t('settings.appearance.description')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { value: 'dark', icon: Moon },
              { value: 'light', icon: Sun },
              { value: 'system', icon: Monitor },
            ].map(({ value, icon }) => (
              <OptionCard key={value} active={appearance === value} onClick={() => setAppearance(value)} icon={icon} label={t(`settings.appearance.${value}`)} preview={<ThemePreview mode={value} />} />
            ))}
          </div>
        </Section>

        <Section id="language" title={t('settings.language.title')} description={t('settings.language.description')}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <OptionCard active={language === 'id'} onClick={() => setLanguage('id')} label="Bahasa Indonesia" hint="ID" />
            <OptionCard active={language === 'en'} onClick={() => setLanguage('en')} label="English" hint="EN" />
          </div>
        </Section>

        <Section id="notifications" title={t('settings.notifications.title')} description={t('settings.notifications.description')}>
          <ul className="divide-y divide-white/[0.06]">
            {NOTIFICATION_KEYS.map((key) => (
              <li key={key} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <label htmlFor={`notif-${key}`} className="min-w-0 cursor-pointer">
                  <span className="block text-sm font-bold text-slate-200">{t(`settings.notifications.${key}`)}</span>
                  <span className="block text-xs text-slate-500">{t(`settings.notifications.${key}Hint`)}</span>
                </label>
                <Switch id={`notif-${key}`} checked={notifications[key] !== false} onChange={(v) => setNotification(key, v)} label={t(`settings.notifications.${key}`)} />
              </li>
            ))}
          </ul>
        </Section>

        <Section id="sound" title={t('settings.sound.title')} description={t('settings.sound.description')}>
          <SoundSettings />
        </Section>

        <Section id="security" title={t('settings.security.title')} description={t('settings.security.description')}>
          <ChangePassword />
          <div className="mt-6 space-y-3 border-t hairline pt-5">
            <p className="text-xs text-slate-500">{t('settings.security.lastLogin', { date: user?.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—' })}</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setConfirm('logout')}><LogOut className="h-4 w-4" /> {t('common.logout')}</Button>
              <Button variant="danger" onClick={() => setConfirm('reset')}><Trash2 className="h-4 w-4" /> {t('settings.security.reset')}</Button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">{t('settings.security.localNote')}</p>
          </div>
        </Section>
      </div>

      <ConfirmDialog
        open={confirm === 'logout'}
        onClose={() => setConfirm(null)}
        title={t('logout.title')}
        body={t('logout.body')}
        confirmLabel={t('common.logout')}
        onConfirm={async () => {
          await logout()
          navigate('/auth', { replace: true })
        }}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        onClose={() => setConfirm(null)}
        title={t('settings.security.resetTitle')}
        body={t('settings.security.resetBody')}
        confirmLabel={t('settings.security.resetConfirm')}
        onConfirm={resetLocalData}
      />
    </div>
  )
}
