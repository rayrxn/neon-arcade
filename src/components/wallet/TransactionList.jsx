import { ShieldCheck, ArrowDownLeft, ArrowRightLeft, CreditCard, Gamepad2, Gift, History, RotateCcw, Send, ShoppingBag, Sparkles, Ticket, Trophy, Undo2 } from 'lucide-react'
import clsx from 'clsx'
import { Amount } from '@/components/ui/Currency'
import { EmptyState } from '@/components/ui/Controls'
import { getGameName } from '@/config/games'
import { useNow } from '@/hooks/useNow'
import { dayKey, formatDate, formatTime } from '@/utils/format'
import { useT } from '@/i18n'

export const TX_META = {
  grant: { icon: Sparkles, tone: 'text-neon-gold bg-neon-gold/10' },
  bonus: { icon: Gift, tone: 'text-neon-gold bg-neon-gold/10' },
  bet: { icon: Gamepad2, tone: 'text-slate-300 bg-white/[0.06]' },
  win: { icon: Trophy, tone: 'text-neon-green bg-neon-green/10' },
  refund: { icon: RotateCcw, tone: 'text-neon-cyan bg-neon-cyan/10' },
  send: { icon: Send, tone: 'text-neon-cyan bg-neon-cyan/10' },
  receive: { icon: ArrowDownLeft, tone: 'text-neon-green bg-neon-green/10' },
  topup: { icon: CreditCard, tone: 'text-gem bg-gem/10' },
  redeem: { icon: Ticket, tone: 'text-neon-purple bg-neon-purple/10' },
  reward: { icon: Gift, tone: 'text-neon-gold bg-neon-gold/10' },
  adjust: { icon: ShieldCheck, tone: 'text-slate-300 bg-white/[0.06]' },
  reversal: { icon: Undo2, tone: 'text-neon-purple bg-neon-purple/10' },
  purchase: { icon: ShoppingBag, tone: 'text-neon-purple bg-neon-purple/10' },
  convert: { icon: ArrowRightLeft, tone: 'text-neon-cyan bg-neon-cyan/10' },
}

/** Keterangan kedua baris transaksi (user terkait / game / kode). */
export function txDetail(t, tx) {
  if (tx.type === 'send') return t('tx.toUser', { user: `@${tx.counterparty?.username ?? '—'}` })
  if (tx.type === 'receive') return t('tx.fromUser', { user: `@${tx.counterparty?.username ?? '—'}` })
  if (tx.type === 'redeem') return t('tx.code', { code: tx.code })
  if (tx.type === 'grant') return t('tx.signupGift')
  if (tx.type === 'bonus') return t('tx.dailyBonus')
  if (tx.type === 'adjust') return t(tx.reference?.startsWith('fairness') ? 'tx.fairness' : 'tx.adminAdjust')
  if (tx.type === 'reward') return t(`tx.rewardSource.${tx.source ?? 'daily'}`)
  if (tx.type === 'reversal') return t('tx.reversalDetail', { id: tx.reversalOf ?? '—' })
  if (tx.type === 'purchase' || tx.type === 'convert') return tx.reason ?? t('tx.platform')
  if (tx.game) return getGameName(tx.game)
  return t('tx.platform')
}

function dayLabel(t, ts, now) {
  const key = dayKey(ts)
  if (key === dayKey(now)) return t('common.today')
  if (key === dayKey(now - 86_400_000)) return t('common.yesterday')
  return formatDate(ts, { weekday: 'long', day: 'numeric', month: 'long' })
}

const STATUS_TEXT = {
  success: { dot: 'bg-neon-green', text: 'text-slate-500' },
  pending: { dot: 'bg-neon-gold', text: 'text-neon-gold' },
  failed: { dot: 'bg-neon-red', text: 'text-neon-red' },
}

/** Status ringkas di bawah jumlah — tampil di setiap baris riwayat. */
function StatusText({ status }) {
  const { t } = useT()
  const s = STATUS_TEXT[status] ?? STATUS_TEXT.success
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-[11px] font-semibold', s.text)}>
      <span className={clsx('h-1.5 w-1.5 rounded-full', s.dot)} aria-hidden />
      {t(`status.${status ?? 'success'}`)}
    </span>
  )
}

export function TransactionRow({ tx, onSelect, compact }) {
  const { t } = useT()
  const meta = TX_META[tx.type] ?? TX_META.bet
  const Icon = meta.icon
  const dim = tx.status === 'failed'

  return (
    <li>
      <button
        onClick={onSelect ? () => onSelect(tx) : undefined}
        disabled={!onSelect}
        className={clsx('flex w-full items-center gap-3 px-4 py-3 text-left transition sm:px-5', onSelect && 'hover:bg-white/[0.03] focus-ring')}
      >
        <span className={clsx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', meta.tone)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-slate-200">{t(`tx.types.${tx.type}`)}</span>
          <span className="mt-0.5 block truncate text-xs text-slate-500">
            {txDetail(t, tx)} · {formatTime(tx.at)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <span className={clsx(dim && 'opacity-50 line-through decoration-slate-500')}>
            <Amount
              currency={tx.currency}
              value={tx.amount}
              signed
              size="sm"
              iconSize={compact ? 13 : 15}
              tone={tx.amount > 0 ? 'text-neon-green' : 'text-slate-200'}
            />
          </span>
          <StatusText status={tx.status} />
        </span>
      </button>
    </li>
  )
}

/** Riwayat dikelompokkan per hari — lebih mudah dibaca daripada tabel padat. */
export default function TransactionList({ transactions, onSelect, limit, grouped = true, emptyAction }) {
  const { t } = useT()
  const now = useNow(60_000)
  const items = limit ? transactions.slice(0, limit) : transactions

  if (items.length === 0) return <EmptyState icon={History} title={t('tx.empty')} body={t('tx.emptyBody')} action={emptyAction} />

  if (!grouped) {
    return (
      <ul className="divide-y divide-white/[0.05]">
        {items.map((tx) => <TransactionRow key={tx.id} tx={tx} onSelect={onSelect} compact />)}
      </ul>
    )
  }

  const groups = []
  for (const tx of items) {
    const key = dayKey(tx.at)
    if (groups[groups.length - 1]?.key !== key) groups.push({ key, at: tx.at, items: [] })
    groups[groups.length - 1].items.push(tx)
  }

  return (
    <div>
      {groups.map((group) => (
        <div key={group.key}>
          <p className="label-caps bg-white/[0.02] px-4 py-2 sm:px-5">{dayLabel(t, group.at, now)}</p>
          <ul className="divide-y divide-white/[0.05]">
            {group.items.map((tx) => <TransactionRow key={tx.id} tx={tx} onSelect={onSelect} />)}
          </ul>
        </div>
      ))}
    </div>
  )
}
