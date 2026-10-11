import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Flag, Timer } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Field, GameShell, Stage, fmtMult, useRunner } from '@/components/play/GameKit'
import { horseBet, horseState } from '@/services/games'
import { hydrate } from '@/services/server'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899']
const NAMES = ['Blaze', 'Comet', 'Jade', 'Nova', 'Shadow', 'Tango']

/** Side-view racehorse with a jockey in the horse's silk colour. Legs swing while running. */
function HorseSvg({ silk, running }) {
  return (
    <svg viewBox="0 0 64 44" className="h-full w-full">
      <ellipse cx="30" cy="41" rx="20" ry="2.5" fill="#000" opacity="0.3" />
      {[[18, 0], [24, 0.12], [40, 0.06], [46, 0.18]].map(([x, d], k) => (
        <motion.line key={k} x1={x} y1="27" x2={x} y2="39" stroke="#3b2414" strokeWidth="3" strokeLinecap="round" style={{ originX: `${x}px`, originY: '27px' }}
          animate={running ? { rotate: k % 2 ? [-28, 28, -28] : [28, -28, 28] } : { rotate: 0 }} transition={{ duration: 0.32, repeat: Infinity, delay: d }} />
      ))}
      <path d="M12 24c0-6 6-9 14-9h14c4 0 8-3 11-7l5 1-2 7c-2 4-5 6-8 7v6c-4 3-10 4-17 4H18c-4 0-6-3-6-9z" fill="#6b3f1d" />
      <path d="M51 8l3-5 2 6z" fill="#6b3f1d" /><circle cx="54" cy="12" r="1" fill="#000" />
      <path d="M12 22c-4 0-8 3-9 7 4-1 7-2 9-4z" fill="#2a160a" />
      <path d="M48 10c-3 3-6 5-9 6" stroke="#2a160a" strokeWidth="2.5" />
      <path d="M28 15l4-9 6 1-2 9z" fill={silk} /><circle cx="35" cy="5" r="3.5" fill={silk} /><path d="M33 3h6" stroke="#fff" strokeWidth="1.5" />
      <path d="M30 14l8 4" stroke="#f1f5f9" strokeWidth="2" />
    </svg>
  )
}

/** Frame-accurate clock (requestAnimationFrame) so the race moves smoothly instead of in 100 ms steps. */
function useFrameNow() {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    let id
    const tick = () => { setNow(Date.now()); id = requestAnimationFrame(tick) }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])
  return now
}

/** Where horse i is at progress k (0..1) given its finishing rank. Deterministic per round so every viewer sees the same race. */
function position(rank, i, k, roundId) {
  const target = 1 - rank * 0.035
  const wob = Math.sin((k * 9 + i * 1.7 + roundId * 0.3) * Math.PI) * 0.025 * Math.sin(k * Math.PI)
  const ease = k < 1 ? 1 - (1 - k) ** 2.2 : 1
  return Math.max(0, Math.min(1, target * ease + wob))
}

export default function HorseRacing({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const now = useFrameNow()
  const [st, setSt] = useState(null)
  const [bet, setBet] = useState(100)
  const [pick, setPick] = useState(null)
  const [outcome, setOutcome] = useState(null)

  useEffect(() => {
    let alive = true
    let timer
    const poll = async () => {
      try {
        const s = await horseState()
        if (!alive) return
        setSt((prev) => {
          // My bet just settled → refresh the wallet and show the result card.
          if (prev?.mine && prev.mine.payout == null && s.mine?.payout != null && prev.round.id === s.round.id) {
            hydrate()
            setOutcome({ session: { id: `horse-${s.round.id}`, nonce: s.round.id, result: s.mine.payout > 0 ? 'win' : 'loss', status: s.mine.payout > 0 ? 'WON' : 'LOST', payout: s.mine.payout, bet: s.mine.bet, currency: s.mine.currency, multiplier: s.mine.payout / s.mine.bet, game: 'horse' } })
          }
          if (prev && prev.round.id !== s.round.id) setOutcome(null)
          return s
        })
      } catch { /* keep the last state */ }
      if (alive) timer = setTimeout(poll, 1000)
    }
    poll()
    return () => { alive = false; clearTimeout(timer) }
  }, [])

  const r = st?.round
  const phase = !r ? 'loading' : now < r.startAt ? 'betting' : now < r.endAt ? 'racing' : 'finished'
  const k = r ? Math.max(0, Math.min(1, (now - r.startAt) / (r.endAt - r.startAt))) : 0
  const rank = useMemo(() => {
    const m = {}
    r?.finish?.forEach((h, idx) => { m[h] = idx })
    return m
  }, [r?.finish])

  const place = async () => {
    if (pick == null) return
    const res = await run(() => horseBet({ bet, horse: pick }))
    if (res) setSt((s) => (s ? { ...s, mine: { horse: pick, bet: res.bet, currency: res.currency, payout: null } } : s))
  }

  const mine = st?.mine
  const secs = (ms) => Math.max(0, Math.ceil(ms / 1000))
  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={phase !== 'betting' || !!mine} />
      <Field label={t('play.horse.pick')}>
        <div className="grid grid-cols-2 gap-1.5">
          {NAMES.map((n, i) => (
            <button key={n} type="button" disabled={phase !== 'betting' || !!mine} onClick={() => setPick(i)}
              className={clsx('flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-bold ring-1 ring-inset transition disabled:opacity-60',
                (mine?.horse ?? pick) === i ? 'bg-white/[0.1] text-white ring-white/30' : 'bg-white/[0.03] text-slate-300 ring-white/[0.06] hover:bg-white/[0.06]')}>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />{n}</span>
              <span className="num font-mono text-neon-green">{r ? fmtMult(r.odds[i]) : '—'}</span>
            </button>
          ))}
        </div>
      </Field>
      {mine ? (
        <p className="rounded-xl bg-white/[0.04] px-3 py-2.5 text-center text-xs text-slate-300">
          {t('play.horse.yourBet', { horse: NAMES[mine.horse], amount: formatCoins(mine.bet), cur: mine.currency })}
        </p>
      ) : (
        <Button size="lg" className="w-full" disabled={phase !== 'betting' || pick == null} onClick={place}>
          {phase === 'betting' ? (pick == null ? t('play.horse.choose') : t('play.horse.bet', { horse: NAMES[pick] })) : t('play.horse.closed')}
        </Button>
      )}
      <p className="text-[11px] leading-relaxed text-slate-500">{t('play.horse.rule')}</p>
    </>
  )

  const stage = (
    <Stage className="relative overflow-hidden bg-gradient-to-b from-sky-900 via-sky-950 to-emerald-950 p-3 sm:p-6">
      <svg className="pointer-events-none absolute inset-x-0 top-0 h-24 w-full opacity-70" viewBox="0 0 400 80" preserveAspectRatio="none">
        <path d="M0 80V40l40-12h60l30 8h80l40-14h70l40 10h40v48z" fill="#0f172a" />
        {Array.from({ length: 40 }, (_, k) => <circle key={k} cx={6 + k * 10} cy={50 + (k % 3) * 6} r="2.2" fill={['#f43f5e', '#facc15', '#38bdf8', '#e2e8f0'][k % 4]} opacity="0.7" />)}
      </svg>
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-mono text-slate-500">#{r?.id ?? '—'}</span>
        <span className="flex items-center gap-1.5 font-semibold text-slate-300">
          {phase === 'betting' && <><Timer className="h-3.5 w-3.5 text-neon-cyan" />{t('play.horse.startsIn', { s: secs(r.startAt - now) })}</>}
          {phase === 'racing' && <span className="text-neon-gold">{t('play.horse.racing')}</span>}
          {phase === 'finished' && <><Flag className="h-3.5 w-3.5 text-neon-green" />{t('play.horse.winner', { horse: NAMES[r.finish[0]] })} · {t('play.horse.nextIn', { s: secs(r.nextAt - now) })}</>}
        </span>
      </div>
      <div className="relative mt-10 space-y-1.5 rounded-xl border-y-4 border-white/70 bg-[repeating-linear-gradient(90deg,#166534_0_60px,#15803d_60px_120px)] p-2 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)]">
        <div className="pointer-events-none absolute inset-y-2 right-[6%] w-0.5 bg-[repeating-linear-gradient(0deg,#fff_0_6px,#000_6px_12px)] opacity-60" />
        {NAMES.map((n, i) => {
          const x = phase === 'betting' || !r?.finish ? 0 : position(rank[i] ?? 5, i, phase === 'finished' ? 1 : k, r.id)
          const first = phase === 'finished' && r.finish[0] === i
          return (
            <div key={n} className="relative h-9 rounded-md bg-black/20 sm:h-10">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold text-white/40">{i + 1}</span>
              <div className="absolute top-1/2 -translate-y-1/2 will-change-[left]" style={{ left: `${4 + x * 84}%` }}>
                {phase === 'racing' && <span className="na-dust absolute -left-3 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-amber-200/40 blur-[2px]" style={{ animationDelay: `${i * 0.07}s` }} />}
                <span className={clsx('relative block h-9 w-12 sm:h-10 sm:w-14', phase === 'racing' && 'na-gallop', first && 'drop-shadow-[0_0_10px_rgba(250,204,21,0.9)]')} style={{ animationDelay: `${i * 0.05}s` }}>
                  <HorseSvg silk={COLORS[i]} running={phase === 'racing'} />
                </span>
                {mine?.horse === i && <span className="absolute -top-2 left-1/2 -translate-x-1/2 rounded bg-white px-1 text-[8px] font-black text-ink-950">YOU</span>}
              </div>
              {phase === 'finished' && <span className="absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold text-slate-300">{(rank[i] ?? 0) + 1}.</span>}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-none">
        {(st?.history ?? []).map((h) => (
          <span key={h.id} title={`#${h.id}`} className="flex shrink-0 items-center gap-1 rounded-md bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] font-bold text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS[h.winner] }} />{fmtMult(h.odds[h.winner])}
          </span>
        ))}
      </div>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
