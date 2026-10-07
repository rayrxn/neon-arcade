import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import clsx from 'clsx'
import Logo from '@/components/ui/Logo'
import { ADMIN_ITEM, NAV_GROUPS, NAV_ITEMS, SETTINGS_ITEM } from '@/config/navigation'
import { useBellNotifications } from '@/store/useNotificationStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useCurrentUser } from '@/store/useAuthStore'
import { isStaff } from '@/config/roles'
import { SERVER_MODE } from '@/config/runtime'
import { useT } from '@/i18n'
import { BUILD, formatRelease } from '@/config/build'
import { openUpdateLog } from '@/components/updates/UpdateLog'
import { usePrefsStore } from '@/store/usePrefsStore'

const SPRING = { type: 'spring', stiffness: 520, damping: 40 }

function NavItem({ item, layoutId, badge, rail, onTip }) {
  const { t } = useT()
  const Icon = item.icon
  const label = t(item.labelKey)
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className="group relative block rounded-xl focus-ring"
      aria-label={rail ? label : undefined}
      onMouseEnter={rail ? (e) => onTip?.({ label, top: e.currentTarget.getBoundingClientRect().top + 22 }) : undefined}
      onMouseLeave={rail ? () => onTip?.(null) : undefined}
      onFocus={rail ? (e) => onTip?.({ label, top: e.currentTarget.getBoundingClientRect().top + 22 }) : undefined}
      onBlur={rail ? () => onTip?.(null) : undefined}
    >
      {({ isActive }) => (
        <span
          className={clsx(
            'relative flex items-center rounded-xl text-sm font-semibold transition-colors',
            rail ? 'mx-auto h-11 w-11 justify-center' : 'gap-3 px-3 py-2.5',
            isActive ? 'text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white',
          )}
        >
          {isActive && (
            <>
              <motion.span layoutId={layoutId} transition={SPRING} className={clsx('absolute inset-0 rounded-xl ring-1 ring-inset', rail ? 'bg-neon-cyan/15 ring-neon-cyan/30' : 'bg-white/[0.07] ring-white/10')} />
              {!rail && <motion.span layoutId={`${layoutId}-bar`} transition={SPRING} className="absolute -left-3 bottom-2.5 top-2.5 w-[3px] rounded-r-full bg-neon-cyan" />}
            </>
          )}
          <Icon className={clsx('relative h-[18px] w-[18px] shrink-0 transition-colors', isActive ? 'text-neon-cyan' : 'text-slate-500 group-hover:text-slate-300')} />
          {!rail && <span className="relative flex-1 truncate">{label}</span>}
          {rail ? badge && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-neon-red ring-2 ring-ink-950" /> : badge}
        </span>
      )}
    </NavLink>
  )
}

function SidebarContent({ idPrefix, onClose, rail = false, onToggle }) {
  const { t, lang } = useT()
  const layoutId = `${idPrefix}-nav`
  const me = useCurrentUser()
  const isStaffUser = isStaff(me?.role)
  const unread = useBellNotifications(me?.id).filter((n) => !n.read).length
  const requests = usePlatformStore((s) => s.friendships.filter((f) => f.status === 'pending' && f.to === me?.id).length)
  const counts = { '/notifications': unread, '/friends': requests }
  const [tip, setTip] = useState(null)
  return (
    <div className="flex h-full flex-col">
      {rail && tip && <span className="rail-tip" role="tooltip" style={{ top: tip.top }}>{tip.label}</span>}
      <div className={clsx('flex h-16 shrink-0 items-center border-b hairline', rail ? 'justify-center px-2' : 'justify-between gap-2 px-4')}>
        {onToggle && (
          <button onClick={onToggle} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-300 transition hover:bg-white/[0.06] hover:text-white focus-ring" aria-label={rail ? t('nav.expand') : t('nav.collapse')} aria-expanded={!rail}>
            <Menu className="h-5 w-5" />
          </button>
        )}
        {!rail && (
          <NavLink to="/" aria-label="Neon Arcade" className="mr-auto">
            <Logo />
          </NavLink>
        )}
        {onClose && (
          <button onClick={onClose} className="-mr-2 grid h-10 w-10 place-items-center rounded-xl text-slate-400 hover:bg-white/5 hover:text-white" aria-label={t('common.close')}>
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className={clsx('flex-1 overflow-y-auto py-4', rail ? 'space-y-2 px-2' : 'space-y-5 px-3')} aria-label={t('nav.label')} style={{ scrollbarWidth: 'thin' }}>
        {NAV_GROUPS.map((group, gi) => (
          <div key={group}>
            {rail ? gi > 0 && <span className="mx-auto mb-2 block h-px w-8 bg-white/10" aria-hidden="true" /> : <p className="label-caps mb-2 px-3">{t(`nav.groups.${group}`)}</p>}
            <div className={rail ? 'space-y-1' : 'space-y-0.5'}>
              {NAV_ITEMS.filter((n) => n.group === group).map((item) => (
                <NavItem key={item.to} rail={rail} onTip={setTip} item={item} layoutId={layoutId} badge={counts[item.to] > 0 && <span className="relative rounded-full bg-neon-red px-1.5 text-[10px] font-bold text-white [color:#fff]">{counts[item.to] > 9 ? '9+' : counts[item.to]}</span>} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className={clsx('shrink-0 border-t hairline', rail ? 'space-y-1 p-2' : 'space-y-2 p-3')}>
        <NavItem item={SETTINGS_ITEM} layoutId={layoutId} rail={rail} onTip={setTip} />
        {isStaffUser && <NavItem item={ADMIN_ITEM} layoutId={layoutId} rail={rail} onTip={setTip} />}
        {!rail && <p className="px-3 text-[11px] text-slate-600">{SERVER_MODE ? 'arcadebet.my.id' : t('nav.localMode')} · <NavLink to="/status" className="underline-offset-2 hover:text-slate-300 hover:underline">{t('status.title')}</NavLink></p>}
        {rail ? (
          <button type="button" onClick={openUpdateLog} className="block w-full text-center font-mono text-[9px] font-bold text-slate-600 hover:text-slate-300" title={t('updates.title')}>v{BUILD.version}</button>
        ) : (
          <button type="button" onClick={openUpdateLog} className="site-version group flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[11px] text-slate-500 transition hover:bg-white/[0.04] hover:text-slate-300">
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-300 group-hover:text-white">v{BUILD.version}</span>
            <span className="min-w-0 truncate">{BUILD.at ? t('updates.released', { time: formatRelease(BUILD.at, lang) }) : t('updates.title')}</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default function Sidebar({ open, onClose }) {
  const collapsed = usePrefsStore((s) => !!s.sidebarCollapsed)
  const toggle = usePrefsStore((s) => s.toggleSidebar)
  // Width of the desktop sidebar, used by the header and the page padding.
  useEffect(() => {
    document.documentElement.style.setProperty('--sb-w', collapsed ? '76px' : '248px')
  }, [collapsed])

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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[var(--sb-w,248px)] border-r hairline bg-ink-950/80 backdrop-blur-xl transition-[width] duration-200 lg:block">
        <SidebarContent idPrefix="desktop" rail={collapsed} onToggle={toggle} />
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
