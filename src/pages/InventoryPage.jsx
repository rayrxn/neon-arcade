import { useMemo, useState } from 'react'
import { Lock, Package, Search } from 'lucide-react'
import clsx from 'clsx'
import Avatar, { PRESET_STYLES } from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import { EmptyState, Panel, Segmented } from '@/components/ui/Controls'
import { PageHeader, QueryView, useQuery } from '@/components/ui/PageKit'
import { useCurrentUser } from '@/store/useAuthStore'
import { useActiveWallet } from '@/store/useWalletStore'
import { toast } from '@/store/useUiStore'
import { COSMETICS, COSMETIC_KINDS } from '@/config/cosmetics'
import { equip, equippedOf, isEquipped, MAX_BADGES, ownedItems, unequip } from '@/services/cosmetics'
import { errorKey } from '@/utils/errors'
import { pick, useT } from '@/i18n'
import { ItemVisual, RARITY } from '@/components/shop/ShopKit'
import { equipStyle, activateBoost, useCatalog, useExtras } from '@/services/platform2'
import { SERVER_MODE } from '@/config/runtime'
import { Link } from 'react-router-dom'
import { ShoppingBag, Zap } from 'lucide-react'

const INV_TABS = ['all', 'emote', 'cosmetics', 'effects', 'badge', 'boost', 'theme']
const tabOf = (kind) => (kind === 'frame' ? 'cosmetics' : ['nameEffect', 'chatEffect', 'profileEffect'].includes(kind) ? 'effects' : kind)

/** Items bought in the shop (and membership cosmetics). Ownership comes from the server only. */
function ShopInventory({ user }) {
  const { t } = useT()
  const catalog = useCatalog()
  const extras = useExtras()
  const [tab, setTab] = useState('all')
  if (!SERVER_MODE) return null
  const tier = extras.membership?.tier
  const rank = tier === 'vvip' ? 2 : tier === 'vip' ? 1 : 0
  const items = catalog.shop.filter((i) => (extras.inventory[i.id] ?? 0) > 0 || (i.requires?.membership && rank >= (i.requires.membership === 'vvip' ? 2 : 1)))
  const list = tab === 'all' ? items : items.filter((i) => tabOf(i.kind) === tab)
  const run = async (fn, ok) => {
    try {
      await fn()
      toast({ tone: 'success', title: ok })
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    }
  }
  return (
    <Panel title={t('inventory.shopItems')} icon={ShoppingBag} action={<Link to="/shop" className="text-xs font-bold text-neon-cyan hover:underline">{t('nav.shop')}</Link>} bodyClassName="p-3 sm:p-4">
      <div className="-mx-1 mb-3 overflow-x-auto px-1 scrollbar-none">
        <Segmented size="sm" layoutId="inv-shop" value={tab} onChange={setTab} className="w-max" options={INV_TABS.map((k) => ({ value: k, label: k === 'all' ? t('common.all') : t(`inventory.shopTabs.${k}`) }))} />
      </div>
      {list.length === 0 ? (
        <EmptyState icon={ShoppingBag} title={t('inventory.shopEmpty')} body={t('inventory.shopEmptyBody')} action={<Link to="/shop"><Button size="sm">{t('nav.shop')}</Button></Link>} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((item) => {
            const on = user?.style?.[item.kind] === item.id
            const qty = extras.inventory[item.id] ?? 0
            return (
              <div key={item.id} className={clsx('flex h-full flex-col overflow-hidden rounded-2xl ring-1 ring-inset', on ? 'bg-neon-cyan/[0.06] ring-neon-cyan/30' : clsx('bg-white/[0.02]', (RARITY[item.rarity] ?? RARITY.common).ring))}>
                <div className="h-20 border-b hairline bg-ink-950/40"><ItemVisual item={item} /></div>
                <div className="flex flex-1 flex-col items-center gap-1 p-3 text-center">
                  <p className="line-clamp-1 text-sm font-bold text-white">{item.name}</p>
                  <p className="text-[11px] text-slate-500">{t(`inventory.shopTabs.${tabOf(item.kind)}`)}{item.kind === 'boost' ? ` · ×${qty}` : item.requires?.membership ? ` · ${item.requires.membership.toUpperCase()}` : ''}</p>
                  <div className="mt-auto flex h-8 w-full items-center justify-center pt-1">
                    {item.kind === 'boost' ? (
                      <Button size="xs" className="w-full" onClick={() => run(() => activateBoost(item.id), t('shop.boostOn', { item: item.name }))}><Zap className="h-3.5 w-3.5" /> {t('shop.activate')}</Button>
                    ) : item.kind === 'emote' ? (
                      <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-slate-300">:{item.effect?.emote}:</span>
                    ) : (
                      <Button size="xs" variant={on ? 'ghost' : 'primary'} className="w-full" onClick={() => run(() => equipStyle(item.kind, on ? null : item.id), on ? t('shop.unequipped', { item: item.name }) : t('shop.equipped', { item: item.name }))}>{on ? t('inventory.unequip') : t('inventory.equip')}</Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Panel>
  )
}

const TONES = { gold: 'bg-neon-gold/15 text-neon-gold', green: 'bg-neon-green/15 text-neon-green', cyan: 'bg-neon-cyan/15 text-neon-cyan', purple: 'bg-neon-purple/15 text-neon-purple', pink: 'bg-neon-pink/15 text-neon-pink' }

/** Pratinjau visual satu item kosmetik. */
export function ItemPreview({ id, user, size = 'md' }) {
  const item = COSMETICS[id]
  if (!item) return null
  const box = size === 'sm' ? 'h-10 w-10 text-sm' : 'h-16 w-16 text-xl'
  if (item.kind === 'frame') return <Avatar user={{ ...user, frame: id }} size={size === 'sm' ? 'sm' : 'lg'} />
  if (item.kind === 'avatar') return <span className={clsx('grid place-items-center rounded-2xl bg-gradient-to-br font-display font-extrabold text-onaccent', box, PRESET_STYLES[item.preset])}>{(user?.displayName ?? '?').slice(0, 2).toUpperCase()}</span>
  if (item.kind === 'badge' || item.kind === 'chatBadge') return <span className={clsx('grid place-items-center rounded-2xl font-display font-extrabold', box, TONES[item.tone] ?? TONES.cyan)}>{item.glyph}</span>
  if (item.kind === 'banner') return <span className={clsx('block rounded-xl bg-gradient-to-r ring-1 ring-inset ring-white/10', size === 'sm' ? 'h-10 w-16' : 'h-16 w-28', item.gradient)} />
  if (item.kind === 'emote') return <span className={clsx('grid place-items-center rounded-2xl bg-white/[0.05] font-bold', box)}>{item.glyph}</span>
  return <span className={clsx('grid place-items-center rounded-2xl bg-white/[0.05] px-2 text-center text-[10px] font-extrabold uppercase tracking-wider text-neon-cyan', box)}>Title</span>
}

export default function InventoryPage() {
  const { t, lang } = useT()
  const user = useCurrentUser()
  const wallet = useActiveWallet()
  const [kind, setKind] = useState('all')
  const [q, setQ] = useState('')
  const [showLocked, setShowLocked] = useState(true)
  const [preview, setPreview] = useState(null)

  const query = useQuery(() => ownedItems(user.id), [wallet?.inventory, user?.id])
  const owned = useMemo(() => new Set(query.data ?? []), [query.data])
  const list = useMemo(
    () =>
      Object.entries(COSMETICS)
        .filter(([id, it]) => (kind === 'all' || it.kind === kind) && (showLocked || owned.has(id)) && (!q.trim() || pick(it.name, lang).toLowerCase().includes(q.trim().toLowerCase())))
        .sort((a, b) => Number(owned.has(b[0])) - Number(owned.has(a[0]))),
    [kind, q, showLocked, owned, lang],
  )
  const eq = equippedOf(user)

  const toggle = (id) => {
    try {
      if (isEquipped(user, id)) unequip(id)
      else equip(id)
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('inventory.title')} subtitle={t('inventory.subtitle', { owned: owned.size, total: Object.keys(COSMETICS).length })} />

      <div className="glass flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center">
        <Avatar user={preview && COSMETICS[preview]?.kind === 'frame' ? { ...user, frame: preview } : preview && COSMETICS[preview]?.kind === 'avatar' ? { ...user, avatar: { kind: 'preset', id: COSMETICS[preview].preset } } : user} size="xl" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-bold text-white">{user.displayName}</p>
          <p className="text-xs text-neon-cyan">{eq.title ? pick(COSMETICS[eq.title]?.name, lang) : t('inventory.noTitle')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {eq.badges.map((b) => <ItemPreview key={b} id={b} user={user} size="sm" />)}
            {eq.badges.length === 0 && <span className="text-[11px] text-slate-500">{t('inventory.noBadges', { max: MAX_BADGES })}</span>}
          </div>
        </div>
        {preview && <p className="text-xs text-slate-400">{t('inventory.previewing', { item: pick(COSMETICS[preview]?.name, lang) })}</p>}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
          <Segmented size="sm" layoutId="inv-kind" value={kind} onChange={setKind} className="w-max" options={[{ value: 'all', label: t('common.all') }, ...COSMETIC_KINDS.map((k) => ({ value: k, label: t(`inventory.kinds.${k}`) }))]} />
        </div>
        <div className="input-shell flex h-9 min-w-0 flex-1 items-center gap-2 px-3">
          <Search className="h-4 w-4 shrink-0 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('inventory.search')} aria-label={t('inventory.search')} className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          <input type="checkbox" checked={showLocked} onChange={(e) => setShowLocked(e.target.checked)} className="accent-[#5ef0ff]" /> {t('inventory.showLocked')}
        </label>
      </div>

      <ShopInventory user={user} />

      <Panel title={t('inventory.items')} icon={Package} bodyClassName="p-3 sm:p-4">
        <QueryView query={{ ...query, data: query.data && list }} rows={4} empty={<EmptyState icon={Package} title={t('inventory.empty')} body={t('inventory.emptyBody')} />}>
          {(items) => (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {items.map(([id, it]) => {
                const has = owned.has(id)
                const on = isEquipped(user, id)
                return (
                  <div
                    key={id}
                    onMouseEnter={() => setPreview(id)}
                    onMouseLeave={() => setPreview(null)}
                    className={clsx('flex h-full flex-col items-center gap-2 rounded-2xl p-3 text-center ring-1 ring-inset transition', on ? 'bg-neon-cyan/[0.06] ring-neon-cyan/30' : 'bg-white/[0.02] ring-white/[0.06]', !has && 'opacity-60')}
                  >
                    <div className="relative grid h-20 w-full place-items-center">
                      <ItemPreview id={id} user={user} />
                    </div>
                    <p className="line-clamp-1 text-sm font-bold text-white">{pick(it.name, lang)}</p>
                    <p className="text-[11px] text-slate-500">{t(`inventory.kinds.${it.kind}`)} · {t(`inventory.sources.${it.source}`)}</p>
                    <div className="mt-auto flex h-8 w-full items-center justify-center gap-1.5">
                      {has ? (
                        it.kind === 'emote' ? (
                          <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] text-slate-300">:{it.code}:</span>
                        ) : (
                          <>
                            <Button size="xs" variant={on ? 'ghost' : 'primary'} className="flex-1" onClick={() => toggle(id)}>{on ? t('inventory.unequip') : t('inventory.equip')}</Button>
                            <Button size="xs" variant="subtle" onClick={() => setPreview(preview === id ? null : id)}>{t('inventory.preview')}</Button>
                          </>
                        )
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-500"><Lock className="h-3 w-3" /> {t('inventory.locked')}</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </QueryView>
      </Panel>
    </div>
  )
}
