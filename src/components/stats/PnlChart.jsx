import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { Panel } from '@/components/ui/Controls'
import { fetchPnl, useExtras } from '@/services/platform2'
import { SERVER_MODE } from '@/config/runtime'
import { formatCoins, formatSigned } from '@/utils/format'
import { useT } from '@/i18n'

const RANGES = [7, 30, 90]

/** Build a continuous day list (days without rounds = 0). */
function fillDays(rows, days, currency) {
  const byDay = Object.fromEntries(rows.filter((r) => r.currency === currency).map((r) => [r.day, r]))
  const out = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push({ day: key, date: d, net: byDay[key]?.net ?? 0, rounds: byDay[key]?.rounds ?? 0, wins: byDay[key]?.wins ?? 0, wagered: byDay[key]?.wagered ?? 0 })
  }
  return out
}

/**
 * Daily win / loss (net = payouts − bets) as a diverging bar chart: wins up in green, losses down in red,
 * one axis through zero. History length: 7 days, VIP 30, VVIP 90.
 */
export default function PnlChart() {
  const { t, lang } = useT()
  const { perks } = useExtras()
  const maxDays = perks?.statsDays ?? 7
  const [days, setDays] = useState(7)
  const [currency, setCurrency] = useState('AC')
  const [data, setData] = useState(null)
  const [hover, setHover] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!SERVER_MODE) return
    let alive = true
    setError(false)
    fetchPnl(days).then((d) => alive && setData(d)).catch(() => alive && setError(true))
    return () => {
      alive = false
    }
  }, [days])

  const series = useMemo(() => (data ? fillDays(data.rows, data.days, currency) : []), [data, currency])
  if (!SERVER_MODE) return null

  const total = series.reduce((a, d) => a + d.net, 0)
  const rounds = series.reduce((a, d) => a + d.rounds, 0)
  const wins = series.reduce((a, d) => a + d.wins, 0)
  const maxAbs = Math.max(1, ...series.map((d) => Math.abs(d.net)))
  const W = 640
  const H = 200
  const mid = H / 2
  const gap = series.length > 40 ? 1 : 2
  const bw = series.length ? (W - gap * (series.length - 1)) / series.length : 0
  const fmtDay = (d) => d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'short' })

  return (
    <Panel
      title={t('pnl.title')}
      icon={TrendingUp}
      action={
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-white/[0.04] p-0.5">
            {['AC', 'AG'].map((c) => <button key={c} onClick={() => setCurrency(c)} aria-pressed={currency === c} className={clsx('h-7 rounded-md px-2 text-[11px] font-bold', currency === c ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200')}>{c}</button>)}
          </div>
          <div className="flex rounded-lg bg-white/[0.04] p-0.5">
            {RANGES.map((r) => {
              const locked = r > maxDays
              return (
                <button key={r} disabled={locked} onClick={() => setDays(r)} aria-pressed={days === r} title={locked ? t('pnl.locked', { tier: r === 30 ? 'VIP' : 'VVIP' }) : undefined} className={clsx('flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-bold', days === r ? 'bg-white/10 text-white' : locked ? 'text-slate-600' : 'text-slate-500 hover:text-slate-200')}>
                  {locked && <Lock className="h-3 w-3" />}{r}d
                </button>
              )
            })}
          </div>
        </div>
      }
      bodyClassName="p-4 sm:p-5"
    >
      <dl className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('pnl.net', { n: days })}</dt>
          <dd className={clsx('num mt-0.5 font-mono text-base font-bold', total >= 0 ? 'text-neon-green' : 'text-neon-red')}>{formatSigned(total)} {currency}</dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('pnl.rounds')}</dt>
          <dd className="num mt-0.5 font-mono text-base font-bold text-white">{formatCoins(rounds)}</dd>
        </div>
        <div className="rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
          <dt className="text-[11px] text-slate-500">{t('pnl.winRate')}</dt>
          <dd className="num mt-0.5 font-mono text-base font-bold text-white">{rounds ? Math.round((wins / rounds) * 100) : 0}%</dd>
        </div>
      </dl>

      <div className="relative mt-4" onMouseLeave={() => setHover(null)}>
        {error ? (
          <p className="py-10 text-center text-sm text-slate-500">{t('states.errorTitle')}</p>
        ) : !data ? (
          <div className="h-[200px] animate-pulse rounded-xl bg-white/[0.03]" />
        ) : (
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-[200px] w-full" preserveAspectRatio="none" role="img" aria-label={t('pnl.title')}>
            <line x1="0" x2={W} y1={mid} y2={mid} stroke="currentColor" className="text-white/15" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {series.map((d, i) => {
              const h = (Math.abs(d.net) / maxAbs) * (mid - 6)
              const x = i * (bw + gap)
              const y = d.net >= 0 ? mid - h : mid
              return (
                <g key={d.day} onMouseEnter={() => setHover(i)}>
                  <rect x={x} y={0} width={bw + gap} height={H} fill="transparent" />
                  {d.net !== 0 && <rect x={x} y={y} width={Math.max(1, bw)} height={Math.max(1, h)} rx={Math.min(3, bw / 2)} className={clsx(d.net >= 0 ? 'fill-neon-green' : 'fill-neon-red', hover !== null && hover !== i && 'opacity-40')} />}
                </g>
              )
            })}
          </svg>
        )}
        {hover !== null && series[hover] && (
          <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg bg-ink-950/95 px-2.5 py-1.5 text-[11px] shadow-lg ring-1 ring-white/10" style={{ left: `${((hover + 0.5) / series.length) * 100}%` }}>
            <p className="font-semibold text-slate-300">{fmtDay(series[hover].date)}</p>
            <p className={clsx('num font-mono font-bold', series[hover].net >= 0 ? 'text-neon-green' : 'text-neon-red')}>{formatSigned(series[hover].net)} {currency}</p>
            <p className="text-slate-500">{t('pnl.roundsN', { n: series[hover].rounds })}</p>
          </div>
        )}
        {series.length > 0 && (
          <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>{fmtDay(series[0].date)}</span><span>{fmtDay(series[series.length - 1].date)}</span></div>
        )}
      </div>
      {maxDays < 90 && <p className="mt-3 text-[11px] text-slate-500">{t('pnl.more')} <Link to="/membership" className="font-semibold text-slate-300 underline">{t('pnl.membership')}</Link></p>}
    </Panel>
  )
}
