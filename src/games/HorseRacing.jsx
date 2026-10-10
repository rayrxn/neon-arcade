import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Flag, Timer } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, Field, GameShell, Stage, fmtMult, useRunner } from '@/components/play/GameKit'
import { horseBet, horseState } from '@/services/games'
import { hydrate } from '@/services/server'
import { formatCoins } from '@/utils/format'
import { useNow } from '@/hooks/useNow'
import { useT } from '@/i18n'

const COLORS = ['#f43f5e', '#f59e0b', '#22c55e', '#06b6d4', '#8b5cf6', '#ec4899']
const NAMES = ['Blaze', 'Comet', 'Jade', 'Nova', 'Shadow', 'Tango']

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
  const now = useNow(100)
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
    <Stage className="p-3 sm:p-6">
      <div className="mb-3 flex items-center justify-between text-xs">
        <span className="font-mono text-slate-500">#{r?.id ?? '—'}</span>
        <span className="flex items-center gap-1.5 font-semibold text-slate-300">
          {phase === 'betting' && <><Timer className="h-3.5 w-3.5 text-neon-cyan" />{t('play.horse.startsIn', { s: secs(r.startAt - now) })}</>}
          {phase === 'racing' && <span className="text-neon-gold">{t('play.horse.racing')}</span>}
          {phase === 'finished' && <><Flag className="h-3.5 w-3.5 text-neon-green" />{t('play.horse.winner', { horse: NAMES[r.finish[0]] })} · {t('play.horse.nextIn', { s: secs(r.nextAt - now) })}</>}
        </span>
      </div>
      <div className="relative space-y-1.5 rounded-xl bg-gradient-to-r from-emerald-950/60 via-emerald-900/30 to-emerald-950/60 p-2 ring-1 ring-inset ring-emerald-400/20">
        <div className="pointer-events-none absolute inset-y-2 right-[6%] w-0.5 bg-[repeating-linear-gradient(0deg,#fff_0_6px,#000_6px_12px)] opacity-60" />
        {NAMES.map((n, i) => {
          const x = phase === 'betting' || !r?.finish ? 0 : position(rank[i] ?? 5, i, phase === 'finished' ? 1 : k, r.id)
          const first = phase === 'finished' && r.finish[0] === i
          return (
            <div key={n} className="relative h-9 rounded-md bg-black/20 sm:h-10">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[10px] font-bold text-white/40">{i + 1}</span>
              <motion.div className="absolute top-1/2 -translate-y-1/2" style={{ left: `calc(${4 + x * 84}% )` }}>
                <span className={clsx('relative grid h-7 w-7 place-items-center rounded-full text-base shadow sm:h-8 sm:w-8', first && 'ring-2 ring-neon-gold')} style={{ background: COLORS[i] }}>
                  🏇
                </span>
              </motion.div>
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
