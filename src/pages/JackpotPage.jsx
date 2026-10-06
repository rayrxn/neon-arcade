import { Info, Trophy } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import GameArt from '@/components/games/GameArt'
import JackpotBanner from '@/components/jackpot/JackpotBanner'
import { Amount } from '@/components/ui/Currency'
import { DemoTag, EmptyState, Panel } from '@/components/ui/Controls'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useAuthStore } from '@/store/useAuthStore'
import { biggestJackpot } from '@/services/jackpot'
import { JACKPOT_THRESHOLD } from '@/config/economy'
import { getGameName } from '@/config/games'
import { useNow } from '@/hooks/useNow'
import { formatCoins, timeAgo } from '@/utils/format'
import { useT } from '@/i18n'

export default function JackpotPage() {
  const { t } = useT()
  const jackpots = usePlatformStore((s) => s.jackpots)
  const users = useAuthStore((s) => s.users)
  const now = useNow(60_000)
  const byId = Object.fromEntries(Object.values(users).map((u) => [u.id, u]))
  const week = jackpots.filter((j) => now - j.at < 7 * 86_400_000)
  const best = biggestJackpot(jackpots)

  const stats = [
    { label: t('jackpot.stats.biggest'), value: best ? <Amount currency="AC" value={best.amount} size="md" className="text-white" /> : '—' },
    { label: t('jackpot.stats.week'), value: <span className="font-mono text-lg font-bold text-white">{week.length}</span> },
    { label: t('jackpot.stats.threshold'), value: <Amount currency="AC" value={JACKPOT_THRESHOLD} size="md" className="text-white" /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <GameArt slug="jackpot" className="hidden h-16 w-24 shrink-0 rounded-xl sm:block" />
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-white">{t('jackpot.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('jackpot.subtitle', { amount: formatCoins(JACKPOT_THRESHOLD) })}</p>
        </div>
      </div>

      <JackpotBanner link={false} />

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="glass rounded-2xl px-4 py-3.5">
            <dt className="text-xs text-slate-500">{s.label}</dt>
            <dd className="mt-1.5">{s.value}</dd>
          </div>
        ))}
      </dl>

      <Panel title={t('jackpot.recent')} icon={Trophy}>
        {jackpots.length === 0 ? (
          <EmptyState icon={Trophy} title={t('jackpot.empty')} />
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {jackpots.map((j) => {
              const user = byId[j.userId]
              return (
                <li key={j.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar user={user} name={j.username} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold text-white">@{j.username} {user?.isDemo && <DemoTag />}</p>
                    <p className="truncate text-xs text-slate-500">{getGameName(j.game)} · {timeAgo(j.at, now)}</p>
                  </div>
                  <Amount currency={j.currency} value={j.amount} size="sm" className="text-neon-gold" />
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      <p className="flex gap-2 text-xs leading-relaxed text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('jackpot.note')}
      </p>
    </div>
  )
}
