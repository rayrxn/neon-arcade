import { useMemo, useState } from 'react'
import { Ban, Check, Pencil, Plus, ShieldAlert, Trash2, X } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Avatar from '@/components/ui/Avatar'
import ReasonDialog from '@/components/admin/ReasonDialog'
import { AdminPage, Badge, Card, FormField, Kpi, SearchInput, Table, Tabs, inputCls } from '@/components/admin/AdminKit'
import { Emote, MemberTag, UserTags } from '@/components/ui/Identity'
import { ItemVisual } from '@/components/shop/ShopKit'
import LoyaltyCard from '@/components/loyalty/LoyaltyCard'
import { SHOP_CATEGORIES } from '@/pages/ShopPage'
import { cardOf, useCatalog } from '@/services/platform2'
import { adminCall, hydrate } from '@/services/server'
import { useAdminStore } from '@/store/useAdminStore'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { toast } from '@/store/useUiStore'
import { can } from '@/config/roles'
import { SERVER_MODE } from '@/config/runtime'
import { errorKey } from '@/utils/errors'
import { formatCoins, formatDateTime } from '@/utils/format'
import { useT } from '@/i18n'

/**
 * Owner panel for platform v2. Every button calls an admin action on the server, which checks
 * the permission again, validates the input and writes the audit log.
 */

const KINDS = ['boost', 'emote', 'profileEffect', 'chatEffect', 'nameEffect', 'theme', 'badge', 'frame']
const RARITIES = ['common', 'rare', 'epic', 'legendary']
const EMOTE_CATS = ['general', 'reactions', 'funny', 'rare', 'loyalty', 'vip', 'vvip', 'events']
const UNLOCKS = ['free', 'shop', 'item', 'card', 'vip', 'vvip', 'level', 'role']
const ANIMS = ['none', 'bounce', 'pulse', 'wiggle', 'spin', 'float', 'shine']

const useV2 = () => useAdminStore((s) => s.v2) ?? {}
const lines = (s) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean)
const toLocal = (ms) => (ms ? new Date(ms - new Date(ms).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const fromLocal = (v) => (v ? new Date(v).getTime() : null)

/** Run an admin action after asking for a reason (or directly when `reason` is false). */
function useAction() {
  const { t } = useT()
  const me = useCurrentUser()
  const [pending, setPending] = useState(null)
  const run = async (name, args) => {
    const res = await adminCall(name, args)
    hydrate()
    return res
  }
  const ask = (title, name, args, description) => setPending({ title, name, args, description })
  const direct = async (name, args, ok) => {
    try {
      await run(name, args)
      toast({ tone: 'success', title: ok ?? t('admin.done') })
      return true
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
      return false
    }
  }
  const dialog = pending && (
    <ReasonDialog open onClose={() => setPending(null)} adminName={me?.username} tone="primary" title={pending.title} description={pending.description} onConfirm={(reason) => run(pending.name, { ...pending.args, reason }).then(() => pending.after?.())} />
  )
  return { ask, direct, dialog, setPending }
}

function UserPicker({ value, onChange }) {
  const { t } = useT()
  const users = useAuthStore((s) => s.users)
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const term = q.trim().toLowerCase()
    return Object.values(users).filter((u) => !term || u.username.toLowerCase().includes(term) || u.displayName?.toLowerCase().includes(term)).slice(0, 8)
  }, [users, q])
  const picked = Object.values(users).find((u) => u.id === value)
  return (
    <div className="space-y-2">
      <SearchInput value={q} onChange={setQ} placeholder={t('adm2.searchUser')} />
      <div className="flex flex-wrap gap-1.5">
        {list.map((u) => (
          <button key={u.id} type="button" onClick={() => onChange(u.id)} className={clsx('flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold ring-1 ring-inset', value === u.id ? 'bg-neon-cyan/10 text-white ring-neon-cyan/30' : 'text-slate-300 ring-white/[0.08] hover:bg-white/[0.04]')}>
            <Avatar user={u} size="xs" /> @{u.username}
          </button>
        ))}
      </div>
      {picked && <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">@{picked.username} <UserTags user={picked} /> · LXP {formatCoins(picked.loyaltyXp ?? 0)}</p>}
    </div>
  )
}

function Field({ label, children, hint }) {
  return <FormField label={label}>{children}{hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}</FormField>
}

function Select({ value, onChange, options, id }) {
  return (
    <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  )
}

function LiveOnly({ title }) {
  const { t } = useT()
  return <AdminPage title={title}><Card><p className="text-sm text-slate-400">{t('shop.liveOnlyBody')}</p></Card></AdminPage>
}

// ───────────────────────────── Economy ─────────────────────────────

export function EconomyAdmin() {
  const { t } = useT()
  const v2 = useV2()
  const { economy } = useCatalog()
  const { ask, dialog } = useAction()
  const [form, setForm] = useState(null)
  const f = form ?? economy
  if (!SERVER_MODE) return <LiveOnly title={t('adm2.economy.title')} />
  return (
    <AdminPage title={t('adm2.economy.title')} description={t('adm2.economy.desc')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title={t('adm2.economy.converter')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('adm2.economy.rate')}><input id="eco-rate" inputMode="numeric" value={f.acPerAg ?? ''} onChange={(e) => setForm({ ...f, acPerAg: Number(e.target.value.replace(/\D/g, '')) })} className={inputCls} /></Field>
            <Field label={t('adm2.economy.min')}><input inputMode="numeric" value={f.convertMinAg ?? ''} onChange={(e) => setForm({ ...f, convertMinAg: Number(e.target.value.replace(/\D/g, '')) })} className={inputCls} /></Field>
            <Field label={t('adm2.economy.daily')}><input inputMode="numeric" value={f.convertMaxAgPerDay ?? ''} onChange={(e) => setForm({ ...f, convertMaxAgPerDay: Number(e.target.value.replace(/\D/g, '')) })} className={inputCls} /></Field>
          </div>
          <p className="mt-3 text-xs text-slate-500">{t('adm2.economy.preview', { ac: formatCoins(f.acPerAg ?? 0) })}</p>
          <Button className="mt-3" size="sm" disabled={!form} onClick={() => ask(t('adm2.economy.converter'), 'setEconomy', f)}>{t('adm2.save')}</Button>
        </Card>
        <div className="grid grid-cols-2 gap-3 self-start">
          <Kpi label={t('adm2.economy.purchases')} value={formatCoins(v2.purchases?.length ?? 0)} sub={t('adm2.economy.last200')} />
          <Kpi label={t('adm2.economy.agSpent')} value={`${formatCoins((v2.purchases ?? []).reduce((s, p) => s + p.price, 0))} AG`} sub={t('adm2.economy.last200')} tone="text-neon-purple" />
        </div>
      </div>
      <Card title={t('adm2.economy.suspicious')} bodyClassName="p-0">
        <Table
          rows={v2.suspicious ?? []}
          empty={t('adm2.economy.noSuspicious')}
          columns={[
            { key: 'at', label: t('admin.cols.time'), render: (x) => <span className="whitespace-nowrap text-xs">{formatDateTime(x.at)}</span> },
            { key: 'user', label: t('admin.cols.user'), render: (x) => `@${x.username}` },
            { key: 'why', label: t('adm2.economy.why'), render: (x) => <Badge tone={x.why === 'selfCredit' || x.why === 'hugeWin' ? 'red' : 'gold'}>{t(`adm2.economy.whys.${x.why ?? 'other'}`)}</Badge> },
            { key: 'type', label: t('adm2.type'), render: (x) => <span className="text-xs text-slate-400">{x.category} · {x.type}</span> },
            { key: 'amount', label: t('adm2.amount'), align: 'right', mono: true, render: (x) => <span className={x.amount < 0 ? 'text-neon-red' : 'text-neon-green'}>{x.amount > 0 ? '+' : ''}{formatCoins(x.amount)} {x.currency}</span> },
            { key: 'reason', label: t('admin.reason'), render: (x) => <span className="text-xs text-slate-400">{x.reason ?? '—'}</span> },
          ]}
        />
      </Card>
      <Card title={t('adm2.economy.recentPurchases')} bodyClassName="p-0">
        <Table rows={v2.purchases ?? []} columns={[
          { key: 'at', label: t('admin.cols.time'), render: (x) => <span className="whitespace-nowrap text-xs">{formatDateTime(x.at)}</span> },
          { key: 'user', label: t('admin.cols.user'), render: (x) => `@${x.username}` },
          { key: 'item', label: t('adm2.item'), render: (x) => x.item },
          { key: 'price', label: t('shop.price'), align: 'right', mono: true, render: (x) => `${formatCoins(x.price)} AG` },
        ]} />
      </Card>
      {dialog}
    </AdminPage>
  )
}

// ───────────────────────────── Loyalty ─────────────────────────────

function CardEditor({ card, onClose, ask }) {
  const { t } = useT()
  const [f, setF] = useState({ ...card, perks: { dailyAc: 0, dailyAg: 0, convertPct: 0, shopDiscount: 0, lxpPct: 0, ...(card.perks ?? {}) }, benefitsText: card.benefits.join('\n') })
  const perk = (k) => (e) => setF({ ...f, perks: { ...f.perks, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 } })
  const num = (k) => (e) => setF({ ...f, [k]: e.target.value === '' ? null : Number(e.target.value.replace(/[^\d.]/g, '')) })
  return (
    <Modal open onClose={onClose} size="lg" title={t('adm2.loyalty.editCard', { card: card.name })} footer={<><Button variant="ghost" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button><Button className="flex-1" onClick={() => { ask(t('adm2.loyalty.editCard', { card: card.name }), 'updateCard', { slug: card.slug, patch: { name: f.name, xpRequired: f.xpRequired, maxBetAC: f.maxBetAC, maxBetAG: f.maxBetAG, perks: f.perks, color: f.color, benefits: lines(f.benefitsText) } }); onClose() }}>{t('adm2.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('adm2.name')}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={t('adm2.color')}><div className="flex gap-2"><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-10 w-12 rounded-lg bg-transparent" /><input value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className={inputCls} /></div></Field>
        <Field label={t('adm2.loyalty.xpRequired')}><input inputMode="numeric" disabled={card.slug === 'none'} value={f.xpRequired ?? ''} onChange={num('xpRequired')} className={inputCls} /></Field>
        <div />
        <Field label={t('adm2.loyalty.maxAc')}><input inputMode="numeric" value={f.maxBetAC ?? ''} onChange={num('maxBetAC')} className={inputCls} /></Field>
        <Field label={t('adm2.loyalty.maxAg')}><input inputMode="numeric" value={f.maxBetAG ?? ''} onChange={num('maxBetAG')} className={inputCls} /></Field>
        <Field label={t('adm2.loyalty.perkDailyAc')}><input inputMode="numeric" value={f.perks.dailyAc} onChange={perk('dailyAc')} className={inputCls} /></Field>
        <Field label={t('adm2.loyalty.perkDailyAg')}><input inputMode="numeric" value={f.perks.dailyAg} onChange={perk('dailyAg')} className={inputCls} /></Field>
        <Field label={t('adm2.loyalty.perkConvert')}><input inputMode="numeric" value={f.perks.convertPct} onChange={perk('convertPct')} className={inputCls} /></Field>
        <Field label={t('adm2.loyalty.perkDiscount')}><input inputMode="numeric" value={f.perks.shopDiscount} onChange={perk('shopDiscount')} className={inputCls} /></Field>
        <Field label={t('adm2.loyalty.perkLxp')}><input inputMode="numeric" value={f.perks.lxpPct} onChange={perk('lxpPct')} className={inputCls} /></Field>
      </div>
      <Field label={t('adm2.benefits')} hint={t('adm2.onePerLine')}><textarea rows={5} value={f.benefitsText} onChange={(e) => setF({ ...f, benefitsText: e.target.value })} className={clsx(inputCls, 'h-auto py-2')} /></Field>
    </Modal>
  )
}

export function LoyaltyAdmin() {
  const { t } = useT()
  const catalog = useCatalog()
  const users = useAuthStore((s) => s.users)
  const { ask, dialog } = useAction()
  const [editing, setEditing] = useState(null)
  const [uid, setUid] = useState(null)
  const [xp, setXp] = useState('')
  const [card, setCard] = useState('')
  const target = Object.values(users).find((u) => u.id === uid)
  if (!SERVER_MODE) return <LiveOnly title={t('adm2.loyalty.title')} />
  const counts = Object.values(users).reduce((m, u) => ({ ...m, [u.loyaltyCard ?? 'none']: (m[u.loyaltyCard ?? 'none'] ?? 0) + 1 }), {})
  return (
    <AdminPage title={t('adm2.loyalty.title')} description={t('adm2.loyalty.desc')}>
      <Card title={t('adm2.loyalty.cards')} bodyClassName="p-0">
        <Table
          rowKey={(c) => c.slug}
          rows={catalog.cards}
          columns={[
            { key: 'face', label: '', render: (c) => <span className="block w-16"><LoyaltyCard card={c} size="sm" /></span> },
            { key: 'name', label: t('adm2.name'), render: (c) => <span className="font-semibold text-white">{c.name}</span> },
            { key: 'xp', label: t('adm2.loyalty.xpRequired'), align: 'right', mono: true, render: (c) => formatCoins(c.xpRequired) },
            { key: 'max', label: t('adm2.loyalty.maxBet'), align: 'right', mono: true, render: (c) => `${formatCoins(c.maxBetAC)} AC · ${formatCoins(c.maxBetAG)} AG` },
            { key: 'perk', label: t('adm2.loyalty.dailyBonus'), align: 'right', mono: true, render: (c) => (c.perks?.dailyAc ? `${formatCoins(c.perks.dailyAc)} AC${c.perks.dailyAg ? ` + ${c.perks.dailyAg} AG` : ''}` : '—') },
            { key: 'holders', label: t('adm2.loyalty.holders'), align: 'right', mono: true, render: (c) => counts[c.slug] ?? 0 },
            { key: 'edit', label: '', align: 'right', render: (c) => <Button size="xs" variant="ghost" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /> {t('adm2.edit')}</Button> },
          ]}
        />
      </Card>
      <Card title={t('adm2.loyalty.userTool')}>
        <UserPicker value={uid} onChange={(id) => { setUid(id); const u = Object.values(users).find((x) => x.id === id); setXp(String(u?.loyaltyXp ?? '')); setCard(u?.loyaltyOverride ?? '') }} />
        {target && (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border hairline p-3">
              <p className="text-xs font-semibold text-slate-400">{t('adm2.loyalty.xp')}</p>
              <div className="mt-2 flex gap-2">
                <input inputMode="numeric" value={xp} onChange={(e) => setXp(e.target.value.replace(/\D/g, ''))} className={inputCls} />
                <Button size="sm" onClick={() => ask(t('adm2.loyalty.setXp', { user: target.username }), 'setLoyaltyXp', { userId: target.id, xp: Number(xp) })}>{t('adm2.save')}</Button>
              </div>
            </div>
            <div className="rounded-xl border hairline p-3">
              <p className="text-xs font-semibold text-slate-400">{t('adm2.loyalty.card')} <span className="text-slate-500">· {t('adm2.loyalty.current')}: {cardOf(catalog, target.loyaltyCard).name}{target.loyaltyFloor && target.loyaltyFloor !== 'none' ? ` · ${t('adm2.loyalty.bought')}: ${cardOf(catalog, target.loyaltyFloor).name}` : ''}</span></p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Select value={card} onChange={setCard} options={[{ value: '', label: t('adm2.loyalty.auto') }, ...catalog.cards.map((c) => ({ value: c.slug, label: c.name }))]} />
                <Button size="sm" onClick={() => ask(t('adm2.loyalty.assign', { user: target.username }), 'setLoyaltyCard', { userId: target.id, card: card || null, mode: 'override' })}>{card ? t('adm2.loyalty.assignBtn') : t('adm2.loyalty.removeOverride')}</Button>
                {target.loyaltyFloor && target.loyaltyFloor !== 'none' && <Button size="sm" variant="danger" onClick={() => ask(t('adm2.loyalty.removeBought', { user: target.username }), 'setLoyaltyCard', { userId: target.id, card: null, mode: 'floor' })}>{t('adm2.loyalty.removeBoughtBtn')}</Button>}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">{t('adm2.loyalty.overrideHint')}</p>
            </div>
          </div>
        )}
      </Card>
      {editing && <CardEditor card={editing} onClose={() => setEditing(null)} ask={ask} />}
      {dialog}
    </AdminPage>
  )
}

// ───────────────────────────── Player roles ─────────────────────────────

function RoleEditor({ role, onClose, ask }) {
  const { t } = useT()
  const [f, setF] = useState(role ?? { slug: '', name: '', rank: 7, icon: 'sparkles', color: '#22d3ee', minLevel: 100, benefits: { dailyBonusPct: 0, perks: [] }, active: true })
  const [perks, setPerks] = useState((f.benefits?.perks ?? []).join('\n'))
  const save = () => {
    ask(role ? t('adm2.roles.edit', { role: role.name }) : t('adm2.roles.create'), 'upsertPlayerRole', { role: { ...f, benefits: { dailyBonusPct: Number(f.benefits?.dailyBonusPct ?? 0), perks: lines(perks) } } })
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={role ? t('adm2.roles.edit', { role: role.name }) : t('adm2.roles.create')} footer={<><Button variant="ghost" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button><Button className="flex-1" onClick={save}>{t('adm2.save')}</Button></>}>
      <div className="mb-3"><span className="id-tag role-chip" style={{ '--tag': f.color }}>{f.name || 'Role'}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('adm2.slug')}><input value={f.slug} disabled={!!role} onChange={(e) => setF({ ...f, slug: e.target.value.toLowerCase() })} className={inputCls} /></Field>
        <Field label={t('adm2.name')}><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
        <Field label={t('adm2.roles.minLevel')}><input inputMode="numeric" value={f.minLevel} onChange={(e) => setF({ ...f, minLevel: Number(e.target.value.replace(/\D/g, '')) || 1 })} className={inputCls} /></Field>
        <Field label={t('adm2.roles.rank')}><input inputMode="numeric" value={f.rank} onChange={(e) => setF({ ...f, rank: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={inputCls} /></Field>
        <Field label={t('adm2.color')}><div className="flex gap-2"><input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-10 w-12 rounded-lg bg-transparent" /><input value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className={inputCls} /></div></Field>
        <Field label={t('adm2.roles.icon')}><Select value={f.icon} onChange={(v) => setF({ ...f, icon: v })} options={['sprout', 'dice', 'target', 'flame', 'shield', 'gem', 'crown', 'zap', 'star', 'sparkles']} /></Field>
        <Field label={t('adm2.roles.dailyBonus')}><input inputMode="decimal" value={f.benefits?.dailyBonusPct ?? 0} onChange={(e) => setF({ ...f, benefits: { ...f.benefits, dailyBonusPct: e.target.value.replace(/[^\d.]/g, '') } })} className={inputCls} /></Field>
        <Field label={t('adm2.active')}><label className="flex h-10 items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> {t('adm2.active')}</label></Field>
      </div>
      <Field label={t('adm2.benefits')} hint={t('adm2.onePerLine')}><textarea rows={4} value={perks} onChange={(e) => setPerks(e.target.value)} className={clsx(inputCls, 'h-auto py-2')} /></Field>
    </Modal>
  )
}

export function PlayerRolesAdmin() {
  const { t } = useT()
  const v2 = useV2()
  const users = useAuthStore((s) => s.users)
  const roles = v2.catalog?.roles ?? []
  const { ask, dialog } = useAction()
  const [editing, setEditing] = useState(undefined)
  const [uid, setUid] = useState(null)
  const [role, setRole] = useState('')
  const target = Object.values(users).find((u) => u.id === uid)
  if (!SERVER_MODE) return <LiveOnly title={t('adm2.roles.title')} />
  return (
    <AdminPage title={t('adm2.roles.title')} description={t('adm2.roles.desc')} actions={<Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> {t('adm2.roles.create')}</Button>}>
      <Card bodyClassName="p-0">
        <Table
          rowKey={(r) => r.slug}
          rows={roles}
          columns={[
            { key: 'tag', label: t('adm2.tag'), render: (r) => <span className="id-tag role-chip" style={{ '--tag': r.color }}>{r.name}</span> },
            { key: 'lvl', label: t('adm2.roles.minLevel'), align: 'right', mono: true, render: (r) => r.minLevel },
            { key: 'bonus', label: t('adm2.roles.dailyBonus'), align: 'right', mono: true, render: (r) => `+${r.benefits?.dailyBonusPct ?? 0}%` },
            { key: 'perks', label: t('adm2.benefits'), render: (r) => <span className="text-xs text-slate-400">{(r.benefits?.perks ?? []).join(' · ')}</span> },
            { key: 'active', label: t('adm2.active'), render: (r) => (r.active ? <Badge tone="green">on</Badge> : <Badge>off</Badge>) },
            { key: 'a', label: '', align: 'right', render: (r) => (
              <span className="flex justify-end gap-1">
                <Button size="xs" variant="ghost" onClick={() => setEditing(r)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="xs" variant="danger" onClick={() => ask(t('adm2.roles.delete', { role: r.name }), 'deletePlayerRole', { slug: r.slug })}><Trash2 className="h-3.5 w-3.5" /></Button>
              </span>
            ) },
          ]}
        />
      </Card>
      <Card title={t('adm2.roles.assignTitle')}>
        <UserPicker value={uid} onChange={(id) => { setUid(id); setRole(Object.values(users).find((x) => x.id === id)?.playerRoleManual ?? '') }} />
        {target && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={role} onChange={setRole} options={[{ value: '', label: t('adm2.roles.auto') }, ...roles.map((r) => ({ value: r.slug, label: r.name }))]} />
            <Button size="sm" onClick={() => ask(t('adm2.roles.assign', { user: target.username }), 'setPlayerRole', { userId: target.id, role: role || null })}>{role ? t('adm2.roles.assignBtn') : t('adm2.roles.removeBtn')}</Button>
          </div>
        )}
      </Card>
      {editing !== undefined && <RoleEditor role={editing} onClose={() => setEditing(undefined)} ask={ask} />}
      {dialog}
    </AdminPage>
  )
}

// ───────────────────────────── Shop ─────────────────────────────

const blankItem = { id: '', name: '', description: '', category: 'cosmetics', kind: 'frame', price: 5, rarity: 'rare', repeatable: false, active: true, availableFrom: null, availableUntil: null, stock: null, requires: {}, style: { color: '#22d3ee' }, effect: {}, sort: 100 }

function ItemEditor({ item, onClose, ask }) {
  const { t } = useT()
  const catalog = useCatalog()
  const [f, setF] = useState(() => ({ ...blankItem, ...(item ?? {}), requires: { ...(item?.requires ?? {}) }, style: { ...(item?.style ?? blankItem.style) }, effect: { ...(item?.effect ?? {}) } }))
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const style = (patch) => setF((x) => ({ ...x, style: { ...x.style, ...patch } }))
  const effect = (patch) => setF((x) => ({ ...x, effect: { ...x.effect, ...patch } }))
  const colors = (f.style.colors ?? []).join(', ')
  const save = () => {
    ask(item ? t('adm2.shop.edit', { item: item.name }) : t('adm2.shop.create'), 'upsertShopItem', { item: { ...f, price: Number(f.price), stock: f.stock === '' || f.stock === null ? null : Number(f.stock) } })
    onClose()
  }
  return (
    <Modal open onClose={onClose} size="lg" title={item ? t('adm2.shop.edit', { item: item.name }) : t('adm2.shop.create')} footer={<><Button variant="ghost" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button><Button className="flex-1" onClick={save}>{t('adm2.save')}</Button></>}>
      <div className="mb-4 h-24 overflow-hidden rounded-xl bg-ink-950/50 ring-1 ring-inset ring-white/[0.06]"><ItemVisual item={f} /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('adm2.id')}><input value={f.id} disabled={!!item} onChange={(e) => set({ id: e.target.value.toLowerCase() })} className={inputCls} placeholder="name-aurora" /></Field>
        <Field label={t('adm2.name')}><input value={f.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} /></Field>
        <Field label={t('adm2.shop.category')}><Select value={f.category} onChange={(v) => set({ category: v })} options={SHOP_CATEGORIES.map((c) => ({ value: c, label: t(`shop.categories.${c}`) }))} /></Field>
        <Field label={t('adm2.shop.kind')}><Select value={f.kind} onChange={(v) => set({ kind: v })} options={KINDS} /></Field>
        <Field label={t('shop.price')}><input inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value.replace(/[^\d.]/g, '') })} className={inputCls} /></Field>
        <Field label={t('adm2.rarity')}><Select value={f.rarity} onChange={(v) => set({ rarity: v })} options={RARITIES} /></Field>
        <Field label={t('adm2.shop.from')}><input type="datetime-local" value={toLocal(f.availableFrom)} onChange={(e) => set({ availableFrom: fromLocal(e.target.value) })} className={inputCls} /></Field>
        <Field label={t('adm2.shop.until')}><input type="datetime-local" value={toLocal(f.availableUntil)} onChange={(e) => set({ availableUntil: fromLocal(e.target.value) })} className={inputCls} /></Field>
        <Field label={t('adm2.shop.stock')} hint={t('adm2.shop.stockHint')}><input inputMode="numeric" value={f.stock ?? ''} onChange={(e) => set({ stock: e.target.value.replace(/\D/g, '') })} className={inputCls} /></Field>
        <Field label={t('adm2.shop.requiresCard')}><Select value={f.requires.card ?? ''} onChange={(v) => set({ requires: { ...f.requires, card: v || undefined } })} options={[{ value: '', label: '—' }, ...catalog.cards.filter((c) => c.slug !== 'none').map((c) => ({ value: c.slug, label: c.name }))]} /></Field>
        <Field label={t('adm2.shop.flags')}>
          <div className="flex h-10 items-center gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.repeatable} onChange={(e) => set({ repeatable: e.target.checked })} /> {t('adm2.shop.repeatable')}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.active} onChange={(e) => set({ active: e.target.checked })} /> {t('adm2.active')}</label>
          </div>
        </Field>
        <Field label={t('adm2.sort')}><input inputMode="numeric" value={f.sort} onChange={(e) => set({ sort: Number(e.target.value.replace(/[^\d-]/g, '')) || 0 })} className={inputCls} /></Field>
      </div>
      <Field label={t('adm2.description')}><textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} className={clsx(inputCls, 'h-auto py-2')} /></Field>
      <div className="mt-3 rounded-xl border hairline p-3">
        <p className="mb-2 text-xs font-semibold text-slate-400">{t('adm2.shop.look')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {['nameEffect', 'profileEffect', 'theme'].includes(f.kind) && <Field label={t('adm2.shop.colors')} hint="#22d3ee, #a855f7"><input value={colors} onChange={(e) => style({ colors: e.target.value.split(',').map((c) => c.trim()).filter(Boolean) })} className={inputCls} /></Field>}
          {['chatEffect', 'badge', 'frame', 'boost'].includes(f.kind) && <Field label={t('adm2.color')}><input type="color" value={f.style.color ?? '#22d3ee'} onChange={(e) => style({ color: e.target.value })} className="h-10 w-full rounded-lg bg-transparent" /></Field>}
          {f.kind === 'chatEffect' && <Field label={t('adm2.shop.color2')}><input type="color" value={f.style.color2 ?? f.style.color ?? '#22d3ee'} onChange={(e) => style({ color2: e.target.value, animated: true })} className="h-10 w-full rounded-lg bg-transparent" /></Field>}
          {f.kind === 'theme' && <Field label={t('adm2.shop.accent')}><input type="color" value={f.style.accent ?? '#22d3ee'} onChange={(e) => style({ accent: e.target.value })} className="h-10 w-full rounded-lg bg-transparent" /></Field>}
          {['badge', 'boost'].includes(f.kind) && <Field label={t('adm2.shop.glyph')}><input value={f.style.glyph ?? ''} onChange={(e) => style({ glyph: e.target.value })} className={inputCls} /></Field>}
          {f.kind === 'profileEffect' && <Field label={t('adm2.shop.fx')}><Select value={f.style.kind ?? 'aurora'} onChange={(v) => style({ kind: v })} options={['aurora', 'scan', 'stars']} /></Field>}
          {f.kind === 'emote' && <Field label={t('adm2.shop.emote')}><Select value={f.effect.emote ?? ''} onChange={(v) => effect({ emote: v })} options={[{ value: '', label: '—' }, ...catalog.emotes.map((e) => ({ value: e.code, label: `${e.glyph} :${e.code}:` }))]} /></Field>}
          {f.kind === 'boost' && (
            <>
              <Field label={t('adm2.shop.boostType')}><Select value={f.effect.type ?? 'xp'} onChange={(v) => effect({ type: v })} options={[{ value: 'xp', label: 'XP' }, { value: 'lxp', label: 'Loyalty XP' }, { value: 'daily', label: 'Daily reward' }]} /></Field>
              <Field label={t('adm2.shop.mult')}><input inputMode="decimal" value={f.effect.mult ?? 1.5} onChange={(e) => effect({ mult: e.target.value.replace(/[^\d.]/g, '') })} className={inputCls} /></Field>
              {f.effect.type === 'daily' ? <Field label={t('adm2.shop.uses')}><input inputMode="numeric" value={f.effect.uses ?? 1} onChange={(e) => effect({ uses: Number(e.target.value.replace(/\D/g, '')) || 1 })} className={inputCls} /></Field>
                : <Field label={t('adm2.shop.minutes')}><input inputMode="numeric" value={f.effect.minutes ?? 60} onChange={(e) => effect({ minutes: Number(e.target.value.replace(/\D/g, '')) || 60 })} className={inputCls} /></Field>}
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

export function ShopAdmin() {
  const { t } = useT()
  const v2 = useV2()
  const users = useAuthStore((s) => s.users)
  const items = (v2.catalog?.shop ?? []).filter((i) => !i.requires?.membership)
  const { ask, dialog } = useAction()
  const [editing, setEditing] = useState(undefined)
  const [cat, setCat] = useState('all')
  const [grant, setGrant] = useState({ userId: null, itemId: '', qty: 1 })
  if (!SERVER_MODE) return <LiveOnly title={t('adm2.shop.title')} />
  const list = cat === 'all' ? items : items.filter((i) => i.category === cat)
  const target = Object.values(users).find((u) => u.id === grant.userId)
  return (
    <AdminPage title={t('adm2.shop.title')} description={t('adm2.shop.desc')} actions={<Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> {t('adm2.shop.create')}</Button>}>
      <Tabs value={cat} onChange={setCat} options={[{ value: 'all', label: t('common.all') }, ...SHOP_CATEGORIES.map((c) => ({ value: c, label: t(`shop.categories.${c}`) }))]} />
      <Card bodyClassName="p-0">
        <Table
          rows={list}
          columns={[
            { key: 'v', label: '', render: (i) => <span className="block h-10 w-14 overflow-hidden rounded-lg bg-ink-950/60"><ItemVisual item={i} className="scale-[0.6]" /></span> },
            { key: 'name', label: t('adm2.name'), render: (i) => <span><span className="font-semibold text-white">{i.name}</span><span className="block font-mono text-[10px] text-slate-500">{i.id}</span></span> },
            { key: 'cat', label: t('adm2.shop.category'), render: (i) => <Badge>{t(`shop.categories.${i.category}`)}</Badge> },
            { key: 'price', label: t('shop.price'), align: 'right', mono: true, render: (i) => `${formatCoins(i.price)} AG` },
            { key: 'rarity', label: t('adm2.rarity'), render: (i) => t(`rarity.${i.rarity}`) },
            { key: 'stock', label: t('adm2.shop.stock'), align: 'right', mono: true, render: (i) => (i.stock === null ? '∞' : i.stock) },
            { key: 'active', label: t('adm2.active'), render: (i) => (
              <button type="button" onClick={() => ask(i.active ? t('adm2.shop.disable', { item: i.name }) : t('adm2.shop.enable', { item: i.name }), 'setShopItemActive', { id: i.id, active: !i.active })}>{i.active ? <Badge tone="green">on</Badge> : <Badge>off</Badge>}</button>
            ) },
            { key: 'e', label: '', align: 'right', render: (i) => <Button size="xs" variant="ghost" onClick={() => setEditing(i)}><Pencil className="h-3.5 w-3.5" /></Button> },
          ]}
        />
      </Card>
      <Card title={t('adm2.shop.grantTitle')}>
        <UserPicker value={grant.userId} onChange={(id) => setGrant({ ...grant, userId: id })} />
        {target && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={grant.itemId} onChange={(v) => setGrant({ ...grant, itemId: v })} options={[{ value: '', label: t('adm2.item') }, ...items.map((i) => ({ value: i.id, label: i.name }))]} />
            <input inputMode="numeric" value={grant.qty} onChange={(e) => setGrant({ ...grant, qty: Number(e.target.value.replace(/[^\d-]/g, '')) || 0 })} className={clsx(inputCls, 'w-24')} aria-label="qty" />
            <Button size="sm" disabled={!grant.itemId || !grant.qty} onClick={() => ask(t('adm2.shop.grant', { user: target.username }), 'grantItem', grant)}>{grant.qty < 0 ? t('adm2.shop.revokeBtn') : t('adm2.shop.grantBtn')}</Button>
          </div>
        )}
      </Card>
      {editing !== undefined && <ItemEditor item={editing} onClose={() => setEditing(undefined)} ask={ask} />}
      {dialog}
    </AdminPage>
  )
}

// ───────────────────────────── Emotes ─────────────────────────────

function EmoteEditor({ emote, onClose, ask }) {
  const { t } = useT()
  const catalog = useCatalog()
  const v2 = useV2()
  const [f, setF] = useState(() => (emote ? { ...emote, unlockType: emote.unlock?.type ?? 'free', unlockValue: emote.unlock?.value ?? '' } : { code: '', glyph: '', name: '', category: 'general', rarity: 'common', unlockType: 'free', unlockValue: '', anim: 'none', active: true, sort: 100 }))
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const valueField = {
    shop: <Select value={f.unlockValue} onChange={(v) => set({ unlockValue: v })} options={[{ value: '', label: '—' }, ...(v2.catalog?.shop ?? catalog.shop).filter((i) => i.kind === 'emote').map((i) => ({ value: i.id, label: i.name }))]} />,
    card: <Select value={f.unlockValue} onChange={(v) => set({ unlockValue: v })} options={[{ value: '', label: '—' }, ...catalog.cards.filter((c) => c.slug !== 'none').map((c) => ({ value: c.slug, label: c.name }))]} />,
    role: <Select value={f.unlockValue} onChange={(v) => set({ unlockValue: v })} options={[{ value: '', label: '—' }, ...(v2.catalog?.roles ?? catalog.roles).map((r) => ({ value: r.slug, label: r.name }))]} />,
    level: <input inputMode="numeric" value={f.unlockValue} onChange={(e) => set({ unlockValue: e.target.value.replace(/\D/g, '') })} className={inputCls} />,
    item: <input value={f.unlockValue} onChange={(e) => set({ unlockValue: e.target.value })} className={inputCls} />,
  }[f.unlockType]
  return (
    <Modal open onClose={onClose} title={emote ? t('adm2.emotes.edit', { code: emote.code }) : t('adm2.emotes.create')} footer={<><Button variant="ghost" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button><Button className="flex-1" onClick={() => { ask(emote ? t('adm2.emotes.edit', { code: emote.code }) : t('adm2.emotes.create'), 'upsertEmote', { emote: f }); onClose() }}>{t('adm2.save')}</Button></>}>
      <div className="mb-3 grid h-16 place-items-center rounded-xl bg-white/[0.03]">{f.glyph && <Emote emote={{ ...f, glyph: f.glyph }} size="lg" />}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('adm2.emotes.code')}><input value={f.code} disabled={!!emote} onChange={(e) => set({ code: e.target.value.toLowerCase().replace(/[^a-z]/g, '') })} className={inputCls} /></Field>
        <Field label={t('adm2.emotes.glyph')}><input value={f.glyph} onChange={(e) => set({ glyph: e.target.value })} className={inputCls} /></Field>
        <Field label={t('adm2.name')}><input value={f.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} /></Field>
        <Field label={t('adm2.shop.category')}><Select value={f.category} onChange={(v) => set({ category: v })} options={EMOTE_CATS.map((c) => ({ value: c, label: t(`emotes.categories.${c}`) }))} /></Field>
        <Field label={t('adm2.rarity')}><Select value={f.rarity} onChange={(v) => set({ rarity: v })} options={RARITIES} /></Field>
        <Field label={t('adm2.emotes.anim')}><Select value={f.anim} onChange={(v) => set({ anim: v })} options={ANIMS} /></Field>
        <Field label={t('adm2.emotes.unlock')}><Select value={f.unlockType} onChange={(v) => set({ unlockType: v, unlockValue: '' })} options={UNLOCKS} /></Field>
        {valueField && <Field label={t('adm2.emotes.unlockValue')}>{valueField}</Field>}
        <Field label={t('adm2.active')}><label className="flex h-10 items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!f.active} onChange={(e) => set({ active: e.target.checked })} /> {t('adm2.active')}</label></Field>
      </div>
    </Modal>
  )
}

export function EmotesAdmin() {
  const { t } = useT()
  const v2 = useV2()
  const emotes = v2.catalog?.emotes ?? []
  const { ask, dialog } = useAction()
  const [editing, setEditing] = useState(undefined)
  if (!SERVER_MODE) return <LiveOnly title={t('adm2.emotes.title')} />
  return (
    <AdminPage title={t('adm2.emotes.title')} description={t('adm2.emotes.desc')} actions={<Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> {t('adm2.emotes.create')}</Button>}>
      <Card bodyClassName="p-0">
        <Table
          rowKey={(e) => e.code}
          rows={emotes}
          columns={[
            { key: 'g', label: '', render: (e) => <Emote emote={e} /> },
            { key: 'code', label: t('adm2.emotes.code'), render: (e) => <span className="font-mono text-xs text-white">:{e.code}:</span> },
            { key: 'name', label: t('adm2.name'), render: (e) => e.name },
            { key: 'cat', label: t('adm2.shop.category'), render: (e) => t(`emotes.categories.${e.category}`) },
            { key: 'rarity', label: t('adm2.rarity'), render: (e) => t(`rarity.${e.rarity}`) },
            { key: 'unlock', label: t('adm2.emotes.unlock'), render: (e) => <span className="text-xs">{e.unlock.type}{e.unlock.value ? ` · ${e.unlock.value}` : ''}</span> },
            { key: 'active', label: t('adm2.active'), render: (e) => (e.active ? <Badge tone="green">on</Badge> : <Badge>off</Badge>) },
            { key: 'x', label: '', align: 'right', render: (e) => <Button size="xs" variant="ghost" onClick={() => setEditing(e)}><Pencil className="h-3.5 w-3.5" /></Button> },
          ]}
        />
      </Card>
      {editing !== undefined && <EmoteEditor emote={editing} onClose={() => setEditing(undefined)} ask={ask} />}
      {dialog}
    </AdminPage>
  )
}

// ───────────────────────────── Missions ─────────────────────────────

function MissionEditor({ mission, onClose, ask }) {
  const { t } = useT()
  const [f, setF] = useState(mission ?? { id: '', title: '', description: '', gameName: '', link: 'https://', rewardAC: 0, rewardAG: 0, rewardLXP: 0, repeatable: false, cooldownHours: 24, maxClaims: null, active: true, sort: 10 })
  const set = (p) => setF((x) => ({ ...x, ...p }))
  const n = (k) => (e) => set({ [k]: e.target.value === '' ? '' : Number(e.target.value.replace(/[^\d.]/g, '')) })
  return (
    <Modal open size="lg" onClose={onClose} title={mission ? t('adm2.missions.edit') : t('adm2.missions.create')} footer={<><Button variant="ghost" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button><Button className="flex-1" onClick={() => { ask(mission ? t('adm2.missions.edit') : t('adm2.missions.create'), 'upsertMission', { mission: { ...f, maxClaims: f.maxClaims === '' ? null : f.maxClaims } }); onClose() }}>{t('adm2.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('adm2.id')}><input value={f.id} disabled={!!mission} onChange={(e) => set({ id: e.target.value.toLowerCase() })} className={inputCls} /></Field>
        <Field label={t('adm2.missions.titleField')}><input value={f.title} onChange={(e) => set({ title: e.target.value })} className={inputCls} /></Field>
        <Field label={t('adm2.missions.game')}><input value={f.gameName ?? ''} onChange={(e) => set({ gameName: e.target.value })} className={inputCls} /></Field>
        <Field label={t('adm2.missions.link')}><input value={f.link ?? ''} onChange={(e) => set({ link: e.target.value })} className={inputCls} /></Field>
        <Field label="AC"><input inputMode="numeric" value={f.rewardAC} onChange={n('rewardAC')} className={inputCls} /></Field>
        <Field label="AG"><input inputMode="numeric" value={f.rewardAG} onChange={n('rewardAG')} className={inputCls} /></Field>
        <Field label={t('loyalty.xp')}><input inputMode="numeric" value={f.rewardLXP} onChange={n('rewardLXP')} className={inputCls} /></Field>
        <Field label={t('adm2.missions.maxClaims')} hint={t('adm2.missions.maxClaimsHint')}><input inputMode="numeric" value={f.maxClaims ?? ''} onChange={n('maxClaims')} className={inputCls} /></Field>
        <Field label={t('adm2.missions.cooldown')}><input inputMode="numeric" value={f.cooldownHours} onChange={n('cooldownHours')} className={inputCls} /></Field>
        <Field label={t('adm2.shop.flags')}>
          <div className="flex h-10 items-center gap-4 text-sm text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.repeatable} onChange={(e) => set({ repeatable: e.target.checked })} /> {t('adm2.shop.repeatable')}</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.active} onChange={(e) => set({ active: e.target.checked })} /> {t('adm2.active')}</label>
          </div>
        </Field>
      </div>
      <Field label={t('adm2.description')}><textarea rows={3} value={f.description} onChange={(e) => set({ description: e.target.value })} className={clsx(inputCls, 'h-auto py-2')} /></Field>
    </Modal>
  )
}

export function MissionsAdmin() {
  const { t } = useT()
  const v2 = useV2()
  const me = useCurrentUser()
  const missions = v2.catalog?.missions ?? []
  const claims = v2.claims ?? []
  const { ask, dialog, setPending } = useAction()
  const [editing, setEditing] = useState(undefined)
  if (!SERVER_MODE) return <LiveOnly title={t('adm2.missions.title')} />
  const title = (id) => missions.find((m) => m.id === id)?.title ?? id
  const pendingCount = claims.filter((c) => c.status === 'pending').length
  return (
    <AdminPage title={t('adm2.missions.title')} description={t('adm2.missions.desc')} actions={<Button size="sm" onClick={() => setEditing(null)}><Plus className="h-4 w-4" /> {t('adm2.missions.create')}</Button>}>
      <Card title={`${t('adm2.missions.claims')}${pendingCount ? ` · ${pendingCount} ${t('adm2.missions.pending')}` : ''}`} bodyClassName="p-0">
        <Table
          rows={claims}
          empty={t('adm2.missions.noClaims')}
          columns={[
            { key: 'at', label: t('admin.cols.time'), render: (c) => <span className="whitespace-nowrap text-xs">{formatDateTime(c.at)}</span> },
            { key: 'user', label: t('admin.cols.user'), render: (c) => `@${c.username}` },
            { key: 'm', label: t('adm2.missions.mission'), render: (c) => title(c.missionId) },
            { key: 'proof', label: t('missions.robloxName'), render: (c) => <span className="font-mono text-xs text-white">{c.proof}</span> },
            { key: 'status', label: t('admin.cols.status'), render: (c) => <Badge tone={c.status === 'approved' ? 'green' : c.status === 'rejected' ? 'red' : 'gold'}>{t(`missions.status.${c.status}`)}</Badge> },
            { key: 'a', label: '', align: 'right', render: (c) => c.status === 'pending' && can(me.role, 'rewards.manage') && (
              <span className="flex justify-end gap-1">
                <Button size="xs" onClick={() => setPending({ title: t('adm2.missions.approve', { user: c.username }), name: 'reviewClaim', args: { claimId: c.id, approve: true }, description: `${title(c.missionId)} · ${c.proof}` })}><Check className="h-3.5 w-3.5" /> {t('adm2.missions.approveBtn')}</Button>
                <Button size="xs" variant="danger" onClick={() => setPending({ title: t('adm2.missions.reject', { user: c.username }), name: 'reviewClaim', args: { claimId: c.id, approve: false }, description: `${title(c.missionId)} · ${c.proof}` })}><X className="h-3.5 w-3.5" /></Button>
              </span>
            ) },
          ]}
        />
      </Card>
      <Card title={t('adm2.missions.list')} bodyClassName="p-0">
        <Table rows={missions} columns={[
          { key: 'title', label: t('adm2.missions.titleField'), render: (m) => <span><b className="text-white">{m.title}</b><span className="block text-xs text-slate-500">{m.gameName}</span></span> },
          { key: 'r', label: t('adm2.missions.reward'), mono: true, render: (m) => `${formatCoins(m.rewardAC)} AC · ${formatCoins(m.rewardAG)} AG · ${formatCoins(m.rewardLXP)} LXP` },
          { key: 'rep', label: t('adm2.shop.repeatable'), render: (m) => (m.repeatable ? t('adm2.missions.every', { h: m.cooldownHours }) : t('adm2.missions.once')) },
          { key: 'act', label: t('adm2.active'), render: (m) => (m.active ? <Badge tone="green">on</Badge> : <Badge>off</Badge>) },
          { key: 'e', label: '', align: 'right', render: (m) => <Button size="xs" variant="ghost" onClick={() => setEditing(m)}><Pencil className="h-3.5 w-3.5" /></Button> },
        ]} />
      </Card>
      <p className="text-xs text-slate-500">{t('adm2.missions.manualNote')}</p>
      {editing !== undefined && <MissionEditor mission={editing} onClose={() => setEditing(undefined)} ask={ask} />}
      {dialog}
    </AdminPage>
  )
}

// ───────────────────────────── Memberships ─────────────────────────────

export function MembershipsAdmin() {
  const { t } = useT()
  const v2 = useV2()
  const catalog = useCatalog()
  const users = useAuthStore((s) => s.users)
  const { ask, dialog } = useAction()
  const [uid, setUid] = useState(null)
  const [tier, setTier] = useState('vip')
  const [days, setDays] = useState(30)
  const [cfg, setCfg] = useState(null)
  const [mgr, setMgr] = useState('')
  const c = cfg ?? catalog.memberships ?? {}
  const target = Object.values(users).find((u) => u.id === uid)
  if (!SERVER_MODE) return <LiveOnly title={t('adm2.members.title')} />
  const active = (v2.memberships ?? []).filter((m) => m.active)
  return (
    <AdminPage title={t('adm2.members.title')} description={t('adm2.members.desc')}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="VIP" value={active.filter((m) => m.tier === 'vip').length} />
        <Kpi label="VVIP" value={active.filter((m) => m.tier === 'vvip').length} tone="text-cyan-200" />
      </div>
      <Card title={t('adm2.members.activate')}>
        <UserPicker value={uid} onChange={setUid} />
        {target && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Select value={tier} onChange={setTier} options={[{ value: 'vip', label: 'VIP' }, { value: 'vvip', label: 'VVIP' }]} />
            <input inputMode="numeric" value={days} onChange={(e) => setDays(Number(e.target.value.replace(/\D/g, '')) || 1)} className={clsx(inputCls, 'w-24')} aria-label={t('adm2.members.days')} />
            <span className="text-xs text-slate-500">{t('adm2.members.days')}</span>
            <Button size="sm" onClick={() => ask(t('adm2.members.activateFor', { user: target.username }), 'setMembership', { userId: target.id, tier, days })}>{t('adm2.members.activateBtn')}</Button>
            {target.membership && <Button size="sm" variant="danger" onClick={() => ask(t('adm2.members.end', { user: target.username }), 'setMembership', { userId: target.id, tier: null })}><Ban className="h-3.5 w-3.5" /> {t('adm2.members.endBtn')}</Button>}
            <Button size="sm" variant="ghost" onClick={() => ask(t('adm2.members.grantPass', { user: target.username }), 'grantPass', { userId: target.id })}>{t('adm2.members.grantPassBtn')}</Button>
          </div>
        )}
        {target?.membership === 'vvip' && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">{t('adm2.members.manager')}</span>
            <Select value={mgr} onChange={setMgr} options={[{ value: '', label: '—' }, ...Object.values(users).filter((u) => u.role && u.role !== 'user').map((u) => ({ value: u.id, label: `@${u.username}` }))]} />
            <Button size="sm" onClick={() => ask(t('adm2.members.setManager', { user: target.username }), 'setManager', { userId: target.id, managerId: mgr })}>{t('adm2.save')}</Button>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">{t('adm2.members.paymentNote')}</p>
      </Card>
      <Card title={t('adm2.members.config')}>
        <div className="grid gap-4 md:grid-cols-2">
          {['vip', 'vvip'].map((k) => (
            <div key={k} className="space-y-3 rounded-xl border hairline p-3">
              <MemberTag tier={k} />
              <div className="grid grid-cols-2 gap-2">
                <Field label={t('adm2.members.price')}><input inputMode="numeric" value={c[k]?.price ?? ''} onChange={(e) => setCfg({ ...c, [k]: { ...c[k], price: Number(e.target.value.replace(/\D/g, '')) } })} className={inputCls} /></Field>
                <Field label={t('adm2.members.days')}><input inputMode="numeric" value={c[k]?.days ?? ''} onChange={(e) => setCfg({ ...c, [k]: { ...c[k], days: Number(e.target.value.replace(/\D/g, '')) } })} className={inputCls} /></Field>
              </div>
              <Field label={t('adm2.benefits')} hint={t('adm2.onePerLine')}><textarea rows={6} value={(c[k]?.benefits ?? []).join('\n')} onChange={(e) => setCfg({ ...c, [k]: { ...c[k], benefits: e.target.value.split('\n') } })} className={clsx(inputCls, 'h-auto py-2')} /></Field>
            </div>
          ))}
        </div>
        <Button className="mt-3" size="sm" disabled={!cfg} onClick={() => ask(t('adm2.members.config'), 'setMembershipConfig', { vip: { ...c.vip, benefits: lines((c.vip?.benefits ?? []).join('\n')) }, vvip: { ...c.vvip, benefits: lines((c.vvip?.benefits ?? []).join('\n')) } })}>{t('adm2.save')}</Button>
      </Card>
      <Card title={t('adm2.members.history')} bodyClassName="p-0">
        <Table rows={v2.memberships ?? []} columns={[
          { key: 'user', label: t('admin.cols.user'), render: (m) => `@${m.username}` },
          { key: 'tier', label: t('adm2.members.tier'), render: (m) => <MemberTag tier={m.tier} /> },
          { key: 'state', label: t('admin.cols.status'), render: (m) => (m.active ? <Badge tone="green">{t('membership.active')}</Badge> : <Badge>{t('adm2.members.ended')}</Badge>) },
          { key: 'ends', label: t('adm2.members.endsAt'), render: (m) => <span className="text-xs">{m.endsAt ? formatDateTime(m.endsAt) : '—'}</span> },
          { key: 'by', label: t('admin.cols.admin'), render: (m) => (m.by ? `@${m.by}` : '—') },
          { key: 'manager', label: t('adm2.members.manager'), render: (m) => (m.manager ? `@${m.manager}` : '—') },
          { key: 'note', label: t('admin.reason'), render: (m) => <span className="text-xs text-slate-400">{m.note}</span> },
        ]} />
      </Card>
      {dialog}
    </AdminPage>
  )
}

// ───────────────────────────── Chat moderation ─────────────────────────────

export function ChatModerationAdmin() {
  const { t } = useT()
  const v2 = useV2()
  const me = useCurrentUser()
  const { ask, direct, dialog } = useAction()
  const [cfg, setCfg] = useState(null)
  const [term, setTerm] = useState({ term: '', severity: 2, match: 'word' })
  const [filter, setFilter] = useState('')
  const [tab, setTab] = useState('log')
  const s = cfg ?? v2.moderation ?? {}
  const canConfig = can(me.role, 'moderation.config')
  if (!SERVER_MODE) return <LiveOnly title={t('adm2.mod.title')} />
  const terms = (v2.terms ?? []).filter((x) => !filter || x.term.includes(filter.toLowerCase()))
  return (
    <AdminPage title={t('adm2.mod.title')} description={t('adm2.mod.desc')}>
      {canConfig && (
        <Card title={t('adm2.mod.settings')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label={t('adm2.mod.level')} hint={t(`adm2.mod.levels.${s.level ?? 'standard'}Hint`)}><Select value={s.level ?? 'standard'} onChange={(v) => setCfg({ ...s, level: v })} options={['relaxed', 'standard', 'strict'].map((l) => ({ value: l, label: t(`adm2.mod.levels.${l}`) }))} /></Field>
            <Field label={t('adm2.mod.autoMute')}><label className="flex h-10 items-center gap-2 text-sm text-slate-300"><input type="checkbox" checked={!!s.autoMute} onChange={(e) => setCfg({ ...s, autoMute: e.target.checked })} /> {t('adm2.active')}</label></Field>
            <Field label={t('adm2.mod.strikes')}><input inputMode="numeric" value={s.autoMuteStrikes ?? 3} onChange={(e) => setCfg({ ...s, autoMuteStrikes: Number(e.target.value.replace(/\D/g, '')) })} className={inputCls} /></Field>
            <Field label={t('adm2.mod.minutes')}><input inputMode="numeric" value={s.autoMuteMinutes ?? 10} onChange={(e) => setCfg({ ...s, autoMuteMinutes: Number(e.target.value.replace(/\D/g, '')) })} className={inputCls} /></Field>
            <Field label={t('adm2.mod.repeat')}><input inputMode="numeric" value={s.repeatLimit ?? 8} onChange={(e) => setCfg({ ...s, repeatLimit: Number(e.target.value.replace(/\D/g, '')) })} className={inputCls} /></Field>
          </div>
          <Button className="mt-3" size="sm" disabled={!cfg} onClick={() => ask(t('adm2.mod.settings'), 'setModeration', s)}>{t('adm2.save')}</Button>
        </Card>
      )}
      <Tabs value={tab} onChange={setTab} options={[{ value: 'log', label: t('adm2.mod.log') }, { value: 'terms', label: t('adm2.mod.terms', { n: v2.terms?.length ?? 0 }) }]} />
      {tab === 'log' ? (
        <Card bodyClassName="p-0">
          <Table
            rows={v2.modLog ?? []}
            empty={t('adm2.mod.noLog')}
            columns={[
              { key: 'at', label: t('admin.cols.time'), render: (l) => <span className="whitespace-nowrap text-xs">{formatDateTime(l.at)}</span> },
              { key: 'user', label: t('admin.cols.user'), render: (l) => (l.username ? `@${l.username}` : '—') },
              { key: 'action', label: t('adm2.mod.action'), render: (l) => <Badge tone={['blocked', 'auto_mute', 'muted', 'deleted'].includes(l.action) ? 'red' : l.action === 'spam' ? 'gold' : 'slate'}>{t(`adm2.mod.actions.${l.action}`)}</Badge> },
              { key: 'body', label: t('adm2.mod.message'), render: (l) => <span className="line-clamp-2 max-w-xs text-xs text-slate-300">{l.body ?? '—'}</span> },
              { key: 'm', label: t('adm2.mod.matched'), render: (l) => <span className="font-mono text-[11px] text-slate-500">{l.matched ?? l.reason ?? ''}{l.admin ? ` · @${l.admin}` : ''}</span> },
            ]}
          />
        </Card>
      ) : (
        <Card>
          {canConfig && (
            <div className="mb-4 flex flex-wrap items-end gap-2">
              <Field label={t('adm2.mod.term')}><input value={term.term} onChange={(e) => setTerm({ ...term, term: e.target.value.toLowerCase().replace(/[^a-z]/g, '') })} className={inputCls} /></Field>
              <Field label={t('adm2.mod.severity')}><Select value={String(term.severity)} onChange={(v) => setTerm({ ...term, severity: Number(v) })} options={[{ value: '1', label: t('adm2.mod.sev.1') }, { value: '2', label: t('adm2.mod.sev.2') }, { value: '3', label: t('adm2.mod.sev.3') }]} /></Field>
              <Field label={t('adm2.mod.match')}><Select value={term.match} onChange={(v) => setTerm({ ...term, match: v })} options={['word', 'prefix', 'contains'].map((m) => ({ value: m, label: t(`adm2.mod.matches.${m}`) }))} /></Field>
              <Button size="sm" disabled={term.term.length < 2} onClick={async () => { if (await direct('addTerm', term, t('adm2.mod.added', { term: term.term }))) setTerm({ ...term, term: '' }) }}><Plus className="h-4 w-4" /> {t('adm2.mod.add')}</Button>
            </div>
          )}
          <SearchInput value={filter} onChange={setFilter} placeholder={t('adm2.mod.searchTerms')} />
          <div className="mt-3 flex flex-wrap gap-1.5">
            {terms.map((x) => (
              <span key={x.term} className={clsx('flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-xs ring-1 ring-inset', x.severity === 3 ? 'bg-neon-red/10 text-neon-red ring-neon-red/25' : x.severity === 2 ? 'bg-neon-gold/10 text-neon-gold ring-neon-gold/25' : 'bg-white/[0.04] text-slate-300 ring-white/10')}>
                {x.term} <span className="text-[10px] opacity-70">{x.match}</span>
                {canConfig && <button type="button" onClick={() => direct('removeTerm', { term: x.term }, t('adm2.mod.removed', { term: x.term }))} aria-label={t('adm2.mod.remove')} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>}
              </span>
            ))}
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs text-slate-500"><ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('adm2.mod.howItWorks')}</p>
        </Card>
      )}
      {dialog}
    </AdminPage>
  )
}
