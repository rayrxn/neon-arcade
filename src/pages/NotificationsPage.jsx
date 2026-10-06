import { useMemo, useState } from 'react'
import { Bell, BellOff, CheckCheck, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { EmptyState, Panel, Segmented } from '@/components/ui/Controls'
import { PageHeader, QueryView, useQuery } from '@/components/ui/PageKit'
import { describeNotification } from '@/components/notifications/describe'
import { useCurrentUser } from '@/store/useAuthStore'
import { useNotificationStore, useBellNotifications } from '@/store/useNotificationStore'
import { useNow } from '@/hooks/useNow'
import { formatDateTime, timeAgo } from '@/utils/format'
import { useT } from '@/i18n'

const GROUPS = {
  progress: ['levelUp', 'quest', 'achievement', 'daily', 'reward'],
  social: ['friendRequest', 'friendAccept', 'mention'],
  account: ['security', 'reportUpdate', 'ticket', 'adminCredit', 'adminDebit'],
  wallet: ['transferIn', 'transferOut', 'transferPending', 'transferFailed', 'redeem', 'jackpot'],
}

export default function NotificationsPage() {
  const { t, lang } = useT()
  const user = useCurrentUser()
  const items = useBellNotifications(user?.id)
  const { markRead, markAllRead, clear } = useNotificationStore()
  const [filter, setFilter] = useState('all')
  const now = useNow(30_000)
  const query = useQuery(() => items, [items])
  const unread = items.filter((n) => !n.read).length
  const list = useMemo(
    () => (query.data ?? []).filter((n) => (filter === 'all' ? true : filter === 'unread' ? !n.read : filter === 'other' ? !Object.values(GROUPS).flat().includes(n.kind) : GROUPS[filter]?.includes(n.kind))),
    [query.data, filter],
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('notifications.title')}
        subtitle={t('notifications.subtitle', { n: unread })}
        actions={
          <>
            <Button size="sm" variant="ghost" disabled={!unread} onClick={() => markAllRead(user.id)}><CheckCheck className="h-4 w-4" /> {t('notifications.markAll')}</Button>
            <Button size="sm" variant="subtle" disabled={!items.length} onClick={() => clear(user.id)}><Trash2 className="h-4 w-4" /> {t('notifications.clear')}</Button>
          </>
        }
      />
      <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
        <Segmented size="sm" layoutId="notif-filter" value={filter} onChange={setFilter} className="w-max"
          options={['all', 'unread', 'progress', 'social', 'account', 'wallet', 'other'].map((v) => ({ value: v, label: t(`notifications.filters.${v}`) }))} />
      </div>
      <Panel title={t('notifications.history')} icon={Bell}>
        <QueryView query={{ ...query, data: query.data && list }} rows={5} empty={<EmptyState icon={BellOff} title={t('notifications.empty')} body={t('notifications.emptyBody')} />}>
          {(rows) => (
            <ul className="divide-y divide-white/[0.05]">
              {rows.map((n) => {
                const info = describeNotification(t, lang, n)
                const Icon = info.icon
                return (
                  <li key={n.id} className={clsx('flex gap-3 px-4 py-3 sm:px-5', !n.read && 'bg-white/[0.03]')}>
                    <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', info.tone)}><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-white">{info.title}</p>
                      <p className="mt-0.5 break-words text-xs text-slate-400">{info.body}</p>
                      <p className="mt-1 text-[11px] text-slate-600" title={formatDateTime(n.at)}>{timeAgo(n.at, now)}</p>
                    </div>
                    {!n.read ? (
                      <button onClick={() => markRead(user.id, n.id)} className="self-start rounded-lg px-2 py-1 text-[11px] font-bold text-neon-cyan hover:bg-neon-cyan/10 focus-ring">{t('notifications.markRead')}</button>
                    ) : (
                      <span className="self-start text-[11px] text-slate-600">{t('notifications.read')}</span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </QueryView>
      </Panel>
    </div>
  )
}
