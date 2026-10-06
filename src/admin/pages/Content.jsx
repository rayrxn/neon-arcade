import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, MicOff, Plus, Trash2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import ReasonDialog from '@/components/admin/ReasonDialog'
import { AdminPage, Badge, Card, FormField, Kpi, ROLE_TONE, STATUS_TONE, SearchInput, Table, Tabs, inputCls } from '@/components/admin/AdminKit'
import { LogTable } from './Users'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useProgressStore } from '@/store/useProgressStore'
import { activeAnnouncements, useAdminStore } from '@/store/useAdminStore'
import { ACHIEVEMENTS, DAILY_QUESTS, DAILY_REWARDS, WEEKLY_QUESTS } from '@/config/progression'
import { ITEMS } from '@/config/economy'
import { PERMISSIONS, ROLES, ROLE_PERMISSIONS, can } from '@/config/roles'
import * as admin from '@/services/admin'
import { formatCoins, formatDateTime, timeAgo } from '@/utils/format'
import { pick, useT } from '@/i18n'

const byIdOf = (users) => Object.fromEntries(Object.values(users).map((u) => [u.id, u]))

// ───────────────────────────── Moderation (overview) ─────────────────────────────

export function Moderation() {
  const { t } = useT()
  const users = useAuthStore((s) => s.users)
  const logs = useAdminStore((s) => s.logs)
  const now = Date.now()
  const banned = Object.values(users).filter((u) => u.status === 'banned')
  const muted = Object.values(users).filter((u) => u.mutedUntil && u.mutedUntil > now)
  const frozen = Object.values(users).filter((u) => u.status === 'frozen' || u.walletFrozen)
  const modLogs = logs.filter((l) => /^(user\.(ban|tempban|unban|freeze|unfreeze)|wallet\.(freeze|unfreeze)|chat\.)/.test(l.action))
  const list = (rows, render) => rows.length ? rows.map((u) => (
    <Link key={u.id} to={`/admin/users/${u.id}`} className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/[0.03]">
      <Avatar user={u} size="xs" /> <span className="flex-1 truncate text-slate-200">@{u.username}</span> <span className="text-xs text-slate-500">{render(u)}</span>
    </Link>
  )) : <p className="px-4 py-6 text-center text-sm text-slate-500">{t('admin.empty')}</p>

  return (
    <AdminPage title={t('admin.nav.moderation')} description={t('admin.moderationDesc')}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`${t('admin.filters.banned')} · ${banned.length}`} bodyClassName="divide-y divide-white/[0.05]">{list(banned, (u) => (u.ban?.until ? formatDateTime(u.ban.until) : t('admin.permanent')))}</Card>
        <Card title={`${t('admin.muted')} · ${muted.length}`} bodyClassName="divide-y divide-white/[0.05]">{list(muted, (u) => formatDateTime(u.mutedUntil))}</Card>
        <Card title={`${t('admin.filters.frozen')} · ${frozen.length}`} bodyClassName="divide-y divide-white/[0.05]">{list(frozen, (u) => (u.walletFrozen ? t('admin.walletFrozen') : t('admin.status.frozen')))}</Card>
      </div>
      <h2 className="text-sm font-semibold text-white">{t('admin.moderationHistory')}</h2>
      <LogTable logs={modLogs} />
    </AdminPage>
  )
}

// ───────────────────────────── Global chat moderation ─────────────────────────────

export function ChatAdmin({ reportsOnly = false }) {
  const { t } = useT()
  const me = useCurrentUser()
  const chat = usePlatformStore((s) => s.chat)
  const byId = byIdOf(useAuthStore((s) => s.users))
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState(null)
  const rows = chat
    .filter((m) => m.type === 'user')
    .filter((m) => (!reportsOnly ? true : (m.reports ?? 0) > 0 || m.flagged))
    .filter((m) => !q || m.text.toLowerCase().includes(q.toLowerCase()) || byId[m.userId]?.username.toLowerCase().includes(q.toLowerCase()))
    .slice()
    .reverse()
  return (
    <AdminPage title={reportsOnly ? t('admin.nav.reports') : t('admin.nav.chat')} description={reportsOnly ? t('admin.reportsDesc') : t('admin.chatDesc')}>
      <SearchInput value={q} onChange={setQ} placeholder={t('admin.searchChat')} />
      <Card bodyClassName="">
        <Table
          rows={rows}
          empty={reportsOnly ? t('admin.noReports') : t('admin.empty')}
          columns={[
            { key: 'at', label: t('admin.cols.time'), render: (m) => <span className="whitespace-nowrap text-xs">{timeAgo(m.at)}</span> },
            { key: 'u', label: t('admin.cols.user'), render: (m) => <span className="whitespace-nowrap">@{byId[m.userId]?.username ?? '—'}</span> },
            { key: 'm', label: t('admin.cols.message'), render: (m) => (m.deleted ? <span className="italic text-slate-500">{t('chat.deleted')} · @{m.deleted.by}</span> : <span className="line-clamp-2">{m.text}</span>) },
            { key: 'f', label: t('admin.cols.flags'), render: (m) => <span className="flex gap-1">{m.flagged && <Badge tone="gold">{t('chat.filtered')}</Badge>}{(m.reports ?? 0) > 0 && <Badge tone="red">{m.reports} report</Badge>}</span> },
            { key: 'a', label: '', align: 'right', render: (m) => !m.deleted && (
              <span className="flex justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'delete', m })}><Trash2 className="h-3.5 w-3.5" /></Button>
                {byId[m.userId] && !byId[m.userId].isDemo && m.userId !== me.id && <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'mute', m })}><MicOff className="h-3.5 w-3.5" /></Button>}
              </span>
            ) },
          ]}
        />
      </Card>
      {dialog && (
        <ReasonDialog open onClose={() => setDialog(null)} adminName={me.username} title={dialog.kind === 'delete' ? t('chat.mod.deleteTitle') : t('chat.mod.muteTitle', { user: byId[dialog.m.userId]?.username })} description={dialog.m.text}
          onConfirm={(r) => (dialog.kind === 'delete' ? admin.deleteMessage(dialog.m.id, r) : admin.muteUser(dialog.m.userId, dialog.minutes ?? 60, r))}>
          {dialog.kind === 'mute' && (
            <FormField label={t('admin.duration')}>
              <select id="mute-min" defaultValue={60} onChange={(e) => (dialog.minutes = Number(e.target.value))} className={inputCls}>
                {[10, 60, 360, 1440].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} ${t('admin.hours')}`}</option>)}
              </select>
            </FormField>
          )}
        </ReasonDialog>
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Rewards / Daily / Quests / Achievements ─────────────────────────────

function RewardText({ r }) {
  const { lang } = useT()
  if (r.kind === 'item') return pick(ITEMS[r.id]?.name, lang)
  return `${formatCoins(r.amount)} ${r.kind}`
}

export function RewardsOverview() {
  const { t } = useT()
  const progress = useProgressStore((s) => s.byUser)
  const p = Object.values(progress)
  return (
    <AdminPage title={t('admin.nav.rewards')} description={t('admin.rewardsDesc')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={t('admin.kpi.dailyClaims')} value={formatCoins(p.reduce((s, x) => s + x.daily.claims, 0))} />
        <Kpi label={t('admin.kpi.quests')} value={formatCoins(p.reduce((s, x) => s + x.quests.completed, 0))} />
        <Kpi label={t('admin.achievementsUnlocked')} value={formatCoins(p.reduce((s, x) => s + Object.keys(x.achievements).length, 0))} />
        <Kpi label={t('admin.totalXp')} value={formatCoins(p.reduce((s, x) => s + x.xp, 0))} />
      </div>
      <p className="text-sm text-slate-500">{t('admin.rewardsNote')}</p>
    </AdminPage>
  )
}

export function DailyAdmin() {
  const { t } = useT()
  const progress = useProgressStore((s) => s.byUser)
  const byId = byIdOf(useAuthStore((s) => s.users))
  return (
    <AdminPage title={t('admin.nav.daily')} description={t('admin.dailyDesc')}>
      <Card title={t('admin.rewardTable')} bodyClassName="">
        <Table rows={DAILY_REWARDS.map((d) => ({ ...d, id: d.day }))} columns={[
          { key: 'd', label: t('admin.cols.day'), render: (d) => `Day ${d.day}` },
          { key: 'r', label: t('admin.cols.reward'), render: (d) => d.rewards.map((r, i) => <span key={i} className="mr-2"><RewardText r={r} /></span>) },
          { key: 'f', label: t('admin.fallback'), render: (d) => (d.fallback ? <RewardText r={d.fallback} /> : '—') },
        ]} />
      </Card>
      <Card title={t('admin.streaks')} bodyClassName="">
        <Table rows={Object.entries(progress).map(([id, p]) => ({ id, ...p.daily, username: byId[id]?.username })).filter((r) => r.username).sort((a, b) => b.streak - a.streak)} columns={[
          { key: 'u', label: t('admin.cols.user'), render: (r) => `@${r.username}` },
          { key: 's', label: 'Streak', align: 'right', mono: true, render: (r) => r.streak },
          { key: 'c', label: t('admin.kpi.dailyClaims'), align: 'right', mono: true, render: (r) => r.claims },
          { key: 'l', label: t('admin.lastClaim'), render: (r) => r.lastClaimDay ?? '—' },
        ]} />
      </Card>
    </AdminPage>
  )
}

export function QuestsAdmin() {
  const { t } = useT()
  const progress = useProgressStore((s) => s.byUser)
  const claimedBy = (scope, id) => Object.values(progress).filter((p) => p.quests[scope]?.claimed?.includes(id)).length
  const rows = [...DAILY_QUESTS.map((q) => ({ ...q, scope: 'daily' })), ...WEEKLY_QUESTS.map((q) => ({ ...q, scope: 'weekly' }))].map((q) => ({ ...q, key: q.scope + q.id }))
  return (
    <AdminPage title={t('admin.nav.quests')} description={t('admin.questsDesc')}>
      <Card bodyClassName="">
        <Table rows={rows} rowKey={(r) => r.key} columns={[
          { key: 'n', label: t('admin.cols.quest'), render: (q) => t(`rewards.quests.${q.id}`) },
          { key: 's', label: t('admin.cols.type'), render: (q) => <Badge tone={q.scope === 'daily' ? 'cyan' : 'purple'}>{q.scope}</Badge> },
          { key: 't', label: t('admin.target'), align: 'right', mono: true, render: (q) => formatCoins(q.target) },
          { key: 'r', label: t('admin.cols.reward'), mono: true, render: (q) => [q.reward.AC && `${formatCoins(q.reward.AC)} AC`, q.reward.XP && `${q.reward.XP} XP`].filter(Boolean).join(' + ') },
          { key: 'c', label: t('admin.claimedNow'), align: 'right', mono: true, render: (q) => claimedBy(q.scope, q.id) },
        ]} />
      </Card>
    </AdminPage>
  )
}

export function AchievementsAdmin() {
  const { t } = useT()
  const progress = useProgressStore((s) => s.byUser)
  const total = Object.keys(progress).length || 1
  return (
    <AdminPage title={t('admin.nav.achievements')} description={t('admin.achievementsDesc')}>
      <Card bodyClassName="">
        <Table rows={ACHIEVEMENTS} columns={[
          { key: 'n', label: t('admin.cols.name'), render: (a) => <span className="font-semibold text-white">{t(`rewards.achievements.${a.id}.name`)}</span> },
          { key: 'd', label: t('admin.cols.detail'), render: (a) => <span className="text-xs text-slate-400">{t(`rewards.achievements.${a.id}.desc`)}</span> },
          { key: 'x', label: 'XP', align: 'right', mono: true, render: (a) => a.xp },
          { key: 'u', label: t('admin.unlockedBy'), align: 'right', mono: true, render: (a) => {
            const n = Object.values(progress).filter((p) => p.achievements[a.id]).length
            return `${n} (${Math.round((n / total) * 100)}%)`
          } },
        ]} />
      </Card>
    </AdminPage>
  )
}

// ───────────────────────────── Redeem codes ─────────────────────────────

export function CodesAdmin() {
  const { t } = useT()
  const me = useCurrentUser()
  useAdminStore((s) => s.codes)
  usePlatformStore((s) => s.codeUsage)
  const [form, setForm] = useState({ code: '', kind: 'AC', amount: 500, itemId: 'neon-frame', maxUses: 100, perUser: 1, expires: '', active: true })
  const [dialog, setDialog] = useState(null)
  const codes = admin.allCodes()
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <AdminPage title={t('admin.nav.codes')} description={t('admin.codesDesc')}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card bodyClassName="">
          <Table rows={codes} rowKey={(c) => c.code} columns={[
            { key: 'c', label: t('admin.cols.code'), render: (c) => <span className="font-mono font-bold text-white">{c.code}</span> },
            { key: 'r', label: t('admin.cols.reward'), render: (c) => c.rewards.map((r, i) => <span key={i} className="mr-1.5"><RewardText r={r} /></span>) },
            { key: 'u', label: t('admin.uses'), align: 'right', mono: true, render: (c) => `${c.used}${c.maxUses ? ` / ${c.maxUses}` : ''}` },
            { key: 'p', label: t('admin.perUser'), align: 'right', mono: true, render: (c) => c.perUser ?? 1 },
            { key: 'e', label: t('admin.expiry'), render: (c) => <span className="text-xs">{c.expiresAt ? formatDateTime(typeof c.expiresAt === 'number' ? c.expiresAt : Date.parse(c.expiresAt)) : '—'}</span> },
            { key: 's', label: t('admin.cols.status'), render: (c) => {
              const exp = c.expiresAt && Date.now() > (typeof c.expiresAt === 'number' ? c.expiresAt : Date.parse(c.expiresAt))
              return <Badge tone={c.active === false ? 'slate' : exp ? 'red' : c.maxUses && c.used >= c.maxUses ? 'gold' : 'green'}>{c.active === false ? t('admin.inactive') : exp ? t('admin.expired') : c.maxUses && c.used >= c.maxUses ? t('admin.soldOut') : t('admin.active')}</Badge>
            } },
            { key: 'a', label: '', align: 'right', render: (c) => <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'toggle', c })}>{c.active === false ? t('admin.enable') : t('admin.disable')}</Button> },
          ]} />
        </Card>
        <Card title={t('admin.newCode')} bodyClassName="space-y-3 p-4">
          <FormField label={t('admin.cols.code')}><input id="c-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) })} placeholder="SUMMER2026" className={`${inputCls} font-mono`} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('admin.cols.reward')}>
              <select id="c-kind" value={form.kind} onChange={set('kind')} className={inputCls}><option value="AC">AC</option><option value="AG">AG</option><option value="item">Item</option></select>
            </FormField>
            {form.kind === 'item' ? (
              <FormField label="Item"><select id="c-item" value={form.itemId} onChange={set('itemId')} className={inputCls}>{Object.keys(ITEMS).map((k) => <option key={k} value={k}>{pick(ITEMS[k].name, 'en')}</option>)}</select></FormField>
            ) : (
              <FormField label={t('admin.amount')} hint={form.kind === 'AG' ? 'max 10' : null}><input id="c-amt" inputMode="numeric" value={form.amount} onChange={set('amount')} className={inputCls} /></FormField>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('admin.maxUses')} hint="0 = ∞"><input id="c-max" inputMode="numeric" value={form.maxUses} onChange={set('maxUses')} className={inputCls} /></FormField>
            <FormField label={t('admin.perUser')}><input id="c-per" inputMode="numeric" value={form.perUser} onChange={set('perUser')} className={inputCls} /></FormField>
          </div>
          <FormField label={t('admin.expiry')}><input id="c-exp" type="datetime-local" value={form.expires} onChange={set('expires')} className={inputCls} /></FormField>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input id="c-active" type="checkbox" checked={form.active} onChange={set('active')} /> {t('admin.active')}</label>
          {form.kind === 'AG' && <p className="text-xs text-neon-gold">{t('admin.agWarn')}</p>}
          <Button className="w-full" disabled={form.code.length < 4} onClick={() => setDialog({ kind: 'create' })}><Plus className="h-4 w-4" /> {t('admin.createCode')}</Button>
        </Card>
      </div>
      {dialog && (
        <ReasonDialog open onClose={() => setDialog(null)} adminName={me.username} tone="primary"
          title={dialog.kind === 'create' ? `${t('admin.createCode')} · ${form.code}` : `${dialog.c.code} → ${dialog.c.active === false ? t('admin.enable') : t('admin.disable')}`}
          onConfirm={(r) => (dialog.kind === 'create'
            ? admin.createCode({ code: form.code, kind: form.kind, amount: Number(form.amount), itemId: form.itemId, maxUses: Number(form.maxUses), perUser: Number(form.perUser), expiresAt: form.expires ? new Date(form.expires).getTime() : null, active: form.active }, r)
            : admin.setCodeActive(dialog.c.code, dialog.c.active === false, r))} />
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Announcements ─────────────────────────────

const toLocal = (ts) => (ts ? new Date(ts - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')

export function AnnouncementsAdmin() {
  const { t } = useT()
  const me = useCurrentUser()
  const list = useAdminStore((s) => s.announcements)
  const empty = { title: '', message: '', type: 'info', startAt: '', endAt: '', active: true }
  const [form, setForm] = useState(empty)
  const [confirm, setConfirm] = useState(false)
  const live = new Set(activeAnnouncements(list).map((a) => a.id))
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <AdminPage title={t('admin.nav.announcements')} description={t('admin.announcementsDesc')}>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card bodyClassName="">
          <Table rows={list} empty={t('admin.noAnnouncements')} columns={[
            { key: 't', label: t('admin.cols.title'), render: (a) => <span className="font-semibold text-white">{a.title}</span> },
            { key: 'y', label: t('admin.cols.type'), render: (a) => <Badge tone={{ info: 'cyan', event: 'purple', update: 'green', maintenance: 'gold' }[a.type]}>{t(`admin.annTypes.${a.type}`)}</Badge> },
            { key: 'w', label: t('admin.window'), render: (a) => <span className="text-xs">{formatDateTime(a.startAt)} → {a.endAt ? formatDateTime(a.endAt) : '∞'}</span> },
            { key: 's', label: t('admin.cols.status'), render: (a) => <Badge tone={live.has(a.id) ? 'green' : 'slate'}>{live.has(a.id) ? t('admin.live') : a.active ? t('admin.scheduled') : t('admin.inactive')}</Badge> },
            { key: 'e', label: '', align: 'right', render: (a) => <Button size="sm" variant="ghost" onClick={() => setForm({ ...a, startAt: toLocal(a.startAt), endAt: toLocal(a.endAt) })}>{t('admin.edit')}</Button> },
          ]} />
        </Card>
        <Card title={form.id ? t('admin.editAnnouncement') : t('admin.newAnnouncement')} bodyClassName="space-y-3 p-4">
          <FormField label={t('admin.cols.title')}><input id="a-title" value={form.title} onChange={set('title')} maxLength={80} className={inputCls} /></FormField>
          <FormField label={t('admin.cols.message')}><textarea id="a-msg" value={form.message} onChange={set('message')} rows={3} maxLength={400} className="input-shell w-full resize-none px-3 py-2 text-sm text-white outline-none" /></FormField>
          <FormField label={t('admin.cols.type')}>
            <select id="a-type" value={form.type} onChange={set('type')} className={inputCls}>{['info', 'event', 'update', 'maintenance'].map((x) => <option key={x} value={x}>{t(`admin.annTypes.${x}`)}</option>)}</select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('admin.start')}><input id="a-start" type="datetime-local" value={form.startAt} onChange={set('startAt')} className={inputCls} /></FormField>
            <FormField label={t('admin.end')}><input id="a-end" type="datetime-local" value={form.endAt} onChange={set('endAt')} className={inputCls} /></FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300"><input id="a-active" type="checkbox" checked={form.active} onChange={set('active')} /> {t('admin.active')}</label>
          <div className="flex gap-2">
            {form.id && <Button variant="ghost" onClick={() => setForm(empty)}>{t('common.cancel')}</Button>}
            <Button className="flex-1" disabled={form.title.length < 3 || form.message.length < 3} onClick={() => setConfirm(true)}>{form.id ? t('common.save') : t('admin.publish')}</Button>
          </div>
        </Card>
      </div>
      {confirm && (
        <ReasonDialog open onClose={() => setConfirm(false)} adminName={me.username} tone="primary" title={form.title}
          onConfirm={async (r) => {
            await admin.saveAnnouncement({ ...form, startAt: form.startAt ? new Date(form.startAt).getTime() : null, endAt: form.endAt ? new Date(form.endAt).getTime() : null }, r)
            setForm(empty)
          }}>
          <p className="text-sm text-slate-400">{form.message}</p>
        </ReasonDialog>
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Logs ─────────────────────────────

export function LogsAdmin() {
  const { t } = useT()
  const logs = useAdminStore((s) => s.logs)
  const events = useAdminStore((s) => s.events)
  const [tab, setTab] = useState('audit')
  const [q, setQ] = useState('')
  const term = q.toLowerCase()
  const rows = logs.filter((l) => !q || [l.adminName, l.action, l.code, l.target, l.targetId, l.entityId, l.reason].some((x) => String(x ?? '').toLowerCase().includes(term)))
  const evRows = events.filter((e) => !q || JSON.stringify(e).toLowerCase().includes(term)).slice(0, 500)
  return (
    <AdminPage title={t('admin.nav.logs')} description={t('admin.logsDesc')}>
      <Tabs value={tab} onChange={setTab} options={[{ value: 'audit', label: t('admin.logTabs.audit'), count: logs.length }, { value: 'events', label: t('admin.logTabs.events'), count: events.length }]} />
      <SearchInput value={q} onChange={setQ} placeholder={t('admin.searchLogs')} />
      {tab === 'audit' ? (
        <>
          <LogTable logs={rows} />
          <p className="text-[11px] text-slate-500">{t('admin.logsImmutable')}</p>
        </>
      ) : (
        <Card bodyClassName="">
          <Table
            rows={evRows}
            empty={t('admin.empty')}
            columns={[
              { key: 'at', label: t('admin.cols.time'), render: (e) => <span className="whitespace-nowrap text-xs">{formatDateTime(e.at)}</span> },
              { key: 'type', label: t('admin.cols.type'), render: (e) => <span className="font-mono text-[11px] text-neon-cyan">{e.type}</span> },
              { key: 'user', label: t('admin.cols.user'), render: (e) => <span className="font-mono text-[11px]">{e.userId ?? e.adminId ?? '—'}</span> },
              { key: 'data', label: t('admin.cols.detail'), render: (e) => <span className="font-mono text-[11px] text-slate-400">{JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['id', 'type', 'at', 'userId'].includes(k)))).slice(0, 160)}</span> },
            ]}
          />
        </Card>
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Test mode ─────────────────────────────

export function TestModeAdmin() {
  const { t } = useT()
  const me = useCurrentUser()
  const users = useAuthStore((s) => s.users)
  const [dialog, setDialog] = useState(null)
  const real = Object.values(users).filter((u) => !u.isDemo)
  const tests = real.filter((u) => u.isTest)
  const sims = ['wins10', 'losses10', 'jackpot', 'reward', 'levelUp', 'quest', 'daily']
  return (
    <AdminPage title={t('admin.nav.testmode')} description={t('admin.testDesc')}>
      <div className="flex items-center gap-2.5 rounded-xl bg-neon-gold/10 px-4 py-3 text-sm font-semibold text-neon-gold ring-1 ring-inset ring-neon-gold/30">
        <FlaskConical className="h-4 w-4 shrink-0" /> {t('admin.testRules')}
      </div>
      <Card title={t('admin.testAccounts')} bodyClassName="">
        <Table rows={real} columns={[
          { key: 'u', label: t('admin.cols.user'), render: (u) => <span className="flex items-center gap-2"><Avatar user={u} size="xs" />@{u.username}</span> },
          { key: 'r', label: t('admin.cols.role'), render: (u) => <Badge tone={ROLE_TONE[u.role]}>{t(`admin.roles.${u.role}`)}</Badge> },
          { key: 't', label: 'Test', render: (u) => (u.isTest ? <Badge tone="gold">is_test = true</Badge> : <Badge>false</Badge>) },
          { key: 'f', label: 'Force', render: (u) => u.isTest && (
            <span className="flex gap-1">{['off', 'win', 'loss'].map((m) => <Button key={m} size="sm" variant={u.testControl === m ? 'primary' : 'ghost'} onClick={() => u.testControl !== m && setDialog({ kind: 'control', u, mode: m })}>{t(`admin.force.${m}`)}</Button>)}</span>
          ) },
          { key: 'a', label: '', align: 'right', render: (u) => <Button size="sm" variant={u.isTest ? 'ghost' : 'primary'} onClick={() => setDialog({ kind: 'toggle', u })}>{u.isTest ? t('admin.disableTest') : t('admin.enableTest')}</Button> },
        ]} />
      </Card>
      <Card title={t('admin.simulations')} bodyClassName="space-y-3 p-4">
        {tests.length === 0 ? <p className="text-sm text-slate-500">{t('admin.noTestAccounts')}</p> : tests.map((u) => (
          <div key={u.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="w-32 shrink-0 text-sm font-semibold text-slate-200">@{u.username}</span>
            <div className="flex flex-wrap gap-1.5">{sims.map((s) => <Button key={s} size="sm" variant="ghost" onClick={() => setDialog({ kind: 'sim', u, sim: s })}>{t(`admin.sims.${s}`)}</Button>)}</div>
          </div>
        ))}
      </Card>
      {dialog && (
        <ReasonDialog open onClose={() => setDialog(null)} adminName={me.username} tone="primary"
          title={dialog.kind === 'toggle' ? (dialog.u.isTest ? t('admin.disableTest') : t('admin.enableTest')) : dialog.kind === 'control' ? `Force ${dialog.mode}` : t(`admin.sims.${dialog.sim}`)}
          description={`@${dialog.u.username}`}
          onConfirm={(r) => (dialog.kind === 'toggle' ? admin.setTestAccount(dialog.u.id, !dialog.u.isTest, r) : dialog.kind === 'control' ? admin.setTestControl(dialog.u.id, dialog.mode, r) : admin.simulate(dialog.u.id, dialog.sim, r))} />
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Settings (RBAC matrix) ─────────────────────────────

export function SettingsAdmin() {
  const { t } = useT()
  const me = useCurrentUser()
  return (
    <AdminPage title={t('admin.nav.settings')} description={t('admin.settingsDesc')}>
      <Card title={t('admin.rbac')} bodyClassName="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead><tr className="border-b hairline text-slate-500"><th className="px-4 py-2.5 font-semibold">Permission</th>{ROLES.filter((r) => r !== 'user').map((r) => <th key={r} className="px-3 py-2.5 text-center font-semibold">{t(`admin.roles.${r}`)}</th>)}</tr></thead>
          <tbody className="divide-y divide-white/[0.05]">
            {PERMISSIONS.map((p) => (
              <tr key={p}>
                <td className="px-4 py-2 font-mono text-slate-300">{p}</td>
                {ROLES.filter((r) => r !== 'user').map((r) => <td key={r} className="px-3 py-2 text-center">{ROLE_PERMISSIONS[r].has(p) ? <span className="text-neon-green">●</span> : <span className="text-slate-700">—</span>}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title={t('admin.yourAccess')} bodyClassName="p-4 text-sm text-slate-400">
        <p>{t('admin.yourRole', { role: t(`admin.roles.${me.role}`) })}</p>
        <p className="mt-2 text-xs">{t('admin.backendNote')}</p>
      </Card>
    </AdminPage>
  )
}

export { STATUS_TONE, can }
