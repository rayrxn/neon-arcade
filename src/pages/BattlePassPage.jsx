import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Crown, Flame, Gift, Lock, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/Controls'
import { PageHeader } from '@/components/ui/PageKit'
import { CurrencyIcon } from '@/components/ui/Currency'
import { buyPass, claimPass, itemOf, useCatalog, useExtras } from '@/services/platform2'
import { useDisplayBalance } from '@/store/useWalletStore'
import { toast } from '@/store/useUiStore'
import { useNow } from '@/hooks/useNow'
import { SERVER_MODE } from '@/config/runtime'
import { errorKey } from '@/utils/errors'
import { formatCoins, formatLeft } from '@/utils/format'
import { useT } from '@/i18n'

/** A reward chip: AC / AG amount, Loyalty XP, a membership or a shop item. */
export function RewardChip({ r, catalog, dim }) {
  if (r.kind === 'membership') {
    return (
      <span className={clsx('pass-chip-member flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide', r.tier === 'vvip' ? 'pass-chip-member--vvip' : 'pass-chip-member--vip', dim && 'opacity-60')}>
        <Crown className="h-3 w-3" /> {r.tier} · {r.days}d
      </span>
    )
  }
  if (r.kind === 'item') {
    const item = itemOf(catalog, r.id)
    return (
      <span className={clsx('flex items-center gap-1 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[11px] font-bold text-slate-200', dim && 'opacity-60')} title={item?.name ?? r.id}>
        <span aria-hidden="true">{item?.style?.glyph ?? '🎁'}</span> <span className="max-w-[72px] truncate">{item?.name ?? r.id}</span>
      </span>
    )
  }
  if (r.kind === 'LXP') {
    return <span className={clsx('num flex items-center gap-1 font-mono text-[11px] font-bold text-violet-300', dim && 'opacity-60')}>✦ {formatCoins(r.amount)} LXP</span>
  }
  return (
    <span className={clsx('num flex items-center gap-1 font-mono text-[11px] font-bold', r.kind === 'AG' ? 'text-neon-purple' : 'text-neon-gold', dim && 'opacity-60')}>
      <CurrencyIcon currency={r.kind} size={12} /> {formatCoins(r.amount)}
    </span>
  )
}

/** Milestone = a membership or a pass-exclusive cosmetic. */
const isMilestone = (list) => list.some((r) => r.kind === 'membership' || (r.kind === 'item' && r.id.startsWith('pass-')))

/** Showcase of the best rewards in the season, so players see what they're climbing for. */
function PassHighlights({ def, pass, catalog, onJump }) {
  const { t } = useT()
  const picks = []
  for (const row of def.rewards) {
    for (const track of ['free', 'premium']) {
      for (const r of row[track]) {
        if (r.kind === 'membership' || (r.kind === 'item' && r.id.startsWith('pass-'))) picks.push({ tier: row.tier, track, r })
      }
    }
  }
  picks.sort((a, b) => (b.r.kind === 'membership') - (a.r.kind === 'membership') || b.tier - a.tier)
  return (
    <section className="glass rounded-2xl p-4 sm:p-5">
      <p className="flex items-center gap-2 text-sm font-bold text-white"><Sparkles className="h-4 w-4 text-amber-300" /> {t('pass.highlights')}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {picks.slice(0, 10).map(({ tier, track, r }) => {
          const item = r.kind === 'item' ? itemOf(catalog, r.id) : null
          const got = pass.claimed[track].includes(tier)
          const ready = !got && pass.tier >= tier && (track === 'free' || pass.premium)
          return (
            <button key={`${track}-${tier}-${r.id ?? r.tier}`} type="button" onClick={() => onJump(tier)} className={clsx('pass-pick relative flex flex-col items-start gap-1.5 overflow-hidden rounded-xl p-3 text-left ring-1 ring-inset transition hover:-translate-y-0.5', r.kind === 'membership' ? (r.tier === 'vvip' ? 'pass-pick--vvip' : 'pass-pick--vip') : 'pass-pick--item', ready && 'pass-pick--ready')}>
              <span className="text-2xl leading-none" aria-hidden="true">{r.kind === 'membership' ? '👑' : item?.style?.glyph ?? (item?.kind === 'frame' ? '◎' : item?.kind === 'nameEffect' ? 'Aa' : item?.kind === 'chatEffect' ? '💬' : item?.kind === 'theme' ? '🎨' : '✨')}</span>
              <span className="text-sm font-bold text-white">{r.kind === 'membership' ? t('pass.memberReward', { tier: r.tier.toUpperCase(), days: r.days }) : item?.name ?? r.id}</span>
              <span className="text-[11px] font-semibold text-slate-400">{t('pass.tier', { tier })} · {track === 'premium' ? t('pass.premiumTrack') : t('pass.freeTrack')}</span>
              {got ? <span className="absolute right-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-neon-green text-ink-950"><Check className="h-3 w-3" strokeWidth={3.5} /></span>
                : ready ? <span className="absolute right-2 top-2 rounded bg-neon-cyan px-1.5 text-[9px] font-extrabold uppercase text-onaccent">{t('pass.claim')}</span>
                : <Lock className="absolute right-2 top-2 h-3.5 w-3.5 text-slate-500" />}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function TierColumn({ row, tier, premium, claimed, catalog, onClaim, busy }) {
  const { t } = useT()
  const reached = tier >= row.tier
  const cell = (track, list) => {
    const got = claimed[track].includes(row.tier)
    const locked = !reached || (track === 'premium' && !premium)
    const can = !got && !locked && list.length > 0
    return (
      <button
        type="button"
        disabled={!can || busy}
        onClick={() => onClaim(track, row.tier)}
        className={clsx(
          'relative flex h-[96px] w-full flex-col items-center justify-center gap-1 rounded-xl px-1.5 text-center ring-1 ring-inset transition',
          !list.length ? 'bg-white/[0.015] ring-white/[0.04]' : track === 'premium' ? 'bg-amber-400/[0.06] ring-amber-300/20' : 'bg-white/[0.03] ring-white/[0.07]',
          isMilestone(list) && 'pass-cell--milestone',
          can && 'cursor-pointer ring-2 ring-neon-cyan/60 hover:bg-neon-cyan/10',
          got && 'opacity-55',
        )}
        aria-label={can ? t('pass.claimTier', { tier: row.tier }) : undefined}
      >
        {list.map((r, i) => <RewardChip key={i} r={r} catalog={catalog} dim={locked && !got} />)}
        {!list.length && <span className="text-[10px] text-slate-600">—</span>}
        {got && <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-neon-green text-ink-950"><Check className="h-2.5 w-2.5" strokeWidth={3.5} /></span>}
        {locked && list.length > 0 && !got && <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-slate-500" />}
        {can && <span className="absolute -bottom-1.5 rounded bg-neon-cyan px-1 text-[9px] font-extrabold uppercase text-onaccent">{t('pass.claim')}</span>}
      </button>
    )
  }
  return (
    <div className="flex w-[104px] shrink-0 flex-col gap-2" data-tier={row.tier}>
      {cell('premium', row.premium)}
      <div className={clsx('grid h-7 place-items-center rounded-lg font-mono text-xs font-bold', reached ? 'bg-neon-cyan/15 text-neon-cyan' : 'bg-white/[0.04] text-slate-500')}>{row.tier}</div>
      {cell('free', row.free)}
    </div>
  )
}

export default function BattlePassPage() {
  const { t } = useT()
  const catalog = useCatalog()
  const { pass } = useExtras()
  const def = catalog.pass
  const ag = useDisplayBalance('AG')
  const now = useNow(60_000)
  const [busy, setBusy] = useState(false)
  const [buying, setBuying] = useState(false)
  const strip = useRef(null)

  // Scroll the track to the current tier.
  useEffect(() => {
    if (!pass || !strip.current) return
    const el = strip.current.querySelector(`[data-tier="${Math.max(1, pass.tier)}"]`)
    if (el) strip.current.scrollLeft = el.offsetLeft - strip.current.clientWidth / 2 + 52
  }, [pass?.tier])

  if (!SERVER_MODE || !def || !pass) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('pass.title')} subtitle={t('pass.subtitle')} icon={Flame} />
        <div className="glass rounded-2xl"><EmptyState icon={Flame} title={t('shop.liveOnly')} body={t('shop.liveOnlyBody')} /></div>
      </div>
    )
  }

  const jump = (tier) => {
    const el = strip.current?.querySelector(`[data-tier="${tier}"]`)
    if (el) {
      strip.current.scrollTo({ left: el.offsetLeft - strip.current.clientWidth / 2 + 52, behavior: 'smooth' })
      strip.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }
  const xpPer = def.xpPerTier
  const into = pass.tier >= def.tiers ? xpPer : pass.xp % xpPer
  const claimable = def.rewards.filter((r) => r.tier <= pass.tier).reduce((n, r) => n + (r.free.length && !pass.claimed.free.includes(r.tier) ? 1 : 0) + (pass.premium && !pass.claimed.premium.includes(r.tier) ? 1 : 0), 0)

  const claim = async (track, tier) => {
    setBusy(true)
    try {
      const r = await claimPass(track, tier)
      toast({ tone: 'success', title: t('pass.claimed', { n: r.claimed }), body: [r.ac > 0 && `${formatCoins(r.ac)} AC`, r.ag > 0 && `${formatCoins(r.ag)} AG`, r.lxp > 0 && `${formatCoins(r.lxp)} LXP`, r.items?.length && t('pass.items', { n: r.items.length }), ...(r.memberships ?? []).map((m) => t('pass.memberGot', { tier: m.tier.toUpperCase(), days: m.days }))].filter(Boolean).join(' · ') })
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    } finally {
      setBusy(false)
    }
  }
  const buy = async () => {
    setBusy(true)
    try {
      await buyPass()
      toast({ tone: 'success', title: t('pass.bought') })
      setBuying(false)
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('pass.title')} subtitle={t('pass.subtitle')} icon={Flame} />

      <section className="pass-hero relative overflow-hidden rounded-2xl p-5 ring-1 ring-inset ring-white/10 sm:p-7">
        <span className="pass-hero__glow" aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div className="min-w-0">
            <p className="label-caps text-amber-200/80">{t('pass.season', { id: pass.seasonId })} · {t('pass.endsIn', { time: formatLeft(pass.endAt - now) })}</p>
            <h2 className="mt-2 font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl">{t('pass.tier', { tier: pass.tier })}<span className="text-white/30"> / {def.tiers}</span></h2>
            <div className="mt-4 max-w-xl">
              <div className="flex justify-between text-xs text-slate-300"><span>{pass.tier >= def.tiers ? t('pass.maxed') : t('pass.nextTier', { tier: pass.tier + 1 })}</span><span className="num font-mono">{formatCoins(into)} / {formatCoins(xpPer)} SXP</span></div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/30"><motion.div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-neon-cyan" style={{ width: `${(into / xpPer) * 100}%` }} initial={{ width: 0 }} animate={{ width: `${(into / xpPer) * 100}%` }} transition={{ duration: 0.8 }} /></div>
              <p className="mt-2 text-xs text-slate-400">{t('pass.howXp')}</p>
            </div>
          </div>
          <div className="rounded-2xl bg-black/25 p-4 ring-1 ring-inset ring-white/10 backdrop-blur">
            <p className="flex items-center gap-2 text-sm font-bold text-white"><Crown className="h-4 w-4 text-amber-300" /> {t('pass.premium')}</p>
            {pass.premium ? (
              <p className="mt-1 text-xs text-slate-300">{pass.viaVvip ? t('pass.viaVvip') : t('pass.owned')}</p>
            ) : (
              <>
                <p className="mt-1 text-xs text-slate-300">{t('pass.premiumHint')}</p>
                <Button size="sm" variant="gold" className="mt-3 w-full" onClick={() => setBuying(true)}><CurrencyIcon currency="AG" size={14} /> {t('pass.buy', { price: formatCoins(def.price) })}</Button>
                <Link to="/membership" className="mt-2 block text-center text-[11px] font-semibold text-slate-400 hover:text-white">{t('pass.orVvip')}</Link>
              </>
            )}
          </div>
        </div>
      </section>

      <PassHighlights def={def} pass={pass} catalog={catalog} onJump={jump} />

      <section className="glass rounded-2xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b hairline px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-4 text-xs font-semibold">
            <span className="flex items-center gap-1.5 text-amber-200"><Crown className="h-3.5 w-3.5" /> {t('pass.premiumTrack')}</span>
            <span className="flex items-center gap-1.5 text-slate-300"><Gift className="h-3.5 w-3.5" /> {t('pass.freeTrack')}</span>
          </div>
          <Button size="sm" disabled={!claimable || busy} loading={busy} onClick={() => claim('all', 0)}><Sparkles className="h-4 w-4" /> {claimable ? t('pass.claimAll', { n: claimable }) : t('pass.nothing')}</Button>
        </header>
        <div ref={strip} className="flex gap-2 overflow-x-auto px-4 py-5 sm:px-5" style={{ scrollbarWidth: 'thin' }}>
          {def.rewards.map((row) => (
            <TierColumn key={row.tier} row={row} tier={pass.tier} premium={pass.premium} claimed={pass.claimed} catalog={catalog} onClaim={claim} busy={busy} />
          ))}
        </div>
      </section>

      {buying && (
        <Modal
          open
          onClose={() => setBuying(false)}
          locked={busy}
          title={t('pass.buyTitle', { id: pass.seasonId })}
          icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-400/10 text-amber-300"><Crown className="h-5 w-5" /></span>}
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setBuying(false)} disabled={busy}>{t('common.cancel')}</Button>
              <Button variant="gold" className="flex-1" loading={busy} disabled={ag < def.price} onClick={buy}>{t('pass.buyConfirm')}</Button>
            </>
          }
        >
          <p className="text-sm text-slate-300">{t('pass.buyBody', { price: formatCoins(def.price) })}</p>
          <p className={clsx('mt-3 text-xs font-semibold', ag < def.price ? 'text-neon-red' : 'text-slate-500')}>{ag < def.price ? t('pass.missing', { n: formatCoins(def.price - ag) }) : t('pass.youHave', { n: formatCoins(ag) })}</p>
        </Modal>
      )}
    </div>
  )
}

/** Compact pass progress for the Rewards page (local mode keeps the old season panel). */
export function PassStrip() {
  const { t } = useT()
  const catalog = useCatalog()
  const { pass } = useExtras()
  const def = catalog.pass
  if (!def || !pass) return null
  const xpPer = def.xpPerTier
  const into = pass.tier >= def.tiers ? xpPer : pass.xp % xpPer
  const claimable = def.rewards.filter((r) => r.tier <= pass.tier).reduce((n, r) => n + (r.free.length && !pass.claimed.free.includes(r.tier) ? 1 : 0) + (pass.premium && !pass.claimed.premium.includes(r.tier) ? 1 : 0), 0)
  return (
    <Link to="/pass" className="pass-hero relative block overflow-hidden rounded-2xl p-5 ring-1 ring-inset ring-white/10 transition hover:ring-white/20">
      <div className="relative flex flex-wrap items-center gap-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-amber-400/15 text-amber-300"><Flame className="h-6 w-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="label-caps text-amber-200/80">{t('pass.season', { id: pass.seasonId })} · {pass.premium ? t('pass.premium') : t('pass.freeTrack')}</p>
          <p className="mt-0.5 font-display text-lg font-bold text-white">{t('pass.tier', { tier: pass.tier })} <span className="text-white/30">/ {def.tiers}</span></p>
          <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-black/30"><div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-neon-cyan" style={{ width: `${(into / xpPer) * 100}%` }} /></div>
        </div>
        <span className={clsx('rounded-xl px-3 py-2 text-xs font-bold', claimable ? 'bg-neon-cyan text-onaccent' : 'bg-white/10 text-slate-200')}>{claimable ? t('pass.claimAll', { n: claimable }) : t('pass.open')}</span>
      </div>
    </Link>
  )
}
