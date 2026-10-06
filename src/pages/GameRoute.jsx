import { Suspense, lazy } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Loader2, Plug } from 'lucide-react'
import Button from '@/components/ui/Button'
import GameArt from '@/components/games/GameArt'
import { categoryKey, getGame } from '@/config/games'
import * as gameApi from '@/services/games'
import { useT } from '@/i18n'

/**
 * Titik colok semua game. Komponen di-lazy-load dari `game.load` di config/games.js.
 * Setiap game menerima prop `api` = services/games.js (startRound / finishRound) untuk wallet, RNG & jackpot.
 */
const lazyCache = new Map()
function getLazyComponent(game) {
  if (!lazyCache.has(game.slug)) lazyCache.set(game.slug, lazy(game.load))
  return lazyCache.get(game.slug)
}

function ComingSoon({ game }) {
  const { t } = useT()
  const navigate = useNavigate()
  return (
    <section className="glass overflow-hidden rounded-2xl">
      <GameArt slug={game.slug} className="aspect-[16/7] border-b hairline sm:aspect-[16/5]" />
      <div className="px-5 py-8 text-center sm:py-10">
        <p className="label-caps">{t(categoryKey(game.category))} · {t('games.soon')}</p>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-white">{game.name}</h1>
        <p className="mx-auto mt-3 max-w-md text-slate-400">{t(`games.list.${game.slug}`)}</p>
        <p className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2 rounded-xl bg-white/[0.03] px-4 py-3 text-xs text-slate-500 ring-1 ring-inset ring-white/[0.06]">
          <Plug className="h-3.5 w-3.5 shrink-0" /> {t('games.notLive')}
        </p>
        <Button variant="ghost" onClick={() => navigate('/games')} className="mt-6">
          <ArrowLeft className="h-4 w-4" /> {t('games.back')}
        </Button>
      </div>
    </section>
  )
}

export default function GameRoute() {
  const { slug } = useParams()
  const game = getGame(slug)
  if (slug === 'jackpot') return <Navigate to="/jackpot" replace />
  if (!game) return <Navigate to="/games" replace />
  if (!game.load) return <ComingSoon game={game} />

  const GameComponent = getLazyComponent(game)
  return (
    <Suspense fallback={<div className="glass grid h-[60vh] place-items-center rounded-2xl"><Loader2 className="h-6 w-6 animate-spin text-neon-cyan" /></div>}>
      <GameComponent game={game} api={gameApi} />
    </Suspense>
  )
}
