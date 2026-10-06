import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import GameArt from './GameArt'
import { Heart } from 'lucide-react'
import { categoryKey, isPlayable } from '@/config/games'
import { useAuthStore } from '@/store/useAuthStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { toast } from '@/store/useUiStore'
import { toggleFavorite } from '@/services/social'
import { NEW_GAMES } from '@/services/discovery'
import { useT } from '@/i18n'

/** Tombol favorit (bisa dipakai di kartu dan halaman game). */
export function FavoriteButton({ slug, className, showCount = false }) {
  const { t } = useT()
  const userId = useAuthStore((s) => s.session?.userId)
  const on = usePlatformStore((s) => !!userId && (s.favorites[userId] ?? []).includes(slug))
  const count = usePlatformStore((s) => Object.values(s.favorites).filter((list) => list.includes(slug)).length)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        try {
          const added = toggleFavorite(slug)
          toast({ tone: 'success', title: added ? t('games.favAdded') : t('games.favRemoved') })
        } catch (err) {
          toast({ tone: 'error', title: t(err?.code ?? 'errors.generic') })
        }
      }}
      aria-pressed={on}
      aria-label={on ? t('games.unfavorite') : t('games.favorite')}
      className={clsx('inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-xs font-bold transition focus-ring', on ? 'text-neon-pink' : 'text-slate-500 hover:text-white', className)}
    >
      <Heart className={clsx('h-4 w-4', on && 'fill-current')} />
      {showCount && <span className="num">{count}</span>}
    </button>
  )
}

export default function GameCard({ game, to, compact = false }) {
  const { t } = useT()
  const playable = isPlayable(game)
  const href = to ?? `/games/${game.slug}`

  return (
    <motion.div whileHover={{ y: -3 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} className="h-full">
      <Link to={href} className="glass group flex h-full flex-col overflow-hidden rounded-2xl transition-colors hover:border-white/15 focus-ring">
        <GameArt slug={game.slug} className={clsx('border-b hairline', compact ? 'aspect-[16/9]' : 'aspect-[16/10]')} />
        <div className="flex flex-1 flex-col p-3.5 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-white sm:text-[15px]">{game.name}</h3>
            {NEW_GAMES.includes(game.slug) && game.badge !== 'hot' && playable ? (
              <span className="shrink-0 rounded-md bg-neon-green/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neon-green">{t('games.new')}</span>
            ) : game.badge === 'hot' ? (
              <span className="shrink-0 rounded-md bg-neon-red/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-neon-red">{t('games.hot')}</span>
            ) : (
              !playable && <span className="shrink-0 rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{t('games.soon')}</span>
            )}
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            {game.category && <p className="text-xs text-slate-500">{t(categoryKey(game.category))}</p>}
            {playable && <FavoriteButton slug={game.slug} className="-my-1 -mr-1.5" showCount={!compact} />}
          </div>
          {!compact && <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-slate-400">{t(`games.list.${game.slug}`)}</p>}
        </div>
      </Link>
    </motion.div>
  )
}
