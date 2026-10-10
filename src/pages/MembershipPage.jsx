import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarClock, CalendarDays, Check, Crown, Gem, Gift, Headset, Infinity as InfinityIcon, Info, MessageSquareLock, Minus, PenLine, Sparkles, Ticket } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { EmptyState, Panel } from '@/components/ui/Controls'
import { PageHeader } from '@/components/ui/PageKit'
import { claimPerk, contactManager, requestMembership, useCatalog, useExtras } from '@/services/platform2'
import { useCurrentUser } from '@/store/useAuthStore'
import { toast } from '@/store/useUiStore'
import { SERVER_MODE } from '@/config/runtime'
import { errorKey } from '@/utils/errors'
import { formatCoins, formatDate } from '@/utils/format'
import { useT } from '@/i18n'

const rupiah = (n) => `Rp${Number(n ?? 0).toLocaleString('id-ID')}`
const FALLBACK = {
  vip: { dailyAc: 25000, dailyAg: 5, weeklyAc: 150000, weeklyAg: 30, betPct: 20, convertMult: 2, shopDiscount: 10, cardFloor: 'gold', onceAc: 250000, onceAg: 50, statsDays: 30 },
  vvip: { dailyAc: 100000, dailyAg: 25, weeklyAc: 750000, weeklyAg: 150, betPct: 50, convertMult: 5, shopDiscount: 25, cardFloor: 'platinum', onceAc: 1500000, onceAg: 500, statsDays: 90, endless: true, highlight: true, affix: true, manager: true, pass: true },
}

/** Perk rows: [key, value for VIP, value for VVIP] — value false = not included, true = included, string = included with detail. */
function perkRows(t, perks, cards) {
  const vip = perks.vip ?? FALLBACK.vip
  const vvip = perks.vvip ?? FALLBACK.vvip
  const cash = (p, k) => `${formatCoins(p[`${k}Ac`])} AC + ${formatCoins(p[`${k}Ag`])} AG`
  const card = (slug) => cards.find((c) => c.slug === slug)?.name ?? slug
  return [
    ['allVip', false, true],
    ['daily', cash(vip, 'daily'), cash(vvip, 'daily')],
    ['weekly', cash(vip, 'weekly'), cash(vvip, 'weekly')],
    ['once', cash(vip, 'once'), cash(vvip, 'once')],
    ['bets', `+${vip.betPct}%`, `+${vvip.betPct}%`],
    ['card', card(vip.cardFloor), card(vvip.cardFloor)],
    ['converter', `×${vip.convertMult}`, `×${vvip.convertMult}`],
    ['discount', `${vip.shopDiscount}%`, `${vvip.shopDiscount}%`],
    ['stats', t('membership.perk.statsDays', { n: vip.statsDays }), t('membership.perk.statsDays', { n: vvip.statsDays })],
    ['room', true, true],
    ['priority', true, true],
    ['codes', 'VIP', 'VIP + VVIP'],
    ['cosmetics', true, true],
    ['endless', false, true],
    ['pass', false, true],
    ['highlight', false, true],
    ['affix', false, true],
    ['manager', false, true],
  ]
}

function Cell({ value, tone }) {
  if (value === false) return <Minus className="mx-auto h-4 w-4 text-slate-600" />
  if (value === true) return <Check className={clsx('mx-auto h-4 w-4', tone)} strokeWidth={3} />
  return <span className="num font-mono text-[11px] font-bold text-white">{value}</span>
}

function TierCard({ tier, cfg, rows, active, onGet }) {
  const { t } = useT()
  const vvip = tier === 'vvip'
  // VVIP card: "everything in VIP" + upgraded numbers + the VVIP-only perks (not a repeat of the VIP list).
  const VVIP_KEYS = ['allVip', 'daily', 'weekly', 'once', 'bets', 'card', 'discount', 'endless', 'pass', 'highlight', 'affix', 'manager']
  const list = vvip ? VVIP_KEYS.map((k) => rows.find((r) => r[0] === k)).filter(Boolean) : rows.filter((r) => r[1] !== false).slice(0, 10)
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
        {list.map(([key, vipV, vvipV]) => {
          const v = vvip ? vvipV : vipV
          return (
            <li key={key} className="flex items-start gap-2.5 text-sm text-slate-200">
              <span className={clsx('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full', vvip ? 'bg-cyan-300/15 text-cyan-200' : 'bg-violet-400/15 text-violet-200')}><Check className="h-3 w-3" strokeWidth={3} /></span>
              <span>{t(`membership.perk.${key}`)}{typeof v === 'string' && <b className="ml-1 font-semibold text-white">· {v}</b>}</span>
            </li>
          )
        })}
      </ul>
      <Button size="lg" variant={vvip ? 'primary' : 'gem'} className="mt-6 w-full" disabled={!!active} onClick={() => onGet(tier)}>
        {active === 'included' ? t('membership.includedActive') : active ? t('membership.active') : t(`membership.get${vvip ? 'Vvip' : 'Vip'}`)}
      </Button>
    </motion.article>
  )
}

/** One claimable bonus (daily / weekly / one-time / endless quest). */
function BonusTile({ icon: Icon, title, detail, claimed, disabled, onClaim, busy, progress }) {
  const { t } = useT()
  return (
    <div className="flex h-full flex-col rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06]">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-lg bg-neon-purple/10 text-neon-purple"><Icon className="h-4 w-4" /></span>
        <p className="text-sm font-bold text-white">{title}</p>
      </div>
      <p className="mt-2 flex-1 text-xs text-slate-400">{detail}</p>
      {progress && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-neon-purple" style={{ width: `${Math.min(100, (progress[0] / progress[1]) * 100)}%` }} /></div>
      )}
      <Button size="sm" className="mt-3 w-full" variant={claimed ? 'ghost' : 'gem'} disabled={claimed || disabled} loading={busy} onClick={onClaim}>
        {claimed ? t('membership.claimed') : t('membership.claim')}
      </Button>
    </div>
  )
}

function MemberPerks({ tier }) {
  const { t } = useT()
  const user = useCurrentUser()
  const { perks } = useExtras()
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState('')
  const p = perks?.perks ?? FALLBACK[tier]
  const run = async (key, fn, ok) => {
    setBusy(key)
    try {
      const r = await fn()
      toast({ tone: 'success', title: ok(r) })
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    } finally {
      setBusy(null)
    }
  }
  const got = (r) => t('membership.got', { ac: formatCoins(r?.ac ?? 0), ag: formatCoins(r?.ag ?? 0) })
  const endless = perks?.endless
  return (
    <Panel title={t('membership.yourPerks', { tier: tier.toUpperCase() })} icon={Sparkles} bodyClassName="space-y-5 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BonusTile icon={CalendarDays} title={t('membership.perk.daily')} detail={`${formatCoins(p.dailyAc)} AC + ${formatCoins(p.dailyAg)} AG`} claimed={perks?.daily?.claimed} busy={busy === 'd'} onClaim={() => run('d', () => claimPerk('member_daily'), got)} />
        <BonusTile icon={CalendarClock} title={t('membership.perk.weekly')} detail={`${formatCoins(p.weeklyAc)} AC + ${formatCoins(p.weeklyAg)} AG`} claimed={perks?.weekly?.claimed} busy={busy === 'w'} onClaim={() => run('w', () => claimPerk('member_weekly'), got)} />
        <BonusTile icon={Gift} title={t('membership.perk.once')} detail={`${formatCoins(p.onceAc)} AC + ${formatCoins(p.onceAg)} AG`} claimed={perks?.once?.claimed} busy={busy === 'o'} onClaim={() => run('o', () => claimPerk('member_once'), got)} />
        {endless ? (
          <BonusTile
            icon={InfinityIcon}
            title={t('membership.perk.endless')}
            detail={endless.started ? t('membership.endlessDetail', { done: Math.min(endless.progress, endless.need), need: endless.need, ac: formatCoins(endless.rewardAc), lxp: endless.rewardLxp }) : t('membership.endlessStart', { need: endless.need })}
            progress={endless.started ? [Math.min(endless.progress, endless.need), endless.need] : null}
            disabled={endless.started && endless.progress < endless.need}
            busy={busy === 'e'}
            onClaim={() => run('e', () => claimPerk('endless'), (r) => (r?.started ? t('membership.endlessStarted') : got(r)))}
          />
        ) : (
          <div className="flex flex-col justify-center rounded-xl border border-dashed border-white/10 p-4 text-xs text-slate-500">{t('membership.vvipOnly', { perk: t('membership.perk.endless') })}</div>
        )}
      </div>

      {tier === 'vvip' && perks?.vipIncluded && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-300"><Crown className="h-3.5 w-3.5" /> {t('membership.vipIncluded')}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['vd', 'member_daily', CalendarDays, t('membership.perk.daily'), 'daily'],
              ['vw', 'member_weekly', CalendarClock, t('membership.perk.weekly'), 'weekly'],
              ['vo', 'member_once', Gift, t('membership.perk.once'), 'once'],
            ].map(([key, kind, Icon, title, k]) => {
              const vp = perks.vipIncluded.perks
              return (
                <BonusTile key={key} icon={Icon} title={`VIP · ${title}`} detail={`${formatCoins(vp[`${k}Ac`])} AC + ${formatCoins(vp[`${k}Ag`])} AG`} claimed={perks.vipIncluded[k]?.claimed} busy={busy === key} onClaim={() => run(key, () => claimPerk(kind, 'vip'), got)} />
              )
            })}
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <Link to="/chat?room=vip" className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.05]">
          <MessageSquareLock className="h-5 w-5 shrink-0 text-violet-300" />
          <span className="min-w-0"><b className="block text-sm text-white">{t('membership.perk.room')}</b><span className="text-xs text-slate-400">{t('membership.roomHint')}</span></span>
        </Link>
        <Link to="/support" className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.05]">
          <Headset className="h-5 w-5 shrink-0 text-violet-300" />
          <span className="min-w-0"><b className="block text-sm text-white">{t('membership.perk.priority')}</b><span className="text-xs text-slate-400">{t('membership.priorityHint')}</span></span>
        </Link>
        <Link to="/redeem" className="flex items-center gap-3 rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.05]">
          <Ticket className="h-5 w-5 shrink-0 text-violet-300" />
          <span className="min-w-0"><b className="block text-sm text-white">{t('membership.perk.codes')}</b><span className="text-xs text-slate-400">{t('membership.codesHint')}</span></span>
        </Link>
      </div>

      {tier === 'vvip' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06]">
            <p className="flex items-center gap-2 text-sm font-bold text-white"><PenLine className="h-4 w-4 text-cyan-200" /> {t('membership.perk.affix')}</p>
            <p className="mt-1 text-xs text-slate-400">{t('membership.affixHint')}</p>
            <Link to="/settings" className="mt-3 inline-flex h-9 items-center rounded-xl bg-white/[0.06] px-3 text-sm font-bold text-white hover:bg-white/[0.1]">{t('membership.affixInSettings')}</Link>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06]">
            <p className="flex items-center gap-2 text-sm font-bold text-white"><Headset className="h-4 w-4 text-cyan-200" /> {t('membership.perk.manager')}</p>
            {perks?.manager ? (
              <>
                <p className="mt-1 text-xs text-slate-400">{t('membership.managerIs', { name: perks.manager.displayName ?? perks.manager.username })}</p>
                <div className="mt-3 flex gap-2">
                  <input aria-label={t('membership.managerMessage')} placeholder={t('membership.managerMessage')} value={msg} onChange={(e) => setMsg(e.target.value)} className="input-shell h-10 min-w-0 flex-1 px-3 text-sm text-white outline-none" />
                  <Button size="sm" disabled={msg.trim().length < 10} loading={busy === 'm'} onClick={() => run('m', () => contactManager(msg), () => (setMsg(''), t('membership.managerSent')))}>{t('membership.send')}</Button>
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-slate-400">{t('membership.managerSoon')}</p>
            )}
          </div>
        </div>
      )}
    </Panel>
  )
}

export default function MembershipPage() {
  const { t } = useT()
  const catalog = useCatalog()
  const { membership } = useExtras()
  const [asking, setAsking] = useState(null)
  const [busy, setBusy] = useState(false)
  const cfg = catalog.memberships ?? {}
  const rows = perkRows(t, catalog.memberPerks ?? {}, catalog.cards ?? [])

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

      {membership && <MemberPerks tier={membership.tier} />}

      <div className="grid gap-5 md:grid-cols-2">
        <TierCard tier="vip" cfg={cfg.vip} rows={rows} active={membership?.tier === 'vip' ? true : membership?.tier === 'vvip' ? 'included' : false} onGet={setAsking} />
        <TierCard tier="vvip" cfg={cfg.vvip} rows={rows} active={membership?.tier === 'vvip'} onGet={setAsking} />
      </div>

      <Panel title={t('membership.compare')} icon={Sparkles} bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[460px] text-sm">
          <thead>
            <tr className="border-b hairline text-left text-xs text-slate-500">
              <th className="px-5 py-3 font-semibold">{t('membership.feature')}</th>
              <th className="w-36 px-3 py-3 text-center font-extrabold text-violet-300">VIP</th>
              <th className="w-36 px-3 py-3 text-center font-extrabold text-cyan-200">VVIP</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {rows.map(([key, vip, vvip]) => (
              <tr key={key}>
                <td className="px-5 py-2.5 text-slate-300">{t(`membership.perk.${key}`)}</td>
                <td className="px-3 py-2.5 text-center"><Cell value={vip} tone="text-violet-300" /></td>
                <td className="px-3 py-2.5 text-center"><Cell value={vvip} tone="text-cyan-200" /></td>
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
