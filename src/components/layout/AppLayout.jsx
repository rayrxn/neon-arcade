import { useCallback, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import Header from './Header'
import Sidebar from './Sidebar'
import MobileTabBar from './MobileTabBar'
import ModalHost from '@/components/modals/ModalHost'
import SystemBanners from './SystemBanners'
import { setMusicDuck } from '@/services/sound'
import MaintenanceScreen from './MaintenanceScreen'
import LevelUpOverlay from '@/components/progress/LevelUpOverlay'
import { ErrorBoundary } from '@/components/ui/PageKit'
import { useAdminStore } from '@/store/useAdminStore'
import { useCurrentUser } from '@/store/useAuthStore'
import { isStaff } from '@/config/roles'
import { maintenanceActive } from '@/services/system'
import { useNow } from '@/hooks/useNow'

export default function AppLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { pathname } = useLocation()
  const closeDrawer = useCallback(() => setDrawerOpen(false), [])
  const user = useCurrentUser()
  useAdminStore((s) => s.system?.maintenance)
  const now = useNow(15_000)
  const locked = maintenanceActive(now) && !isStaff(user?.role) && !pathname.startsWith('/support')

  useEffect(() => {
    setMusicDuck(pathname.startsWith('/games/'))
    setDrawerOpen(false)
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="min-h-dvh">
      <Sidebar open={drawerOpen} onClose={closeDrawer} />

      <div className="lg:pl-[248px]">
        <Header onMenu={() => setDrawerOpen(true)} />
        <main className="px-4 pb-28 pt-[84px] sm:px-6 lg:px-8 lg:pb-16 lg:pt-24">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="mx-auto max-w-6xl space-y-4"
          >
            <SystemBanners />
            <ErrorBoundary resetKey={pathname} name={pathname}>
              {locked ? <MaintenanceScreen /> : <Outlet />}
            </ErrorBoundary>
          </motion.div>
        </main>
      </div>

      <MobileTabBar />
      <ModalHost />
      <LevelUpOverlay />
    </div>
  )
}
