import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Clock3, Flame, Heart, Search, Sparkles, Star, TrendingUp } from 'lucide-react'
import GameCard from '@/components/games/GameCard'
import FairnessPanel from '@/components/dashboard/FairnessPanel'
import JackpotBanner from '@/components/jackpot/JackpotBanner'
import { EmptyState, Segmented } from '@/components/ui/Controls'
import { PageHeader } from '@/components/ui/PageKit'
import { GAMES, GAME_CATEGORIES } from '@/config/games'
import { useCurrentUser } from '@/store/useAuthStore'
import { useProgress, useProgressStore } from '@/store/useProgressStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { mostPlayed, newGames, recentlyPlayed, recommended, searchGames, trending } from '@/services/discovery'
import { useT } from '@/i18n'

function Row({ title, icon: Icon, games, sub }) {
  if (!games.length) return null
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-display text-base font-bold text-white"><Icon className="h-4 w-4 text-neon-cyan" /> {title} {sub && <span className="text-xs font-normal text-slate-500">{sub}</span>}</h2>
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-4">
        {games.slice(0, 4).map((g) => (
          <div key={g.slug} className="w-[46%] shrink-0 snap-start sm:w-auto"><GameCard game={g} compact /></div>
        ))}
      </div>
    </section>
  )
}

export default function GamesPage() {
  const { t } = useT()
  const user = useCurrentUser()
  const progress = useProgress(user?.id)
  useProgressStore((s) => s.byUser)
  const favs = usePlatformStore((s) => (user ? s.favorites[user.id] : null))
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const searching = q.trim().length > 0 || filter !== 'all'
  const results = useMemo(() => searchGames(q, filter, t), [q, filter, t])
  const bySlug = Object.fromEntries(GAMES.map((g) => [g.slug, g]))
  const favorites = (favs ?? []).map((s) => bySlug[s]).filter(Boolean)
  const recent = recentlyPlayed(progress).map((r) => r.game)

  return (
    <div className="space-y-8">
      <PageHeader title={t('games.title')} subtitle={t('games.subtitle', { count: GAMES.length })} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="input-shell flex h-10 min-w-0 flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('games.search')} aria-label={t('games.search')} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
        </div>
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <Segmented layoutId="games-filter" size="sm" value={filter} onChange={setFilter} className="w-max"
            options={[{ value: 'all', label: t('common.all') }, ...GAME_CATEGORIES.map((c) => ({ value: c.id, label: t(c.labelKey) }))]} />
        </div>
      </div>

      {searching ? (
        results.length ? (
          <motion.div layout className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {results.map((game) => <GameCard key={game.slug} game={game} />)}
          </motion.div>
        ) : (
          <div className="glass rounded-2xl"><EmptyState icon={Search} title={t('games.noResults')} body={t('games.noResultsBody', { q })} /></div>
        )
      ) : (
        <>
          <JackpotBanner />
          <Row title={t('games.sections.recent')} icon={Clock3} games={recent} />
          <Row title={t('games.sections.favorites')} icon={Heart} games={favorites} />
          <Row title={t('games.sections.trending')} icon={Flame} games={trending().map((r) => r.game)} sub={t('games.sections.trendingSub')} />
          <Row title={t('games.sections.recommended')} icon={Star} games={recommended(progress)} />
          <Row title={t('games.sections.new')} icon={Sparkles} games={newGames()} />
          <Row title={t('games.sections.mostPlayed')} icon={TrendingUp} games={mostPlayed().map((r) => r.game)} />
          <section className="space-y-3">
            <h2 className="font-display text-base font-bold text-white">{t('games.sections.all')}</h2>
            <motion.div layout className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
              {GAMES.map((game) => <GameCard key={game.slug} game={game} />)}
            </motion.div>
          </section>
        </>
      )}

      <div className="max-w-2xl">
        <FairnessPanel />
      </div>
    </div>
  )
}
