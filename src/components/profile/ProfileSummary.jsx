import { Link } from 'react-router-dom'
import { Activity, CalendarDays, Gamepad2, Heart, Sparkles, Star } from 'lucide-react'
import clsx from 'clsx'
import Avatar from '@/components/ui/Avatar'
import { DemoTag, Panel } from '@/components/ui/Controls'
import { ItemPreview } from '@/pages/InventoryPage'
import { COSMETICS, SEASON_TIER_XP } from '@/config/cosmetics'
import { ACHIEVEMENTS, levelFromXp } from '@/config/progression'
import { getGameName } from '@/config/games'
import { equippedOf } from '@/services/cosmetics'
import { currentSeason, seasonTier, seasonTierProgress, seasonXpOf } from '@/services/seasons'
import { formatCoins, formatDate, timeAgo } from '@/utils/format'
import { pick, useT } from '@/i18n'
import { ProfileBanner, StyledName, UserTags } from '@/components/ui/Identity'

/** Header profil: banner, avatar + bingkai, nama, title, badge, level, tanggal gabung. */
export function ProfileHero({ user, progress, actions, online }) {
  const { t, lang } = useT()
  const eq = equippedOf(user)
  const lv = levelFromXp(progress.xp)
  const banner = eq.banner ? COSMETICS[eq.banner]?.gradient : 'from-neon-cyan/15 via-neon-purple/10 to-transparent'
  return (
    <section className="glass overflow-hidden rounded-2xl">
      <ProfileBanner user={user} fallback={clsx('bg-gradient-to-r', banner)} className="h-28 sm:h-40" />
      <div className="flex flex-col gap-4 px-4 pb-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar user={user} size="xl" online={online} className="-mt-10 shrink-0 rounded-2xl ring-4 ring-ink-900 sm:-mt-12" />
          <div className="min-w-0 pt-3">
            <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 font-display text-xl font-bold text-white sm:text-2xl">
              <StyledName user={user} className="min-w-0 truncate" /> <UserTags user={user} /> {user.isDemo && <DemoTag />}
              {user.isTest && <span className="rounded bg-neon-gold/15 px-1.5 py-0.5 text-[10px] font-extrabold text-neon-gold">TEST</span>}
            </h1>
            <p className="mt-0.5 truncate text-sm text-slate-400">
              @{user.username}
              {eq.title && <span className="ml-2 text-neon-cyan">· {pick(COSMETICS[eq.title]?.name, lang)}</span>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-neon-cyan/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-neon-cyan ring-1 ring-inset ring-neon-cyan/25">Lv {lv.level}</span>
              {eq.badges.map((b) => (
                <span key={b} title={pick(COSMETICS[b]?.name, lang)} className="origin-left scale-75"><ItemPreview id={b} user={user} size="sm" /></span>
              ))}
            </div>
          </div>
        </div>
        {actions && <div className="flex flex-wrap gap-2 sm:shrink-0 sm:pt-3">{actions}</div>}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t hairline px-4 py-3 text-xs text-slate-500 sm:px-6">
        <span className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> {t('profile.memberSince', { date: formatDate(user.createdAt, { month: 'long', year: 'numeric' }) })}</span>
        <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> {t('profile.lifetimeXp', { xp: formatCoins(progress.xp) })}</span>
      </div>
    </section>
  )
}

/** Statistik, game favorit, aktivitas terbaru, season. */
export function ProfileDetails({ user, progress, favorites = [] }) {
  const { t } = useT()
  const ps = progress.stats
  const lv = levelFromXp(progress.xp)
  const achieved = Object.keys(progress.achievements).length
  const winRate = ps.games ? Math.round((ps.wins / ps.games) * 100) : 0
  const topGames = Object.entries(ps.perGame).sort((a, b) => b[1].played - a[1].played).slice(0, 3)
  const season = currentSeason()
  const sxp = seasonXpOf(progress, season.id)
  const activity = [
    ...progress.sessions.filter((s) => !s.isTest).slice(0, 6).map((s) => ({ at: s.at, text: t('profile.activity.game', { game: getGameName(s.game), result: t(`history.status.${s.status ?? (s.result === 'win' ? 'WON' : 'LOST')}`) }) })),
    ...progress.levelHistory.slice(0, 4).map((h) => ({ at: h.at, text: t('profile.activity.level', { level: h.level }) })),
    ...Object.entries(progress.achievements).map(([id, at]) => ({ at, text: t('profile.activity.achievement', { name: t(`rewards.achievements.${id}.name`) }) })),
  ].sort((a, b) => b.at - a.at).slice(0, 8)

  const stats = [
    [t('profile.stats.level'), `${lv.level}`, `${formatCoins(lv.into)} / ${formatCoins(lv.need)} XP`],
    [t('profile.stats.played'), formatCoins(ps.games)],
    [t('profile.stats.wl'), `${formatCoins(ps.wins)} / ${formatCoins(ps.losses)}`, t('profile.stats.winRate', { pct: winRate })],
    [t('profile.stats.achievements'), `${achieved}/${ACHIEVEMENTS.length}`],
    [t('profile.stats.bestMultiplier'), `${ps.bestMultiplier.toFixed(2)}×`],
    [t('profile.stats.season'), t('profile.stats.tier', { tier: seasonTier(sxp) }), `${formatCoins(seasonTierProgress(sxp))} / ${SEASON_TIER_XP} SXP`],
  ]
  return (
    <>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map(([label, value, sub]) => (
          <div key={label} className="glass rounded-2xl px-4 py-3.5">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="num mt-1.5 truncate font-mono text-lg font-bold text-white">{value}</dd>
            {sub && <dd className="truncate text-[11px] text-slate-500">{sub}</dd>}
          </div>
        ))}
      </dl>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('profile.favorites')} icon={Heart}>
          <ul className="divide-y divide-white/[0.05]">
            {favorites.map((slug) => (
              <li key={`f-${slug}`} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <Star className="h-4 w-4 text-neon-gold" />
                <Link to={`/games/${slug}`} className="flex-1 text-sm font-semibold text-slate-200 hover:underline">{getGameName(slug)}</Link>
              </li>
            ))}
            {topGames.map(([slug, g]) => (
              <li key={`t-${slug}`} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                <Gamepad2 className="h-4 w-4 text-slate-500" />
                <span className="flex-1 text-sm text-slate-300">{getGameName(slug)}</span>
                <span className="text-[11px] text-slate-500">{t('profile.playedTimes', { n: g.played })}</span>
              </li>
            ))}
            {!favorites.length && !topGames.length && <li className="px-5 py-6 text-center text-xs text-slate-500">{t('profile.noFavorites')}</li>}
          </ul>
        </Panel>
        <Panel title={t('profile.activityTitle')} icon={Activity}>
          <ul className="divide-y divide-white/[0.05]">
            {activity.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-5">
                <span className="min-w-0 truncate text-sm text-slate-300">{a.text}</span>
                <span className="shrink-0 text-[11px] text-slate-500">{timeAgo(a.at)}</span>
              </li>
            ))}
            {!activity.length && <li className="px-5 py-6 text-center text-xs text-slate-500">{t('profile.noActivity')}</li>}
          </ul>
        </Panel>
      </div>
    </>
  )
}

