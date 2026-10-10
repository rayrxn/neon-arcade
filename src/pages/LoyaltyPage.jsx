import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, BadgeCheck, CalendarRange, Check, Crown, ChevronRight, Gauge, Gift, Lock, Sparkles, TrendingUp, WalletCards } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { EmptyState, Panel } from '@/components/ui/Controls'
import { PageHeader } from '@/components/ui/PageKit'
import { CurrencyIcon } from '@/components/ui/Currency'
import LoyaltyCard from '@/components/loyalty/LoyaltyCard'
import { cardOf, claimPerk, unlockLoyaltyCard, useCatalog, useExtras } from '@/services/platform2'
import { useCurrentUser } from '@/store/useAuthStore'
import { useDisplayBalance } from '@/store/useWalletStore'
import { toast } from '@/store/useUiStore'
import { SERVER_MODE } from '@/config/runtime'
import { errorKey } from '@/utils/errors'
import { formatCoins, timeAgo } from '@/utils/format'
import { useT } from '@/i18n'

/** Only the first card (Silver) can be bought; the server refuses every later card. */
function UnlockDialog({ next, onClose }) {
  const { t } = useT()
  const ac = useDisplayBalance('AC')
  const ag = useDisplayBalance('AG')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const missAc = Math.max(0, next.unlockAC - ac)
  const missAg = Math.max(0, next.unlockAG - ag)
  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await unlockLoyaltyCard()
      toast({ tone: 'success', title: t('loyalty.unlocked', { card: next.name }) })
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
      title={t('loyalty.unlockTitle', { card: next.name })}
      icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-gold/10 text-neon-gold"><WalletCards className="h-5 w-5" /></span>}
      footer={
        <>
          <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
          <Button variant="gold" className="flex-1" loading={busy} disabled={missAc > 0 || missAg > 0} onClick={confirm}>{t('loyalty.unlockConfirm')}</Button>
        </>
      }
    >
      <div className="mx-auto max-w-[260px]"><LoyaltyCard card={next} /></div>
      <dl className="mt-4 space-y-2 rounded-xl bg-white/[0.03] p-3 text-sm ring-1 ring-inset ring-white/[0.06]">
        {[['AC', next.unlockAC, ac, missAc], ['AG', next.unlockAG, ag, missAg]].map(([cur, cost, have, miss]) => (
          <div key={cur} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-1.5 text-slate-400"><CurrencyIcon currency={cur} size={14} /> {t('loyalty.cost')}</dt>
            <dd className="text-right">
              <span className="num font-mono font-bold text-white">{formatCoins(cost)} {cur}</span>
              <span className={clsx('block text-[11px]', miss > 0 ? 'text-neon-red' : 'text-slate-500')}>{miss > 0 ? t('loyalty.missing', { amount: formatCoins(miss), currency: cur }) : t('loyalty.youHave', { amount: formatCoins(have), currency: cur })}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{t('loyalty.unlockNote')}</p>
      {error && <p className="mt-3 rounded-xl bg-neon-red/10 px-3 py-2.5 text-sm font-semibold text-neon-red" role="alert">{t(error.code, error.vars)}</p>}
    </Modal>
  )
}

function Benefit({ children }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-slate-300">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-neon-green/10 text-neon-green"><Check className="h-3 w-3" strokeWidth={3} /></span>
      <span>{children}</span>
    </li>
  )
}

export default function LoyaltyPage() {
  const { t } = useT()
  const user = useCurrentUser()
  const catalog = useCatalog()
  const { loyalty, perks } = useExtras()
  const [inspect, setInspect] = useState(null)
  const [claiming, setClaiming] = useState(null)
  const [unlocking, setUnlocking] = useState(false)
  const bonus = perks?.card
  const claim = async (kind) => {
    setClaiming(kind)
    try {
      const r = await claimPerk(kind)
      if (kind === 'card_once') {
        const list = (r.memberships ?? []).map((m) => t('loyalty.onceGot', { card: m.name, tier: m.tier.toUpperCase(), days: m.days })).join(' · ')
        toast({ tone: 'success', title: t('loyalty.onceTitle'), body: list })
      } else {
        toast({ tone: 'success', title: t('loyalty.bonusGot', { ac: formatCoins(r.ac), ag: formatCoins(r.ag) }) })
      }
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    } finally {
      setClaiming(null)
    }
  }

  const current = cardOf(catalog, loyalty.card)
  const next = catalog.cards.find((c) => c.rank === current.rank + 1) ?? null
  const prevXp = current.slug === 'none' ? 0 : current.xpRequired
  const pct = next ? Math.min(100, Math.max(0, ((loyalty.xp - prevXp) / Math.max(1, next.xpRequired - prevXp)) * 100)) : 100
  const shown = inspect ? cardOf(catalog, inspect) : current

  if (!SERVER_MODE) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('loyalty.title')} subtitle={t('loyalty.subtitle')} icon={WalletCards} />
        <div className="glass rounded-2xl"><EmptyState icon={WalletCards} title={t('shop.liveOnly')} body={t('shop.liveOnlyBody')} /></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('loyalty.title')} subtitle={t('loyalty.subtitle')} icon={WalletCards} />

      <section className="glass grid gap-6 overflow-hidden rounded-2xl p-5 sm:p-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:items-center">
        <motion.div initial={{ opacity: 0, rotateX: 12, y: 12 }} animate={{ opacity: 1, rotateX: 0, y: 0 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mx-auto w-full max-w-[340px] [perspective:900px]">
          <LoyaltyCard card={current} holder={user?.username} />
        </motion.div>
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">{t('loyalty.yourLoyalty')}</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-white">{current.slug === 'none' ? t('loyalty.noCard') : t('loyalty.cardName', { card: current.name })}</h2>
          <div className="mt-4">
            <div className="flex items-end justify-between gap-3 text-sm">
              <span className="font-semibold text-slate-300">{t('loyalty.xp')}</span>
              <span className="num font-mono font-bold text-white">{formatCoins(loyalty.xp)}{next && <span className="text-slate-500"> / {formatCoins(next.xpRequired)}</span>}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
              <motion.div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${current.color}, ${next?.color ?? current.color})` }} initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }} />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              {next ? (
                <>
                  <span>{t('loyalty.next')}: <b className="text-slate-200">{next.name}</b></span>
                  <span>{t('loyalty.remaining', { xp: formatCoins(Math.max(0, next.xpRequired - loyalty.xp)) })}</span>
                </>
              ) : (
                <span className="text-neon-gold">{t('loyalty.maxed')}</span>
              )}
            </div>
            {next && next.rank === 1 && next.unlockAC !== null && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl bg-neon-gold/[0.06] px-3 py-2.5 ring-1 ring-inset ring-neon-gold/20">
                <p className="min-w-0 flex-1 text-xs text-slate-300">{t('loyalty.orBuy', { card: next.name, ac: formatCoins(next.unlockAC), ag: formatCoins(next.unlockAG) })}</p>
                <Button size="sm" variant="gold" onClick={() => setUnlocking(true)}>{t('loyalty.unlockShort', { card: next.name })} <ArrowRight className="h-3.5 w-3.5" /></Button>
              </div>
            )}
          </div>
          {bonus?.onceDue?.length > 0 && (
            <div className="loyalty-once mt-4 flex flex-wrap items-center gap-3 rounded-xl px-3.5 py-3">
              <Crown className="h-5 w-5 shrink-0 text-neon-gold" />
              <p className="min-w-0 flex-1 text-xs text-slate-200">
                <b className="block text-sm text-white">{t('loyalty.onceReady')}</b>
                {bonus.onceDue.map((d) => t('loyalty.onceItem', { card: d.name, tier: d.tier.toUpperCase(), days: d.days })).join(' · ')}
              </p>
              <Button size="sm" variant="gold" loading={claiming === 'card_once'} onClick={() => claim('card_once')}>{t('loyalty.onceClaim')}</Button>
            </div>
          )}
          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="col-span-2 rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.06] lg:col-span-1">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500"><Gauge className="h-3.5 w-3.5" /> {t('loyalty.maxBet')}</p>
              <p className="num mt-1 font-mono text-sm font-bold text-white">{formatCoins(loyalty.maxBetAC ?? current.maxBetAC)} AC</p>
              <p className="num font-mono text-sm font-bold text-neon-purple">{formatCoins(loyalty.maxBetAG ?? current.maxBetAG)} AG</p>
              {bonus?.xpPct > 0 && <p className="mt-1.5 text-[11px] font-semibold text-neon-cyan">{t('loyalty.xpBonus', { xp: bonus.xpPct, lxp: bonus.lxpPct })}</p>}
            </div>
            {[
              ['card_daily', t('loyalty.dailyBonus'), bonus?.dailyAc, bonus?.dailyAg, bonus?.claimed, t('loyalty.bonusClaimed')],
              ['card_weekly', t('loyalty.weeklyBonus'), bonus?.weeklyAc, bonus?.weeklyAg, bonus?.weeklyClaimed, t('loyalty.weeklyClaimed')],
              ['card_monthly', t('loyalty.monthlyBonus'), bonus?.monthlyAc, bonus?.monthlyAg, bonus?.monthlyClaimed, t('loyalty.monthlyClaimed')],
            ].map(([kind, label, ac, ag, claimed, claimedLabel]) => (
              <div key={kind} className="flex flex-col justify-between rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.06]">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">{kind === 'card_daily' ? <Gift className="h-3.5 w-3.5" /> : <CalendarRange className="h-3.5 w-3.5" />} {label}</p>
                {ac > 0 || ag > 0 ? (
                  <>
                    <p className="num mt-1 font-mono text-xs font-bold text-white">{formatCoins(ac)} AC{ag > 0 && <span className="text-neon-purple"> + {formatCoins(ag)} AG</span>}</p>
                    <Button size="sm" variant={claimed ? 'ghost' : 'gold'} className="mt-2 w-full" disabled={claimed} loading={claiming === kind} onClick={() => claim(kind)}>{claimed ? claimedLabel : t('loyalty.bonusClaim')}</Button>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">{t('loyalty.bonusFromSilver')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title={t('loyalty.yourBenefits')} icon={BadgeCheck}>
          <ul className="space-y-2.5 p-5">{current.benefits.map((b) => <Benefit key={b}>{b}</Benefit>)}</ul>
        </Panel>
        <Panel title={t('loyalty.howToEarn')} icon={Sparkles}>
          <ul className="space-y-2.5 p-5 text-sm text-slate-300">
            <Benefit>{t('loyalty.earn.games')}</Benefit>
            <Benefit>{t('loyalty.earn.daily')}</Benefit>
            <Benefit>{t('loyalty.earn.quests')}</Benefit>
            <Benefit>{t('loyalty.earn.missions')}</Benefit>
          </ul>
          <p className="border-t hairline px-5 py-3 text-xs text-slate-500">{t('loyalty.earn.cap')}</p>
        </Panel>
      </div>

      <Panel title={t('loyalty.allCards')} icon={WalletCards}>
        <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <ol className="space-y-2">
            {catalog.cards.map((c, i) => {
              const reached = c.rank <= current.rank
              return (
                <li key={c.slug}>
                  <button type="button" onClick={() => setInspect(c.slug)} className={clsx('flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition', shown.slug === c.slug ? 'bg-white/[0.07] ring-1 ring-inset ring-white/10' : 'hover:bg-white/[0.04]')} aria-pressed={shown.slug === c.slug}>
                    <span className="w-16 shrink-0"><LoyaltyCard card={c} size="sm" dim={!reached} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-bold text-white">{c.name} {c.slug === current.slug && <span className="rounded-md bg-neon-cyan/10 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-neon-cyan">{t('loyalty.current')}</span>}</span>
                      <span className="block text-xs text-slate-500">{c.slug === 'none' ? t('loyalty.startingTier') : t('loyalty.requirement', { xp: formatCoins(c.xpRequired) })}</span>
                    </span>
                    {reached ? <Check className="h-4 w-4 text-neon-green" /> : <Lock className="h-4 w-4 text-slate-600" />}
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                  </button>
                  {i < catalog.cards.length - 1 && <span className="ml-[2.4rem] block h-2 w-px bg-white/10" aria-hidden="true" />}
                </li>
              )
            })}
          </ol>
          <div className="lg:sticky lg:top-24 lg:self-start">
            <LoyaltyCard card={shown} holder={user?.username} dim={shown.rank > current.rank} />
            <h3 className="mt-4 font-display text-lg font-bold text-white">{shown.name}</h3>
            <p className="text-xs text-slate-500">{shown.slug === 'none' ? t('loyalty.startingTier') : t('loyalty.requirementXp', { xp: formatCoins(shown.xpRequired) })}{shown.rank === 1 && shown.unlockAC !== null && <> · {t('loyalty.orBuyShort', { ac: formatCoins(shown.unlockAC), ag: formatCoins(shown.unlockAG) })}</>}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <span className="rounded-lg bg-white/[0.04] px-2.5 py-2"><b className="num block font-mono text-sm text-white">{formatCoins(shown.maxBetAC)}</b> {t('loyalty.maxAc')}</span>
              <span className="rounded-lg bg-white/[0.04] px-2.5 py-2"><b className="num block font-mono text-sm text-neon-purple">{formatCoins(shown.maxBetAG)}</b> {t('loyalty.maxAg')}</span>
            </div>
            <ul className="mt-4 space-y-2">{shown.benefits.map((b) => <Benefit key={b}>{b}</Benefit>)}</ul>
          </div>
        </div>
      </Panel>

      {loyalty.log?.length > 0 && (
        <Panel title={t('loyalty.recent')} icon={TrendingUp}>
          <ul className="divide-y divide-white/[0.05]">
            {loyalty.log.slice(0, 12).map((l, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="text-slate-300">{t(`loyalty.sources.${l.source}`)}</span>
                <span className="flex items-center gap-3"><span className={clsx('num font-mono font-bold', l.amount >= 0 ? 'text-neon-green' : 'text-neon-red')}>{l.amount >= 0 ? '+' : ''}{formatCoins(l.amount)} XP</span><span className="w-16 text-right text-xs text-slate-500">{timeAgo(l.at)}</span></span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {unlocking && next && <UnlockDialog next={next} onClose={() => setUnlocking(false)} />}
    </div>
  )
}
