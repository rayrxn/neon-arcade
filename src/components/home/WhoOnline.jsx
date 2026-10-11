import { Link } from 'react-router-dom'
import { Users } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import { Panel } from '@/components/ui/Controls'
import { useAuthStore } from '@/store/useAuthStore'
import { isOnline, usePlatformStore } from '@/store/usePlatformStore'
import { botsOnline, useBotsEnabled } from '@/services/bots'
import { getGame } from '@/config/games'
import { useNow } from '@/hooks/useNow'
import { useT } from '@/i18n'

/** Who's online: real players seen in the last minutes, then house bots (tagged BOT) with the game they are on. */
export default function WhoOnline() {
  const { t } = useT()
  const now = useNow(30_000)
  const users = useAuthStore((s) => s.users)
  const presence = usePlatformStore((s) => s.presence) ?? {}
  const bots = useBotsEnabled()
  const real = Object.values(users ?? {}).filter((u) => u?.id && isOnline(presence, u.id, now))
  const list = [...real.map((u) => ({ user: u })), ...(bots ? botsOnline(now).map((b) => ({ user: b, bot: true, playing: b.playing })) : [])]
  return (
    <Panel title={`${t('online.title')} — ${list.length}`} icon={Users} bodyClassName="max-h-[360px] overflow-y-auto p-2">
      <ul className="space-y-0.5">
        {list.map(({ user, bot, playing }) => (
          <li key={user.id} className="flex items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-white/[0.04]">
            <Avatar user={user} size="sm" online />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-100">
                {user.displayName || user.username}
              </p>
              {playing && <Link to={`/games/${playing}`} className="block truncate text-[11px] text-slate-500 hover:text-neon-cyan">{t('online.playing', { game: getGame(playing)?.name ?? playing })}</Link>}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  )
}
