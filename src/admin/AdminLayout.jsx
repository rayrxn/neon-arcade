import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, ArrowLeft, Award, ChartColumn, CalendarCheck, FileText, FlaskConical, Gamepad2, Gift, LayoutDashboard,
  ListChecks, Megaphone, Menu, MessagesSquare, ScrollText, Settings, ShieldAlert, ShieldBan, Ticket, Users, Wallet, X, LifeBuoy, Server, Gavel,
} from 'lucide-react'
import clsx from 'clsx'
import Avatar from '@/components/ui/Avatar'
import { Badge, ROLE_TONE } from '@/components/admin/AdminKit'
import { useCurrentUser } from '@/store/useAuthStore'
import { can } from '@/config/roles'
import { logAdminLogin } from '@/services/admin'
import { useT } from '@/i18n'

/** Menu admin + permission yang dibutuhkan. Menu yang tidak boleh diakses tidak ditampilkan. */
export const ADMIN_SECTIONS = [
  { path: '', key: 'dashboard', icon: LayoutDashboard, perm: 'dashboard' },
  { path: 'users', key: 'users', icon: Users, perm: 'users.view' },
  { path: 'wallets', key: 'wallets', icon: Wallet, perm: 'wallet.manage' },
  { path: 'games', key: 'games', icon: Gamepad2, perm: 'games.manage' },
  { path: 'sessions', key: 'sessions', icon: Activity, perm: 'sessions.view' },
  { path: 'anticheat', key: 'anticheat', icon: ShieldAlert, perm: 'anticheat' },
  { path: 'moderation', key: 'moderation', icon: Gavel, perm: 'reports.view' },
  { path: 'restrictions', key: 'restrictions', icon: ShieldBan, perm: 'moderation' },
  { path: 'support', key: 'support', icon: LifeBuoy, perm: 'support.manage' },
  { path: 'rewards', key: 'rewards', icon: Gift, perm: 'rewards.view' },
  { path: 'daily', key: 'daily', icon: CalendarCheck, perm: 'rewards.view' },
  { path: 'quests', key: 'quests', icon: ListChecks, perm: 'rewards.view' },
  { path: 'achievements', key: 'achievements', icon: Award, perm: 'rewards.view' },
  { path: 'codes', key: 'codes', icon: Ticket, perm: 'codes.manage' },
  { path: 'chat', key: 'chat', icon: MessagesSquare, perm: 'moderation' },
  { path: 'announcements', key: 'announcements', icon: Megaphone, perm: 'announcements.manage' },
  { path: 'reports', key: 'reports', icon: FileText, perm: 'moderation' },
  { path: 'analytics', key: 'analytics', icon: ChartColumn, perm: 'analytics' },
  { path: 'logs', key: 'logs', icon: ScrollText, perm: 'logs.view' },
  { path: 'testmode', key: 'testmode', icon: FlaskConical, perm: 'testmode' },
  { path: 'system', key: 'system', icon: Server, perm: 'system.manage' },
  { path: 'settings', key: 'settings', icon: Settings, perm: 'dashboard' },
]

function Nav({ onNavigate }) {
  const { t } = useT()
  const user = useCurrentUser()
  return (
    <nav className="space-y-0.5 p-2" aria-label="Admin">
      {ADMIN_SECTIONS.filter((s) => can(user?.role, s.perm)).map((s) => (
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
          <span className="text-xs text-slate-500">{t('admin.localMode')}</span>
          <div className="ml-auto flex items-center gap-2.5">
            <Badge tone={ROLE_TONE[user?.role]}>{t(`admin.roles.${user?.role ?? 'user'}`)}</Badge>
            <span className="hidden text-sm font-semibold text-slate-300 sm:block">{user?.username}</span>
            <Avatar user={user} size="sm" />
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
