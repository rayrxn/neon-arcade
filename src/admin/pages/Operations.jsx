import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Ban, Check, Eye, Lock, Search as SearchIcon, ShieldX, Snowflake, XCircle } from 'lucide-react'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import ReasonDialog from '@/components/admin/ReasonDialog'
import { AdminPage, Badge, Card, FormField, Kpi, RISK_TONE, SearchInput, Table, Tabs, inputCls } from '@/components/admin/AdminKit'
import { SessionTable } from './Users'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useWalletStore } from '@/store/useWalletStore'
import { useProgressStore } from '@/store/useProgressStore'
import { useAdminStore } from '@/store/useAdminStore'
import { GAMES } from '@/config/games'
import { can } from '@/config/roles'
import * as admin from '@/services/admin'
import { formatCoins, formatDateTime, timeAgo } from '@/utils/format'
import { useT } from '@/i18n'

// ───────────────────────────── Wallets ─────────────────────────────

export function Wallets() {
  const { t } = useT()
  const me = useCurrentUser()
  const users = useAuthStore((s) => s.users)
  const wallets = useWalletStore((s) => s.wallets)
  const [q, setQ] = useState('')
  const [form, setForm] = useState({ userId: '', currency: 'AC', amount: 100, mode: 'add' })
  const [confirm, setConfirm] = useState(false)
  const list = Object.values(users).filter((u) => !q || u.username.toLowerCase().includes(q.toLowerCase()) || u.id.includes(q))
  const target = Object.values(users).find((u) => u.id === form.userId)
  const before = target ? (form.currency === 'AC' ? wallets[target.id]?.balance ?? 0 : wallets[target.id]?.gems ?? 0) : 0
  const delta = form.mode === 'add' ? form.amount : form.mode === 'remove' ? -form.amount : -before
  const recent = Object.entries(wallets)
    .flatMap(([uid, w]) => w.transactions.filter((tx) => tx.type === 'adjust').map((tx) => ({ ...tx, username: Object.values(users).find((u) => u.id === uid)?.username })))
    .sort((a, b) => b.at - a.at)
    .slice(0, 30)

  return (
    <AdminPage title={t('admin.nav.wallets')} description={t('admin.walletsDesc')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card title={t('admin.balances')} bodyClassName="">
          <div className="p-3"><SearchInput value={q} onChange={setQ} placeholder={t('admin.searchUsers')} /></div>
          <Table
            rows={list}
            onRow={(u) => setForm((f) => ({ ...f, userId: u.id }))}
            columns={[
              { key: 'u', label: t('admin.cols.user'), render: (u) => <span className="flex items-center gap-2"><Avatar user={u} size="xs" />@{u.username} {u.walletFrozen && <Badge tone="cyan">{t('admin.walletFrozen')}</Badge>}</span> },
              { key: 'ac', label: 'AC', align: 'right', mono: true, render: (u) => formatCoins(wallets[u.id]?.balance ?? 0) },
              { key: 'ag', label: 'AG', align: 'right', mono: true, render: (u) => formatCoins(wallets[u.id]?.gems ?? 0) },
              { key: 'sel', label: '', align: 'right', render: (u) => form.userId === u.id && <Check className="ml-auto h-4 w-4 text-neon-cyan" /> },
            ]}
          />
        </Card>
        <Card title={t('admin.currencyMgmt')} bodyClassName="space-y-3 p-4">
          <FormField label={t('admin.cols.user')}>
            <select id="w-user" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} className={inputCls}>
              <option value="">—</option>
              {Object.values(users).map((u) => <option key={u.id} value={u.id}>@{u.username}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-ink-950/60 p-1">
            {['add', 'remove', 'reset'].map((m) => <button key={m} onClick={() => setForm({ ...form, mode: m })} className={`h-8 rounded-md text-xs font-bold ${form.mode === m ? 'bg-white/10 text-white' : 'text-slate-500'}`}>{t(`admin.modes.${m}`)}</button>)}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={t('admin.currency')}>
              <select id="w-cur" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={inputCls}><option value="AC">AC</option><option value="AG">AG</option></select>
            </FormField>
            <FormField label={t('admin.amount')}>
              <input id="w-amt" disabled={form.mode === 'reset'} inputMode="numeric" value={form.mode === 'reset' ? before : form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value.replace(/\D/g, '')) || 0 })} className={inputCls} />
            </FormField>
          </div>
          <div className="grid grid-cols-3 rounded-lg bg-white/[0.03] p-3 text-center text-sm ring-1 ring-inset ring-white/[0.06]">
            <div><p className="text-[11px] text-slate-500">{t('admin.before')}</p><p className="num font-mono font-bold text-white">{formatCoins(before)}</p></div>
            <div><p className="text-[11px] text-slate-500">{t('admin.change')}</p><p className={`num font-mono font-bold ${delta >= 0 ? 'text-neon-green' : 'text-neon-red'}`}>{delta >= 0 ? '+' : '−'}{formatCoins(Math.abs(delta))}</p></div>
            <div><p className="text-[11px] text-slate-500">{t('admin.after')}</p><p className={`num font-mono font-bold ${before + delta < 0 ? 'text-neon-red' : 'text-white'}`}>{formatCoins(before + delta)}</p></div>
          </div>
          <Button className="w-full" disabled={!target || !can(me.role, 'wallet.manage') || (form.mode !== 'reset' && !form.amount)} onClick={() => setConfirm(true)}>{t('admin.review')}</Button>
        </Card>
      </div>
      <Card title={t('admin.adjustHistory')} bodyClassName="">
        <Table
          rows={recent}
          empty={t('admin.empty')}
          columns={[
            { key: 'at', label: t('admin.cols.time'), render: (r) => <span className="text-xs">{formatDateTime(r.at)}</span> },
            { key: 'u', label: t('admin.cols.user'), render: (r) => `@${r.username}` },
            { key: 'c', label: t('admin.cols.change'), mono: true, render: (r) => `${r.amount > 0 ? '+' : ''}${formatCoins(r.amount)} ${r.currency} → ${formatCoins(r.balanceAfter)}` },
            { key: 'by', label: t('admin.cols.admin'), render: (r) => r.reference },
            { key: 'n', label: t('admin.reason'), render: (r) => <span className="text-xs text-slate-400">{r.note}</span> },
          ]}
        />
      </Card>
      {confirm && target && (
        <ReasonDialog open onClose={() => setConfirm(false)} adminName={me.username} title={t(`admin.modes.${form.mode}`)} description={`@${target.username} · ${form.currency}`} tone={form.mode === 'add' ? 'primary' : 'danger'}
          onConfirm={(r) => (form.mode === 'reset' ? admin.resetCurrency(target.id, form.currency, r) : admin.adjustCurrency(target.id, form.currency, delta, r))}>
          <p className="num rounded-lg bg-white/[0.03] p-3 text-center font-mono text-sm text-white">{formatCoins(before)} → {delta >= 0 ? '+' : '−'}{formatCoins(Math.abs(delta))} → {formatCoins(before + delta)} {form.currency}</p>
        </ReasonDialog>
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Games ─────────────────────────────

export function GamesAdmin() {
  const { t } = useT()
  const me = useCurrentUser()
  const config = useAdminStore((s) => s.gameConfig)
  const progress = useProgressStore((s) => s.byUser)
  const [dialog, setDialog] = useState(null)
  const [maxBet, setMaxBet] = useState(20000000)
  const played = (slug) => Object.values(progress).reduce((s, p) => s + (p.stats.perGame[slug]?.played ?? 0), 0)

  return (
    <AdminPage title={t('admin.nav.games')} description={t('admin.gamesDesc')}>
      <Card bodyClassName="">
        <Table
          rows={GAMES.map((g) => ({ ...g, id: g.slug }))}
          columns={[
            { key: 'n', label: t('admin.cols.game'), render: (g) => <span className="font-semibold text-white">{g.name}</span> },
            { key: 't', label: t('admin.cols.type'), render: (g) => t(`games.categories.${g.category}`) },
            { key: 'p', label: t('admin.kpi.gamesPlayed'), align: 'right', mono: true, render: (g) => formatCoins(played(g.slug)) },
            { key: 'mb', label: t('admin.maxBet'), align: 'right', mono: true, render: (g) => formatCoins(config[g.slug]?.maxBet ?? 20000000) },
            { key: 's', label: t('admin.cols.status'), render: (g) => {
              const st = !g.load ? 'soon' : config[g.slug]?.status ?? 'live'
              return <Badge tone={st === 'live' ? 'green' : st === 'soon' ? 'slate' : st === 'maintenance' ? 'gold' : 'red'}>{t(`admin.gameStatus.${st}`)}</Badge>
            } },
            { key: 'a', label: '', align: 'right', render: (g) => g.load && can(me.role, 'games.manage') && (
              <span className="flex justify-end gap-1.5">
                {['live', 'maintenance', 'disabled'].filter((s) => s !== (config[g.slug]?.status ?? 'live')).map((s) => <Button key={s} size="sm" variant="ghost" onClick={() => setDialog({ kind: 'status', game: g, status: s })}>{t(`admin.gameStatus.${s}`)}</Button>)}
                <Button size="sm" variant="ghost" onClick={() => { setMaxBet(config[g.slug]?.maxBet ?? 20000000); setDialog({ kind: 'maxBet', game: g }) }}>{t('admin.maxBet')}</Button>
              </span>
            ) },
          ]}
        />
      </Card>
      {dialog && (
        <ReasonDialog open onClose={() => setDialog(null)} adminName={me.username} tone="primary"
          title={dialog.kind === 'status' ? `${dialog.game.name} → ${t(`admin.gameStatus.${dialog.status}`)}` : `${dialog.game.name} · ${t('admin.maxBet')}`}
          onConfirm={(r) => (dialog.kind === 'status' ? admin.setGameStatus(dialog.game.slug, dialog.status, r) : admin.setGameMaxBet(dialog.game.slug, maxBet, r))}>
          {dialog.kind === 'maxBet' && <FormField label={t('admin.maxBet')}><input id="g-max" inputMode="numeric" value={maxBet} onChange={(e) => setMaxBet(Number(e.target.value.replace(/\D/g, '')) || 0)} className={inputCls} /></FormField>}
        </ReasonDialog>
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Sessions ─────────────────────────────

export function Sessions() {
  const { t } = useT()
  const me = useCurrentUser()
  useProgressStore((s) => s.byUser)
  const [q, setQ] = useState('')
  const [game, setGame] = useState('all')
  const [target, setTarget] = useState(null)
  const sessions = admin.allSessions().filter((s) => (game === 'all' || s.game === game) && (!q || s.username.toLowerCase().includes(q.toLowerCase()) || s.id.includes(q)))
  return (
    <AdminPage title={t('admin.nav.sessions')} description={t('admin.sessionsDesc')}>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex-1"><SearchInput value={q} onChange={setQ} placeholder={t('admin.searchSessions')} /></div>
        <select id="s-game" value={game} onChange={(e) => setGame(e.target.value)} className={`${inputCls} sm:w-48`}>
          <option value="all">{t('common.all')}</option>
          {GAMES.filter((g) => g.load).map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
        </select>
      </div>
      <SessionTable sessions={sessions} onInvalidate={can(me.role, 'sessions.invalidate') ? setTarget : undefined} />
      {target && (
        <ReasonDialog open onClose={() => setTarget(null)} adminName={me.username} title={t('admin.invalidateTitle')} description={`@${target.username} · ${target.id}`}
          onConfirm={(r) => admin.invalidateSession(target.userId, target.id, r)}>
          <p className="text-sm text-slate-400">{t('admin.invalidateWarn', { gain: formatCoins(Math.max(0, target.payout - target.bet)) })}</p>
        </ReasonDialog>
      )}
    </AdminPage>
  )
}

// ───────────────────────────── Anti-cheat ─────────────────────────────

export function AntiCheat() {
  const { t } = useT()
  const me = useCurrentUser()
  useProgressStore((s) => s.byUser)
  const users = useAuthStore((s) => s.users)
  const [tab, setTab] = useState('open')
  const [selected, setSelected] = useState(null)
  const [dialog, setDialog] = useState(null)
  const flags = admin.allFlags()
  const shown = flags.filter((f) => (tab === 'all' ? true : tab === 'open' ? f.status === 'open' || f.status === 'reviewing' : f.status === tab))
  const sel = selected && flags.find((f) => f.id === selected.id)
  const selUser = sel && Object.values(users).find((u) => u.id === sel.userId)
  const session = sel?.sessionId && useProgressStore.getState().byUser[sel.userId]?.sessions.find((s) => s.id === sel.sessionId)
  const previous = sel ? flags.filter((f) => f.userId === sel.userId && f.id !== sel.id) : []

  const actions = sel && [
    ['reviewing', <Eye key="e" className="h-4 w-4" />, t('admin.ac.review'), 'ghost', () => admin.updateFlag(sel.userId, sel.id, 'reviewing', 'Opened for review')],
    ['dismissed', <XCircle key="x" className="h-4 w-4" />, t('admin.ac.dismiss'), 'ghost'],
    ['confirmed', <Check key="c" className="h-4 w-4" />, t('admin.ac.confirm'), 'danger'],
  ]

  return (
    <AdminPage title={t('admin.nav.anticheat')} description={t('admin.anticheatDesc')}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {['low', 'medium', 'high', 'critical'].map((r) => <Kpi key={r} label={t(`admin.risk.${r}`)} value={flags.filter((f) => f.risk === r && f.status === 'open').length} tone={r === 'critical' || r === 'high' ? 'text-neon-red' : r === 'medium' ? 'text-neon-gold' : undefined} />)}
      </div>
      <Tabs value={tab} onChange={setTab} options={['open', 'confirmed', 'dismissed', 'all'].map((v) => ({ value: v, label: t(`admin.flagTabs.${v}`) }))} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card bodyClassName="">
          <Table
            rows={shown}
            empty={t('admin.noFlags')}
            onRow={setSelected}
            columns={[
              { key: 'at', label: t('admin.cols.time'), render: (f) => <span className="text-xs">{timeAgo(f.at)}</span> },
              { key: 'u', label: t('admin.cols.user'), render: (f) => `@${f.username}` },
              { key: 'type', label: t('admin.cols.flag'), render: (f) => t(`admin.flags.${f.type}`) },
              { key: 'risk', label: t('admin.cols.risk'), render: (f) => <Badge tone={RISK_TONE[f.risk]}>{t(`admin.risk.${f.risk}`)}</Badge> },
              { key: 'n', label: '×', align: 'right', mono: true, render: (f) => f.count ?? 1 },
              { key: 's', label: t('admin.cols.status'), render: (f) => <Badge tone={f.status === 'confirmed' ? 'red' : f.status === 'dismissed' ? 'slate' : 'gold'}>{t(`admin.flagStatus.${f.status}`)}</Badge> },
            ]}
          />
        </Card>
        <Card title={t('admin.investigation')} bodyClassName="space-y-4 p-4">
          {!sel ? (
            <p className="py-8 text-center text-sm text-slate-500"><SearchIcon className="mx-auto mb-2 h-5 w-5" />{t('admin.pickFlag')}</p>
          ) : (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  [t('admin.cols.user'), <Link key="u" to={`/admin/users/${sel.userId}`} className="text-neon-cyan">@{sel.username}</Link>],
                  [t('admin.cols.flag'), t(`admin.flags.${sel.type}`)],
                  [t('admin.cols.risk'), <Badge key="r" tone={RISK_TONE[sel.risk]}>{t(`admin.risk.${sel.risk}`)}</Badge>],
                  [t('admin.cols.game'), sel.game ?? '—'],
                  ['Session ID', <span key="s" className="font-mono text-xs">{sel.sessionId ?? '—'}</span>],
                  [t('admin.cols.time'), formatDateTime(sel.at)],
                  [t('admin.expected'), sel.expected ?? '—'],
                  [t('admin.submitted'), sel.submitted ?? '—'],
                  [t('admin.rewardGenerated'), sel.reward != null ? `${formatCoins(sel.reward)} AC` : '—'],
                  [t('admin.occurrences'), sel.count ?? 1],
                ].map(([k, v]) => (
                  <div key={k} className="min-w-0"><dt className="text-[11px] text-slate-500">{k}</dt><dd className="truncate text-slate-200">{v}</dd></div>
                ))}
              </dl>
              {session && (
                <div className="rounded-lg bg-white/[0.03] p-3 text-xs ring-1 ring-inset ring-white/[0.06]">
                  <p className="mb-1 font-semibold text-slate-300">{t('admin.evidence')}</p>
                  <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-slate-400">{JSON.stringify({ bet: session.bet, payout: session.payout, multiplier: session.multiplier, durationMs: session.durationMs, nonce: session.nonce, seedHash: session.serverSeedHash?.slice(0, 16), detail: session.detail, invalidated: session.invalidated }, null, 1)}</pre>
                </div>
              )}
              <p className="text-[11px] text-slate-500">{t('admin.metadataNote')}</p>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-slate-400">{t('admin.previousViolations', { count: previous.length })}</p>
                <ul className="max-h-28 space-y-1 overflow-y-auto text-xs text-slate-400">
                  {previous.slice(0, 8).map((f) => <li key={f.id}>{formatDateTime(f.at)} · {t(`admin.flags.${f.type}`)} · {t(`admin.flagStatus.${f.status}`)}</li>)}
                </ul>
              </div>
              {sel.reviewedBy && <p className="text-xs text-slate-500">{t('admin.reviewedBy', { admin: sel.reviewedBy, reason: sel.reviewReason })}</p>}
              {can(me.role, 'anticheat') && (
                <div className="flex flex-wrap gap-2 border-t hairline pt-3">
                  {actions.map(([status, icon, label, variant]) => <Button key={status} size="sm" variant={variant} disabled={sel.status === status} onClick={() => setDialog({ kind: 'flag', status })}>{icon} {label}</Button>)}
                  {session && !session.invalidated && can(me.role, 'sessions.invalidate') && <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'cancel' })}><ShieldX className="h-4 w-4" /> {t('admin.ac.cancelReward')}</Button>}
                  {can(me.role, 'users.freeze') && selUser && !selUser.walletFrozen && <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'walletFreeze' })}><Snowflake className="h-4 w-4" /> {t('admin.ua.walletFreeze')}</Button>}
                  {can(me.role, 'users.freeze') && selUser?.status === 'active' && <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: 'freeze' })}><Lock className="h-4 w-4" /> {t('admin.ua.freeze')}</Button>}
                  {can(me.role, 'users.ban') && selUser?.status !== 'banned' && <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'tempban' })}><Ban className="h-4 w-4" /> {t('admin.ua.tempban')}</Button>}
                  {can(me.role, 'users.freeze') && selUser?.status !== 'banned' && <Button size="sm" variant="danger" onClick={() => setDialog({ kind: 'ban' })}><Ban className="h-4 w-4" /> {t('admin.ua.ban')}</Button>}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
      {dialog && sel && (
        <ReasonDialog open onClose={() => setDialog(null)} adminName={me.username} tone={dialog.status === 'dismissed' ? 'primary' : 'danger'}
          title={dialog.kind === 'flag' ? t(`admin.flagStatus.${dialog.status}`) : dialog.kind === 'cancel' ? t('admin.ac.cancelReward') : t(`admin.ua.${dialog.kind}`)}
          description={`@${sel.username} · ${t(`admin.flags.${sel.type}`)}`}
          onConfirm={async (r) => {
            if (dialog.kind === 'flag') return admin.updateFlag(sel.userId, sel.id, dialog.status, r)
            if (dialog.kind === 'cancel') {
              await admin.invalidateSession(sel.userId, sel.sessionId, r, sel.type)
              return admin.updateFlag(sel.userId, sel.id, 'confirmed', r)
            }
            if (dialog.kind === 'walletFreeze') return admin.freezeWallet(sel.userId, true, r)
            if (dialog.kind === 'freeze') return admin.freezeAccount(sel.userId, true, r)
            if (dialog.kind === 'tempban') return admin.banUser(sel.userId, 24, r)
            if (dialog.kind === 'ban') return admin.banUser(sel.userId, null, r)
          }}>
          {dialog.kind === 'cancel' && session && <p className="text-sm text-slate-400">{t('admin.invalidateWarn', { gain: formatCoins(Math.max(0, session.payout - session.bet)) })}</p>}
          {dialog.kind === 'tempban' && <p className="text-sm text-slate-400">{t('admin.tempban24')}</p>}
        </ReasonDialog>
      )}
    </AdminPage>
  )
}
