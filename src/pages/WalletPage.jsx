import { useState } from 'react'
import { Clock3, History } from 'lucide-react'
import BalanceCards from '@/components/wallet/BalanceCards'
import TransactionList from '@/components/wallet/TransactionList'
import { Panel, Segmented } from '@/components/ui/Controls'
import Button from '@/components/ui/Button'
import { TX_CATEGORIES, categoryOf, useActiveWallet } from '@/store/useWalletStore'
import { openModal } from '@/store/useUiStore'
import { useT } from '@/i18n'

const FILTERS = ['all', ...TX_CATEGORIES]

export default function WalletPage() {
  const { t } = useT()
  const wallet = useActiveWallet()
  const [type, setType] = useState('all')
  const [currency, setCurrency] = useState('all')

  const all = wallet?.transactions ?? []
  const filtered = all.filter((tx) => (type === 'all' || (tx.category ?? categoryOf(tx)) === type) && (currency === 'all' || tx.currency === currency))
  const pending = all.filter((tx) => tx.status === 'pending')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">{t('wallet.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('wallet.subtitle')}</p>
      </div>

      <BalanceCards />

      {pending.length > 0 && (
        <button onClick={() => openModal('tx', { txId: pending[0].id })} className="flex w-full items-center gap-3 rounded-2xl bg-neon-gold/[0.07] px-4 py-3 text-left ring-1 ring-inset ring-neon-gold/25 transition hover:bg-neon-gold/10">
          <Clock3 className="h-5 w-5 shrink-0 text-neon-gold" />
          <span className="text-sm text-slate-200">{t('wallet.pendingBanner', { count: pending.length })}</span>
        </button>
      )}

      <Panel title={t('wallet.history')} icon={History}>
        <div className="flex flex-col gap-2 border-b hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <Segmented
              layoutId="wallet-type"
              size="sm"
              value={type}
              onChange={setType}
              className="w-max"
              options={FILTERS.map((key) => ({ value: key, label: key === 'all' ? t('common.all') : t(`wallet.categories.${key}`) }))}
            />
          </div>
          <Segmented
            layoutId="wallet-currency"
            size="sm"
            value={currency}
            onChange={setCurrency}
            className="w-max self-start"
            options={[{ value: 'all', label: t('common.all') }, { value: 'AC', label: 'AC' }, { value: 'AG', label: 'AG' }]}
          />
        </div>
        <TransactionList
          transactions={filtered}
          onSelect={(tx) => openModal('tx', { txId: tx.id })}
          emptyAction={type === 'all' && currency === 'all' ? <Button size="sm" onClick={() => openModal('send')}>{t('wallet.actions.send')}</Button> : null}
        />
      </Panel>
    </div>
  )
}
