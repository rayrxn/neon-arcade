import { NavLink } from 'react-router-dom'
import { motion } from 'framer-motion'
import clsx from 'clsx'
import { MOBILE_TABS } from '@/config/navigation'
import { useT } from '@/i18n'

/** Navigasi bawah untuk HP & tablet kecil — 5 tujuan utama, sisanya di menu samping. */
export default function MobileTabBar() {
  const { t } = useT()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t hairline bg-ink-950/90 backdrop-blur-xl lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label={t('nav.label')}
    >
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
        {MOBILE_TABS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className="relative flex flex-col items-center justify-center gap-1 focus-ring">
              {({ isActive }) => (
                <>
                  {isActive && <motion.span layoutId="tab-indicator" className="absolute top-0 h-0.5 w-8 rounded-full bg-neon-cyan" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                  <Icon className={clsx('h-5 w-5', isActive ? 'text-neon-cyan' : 'text-slate-500')} />
                  <span className={clsx('text-[10px] font-bold', isActive ? 'text-white' : 'text-slate-500')}>{t(item.labelKey)}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
