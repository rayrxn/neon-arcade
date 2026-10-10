import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Flag, History, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { EmptyState, Panel, Segmented } from '@/components/ui/Controls'
import { PageHeader, QueryView, useQuery } from '@/components/ui/PageKit'
import ReportDialog from '@/components/social/ReportDialog'
import { Amount } from '@/components/ui/Currency'
import { useCurrentUser } from '@/store/useAuthStore'
import { useProgress } from '@/store/useProgressStore'
import { GAMES, getGameName } from '@/config/games'
import { formatCoins, formatDateTime, shortHash } from '@/utils/format'
import { useT } from '@/i18n'
import PnlChart from '@/components/stats/PnlChart'
import ActivityPanel from '@/components/stats/ActivityPanel'

export const SESSION_TONE = {
  WON: 'bg-neon-green/10 text-neon-green',
  LOST: 'bg-neon-red/10 text-neon-red',
  DRAW: 'bg-white/[0.06] text-slate-300',
  CANCELLED: 'bg-neon-gold/10 text-neon-gold',
  INVALID: 'bg-neon-red/15 text-neon-red ring-1 ring-inset ring-neon-red/30',
}
const STATUSES = ['all', 'WON', 'LOST', 'DRAW', 'CANCELLED', 'INVALID']
const statusOf = (s) => s.status ?? (s.result === 'win' ? 'WON' : s.result === 'push' ? 'DRAW' : 'LOST')

export function SessionStatus({ session }) {
  const { t } = useT()
  const st = statusOf(session)
  return <span className={clsx('inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider', SESSION_TONE[st])}>{t(`history.status.${st}`)}</span>
}

function Row({ label, children, mono }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className={clsx('min-w-0 break-all text-right text-sm text-slate-200', mono && 'font-mono text-xs')}>{children}</dd>
    </div>
  )
}

export function SessionDetail({ session, onClose, onReport }) {
  const { t } = useT()
  if (!session) return null
  const net = session.payout - session.bet
  return (
    <Modal open={!!session} onClose={onClose} icon={History} title={`${getGameName(session.game)} · ${t('history.session')}`} description={formatDateTime(session.at)}
      footer={onReport && <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onReport}><Flag className="h-4 w-4" /> {t('history.reportIssue')}</Button></div>}>
      <dl className="divide-y divide-white/[0.05]">
        <Row label={t('history.status.label')}><SessionStatus session={session} /></Row>
        <Row label={t('history.sessionId')} mono>{session.id}</Row>
        <Row label={t('history.bet')}><Amount currency="AC" value={-session.bet} signed size="sm" /></Row>
        <Row label={t('history.payout')}><Amount currency="AC" value={session.payout} size="sm" /></Row>
        <Row label={t('history.net')}><span className={net > 0 ? 'text-neon-green' : net < 0 ? 'text-neon-red' : ''}>{net > 0 ? '+' : ''}{formatCoins(net)} AC</span></Row>
        <Row label={t('history.multiplier')}>{(session.multiplier ?? 0).toFixed(2)}×</Row>
        <Row label={t('history.xp')}>{session.isTest ? '—' : `+${session.xp ?? 0} XP`}</Row>
        <Row label={t('history.duration')}>{session.durationMs != null ? `${(session.durationMs / 1000).toFixed(1)} s` : '—'}</Row>
        <Row label={t('history.verification')}>
          <span className={clsx('inline-flex items-center gap-1 text-xs font-bold', session.verification === 'rejected' ? 'text-neon-red' : 'text-neon-green')}>
            <ShieldCheck className="h-3.5 w-3.5" /> {t(`history.verify.${session.verification ?? 'verified'}`)}
          </span>
        </Row>
        <Row label={t('history.seedHash')} mono>{session.serverSeedHash ? shortHash(session.serverSeedHash, 14, 10) : '—'}</Row>
        <Row label="Nonce" mono>{session.nonce ?? '—'}</Row>
        <Row label={t('history.betTx')} mono>{session.betTxId ?? '—'}</Row>
        <Row label={t('history.payoutTx')} mono>{session.payoutTxId ?? '—'}</Row>
        {session.isTest && <Row label={t('history.mode')}><span className="rounded bg-neon-gold/15 px-1.5 py-0.5 text-[10px] font-extrabold text-neon-gold">TEST</span></Row>}
        {session.invalidated && (
          <Row label={t('history.invalidated')}>
            <span className="text-xs text-neon-red">{t('history.invalidatedBody', { admin: session.invalidated.admin, amount: formatCoins(session.invalidated.removed ?? 0) })}</span>
          </Row>
        )}
      </dl>
    </Modal>
  )
}

export default function HistoryPage() {
  const { t } = useT()
  const user = useCurrentUser()
  const progress = useProgress(user?.id)
  const { id } = useParams()
  const navigate = useNavigate()
  const [game, setGame] = useState('all')
  const [status, setStatus] = useState('all')
  const [report, setReport] = useState(null)

  const query = useQuery(() => progress.sessions, [progress.sessions])
  const list = useMemo(
    () => (query.data ?? []).filter((s) => (game === 'all' || s.game === game) && (status === 'all' || statusOf(s) === status)),
    [query.data, game, status],
  )
  const selected = id ? (query.data ?? []).find((s) => s.id === id) : null
  const totals = useMemo(() => {
    const real = (query.data ?? []).filter((s) => !s.isTest)
    return { games: real.length, wagered: real.reduce((a, s) => a + s.bet, 0), won: real.reduce((a, s) => a + s.payout, 0), wins: real.filter((s) => statusOf(s) === 'WON').length }
  }, [query.data])

  return (
    <div className="space-y-6">
      <PageHeader title={t('history.title')} subtitle={t('history.subtitle')} />
      <PnlChart />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          [t('history.kpi.games'), formatCoins(totals.games)],
          [t('history.kpi.wins'), formatCoins(totals.wins)],
          [t('history.kpi.wagered'), `${formatCoins(totals.wagered)} AC`],
          [t('history.kpi.returned'), `${formatCoins(totals.won)} AC`],
        ].map(([label, value]) => (
          <div key={label} className="glass rounded-2xl px-4 py-3">
            <p className="label-caps">{label}</p>
            <p className="mt-1 font-display text-lg font-bold text-white num">{value}</p>
          </div>
        ))}
      </div>
      <Panel
        title={t('history.sessions')}
        icon={History}
        action={
          <select aria-label={t('history.filterGame')} value={game} onChange={(e) => setGame(e.target.value)} className="input-shell h-8 max-w-[150px] px-2 text-xs text-white outline-none">
            <option value="all">{t('history.allGames')}</option>
            {GAMES.filter((g) => g.load).map((g) => <option key={g.slug} value={g.slug}>{g.name}</option>)}
          </select>
        }
      >
        <div className="overflow-x-auto border-b hairline px-3 py-2.5 scrollbar-none sm:px-4">
          <Segmented size="sm" layoutId="hist-status" value={status} onChange={setStatus} className="w-max" options={STATUSES.map((s) => ({ value: s, label: s === 'all' ? t('common.all') : t(`history.status.${s}`) }))} />
        </div>
        <QueryView query={{ ...query, data: query.data && list }} rows={5} empty={<EmptyState icon={History} title={t('history.empty')} body={t('history.emptyBody')} />}>
          {(rows) => (
            <ul className="divide-y divide-white/[0.05]">
              {rows.map((s) => (
                <li key={s.id}>
                  <button onClick={() => navigate(`/history/${s.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] focus-ring sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-200">
                        {getGameName(s.game)} <SessionStatus session={s} />
                        {s.isTest && <span className="rounded bg-neon-gold/15 px-1 text-[9px] font-extrabold text-neon-gold">TEST</span>}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{formatDateTime(s.at)} · {(s.multiplier ?? 0).toFixed(2)}× · <span className="font-mono">{s.id}</span></p>
                    </div>
                    <div className="text-right">
                      <p className={clsx('text-sm font-bold num', s.payout - s.bet > 0 ? 'text-neon-green' : s.payout - s.bet < 0 ? 'text-slate-400' : 'text-slate-300')}>
                        {s.payout - s.bet > 0 ? '+' : ''}{formatCoins(s.payout - s.bet)}
                      </p>
                      <p className="text-[11px] text-slate-500">{t('history.betShort', { amount: formatCoins(s.bet) })}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </Panel>
      <ActivityPanel />
      <SessionDetail session={selected} onClose={() => navigate('/history')} onReport={() => setReport(selected)} />
      <ReportDialog open={!!report} onClose={() => setReport(null)} preset={{ targetType: 'technical', sessionId: report?.id, reason: 'bug' }} />
    </div>
  )
}
