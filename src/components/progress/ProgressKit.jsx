import { useState } from 'react'
import { motion } from 'framer-motion'
import { Award, CalendarCheck, Check, Gift, Lock, Sparkles, Star } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { CurrencyIcon } from '@/components/ui/Currency'
import { useCurrentUser } from '@/store/useAuthStore'
import { useProgress } from '@/store/useProgressStore'
import { toast } from '@/store/useUiStore'
import { ACHIEVEMENTS, DAILY_REWARDS, levelFromXp } from '@/config/progression'
import { ITEMS } from '@/config/economy'
import { achievementProgress, claimDailyReward, claimQuest, dailyState, questView } from '@/services/progression'
import { currentSeason, seasonTier, seasonTierProgress, seasonXpOf } from '@/services/seasons'
import { SEASON_TIERS, SEASON_TIER_XP } from '@/config/cosmetics'
import { play } from '@/services/sound'
import { useNow } from '@/hooks/useNow'
import { formatCoins, formatCountdown, formatLeft } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { pick, useT } from '@/i18n'

function RewardLabel({ reward }) {
  const { lang } = useT()
  if (reward.kind === 'item') return <span className="text-neon-gold">{pick(ITEMS[reward.id]?.name, lang)}</span>
  if (reward.kind === 'XP') return <span className="text-neon-cyan">+{formatCoins(reward.amount)} XP</span>
  return (
    <span className="inline-flex items-center gap-1 text-slate-200">
      <CurrencyIcon currency={reward.kind} size={13} /> {formatCoins(reward.amount)}
    </span>
  )
}

/** Level + bar XP. */
export function LevelBar({ compact = false }) {
  const { t } = useT()
  const user = useCurrentUser()
  const p = useProgress(user?.id)
  const lv = levelFromXp(p.xp)
  return (
    <div className={clsx('min-w-0', !compact && 'rounded-2xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.06]')}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 font-bold text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-neon-cyan/10 font-mono text-xs text-neon-cyan ring-1 ring-inset ring-neon-cyan/25">{lv.level}</span>
          {t('rewards.level', { level: lv.level })}
        </span>
        <span className="num font-mono text-xs text-slate-400">{formatCoins(lv.into)} / {formatCoins(lv.need)} XP</span>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div className="h-full rounded-full bg-neon-cyan" initial={false} animate={{ width: `${(lv.into / lv.need) * 100}%` }} />
      </div>
      {!compact && (
        <p className="mt-2 flex flex-wrap justify-between gap-x-3 text-[11px] text-slate-500">
          <span>{t('rewards.toNext', { xp: formatCoins(lv.need - lv.into), level: lv.level + 1 })}</span>
          <span>{t('rewards.lifetime', { xp: formatCoins(p.xp) })}{p.levelHistory?.[0] ? ` · ${t('rewards.lastLevelUp', { time: new Date(p.levelHistory[0].at).toLocaleDateString() })}` : ''}</span>
        </p>
      )}
    </div>
  )
}

/** Season: tier, progres ke tier berikutnya, hadiah kosmetik tiap tier. */
export function SeasonPanel() {
  const { t, lang } = useT()
  const user = useCurrentUser()
  const p = useProgress(user?.id)
  const now = useNow(60_000)
  const season = currentSeason(now)
  const sxp = seasonXpOf(p, season.id)
  const tier = seasonTier(sxp)
  const claimed = p.season?.id === season.id ? p.season.tiersClaimed : []
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold text-white">{t('season.title', { id: season.id })} · {t('season.tier', { tier })}</p>
          <p className="text-xs text-slate-500">{t('season.endsIn', { time: formatLeft(season.endAt - now) })}</p>
        </div>
        <span className="num font-mono text-xs text-slate-400">{formatCoins(seasonTierProgress(sxp))} / {SEASON_TIER_XP} SXP</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <motion.div className="h-full rounded-full bg-neon-purple" initial={false} animate={{ width: `${(seasonTierProgress(sxp) / SEASON_TIER_XP) * 100}%` }} />
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {SEASON_TIERS.map((st) => {
          const got = claimed.includes(st.tier)
          return (
            <li key={st.tier} className={clsx('rounded-xl px-3 py-2.5 text-center ring-1 ring-inset', got ? 'bg-neon-purple/10 ring-neon-purple/30' : 'bg-white/[0.02] ring-white/[0.06]')}>
              <p className="label-caps">{t('season.tier', { tier: st.tier })}</p>
              <p className={clsx('mt-1 truncate text-xs font-bold', got ? 'text-neon-purple' : 'text-slate-300')}>{pick(ITEMS[st.item]?.name, lang)}</p>
              <p className="mt-0.5 text-[10px] text-slate-500">{got ? t('season.claimed') : t('season.needs', { xp: formatCoins(st.tier * SEASON_TIER_XP) })}</p>
            </li>
          )
        })}
      </ol>
      <p className="text-[11px] text-slate-500">{t('season.note')}</p>
    </div>
  )
}

/** Strip 7 hari + tombol klaim + countdown. */
export function DailyReward() {
  const { t } = useT()
  const user = useCurrentUser()
  const p = useProgress(user?.id)
  const now = useNow(1000)
  const [busy, setBusy] = useState(false)
  const state = dailyState(p, now)

  const claim = async () => {
    setBusy(true)
    try {
      const res = await claimDailyReward(user.id)
      toast({ tone: 'success', title: t('rewards.daily.claimed', { day: res.day }) })
    } catch (err) {
      play('error')
      toast({ tone: 'error', title: t(errorKey(err)) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {DAILY_REWARDS.map((d) => {
          const claimed = d.day <= state.cycleClaimed
          const today = !state.claimedToday && d.day === state.nextDay
          return (
            <div
              key={d.day}
              className={clsx(
                'flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2.5 text-center ring-1 ring-inset',
                claimed ? 'bg-neon-green/[0.07] ring-neon-green/30' : today ? 'bg-neon-gold/10 ring-neon-gold/50' : 'ring-white/[0.07]',
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('rewards.daily.day', { day: d.day })}</span>
              <span className={clsx('grid h-8 w-8 place-items-center rounded-lg', d.special ? 'bg-neon-purple/15 text-neon-purple' : 'bg-white/[0.05] text-neon-gold')}>
                {claimed ? <Check className="h-4 w-4 text-neon-green" /> : d.special ? <Star className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
              </span>
              <span className="w-full truncate text-[10px] font-semibold">{d.rewards.map((r, i) => <RewardLabel key={i} reward={r} />)}</span>
            </div>
          )
        })}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-400">
          <p className="flex items-center gap-2"><CalendarCheck className="h-4 w-4 text-neon-green" /> {t('rewards.daily.streak', { count: state.streak })}</p>
          {state.missed && <p className="mt-1 text-xs text-neon-gold">{t('rewards.daily.missed')}</p>}
          {state.lastClaimAt && <p className="mt-1 text-[11px] text-slate-500">{t('rewards.daily.lastClaim', { time: new Date(state.lastClaimAt).toLocaleString() })}</p>}
        </div>
        {state.claimedToday ? (
          <Button variant="ghost" disabled>
            {t('rewards.daily.next')} <span className="num font-mono">{formatCountdown(state.resetsAt - now)}</span>
          </Button>
        ) : (
          <Button variant="gold" loading={busy} onClick={claim}>
            <Gift className="h-4 w-4" /> {t('rewards.daily.claim', { day: state.nextDay })}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Daftar quest harian / mingguan. */
export function QuestList({ scope, limit }) {
  const { t } = useT()
  const user = useCurrentUser()
  const p = useProgress(user?.id)
  const now = useNow(60_000)
  const [busy, setBusy] = useState(null)
  const quests = questView(p, scope, now).slice(0, limit)

  const claim = async (q) => {
    setBusy(q.id)
    try {
      await claimQuest(user.id, scope, q.id)
      toast({ tone: 'success', title: t('rewards.questClaimed'), body: t(`rewards.quests.${q.id}`) })
    } catch (err) {
      play('error')
      toast({ tone: 'error', title: t(errorKey(err)) })
    } finally {
      setBusy(null)
    }
  }

  return (
    <ul className="divide-y divide-white/[0.05]">
      {quests.map((q) => (
        <li key={q.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <div className="min-w-0 flex-1">
            <p className={clsx('truncate text-sm font-semibold', q.claimed ? 'text-slate-500 line-through' : 'text-slate-200')}>{t(`rewards.quests.${q.id}`)}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div className={clsx('h-full rounded-full', q.done ? 'bg-neon-green' : 'bg-neon-cyan')} style={{ width: `${(q.progress / q.target) * 100}%` }} />
              </div>
              <span className="num shrink-0 font-mono text-[11px] text-slate-400">{formatCoins(q.progress)} / {formatCoins(q.target)}</span>
            </div>
            <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] font-semibold">
              {q.reward.AC && <RewardLabel reward={{ kind: 'AC', amount: q.reward.AC }} />}
              {q.reward.XP && <RewardLabel reward={{ kind: 'XP', amount: q.reward.XP }} />}
              <span className="font-normal text-slate-500">· {q.claimed ? t('rewards.questStatus.claimed') : q.done ? t('rewards.questStatus.ready') : t('rewards.questStatus.expires', { time: formatLeft(q.expiresAt - now) })}</span>
            </p>
          </div>
          {q.claimed ? (
            <span className="flex items-center gap-1 text-xs font-bold text-neon-green"><Check className="h-3.5 w-3.5" /> {t('rewards.claimedShort')}</span>
          ) : (
            <Button size="sm" variant={q.done ? 'gold' : 'ghost'} disabled={!q.done} loading={busy === q.id} onClick={() => claim(q)}>
              {t('rewards.claim')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Grid achievement: Locked / Progress / Unlocked. */
export function AchievementGrid({ limit }) {
  const { t } = useT()
  const user = useCurrentUser()
  const p = useProgress(user?.id)
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {ACHIEVEMENTS.slice(0, limit).map((a) => {
        const unlocked = !!p.achievements[a.id]
        const progress = achievementProgress(p, a)
        return (
          <div key={a.id} className={clsx('rounded-xl p-3 ring-1 ring-inset', unlocked ? 'bg-neon-purple/[0.07] ring-neon-purple/30' : 'ring-white/[0.07]')}>
            <div className="flex items-center gap-2.5">
              <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', unlocked ? 'bg-neon-purple/15 text-neon-purple' : 'bg-white/[0.05] text-slate-500')}>
                {unlocked ? <Award className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-200">{t(`rewards.achievements.${a.id}.name`)}</p>
                <p className="truncate text-[11px] text-slate-500">{t(`rewards.achievements.${a.id}.desc`)}</p>
              </div>
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div className={clsx('h-full rounded-full', unlocked ? 'bg-neon-purple' : 'bg-slate-500')} style={{ width: `${(progress / a.target) * 100}%` }} />
              </div>
              <span className="num shrink-0 font-mono text-[10px] text-slate-500">
                {unlocked ? t('rewards.unlocked') : `${formatCoins(progress)}/${formatCoins(a.target)}`}
              </span>
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-neon-cyan"><Sparkles className="h-3 w-3" /> +{a.xp} XP</p>
          </div>
        )
      })}
    </div>
  )
}
