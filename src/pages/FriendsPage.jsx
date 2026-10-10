import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Check, Trophy, UserMinus, UserPlus, Users, X } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { DemoTag, EmptyState, Panel } from '@/components/ui/Controls'
import { PageHeader, QueryView, useQuery } from '@/components/ui/PageKit'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { toast } from '@/store/useUiStore'
import { acceptFriend, blockUser, declineFriend, friendList, incomingRequests, outgoingRequests, removeFriend, sendFriendRequest, unblockUser } from '@/services/social'
import { getGameName } from '@/config/games'
import { useNow } from '@/hooks/useNow'
import { timeAgo } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'
import { PlayerName } from '@/components/ui/Identity'

export default function FriendsPage() {
  const { t } = useT()
  const me = useCurrentUser()
  const users = useAuthStore((s) => s.users)
  const platform = usePlatformStore()
  const now = useNow(30_000)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirm, setConfirm] = useState(null) // { kind: 'remove'|'block', user }
  const byId = Object.fromEntries(Object.values(users).map((u) => [u.id, u]))

  const query = useQuery(() => friendList(me.id, platform, now), [platform.friendships, platform.presence, platform.blocks, me?.id, now])
  const incoming = incomingRequests(me.id, platform)
  const outgoing = outgoingRequests(me.id, platform)
  const blocked = (platform.blocks[me.id] ?? []).map((id) => byId[id]).filter(Boolean)

  const act = async (fn, okKey) => {
    try {
      await fn()
      if (okKey) toast({ tone: 'success', title: t(okKey) })
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    }
  }

  const add = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const res = await sendFriendRequest(name)
      toast({ tone: 'success', title: res.status === 'pending' ? t('friends.sent') : t('friends.accepted') })
      setName('')
    } catch (err) {
      setError(t(errorKey(err), err?.vars))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('friends.title')} subtitle={t('friends.subtitle')} actions={<Link to="/leaderboard" className="inline-flex items-center gap-1.5 text-xs font-bold text-neon-cyan hover:underline"><Trophy className="h-4 w-4" /> {t('friends.leaderboard')}</Link>} />

      <form onSubmit={add} className="glass flex flex-col gap-2 rounded-2xl p-4 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <label htmlFor="friend-name" className="sr-only">{t('friends.username')}</label>
          <input id="friend-name" value={name} onChange={(e) => { setName(e.target.value); setError(null) }} placeholder={t('friends.placeholder')} autoComplete="off" className="input-shell h-11 w-full px-3.5 text-sm text-white outline-none placeholder:text-slate-600" />
          {error && <p className="mt-1.5 text-xs font-semibold text-neon-red" role="alert">{error}</p>}
        </div>
        <Button type="submit" loading={busy} disabled={name.trim().length < 3}><UserPlus className="h-4 w-4" /> {t('friends.add')}</Button>
      </form>

      {(incoming.length > 0 || outgoing.length > 0) && (
        <Panel title={t('friends.requests')} icon={UserPlus}>
          <ul className="divide-y divide-white/[0.05]">
            {incoming.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar user={byId[r.from]} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{byId[r.from]?.displayName}</p>
                  <p className="text-[11px] text-slate-500">{t('friends.incoming')} · {timeAgo(r.at, now)}</p>
                </div>
                <Button size="xs" onClick={() => act(() => acceptFriend(r.id), 'friends.accepted')}><Check className="h-3.5 w-3.5" /> {t('friends.accept')}</Button>
                <Button size="xs" variant="ghost" onClick={() => act(() => declineFriend(r.id))} aria-label={t('friends.decline')}><X className="h-3.5 w-3.5" /></Button>
              </li>
            ))}
            {outgoing.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar user={byId[r.to]} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{byId[r.to]?.displayName}</p>
                  <p className="text-[11px] text-slate-500">{t('friends.outgoing')} · {timeAgo(r.at, now)}</p>
                </div>
                <Button size="xs" variant="ghost" onClick={() => act(() => declineFriend(r.id))}>{t('friends.cancel')}</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title={t('friends.list', { n: query.data?.length ?? 0 })} icon={Users}>
        <QueryView query={query} rows={4} empty={<EmptyState icon={Users} title={t('friends.empty')} body={t('friends.emptyBody')} />}>
          {(list) => (
            <ul className="divide-y divide-white/[0.05]">
              {list.map((f) => (
                <li key={f.user.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <Avatar user={f.user} size="md" online={f.online} />
                  <Link to={`/u/${f.user.username}`} className="min-w-0 flex-1 hover:underline">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-white"><PlayerName user={f.user} /> {f.user.isDemo && <DemoTag />}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {f.online ? t('chat.online') : t('chat.lastSeen', { time: timeAgo(f.lastSeen ?? 0, now) })}
                      {f.recentGame && ` · ${t('friends.recent', { game: getGameName(f.recentGame) })}`}
                    </p>
                  </Link>
                  <Button size="xs" variant="subtle" onClick={() => setConfirm({ kind: 'remove', user: f.user })} aria-label={t('friends.remove')}><UserMinus className="h-4 w-4" /></Button>
                  <Button size="xs" variant="subtle" onClick={() => setConfirm({ kind: 'block', user: f.user })} aria-label={t('friends.block')}><Ban className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Panel>

      {blocked.length > 0 && (
        <Panel title={t('friends.blocked')} icon={Ban}>
          <ul className="divide-y divide-white/[0.05]">
            {blocked.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                <Avatar user={u} size="sm" />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-300">@{u.username}</p>
                <Button size="xs" variant="ghost" onClick={() => act(() => unblockUser(u.id), 'friends.unblocked')}>{t('friends.unblock')}</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.kind === 'block' ? t('friends.blockTitle', { user: confirm?.user?.username }) : t('friends.removeTitle', { user: confirm?.user?.username })}
        body={confirm?.kind === 'block' ? t('friends.blockBody') : t('friends.removeBody')}
        confirmLabel={confirm?.kind === 'block' ? t('friends.block') : t('friends.remove')}
        onConfirm={() => act(() => (confirm.kind === 'block' ? blockUser(confirm.user.id) : removeFriend(confirm.user.id)), confirm.kind === 'block' ? 'friends.blockedToast' : 'friends.removed')}
      />
    </div>
  )
}
