import { useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Clock3, ExternalLink, Gamepad2, Hourglass, ShieldQuestion, XCircle } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Field from '@/components/ui/Field'
import { CurrencyIcon } from '@/components/ui/Currency'
import { claimMission, useCatalog, useExtras } from '@/services/platform2'
import { toast } from '@/store/useUiStore'
import { SERVER_MODE } from '@/config/runtime'
import { errorKey } from '@/utils/errors'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const STATUS = {
  none: { icon: ShieldQuestion, tone: 'text-slate-400 bg-white/[0.05]' },
  pending: { icon: Hourglass, tone: 'text-neon-gold bg-neon-gold/10' },
  approved: { icon: CheckCircle2, tone: 'text-neon-green bg-neon-green/10' },
  rejected: { icon: XCircle, tone: 'text-neon-red bg-neon-red/10' },
}

function ClaimDialog({ mission, onClose }) {
  const { t } = useT()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const valid = /^[A-Za-z0-9_]{3,20}$/.test(name.trim())
  const submit = async (e) => {
    e?.preventDefault()
    if (!valid) return setError({ code: 'missions.errors.proof' })
    setBusy(true)
    setError(null)
    try {
      await claimMission(mission.id, name)
      toast({ tone: 'success', title: t('missions.sent') })
      onClose()
    } catch (err) {
      setError({ code: errorKey(err), vars: err?.vars })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      locked={busy}
      title={t('missions.claimTitle')}
      icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-green/10 text-neon-green"><Gamepad2 className="h-5 w-5" /></span>}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button className="flex-1" loading={busy} onClick={submit}>{t('missions.submit')}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-3">
        <Field id="roblox-name" label={t('missions.robloxName')} placeholder="e.g. Builderman" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} autoComplete="off" />
        <p className="flex items-start gap-2 rounded-xl bg-white/[0.03] p-3 text-xs leading-relaxed text-slate-400 ring-1 ring-inset ring-white/[0.06]">
          <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-neon-cyan" />
          {t('missions.manualNote')}
        </p>
        {error && <p className="rounded-xl bg-neon-red/10 px-3 py-2.5 text-sm font-semibold text-neon-red" role="alert">{t(error.code, error.vars)}</p>}
      </form>
    </Modal>
  )
}

/** Reward missions (Play my games on Roblox). Verification is manual and labeled as such. */
export default function Missions() {
  const { t } = useT()
  const catalog = useCatalog()
  const { claims } = useExtras()
  const [claiming, setClaiming] = useState(null)
  if (!SERVER_MODE || !catalog.missions.length) return null
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold text-white">{t('missions.title')}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {catalog.missions.map((m) => {
          const mine = claims.filter((c) => c.missionId === m.id)
          const last = mine[0]
          const approved = mine.some((c) => c.status === 'approved')
          const status = last?.status ?? 'none'
          const S = STATUS[status]
          const canClaim = status !== 'pending' && (!approved || m.repeatable)
          return (
            <motion.article key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mission-card relative flex h-full flex-col overflow-hidden rounded-2xl p-5 ring-1 ring-inset ring-white/[0.08]">
              <span className="mission-card__art" aria-hidden="true" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-neon-green">{t('missions.roblox')}</p>
                  <h3 className="mt-1 font-display text-lg font-bold text-white">{m.title}</h3>
                  {m.gameName && <p className="text-sm font-semibold text-slate-300">{m.gameName}</p>}
                </div>
                <span className={clsx('flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold', S.tone)}><S.icon className="h-3.5 w-3.5" /> {t(`missions.status.${status}`)}</span>
              </div>
              <p className="relative mt-3 text-sm leading-relaxed text-slate-400">{m.description}</p>
              <div className="relative mt-4 flex flex-wrap gap-2">
                {m.rewardAC > 0 && <span className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs font-bold text-white"><CurrencyIcon currency="AC" size={14} /> {formatCoins(m.rewardAC)} AC</span>}
                {m.rewardAG > 0 && <span className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs font-bold text-white"><CurrencyIcon currency="AG" size={14} /> {formatCoins(m.rewardAG)} AG</span>}
                {m.rewardLXP > 0 && <span className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-xs font-bold text-neon-gold">+{formatCoins(m.rewardLXP)} {t('loyalty.xpShort')}</span>}
              </div>
              {status === 'rejected' && last?.note && <p className="relative mt-3 text-xs text-neon-red">{t('missions.rejectedNote', { note: last.note })}</p>}
              <div className="relative mt-auto flex flex-wrap gap-2 pt-5">
                {m.link && (
                  <a href={m.link} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl bg-neon-green px-4 text-sm font-bold text-onaccent transition hover:brightness-110 focus-ring">
                    {t('missions.play')} <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <Button variant="ghost" disabled={!canClaim} onClick={() => setClaiming(m)}>
                  {status === 'pending' ? <><Clock3 className="h-4 w-4" /> {t('missions.waiting')}</> : approved && !m.repeatable ? t('missions.done') : t('missions.claim')}
                </Button>
              </div>
            </motion.article>
          )
        })}
      </div>
      {claiming && <ClaimDialog mission={claiming} onClose={() => setClaiming(null)} />}
    </section>
  )
}
