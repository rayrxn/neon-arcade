import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Crown, Medal, Trophy } from 'lucide-react'
import clsx from 'clsx'
import Avatar from '@/components/ui/Avatar'
import { EmptyState, Panel, Segmented } from '@/components/ui/Controls'
import { PageHeader, QueryView, useQuery } from '@/components/ui/PageKit'
import { useCurrentUser } from '@/store/useAuthStore'
import { useProgressStore } from '@/store/useProgressStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { GAMES } from '@/config/games'
import { LB_CATEGORIES, LB_SCOPES, leaderboard } from '@/services/leaderboard'
import { currentSeason } from '@/services/seasons'
import { useNow } from '@/hooks/useNow'
import { formatCoins, formatDate, formatLeft } from '@/utils/format'
import { useT } from '@/i18n'

const RANK_STYLE = ['text-neon-gold', 'text-slate-300', 'text-[#e39b62]']

function valueLabel(t, scope, category, value) {
  if (scope === 'season') return `${formatCoins(value)} SXP`
  if ((scope === 'weekly' || scope === 'monthly') && !['games', 'wins'].includes(category)) return `${formatCoins(value)} XP`
  if (scope === 'game') return category === 'wins' ? t('leaderboard.wins', { n: formatCoins(value) }) : t('leaderboard.played', { n: formatCoins(value) })
  if (category === 'xp') return `${formatCoins(value)} XP`
  if (category === 'level') return null
  return formatCoins(value)
}

export default function LeaderboardPage() {
  const { t } = useT()
  const me = useCurrentUser()
  const [scope, setScope] = useState('global')
  const [category, setCategory] = useState('level')
  const [game, setGame] = useState('crash')
  const byUser = useProgressStore((s) => s.byUser)
  const friendships = usePlatformStore((s) => s.friendships)
  const season = usePlatformStore((s) => s.season)
  const archive = usePlatformStore((s) => s.seasonArchive)
  const now = useNow(60_000)

  const query = useQuery(() => leaderboard({ scope, category, game, viewerId: me?.id }), [scope, category, game, byUser, friendships, me?.id, season?.id])
  const cats = scope === 'game' ? ['games', 'wins'] : scope === 'season' ? [] : scope === 'weekly' || scope === 'monthly' ? ['xp', 'games', 'wins'] : LB_CATEGORIES
  const activeCat = cats.includes(category) ? category : cats[0]
  const s = season ?? currentSeason(now)

  return (
    <div className="space-y-6">
      <PageHeader title={t('leaderboard.title')} subtitle={t('leaderboard.subtitle')} />

      <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <Segmented layoutId="lb-scope" size="sm" value={scope} onChange={setScope} className="w-max" options={LB_SCOPES.map((v) => ({ value: v, label: t(`leaderboard.scopes.${v}`) }))} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {cats.map((c) => (
          <button key={c} onClick={() => setCategory(c)} className={clsx('rounded-lg px-2.5 py-1.5 text-xs font-bold ring-1 ring-inset', activeCat === c ? 'bg-neon-cyan/15 text-neon-cyan ring-neon-cyan/30' : 'text-slate-400 ring-white/10 hover:text-white')}>
            {t(`leaderboard.categories.${c}`)}
          </button>
        ))}
        {scope === 'game' && (
          <select aria-label={t('leaderboard.game')} value={game} onChange={(e) => setGame(e.target.value)} className="input-shell h-8 px-2 text-xs text-white outline-none">
            {GAMES.filter((g) => g.load).map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
          </select>
        )}
        {scope === 'season' && (
          <p className="text-xs text-slate-400">{t('leaderboard.seasonInfo', { id: s.id, start: formatDate(s.startAt), time: formatLeft(s.endAt - now) })}</p>
        )}
      </div>

      <Panel title={t(`leaderboard.scopes.${scope}`)} icon={Trophy} action={<span className="text-[11px] text-slate-500">{t('leaderboard.noTest')}</span>}>
        <QueryView
          query={{ ...query, data: query.data?.rows }}
          rows={6}
          empty={<EmptyState icon={Trophy} title={t('leaderboard.empty')} body={scope === 'friends' ? t('leaderboard.emptyFriends') : t('leaderboard.emptyBody')} />}
        >
          {(rows) => (
            <ol className="divide-y divide-white/[0.05]">
              {rows.map((r) => {
                const mine = r.user.id === me?.id
                const label = valueLabel(t, scope, activeCat, r.value)
                return (
                  <li key={r.user.id} className={clsx('flex items-center gap-3 px-4 py-2.5 sm:px-5', mine && 'bg-neon-cyan/[0.05]')}>
                    <span className={clsx('w-7 shrink-0 text-center font-display text-sm font-bold num', RANK_STYLE[r.rank - 1] ?? 'text-slate-500')}>
                      {r.rank <= 3 ? (r.rank === 1 ? <Crown className="mx-auto h-4 w-4" /> : <Medal className="mx-auto h-4 w-4" />) : r.rank}
                    </span>
                    <Avatar user={r.user} size="sm" />
                    <Link to={`/u/${r.user.username}`} className="min-w-0 flex-1 hover:underline">
                      <p className="truncate text-sm font-bold text-white">{r.user.displayName} {mine && <span className="text-[11px] font-semibold text-neon-cyan">({t('leaderboard.you')})</span>}</p>
                      <p className="truncate text-[11px] text-slate-500">@{r.user.username} · Lv {r.level}</p>
                    </Link>
                    <span className="shrink-0 text-right text-sm font-bold text-white num">{label ?? `Lv ${r.level}`}</span>
                  </li>
                )
              })}
            </ol>
          )}
        </QueryView>
        {query.data?.me && query.data.me.rank > query.data.rows.length && (
          <p className="border-t hairline px-5 py-2.5 text-xs text-slate-400">{t('leaderboard.yourRank', { rank: query.data.me.rank })}</p>
        )}
      </Panel>

      {scope === 'season' && archive?.length > 0 && (
        <Panel title={t('leaderboard.archive')} icon={Medal}>
          <ul className="divide-y divide-white/[0.05]">
            {archive.map((a) => (
              <li key={a.id} className="px-4 py-3 sm:px-5">
                <p className="text-sm font-bold text-white">{t('leaderboard.seasonN', { id: a.id })} <span className="text-xs font-normal text-slate-500">· {formatDate(a.startAt)} – {formatDate(a.endedAt ?? a.endAt)}</span></p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {a.leaderboard.length ? a.leaderboard.slice(0, 3).map((r) => `#${r.rank} @${r.username} (${formatCoins(r.xp)} SXP)`).join(' · ') : t('leaderboard.archiveEmpty')}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
