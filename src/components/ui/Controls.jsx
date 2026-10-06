import { motion } from 'framer-motion'
import clsx from 'clsx'
import { CheckCircle2, Clock3, XCircle } from 'lucide-react'
import { useT } from '@/i18n'

/** Toggle on/off. */
export function Switch({ checked, onChange, label, id }) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus-ring',
        checked ? 'bg-neon-cyan' : 'bg-ink-600',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 36 }}
        className={clsx('h-5 w-5 rounded-full bg-ink-900 shadow', checked ? 'ml-auto' : '')}
        style={{ backgroundColor: '#fff' }}
      />
    </button>
  )
}

/** Pilihan tersegmentasi (tab kecil). options: [{ value, label, icon? }] */
export function Segmented({ value, onChange, options, layoutId, size = 'md', className }) {
  return (
    <div className={clsx('flex gap-1 rounded-xl bg-ink-950/60 p-1 ring-1 ring-inset ring-white/[0.07]', className)} role="tablist">
      {options.map((opt) => {
        const active = value === opt.value
        const Icon = opt.icon
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={clsx(
              'relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-bold transition-colors focus-ring',
              size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3 text-sm',
              active ? 'text-white' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {active && (
              <motion.span layoutId={layoutId} className="absolute inset-0 rounded-lg bg-white/[0.08] ring-1 ring-inset ring-white/10" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
            )}
            {Icon && <Icon className="relative h-4 w-4" />}
            <span className="relative">{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

const STATUS = {
  success: { icon: CheckCircle2, cls: 'bg-neon-green/10 text-neon-green' },
  pending: { icon: Clock3, cls: 'bg-neon-gold/10 text-neon-gold' },
  failed: { icon: XCircle, cls: 'bg-neon-red/10 text-neon-red' },
}

export function StatusPill({ status, className }) {
  const { t } = useT()
  const s = STATUS[status] ?? STATUS.success
  const Icon = s.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold', s.cls, className)}>
      <Icon className="h-3 w-3" />
      {t(`status.${status}`)}
    </span>
  )
}

export function DemoTag() {
  const { t } = useT()
  return <span className="rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider text-slate-500 ring-1 ring-inset ring-white/10">{t('common.demo')}</span>
}

/** Kartu dengan judul & aksi kanan — wadah standar seksi halaman. */
export function Panel({ title, icon: Icon, action, children, className, bodyClassName }) {
  return (
    <section className={clsx('glass flex min-w-0 flex-col rounded-2xl', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b hairline px-4 py-3.5 sm:px-5">
          <h2 className="flex min-w-0 items-center gap-2 font-display text-sm font-bold text-white">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
            <span className="truncate">{title}</span>
          </h2>
          {action}
        </header>
      )}
      <div className={clsx('min-w-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}

export function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      {Icon && (
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.04] text-slate-500 ring-1 ring-inset ring-white/[0.06]">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="mt-3 text-sm font-bold text-slate-200">{title}</p>
      {body && <p className="mt-1 max-w-xs text-sm text-slate-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
