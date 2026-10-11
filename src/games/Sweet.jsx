import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Gift, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { BetInput, GameShell, Stage, fmtMult, playOutcome, useRunner } from '@/components/play/GameKit'
import { CandyIcon } from '@/components/games/Candy'
import { playSweet } from '@/services/games'
import { play as sfx } from '@/services/sound'
import { coinBurst, spring, winPop } from '@/lib/motion'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const FS_PRICE = 2.8 // × bet per free spin (server: SWEET_FS_EV / 0.94)
const FS_COUNTS = [5, 10, 15]
const IDLE = Array.from({ length: 6 }, (_, c) => Array.from({ length: 5 }, (_, r) => ({ s: (c * 3 + r * 5) % 8, id: `i${c}${r}` })))

/** Stable ids across tumbles: survivors keep theirs, new candy gets fresh ids, so only real changes animate. */
function withIds(steps, prefix) {
  let n = 0
  const out = []
  steps.forEach((st, k) => {
    if (k === 0) { out.push(st.grid.map((col) => col.map((cell) => ({ ...cell, id: `${prefix}${n++}` })))); return }
    const gone = new Set(steps[k - 1].wins.map((w) => w.s))
    out.push(st.grid.map((col, c) => {
      const kept = out[k - 1][c].filter((cell) => !gone.has(cell.s))
      const fresh = col.length - kept.length
      return col.map((cell, r) => ({ ...cell, id: r < fresh ? `${prefix}${n++}` : kept[r - fresh].id }))
    }))
  })
  return out
}

const tier = (m) => (m >= 50 ? 'mega' : m >= 10 ? 'big' : m >= 2 ? 'nice' : null)

function CountUp({ to, ms = 1200 }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    let raf
    const t0 = performance.now()
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms)
      setV(to * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [to, ms])
  return <>{fmtMult(v)}</>
}

export default function Sweet({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [bet, setBet] = useState(100)
  const [res, setRes] = useState(null) // server result
  const [spinIdx, setSpinIdx] = useState(0)
  const [step, setStep] = useState(0)
  const [popping, setPopping] = useState(false)
  const [acc, setAcc] = useState(0) // free-spin multiplier collected so far
  const [banner, setBanner] = useState(null) // 'intro' | 'end'
  const [outcome, setOutcome] = useState(null)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const spins = res ? res.free ?? [res] : null
  const spin = spins?.[spinIdx]
  const frames = useMemo(() => (spin ? withIds(spin.steps, `s${spinIdx}-`) : null), [spin, spinIdx])
  const cur = spin?.steps[step]
  const grid = frames?.[step] ?? IDLE
  const lastStep = spin && step === spin.steps.length - 1
  const running = !!res && !outcome
  const winSyms = new Set((cur?.wins ?? []).map((w) => w.s))

  const playSpins = (r) => {
    const list = r.free ?? [r]
    let i = 0
    let sum = 0
    const next = () => {
      if (i >= list.length) {
        const finish = () => { setOutcome(r); playOutcome(r) }
        if (r.free) { setBanner('end'); timer.current = setTimeout(finish, 2200) } else finish()
        return
      }
      const sp = list[i]
      setSpinIdx(i); setStep(0); setPopping(false)
      let k = 0
      const tumble = () => {
        if (k < sp.steps.length - 1) {
          timer.current = setTimeout(() => {
            setPopping(true); sfx('reveal')
            timer.current = setTimeout(() => { setPopping(false); k += 1; setStep(k); tumble() }, 340)
          }, 820)
        } else {
          sum += sp.mult
          timer.current = setTimeout(() => {
            setAcc(sum)
            if (sp.mult > 0 && sp.bombs) sfx('win')
            i += 1
            timer.current = setTimeout(next, sp.mult > 0 ? (sp.bombs ? 1300 : 700) : 420)
          }, 200)
        }
      }
      tumble()
    }
    next()
  }

  const go = async (buy) => {
    clearTimeout(timer.current)
    const r = await run(() => playSweet(buy ? { bet, buy } : { bet }))
    if (!r) return
    setOutcome(null); setAcc(0); setBanner(null)
    setRes(r)
    if (r.free) {
      setSpinIdx(0); setStep(0)
      setBanner('intro'); sfx('levelup')
      timer.current = setTimeout(() => { setBanner(null); playSpins(r) }, 1600)
    } else playSpins(r)
  }

  const controls = (
    <>
      <BetInput value={bet} onChange={setBet} disabled={running} />
      <Button size="lg" className="w-full" onClick={() => go(0)} disabled={running}>{t('play.sweet.spin')}</Button>
      <div className="rounded-xl bg-gradient-to-br from-fuchsia-500/15 to-amber-400/10 p-3 ring-1 ring-inset ring-fuchsia-300/25">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-fuchsia-200"><Gift className="h-3.5 w-3.5" />{t('play.sweet.buyTitle')}</p>
        <div className="grid grid-cols-3 gap-1.5">
          {FS_COUNTS.map((n) => (
            <button key={n} type="button" disabled={running} onClick={() => go(n)}
              className="rounded-lg bg-white/[0.06] px-1 py-2 text-center ring-1 ring-inset ring-white/10 transition hover:bg-white/[0.12] disabled:opacity-50">
              <span className="block font-display text-sm font-black text-white">{n}×</span>
              <span className="num block font-mono text-[10px] text-amber-200">{formatCoins(Math.ceil(bet * n * FS_PRICE))}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-slate-400">{t('play.sweet.buyNote')}</p>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{t('play.sweet.rule')}</p>
    </>
  )

  const stage = (
    <Stage className="relative overflow-hidden p-3 sm:p-5">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(7)].map((_, i) => (
          <motion.span key={i} className="absolute rounded-full blur-2xl" style={{ width: 90 + i * 14, height: 90 + i * 14, left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, background: ['#f472b6', '#a855f7', '#22d3ee', '#facc15'][i % 4], opacity: 0.12 }}
            animate={{ y: [0, -18, 0], x: [0, 10, 0] }} transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut' }} />
        ))}
      </div>
      <div className="relative mb-2 flex h-7 items-center justify-between text-xs font-bold">
        <span className="text-fuchsia-200">{res?.free ? t('play.sweet.freeOf', { n: spinIdx + 1, total: res.free.length }) : t('play.sweet.title')}</span>
        {res?.free && <span className="num font-mono text-amber-200">{t('play.sweet.collected')} <CountUp key={acc} to={acc} ms={500} /></span>}
      </div>
      <div className="relative mx-auto grid max-w-[460px] grid-cols-6 gap-1.5 rounded-3xl bg-gradient-to-b from-pink-400/20 via-fuchsia-500/10 to-violet-700/25 p-2.5 shadow-[inset_0_2px_0_rgba(255,255,255,0.15),0_20px_40px_-20px_rgba(236,72,153,0.5)] ring-1 ring-inset ring-pink-200/30 sm:gap-2 sm:p-3">
        {grid.map((col, c) => (
          <div key={c} className="flex flex-col gap-1.5 sm:gap-2">
            <AnimatePresence initial={false} mode="popLayout">
              {col.map((cell, r) => {
                const win = winSyms.has(cell.s)
                return (
                  <motion.div key={cell.id} layout
                    initial={{ y: -110 - r * 22, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: popping && win ? 1.3 : 1, rotate: popping && win ? 14 : 0 }}
                    exit={{ scale: 0, opacity: 0, rotate: 40, transition: { duration: 0.2 } }}
                    transition={spring(0.6, 0.38, res ? (4 - r) * 0.05 + c * 0.03 : 0)}
                    className={clsx('relative grid aspect-square place-items-center rounded-xl', win ? 'bg-amber-200/25 ring-2 ring-inset ring-amber-300 shadow-[0_0_18px_rgba(252,211,77,0.55)]' : 'bg-white/[0.07] ring-1 ring-inset ring-white/10')}>
                    <motion.span className="block h-[86%] w-[86%]" animate={!res ? { y: [0, -2, 0] } : win && !popping ? { scale: [1, 1.12, 1] } : {}} transition={{ duration: win ? 0.6 : 2.4 + ((c + r) % 3) * 0.4, repeat: Infinity, ease: 'easeInOut' }}>
                      <CandyIcon s={cell.s} b={cell.b} className="h-full w-full drop-shadow-[0_3px_3px_rgba(0,0,0,0.35)]" />
                    </motion.span>
                    {popping && win && [...Array(6)].map((_, k) => (
                      <motion.span key={k} className="absolute h-1.5 w-1.5 rounded-full bg-amber-100" initial={{ x: 0, y: 0, opacity: 1 }} animate={{ x: Math.cos(k) * 26, y: Math.sin(k) * 26, opacity: 0 }} transition={{ duration: 0.34 }} />
                    ))}
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        ))}

        <AnimatePresence>
          {cur?.wins?.length > 0 && !popping && (
            <motion.div key={`w${spinIdx}-${step}`} initial={{ opacity: 0, y: 10, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} transition={spring(0.4, 0.4)}
              className="pointer-events-none absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-ink-950/80 px-3 py-1 font-mono text-xs font-bold text-amber-200 ring-1 ring-amber-300/40">
              +{fmtMult(cur.wins.reduce((a, w) => a + w.pay, 0))}
            </motion.div>
          )}
          {lastStep && !res.free && spin.mult > 0 && (
            <WinPanel key="win" mult={spin.mult} base={spin.base} bombs={spin.bombs} />
          )}
          {banner === 'intro' && (
            <motion.div key="intro" className="absolute inset-0 z-20 grid place-items-center rounded-3xl bg-fuchsia-950/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div {...winPop} className="text-center">
                <Sparkles className="mx-auto h-10 w-10 text-amber-200" />
                <p className="font-display text-5xl font-black text-white drop-shadow-[0_0_20px_rgba(244,114,182,0.8)]">{res.free.length}</p>
                <p className="font-display text-xl font-black uppercase tracking-widest text-amber-200">{t('play.sweet.freeSpins')}</p>
              </motion.div>
            </motion.div>
          )}
          {banner === 'end' && <WinPanel key="fsend" mult={res.mult} label={t('play.sweet.fsTotal', { n: res.free.length })} free />}
        </AnimatePresence>
      </div>
      <p className="relative mt-3 text-center text-xs text-slate-400">
        {lastStep && !res?.free && spin.mult <= 0 ? t('play.sweet.noWin') : !res ? t('play.sweet.idle') : ' '}
      </p>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={outcome} />
}

function WinPanel({ mult, base, bombs, label, free }) {
  const { t } = useT()
  const tr = tier(mult)
  return (
    <motion.div className="pointer-events-none absolute inset-0 z-20 grid place-items-center overflow-hidden rounded-3xl bg-black/45 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: free ? 0 : 0.25 }}>
      {tr && [...Array(tr === 'mega' ? 24 : tr === 'big' ? 18 : 12)].map((_, k, a) => {
        const c = coinBurst(k, a.length, 150)
        return <motion.span key={k} {...c} className="absolute h-3.5 w-3.5 rounded-full bg-gradient-to-br from-amber-100 to-amber-500" />
      })}
      <motion.div {...winPop} className="text-center">
        {tr && <p className={clsx('font-display text-lg font-black uppercase tracking-[0.2em]', tr === 'mega' ? 'text-fuchsia-300' : tr === 'big' ? 'text-amber-300' : 'text-emerald-300')}>{t(`play.sweet.tier.${tr}`)}</p>}
        {label && <p className="text-xs font-bold uppercase tracking-widest text-slate-300">{label}</p>}
        {bombs > 0 && <p className="num font-mono text-sm font-bold text-amber-100">{fmtMult(base)} × {bombs}</p>}
        <p className="num font-display text-5xl font-black text-amber-300 drop-shadow-[0_0_22px_rgba(250,204,21,0.65)]"><CountUp to={mult} /></p>
      </motion.div>
    </motion.div>
  )
}
