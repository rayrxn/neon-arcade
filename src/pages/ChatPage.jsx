import { MessagesSquare, Users } from 'lucide-react'
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <Panel
        title={t('nav.chat')}
        icon={MessagesSquare}
        action={
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <span className="h-2 w-2 rounded-full bg-neon-green" /> {t('chat.onlineCount', { count: online })}
          </span>
        }
        bodyClassName="flex flex-col"
      >
        <ChatRoom className="h-[calc(100dvh-15rem)] min-h-[380px] lg:h-[calc(100dvh-12rem)]" />
      </Panel>

      <Panel title={t('chat.players')} icon={Users} className="hidden lg:flex" bodyClassName="max-h-[calc(100dvh-12rem)] overflow-y-auto p-2">
        <OnlineList />
      </Panel>
    </div>
  )
}
