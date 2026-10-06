import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { accountBlock, sessionValid, useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useWalletStore } from '@/store/useWalletStore'
import { toast } from '@/store/useUiStore'
import { can } from '@/config/roles'
import { t } from '@/i18n'

/**
 * Gerbang semua halaman yang butuh login. Memastikan dompet aktif = user aktif,
 * dan mengeluarkan akun yang di-ban / dibekukan admin saat itu juga.
 * `permission` → rute khusus staf (mis. /admin).
 */
export default function RequireAuth({ permission }) {
  const session = useAuthStore((s) => s.session)
  const user = useCurrentUser()
  const logout = useAuthStore((s) => s.logout)
  const activeUserId = useWalletStore((s) => s.activeUserId)
  const activate = useWalletStore((s) => s.activate)
  const location = useLocation()
  const block = accountBlock(user)
  const expired = !!session && !sessionValid(session)

  useEffect(() => {
    if (session && activeUserId !== session.userId) activate(session.userId)
  }, [session, activeUserId, activate])

  useEffect(() => {
    if (!block) return
    toast({ tone: 'error', title: t(block.code, { ...block.vars, until: block.vars.until ? new Date(block.vars.until).toLocaleString() : '' }) })
    logout()
  }, [block, logout])

  useEffect(() => {
    if (!expired) return
    toast({ tone: 'error', title: t('errors.sessionExpired') })
    logout('expired')
  }, [expired, logout])

  if (!session || block || expired) return <Navigate to="/auth" replace state={{ from: location.pathname }} />
  if (permission && !can(user?.role, permission)) return <Navigate to="/" replace />
  return <Outlet />
}
