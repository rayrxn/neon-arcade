import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Crown, MessagesSquare, Users } from 'lucide-react'
import clsx from 'clsx'
import ChatRoom, { OnlineList } from '@/components/chat/ChatRoom'
import { Panel } from '@/components/ui/Controls'
import { useAuthStore } from '@/store/useAuthStore'
import { isOnline, usePlatformStore } from '@/store/usePlatformStore'
import { useNow } from '@/hooks/useNow'
import { useT } from '@/i18n'

export default function ChatPage() {
  const { t } = useT()
  const users = useAuthStore((s) => s.users)
  const meId = useAuthStore((s) => s.session?.userId)
  const presence = usePlatformStore((s) => s.presence)
  const now = useNow(15_000)
  const online = Object.values(users).filter((u) => u.id === meId || isOnline(presence, u.id, now)).length
  const vipRoom = usePlatformStore((s) => !!s.vipRoom)
  const [params] = useSearchParams()
  const [room, setRoom] = useState(params.get('room') === 'vip' ? 'vip' : 'global')
  const active = vipRoom ? room : 'global'
  const tabs = vipRoom && (
    <div className="flex rounded-lg bg-white/[0.04] p-0.5" role="tablist">
      {[['global', t('chat.rooms.global'), MessagesSquare], ['vip', t('chat.rooms.vip'), Crown]].map(([id, label, Icon]) => (
        <button key={id} role="tab" aria-selected={active === id} onClick={() => setRoom(id)} className={clsx('flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-bold transition', active === id ? (id === 'vip' ? 'bg-violet-400/20 text-violet-200' : 'bg-white/10 text-white') : 'text-slate-500 hover:text-slate-200')}>
          <Icon className="h-3.5 w-3.5" /> {label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <Panel
        title={t('nav.chat')}
        icon={MessagesSquare}
        action={
          <span className="flex items-center gap-3">
            {tabs}
            <span className="hidden items-center gap-1.5 text-xs font-semibold text-slate-400 sm:flex">
              <span className="h-2 w-2 rounded-full bg-neon-green" /> {t('chat.onlineCount', { count: online })}
            </span>
          </span>
        }
        bodyClassName="flex flex-col"
      >
        <ChatRoom key={active} room={active} className="h-[calc(100dvh-15rem)] min-h-[380px] lg:h-[calc(100dvh-12rem)]" />
      </Panel>

      <Panel title={t('chat.players')} icon={Users} className="hidden lg:flex" bodyClassName="max-h-[calc(100dvh-12rem)] overflow-y-auto p-2">
        <OnlineList />
      </Panel>
    </div>
  )
}
