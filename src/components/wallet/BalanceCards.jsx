import { ArrowDownLeft, Banknote, Plus, Send, Ticket } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'
import { Amount, CurrencyIcon } from '@/components/ui/Currency'
import { useActiveWallet, useDisplayBalance } from '@/store/useWalletStore'
import { openModal } from '@/store/useUiStore'
import { useT } from '@/i18n'

function BalanceCard({ currency, value }) {
  const { t } = useT()
  const isAG = currency === 'AG'
  return (
    <div className={clsx('relative overflow-hidden rounded-2xl p-4 ring-1 ring-inset sm:p-5', isAG ? 'bg-gem/[0.06] ring-gem/20' : 'bg-neon-gold/[0.05] ring-neon-gold/20')}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-400">{t(`currency.${currency}.name`)}</p>
        <span className={clsx('rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold', isAG ? 'bg-gem/15 text-gem' : 'bg-neon-gold/15 text-neon-gold')}>{currency}</span>
      </div>
      <Amount currency={currency} value={value} animated size="xl" iconSize={30} className="mt-3 text-white" />
      <p className="mt-2 text-xs text-slate-500">{t(`currency.${currency}.hint`)}</p>
      <span className="pointer-events-none absolute -bottom-6 -right-5 opacity-[0.07]" aria-hidden>
        <CurrencyIcon currency={currency} size={96} />
      </span>
    </div>
  )
}

/** Dua saldo terpisah + aksi cepat. Dipakai di Home dan Wallet. */
export default function BalanceCards({ showActions = true, showExchange = false }) {
  const { t } = useT()
  const wallet = useActiveWallet()
  const ac = useDisplayBalance('AC')
  const ag = useDisplayBalance('AG')
  const navigate = useNavigate()

  const actions = [
    { key: 'send', icon: Send, label: t('wallet.actions.send'), onClick: () => openModal('send'), tone: 'text-neon-cyan' },
    { key: 'receive', icon: ArrowDownLeft, label: t('wallet.actions.receive'), onClick: () => openModal('receive'), tone: 'text-neon-green' },
    { key: 'topup', icon: Plus, label: t('wallet.actions.topup'), onClick: () => openModal('topup'), tone: 'text-gem' },
    { key: 'redeem', icon: Ticket, label: t('wallet.actions.redeem'), onClick: () => navigate('/redeem'), tone: 'text-neon-purple' },
    ...(showExchange ? [{ key: 'exchange', icon: Banknote, label: t('exchange.action'), onClick: () => openModal('exchange'), tone: 'text-neon-green' }] : []),
  ]

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <BalanceCard currency="AC" value={ac} />
        <BalanceCard currency="AG" value={ag} />
      </div>
      {showActions && (
        <div className={clsx('grid gap-2', actions.length > 4 ? 'grid-cols-5' : 'grid-cols-4')}>
          {actions.map(({ key, icon: Icon, label, onClick, tone }) => (
            <button key={key} onClick={onClick} className="glass flex flex-col items-center gap-1.5 rounded-xl px-1 py-3 text-xs font-bold text-slate-300 transition hover:border-white/15 hover:text-white sm:flex-row sm:justify-center sm:gap-2 sm:py-3.5 sm:text-sm focus-ring">
              <Icon className={clsx('h-[18px] w-[18px]', tone)} />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
