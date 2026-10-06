import { forwardRef, useId } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'

/** Input berlabel dengan ikon, slot kanan (mis. toggle password), dan pesan error beranimasi. */
const Field = forwardRef(function Field({ label, icon: Icon, error, trailing, hint, className, id, ...inputProps }, ref) {
  const autoId = useId()
  const inputId = id ?? autoId
  const errorId = `${inputId}-error`

  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold text-slate-400">
        <span>{label}</span>
        {hint}
      </label>

      <div className={clsx('input-shell group relative flex items-center', error && '!border-neon-red/60 !shadow-[0_0_0_3px_rgb(var(--neon-red)/0.12)]')}>
        {Icon && (
          <Icon className={clsx('pointer-events-none absolute left-3.5 h-4 w-4 transition-colors', error ? 'text-neon-red/80' : 'text-slate-500 group-focus-within:text-neon-cyan')} />
        )}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          className={clsx(
            'h-12 w-full rounded-xl bg-transparent text-base text-white outline-none placeholder:text-slate-600 disabled:opacity-60 sm:text-[15px]',
            Icon ? 'pl-10' : 'pl-4',
            trailing ? 'pr-12' : 'pr-4',
          )}
          {...inputProps}
        />
        {trailing && <div className="absolute right-1.5">{trailing}</div>}
      </div>

      <AnimatePresence initial={false}>
        {error && (
          <motion.p id={errorId} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden text-xs font-medium text-neon-red">
            <span className="block pt-1.5">{error}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
})

export default Field
