import Modal from '@/components/ui/Modal'
import { Amount } from '@/components/ui/Currency'
import { StatusPill } from '@/components/ui/Controls'
import { TX_META, txDetail } from '@/components/wallet/TransactionList'
import { categoryOf, useActiveWallet, useWalletStore } from '@/store/useWalletStore'
import { getGameName } from '@/config/games'
import { useNow } from '@/hooks/useNow'
import { formatCountdown, formatDateTime } from '@/utils/format'
import { useT } from '@/i18n'
import clsx from 'clsx'

function Row({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="shrink-0 text-sm text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-right text-sm font-semibold text-slate-200">{children}</span>
    </div>
  )
}

export default function TxDetailModal({ open, onClose, initial = {} }) {
  const { t } = useT()
  const wallet = useActiveWallet()
  const now = useNow(1000)
  // Ambil versi terbaru dari store supaya status pending → success ikut terlihat.
  const tx = wallet?.transactions.find((x) => x.id === initial.txId) ?? initial.tx
  if (!tx) return <Modal open={open} onClose={onClose} title={t('tx.detailTitle')} />

  const meta = TX_META[tx.type] ?? TX_META.bet
  const Icon = meta.icon

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={t(`tx.types.${tx.type}`)}
      description={txDetail(t, tx)}
      icon={<span className={clsx('grid h-10 w-10 place-items-center rounded-xl', meta.tone)}><Icon className="h-5 w-5" /></span>}
    >
      <div className="rounded-2xl bg-white/[0.03] py-5 text-center ring-1 ring-inset ring-white/[0.06]">
        <Amount currency={tx.currency} value={tx.amount} signed size="lg" className={clsx('justify-center', tx.amount > 0 ? 'text-neon-green' : 'text-white')} />
        <div className="mt-2"><StatusPill status={tx.status} /></div>
      </div>
      <div className="mt-4 divide-y divide-white/[0.06]">
        <Row label={t('tx.time')}>{formatDateTime(tx.at)}</Row>
        {tx.counterparty && <Row label={tx.type === 'send' ? t('send.to') : t('send.from')}>@{tx.counterparty.username}</Row>}
        {tx.note && <Row label={t('send.note')}>{tx.note}</Row>}
        {tx.status === 'pending' && tx.releaseAt && <Row label={t('tx.releasesIn')}><span className="num font-mono">{formatCountdown(tx.releaseAt - now)}</span></Row>}
        {tx.status === 'failed' && <Row label={t('tx.reason')}>{t(`send.reasons.${tx.reason ?? 'unknown'}`)}</Row>}
        {tx.status !== 'failed' && <Row label={t('tx.balanceAfter')}><Amount currency={tx.currency} value={tx.balanceAfter} size="sm" /></Row>}
        <Row label={t('tx.category')}>{t(`wallet.categories.${tx.category ?? categoryOf(tx)}`)}</Row>
        <Row label={t('tx.currency')}>{tx.currency}</Row>
        {tx.source && <Row label={t('tx.source')}>{t(`tx.sources.${tx.source}`, { defaultValue: tx.source })}</Row>}
        {tx.reason && <Row label={t('tx.reasonLabel')}>{tx.reason}</Row>}
        {tx.game && <Row label={t('tx.game')}>{getGameName(tx.game)}</Row>}
        {tx.sessionId && <Row label={t('tx.session')}><span className="font-mono text-xs">{tx.sessionId}</span></Row>}
        {tx.adminName && <Row label={t('tx.admin')}>@{tx.adminName}</Row>}
        {tx.reversalOf && <Row label={t('tx.reversalOf')}><span className="font-mono text-xs">{tx.reversalOf}</span></Row>}
        {tx.reversedBy && <Row label={t('tx.reversedBy')}><span className="font-mono text-xs text-neon-purple">{tx.reversedBy}</span></Row>}
        <Row label={t('tx.user')}><span className="font-mono text-xs">{useWalletStore.getState().activeUserId}</span></Row>
        <Row label={t('tx.id')}><span className="font-mono text-xs">{tx.id}</span></Row>
      </div>
    </Modal>
  )
}
