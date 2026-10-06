import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Crown, Gem, Info, Minus, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { EmptyState, Panel } from '@/components/ui/Controls'
import { PageHeader } from '@/components/ui/PageKit'
import { requestMembership, useCatalog, useExtras } from '@/services/platform2'
import { toast } from '@/store/useUiStore'
import { SERVER_MODE } from '@/config/runtime'
import { errorKey } from '@/utils/errors'
import { formatDate } from '@/utils/format'
import { useT } from '@/i18n'

const rupiah = (n) => `Rp${Number(n ?? 0).toLocaleString('id-ID')}`

const COMPARE = [
  ['badge', true, true],
  ['theme', true, true],
  ['emotes', true, true],
  ['vvipEmotes', false, true],
  ['chatEffect', true, true],
  ['nameEffect', true, true],
  ['decoration', true, true],
  ['profileEffects', false, true],
  ['music', true, true],
  ['animations', false, true],
]

function TierCard({ tier, cfg, active, onGet }) {
  const { t } = useT()
  const vvip = tier === 'vvip'
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: vvip ? 0.08 : 0 }}
      className={clsx('relative flex h-full flex-col overflow-hidden rounded-2xl p-6 ring-1 ring-inset', vvip ? 'member-card--vvip ring-cyan-300/30' : 'member-card--vip ring-violet-400/30')}
    >
      <span className="member-card__glow" aria-hidden="true" />
      <div className="flex items-center justify-between">
        <span className={clsx('grid h-11 w-11 place-items-center rounded-xl', vvip ? 'bg-cyan-300/15 text-cyan-200' : 'bg-violet-400/15 text-violet-200')}>{vvip ? <Gem className="h-5 w-5" /> : <Crown className="h-5 w-5" />}</span>
        {vvip && <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white">{t('membership.best')}</span>}
      </div>
      <h2 className={clsx('mt-5 font-display text-3xl font-extrabold tracking-tight', vvip ? 'member-title--vvip' : 'member-title--vip')}>{vvip ? 'VVIP' : 'VIP'}</h2>
      <p className="mt-1 text-sm text-slate-300">{t(`membership.${tier}Tagline`)}</p>
      <p className="mt-5 flex items-baseline gap-1.5">
        <span className="num font-mono text-3xl font-bold text-white">{rupiah(cfg?.price)}</span>
        <span className="text-sm text-slate-400">/ {t('membership.days', { n: cfg?.days ?? 30 })}</span>
      </p>
      <ul className="mt-5 flex-1 space-y-2.5">
        {(cfg?.benefits ?? []).map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm text-slate-200">
            <span className={clsx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', vvip ? 'bg-cyan-300/15 text-cyan-200' : 'bg-violet-400/15 text-violet-200')}><Check className="h-3 w-3" strokeWidth={3} /></span>
            {b}
          </li>
        ))}
      </ul>
      <Button size="lg" variant={vvip ? 'primary' : 'gem'} className="mt-6 w-full" disabled={!!active} onClick={() => onGet(tier)}>
        {active ? t('membership.active') : t(`membership.get${vvip ? 'Vvip' : 'Vip'}`)}
      </Button>
    </motion.article>
  )
}

export default function MembershipPage() {
  const { t } = useT()
  const catalog = useCatalog()
  const { membership } = useExtras()
  const [asking, setAsking] = useState(null)
  const [busy, setBusy] = useState(false)
  const cfg = catalog.memberships ?? {}

  const send = async () => {
    setBusy(true)
    try {
      const res = await requestMembership(asking)
      toast({ tone: 'success', title: t('membership.requested', { id: res.id }) })
      setAsking(null)
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    } finally {
      setBusy(false)
    }
  }

  if (!SERVER_MODE) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('membership.title')} subtitle={t('membership.subtitle')} icon={Crown} />
        <div className="glass rounded-2xl"><EmptyState icon={Crown} title={t('shop.liveOnly')} body={t('shop.liveOnlyBody')} /></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('membership.title')} subtitle={t('membership.subtitle')} icon={Crown} />

      {membership && (
        <div className="flex items-center gap-3 rounded-2xl bg-neon-purple/[0.08] px-4 py-3 ring-1 ring-inset ring-neon-purple/25">
          <Sparkles className="h-5 w-5 shrink-0 text-neon-purple" />
          <p className="text-sm text-slate-200">{t('membership.current', { tier: membership.tier.toUpperCase(), date: membership.endsAt ? formatDate(membership.endsAt) : '—' })} <Link to="/inventory" className="font-bold text-white underline">{t('membership.useCosmetics')}</Link></p>
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <TierCard tier="vip" cfg={cfg.vip} active={membership?.tier === 'vip'} onGet={setAsking} />
        <TierCard tier="vvip" cfg={cfg.vvip} active={membership?.tier === 'vvip'} onGet={setAsking} />
      </div>

      <Panel title={t('membership.compare')} icon={Sparkles} bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b hairline text-left text-xs text-slate-500">
              <th className="px-5 py-3 font-semibold">{t('membership.feature')}</th>
              <th className="w-24 px-3 py-3 text-center font-extrabold text-violet-300">VIP</th>
              <th className="w-24 px-3 py-3 text-center font-extrabold text-cyan-200">VVIP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {COMPARE.map(([key, vip, vvip]) => (
              <tr key={key}>
                <td className="px-5 py-2.5 text-slate-300">{t(`membership.features.${key}`)}</td>
                {[vip, vvip].map((on, i) => (
                  <td key={i} className="px-3 py-2.5 text-center">{on ? <Check className={clsx('mx-auto h-4 w-4', i ? 'text-cyan-200' : 'text-violet-300')} strokeWidth={3} /> : <Minus className="mx-auto h-4 w-4 text-slate-600" />}</td>
                ))}
              </tr>
            ))}
            <tr>
              <td className="px-5 py-2.5 text-slate-300">{t('membership.features.price')}</td>
              <td className="num px-3 py-2.5 text-center font-mono text-xs text-white">{rupiah(cfg.vip?.price)}</td>
              <td className="num px-3 py-2.5 text-center font-mono text-xs text-white">{rupiah(cfg.vvip?.price)}</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500"><Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('membership.fairNote')}</p>

      {asking && (
        <Modal
          open
          onClose={() => setAsking(null)}
          locked={busy}
          title={t('membership.requestTitle', { tier: asking.toUpperCase() })}
          icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-purple/10 text-neon-purple"><Crown className="h-5 w-5" /></span>}
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setAsking(null)} disabled={busy}>{t('common.cancel')}</Button>
              <Button variant="gem" className="flex-1" loading={busy} onClick={send}>{t('membership.sendRequest')}</Button>
            </>
          }
        >
          <p className="text-sm leading-relaxed text-slate-300">{t('membership.requestBody', { tier: asking.toUpperCase(), price: rupiah(cfg[asking]?.price) })}</p>
        </Modal>
      )}
    </div>
  )
}
