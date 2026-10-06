import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Ban, Coins, Gem, KeyRound, Lock, MicOff, Mic, RotateCcw, Snowflake, Undo2, Unlock, UserCog } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import ReasonDialog from '@/components/admin/ReasonDialog'
import { AdminPage, Badge, Card, FormField, Kpi, ROLE_TONE, RISK_TONE, STATUS_TONE, SearchInput, Table, Tabs, inputCls } from '@/components/admin/AdminKit'
import TransactionList from '@/components/wallet/TransactionList'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useWalletStore } from '@/store/useWalletStore'
import { useProgressStore, emptyProgress } from '@/store/useProgressStore'
import { useAdminStore } from '@/store/useAdminStore'
import { ROLES, can } from '@/config/roles'
import { ACHIEVEMENTS, levelFromXp } from '@/config/progression'
import { getGameName } from '@/config/games'
import * as admin from '@/services/admin'
import { questView } from '@/services/progression'
import { reportsAbout, myReports } from '@/services/reports'
import { TX_META, txDetail } from '@/components/wallet/TransactionList'
import { Amount } from '@/components/ui/Currency'
import { formatCoins, formatDateTime, timeAgo } from '@/utils/format'
import { useT } from '@/i18n'

export function StatusBadge({ user }) {
  const { t } = useT()
  return (
    <span className="flex flex-wrap gap-1">
      <Badge tone={STATUS_TONE[user.status ?? 'active']}>{t(`admin.status.${user.status ?? 'active'}`)}</Badge>
      {user.walletFrozen && <Badge tone="cyan">{t('admin.walletFrozen')}</Badge>}
      {user.isTest && <Badge tone="gold">TEST</Badge>}
      {user.isDemo && <Badge>Demo</Badge>}
    </span>
  )
}

export function UserList() {
  const { t } = useT()
  const navigate = useNavigate()
  const users = useAuthStore((s) => s.users)
  const wallets = useWalletStore((s) => s.wallets)
  const progress = useProgressStore((s) => s.byUser)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return Object.values(users)
      .filter((u) => !term || u.username.toLowerCase().includes(term) || u.email.toLowerCase().includes(term) || u.id.toLowerCase().includes(term) || u.displayName?.toLowerCase().includes(term))
      .filter((u) => filter === 'all' || (filter === 'muted' ? u.mutedUntil > Date.now() : filter === 'staff' ? u.role !== 'user' : filter === 'flagged' ? (progress[u.id]?.flags ?? []).some((f) => f.status === 'open') : (u.status ?? 'active') === filter))
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [users, q, filter, progress])

  const columns = [
    { key: 'user', label: t('admin.cols.user'), render: (u) => <span className="flex items-center gap-2.5"><Avatar user={u} size="sm" /><span className="min-w-0"><span className="block truncate font-semibold text-white">{u.displayName}</span><span className="block truncate text-xs text-slate-500">@{u.username}</span></span></span> },
    { key: 'role', label: t('admin.cols.role'), render: (u) => <Badge tone={ROLE_TONE[u.role]}>{t(`admin.roles.${u.role ?? 'user'}`)}</Badge> },
    { key: 'status', label: t('admin.cols.status'), render: (u) => <StatusBadge user={u} /> },
    { key: 'ac', label: 'AC', align: 'right', mono: true, render: (u) => formatCoins(wallets[u.id]?.balance ?? 0) },
    { key: 'ag', label: 'AG', align: 'right', mono: true, render: (u) => formatCoins(wallets[u.id]?.gems ?? 0) },
    { key: 'lvl', label: 'Lv', align: 'right', mono: true, render: (u) => levelFromXp(progress[u.id]?.xp ?? 0).level },
    { key: 'last', label: t('admin.cols.lastLogin'), render: (u) => <span className="text-xs text-slate-500">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : '—'}</span> },
  ]

  return (
    <AdminPage title={t('admin.nav.users')} description={t('admin.usersDesc', { count: Object.keys(users).length })}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1"><SearchInput value={q} onChange={setQ} placeholder={t('admin.searchUsers')} /></div>
        <select id="user-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputCls} sm:w-48`}>
          {['all', 'active', 'frozen', 'banned', 'muted', 'flagged', 'staff'].map((f) => <option key={f} value={f}>{t(`admin.filters.${f}`)}</option>)}
        </select>
      </div>
      <Card bodyClassName="">
        <Table columns={columns} rows={rows} onRow={(u) => navigate(`/admin/users/${u.id}`)} />
      </Card>
    </AdminPage>
  )
}

/** Dialog aksi: semua aksi sensitif lewat sini (konfirmasi + alasan + audit). */
function ActionDialogs({ action, user, wallet, close, adminName }) {
  const { t } = useT()
  const [amount, setAmount] = useState(100)
  const [currency, setCurrency] = useState('AC')
  const [hours, setHours] = useState(24)
  const [which, setWhich] = useState('AC')
  const [role, setRole] = useState(user.role)
  const [part, setPart] = useState('progression')
  const [minutes, setMinutes] = useState(60)
  const [edit, setEdit] = useState({ displayName: user.displayName, username: user.username, resetAvatar: false })
  if (!action) return null
  const key = typeof action === 'string' ? action : action.kind

  const balance = (c) => (c === 'AC' ? wallet?.balance ?? 0 : wallet?.gems ?? 0)
  const preview = (delta) => (
    <div className="grid grid-cols-3 items-center rounded-lg bg-white/[0.03] p-3 text-center text-sm ring-1 ring-inset ring-white/[0.06]">
      <div><p className="text-[11px] text-slate-500">{t('admin.before')}</p><p className="num font-mono font-bold text-white">{formatCoins(balance(currency))}</p></div>
      <div><p className="text-[11px] text-slate-500">{t('admin.change')}</p><p className={`num font-mono font-bold ${delta >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>{delta >= 0 ? '+' : '−'}{formatCoins(Math.abs(delta))}</p></div>
      <div><p className="text-[11px] text-slate-500">{t('admin.after')}</p><p className="num font-mono font-bold text-white">{formatCoins(balance(currency) + delta)}</p></div>
    </div>
  )
  const currencyPicker = (
    <div className="grid grid-cols-2 gap-3">
      <FormField label={t('admin.currency')}>
        <select id="adj-currency" value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputCls}><option value="AC">AC — Arcade Coin</option><option value="AG">AG — Arcade Gems</option></select>
      </FormField>
      <FormField label={t('admin.amount')}>
        <input id="adj-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(Number(e.target.value.replace(/\D/g, '')) || 0)} className={inputCls} />
      </FormField>
    </div>
  )

  const map = {
    add: { title: t('admin.ua.add'), tone: 'primary', body: <>{currencyPicker}{preview(amount)}</>, run: (r) => admin.adjustCurrency(user.id, currency, amount, r) },
    remove: { title: t('admin.ua.remove'), body: <>{currencyPicker}{preview(-amount)}</>, run: (r) => admin.adjustCurrency(user.id, currency, -amount, r) },
    reset: {
      title: t('admin.ua.reset'),
      body: (
        <FormField label={t('admin.currency')}>
          <select id="reset-which" value={which} onChange={(e) => setWhich(e.target.value)} className={inputCls}><option value="AC">AC</option><option value="AG">AG</option><option value="both">AC + AG</option></select>
          <p className="mt-2 text-xs text-slate-500">{t('admin.resetPreview', { ac: formatCoins(wallet?.balance ?? 0), ag: formatCoins(wallet?.gems ?? 0) })}</p>
        </FormField>
      ),
      run: (r) => admin.resetCurrency(user.id, which, r),
    },
    tempban: {
      title: t('admin.ua.tempban'),
      body: (
        <FormField label={t('admin.duration')}>
          <select id="ban-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))} className={inputCls}>
            {[1, 6, 24, 72, 168, 720].map((h) => <option key={h} value={h}>{h < 24 ? `${h} ${t('admin.hours')}` : `${h / 24} ${t('admin.days')}`}</option>)}
          </select>
        </FormField>
      ),
      run: (r) => admin.banUser(user.id, hours, r),
    },
    ban: { title: t('admin.ua.ban'), body: <p className="text-sm text-slate-400">{t('admin.banWarn')}</p>, run: (r) => admin.banUser(user.id, null, r) },
    unban: { title: t('admin.ua.unban'), tone: 'primary', body: null, run: (r) => admin.unbanUser(user.id, r) },
    freeze: { title: user.status === 'frozen' ? t('admin.ua.unfreeze') : t('admin.ua.freeze'), body: <p className="text-sm text-slate-400">{t('admin.freezeWarn')}</p>, run: (r) => admin.freezeAccount(user.id, user.status !== 'frozen', r) },
    walletFreeze: { title: user.walletFrozen ? t('admin.ua.walletUnfreeze') : t('admin.ua.walletFreeze'), body: <p className="text-sm text-slate-400">{t('admin.walletFreezeWarn')}</p>, run: (r) => admin.freezeWallet(user.id, !user.walletFrozen, r) },
    role: {
      title: t('admin.ua.role'),
      tone: 'primary',
      body: (
        <FormField label={t('admin.cols.role')}>
          <select id="set-role" value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>{ROLES.map((r) => <option key={r} value={r}>{t(`admin.roles.${r}`)}</option>)}</select>
        </FormField>
      ),
      run: (r) => admin.setRole(user.id, role, r),
    },
    progress: {
      title: t('admin.ua.progress'),
      body: (
        <FormField label={t('admin.part')}>
          <select id="reset-part" value={part} onChange={(e) => setPart(e.target.value)} className={inputCls}>
            {['progression', 'quests', 'daily', 'profile'].map((p) => <option key={p} value={p}>{t(`admin.parts.${p}`)}</option>)}
          </select>
        </FormField>
      ),
      run: (r) => admin.resetProgress(user.id, part, r),
    },
    warn: { title: t('admin.ua.warn'), body: <p className="text-sm text-slate-400">{t('admin.warnInfo', { n: admin.activeWarnings(user).length })}</p>, run: (r) => admin.warnUser(user.id, r) },
    unwarn: { title: t('admin.ua.unwarn'), tone: 'primary', body: <p className="text-sm text-slate-400">{action?.warning?.reason}</p>, run: (r) => admin.removeWarning(user.id, action.warning.id, r) },
    mute: {
      title: t('admin.ua.mute'),
      body: (
        <FormField label={t('admin.duration')}>
          <select id="mute-minutes" value={minutes ?? 'perm'} onChange={(e) => setMinutes(e.target.value === 'perm' ? null : Number(e.target.value))} className={inputCls}>
            {[10, 60, 360, 1440, 10080].map((m) => <option key={m} value={m}>{m < 60 ? `${m} ${t('admin.minutes')}` : m < 1440 ? `${m / 60} ${t('admin.hours')}` : `${m / 1440} ${t('admin.days')}`}</option>)}
            <option value="perm">{t('admin.permanent')}</option>
          </select>
        </FormField>
      ),
      run: (r) => admin.muteUser(user.id, minutes, r),
    },
    unmute: { title: t('admin.ua.unmute'), tone: 'primary', body: null, run: (r) => admin.unmuteUser(user.id, r) },
    reverse: {
      title: t('admin.ua.reverse'),
      body: action?.tx && (
        <div className="space-y-2 rounded-lg bg-white/[0.03] p-3 text-sm ring-1 ring-inset ring-white/[0.06]">
          <p className="font-mono text-xs text-slate-400">{action.tx.id} · {t(`tx.types.${action.tx.type}`)}</p>
          <p className="text-slate-300">{t('admin.reverseInfo', { amount: `${formatCoins(-action.tx.amount)} ${action.tx.currency}` })}</p>
        </div>
      ),
      run: (r) => admin.reverseTransaction(user.id, action.tx.id, r),
    },
    edit: {
      title: t('admin.ua.edit'),
      tone: 'primary',
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField label={t('profile.displayName')}><input id="edit-dn" value={edit.displayName} onChange={(e) => setEdit({ ...edit, displayName: e.target.value })} className={inputCls} /></FormField>
          <FormField label="Username"><input id="edit-un" value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} className={inputCls} /></FormField>
          <label className="flex items-center gap-2 text-sm text-slate-300 sm:col-span-2"><input id="edit-av" type="checkbox" checked={edit.resetAvatar} onChange={(e) => setEdit({ ...edit, resetAvatar: e.target.checked })} /> {t('admin.resetAvatar')}</label>
        </div>
      ),
      run: (r) => admin.editUser(user.id, edit, r),
    },
  }
  const a = map[key]
  return (
    <ReasonDialog open onClose={close} title={a.title} description={`@${user.username}`} tone={a.tone ?? 'danger'} adminName={adminName} onConfirm={a.run}>
      {a.body}
    </ReasonDialog>
  )
}

export function UserDetail() {
  const { t } = useT()
  const { id } = useParams()
  const navigate = useNavigate()
  const me = useCurrentUser()
  const user = useAuthStore((s) => Object.values(s.users).find((u) => u.id === id))
  const wallet = useWalletStore((s) => s.wallets[id])
  const p = useProgressStore((s) => s.byUser[id]) ?? emptyProgress()
  const logs = useAdminStore((s) => s.logs)
  const [tab, setTab] = useState('overview')
  const [action, setAction] = useState(null)

  if (!user) return <AdminPage title={t('admin.errors.noUser')} />
  const lv = levelFromXp(p.xp)
  const sensitive = can(me.role, 'users.sensitive')
  const banned = user.status === 'banned'
  const modHistory = logs.filter((l) => l.targetId === user.id || (!l.targetId && l.target === user.username))
  const events = useAdminStore.getState().events.filter((e) => e.userId === user.id).slice(0, 100)
  const reports = [...reportsAbout(user.id), ...myReports(user.id)]
  const warnings = user.warnings ?? []
  const muted = user.mutedUntil > Date.now()
  const btn = (key, perm, icon, label, variant = 'ghost') =>
    can(me.role, perm) && (
      <Button key={key} size="sm" variant={variant} onClick={() => setAction(key)}>
        {icon} {label}
      </Button>
    )

  return (
    <AdminPage
      title={user.displayName}
      description={`@${user.username} · ${sensitive ? user.email : '•••@•••'} · ID ${user.id}`}
      actions={<Button size="sm" variant="ghost" onClick={() => navigate('/admin/users')}><ArrowLeft className="h-4 w-4" /> {t('admin.nav.users')}</Button>}
    >
      <Card bodyClassName="flex flex-col gap-4 p-4 xl:flex-row xl:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
        <Avatar user={user} size="lg" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={ROLE_TONE[user.role]}>{t(`admin.roles.${user.role ?? 'user'}`)}</Badge>
            <StatusBadge user={user} />
          </div>
          <p className="text-xs text-slate-500">
            {t('admin.joined')} {formatDateTime(user.createdAt)} · {t('admin.cols.lastLogin')} {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '—'}
            {muted && <> · {t('admin.mutedInfo', { until: user.mutedUntil > Date.now() + 3e10 ? t('admin.permanent') : formatDateTime(user.mutedUntil) })}</>}
            {warnings.some((w) => !w.removedAt) && <> · {t('admin.warningsInfo', { n: warnings.filter((w) => !w.removedAt).length })}</>}
            {banned && user.ban && <> · {t('admin.bannedInfo', { until: user.ban.until ? formatDateTime(user.ban.until) : t('admin.permanent'), by: user.ban.by, reason: user.ban.reason })}</>}
          </p>
        </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:max-w-[60%] xl:justify-end">
          {btn('edit', 'users.edit', <UserCog className="h-4 w-4" />, t('admin.ua.edit'))}
          {btn('role', 'roles.manage', <KeyRound className="h-4 w-4" />, t('admin.ua.role'))}
          {banned ? btn('unban', 'users.ban', <Unlock className="h-4 w-4" />, t('admin.ua.unban')) : btn('tempban', 'users.ban', <Ban className="h-4 w-4" />, t('admin.ua.tempban'), 'danger')}
          {!banned && btn('ban', 'users.freeze', <Ban className="h-4 w-4" />, t('admin.ua.ban'), 'danger')}
          {btn('freeze', 'users.freeze', <Lock className="h-4 w-4" />, user.status === 'frozen' ? t('admin.ua.unfreeze') : t('admin.ua.freeze'))}
          {btn('walletFreeze', 'users.freeze', <Snowflake className="h-4 w-4" />, user.walletFrozen ? t('admin.ua.walletUnfreeze') : t('admin.ua.walletFreeze'))}
          {btn('warn', 'users.warn', <AlertTriangle className="h-4 w-4" />, t('admin.ua.warn'))}
          {muted ? btn('unmute', 'moderation', <Mic className="h-4 w-4" />, t('admin.ua.unmute')) : btn('mute', 'moderation', <MicOff className="h-4 w-4" />, t('admin.ua.mute'))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="AC" value={formatCoins(wallet?.balance ?? 0)} tone="text-neon-gold" />
        <Kpi label="AG" value={formatCoins(wallet?.gems ?? 0)} tone="text-gem" />
        <Kpi label="XP" value={formatCoins(p.xp)} />
        <Kpi label={t('admin.level')} value={lv.level} sub={`${lv.into}/${lv.need}`} />
        <Kpi label={t('admin.games')} value={formatCoins(p.stats.games)} />
        <Kpi label={t('admin.wins')} value={formatCoins(p.stats.wins)} />
        <Kpi label={t('admin.losses')} value={formatCoins(p.stats.losses)} />
        <Kpi label={t('admin.flagsCount')} value={p.flags.filter((f) => f.status === 'open').length} tone={p.flags.some((f) => f.status === 'open') ? 'text-neon-gold' : undefined} />
      </div>

      {can(me.role, 'wallet.manage') && (
        <Card title={t('admin.currencyMgmt')} bodyClassName="flex flex-wrap gap-2 p-4">
          <Button size="sm" onClick={() => setAction('add')}><Coins className="h-4 w-4" /> {t('admin.ua.add')}</Button>
          <Button size="sm" variant="ghost" onClick={() => setAction('remove')}><Gem className="h-4 w-4" /> {t('admin.ua.remove')}</Button>
          <Button size="sm" variant="danger" onClick={() => setAction('reset')}><RotateCcw className="h-4 w-4" /> {t('admin.ua.reset')}</Button>
          {can(me.role, 'progress.reset') && <Button size="sm" variant="danger" onClick={() => setAction('progress')}><RotateCcw className="h-4 w-4" /> {t('admin.ua.progress')}</Button>}
        </Card>
      )}

      <Tabs
        value={tab}
        onChange={setTab}
        options={[
          { value: 'overview', label: t('admin.tabs.overview') },
          { value: 'tx', label: t('admin.tabs.tx'), count: wallet?.transactions.length ?? 0 },
          { value: 'sessions', label: t('admin.tabs.sessions'), count: p.sessions.length },
          ...(sensitive ? [{ value: 'security', label: t('admin.tabs.security'), count: p.flags.length }, { value: 'logins', label: t('admin.tabs.logins') }] : []),
          { value: 'moderation', label: t('admin.tabs.moderation'), count: modHistory.length },
          { value: 'reports', label: t('admin.tabs.reports'), count: reports.length },
          { value: 'progress', label: t('admin.tabs.progress') },
          { value: 'activity', label: t('admin.tabs.activity'), count: events.length },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('admin.questProgress')} bodyClassName="divide-y divide-white/[0.05]">
            {[...questView(p, 'daily'), ...questView(p, 'weekly')].map((q) => (
              <div key={q.scope + q.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="truncate text-slate-300">{t(`rewards.quests.${q.id}`)} <span className="text-xs text-slate-500">· {q.scope}</span></span>
                <span className="num font-mono text-xs text-slate-400">{formatCoins(q.progress)}/{formatCoins(q.target)} {q.claimed ? '✓' : ''}</span>
              </div>
            ))}
          </Card>
          <Card title={t('rewards.achievementsTitle')} bodyClassName="divide-y divide-white/[0.05]">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="truncate text-slate-300">{t(`rewards.achievements.${a.id}.name`)}</span>
                {p.achievements[a.id] ? <Badge tone="purple">{formatDateTime(p.achievements[a.id])}</Badge> : <Badge>{t('admin.locked')}</Badge>}
              </div>
            ))}
            <div className="px-4 py-2 text-xs text-slate-500">{t('admin.dailyState', { streak: p.daily.streak, last: p.daily.lastClaimDay ?? '—' })}</div>
          </Card>
        </div>
      )}
      {tab === 'tx' && (
        <Card bodyClassName="">
          <Table
            rows={wallet?.transactions ?? []}
            empty={t('admin.empty')}
            columns={[
              { key: 'at', label: t('admin.cols.time'), render: (x) => <span className="whitespace-nowrap text-xs">{formatDateTime(x.at)}</span> },
              { key: 'id', label: 'ID', render: (x) => <span className="font-mono text-[11px] text-slate-400">{x.id}</span> },
              { key: 'type', label: t('admin.cols.type'), render: (x) => <span className="whitespace-nowrap">{t(`tx.types.${x.type}`)} <span className="text-[10px] text-slate-500">{t(`wallet.categories.${x.category ?? 'other'}`)}</span></span> },
              { key: 'detail', label: t('admin.cols.detail'), render: (x) => <span className="text-xs text-slate-400">{txDetail(t, x)}{x.reason ? ` · ${x.reason}` : ''}{x.sessionId ? ` · ${x.sessionId}` : ''}</span> },
              { key: 'amt', label: t('admin.amount'), align: 'right', render: (x) => <Amount currency={x.currency} value={x.amount} signed size="sm" /> },
              { key: 'st', label: t('admin.cols.status'), render: (x) => <span className="flex flex-wrap gap-1"><Badge tone={x.status === 'failed' ? 'red' : x.status === 'pending' ? 'gold' : 'green'}>{t(`status.${x.status ?? 'success'}`)}</Badge>{x.reversedBy && <Badge tone="purple">{t('admin.reversed')}</Badge>}{x.reversalOf && <Badge tone="purple">↩ {x.reversalOf}</Badge>}</span> },
              ...(can(me.role, 'wallet.reverse') ? [{ key: 'rev', label: '', align: 'right', render: (x) => !x.reversedBy && x.type !== 'reversal' && x.status === 'success' && x.amount !== 0 && <Button size="xs" variant="ghost" onClick={() => setAction({ kind: 'reverse', tx: x })}><Undo2 className="h-3.5 w-3.5" /> {t('admin.ua.reverse')}</Button> }] : []),
            ]}
          />
        </Card>
      )}
      {tab === 'sessions' && <SessionTable sessions={p.sessions.map((s) => ({ ...s, userId: id, username: user.username }))} />}
      {tab === 'security' && (
        <Card bodyClassName="">
          <Table
            rows={p.flags}
            empty={t('admin.noFlags')}
            columns={[
              { key: 'at', label: t('admin.cols.time'), render: (f) => <span className="text-xs">{formatDateTime(f.at)}</span> },
              { key: 'type', label: t('admin.cols.flag'), render: (f) => t(`admin.flags.${f.type}`) },
              { key: 'risk', label: t('admin.cols.risk'), render: (f) => <Badge tone={RISK_TONE[f.risk]}>{t(`admin.risk.${f.risk}`)}</Badge> },
              { key: 'status', label: t('admin.cols.status'), render: (f) => <Badge>{t(`admin.flagStatus.${f.status}`)}</Badge> },
              { key: 'count', label: '×', align: 'right', mono: true, render: (f) => f.count ?? 1 },
            ]}
          />
        </Card>
      )}
      {tab === 'logins' && (
        <Card bodyClassName="">
          <Table
            rows={(user.loginHistory ?? []).map((l, i) => ({ ...l, id: i }))}
            columns={[
              { key: 'at', label: t('admin.cols.time'), render: (l) => formatDateTime(l.at) },
              { key: 'ok', label: t('admin.cols.result'), render: (l) => <Badge tone={l.ok ? 'green' : 'red'}>{l.ok ? t('status.success') : t('status.failed')}</Badge> },
              { key: 'kind', label: t('admin.cols.detail'), render: (l) => <span className="text-xs text-slate-400">{l.kind}</span> },
            ]}
          />
          <p className="border-t hairline px-4 py-2 text-[11px] text-slate-500">{t('admin.noIp')}</p>
        </Card>
      )}
      {tab === 'moderation' && (
        <div className="space-y-4">
          <Card title={t('admin.warnings')} bodyClassName="divide-y divide-white/[0.05]">
            {warnings.length ? warnings.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1"><span className={w.removedAt ? 'text-slate-500 line-through' : 'text-slate-200'}>{w.reason}</span> <span className="text-xs text-slate-500">· @{w.by} · {formatDateTime(w.at)}</span></span>
                {w.removedAt ? <Badge>{t('admin.removed')}</Badge> : can(me.role, 'users.warn') && <Button size="xs" variant="ghost" onClick={() => setAction({ kind: 'unwarn', warning: w })}>{t('admin.ua.unwarn')}</Button>}
              </div>
            )) : <p className="px-4 py-6 text-center text-sm text-slate-500">{t('admin.noWarnings')}</p>}
          </Card>
          <LogTable logs={modHistory} />
        </div>
      )}
      {tab === 'reports' && (
        <Card bodyClassName="">
          <Table
            rows={reports}
            empty={t('admin.empty')}
            onRow={() => navigate('/admin/moderation')}
            columns={[
              { key: 'at', label: t('admin.cols.time'), render: (r) => <span className="text-xs">{formatDateTime(r.at)}</span> },
              { key: 'dir', label: '', render: (r) => <Badge tone={r.targetUserId === user.id ? 'red' : 'slate'}>{r.targetUserId === user.id ? t('admin.reported') : t('admin.reporter')}</Badge> },
              { key: 'cat', label: t('admin.cols.type'), render: (r) => `${t(`reports.types.${r.targetType}`)} · ${t(`reports.reasons.${r.category}`)}` },
              { key: 'desc', label: t('admin.cols.detail'), render: (r) => <span className="line-clamp-1 text-xs text-slate-400">{r.description}</span> },
              { key: 'st', label: t('admin.cols.status'), render: (r) => <Badge>{t(`moderation.status.${r.status}`)}</Badge> },
            ]}
          />
        </Card>
      )}
      {tab === 'progress' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={t('admin.levelHistory')} bodyClassName="divide-y divide-white/[0.05]">
            {p.levelHistory.length ? p.levelHistory.slice(0, 30).map((h, i) => (
              <div key={i} className="flex justify-between px-4 py-2 text-sm"><span className="text-slate-200">Lv {h.level}</span><span className="text-xs text-slate-500">{formatDateTime(h.at)} · {formatCoins(h.xp)} XP</span></div>
            )) : <p className="px-4 py-6 text-center text-sm text-slate-500">{t('admin.empty')}</p>}
          </Card>
          <Card title={t('admin.milestones')} bodyClassName="divide-y divide-white/[0.05]">
            {Object.entries(p.milestones).length ? Object.entries(p.milestones).map(([k, m]) => (
              <div key={k} className="flex justify-between gap-3 px-4 py-2 text-sm"><span className="text-slate-200">{k}</span><span className="text-right text-xs text-slate-500">{m.reward?.amount} {m.reward?.kind} · tx {m.rewardTxId ?? '—'} · {formatDateTime(m.claimedAt)}</span></div>
            )) : <p className="px-4 py-6 text-center text-sm text-slate-500">{t('admin.empty')}</p>}
            <div className="px-4 py-2 text-xs text-slate-500">Season {p.season?.id ?? '—'} · {formatCoins(p.season?.xp ?? 0)} SXP · tiers {(p.season?.tiersClaimed ?? []).join(', ') || '—'}</div>
          </Card>
        </div>
      )}
      {tab === 'activity' && (
        <Card bodyClassName="">
          <Table
            rows={events}
            empty={t('admin.empty')}
            columns={[
              { key: 'at', label: t('admin.cols.time'), render: (e) => <span className="whitespace-nowrap text-xs">{formatDateTime(e.at)}</span> },
              { key: 'type', label: t('admin.cols.type'), render: (e) => <span className="font-mono text-[11px] text-neon-cyan">{e.type}</span> },
              { key: 'data', label: t('admin.cols.detail'), render: (e) => <span className="font-mono text-[11px] text-slate-400">{JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => !['id', 'type', 'at', 'userId'].includes(k)))).slice(0, 140)}</span> },
            ]}
          />
        </Card>
      )}

      <ActionDialogs action={action} user={user} wallet={wallet} close={() => setAction(null)} adminName={me.username} />
    </AdminPage>
  )
}

export function SessionTable({ sessions, onInvalidate }) {
  const { t } = useT()
  return (
    <Card bodyClassName="">
      <Table
        rows={sessions.slice(0, 200)}
        empty={t('admin.noSessions')}
        columns={[
          { key: 'at', label: t('admin.cols.time'), render: (s) => <span className="text-xs">{formatDateTime(s.at)}</span> },
          { key: 'user', label: t('admin.cols.user'), render: (s) => `@${s.username}` },
          { key: 'game', label: t('admin.cols.game'), render: (s) => getGameName(s.game) },
          { key: 'bet', label: t('play.bet'), align: 'right', mono: true, render: (s) => formatCoins(s.bet) },
          { key: 'mult', label: '×', align: 'right', mono: true, render: (s) => `${(s.multiplier ?? 0).toFixed(2)}×` },
          { key: 'payout', label: t('play.payout'), align: 'right', mono: true, render: (s) => formatCoins(s.payout) },
          { key: 'res', label: t('admin.cols.result'), render: (s) => (
            <span className="flex flex-wrap gap-1">
              <Badge tone={s.result === 'win' ? 'green' : s.result === 'push' ? 'slate' : 'red'}>{t(`play.result.${s.result}`).split(' ')[0]}</Badge>
              {s.isTest && <Badge tone="gold">TEST</Badge>}
              {s.invalidated && <Badge tone="red">{t('admin.invalidated')}</Badge>}
            </span>
          ) },
          ...(onInvalidate ? [{ key: 'act', label: '', align: 'right', render: (s) => !s.invalidated && !s.isTest && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onInvalidate(s) }}>{t('admin.invalidate')}</Button> }] : []),
        ]}
      />
    </Card>
  )
}

export function LogTable({ logs }) {
  const { t } = useT()
  return (
    <Card bodyClassName="">
      <Table
        rows={logs}
        empty={t('admin.noLogs')}
        columns={[
          { key: 'at', label: t('admin.cols.time'), render: (l) => <span className="whitespace-nowrap text-xs">{formatDateTime(l.at)}</span> },
          { key: 'admin', label: t('admin.cols.admin'), render: (l) => <span className="whitespace-nowrap">@{l.adminName} <span className="text-[10px] text-slate-500">{t(`admin.roles.${l.role}`)}</span></span> },
          { key: 'action', label: t('admin.cols.action'), render: (l) => <span><span className="font-semibold text-white">{t(`admin.actions.${l.action}`, { defaultValue: l.action })}</span>{l.code && <span className="block font-mono text-[10px] text-slate-500">{l.code}</span>}</span> },
          { key: 'target', label: t('admin.cols.target'), render: (l) => l.target ?? '—' },
          { key: 'change', label: t('admin.cols.change'), render: (l) => <span className="num font-mono text-[11px] text-slate-400">{l.before != null || l.after != null ? `${JSON.stringify(l.before)} → ${JSON.stringify(l.after)}` : '—'}</span> },
          { key: 'reason', label: t('admin.reason'), render: (l) => <span className="line-clamp-2 text-xs text-slate-400">{l.reason}</span> },
          { key: 'meta', label: t('admin.cols.meta'), render: (l) => <span className="whitespace-nowrap text-[10px] text-slate-500">{l.device ? `${l.device.agent} · IP ${l.device.ip}` : '—'}{l.entityId ? <span className="block font-mono">#{l.entityId}</span> : null}</span> },
        ]}
      />
    </Card>
  )
}
