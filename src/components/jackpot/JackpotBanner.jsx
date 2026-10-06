import { Link } from 'react-router-dom'
import { Trophy } from 'lucide-react'
import clsx from 'clsx'
import GameArt from '@/components/games/GameArt'
import Avatar from '@/components/ui/Avatar'
import { Amount } from '@/components/ui/Currency'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useUserById } from '@/store/useAuthStore'
import { biggestJackpot } from '@/services/jackpot'
import { getGameName } from '@/config/games'
import { useNow } from '@/hooks/useNow'
import { formatCoins, timeAgo } from '@/utils/format'
import { useT } from '@/i18n'

/** Pengumuman jackpot terbesar — gaya notifikasi platform, bukan iklan. */
export default function JackpotBanner({ variant = 'biggest', className, link = true }) {
  const { t } = useT()
  const jackpots = usePlatformStore((s) => s.jackpots)
  const win = variant === 'latest' ? jackpots[0] : biggestJackpot(jackpots)
  const user = useUserById(win?.userId)
  const now = useNow(60_000)
  if (!win) return null

  const body = (
    <div className={clsx('glass relative flex items-center gap-4 overflow-hidden rounded-2xl p-3 pr-4 sm:p-4', className)}>
      <GameArt slug="jackpot" className="hidden h-20 w-28 shrink-0 rounded-xl sm:block" />
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neon-gold/10 text-neon-gold sm:hidden">
        <Trophy className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-neon-gold">
          {variant === 'latest' ? t('jackpot.latest') : t('jackpot.biggest')}
        </p>
        <p className="mt-1 text-sm font-semibold text-slate-200 sm:text-[15px]">
          {t('jackpot.wonOn', { user: win.username, amount: `${formatCoins(win.amount)} ${win.currency}`, game: getGameName(win.game) })}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
          <Avatar user={user} name={win.username} size="xs" showFrame={false} />
          @{win.username} · {timeAgo(win.at, now)}
        </p>
      </div>
      <Amount currency={win.currency} value={win.amount} size="md" className="hidden shrink-0 text-white md:inline-flex" />
    </div>
  )

  return link ? <Link to="/jackpot" className="block rounded-2xl focus-ring">{body}</Link> : body
}
