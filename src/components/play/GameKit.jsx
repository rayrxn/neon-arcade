import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, Award, CheckCircle2, ShieldCheck, Sparkles, Target, Trophy } from 'lucide-react'
import clsx from 'clsx'
import GameArt from '@/components/games/GameArt'
import { CurrencyIcon } from '@/components/ui/Currency'
import { useDisplayBalance, useWalletStore } from '@/store/useWalletStore'
import { usePrefsStore } from '@/store/usePrefsStore'
import { SERVER_MODE } from '@/config/runtime'
import { useExtras } from '@/services/platform2'
import { useCurrentUser } from '@/store/useAuthStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useAdminStore } from '@/store/useAdminStore'
import { useProgress } from '@/store/useProgressStore'
import { useFairnessStore } from '@/store/useFairnessStore'
import { toast } from '@/store/useUiStore'
import { LIMITS } from '@/services/games'
import { play } from '@/services/sound'
import { releaseReveal } from '@/services/reveal'
import { formatCoins, formatSigned, timeAgo } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'
import { FavoriteButton } from '@/components/games/GameCard'

/** Jalankan aksi game; error → toast + suara, hasil → state. */
export function useRunner() {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const run = useCallback(
    (fn) => {
      const onError = (err) => {
        play('error')
        toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
        return null
      }
      setBusy(true)
      let res
      try {
        res = fn()
      } catch (err) {
        setBusy(false)
        return onError(err)
      }
      // Mode server: aksi game berupa promise (menunggu jawaban API).
      if (res && typeof res.then === 'function') {
        return res.then(
          (value) => {
            setBusy(false)
            return value
          },
          (err) => {
            setBusy(false)
            return onError(err)
          },
        )
      }
      setBusy(false)
      return res
    },
    [t],
  )
  return { run, busy }
}

/** Kunci tombol main selama animasi ronde berjalan (server juga menolak ronde terlalu cepat). */
export function useLock() {
  const [locked, setLocked] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const lock = useCallback((ms) => {
    setLocked(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setLocked(false), ms)
  }, [])
  return [locked, lock]
}

export const fmtMult = (m) => `${(m ?? 0).toFixed(2)}×`

/** Suara hasil ronde — dipanggil saat animasi mendarat. */
export const playOutcome = (outcome) => {
  // Animasi selesai → payout boleh terlihat di saldo (reveal gate).
  if (outcome?.session?.id) releaseReveal(outcome.session.id)
  play(outcome?.session?.result === 'win' ? 'win' : outcome?.session?.result === 'push' ? 'success' : 'lose')
}

/** Currency used for new rounds (AC or AG). Local mode: AC only. */
export function useBetCurrency() {
  const cur = usePrefsStore((s) => s.betCurrency)
  return SERVER_MODE && cur === 'AG' ? 'AG' : 'AC'
}

/** Highest bet allowed by the player's Loyalty Card for a currency. */
/** Current game (set by GameShell) so controls can apply the game's own limits. */
export const GameSlugContext = createContext(null)

/**
 * The bet limit shown and enforced in the input. Same formula as the server (bet_limits):
 * min(loyalty card × membership bonus with the global cap, this game's own cap).
 */
export function useMaxBet(currency) {
  const loyalty = useExtras().loyalty
  const slug = useContext(GameSlugContext)
  const game = useAdminStore((s) => (slug ? s.gameConfig[slug] : null))
  if (!SERVER_MODE) return LIMITS.maxBet
  const card = Math.floor(currency === 'AG' ? loyalty.maxBetAG ?? 10 : loyalty.maxBetAC ?? 250000)
  const gameCap = currency === 'AG' ? game?.maxBetAG : game?.maxBet
  return gameCap ? Math.min(card, Math.floor(gameCap)) : card
}

/** Bet input: AC/AG switch, ½, 2×, Max. Whole numbers, limited by balance and Loyalty Card. */
export function BetInput({ value, onChange, disabled, label, acOnly = false }) {
  const { t } = useT()
  const chosen = useBetCurrency()
  const currency = acOnly ? 'AC' : chosen
  const setCurrency = usePrefsStore((s) => s.setBetCurrency)
  const balance = useDisplayBalance(currency)
  const maxBet = useMaxBet(currency)
  const clamp = (v) => Math.max(LIMITS.minBet, Math.min(maxBet, Math.floor(v) || 0))
  const set = (v) => onChange(clamp(v))
  const over = value > balance
  const overLimit = value > maxBet
  const switchTo = (c) => {
    if (c === currency || disabled) return
    setCurrency(c)
    onChange(c === 'AG' ? Math.max(1, Math.min(Math.floor(value / 25000) || 1, Math.floor(useWalletStoreBalance(c)) || 1)) : Math.max(LIMITS.minBet, Math.min(100, maxBet)))
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="text-slate-400">{label ?? t('play.bet')}</span>
        <span className="truncate text-slate-500">{t('play.balance')} {formatCoins(balance)} {currency}</span>
      </div>
      {SERVER_MODE && !acOnly && (
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.06]" role="radiogroup" aria-label={t('play.currency')}>
          {['AC', 'AG'].map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={currency === c}
              disabled={disabled}
              onClick={() => switchTo(c)}
              className={clsx('flex h-8 items-center justify-center gap-1.5 rounded-lg text-xs font-bold transition disabled:opacity-50', currency === c ? 'bg-white/[0.1] text-white shadow-sm' : 'text-slate-500 hover:text-slate-200')}
            >
              <CurrencyIcon currency={c} size={14} /> {c}
            </button>
          ))}
        </div>
      )}
      <div className={clsx('input-shell flex items-center gap-2 pl-3 pr-1.5', (over || overLimit) && '!border-neon-red/60')}>
        <CurrencyIcon currency={currency} size={18} />
        <input
          id="bet-amount"
          inputMode="numeric"
          value={value || ''}
          disabled={disabled}
          onChange={(e) => onChange(Math.min(maxBet * 10, Number(e.target.value.replace(/\D/g, '')) || 0))}
          onBlur={() => set(value)}
          className="num h-11 min-w-0 flex-1 bg-transparent font-mono text-base font-bold text-white outline-none disabled:opacity-60"
          aria-label={label ?? t('play.bet')}
        />
        <div className="flex shrink-0 gap-1">
          {[
            ['½', () => set(value / 2)],
            ['2×', () => set(value * 2)],
            ['Max', () => set(Math.min(balance, maxBet))],
          ].map(([lbl, fn]) => (
            <button key={lbl} type="button" disabled={disabled} onClick={fn} className="h-8 min-w-[2.25rem] rounded-lg bg-white/[0.06] px-2.5 text-xs font-bold text-slate-300 transition hover:bg-white/[0.1] hover:text-white disabled:opacity-40">
              {lbl}
            </button>
          ))}
        </div>
      </div>
      {over && <p className="mt-1.5 text-xs font-medium text-neon-red">{t(currency === 'AG' ? 'errors.insufficientAG' : 'errors.insufficientAC')}</p>}
      {!over && overLimit && (
        <p className="mt-1.5 text-xs font-medium text-neon-red">
          {t('play.errors.loyaltyMaxShort', { max: formatCoins(maxBet), currency })} <Link to="/loyalty" className="underline">{t('loyalty.upgradeLink')}</Link>
        </p>
      )}
    </div>
  )
}

const useWalletStoreBalance = (c) => {
  const w = useWalletStore.getState()
  const wallet = w.wallets[w.activeUserId]
  return c === 'AG' ? wallet?.gems ?? 0 : wallet?.balance ?? 0
}

/** Tombol pilihan kecil (risk, sisi koin, dll.). */
export function Choice({ options, value, onChange, disabled }) {
  return (
    <div className="grid gap-1.5 rounded-xl bg-ink-950/60 p-1 ring-1 ring-inset ring-white/[0.07]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={clsx('h-9 rounded-lg text-sm font-bold transition disabled:opacity-50', value === o.value ? 'bg-white/[0.1] text-white ring-1 ring-inset ring-white/10' : 'text-slate-500 hover:text-slate-200')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
        <span className="text-slate-400">{label}</span>
        {hint && <span className="text-slate-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/** Ringkasan setelah ronde: hasil, XP, level, quest, achievement, rekor. */
export function ResultCard({ outcome, game }) {
  const { t } = useT()
  if (!outcome?.session) return null
  const { session, summary } = outcome
  const net = session.payout - session.bet
  const tone = session.result === 'win' ? 'text-neon-green' : session.result === 'push' ? 'text-slate-300' : 'text-neon-red'
  const quests = (summary?.quests ?? []).map((q) => t(`rewards.quests.${q.id}`))
  const level = summary?.level

  return (
    <motion.section
      key={session.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 sm:p-5"
      aria-live="polite"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className={clsx('font-display text-lg font-bold', tone)}>{t(`play.result.${session.result}`)}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {t('play.round')} #{session.nonce} · {fmtMult(session.multiplier)}
          </p>
        </div>
        <div className="text-right">
          <p className={clsx('num font-mono text-lg font-bold', net > 0 ? 'text-neon-green' : net < 0 ? 'text-slate-300' : 'text-slate-400')}>
            {formatSigned(net)} <span className={clsx('text-xs', session.currency === 'AG' ? 'text-neon-purple' : 'text-neon-gold')}>{session.currency ?? 'AC'}</span>
          </p>
          <p className="text-xs text-slate-500">{t('play.payout')} {formatCoins(session.payout)} {session.currency ?? 'AC'}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.06]">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-bold text-neon-cyan"><Sparkles className="h-3.5 w-3.5" /> +{summary?.xp ?? 0} XP</span>
            {level && <span className="font-semibold text-slate-400">Lv {level.level} · {level.into}/{level.need}</span>}
          </div>
          {level && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
              <motion.div className="h-full rounded-full bg-neon-cyan" initial={{ width: 0 }} animate={{ width: `${(level.into / level.need) * 100}%` }} />
            </div>
          )}
          {summary?.levelUp && <p className="mt-2 text-xs font-bold text-neon-gold">{t('notifications.levelUp.title', { level: summary.levelUp.to ?? summary.levelUp })}</p>}
        </div>
        <div className="space-y-1.5 rounded-xl bg-white/[0.03] p-3 text-xs ring-1 ring-inset ring-white/[0.06]">
          <p className="flex items-center gap-1.5 text-slate-400"><Trophy className="h-3.5 w-3.5 text-neon-gold" /> {t('play.best')} {game}: <b className="text-slate-200">{summary?.best > 0 ? fmtMult(summary.best) : '—'}</b></p>
          {quests.length > 0 ? (
            quests.map((q) => <p key={q} className="flex items-center gap-1.5 font-semibold text-neon-green"><CheckCircle2 className="h-3.5 w-3.5" /> {t('play.questDone')}: {q}</p>)
          ) : (
            <p className="flex items-center gap-1.5 text-slate-500"><Target className="h-3.5 w-3.5" /> {t('play.questHint')}</p>
          )}
          {(summary?.achievements ?? []).map((a) => (
            <p key={a} className="flex items-center gap-1.5 font-semibold text-neon-purple"><Award className="h-3.5 w-3.5" /> {t('rewards.achievements.' + a + '.name')}</p>
          ))}
        </div>
      </div>
    </motion.section>
  )
}

/** Statistik game ini + ronde terakhir. */
function GameStats({ slug }) {
  const { t } = useT()
  const user = useCurrentUser()
  const p = useProgress(user?.id)
  const g = p.stats.perGame[slug] ?? { played: 0, wins: 0, best: 0, bestPayout: 0 }
  const rounds = p.sessions.filter((s) => s.game === slug).slice(0, 8)
  const items = [
    [t('play.stats.played'), formatCoins(g.played)],
    [t('play.stats.wins'), formatCoins(g.wins)],
    [t('play.stats.best'), fmtMult(g.best)],
    [t('play.stats.bestPayout'), g.bestPayoutAG > 0 ? `${formatCoins(g.bestPayout)} AC · ${formatCoins(g.bestPayoutAG)} AG` : `${formatCoins(g.bestPayout)} AC`],
  ]
  return (
    <section className="glass rounded-2xl">
      <dl className="grid grid-cols-2 border-b hairline sm:grid-cols-4">
        {items.map(([label, value], i) => (
          <div key={label} className={clsx('px-4 py-3', i % 2 === 1 && 'border-l hairline', i >= 2 && 'border-t hairline sm:border-t-0', i === 2 && 'sm:border-l')}>
            <dt className="text-[11px] text-slate-500">{label}</dt>
            <dd className="num mt-0.5 font-mono text-sm font-bold text-white">{value}</dd>
          </div>
        ))}
      </dl>
      {rounds.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-slate-500">{t('play.noRounds')}</p>
      ) : (
        <ul className="divide-y divide-white/[0.05]">
          {rounds.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="text-slate-400">#{s.nonce} · {timeAgo(s.at)}</span>
              <span className="num font-mono text-xs text-slate-400">{fmtMult(s.multiplier)}</span>
              <span className={clsx('num w-24 text-right font-mono font-bold', s.payout > s.bet ? 'text-neon-green' : s.payout === s.bet ? 'text-slate-300' : 'text-slate-500')}>
                {formatSigned(s.payout - s.bet)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Kerangka halaman game: header, panel kontrol, panggung, hasil, statistik. */
export function GameShell({ game, controls, stage, outcome }) {
  const { t } = useT()
  const nonce = useFairnessStore((s) => s.nonce)
  return (
    <GameSlugContext.Provider value={game.slug}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/games" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-400 ring-1 ring-inset ring-white/10 hover:text-white focus-ring" aria-label={t('games.back')}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <GameArt slug={game.slug} className="hidden h-10 w-16 shrink-0 rounded-lg sm:block" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-xl font-bold text-white">{game.name}</h1>
          <p className="truncate text-xs text-slate-500">{t(`games.list.${game.slug}`)}</p>
        </div>
        <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:flex">
          <ShieldCheck className="h-3.5 w-3.5 text-neon-green" /> {t('play.fair')} · nonce {nonce}
        </span>
        <FavoriteButton slug={game.slug} showCount />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="glass order-2 h-fit min-w-0 space-y-4 rounded-2xl p-4 lg:order-1">{controls}</aside>
        <div className="order-1 min-w-0 lg:order-2">{stage}</div>
      </div>

      <AnimatePresence mode="wait">{outcome && <ResultCard outcome={outcome} game={game.name} />}</AnimatePresence>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <GameStats slug={game.slug} />
        <LiveFeed slug={game.slug} />
      </div>
    </div>
    </GameSlugContext.Provider>
  )
}

/** Live results of every player for this game (server mode): the global "live bets" feed. */
export function LiveFeed({ slug }) {
  const { t } = useT()
  const live = usePlatformStore((s) => s.live)
  const meId = useCurrentUser()?.id
  if (!SERVER_MODE) return null
  const rows = (live ?? []).filter((l) => l.game === slug).slice(0, 10)
  return (
    <section className="glass rounded-2xl">
      <header className="flex items-center justify-between border-b hairline px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neon-green opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-neon-green" /></span> {t('live.title')}</h3>
        <span className="text-[11px] text-slate-500">{t('live.allPlayers')}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">{t('live.empty')}</p>
      ) : (
        <ul className="divide-y divide-white/[0.04]">
          {rows.map((r) => (
            <li key={r.id} className={clsx('grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2 text-xs', r.userId === meId && 'bg-neon-cyan/[0.04]')}>
              <span className="truncate font-semibold text-slate-200">{r.username}</span>
              <span className="num font-mono text-slate-400">{formatCoins(r.bet)} {r.currency}</span>
              <span className={clsx('num w-28 text-right font-mono font-bold', r.result === 'win' ? 'text-neon-green' : r.result === 'push' ? 'text-slate-300' : 'text-neon-red')}>
                {r.result === 'win' ? `${fmtMult(r.multiplier)} · +${formatCoins(r.payout)}` : r.result === 'push' ? fmtMult(1) : `−${formatCoins(r.bet)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Panggung standar (latar grid tipis). */
export function Stage({ children, className }) {
  return <div className={clsx('glass relative overflow-hidden rounded-2xl', className)}>{children}</div>
}

