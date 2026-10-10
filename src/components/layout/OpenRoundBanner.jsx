import { Link, useLocation } from 'react-router-dom'
import { PlayCircle } from 'lucide-react'
import { serverOpenRound } from '@/services/server'
import { SERVER_MODE } from '@/config/runtime'
import { getGameName } from '@/config/games'
import { useCurrentUser } from '@/store/useAuthStore'
import { useNow } from '@/hooks/useNow'
import { useT } from '@/i18n'

const RESUMABLE = ['crash', 'mines', 'blackjack', 'tower', 'cross', 'pump']

/** Reminds the player of a round still open on the server (after a reload or on another page) and links back to it. */
export default function OpenRoundBanner() {
  const { t } = useT()
  const user = useCurrentUser()
  const { pathname } = useLocation()
  useNow(4000)
  if (!SERVER_MODE || !user) return null
  const game = RESUMABLE.find((g) => serverOpenRound(g) && pathname !== `/games/${g}`)
  if (!game) return null
  return (
    <div className="flex items-center gap-3 rounded-xl bg-neon-cyan/10 px-4 py-2.5 text-sm ring-1 ring-inset ring-neon-cyan/25">
      <PlayCircle className="h-4 w-4 shrink-0 text-neon-cyan" />
      <p className="min-w-0 flex-1 text-slate-200">{t('openRound.text', { game: getGameName(game) })}</p>
      <Link to={`/games/${game}`} className="shrink-0 rounded-lg bg-neon-cyan/20 px-3 py-1 text-xs font-bold text-neon-cyan hover:bg-neon-cyan/30">{t('openRound.resume')}</Link>
    </div>
  )
}
