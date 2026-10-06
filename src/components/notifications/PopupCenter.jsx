import { useEffect } from 'react'
import { Megaphone, ShieldAlert, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { useCurrentUser } from '@/store/useAuthStore'
import { POPUP_KINDS, useNotificationStore, useNotifications } from '@/store/useNotificationStore'
import { describeNotification } from './describe'
import { play } from '@/services/sound'
import { formatDateTime } from '@/utils/format'
import { useT } from '@/i18n'

const GOOD = new Set(['restored', 'unmuted', 'warningRemoved'])

/**
 * Moderation actions (ban, mute, warning, freeze…) and staff announcements appear as a pop-up
 * the moment they arrive, one at a time, oldest first. "Got it" marks them as read.
 */
export default function PopupCenter() {
  const { t, lang } = useT()
  const user = useCurrentUser()
  const items = useNotifications(user?.id)
  const markRead = useNotificationStore((s) => s.markRead)
  const pending = items.filter((n) => POPUP_KINDS.has(n.kind) && !n.read)
  const n = pending[pending.length - 1]

  useEffect(() => {
    if (n) play(n.kind === 'announcement' ? 'notification' : 'error')
  }, [n?.id])

  if (!n || !user) return null
  const d = describeNotification(t, lang, n)
  const announcement = n.kind === 'announcement'
  const good = GOOD.has(n.data?.event)
  const body = String(d.body ?? '').replace(/\s*(Reason|Alasan):\s*$/i, '')
  const Icon = announcement ? Megaphone : good ? ShieldCheck : ShieldAlert
  return (
    <Modal
      open
      locked
      onClose={() => {}}
      title={d.title}
      icon={<span className={clsx('grid h-11 w-11 place-items-center rounded-xl', announcement ? 'bg-neon-cyan/10 text-neon-cyan' : good ? 'bg-neon-green/10 text-neon-green' : 'bg-neon-red/10 text-neon-red')}><Icon className="h-5 w-5" /></span>}
      footer={<Button className="w-full" variant={announcement || good ? 'primary' : 'danger'} onClick={() => markRead(user.id, n.id)}>{t('popup.ok')}{pending.length > 1 ? ` (${pending.length - 1} ${t('popup.more')})` : ''}</Button>}
    >
      {body && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-200">{body}</p>}
      <p className="mt-3 text-[11px] text-slate-500">{announcement ? t('popup.fromStaff') : t('popup.fromModeration')} · {formatDateTime(n.at)}</p>
    </Modal>
  )
}
