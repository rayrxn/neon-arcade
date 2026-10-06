import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Award, History, LogOut, Milestone, Package, Pencil, Settings, Ticket } from 'lucide-react'
import { Link } from 'react-router-dom'
import { AchievementGrid, LevelBar } from '@/components/progress/ProgressKit'
import { useProgress } from '@/store/useProgressStore'
import Avatar from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { Amount } from '@/components/ui/Currency'
import { EmptyState, Panel, Segmented } from '@/components/ui/Controls'
import TransactionList from '@/components/wallet/TransactionList'
import { rewardsText } from '@/components/notifications/describe'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useActiveWallet } from '@/store/useWalletStore'
import { openModal } from '@/store/useUiStore'
import { LEVEL_MILESTONES, levelFromXp } from '@/config/progression'
import { ProfileDetails, ProfileHero } from '@/components/profile/ProfileSummary'
import { usePlatformStore } from '@/store/usePlatformStore'
import { profileSteps } from '@/services/cosmetics'
import clsx from 'clsx'
import { formatCoins, formatDate, formatDateTime } from '@/utils/format'
import { pick, useT } from '@/i18n'

const NONE = []

export default function ProfilePage() {
  const { t, lang } = useT()
  const user = useCurrentUser()
  const wallet = useActiveWallet()
  const logout = useAuthStore((s) => s.logout)
  const navigate = useNavigate()
  const [tab, setTab] = useState('tx')
  const [confirm, setConfirm] = useState(false)
  const progress = useProgress(user?.id)

  const favorites = usePlatformStore((s) => (user ? s.favorites[user.id] : null)) ?? NONE
  if (!user || !wallet) return null
  const lv = levelFromXp(progress.xp).level
  const steps = profileSteps(user)
  const nextMilestones = LEVEL_MILESTONES.map((m) => ({ ...m, next: Math.ceil((lv + 1) / m.every) * m.every }))

  return (
    <div className="space-y-6">
      <ProfileHero
        user={user}
        progress={progress}
        actions={
          <>
            <Button size="sm" onClick={() => openModal('editProfile')}><Pencil className="h-4 w-4" /> {t('profile.edit')}</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/inventory')}><Package className="h-4 w-4" /> {t('nav.inventory')}</Button>
            <Button size="sm" variant="ghost" onClick={() => navigate('/settings')} aria-label={t('nav.settings')}><Settings className="h-4 w-4" /></Button>
            <Button size="sm" variant="danger" onClick={() => setConfirm(true)}><LogOut className="h-4 w-4" /> {t('common.logout')}</Button>
          </>
        }
      />

      {!steps.every((x) => x.done) && (
        <div className="glass flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white">{t('profile.complete.heading')}</p>
            <p className="text-xs text-slate-500">{t('profile.complete.body')}</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {steps.map((x) => (
              <span key={x.id} className={clsx('rounded-lg px-2 py-1 text-[11px] font-bold ring-1 ring-inset', x.done ? 'bg-neon-green/10 text-neon-green ring-neon-green/25' : 'text-slate-400 ring-white/10')}>
                {x.done ? '✓ ' : ''}{t(`profile.complete.${x.id}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="glass flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5">
          <span className="text-sm font-semibold text-slate-400">{t('currency.AC.name')}</span>
          <Amount currency="AC" value={wallet.balance} animated size="lg" className="text-white" />
        </div>
        <div className="glass flex items-center justify-between rounded-2xl px-4 py-4 sm:px-5">
          <span className="text-sm font-semibold text-slate-400">{t('currency.AG.name')}</span>
          <Amount currency="AG" value={wallet.gems} animated size="lg" className="text-white" />
        </div>
      </div>

      <LevelBar />

      <ProfileDetails user={user} progress={progress} favorites={favorites} />

      <Panel title={t('profile.milestones')} icon={Milestone}>
        <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          {nextMilestones.map((m) => (
            <div key={m.type} className="rounded-xl bg-white/[0.03] px-4 py-3 ring-1 ring-inset ring-white/[0.06]">
              <p className="text-xs text-slate-500">{t('profile.milestoneEvery', { n: m.every })}</p>
              <p className="mt-1 text-sm font-bold text-white">{formatCoins(m.reward.amount)} {m.reward.kind} · {t('profile.milestoneNext', { level: m.next })}</p>
            </div>
          ))}
        </div>
        {Object.keys(progress.milestones).length > 0 && (
          <ul className="divide-y divide-white/[0.05] border-t hairline">
            {Object.entries(progress.milestones).sort((a, b) => b[1].claimedAt - a[1].claimedAt).map(([key, m]) => (
              <li key={key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span className="text-slate-300">{t('profile.milestoneClaimed', { level: m.level })}</span>
                <span className="text-right text-xs text-slate-500">+{formatCoins(m.reward?.amount ?? 0)} {m.reward?.kind} · {formatDateTime(m.claimedAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {progress.levelHistory.length > 0 && (
          <div className="border-t hairline px-4 py-3 text-xs text-slate-500 sm:px-5">
            {t('profile.levelHistory')}: {progress.levelHistory.slice(0, 6).map((h) => `Lv ${h.level} (${formatDate(h.at)})`).join(' · ')}
          </div>
        )}
      </Panel>

      <Panel title={t('rewards.achievementsTitle')} icon={Award} action={<Link to="/rewards" className="text-xs font-semibold text-slate-400 hover:text-white">{t('common.viewAll')}</Link>} bodyClassName="p-4 sm:p-5">
        <AchievementGrid limit={4} />
      </Panel>

      <Panel
        title={tab === 'tx' ? t('wallet.history') : t('redeem.history')}
        icon={tab === 'tx' ? History : Ticket}
        action={
          <Segmented
            layoutId="profile-tab"
            size="sm"
            value={tab}
            onChange={setTab}
            options={[{ value: 'tx', label: t('profile.tabs.tx') }, { value: 'redeem', label: t('profile.tabs.redeem') }]}
          />
        }
      >
        {tab === 'tx' ? (
          <TransactionList transactions={wallet.transactions} limit={8} grouped={false} onSelect={(tx) => openModal('tx', { txId: tx.id })} />
        ) : wallet.redeemed?.length ? (
          <ul className="divide-y divide-white/[0.05]">
            {wallet.redeemed.map((r) => (
              <li key={`${r.code}-${r.at}`} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold tracking-wider text-white">{r.code}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(r.at)}</p>
                </div>
                <p className="text-right text-sm font-semibold text-neon-green">+{rewardsText(r.rewards, lang)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Ticket} title={t('redeem.historyEmpty')} action={<Button size="sm" variant="ghost" onClick={() => navigate('/redeem')}>{t('nav.redeem')}</Button>} />
        )}
      </Panel>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('logout.title')}
        body={t('logout.body')}
        confirmLabel={t('common.logout')}
        onConfirm={async () => {
          await logout()
          navigate('/auth', { replace: true })
        }}
      />
    </div>
  )
}
