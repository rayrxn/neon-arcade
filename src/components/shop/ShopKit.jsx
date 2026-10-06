import clsx from 'clsx'
import { Emote, ProfileFx } from '@/components/ui/Identity'
import { CurrencyIcon } from '@/components/ui/Currency'
import { emoteMap, useCatalog } from '@/services/platform2'
import { formatCoins } from '@/utils/format'

export const RARITY = {
  common: { text: 'text-slate-300', ring: 'ring-white/[0.08]', glow: '' },
  rare: { text: 'text-sky-300', ring: 'ring-sky-400/25', glow: 'shadow-[0_0_24px_-12px_rgba(56,189,248,0.6)]' },
  epic: { text: 'text-violet-300', ring: 'ring-violet-400/30', glow: 'shadow-[0_0_28px_-12px_rgba(167,139,250,0.7)]' },
  legendary: { text: 'text-amber-300', ring: 'ring-amber-400/35', glow: 'shadow-[0_0_32px_-12px_rgba(251,191,36,0.75)]' },
}

/** Visual preview of a shop item, drawn from its style (same renderer the live effect uses). */
export function ItemVisual({ item, className }) {
  const catalog = useCatalog()
  const st = item?.style ?? {}
  const base = clsx('relative grid h-full w-full place-items-center overflow-hidden', className)
  if (!item) return <div className={base} />
  switch (item.kind) {
    case 'boost':
      return (
        <div className={base}>
          <span className="absolute h-16 w-16 rounded-full blur-2xl" style={{ background: st.color ?? '#22d3ee', opacity: 0.35 }} />
          <span className="relative text-4xl">{st.glyph ?? '⚡'}</span>
        </div>
      )
    case 'emote': {
      const e = emoteMap(catalog)[item.effect?.emote]
      return <div className={base}>{e ? <Emote emote={e} size="lg" className="!text-[2.6rem]" /> : <span className="text-3xl">?</span>}</div>
    }
    case 'nameEffect':
      return (
        <div className={base}>
          <span className={clsx('name-fx font-display text-2xl font-extrabold', st.glitch && 'name-fx--glitch')} style={{ backgroundImage: `linear-gradient(90deg, ${[...(st.colors ?? ['#fff', '#fff']), (st.colors ?? ['#fff'])[0]].join(', ')})` }}>Player</span>
        </div>
      )
    case 'chatEffect':
      return (
        <div className={clsx(base, 'px-4')}>
          <p className={clsx('chat-fx w-full px-3 py-2 text-left text-[11px] text-slate-200', st.animated && 'chat-fx--animated')} style={{ '--fx': st.color, '--fx2': st.color2 ?? st.color }}>
            <b className="text-white">You</b> gg wp 🔥
          </p>
        </div>
      )
    case 'profileEffect':
      return (
        <div className={clsx(base, 'bg-ink-900')}>
          <ProfileFx kind={st.kind ?? 'aurora'} colors={st.colors ?? ['#22d3ee', '#a855f7']} />
        </div>
      )
    case 'theme':
      return <div className={base} style={{ backgroundImage: `linear-gradient(130deg, ${(st.colors ?? ['#1e293b', '#0f172a']).join(', ')})` }}><span className="h-2 w-16 rounded-full" style={{ background: st.accent ?? '#fff' }} /></div>
    case 'badge':
      return <div className={base}><span className="text-4xl" style={{ color: st.color, filter: `drop-shadow(0 0 10px ${st.color ?? '#fff'})` }}>{st.glyph ?? '★'}</span></div>
    case 'frame':
      return (
        <div className={base}>
          <span className="h-12 w-12 rounded-xl bg-gradient-to-br from-[#b8c4d6] to-[#5b6b85]" style={{ boxShadow: `0 0 0 2px rgb(var(--ink-950)), 0 0 0 4px ${st.color}, 0 0 18px ${st.color}88` }} />
        </div>
      )
    default:
      return <div className={base} />
  }
}

export function Price({ value, currency = 'AG', className }) {
  return (
    <span className={clsx('num inline-flex items-center gap-1 font-mono font-bold', className)}>
      <CurrencyIcon currency={currency} size={14} />
      {Number(value) === 0 ? 'Free' : formatCoins(value)}
    </span>
  )
}
