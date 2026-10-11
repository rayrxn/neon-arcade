import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Explosion from '@/components/play/Explosion'
import { BetInput, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { openRound, sliceCashout, sliceStart, sliceStep } from '@/services/games'
import { SLICE_FRUITS, SLICE_RTP } from '@/config/games2'
import { BombSvg } from './LadderArcade'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const KINDS = Object.keys(SLICE_FRUITS)
const LOOK = {
  watermelon: { c: '#16a34a', in: '#ef4444', seed: '#111827' },
  apple: { c: '#dc2626', in: '#fef3c7', seed: '#78350f' },
  orange: { c: '#f97316', in: '#fdba74', seed: '#fff7ed' },
  lemon: { c: '#facc15', in: '#fef9c3', seed: '#a16207' },
  pineapple: { c: '#eab308', in: '#fde68a', seed: '#a16207' },
  cherry: { c: '#be123c', in: '#fda4af', seed: '#4c0519' },
  grape: { c: '#7c3aed', in: '#ddd6fe', seed: '#4c1d95' },
}

/** One fruit drawn in SVG. `half` = 'l' | 'r' shows a cut half with the flesh. */
function FruitArt({ kind, half }) {
  const f = LOOK[kind]
  const clip = half === 'l' ? 'inset(0 50% 0 0)' : half === 'r' ? 'inset(0 0 0 50%)' : undefined
  let body
  if (half) {
    body = <><circle cx="50" cy="55" r="34" fill={f.c} /><circle cx="50" cy="55" r="28" fill={f.in} />{[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={50 + Math.cos((a * Math.PI) / 180) * 14} cy={55 + Math.sin((a * Math.PI) / 180) * 14} r="2.6" fill={f.seed} />)}</>
  } else if (kind === 'grape') {
    body = <>{[[50, 30], [38, 42], [62, 42], [30, 56], [50, 54], [70, 56], [40, 68], [60, 68], [50, 80]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="11" fill={f.c} stroke="#4c1d95" strokeWidth="1.5" />)}<path d="M50 20 V8" stroke="#65a30d" strokeWidth="4" /></>
  } else if (kind === 'cherry') {
    body = <><path d="M34 58 C38 30 52 16 62 10 M66 58 C64 36 62 20 62 10" stroke="#4d7c0f" strokeWidth="3.5" fill="none" /><circle cx="32" cy="68" r="17" fill={f.c} /><circle cx="68" cy="68" r="17" fill={f.c} /><circle cx="26" cy="62" r="4" fill="#fff" opacity="0.5" /><circle cx="62" cy="62" r="4" fill="#fff" opacity="0.5" /></>
  } else if (kind === 'pineapple') {
    body = <><path d="M50 26 L40 4 L50 14 L60 2 L56 18 L70 8 Z" fill="#16a34a" /><ellipse cx="50" cy="60" rx="27" ry="34" fill={f.c} />{[-20, -6, 8, 22].map((o) => <path key={o} d={`M${30 + o} 32 L${70 + o} 88`} stroke="#a16207" strokeWidth="2" opacity="0.6" />)}{[-20, -6, 8, 22].map((o) => <path key={`b${o}`} d={`M${70 - o} 32 L${30 - o} 88`} stroke="#a16207" strokeWidth="2" opacity="0.6" />)}</>
  } else if (kind === 'watermelon') {
    body = <><ellipse cx="50" cy="55" rx="40" ry="32" fill={f.c} />{[-24, -8, 8, 24].map((o) => <path key={o} d={`M${50 + o} 24 C${46 + o} 44 ${46 + o} 66 ${50 + o} 86`} stroke="#14532d" strokeWidth="5" fill="none" />)}</>
  } else if (kind === 'lemon') {
    body = <><ellipse cx="50" cy="55" rx="36" ry="27" fill={f.c} /><path d="M12 55 L6 52 M88 55 L94 52" stroke={f.c} strokeWidth="6" strokeLinecap="round" /></>
  } else {
    body = <><path d="M50 22 C46 12 40 10 34 12 C40 16 44 18 46 24 Z" fill="#16a34a" /><path d="M50 24 V14" stroke="#78350f" strokeWidth="3" /><circle cx="50" cy="56" r="34" fill={f.c} /></>
  }
  return (
    <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_10px_12px_rgba(0,0,0,0.45)]" style={{ clipPath: clip }} aria-hidden>
      {body}
      {!half && kind !== 'grape' && kind !== 'cherry' && <ellipse cx="36" cy="42" rx="9" ry="5" fill="#fff" opacity="0.35" transform="rotate(-30 36 42)" />}
    </svg>
  )
}

// Three fruits per throw: one safe, one medium, one risky, picked at random each step (choice of fruit is the player's).
function deal(seed) {
  const r = (k) => { const x = Math.sin(seed * 9.13 + k * 3.7) * 9999; return x - Math.floor(x) }
  const safe = KINDS.slice(0, 3), mid = KINDS.slice(2, 5), risky = KINDS.slice(4)
  return [safe[Math.floor(r(1) * safe.length)], mid[Math.floor(r(2) * mid.length)], risky[Math.floor(r(3) * risky.length)]].filter((v, i, a) => a.indexOf(v) === i)
}

export default function Slice({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const resumed = openRound('slice')
  const [bet, setBet] = useState(resumed?.bet ?? 100)
  const [round, setRound] = useState(resumed)
  const [throwN, setThrowN] = useState(0)
  const [cut, setCut] = useState(null) // { kind, lane, ok, mult }
  const [outcome, setOutcome] = useState(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState(false)
  const live = round && !outcome
  const step = round?.step ?? 0
  const mult = step ? round?.multiplier ?? 1 : 1
  const fruits = useMemo(() => deal(throwN + 1), [throwN])
  const nextOf = (kind) => Math.floor(((step === 0 ? SLICE_RTP : (round?.multiplier ?? 1)) / SLICE_FRUITS[kind]) * 100) / 100

  const start = async () => {
    const res = await run(() => sliceStart({ bet }))
    if (!res) return
    setOutcome(null)
    setCut(null)
    setRound(res)
    setThrowN((n) => n + 1)
  }
  const slice = async (kind, lane) => {
    if (!live || busy) return
    setBusy(true)
    const res = await run(() => sliceStep(round.id, kind))
    setBusy(false)
    if (!res) return
    if (res.lost) {
      setCut({ kind, lane, ok: false })
      setOutcome(res)
      setRound((r) => ({ ...r }))
      return
    }
    setCut({ kind, lane, ok: true, mult: res.multiplier, n: res.step })
    setPending(true)
    if (res.done) { setOutcome(res); playOutcome(res) }
    setRound(res)
    setTimeout(() => { setThrowN((n) => n + 1); setPending(false) }, 650)
  }
  const cashout = async () => {
    if (!live || busy) return
    const res = await run(() => sliceCashout(round.id))
    if (!res?.done) return
    setOutcome(res)
    playOutcome(res)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={!!live} />
      {live ? (
        <Button size="lg" variant="gold" className="w-full" onClick={cashout} disabled={busy}>
          {step ? `${t('play.crash.cashout')} · ${formatCoins(Math.floor(bet * mult))} AC` : t('play.mines.cancel')}
        </Button>
      ) : (
        <Button size="lg" className="w-full" onClick={start}>{t('play.play')}</Button>
      )}
      <ul className="space-y-1 rounded-xl bg-white/[0.03] p-3 text-xs ring-1 ring-inset ring-white/[0.06]">
        {KINDS.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="h-5 w-5"><FruitArt kind={k} /></span>
            <span className="flex-1 capitalize text-slate-300">{k}</span>
            <span className="num font-mono text-slate-400">{Math.round(SLICE_FRUITS[k] * 100)}%</span>
            <span className="num w-14 text-right font-mono font-bold text-neon-green">×{(1 / SLICE_FRUITS[k]).toFixed(2)}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs leading-relaxed text-slate-500">{t('play.ladder.hint.slice')}</p>
    </>
  )

  const lost = outcome?.lost
  const stage = (
    <Stage className="relative bg-[repeating-linear-gradient(180deg,#8b5a2b_0_58px,#6b4220_58px_62px)] p-0">
      <div className="relative h-[420px] overflow-hidden shadow-[inset_0_0_90px_rgba(0,0,0,0.5)]">
        <div className="absolute left-3 top-3 z-10 rounded-xl bg-black/45 p-2.5 backdrop-blur">
          <p className="flex items-center gap-3 text-xs font-semibold text-white/70">{t('play.multiplier')} <b className="num font-mono text-base text-white">{fmtMult(lost ? 0 : mult)}</b></p>
          {round?.cuts?.length > 0 && (
            <div className="mt-1.5 flex max-w-[220px] flex-wrap gap-1">{round.cuts.slice(-10).map((k, i) => <span key={i} className="h-5 w-5"><FruitArt kind={k} /></span>)}</div>
          )}
        </div>
        {live && !busy && !pending && (
          <div className="absolute inset-x-0 bottom-0 top-10 flex items-end justify-around px-6">
            {fruits.map((k, lane) => (
              <motion.button
                key={`${throwN}-${k}`}
                type="button"
                onClick={() => slice(k, lane)}
                className="group relative flex w-28 flex-col items-center"
                initial={{ y: 320, rotate: -30 }}
                animate={{ y: [320, -230 + lane * 30, -150 + lane * 20, -190 + lane * 30], rotate: [-30, 10, -6, 4] }}
                transition={{ duration: 1.5 + lane * 0.15, times: [0, 0.45, 0.75, 1], ease: 'easeOut', delay: lane * 0.12 }}
                whileHover={{ scale: 1.08 }}
              >
                <span className="h-24 w-24"><FruitArt kind={k} /></span>
                <span className="mt-1 flex flex-col items-center rounded-lg bg-black/55 px-2 py-0.5 font-mono text-[11px] font-bold text-white">
                  <span>{(SLICE_FRUITS[k] * 100).toFixed(0)}% {t('play.ladder.chance')}</span>
                  <span className="text-neon-green">{fmtMult(nextOf(k))}</span>
                </span>
              </motion.button>
            ))}
          </div>
        )}
        <AnimatePresence>
          {cut?.ok && (
            <motion.div key={`cut${cut.n}`} className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-36 -translate-x-1/2 -translate-y-1/2" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: 0.55, duration: 0.35 }}>
              <motion.div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle, ${LOOK[cut.kind].in}aa, transparent 65%)` }} initial={{ scale: 0.3 }} animate={{ scale: 2 }} transition={{ duration: 0.5 }} />
              <motion.div className="absolute inset-0" animate={{ x: -80, y: 50, rotate: -40 }} transition={{ duration: 0.6 }}><FruitArt kind={cut.kind} half="l" /></motion.div>
              <motion.div className="absolute inset-0" animate={{ x: 80, y: 50, rotate: 40 }} transition={{ duration: 0.6 }}><FruitArt kind={cut.kind} half="r" /></motion.div>
              <motion.span className="absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap font-display text-3xl font-black text-neon-green drop-shadow" initial={{ y: 0 }} animate={{ y: -50 }} transition={{ duration: 0.8 }}>{fmtMult(cut.mult)}</motion.span>
            </motion.div>
          )}
        </AnimatePresence>
        {lost && cut && (
          <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2">
            <BombSvg />
            <Explosion size={280} />
          </div>
        )}
        {!live && !lost && !cut && <p className="absolute inset-0 grid place-items-center px-8 text-center text-sm font-semibold text-white/80">{t('play.ladder.hint.slice')}</p>}
        {busy && <div className={clsx('absolute inset-0')} />}
      </div>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}
