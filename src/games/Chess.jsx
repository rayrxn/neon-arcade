import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, Clock, Flag, Swords, Users } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { Choice, Field, GameShell, Stage, useRunner } from '@/components/play/GameKit'
import { START, apply, botMove, inCheck, legalMoves, status } from '@/lib/chess'
import { api, hydrate } from '@/services/server'
import { SERVER_MODE } from '@/config/runtime'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
const fmtClock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Board with click-to-move, legal-move dots, last-move highlight and a sliding animation for the moved piece. */
function Board({ state, side, onMove, last, disabled }) {
  const [sel, setSel] = useState(null)
  const [promo, setPromo] = useState(null)
  const legal = useMemo(() => (disabled ? [] : legalMoves(state)), [state, disabled])
  const targets = sel == null ? [] : legal.filter((m) => m.f === sel)
  const flip = side === 'b'
  const checkSq = inCheck(state) ? state.b.indexOf(state.t === 'w' ? 'K' : 'k') : -1
  useEffect(() => setSel(null), [state.b])

  const click = (i) => {
    if (disabled) return
    const t = targets.filter((m) => m.t === i)
    if (t.length) {
      if (t.length > 1) setPromo({ f: sel, t: i })
      else onMove(t[0])
      setSel(null)
      return
    }
    const pc = state.b[i]
    const mine = pc !== '.' && (state.t === 'w') === (pc === pc.toUpperCase())
    setSel(mine && legal.some((m) => m.f === i) ? i : null)
  }

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[480px] select-none overflow-hidden rounded-xl ring-1 ring-white/10 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]">
      <div className="grid h-full w-full grid-cols-8 grid-rows-8">
        {Array.from({ length: 64 }, (_, k) => {
          const i = flip ? 63 - k : k
          const dark = ((i >> 3) + (i & 7)) % 2 === 1
          const pc = state.b[i]
          const isT = targets.some((m) => m.t === i)
          const moved = last && last.t === i
          const from = last && last.f
          const dx = moved ? ((from & 7) - (i & 7)) * (flip ? -100 : 100) : 0
          const dy = moved ? ((from >> 3) - (i >> 3)) * (flip ? -100 : 100) : 0
          return (
            <button key={k} type="button" onClick={() => click(i)}
              className={clsx('relative grid h-full w-full place-items-center overflow-hidden', dark ? 'bg-[#4b5d7a]' : 'bg-[#c9d4e3]',
                (last && (last.f === i || last.t === i)) && (dark ? 'bg-[#7c8f4e]' : 'bg-[#d9e39a]'),
                sel === i && '!bg-amber-300/80', checkSq === i && '!bg-red-500/80')}>
              {(k & 7) === 0 && <span className={clsx('absolute left-0.5 top-0 text-[9px] font-bold', dark ? 'text-white/50' : 'text-slate-600/60')}>{8 - (i >> 3)}</span>}
              {k >= 56 && <span className={clsx('absolute bottom-0 right-1 text-[9px] font-bold', dark ? 'text-white/50' : 'text-slate-600/60')}>{'abcdefgh'[i & 7]}</span>}
              {pc !== '.' && (
                <motion.span key={`${i}-${pc}-${state.n}`} initial={moved ? { x: `${dx}%`, y: `${dy}%`, scale: 1.08 } : false} animate={{ x: 0, y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                  className={clsx('relative z-10 text-[min(9vw,44px)] leading-none', pc === pc.toUpperCase() ? 'text-white [text-shadow:0_2px_0_#334155,0_0_2px_#0f172a]' : 'text-slate-900 [text-shadow:0_1px_0_rgba(255,255,255,0.35)]')}>
                  {GLYPH[pc.toLowerCase()]}
                </motion.span>
              )}
              {isT && <span className={clsx('absolute z-20 rounded-full', pc === '.' ? 'h-[26%] w-[26%] bg-black/25' : 'inset-1 ring-4 ring-black/25')} />}
            </button>
          )
        })}
      </div>
      <AnimatePresence>
        {promo && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-30 grid place-items-center bg-black/60">
            <div className="flex gap-2 rounded-xl bg-ink-900 p-3 ring-1 ring-white/10">
              {['q', 'r', 'b', 'n'].map((p) => (
                <button key={p} type="button" onClick={() => { onMove({ ...promo, p }); setPromo(null) }} className="grid h-14 w-14 place-items-center rounded-lg bg-white/10 text-4xl text-white hover:bg-white/20">{GLYPH[p]}</button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ClockBar({ name, ms, active, you }) {
  return (
    <div className={clsx('flex items-center justify-between rounded-lg px-3 py-2 text-sm ring-1 ring-inset transition-colors', active ? 'bg-neon-cyan/10 ring-neon-cyan/40' : 'bg-white/[0.03] ring-white/[0.06]')}>
      <span className="font-semibold text-slate-200">{name}{you && <span className="ml-1.5 text-[10px] font-bold uppercase text-neon-cyan">you</span>}</span>
      {ms != null && <span className={clsx('num flex items-center gap-1 font-mono font-bold', ms < 20000 ? 'text-neon-red' : 'text-white')}><Clock className="h-3.5 w-3.5" />{fmtClock(ms)}</span>}
    </div>
  )
}

export default function Chess({ game }) {
  const { t } = useT()
  const { run } = useRunner()
  const [mode, setMode] = useState(SERVER_MODE ? 'pvp' : 'bot')

  // ── Practice vs bot ──
  const [level, setLevel] = useState('medium')
  const [color, setColor] = useState('w')
  const [bs, setBs] = useState({ state: START, last: null, playing: false })
  const botBusy = useRef(false)
  const botEnd = status(bs.state)
  useEffect(() => {
    if (mode !== 'bot' || !bs.playing || botEnd || bs.state.t === color || botBusy.current) return
    botBusy.current = true
    const id = setTimeout(() => {
      const m = botMove(bs.state, level)
      botBusy.current = false
      if (m) setBs((s) => ({ ...s, state: apply(s.state, m), last: m }))
    }, 450)
    return () => { clearTimeout(id); botBusy.current = false }
  }, [mode, bs, color, level, botEnd])

  // ── PvP ──
  const [lobby, setLobby] = useState(null)
  const [match, setMatch] = useState(null)
  const [form, setForm] = useState({ stake: 0, currency: 'AC', minutes: 5 })
  const [tick, setTick] = useState(Date.now())
  const offset = useRef(0)
  const loadLobby = useCallback(() => api('chess/lobby').then(setLobby).catch(() => {}), [])
  useEffect(() => {
    if (mode !== 'pvp' || !SERVER_MODE) return
    let alive = true
    let timer
    const poll = async () => {
      try {
        const l = await api('chess/lobby')
        if (!alive) return
        setLobby(l)
        const id = l.active ?? match?.id
        if (id) {
          const m = await api(`chess/state?id=${id}`)
          if (!alive) return
          offset.current = m.serverTime - Date.now()
          setMatch((prev) => {
            if (prev && prev.status !== 'done' && m.status === 'done') hydrate()
            return m
          })
        }
      } catch { /* keep last */ }
      if (alive) timer = setTimeout(poll, 1200)
    }
    poll()
    const clock = setInterval(() => setTick(Date.now()), 250)
    return () => { alive = false; clearTimeout(timer); clearInterval(clock) }
  }, [mode, match?.id])

  const act = async (name, args) => {
    const res = await run(() => api(`chess/${name}`, args))
    if (res?.result?.id) setMatch(res.result)
    if (name === 'cancel') setMatch(null)
    if (name === 'create' || name === 'join' || name === 'cancel') hydrate()
    loadLobby()
    return res
  }
  const pvpMove = async (m) => {
    setMatch((x) => (x ? { ...x, state: apply(x.state, m), moves: [...x.moves, m], _pending: true } : x))
    const res = await run(() => api('chess/move', { id: match.id, from: m.f, to: m.t, promo: m.p ?? null }))
    if (res?.result) setMatch(res.result)
    else api(`chess/state?id=${match.id}`).then(setMatch).catch(() => {})
  }

  const liveMs = (sideKey) => {
    if (!match) return null
    const base = match.clock[sideKey]
    if (match.status !== 'active' || match.state.t !== sideKey || match._pending) return base
    return base - (tick + offset.current - match.serverTime)
  }

  const inMatch = match && match.status !== 'cancelled' && !(match.status === 'done' && !match.you)
  const resultText = (m) => {
    if (m.status !== 'done') return null
    if (m.result === 'draw') return t('play.chess.draw', { reason: t(`play.chess.reasons.${m.reason}`) })
    const won = m.result === m.you
    return `${won ? t('play.chess.youWin') : t('play.chess.youLose')} · ${t(`play.chess.reasons.${m.reason}`)}`
  }

  const controls = (
    <>
      <Field label={t('play.chess.mode')}>
        <Choice options={[{ value: 'pvp', label: t('play.chess.pvp') }, { value: 'bot', label: t('play.chess.bot') }]} value={mode} onChange={setMode} />
      </Field>
      {mode === 'bot' ? (
        <>
          <Field label={t('play.chess.level')}>
            <Choice options={['normal', 'medium', 'hard'].map((l) => ({ value: l, label: t(`play.chess.levels.${l}`) }))} value={level} onChange={setLevel} disabled={bs.playing && !botEnd} />
          </Field>
          <Field label={t('play.chess.color')}>
            <Choice options={[{ value: 'w', label: t('play.chess.white') }, { value: 'b', label: t('play.chess.black') }]} value={color} onChange={setColor} disabled={bs.playing && !botEnd} />
          </Field>
          <Button size="lg" className="w-full" onClick={() => setBs({ state: START, last: null, playing: true })}>{bs.playing ? t('play.chess.restart') : t('play.chess.start')}</Button>
          <p className="text-[11px] text-slate-500">{t('play.chess.practiceNote')}</p>
        </>
      ) : inMatch && match.status !== 'done' ? (
        <>
          <p className="rounded-xl bg-white/[0.04] px-3 py-2.5 text-xs text-slate-300">
            {match.stake > 0 ? t('play.chess.pot', { amount: formatCoins(match.stake * 2), cur: match.currency }) : t('play.chess.friendly')} · {match.minutes} min
          </p>
          {match.status === 'waiting' ? (
            <Button size="lg" variant="ghost" className="w-full" onClick={() => act('cancel', { id: match.id })}>{t('play.chess.cancel')}</Button>
          ) : (
            <Button size="lg" variant="ghost" className="w-full" onClick={() => act('resign', { id: match.id })}><Flag className="mr-1.5 h-4 w-4" />{t('play.chess.resign')}</Button>
          )}
        </>
      ) : (
        <>
          <Field label={t('play.chess.stake')}>
            <div className="flex gap-2">
              <input inputMode="numeric" value={form.stake} onChange={(e) => setForm({ ...form, stake: Number(e.target.value.replace(/\D/g, '')) || 0 })} className="input-shell h-10 min-w-0 flex-1 px-3 font-mono text-sm text-white outline-none" />
              <div className="w-28 shrink-0"><Choice options={[{ value: 'AC', label: 'AC' }, { value: 'AG', label: 'AG' }]} value={form.currency} onChange={(v) => setForm({ ...form, currency: v })} /></div>
            </div>
          </Field>
          <Field label={t('play.chess.time')}>
            <Choice options={(lobby?.times ?? [3, 5, 10]).map((m) => ({ value: m, label: `${m} min` }))} value={form.minutes} onChange={(v) => setForm({ ...form, minutes: v })} />
          </Field>
          <Button size="lg" className="w-full" onClick={() => act('create', form)}><Swords className="mr-1.5 h-4 w-4" />{t('play.chess.create')}</Button>
          <p className="text-[11px] text-slate-500">{t('play.chess.rule', { rake: Math.round((lobby?.rake ?? 0.05) * 100) })}</p>
        </>
      )}
    </>
  )

  let stage
  if (mode === 'bot') {
    const me = color
    stage = (
      <Stage className="space-y-2 p-3 sm:p-5">
        <ClockBar name={`${t('play.chess.botName')} · ${t(`play.chess.levels.${level}`)}`} active={bs.playing && bs.state.t !== me && !botEnd} />
        <Board state={bs.state} side={me} last={bs.last} disabled={!bs.playing || !!botEnd || bs.state.t !== me} onMove={(m) => setBs((s) => ({ ...s, state: apply(s.state, m), last: m }))} />
        <ClockBar name={t('play.chess.you')} active={bs.playing && bs.state.t === me && !botEnd} />
        {botEnd && (
          <motion.p initial={{ y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-center font-display text-lg font-bold text-white">
            {botEnd === 'checkmate' ? (bs.state.t === me ? t('play.chess.youLose') : t('play.chess.youWin')) : t('play.chess.draw', { reason: t(`play.chess.reasons.${botEnd}`) })}
          </motion.p>
        )}
      </Stage>
    )
  } else if (inMatch) {
    const opp = match.you === 'w' ? match.black : match.white
    const meU = match.you === 'w' ? match.white : match.black
    const oppSide = match.you === 'w' ? 'b' : 'w'
    const last = match.moves[match.moves.length - 1] ?? null
    stage = (
      <Stage className="space-y-2 p-3 sm:p-5">
        <ClockBar name={opp?.username ?? t('play.chess.waiting')} ms={match.status === 'waiting' ? null : liveMs(oppSide)} active={match.status === 'active' && match.state.t === oppSide} />
        <Board state={match.state} side={match.you} last={last} disabled={match.status !== 'active' || match.state.t !== match.you || match._pending} onMove={pvpMove} />
        <ClockBar name={meU?.username ?? ''} you ms={match.status === 'waiting' ? null : liveMs(match.you)} active={match.status === 'active' && match.state.t === match.you} />
        {match.status === 'waiting' && <p className="text-center text-sm text-slate-400">{t('play.chess.waitingFor')}</p>}
        {match.status === 'done' && (
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-2 text-center">
            <p className={clsx('font-display text-xl font-bold', match.result === match.you ? 'text-neon-green' : match.result === 'draw' ? 'text-slate-200' : 'text-neon-red')}>{resultText(match)}</p>
            <Button size="sm" onClick={() => setMatch(null)}>{t('play.chess.back')}</Button>
          </motion.div>
        )}
      </Stage>
    )
  } else {
    stage = (
      <Stage className="p-4 sm:p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-white"><Users className="h-4 w-4 text-neon-cyan" />{t('play.chess.openGames')}</p>
        {!lobby ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-white/[0.04]" />)}</div>
        ) : lobby.open.filter((o) => !o.mine).length === 0 ? (
          <div className="grid place-items-center gap-2 py-10 text-center text-sm text-slate-500"><Bot className="h-8 w-8 text-slate-600" />{t('play.chess.noGames')}</div>
        ) : (
          <ul className="space-y-2">
            {lobby.open.filter((o) => !o.mine).map((o) => (
              <motion.li key={o.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
                <span className="text-sm text-slate-200">@{o.host} · <span className="font-mono">{o.stake > 0 ? `${formatCoins(o.stake)} ${o.currency}` : t('play.chess.friendly')}</span> · {o.minutes} min</span>
                <Button size="sm" onClick={() => act('join', { id: o.id })}>{t('play.chess.join')}</Button>
              </motion.li>
            ))}
          </ul>
        )}
      </Stage>
    )
  }

  return <GameShell game={game} controls={controls} stage={stage} outcome={null} />
}
