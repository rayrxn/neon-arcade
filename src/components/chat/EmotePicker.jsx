import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Clock3, Lock, Search, Star, X } from 'lucide-react'
import clsx from 'clsx'
import { Emote } from '@/components/ui/Identity'
import { cardOf, favoriteEmote, itemOf, roleOf, useCatalog, useExtras } from '@/services/platform2'
import { toast } from '@/store/useUiStore'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

const CATEGORIES = ['general', 'reactions', 'funny', 'rare', 'loyalty', 'vip', 'vvip', 'events']
const RARITY_TONE = { common: 'text-slate-400', rare: 'text-sky-300', epic: 'text-violet-300', legendary: 'text-amber-300' }

/** How an emote is unlocked, in words. */
export function unlockText(t, catalog, e) {
  const u = e.unlock ?? {}
  if (u.type === 'free') return t('emotes.unlock.free')
  if (u.type === 'shop') return t('emotes.unlock.shop', { price: itemOf(catalog, u.value)?.price ?? '?' })
  if (u.type === 'item') return t('emotes.unlock.item')
  if (u.type === 'card') return t('emotes.unlock.card', { card: cardOf(catalog, u.value).name })
  if (u.type === 'vip') return t('emotes.unlock.vip')
  if (u.type === 'vvip') return t('emotes.unlock.vvip')
  if (u.type === 'level') return t('emotes.unlock.level', { level: u.value })
  if (u.type === 'role') return t('emotes.unlock.role', { role: roleOf(catalog, u.value)?.name ?? u.value })
  return '—'
}

/**
 * Emote picker: search, Favorites, Recently used, categories, owned / locked state.
 * Ownership comes from the server (extras.emotes); locked emotes show how to unlock them.
 */
export default function EmotePicker({ onPick, onClose }) {
  const { t } = useT()
  const catalog = useCatalog()
  const extras = useExtras()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState(extras.emoteFavs.length ? 'favorites' : 'all')
  const [hover, setHover] = useState(null)
  const searchRef = useRef(null)
  const owned = useMemo(() => new Set(extras.emotes), [extras.emotes])
  const favs = useMemo(() => new Set(extras.emoteFavs), [extras.emoteFavs])
  const byCode = useMemo(() => Object.fromEntries(catalog.emotes.map((e) => [e.code, e])), [catalog.emotes])

  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true })
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const q = query.trim().toLowerCase().replace(/:/g, '')
  const list = (() => {
    if (q) return catalog.emotes.filter((e) => e.code.includes(q) || e.name.toLowerCase().includes(q))
    if (tab === 'favorites') return extras.emoteFavs.map((c) => byCode[c]).filter(Boolean)
    if (tab === 'recent') return extras.emoteRecent.map((c) => byCode[c]).filter(Boolean)
    if (tab === 'owned') return catalog.emotes.filter((e) => owned.has(e.code))
    if (tab === 'locked') return catalog.emotes.filter((e) => !owned.has(e.code))
    if (CATEGORIES.includes(tab)) return catalog.emotes.filter((e) => e.category === tab)
    return catalog.emotes
  })()

  const toggleFav = async (e) => {
    try {
      await favoriteEmote(e.code, !favs.has(e.code))
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    }
  }

  const pick = (e) => {
    if (!owned.has(e.code)) return
    onPick(e)
  }

  const tabs = [
    { id: 'favorites', label: t('emotes.favorites'), icon: Star },
    { id: 'recent', label: t('emotes.recent'), icon: Clock3 },
    { id: 'all', label: t('common.all') },
    { id: 'owned', label: t('emotes.owned') },
    { id: 'locked', label: t('emotes.locked'), icon: Lock },
    ...CATEGORIES.map((c) => ({ id: c, label: t(`emotes.categories.${c}`) })),
  ]
  const info = hover ?? list[0] ?? null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.16 }}
      className="glass-strong absolute bottom-[calc(100%+10px)] right-0 z-30 flex w-[min(340px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl"
      role="dialog"
      aria-label={t('chat.emotes')}
    >
      <div className="flex items-center gap-2 border-b hairline p-2.5">
        <div className="input-shell flex h-9 min-w-0 flex-1 items-center gap-2 px-2.5">
          <Search className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('emotes.search')} className="h-full min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" aria-label={t('emotes.search')} />
        </div>
        <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label={t('common.close')}><X className="h-4 w-4" /></button>
      </div>
      {!q && (
        <div className="flex gap-1 overflow-x-auto border-b hairline px-2.5 py-2 scrollbar-none">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={clsx('flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition', tab === id ? 'bg-white/[0.1] text-white' : 'text-slate-500 hover:text-slate-200')}>
              {Icon && <Icon className="h-3 w-3" />} {label}
            </button>
          ))}
        </div>
      )}
      <div className="grid max-h-56 min-h-[136px] grid-cols-7 content-start gap-1 overflow-y-auto p-2.5">
        {list.length === 0 && <p className="col-span-7 py-8 text-center text-xs text-slate-500">{t(tab === 'favorites' && !q ? 'emotes.noFavorites' : tab === 'recent' && !q ? 'emotes.noRecent' : 'emotes.none')}</p>}
        {list.map((e) => {
          const isOwned = owned.has(e.code)
          return (
            <button
              key={e.code}
              type="button"
              onClick={() => pick(e)}
              onMouseEnter={() => setHover(e)}
              onFocus={() => setHover(e)}
              aria-disabled={!isOwned}
              className={clsx('relative grid aspect-square place-items-center rounded-xl transition', isOwned ? 'hover:bg-white/[0.08]' : 'cursor-not-allowed opacity-35 grayscale')}
              aria-label={`${e.name}${isOwned ? '' : ` — ${t('emotes.locked')}`}`}
            >
              <Emote emote={{ ...e, anim: isOwned ? e.anim : 'none' }} />
              {!isOwned && <Lock className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 text-slate-300" />}
              {favs.has(e.code) && <Star className="absolute right-0.5 top-0.5 h-2.5 w-2.5 fill-neon-gold text-neon-gold" />}
            </button>
          )
        })}
      </div>
      {info && (
        <div className="flex items-center gap-3 border-t hairline px-3 py-2.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04]"><Emote emote={info} size="lg" /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-bold text-white">
              <span className="truncate">{info.name}</span>
              <span className={clsx('text-[10px] font-extrabold uppercase tracking-wider', RARITY_TONE[info.rarity])}>{t(`rarity.${info.rarity}`)}</span>
            </p>
            <p className="truncate text-[11px] text-slate-500">:{info.code}: · {owned.has(info.code) ? t('emotes.ownedState') : unlockText(t, catalog, info)}</p>
          </div>
          {owned.has(info.code) && (
            <button type="button" onClick={() => toggleFav(info)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-neon-gold" aria-label={favs.has(info.code) ? t('emotes.unfavorite') : t('emotes.favorite')} aria-pressed={favs.has(info.code)}>
              <Star className={clsx('h-4 w-4', favs.has(info.code) && 'fill-neon-gold text-neon-gold')} />
            </button>
          )}
        </div>
      )}
      <Link to="/shop?category=emotes" onClick={onClose} className="border-t hairline py-2 text-center text-[11px] font-semibold text-slate-500 hover:text-white">{t('emotes.getMore')}</Link>
    </motion.div>
  )
}
