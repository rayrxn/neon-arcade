import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, ArrowLeft, Award, ChartColumn, CalendarCheck, FileText, FlaskConical, Gamepad2, Gift, LayoutDashboard,
  ListChecks, Megaphone, Menu, MessagesSquare, ScrollText, Settings, ShieldAlert, ShieldBan, Ticket, Users, Wallet, X, LifeBuoy, Server, Gavel,
  Filter, Coins, WalletCards, BadgeCheck, ShoppingBag, Smile, Target, Gem, ChevronDown, ToggleRight, Bug, ClipboardCheck,
} from 'lucide-react'
import clsx from 'clsx'
import Avatar from '@/components/ui/Avatar'
import { useCurrentUser } from '@/store/useAuthStore'
import { can } from '@/config/roles'
import { SERVER_MODE } from '@/config/runtime'
import { ErrorBoundary } from '@/components/ui/PageKit'
import { adminSync } from '@/services/server'
import { logAdminLogin } from '@/services/admin'
import { useT } from '@/i18n'
import RoleTag from '@/components/ui/RoleTag'

/** Menu admin + permission yang dibutuhkan. Menu yang tidak boleh diakses tidak ditampilkan. */
export const ADMIN_SECTIONS = [
  // Overview
  { path: '', key: 'dashboard', icon: LayoutDashboard, perm: 'dashboard', group: 'overview' },
  { path: 'analytics', key: 'analytics', icon: ChartColumn, perm: 'analytics', group: 'overview' },
  { path: 'logs', key: 'logs', icon: ScrollText, perm: 'logs.view', group: 'overview' },
  // Players & money
  { path: 'users', key: 'users', icon: Users, perm: 'users.view', group: 'players' },
  { path: 'wallets', key: 'wallets', icon: Wallet, perm: 'wallet.manage', group: 'players' },
  { path: 'loyalty', key: 'loyalty', icon: WalletCards, perm: 'loyalty.manage', group: 'players' },
  { path: 'player-roles', key: 'playerRoles', icon: BadgeCheck, perm: 'playerroles.manage', group: 'players' },
  { path: 'memberships', key: 'memberships', icon: Gem, perm: 'memberships.manage', group: 'players' },
  { path: 'economy', key: 'economy', icon: Coins, perm: 'economy.manage', group: 'players' },
  // Games & fairness
  { path: 'games', key: 'games', icon: Gamepad2, perm: 'games.manage', group: 'games' },
  { path: 'sessions', key: 'sessions', icon: Activity, perm: 'sessions.view', group: 'games' },
  { path: 'anticheat', key: 'anticheat', icon: ShieldAlert, perm: ['anticheat', 'security.review'], group: 'games' },
  { path: 'testmode', key: 'testmode', icon: FlaskConical, perm: 'testmode', group: 'games' },
  // Community
  { path: 'moderation', key: 'moderation', icon: Gavel, perm: 'reports.view', group: 'community' },
  { path: 'reports', key: 'reports', icon: FileText, perm: 'moderation', group: 'community' },
  { path: 'chat', key: 'chat', icon: MessagesSquare, perm: 'moderation', group: 'community' },
  { path: 'chat-filter', key: 'chatFilter', icon: Filter, perm: 'moderation.config', group: 'community' },
  { path: 'restrictions', key: 'restrictions', icon: ShieldBan, perm: 'moderation', group: 'community' },
  { path: 'support', key: 'support', icon: LifeBuoy, perm: 'support.manage', group: 'community' },
  { path: 'announcements', key: 'announcements', icon: Megaphone, perm: 'announcements.manage', group: 'community' },
  // Rewards & store
  { path: 'rewards', key: 'rewards', icon: Gift, perm: 'rewards.view', group: 'rewards' },
  { path: 'daily', key: 'daily', icon: CalendarCheck, perm: 'rewards.view', group: 'rewards' },
  { path: 'quests', key: 'quests', icon: ListChecks, perm: 'rewards.view', group: 'rewards' },
  { path: 'achievements', key: 'achievements', icon: Award, perm: 'rewards.view', group: 'rewards' },
  { path: 'missions', key: 'missions', icon: Target, perm: 'rewards.manage', group: 'rewards' },
  { path: 'codes', key: 'codes', icon: Ticket, perm: 'codes.manage', group: 'rewards' },
  { path: 'shop', key: 'shop', icon: ShoppingBag, perm: 'shop.manage', group: 'rewards' },
  { path: 'emotes', key: 'emotes', icon: Smile, perm: 'emotes.manage', group: 'rewards' },
  // Site
  { path: 'system', key: 'system', icon: Server, perm: 'system.manage', group: 'system' },
  { path: 'features', key: 'features', icon: ToggleRight, perm: 'features.manage', group: 'system' },
  { path: 'monitoring', key: 'monitoring', icon: Bug, perm: ['errors.view', 'system.manage'], group: 'system' },
  { path: 'qa', key: 'qa', icon: ClipboardCheck, perm: 'qa.run', group: 'system' },
  { path: 'settings', key: 'settings', icon: Settings, perm: 'dashboard', group: 'system' },
]
export const ADMIN_GROUPS = ['overview', 'players', 'games', 'community', 'rewards', 'system']

function Nav({ onNavigate }) {
  const { t } = useT()
  const user = useCurrentUser()
  const { pathname } = useLocation()
  const visible = ADMIN_SECTIONS.filter((s) => can(user?.role, s.perm))
  const activeGroup = visible.find((s) => (s.path ? pathname.startsWith(`/admin/${s.path}`) : pathname === '/admin'))?.group ?? 'overview'
  const [open, setOpen] = useState(() => new Set([activeGroup]))
  useEffect(() => setOpen((o) => (o.has(activeGroup) ? o : new Set([...o, activeGroup]))), [activeGroup])
  const toggle = (g) => setOpen((o) => {
    const n = new Set(o)
    if (n.has(g)) n.delete(g)
    else n.add(g)
    return n
  })
  return (
    <nav className="space-y-1 p-2" aria-label="Admin">
      {ADMIN_GROUPS.map((g) => {
        const items = visible.filter((s) => s.group === g)
        if (!items.length) return null
        const isOpen = open.has(g)
        return (
          <div key={g}>
            <button type="button" onClick={() => toggle(g)} aria-expanded={isOpen} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition hover:bg-white/[0.03]">
              <span>
                <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{t(`admin.groups.${g}`)}</span>
                {!isOpen && <span className="block text-[11px] text-slate-600">{t(`admin.groupHints.${g}`)}</span>}
              </span>
              <ChevronDown className={clsx('h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform', isOpen && 'rotate-180')} />
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden">
                  <div className="space-y-0.5 pb-2 pl-1">
                    {items.map((s) => (
                      <NavLink
                        key={s.key}
                        to={`/admin${s.path ? `/${s.path}` : ''}`}
                        end={!s.path}
                        onClick={onNavigate}
                        className={({ isActive }) => clsx('flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition', isActive ? 'bg-white/[0.08] text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200')}
                      >
                        <s.icon className="h-4 w-4 shrink-0" />
                        {t(`admin.nav.${s.key}`)}
                      </NavLink>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}
    </nav>
  )
}

export default function AdminLayout() {
  const { t } = useT()
  const user = useCurrentUser()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    logAdminLogin()
    if (!SERVER_MODE) return
    // Data admin asli dari server: dimuat saat panel dibuka, lalu disegarkan tiap 20 detik.
    adminSync()
    const id = setInterval(() => document.visibilityState === 'visible' && adminSync(), 20_000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    setOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  const head = (
    <div className="flex h-14 items-center gap-2.5 border-b hairline px-4">
      <span className="grid h-7 w-7 place-items-center rounded-md bg-neon-red/15 font-mono text-[11px] font-bold text-neon-red">AD</span>
      <span className="text-sm font-bold text-white">Neon Arcade</span>
      <span className="text-sm text-slate-500">Admin</span>
    </div>
  )

  return (
    <div className="min-h-dvh bg-ink-950">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r hairline bg-ink-900 lg:flex">
        {head}
        <div className="flex-1 overflow-y-auto"><Nav /></div>
        <Link to="/" className="flex items-center gap-2 border-t hairline px-5 py-3 text-xs font-semibold text-slate-400 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" /> {t('admin.backToApp')}
        </Link>
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.div className="fixed inset-0 z-40 bg-black/60 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
            <motion.aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r hairline bg-ink-900 lg:hidden" initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', stiffness: 380, damping: 40 }}>
              <div className="flex items-center justify-between pr-2">
                {head}
                <button onClick={() => setOpen(false)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400" aria-label={t('common.close')}><X className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto"><Nav onNavigate={() => setOpen(false)} /></div>
              <Link to="/" className="flex items-center gap-2 border-t hairline px-5 py-3 text-xs font-semibold text-slate-400"><ArrowLeft className="h-3.5 w-3.5" /> {t('admin.backToApp')}</Link>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b hairline bg-ink-950/90 px-4 backdrop-blur sm:px-6" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
          <button onClick={() => setOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-300 lg:hidden" aria-label={t('nav.openMenu')}><Menu className="h-5 w-5" /></button>
          <span className="text-xs text-slate-500">{t(SERVER_MODE ? 'admin.serverMode' : 'admin.localMode')}</span>
          <div className="ml-auto flex items-center gap-2.5">
            <RoleTag role={user?.role} />
            <span className="hidden text-sm font-semibold text-slate-300 sm:block">{user?.username}</span>
            <Avatar user={user} size="sm" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <ErrorBoundary resetKey={pathname} name={`admin${pathname}`}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
