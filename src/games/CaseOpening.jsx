import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion'
import { Eye, RotateCcw, Zap } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { GameShell, Stage, playOutcome, useRunner } from '@/components/play/GameKit'
import ItemArt, { CaseArt } from '@/components/play/ItemArt'
import { CASES, CASE_ITEMS, TIERS, decoyItems, openCase } from '@/services/games'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const CARD_W = 128
const GAP = 10
const STEP = CARD_W + GAP
const WIN_INDEX = 46
const STRIP_LEN = 54
const TONE_HEX = { cyan: '#22e1ff', purple: '#a35bff', gold: '#ffc83d' }
const TIER_ORDER = TIERS.map((t) => t.id)

/** Kartu item di reel / battle. */
export function ItemCard({ item, highlight, dim, className, size = 'md' }) {
  const small = size === 'sm'
  return (
    <div
      className={clsx(
        'relative flex shrink-0 flex-col items-center justify-end overflow-hidden rounded-2xl bg-ink-850 text-center ring-1 ring-inset transition-[opacity,transform] duration-300',
        small ? 'h-32 w-24 gap-1 px-1.5 pb-2' : 'h-40 w-32 gap-1.5 px-2 pb-3',
        highlight ? 'scale-[1.04]' : '',
        dim && 'opacity-35',
        className,
      )}
      style={{ '--tw-ring-color': highlight ? item.color : 'rgb(var(--white) / 0.07)', background: `linear-gradient(180deg, ${item.color}1a, transparent 55%), rgb(var(--ink-850))` }}
    >
      <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: item.color }} />
      <ItemArt name={item.name} color={item.color} size={small ? 46 : 64} className="mb-auto mt-3" />
      <span className={clsx('line-clamp-2 font-semibold leading-tight text-slate-100', small ? 'text-[10px]' : 'text-xs')}>{item.name}</span>
      <span className={clsx('num font-mono font-bold', small ? 'text-[10px]' : 'text-[11px]')} style={{ color: item.color }}>{formatCoins(item.value)} AC</span>
    </div>
  )
}

/** Tabel peluang (dipakai juga oleh Case Battle). */
export function DropTable({ price }) {
  const { t } = useT()
  return (
    <ul className="space-y-1.5 text-xs">
      {TIERS.map((tier) => (
        <li key={tier.id} className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-semibold text-slate-300">
            <span className="h-2 w-2 rounded-full" style={{ background: tier.color }} /> {t(`play.case.tiers.${tier.id}`)}
          </span>
          <span className="num font-mono text-slate-500">{tier.weight}%</span>
        </li>
      ))}
      <li className="pt-1 text-[11px] text-slate-500">{t('play.case.range', { min: formatCoins(0.15 * price), max: formatCoins(20 * price) })}</li>
    </ul>
  )
}

/** Preview isi case: semua item, peluang per item, dan nilainya. */
function CasePreview({ def, onClose }) {
  const { t } = useT()
  const items = TIER_ORDER.flatMap((tierId) => {
    const tier = TIERS.find((x) => x.id === tierId)
    const pool = CASE_ITEMS[tierId]
    return pool.map((it) => ({ ...it, tier: tierId, color: tier.color, value: it.mult * def.price, chance: tier.weight / pool.length }))
  }).reverse()
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} className="border-t hairline">
      <div className="flex items-center justify-between px-4 pb-2 pt-4 sm:px-5">
        <p className="text-sm font-bold text-white">{t('play.case.contents', { name: t(`play.case.names.${def.id}`) })}</p>
        <button onClick={onClose} className="text-xs font-semibold text-slate-400 hover:text-white">{t('common.close')}</button>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 pb-4 sm:grid-cols-3 sm:px-5 md:grid-cols-4 xl:grid-cols-6">
        {items.map((it) => (
          <div key={it.name} className="flex items-center gap-2 rounded-xl bg-white/[0.03] p-2 ring-1 ring-inset" style={{ '--tw-ring-color': `${it.color}40` }}>
            <ItemArt name={it.name} color={it.color} size={38} />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-bold text-slate-200">{it.name}</p>
              <p className="num font-mono text-[10px]" style={{ color: it.color }}>{formatCoins(it.value)}</p>
              <p className="num font-mono text-[10px] text-slate-500">{it.chance.toFixed(it.chance < 1 ? 2 : 1)}%</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}

export default function CaseOpening({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [caseId, setCaseId] = useState('neon')
  const def = CASES.find((c) => c.id === caseId)
  const [strip, setStrip] = useState(() => decoyItems(STRIP_LEN, def.price))
  const [phase, setPhase] = useState('idle') // idle | spinning | revealed
  const [outcome, setOutcome] = useState(null)
  const [preview, setPreview] = useState(false)
  const [fast, setFast] = useState(false)
  const [width, setWidth] = useState(700)
  const viewport = useRef(null)
  const reel = useAnimationControls()
  const lastTick = useRef(0)

  useLayoutEffect(() => {
    const el = viewport.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const restX = useMemo(() => -(8 * STEP) + width / 2 - CARD_W / 2, [width])

  const selectCase = (id) => {
    if (phase === 'spinning') return
    setCaseId(id)
    setStrip(decoyItems(STRIP_LEN, CASES.find((c) => c.id === id).price))
    setPhase('idle')
    setOutcome(null)
    reel.set({ x: -(8 * STEP) + width / 2 - CARD_W / 2 })
  }

  const open = async () => {
    const res = run(() => openCase({ caseId }))
    if (!res) return
    const items = decoyItems(STRIP_LEN, def.price)
    items[WIN_INDEX] = res.item
    // Near-miss realistis: tetangga kartu menang sesekali tier tinggi.
    if (Math.random() < 0.5) items[WIN_INDEX + 1] = decoyItems(1, def.price * 4)[0]
    setStrip(items)
    setOutcome(null)
    setPreview(false)
    setPhase('spinning')
    await reel.set({ x: restX })
    const target = -(WIN_INDEX * STEP) + width / 2 - CARD_W / 2 + (Math.random() - 0.5) * (CARD_W * 0.7)
    lastTick.current = Math.round(restX / STEP)
    await reel.start({
      x: target,
      transition: { duration: fast ? 1.6 : 5.2, ease: [0.08, 0.72, 0.12, 1] },
    })
    // Rapikan ke tengah kartu pemenang.
    await reel.start({ x: -(WIN_INDEX * STEP) + width / 2 - CARD_W / 2, transition: { type: 'spring', stiffness: 120, damping: 18 } })
    setPhase('revealed')
    setOutcome(res)
    playOutcome(res)
  }

  // Bunyi tick setiap kartu melewati penanda tengah.
  const onReelUpdate = (latest) => {
    if (phase !== 'spinning') return
    const idx = Math.round(Number.parseFloat(latest.x) / STEP)
    if (idx !== lastTick.current) {
      lastTick.current = idx
      play('tick')
    }
  }

  const won = phase === 'revealed' && outcome?.item
  const profit = won ? outcome.item.value - def.price : 0

  const controls = (
    <>
      <div className="grid gap-2">
        {CASES.map((c) => (
          <button
            key={c.id}
            disabled={phase === 'spinning'}
            onClick={() => selectCase(c.id)}
            className={clsx(
              'group flex items-center gap-3 rounded-xl p-2 text-left ring-1 ring-inset transition disabled:opacity-60',
              caseId === c.id ? 'bg-white/[0.05]' : 'ring-white/[0.07] hover:bg-white/[0.03]',
            )}
            style={caseId === c.id ? { '--tw-ring-color': `${TONE_HEX[c.tone]}80` } : undefined}
          >
            <span className="grid h-12 w-14 shrink-0 place-items-center rounded-lg bg-ink-950/60">
              <CaseArt tone={TONE_HEX[c.tone]} size={44} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-white">{t(`play.case.names.${c.id}`)}</span>
              <span className="num font-mono text-xs text-slate-400">{formatCoins(c.price)} AC</span>
            </span>
          </button>
        ))}
      </div>
      <Button size="lg" className="w-full" onClick={open} loading={phase === 'spinning'} disabled={phase === 'spinning'}>
        {phase === 'revealed' ? <RotateCcw className="h-4 w-4" /> : null}
        {phase === 'revealed' ? t('play.case.again') : t('play.case.open')} · {formatCoins(def.price)} AC
      </Button>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" className="flex-1" onClick={() => setPreview((v) => !v)} disabled={phase === 'spinning'}>
          <Eye className="h-4 w-4" /> {t('play.case.preview')}
        </Button>
        <Button variant={fast ? 'primary' : 'ghost'} size="sm" onClick={() => setFast((v) => !v)} aria-pressed={fast} title={t('play.case.fast')}>
          <Zap className="h-4 w-4" /> {t('play.case.fastShort')}
        </Button>
      </div>
      <div>
        <p className="label-caps mb-2">{t('play.case.drops')}</p>
        <DropTable price={def.price} />
      </div>
    </>
  )

  const stage = (
    <Stage className="overflow-hidden">
      <div className="relative flex items-center gap-4 border-b hairline px-4 py-3 sm:px-5">
        <CaseArt tone={TONE_HEX[def.tone]} size={52} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-bold text-white">{t(`play.case.names.${def.id}`)}</p>
          <p className="text-xs text-slate-500">{t('play.case.subtitle', { count: Object.values(CASE_ITEMS).flat().length })}</p>
        </div>
        <span className="num rounded-lg bg-white/[0.05] px-2.5 py-1 font-mono text-sm font-bold text-neon-gold">{formatCoins(def.price)} AC</span>
      </div>

      <div ref={viewport} className="relative overflow-hidden py-8" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent)' }}>
        <span className="pointer-events-none absolute inset-y-3 left-1/2 z-10 w-[3px] -translate-x-1/2 rounded-full bg-neon-gold shadow-[0_0_12px_rgb(var(--neon-gold)/0.8)]" />
        <span className="pointer-events-none absolute left-1/2 top-1 z-10 -translate-x-1/2 border-x-[7px] border-t-[9px] border-x-transparent border-t-neon-gold" />
        <span className="pointer-events-none absolute bottom-1 left-1/2 z-10 -translate-x-1/2 border-x-[7px] border-b-[9px] border-x-transparent border-b-neon-gold" />
        <motion.div animate={reel} initial={{ x: restX }} onUpdate={onReelUpdate} className="flex" style={{ gap: GAP, width: strip.length * STEP }}>
          {strip.map((item, i) => (
            <ItemCard key={i} item={item} highlight={won && i === WIN_INDEX} dim={won && i !== WIN_INDEX} />
          ))}
        </motion.div>
      </div>

      <div className="min-h-[92px] border-t hairline px-4 py-4 sm:px-5">
        <AnimatePresence mode="wait">
          {won ? (
            <motion.div key={outcome.session.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-4">
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl" style={{ background: `${outcome.item.color}1f` }}>
                <ItemArt name={outcome.item.name} color={outcome.item.color} size={52} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: outcome.item.color }}>{t(`play.case.tiers.${outcome.item.tier}`)}</p>
                <p className="truncate font-display text-lg font-bold text-white">{outcome.item.name}</p>
              </div>
              <div className="text-right">
                <p className="num font-mono text-lg font-bold text-white">{formatCoins(outcome.item.value)} AC</p>
                <p className={clsx('num font-mono text-xs font-bold', profit >= 0 ? 'text-neon-green' : 'text-slate-500')}>{profit >= 0 ? '+' : '−'}{formatCoins(Math.abs(profit))}</p>
              </div>
            </motion.div>
          ) : (
            <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pt-4 text-center text-sm text-slate-500">
              {phase === 'spinning' ? t('play.case.opening') : t('play.case.hint')}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>{preview && <CasePreview def={def} onClose={() => setPreview(false)} />}</AnimatePresence>
    </Stage>
  )

  return <GameShell game={game} controls={controls} stage={stage} outcome={phase === 'revealed' ? outcome : null} />
}
