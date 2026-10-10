import { useState } from 'react'
import Button from '@/components/ui/Button'
import ReasonDialog from '@/components/admin/ReasonDialog'
import { Badge, Card, FormField, inputCls } from '@/components/admin/AdminKit'
import { adminCall } from '@/services/server'
import { useNow } from '@/hooks/useNow'
import { formatCountdown } from '@/utils/format'
import { useT } from '@/i18n'

/** Jam Gacor: extra payout on wins for everyone or one player. The game RNG is not changed. */
export function LuckCard({ luck, me }) {
  const { t } = useT()
  const now = useNow(1000)
  const [f, setF] = useState({ mult: '2', minutes: '60', username: '', label: '' })
  const [pending, setPending] = useState(null)
  const g = luck?.global && luck.global.until > now ? luck.global : null
  const field = (k, mode = 'decimal') => (
    <input inputMode={mode} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className={inputCls} />
  )
  return (
    <Card title={t('admin.luck.title')} bodyClassName="space-y-4 p-4">
      <p className="text-xs text-slate-500">{t('admin.luck.desc', { max: luck?.maxMult ?? 5 })}</p>
      <div className="flex flex-wrap items-center gap-2">
        {g ? (
          <>
            <Badge tone="green">{t('admin.luck.live', { mult: g.mult, left: formatCountdown(g.until - now) })}</Badge>
            <Button size="sm" variant="ghost" onClick={() => setPending({ name: 'clearLuck', args: {} })}>{t('admin.luck.stop')}</Button>
          </>
        ) : (
          <Badge tone="slate">{t('admin.luck.off')}</Badge>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-5">
        <FormField label={t('admin.luck.mult')}>{field('mult')}</FormField>
        <FormField label={t('admin.luck.minutes')}>{field('minutes', 'numeric')}</FormField>
        <FormField label={t('admin.luck.player')}><input value={f.username} placeholder={t('admin.luck.playerHint')} onChange={(e) => setF({ ...f, username: e.target.value })} className={inputCls} /></FormField>
        <FormField label={t('admin.luck.label')}>{field('label', 'text')}</FormField>
        <div className="flex items-end">
          <Button className="w-full" onClick={() => setPending({ name: 'setLuck', args: { mult: Number(f.mult), minutes: Number(f.minutes), username: f.username.trim() || undefined, label: f.label.trim() || undefined } })}>{t('admin.luck.start')}</Button>
        </div>
      </div>
      {luck?.users?.length > 0 && (
        <ul className="space-y-1.5 text-xs">
          {luck.users.map((u) => (
            <li key={u.userId} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2">
              <span className="text-slate-200">@{u.username} · ×{u.mult} · {formatCountdown(u.until - now)}</span>
              <Button size="sm" variant="ghost" onClick={() => setPending({ name: 'clearLuck', args: { userId: u.userId } })}>{t('admin.luck.stop')}</Button>
            </li>
          ))}
        </ul>
      )}
      {pending && (
        <ReasonDialog open onClose={() => setPending(null)} adminName={me.username} tone="primary" title={t('admin.luck.title')}
          onConfirm={(r) => adminCall(pending.name, { ...pending.args, reason: r })} />
      )}
    </Card>
  )
}

/** Anti-bot check on login / sign-up / password reset: built-in proof-of-work or Cloudflare Turnstile. */
export function CaptchaCard({ captcha, me }) {
  const { t } = useT()
  const [f, setF] = useState({ mode: captcha?.setting ?? 'config', siteKey: captcha?.siteKey ?? '', secret: '' })
  const [pending, setPending] = useState(false)
  return (
    <Card title={t('admin.captcha.title')} bodyClassName="space-y-4 p-4">
      <p className="text-xs text-slate-500">{t('admin.captcha.desc')}</p>
      <Badge tone={captcha?.mode === 'turnstile' ? 'green' : captcha?.mode === 'off' ? 'red' : 'purple'}>{t('admin.captcha.now', { mode: captcha?.mode ?? '—' })}</Badge>
      <div className="grid gap-3 sm:grid-cols-4">
        <FormField label={t('admin.captcha.mode')}>
          <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} className={inputCls}>
            {['config', 'pow', 'turnstile'].map((m) => <option key={m} value={m}>{t(`admin.captcha.modes.${m}`)}</option>)}
          </select>
        </FormField>
        <FormField label={t('admin.captcha.site')}><input value={f.siteKey} onChange={(e) => setF({ ...f, siteKey: e.target.value })} className={inputCls} /></FormField>
        <FormField label={t('admin.captcha.secret')} hint={captcha?.hasSecret ? t('admin.captcha.secretSet') : null}>
          <input type="password" autoComplete="off" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} className={inputCls} />
        </FormField>
        <div className="flex items-end"><Button className="w-full" onClick={() => setPending(true)}>{t('common.save')}</Button></div>
      </div>
      {pending && (
        <ReasonDialog open onClose={() => setPending(false)} adminName={me.username} tone="primary" title={t('admin.captcha.title')}
          onConfirm={(r) => adminCall('setCaptcha', { mode: f.mode, siteKey: f.siteKey.trim(), secret: f.secret, reason: r })} />
      )}
    </Card>
  )
}
