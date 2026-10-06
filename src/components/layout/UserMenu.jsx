import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, LogOut, Settings, ShieldHalf, UserRound, Wallet } from 'lucide-react'
import { isStaff } from '@/config/roles'
import clsx from 'clsx'
import Avatar from '@/components/ui/Avatar'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useT } from '@/i18n'

export default function UserMenu() {
  const { t } = useT()
  const user = useCurrentUser()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const ref = useRef(null)

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

  const links = [
    { to: '/profile', icon: UserRound, label: t('nav.profile') },
    { to: '/wallet', icon: Wallet, label: t('nav.wallet') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
    ...(isStaff(user?.role) ? [{ to: '/admin', icon: ShieldHalf, label: t('nav.admin') }] : []),
  ]

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('nav.account')}
        className="flex items-center gap-2 rounded-xl p-0.5 transition hover:bg-white/[0.05] sm:p-1 sm:pr-2.5 focus-ring"
      >
        <Avatar user={user} size="sm" />
        <span className="hidden max-w-[120px] truncate text-sm font-semibold text-slate-200 xl:block">{user?.displayName}</span>
        <ChevronDown className={clsx('hidden h-4 w-4 text-slate-500 transition-transform sm:block', open && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            style={{ transformOrigin: 'top right' }}
            className="glass-strong absolute right-0 z-50 mt-2 w-60 rounded-2xl p-2"
          >
            <div className="flex items-center gap-3 px-2 py-2">
              <Avatar user={user} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{user?.displayName}</p>
                <p className="truncate text-xs text-slate-500">@{user?.username}</p>
              </div>
            </div>
            <div className="my-1.5 h-px bg-white/[0.06]" />
            {links.map(({ to, icon: Icon, label }) => (
              <Link key={to} to={to} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.06] hover:text-white">
                <Icon className="h-4 w-4 text-slate-500" /> {label}
              </Link>
            ))}
            <div className="my-1.5 h-px bg-white/[0.06]" />
            <button
              role="menuitem"
              onClick={() => {
                setOpen(false)
                setConfirm(true)
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-300 transition hover:bg-neon-red/10 hover:text-neon-red"
            >
              <LogOut className="h-4 w-4" /> {t('common.logout')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('logout.title')}
        body={t('logout.body')}
        confirmLabel={t('common.logout')}
        onConfirm={() => {
          logout()
          navigate('/auth', { replace: true })
        }}
      />
    </div>
  )
}
