import { createElement, isValidElement, useEffect, useId } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import clsx from 'clsx'
import { useT } from '@/i18n'

/**
 * Modal dasar: bottom sheet di HP, kartu di tengah mulai tablet.
 * Tutup lewat tombol X, klik backdrop, atau Esc (kecuali `locked`, mis. saat proses berjalan).
 */
export default function Modal({ open, onClose, title, description, icon, children, footer, size = 'md', locked = false }) {
  const { t } = useT()
  const titleId = useId()
  // `icon` boleh berupa elemen (<Bell />) atau komponen ikon (Bell) — komponen dirender di sini.
  const iconNode = !icon ? null : isValidElement(icon) ? icon : createElement(icon, { className: 'h-5 w-5 text-neon-gold' })

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && !locked && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [open, locked, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !locked && onClose()}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 32 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className={clsx(
              'glass-strong relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl sm:rounded-2xl',
              size === 'sm' ? 'sm:max-w-sm' : size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md',
            )}
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
            <div className="flex items-start gap-3 px-5 pb-2 pt-4 sm:px-6 sm:pt-6">
              {iconNode && <div className="mt-0.5 shrink-0">{iconNode}</div>}
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="font-display text-lg font-bold tracking-tight text-white">{title}</h2>
                {description && <p className="mt-1 text-sm text-slate-400">{description}</p>}
              </div>
              <button
                onClick={onClose}
                disabled={locked}
                className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                aria-label={t('common.close')}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-2 sm:px-6 sm:pb-6">{children}</div>
            {footer && <div className="flex gap-2 border-t hairline px-5 py-4 sm:px-6">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
