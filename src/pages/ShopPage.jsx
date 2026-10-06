import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRightLeft, CheckCircle2, Clock3, Lock, PackageCheck, ShoppingBag, Sparkles, Zap } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { EmptyState, Segmented } from '@/components/ui/Controls'
import { PageHeader } from '@/components/ui/PageKit'
import { CurrencyIcon } from '@/components/ui/Currency'
import { ItemVisual, Price, RARITY } from '@/components/shop/ShopKit'
import { buyItem, cardOf, equipStyle, activateBoost, useCatalog, useExtras } from '@/services/platform2'
import { useDisplayBalance } from '@/store/useWalletStore'
import { useCurrentUser } from '@/store/useAuthStore'
import { toast } from '@/store/useUiStore'
import { SERVER_MODE } from '@/config/runtime'
import { useNow } from '@/hooks/useNow'
import { errorKey } from '@/utils/errors'
import { formatCoins, formatLeft } from '@/utils/format'
import { useT } from '@/i18n'

export const SHOP_CATEGORIES = ['boosts', 'emotes', 'profile-effects', 'chat-effects', 'name-effects', 'themes', 'badges', 'cosmetics', 'loyalty', 'limited', 'event']
const STYLE_KINDS = ['nameEffect', 'chatEffect', 'profileEffect', 'theme', 'badge', 'frame']

/** Can this item be bought right now? Returns an i18n reason key when not. */
function availability(item, now) {
  if (!item.active) return 'shop.state.unavailable'
  if (item.availableFrom && item.availableFrom > now) return 'shop.state.soon'
  if (item.availableUntil && item.availableUntil < now) return 'shop.state.ended'
  if (item.stock !== null && item.stock <= 0) return 'shop.state.soldOut'
  return null
}

/** Price after the player's best discount (Loyalty Card or membership) — same rounding as the server. */
export const discounted = (price, pct) => (pct > 0 ? Math.ceil((price * (100 - pct)) / 100) : price)
function useDiscount() {
  return useExtras().perks?.shopDiscount ?? 0
}

function ItemCard({ item, owned, qty, onBuy, onEquip, equipped, now, locked }) {
  const disc = useDiscount()
  const price = discounted(item.price, disc)
  const { t } = useT()
  const r = RARITY[item.rarity] ?? RARITY.common
  const blocked = availability(item, now)
  const ownedOnce = owned && !item.repeatable
  return (
    <motion.article layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={clsx('glass group flex h-full flex-col overflow-hidden rounded-2xl ring-1 ring-inset transition hover:-translate-y-0.5', r.ring, r.glow)}>
      <div className="relative h-28 border-b hairline bg-ink-950/40">
        <ItemVisual item={item} />
        <span className={clsx('absolute left-2.5 top-2.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider backdrop-blur', r.text)}>{t(`rarity.${item.rarity}`)}</span>
        {item.availableUntil && !blocked && (
          <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-neon-gold backdrop-blur"><Clock3 className="h-3 w-3" /> {t('shop.endsIn', { time: formatLeft(item.availableUntil - now) })}</span>
        )}
        {item.stock !== null && !blocked && <span className="absolute bottom-2.5 right-2.5 rounded-md bg-black/40 px-1.5 py-0.5 text-[10px] font-bold text-slate-200 backdrop-blur">{t('shop.stockLeft', { n: item.stock })}</span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate font-display text-sm font-bold text-white">{item.name}</h3>
        <p className="mt-1 line-clamp-2 min-h-[2.5rem] text-xs leading-relaxed text-slate-400">{item.description}</p>
        {locked && <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-neon-gold"><Lock className="h-3 w-3" /> {locked}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <span className="flex items-baseline gap-1.5">
            <Price value={price} className="text-sm text-white" />
            {price < item.price && <span className="num font-mono text-[11px] text-slate-500 line-through">{formatCoins(item.price)}</span>}
          </span>
          {ownedOnce ? (
            STYLE_KINDS.includes(item.kind) ? (
              <Button size="xs" variant={equipped ? 'subtle' : 'ghost'} onClick={() => onEquip(item, !equipped)}>{equipped ? t('shop.unequip') : t('shop.equip')}</Button>
            ) : (
              <span className="flex h-8 items-center gap-1 text-xs font-bold text-neon-green"><CheckCircle2 className="h-3.5 w-3.5" /> {t('shop.owned')}</span>
            )
          ) : (
            <Button size="xs" variant="gem" disabled={!!blocked || !!locked} onClick={() => onBuy(item)}>
              {blocked ? t(blocked) : t('shop.buy')}
            </Button>
          )}
        </div>
        {item.repeatable && qty > 0 && <p className="mt-2 text-[11px] font-semibold text-slate-500">{t('shop.inInventory', { n: qty })}</p>}
      </div>
    </motion.article>
  )
}

function BuyDialog({ item, onClose }) {
  const { t } = useT()
  const ag = useDisplayBalance('AG')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  // One request id per dialog → a double click can never charge twice.
  const [requestId] = useState(() => `r${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`)
  const disc = useDiscount()
  if (!item) return null
  const price = discounted(item.price, disc)
  const after = ag - price
  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await buyItem(item.id, requestId)
      setDone(true)
      toast({ tone: 'success', title: t('shop.bought', { item: item.name }) })
    } catch (err) {
      setError({ code: errorKey(err), vars: err?.vars })
    } finally {
      setBusy(false)
    }
  }
  const action = async () => {
    try {
      if (item.kind === 'boost') await activateBoost(item.id)
      else await equipStyle(item.kind, item.id)
      toast({ tone: 'success', title: item.kind === 'boost' ? t('shop.boostOn', { item: item.name }) : t('shop.equipped', { item: item.name }) })
      onClose()
    } catch (err) {
      setError({ code: errorKey(err), vars: err?.vars })
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      locked={busy}
      title={done ? t('shop.thanks') : t('shop.confirmTitle')}
      icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-purple/10 text-neon-purple"><ShoppingBag className="h-5 w-5" /></span>}
      footer={
        done ? (
          <>
            <Button variant="ghost" className="flex-1" onClick={onClose}>{t('common.close')}</Button>
            {(item.kind === 'boost' || STYLE_KINDS.includes(item.kind)) && <Button className="flex-1" onClick={action}>{item.kind === 'boost' ? t('shop.activate') : t('shop.equip')}</Button>}
          </>
        ) : (
          <>
            <Button variant="ghost" className="flex-1" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
            <Button variant="gem" className="flex-1" loading={busy} disabled={after < 0} onClick={confirm}>{t('shop.confirmBuy')}</Button>
          </>
        )
      }
    >
      <div className="flex gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-ink-950/50 ring-1 ring-inset ring-white/[0.06]"><ItemVisual item={item} /></div>
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-white">{item.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{item.description}</p>
        </div>
      </div>
      {!done && (
        <dl className="mt-4 space-y-2 rounded-xl bg-white/[0.03] p-3 text-sm ring-1 ring-inset ring-white/[0.06]">
          <div className="flex justify-between"><dt className="text-slate-400">{t('shop.price')}</dt><dd><Price value={price} className="text-white" />{disc > 0 && price < item.price && <span className="ml-1.5 rounded bg-neon-green/10 px-1 text-[10px] font-bold text-neon-green">−{disc}%</span>}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-400">{t('shop.balance')}</dt><dd className="num font-mono text-slate-200">{formatCoins(ag)} AG</dd></div>
          <div className="flex justify-between border-t hairline pt-2"><dt className="text-slate-400">{t('shop.after')}</dt><dd className={clsx('num font-mono font-bold', after < 0 ? 'text-neon-red' : 'text-white')}>{formatCoins(Math.max(0, after))} AG</dd></div>
        </dl>
      )}
      {!done && after < 0 && (
        <p className="mt-3 text-xs text-neon-red">
          {t('shop.errors.insufficient', { missing: formatCoins(-after) })}{' '}
          <Link to="/wallet#convert" onClick={onClose} className="font-bold underline">{t('shop.convertCta')}</Link>
        </p>
      )}
      {error && <p className="mt-3 rounded-xl bg-neon-red/10 px-3 py-2.5 text-sm font-semibold text-neon-red" role="alert">{t(error.code, error.vars)}</p>}
    </Modal>
  )
}

function ActiveBoosts({ boosts, catalog, now }) {
  const { t } = useT()
  if (!boosts.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {boosts.map((b) => {
        const item = catalog.shop.find((i) => i.id === b.item)
        return (
          <span key={b.id} className="flex items-center gap-2 rounded-xl bg-neon-green/[0.07] px-3 py-2 text-xs font-semibold text-slate-200 ring-1 ring-inset ring-neon-green/20">
            <Zap className="h-3.5 w-3.5 text-neon-green" /> {item?.name ?? b.type} · ×{b.mult}
            <span className="text-slate-500">{b.endsAt ? t('shop.boostEnds', { time: formatLeft(b.endsAt - now) }) : t('shop.boostUses', { n: b.usesLeft })}</span>
          </span>
        )
      })}
    </div>
  )
}

export default function ShopPage() {
  const { t } = useT()
  const location = useLocation()
  const catalog = useCatalog()
  const extras = useExtras()
  const user = useCurrentUser()
  const ag = useDisplayBalance('AG')
  const now = useNow(30_000)
  const initial = new URLSearchParams(location?.search ?? '').get('category')
  const [category, setCategory] = useState(SHOP_CATEGORIES.includes(initial) ? initial : 'all')
  const [buying, setBuying] = useState(null)

  const forSale = useMemo(() => catalog.shop.filter((i) => i.active || (extras.inventory[i.id] ?? 0) > 0).filter((i) => !i.requires?.membership), [catalog.shop, extras.inventory])
  const cats = SHOP_CATEGORIES.filter((c) => forSale.some((i) => i.category === c))
  const list = category === 'all' ? forSale : forSale.filter((i) => i.category === category)
  const card = cardOf(catalog, extras.loyalty.card)

  const lockReason = (item) => {
    const req = item.requires ?? {}
    if (req.card && cardOf(catalog, req.card).rank > card.rank) return t('shop.requiresCard', { card: cardOf(catalog, req.card).name })
    return null
  }
  const equip = async (item, on) => {
    try {
      await equipStyle(item.kind, on ? item.id : null)
      toast({ tone: 'success', title: on ? t('shop.equipped', { item: item.name }) : t('shop.unequipped', { item: item.name }) })
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('shop.title')}
        subtitle={t('shop.subtitle')}
        icon={ShoppingBag}
        actions={
          <>
            <span className="flex h-9 items-center gap-1.5 rounded-xl bg-neon-purple/10 px-3 text-sm font-bold text-white ring-1 ring-inset ring-neon-purple/25"><CurrencyIcon currency="AG" size={16} /> <span className="num font-mono">{formatCoins(ag)}</span></span>
            <Link to="/wallet#convert"><Button size="sm" variant="ghost"><ArrowRightLeft className="h-4 w-4" /> {t('shop.getAg')}</Button></Link>
            <Link to="/inventory"><Button size="sm" variant="ghost"><PackageCheck className="h-4 w-4" /> {t('nav.inventory')}</Button></Link>
          </>
        }
      />
      {!SERVER_MODE ? (
        <div className="glass rounded-2xl"><EmptyState icon={Sparkles} title={t('shop.liveOnly')} body={t('shop.liveOnlyBody')} /></div>
      ) : (
        <>
          <ActiveBoosts boosts={extras.boosts} catalog={catalog} now={now} />
          <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <Segmented layoutId="shop-cat" size="sm" value={category} onChange={setCategory} className="w-max" options={[{ value: 'all', label: t('common.all') }, ...cats.map((c) => ({ value: c, label: t(`shop.categories.${c}`) }))]} />
          </div>
          {list.length === 0 ? (
            <div className="glass rounded-2xl"><EmptyState icon={ShoppingBag} title={t('shop.empty')} body={t('shop.emptyBody')} /></div>
          ) : (
            <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {list.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  now={now}
                  owned={(extras.inventory[item.id] ?? 0) > 0}
                  qty={extras.inventory[item.id] ?? 0}
                  equipped={user?.style?.[item.kind] === item.id}
                  locked={lockReason(item)}
                  onBuy={setBuying}
                  onEquip={equip}
                />
              ))}
            </div>
          )}
        </>
      )}
      {buying && <BuyDialog item={buying} onClose={() => setBuying(null)} />}
    </div>
  )
}
