import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import clsx from 'clsx'
import Logo from '@/components/ui/Logo'
import { ADMIN_ITEM, NAV_GROUPS, NAV_ITEMS, SETTINGS_ITEM } from '@/config/navigation'
import { useNotifications } from '@/store/useNotificationStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useCurrentUser } from '@/store/useAuthStore'
import { isStaff } from '@/config/roles'
import { useT } from '@/i18n'

const SPRING = { type: 'spring', stiffness: 520, damping: 40 }

function NavItem({ item, layoutId, badge }) {
  const { t } = useT()
  const Icon = item.icon
  return (
    <NavLink to={item.to} end={item.end} className="group relative block rounded-xl focus-ring">
      {({ isActive }) => (
        <span
          className={clsx(
            'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
            isActive ? 'text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white',
          )}
        >
          {isActive && (
            <>
              <motion.span layoutId={layoutId} transition={SPRING} className="absolute inset-0 rounded-xl bg-white/[0.07] ring-1 ring-inset ring-white/10" />
              <motion.span layoutId={`${layoutId}-bar`} transition={SPRING} className="absolute -left-3 bottom-2.5 top-2.5 w-[3px] rounded-r-full bg-neon-cyan" />
            </>
          )}
          <Icon className={clsx('relative h-[18px] w-[18px] shrink-0 transition-colors', isActive ? 'text-neon-cyan' : 'text-slate-500 group-hover:text-slate-300')} />
          <span className="relative flex-1 truncate">{t(item.labelKey)}</span>
          {badge}
        </span>
      )}
    </NavLink>
  )
}

function SidebarContent({ idPrefix, onClose }) {
  const { t } = useT()
  const layoutId = `${idPrefix}-nav`
  const me = useCurrentUser()
  const isStaffUser = isStaff(me?.role)
  const unread = useNotifications(me?.id).filter((n) => !n.read).length
  const requests = usePlatformStore((s) => s.friendships.filter((f) => f.status === 'pending' && f.to === me?.id).length)
  const counts = { '/notifications': unread, '/friends': requests }
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center justify-between border-b hairline px-5">
        <NavLink to="/" aria-label="Neon Arcade">
          <Logo />
        </NavLink>
        {onClose && (
          <button onClick={onClose} className="-mr-2 grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white" aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5" aria-label={t('nav.label')}>
        {NAV_GROUPS.map((group) => (
          <div key={group}>
            <p className="label-caps mb-2 px-3">{t(`nav.groups.${group}`)}</p>
            <div className="space-y-0.5">
              {NAV_ITEMS.filter((n) => n.group === group).map((item) => (
                <NavItem key={item.to} item={item} layoutId={layoutId} badge={counts[item.to] > 0 && <span className="relative rounded-full bg-neon-red px-1.5 text-[10px] font-bold text-white [color:#fff]">{counts[item.to] > 9 ? '9+' : counts[item.to]}</span>} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t hairline p-3">
        <NavItem item={SETTINGS_ITEM} layoutId={layoutId} />
        {isStaffUser && <NavItem item={ADMIN_ITEM} layoutId={layoutId} />}
        <p className="px-3 text-[11px] text-slate-600">{t('nav.localMode')} · <NavLink to="/status" className="underline-offset-2 hover:text-slate-300 hover:underline">{t('status.title')}</NavLink></p>
      </div>
    </div>
  )
}

export default function Sidebar({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] border-r hairline bg-ink-950/80 backdrop-blur-xl lg:block">
        <SidebarContent idPrefix="desktop" />
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div key="backdrop" className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
            <motion.aside
              key="drawer"
              role="dialog"
              aria-modal="true"
              className="fixed inset-y-0 left-0 z-50 w-[84vw] max-w-[290px] border-r hairline bg-ink-900 lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            >
              <SidebarContent idPrefix="mobile" onClose={onClose} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  )
}
