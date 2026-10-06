import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, X, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useUiStore } from '@/store/useUiStore'
import { useT } from '@/i18n'

const TONES = {
  success: { icon: CheckCircle2, cls: 'text-neon-green' },
  error: { icon: XCircle, cls: 'text-neon-red' },
  info: { icon: Info, cls: 'text-neon-cyan' },
}

export default function Toaster() {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismissToast)
  const { t } = useT()

  return (
    <div className="pointer-events-none fixed inset-x-3 top-[calc(4.5rem+env(safe-area-inset-top,0px))] z-[70] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-6 sm:items-end" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((item) => {
          const tone = TONES[item.tone] ?? TONES.info
          const Icon = tone.icon
          return (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: -10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              className="glass-strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3"
            >
              <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', tone.cls)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">{item.title}</p>
                {item.body && <p className="mt-0.5 text-xs text-slate-400">{item.body}</p>}
              </div>
              <button onClick={() => dismiss(item.id)} className="-mr-1 rounded-md p-1 text-slate-500 hover:text-white" aria-label={t('common.close')}>
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
