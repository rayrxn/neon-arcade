import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, BellOff } from 'lucide-react'
import { Link } from 'react-router-dom'
import clsx from 'clsx'
import { useCurrentUser } from '@/store/useAuthStore'
import { useNotificationStore, useBellNotifications } from '@/store/useNotificationStore'
import { describeNotification } from '@/components/notifications/describe'
import { EmptyState } from '@/components/ui/Controls'
import { useNow } from '@/hooks/useNow'
import { timeAgo } from '@/utils/format'
import { useT } from '@/i18n'

export default function NotificationBell() {
  const { t, lang } = useT()
  const user = useCurrentUser()
  const items = useBellNotifications(user?.id)
  const markAllRead = useNotificationStore((s) => s.markAllRead)
  const markRead = useNotificationStore((s) => s.markRead)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const now = useNow(30_000)
  const unread = items.filter((n) => !n.read).length

  useEffect(() => {
    if (!open) return
    const onPointer = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    setOpen((o) => !o)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        aria-expanded={open}
        aria-label={t('notifications.title')}
        className="relative grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-white/[0.06] hover:text-white sm:h-10 sm:w-10 focus-ring"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-neon-red px-1 font-mono text-[9px] font-bold text-white [color:#fff]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="glass-strong fixed inset-x-3 top-[calc(4rem+env(safe-area-inset-top,0px))] z-50 overflow-hidden rounded-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-96"
          >
            <div className="flex items-center justify-between border-b hairline px-4 py-3">
              <p className="font-display text-sm font-bold text-white">{t('notifications.title')}</p>
              <div className="flex items-center gap-3">
                {unread > 0 && (
                  <button onClick={() => user && markAllRead(user.id)} className="text-xs font-semibold text-slate-500 hover:text-white">{t('notifications.markAll')}</button>
                )}
                <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs font-semibold text-neon-cyan hover:underline">{t('common.viewAll')}</Link>
              </div>
            </div>
            {items.length === 0 ? (
              <EmptyState icon={BellOff} title={t('notifications.empty')} body={t('notifications.emptyBody')} />
            ) : (
              <ul className="max-h-[60dvh] divide-y divide-white/[0.05] overflow-y-auto">
                {items.slice(0, 20).map((n) => {
                  const info = describeNotification(t, lang, n)
                  const Icon = info.icon
                  return (
                    <li key={n.id} onClick={() => !n.read && user && markRead(user.id, n.id)} className={clsx('flex cursor-default gap-3 px-4 py-3', !n.read && 'cursor-pointer bg-white/[0.03]')}>
                      <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', info.tone)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-white">{info.title}</p>
                        <p className="mt-0.5 break-words text-xs text-slate-400">{info.body}</p>
                        <p className="mt-1 text-[11px] text-slate-600">{timeAgo(n.at, now)}</p>
                      </div>
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-neon-cyan" />}
                    </li>
                  )
                })}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
