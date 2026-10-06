import { useState } from 'react'
import { Search } from 'lucide-react'
import clsx from 'clsx'
import { useT } from '@/i18n'

/** Komponen kecil yang dipakai semua halaman admin. Gaya: padat, netral, data-first. */

export function AdminPage({ title, description, actions, children }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-white">{title}</h1>
          {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export function Card({ title, actions, children, className, bodyClassName }) {
  return (
    <section className={clsx('min-w-0 rounded-xl border hairline bg-ink-900', className)}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b hairline px-4 py-3">
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {actions}
        </header>
      )}
      <div className={bodyClassName ?? 'p-4'}>{children}</div>
    </section>
  )
}

export function Kpi({ label, value, sub, tone }) {
  return (
    <div className="min-w-0 rounded-xl border hairline bg-ink-900 px-4 py-3">
      <p className="truncate text-xs text-slate-500">{label}</p>
      <p className={clsx('num mt-1 truncate font-mono text-xl font-bold', tone ?? 'text-white')}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-slate-500">{sub}</p>}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="input-shell flex h-10 items-center gap-2 px-3">
      <Search className="h-4 w-4 shrink-0 text-slate-500" />
      <input id="admin-search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
    </div>
  )
}

/** Tabel responsif: scroll horizontal di dalam kartu, bukan di halaman. */
export function Table({ columns, rows, empty, onRow, rowKey = (r) => r.id }) {
  const { t } = useT()
  if (!rows.length) return <p className="px-4 py-10 text-center text-sm text-slate-500">{empty ?? t('admin.empty')}</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b hairline text-[11px] uppercase tracking-wider text-slate-500">
            {columns.map((c) => <th key={c.key} className={clsx('px-4 py-2.5 font-semibold', c.align === 'right' && 'text-right')}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/[0.05]">
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRow ? () => onRow(r) : undefined} className={clsx(onRow && 'cursor-pointer hover:bg-white/[0.03]')}>
              {columns.map((c) => <td key={c.key} className={clsx('px-4 py-2.5 align-middle text-slate-300', c.align === 'right' && 'text-right', c.mono && 'num font-mono text-xs')}>{c.render ? c.render(r) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const BADGE = {
  green: 'bg-neon-green/10 text-neon-green',
  red: 'bg-neon-red/10 text-neon-red',
  gold: 'bg-neon-gold/10 text-neon-gold',
  cyan: 'bg-neon-cyan/10 text-neon-cyan',
  purple: 'bg-neon-purple/10 text-neon-purple',
  slate: 'bg-white/[0.06] text-slate-400',
}
export function Badge({ tone = 'slate', children }) {
  return <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-bold', BADGE[tone])}>{children}</span>
}

export const RISK_TONE = { low: 'slate', medium: 'gold', high: 'red', critical: 'red' }
export const STATUS_TONE = { active: 'green', frozen: 'cyan', banned: 'red' }
export const ROLE_TONE = { super_admin: 'purple', admin: 'cyan', moderator: 'gold', support: 'green', developer: 'slate', user: 'slate' }

export function Tabs({ value, onChange, options }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b hairline scrollbar-none">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={clsx('-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition', value === o.value ? 'border-neon-cyan text-white' : 'border-transparent text-slate-500 hover:text-slate-300')}>
          {o.label}
          {o.count != null && <span className="ml-1.5 rounded bg-white/[0.06] px-1.5 text-[10px]">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Bar chart sederhana (SVG), sumbu dari 0, label dari token tema. */
export function BarChart({ data, height = 160, tone = 'fill-neon-cyan' }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const w = 100 / data.length
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 3}`} preserveAspectRatio="none" className="block w-full" style={{ height }}>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2="100" y1={(height / 3) * (1 - f)} y2={(height / 3) * (1 - f)} className="stroke-white/[0.06]" strokeWidth="0.2" />)}
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 3 - 2)
          return <rect key={d.label} x={i * w + w * 0.2} y={height / 3 - h} width={w * 0.6} height={Math.max(h, 0.3)} rx="0.8" className={tone} />
        })}
      </svg>
      <div className="mt-1.5 grid text-center text-[10px] text-slate-500" style={{ gridTemplateColumns: `repeat(${data.length}, minmax(0,1fr))` }}>
        {data.map((d) => (
          <span key={d.label} className="truncate">
            <b className="num block font-mono text-slate-300">{d.value}</b>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Field form kecil untuk admin. */
export function FormField({ label, children, hint }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex justify-between text-xs font-semibold text-slate-400">
        {label}
        {hint && <span className="font-normal text-slate-500">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export const inputCls = 'input-shell h-10 w-full px-3 text-sm text-white outline-none placeholder:text-slate-600'

export function useDialog() {
  const [dialog, setDialog] = useState(null)
  return { dialog, open: setDialog, close: () => setDialog(null) }
}
