import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FlaskConical, Megaphone, Wrench, X } from 'lucide-react'
import clsx from 'clsx'
import { useCurrentUser } from '@/store/useAuthStore'
import { activeAnnouncements, useAdminStore } from '@/store/useAdminStore'
import { useNow } from '@/hooks/useNow'
import { useT } from '@/i18n'

const TONE = {
  info: 'bg-neon-cyan/[0.08] ring-neon-cyan/25 text-neon-cyan',
  event: 'bg-neon-purple/[0.08] ring-neon-purple/30 text-neon-purple',
  update: 'bg-neon-green/[0.08] ring-neon-green/25 text-neon-green',
  maintenance: 'bg-neon-gold/[0.08] ring-neon-gold/30 text-neon-gold',
}

const dismissedKey = 'neon-arcade:dismissed-announcements'
const readDismissed = () => {
  try {
    return JSON.parse(localStorage.getItem(dismissedKey) || '[]')
  } catch {
    return []
  }
}

/** Banner test mode + pengumuman aktif (global announcement area). */
export default function SystemBanners() {
  const { t } = useT()
  const user = useCurrentUser()
  const list = useAdminStore((s) => s.announcements)
  const now = useNow(60_000)
  const [dismissed, setDismissed] = useState(readDismissed)
  const active = activeAnnouncements(list, now).filter((a) => !dismissed.includes(a.id)).slice(0, 2)

  const dismiss = (id) => {
    const next = [...dismissed, id]
    setDismissed(next)
    try {
      localStorage.setItem(dismissedKey, JSON.stringify(next.slice(-50)))
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-2 empty:hidden">
      {user?.isTest && (
        <div className="flex items-center gap-2.5 rounded-xl bg-neon-gold/15 px-4 py-2.5 text-sm font-bold text-neon-gold ring-1 ring-inset ring-neon-gold/40" role="status">
          <FlaskConical className="h-4 w-4 shrink-0" />
          <span className="flex-1">TEST MODE — RESULTS ARE SIMULATED</span>
          <span className="rounded-md bg-neon-gold/15 px-2 py-0.5 font-mono text-[11px] uppercase">force: {user.testControl ?? 'off'}</span>
        </div>
      )}
      <AnimatePresence initial={false}>
        {active.map((a) => {
          const Icon = a.type === 'maintenance' ? Wrench : Megaphone
          return (
            <motion.div key={a.id} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} className={clsx('flex items-start gap-3 rounded-xl px-4 py-3 ring-1 ring-inset', TONE[a.type] ?? TONE.info)}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">{a.title}</p>
                <p className="mt-0.5 text-sm text-slate-300">{a.message}</p>
              </div>
              <button onClick={() => dismiss(a.id)} className="rounded-md p-1 text-slate-400 hover:text-white" aria-label={t('common.close')}>
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
