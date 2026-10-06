import { Link } from 'react-router-dom'
import { ChevronRight, Gift, History, ListChecks, MessagesSquare, Send } from 'lucide-react'
import { DailyReward, LevelBar, QuestList } from '@/components/progress/ProgressKit'
import Avatar from '@/components/ui/Avatar'
import { Panel } from '@/components/ui/Controls'
import BalanceCards from '@/components/wallet/BalanceCards'
import TransactionList from '@/components/wallet/TransactionList'
import JackpotBanner from '@/components/jackpot/JackpotBanner'
import GameCard from '@/components/games/GameCard'
import ChatRoom from '@/components/chat/ChatRoom'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useActiveWallet } from '@/store/useWalletStore'
import { openModal } from '@/store/useUiStore'
import { GAMES } from '@/config/games'
import { useNow } from '@/hooks/useNow'
import { useT } from '@/i18n'

function greetingKey(hour) {
  if (hour < 11) return 'home.greeting.morning'
  if (hour < 15) return 'home.greeting.afternoon'
  if (hour < 19) return 'home.greeting.evening'
  return 'home.greeting.night'
}

function SectionTitle({ title, to, linkLabel }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-display text-base font-bold text-white">{title}</h2>
      {to && (
        <Link to={to} className="flex items-center gap-0.5 text-sm font-semibold text-slate-400 hover:text-white">
          {linkLabel} <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  )
}

/** Quick Send: penerima terakhir (atau pemain lain) — satu klik membuka form Send. */
function QuickSend() {
  const { t } = useT()
  const me = useCurrentUser()
  const wallet = useActiveWallet()
  const users = useAuthStore((s) => s.users)
  const recentIds = [...new Set((wallet?.transactions ?? []).filter((tx) => tx.type === 'send' && tx.counterparty).map((tx) => tx.counterparty.userId))]
  const pool = Object.values(users).filter((u) => u.id !== me?.id)
  const ordered = [...recentIds.map((id) => pool.find((u) => u.id === id)).filter(Boolean), ...pool.filter((u) => !recentIds.includes(u.id))].slice(0, 5)

  return (
    <Panel title={t('home.quickSend')} icon={Send} bodyClassName="p-4 sm:p-5">
      <div className="flex items-start gap-3 overflow-x-auto pb-1 scrollbar-none sm:gap-4">
        {ordered.map((u) => (
          <button key={u.id} onClick={() => openModal('send', { toUserId: u.id })} className="flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-xl py-1 focus-ring">
            <Avatar user={u} size="lg" />
            <span className="w-full truncate text-center text-[11px] font-semibold text-slate-400">{u.displayName}</span>
          </button>
        ))}
        <button onClick={() => openModal('send')} className="flex w-14 shrink-0 flex-col items-center gap-1.5 rounded-xl py-1 focus-ring">
          <span className="grid h-12 w-12 place-items-center rounded-xl border border-dashed border-white/20 text-slate-400"><Send className="h-4 w-4" /></span>
          <span className="text-[11px] font-semibold text-slate-400">{t('home.other')}</span>
        </button>
      </div>
    </Panel>
  )
}

export default function HomePage() {
  const { t } = useT()
  const user = useCurrentUser()
  const wallet = useActiveWallet()
  const now = useNow(60_000)
  const featured = GAMES.filter((g) => g.featured)

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="label-caps">{t(greetingKey(new Date(now).getHours()))}</p>
          <h1 className="mt-1.5 truncate font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">{user?.displayName}</h1>
        </div>
        <div className="w-full sm:w-72">
          <LevelBar compact />
        </div>
      </div>

      <BalanceCards />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Panel title={t('rewards.daily.title')} icon={Gift} bodyClassName="p-4 sm:p-5">
          <DailyReward />
        </Panel>
        <Panel title={t('rewards.dailyQuests')} icon={ListChecks} action={<Link to="/rewards" className="text-xs font-semibold text-slate-400 hover:text-white">{t('common.viewAll')}</Link>}>
          <QuestList scope="daily" limit={3} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <QuickSend />
        <JackpotBanner variant="latest" className="h-full" />
      </div>

      <section>
        <SectionTitle title={t('home.featured')} to="/games" linkLabel={t('home.allGames')} />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {featured.map((game) => <GameCard key={game.slug} game={game} compact />)}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title={t('home.recent')}
          icon={History}
          action={<Link to="/wallet" className="text-xs font-semibold text-slate-400 hover:text-white">{t('common.viewAll')}</Link>}
        >
          <TransactionList transactions={wallet?.transactions ?? []} limit={5} grouped={false} onSelect={(tx) => openModal('tx', { txId: tx.id })} />
        </Panel>
        <Panel title={t('nav.chat')} icon={MessagesSquare} bodyClassName="flex flex-col">
          <ChatRoom compact limit={5} className="h-[360px]" />
        </Panel>
      </div>
    </div>
  )
}
