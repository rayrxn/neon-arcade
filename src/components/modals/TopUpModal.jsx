import { useEffect, useState } from 'react'
import { CreditCard, Info, PlugZap } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Amount } from '@/components/ui/Currency'
import { Segmented } from '@/components/ui/Controls'
import { TOP_UP_PACKAGES } from '@/config/economy'
import { formatRupiah, PAYMENTS_ENABLED, startCheckout } from '@/services/payments'
import { currentLocale } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

/**
 * Top Up — UI lengkap, pembayaran BELUM terhubung (lihat services/payments.js).
 * Status itu ditampilkan jelas di modal, bukan disembunyikan.
 */
export default function TopUpModal({ open, onClose, initial = {} }) {
  const { t } = useT()
  const [currency, setCurrency] = useState(initial.currency ?? 'AG')
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setCurrency(initial.currency ?? 'AG')
    setSelected(null)
    setError(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const packages = TOP_UP_PACKAGES.filter((p) => p.currency === currency)
  const pkg = TOP_UP_PACKAGES.find((p) => p.id === selected)

  const checkout = async () => {
    setBusy(true)
    setError(null)
    try {
      await startCheckout(pkg)
    } catch (err) {
      setError(errorKey(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={busy}
      title={t('topup.title')}
      description={t('topup.description')}
      icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-gem/10 text-gem"><CreditCard className="h-5 w-5" /></span>}
    >
      {!PAYMENTS_ENABLED && (
        <div className="mb-4 flex gap-2.5 rounded-xl bg-neon-gold/[0.08] px-3.5 py-3 ring-1 ring-inset ring-neon-gold/20">
          <PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-neon-gold" />
          <p className="text-xs leading-relaxed text-slate-300">{t('topup.notConnectedBanner')}</p>
        </div>
      )}

      <Segmented
        layoutId="topup-currency"
        value={currency}
        onChange={(c) => { setCurrency(c); setSelected(null) }}
        options={[
          { value: 'AG', label: t('currency.AG.name') },
          { value: 'AC', label: t('currency.AC.name') },
        ]}
      />

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {packages.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p.id)}
            className={clsx(
              'flex items-center justify-between gap-3 rounded-xl p-3.5 text-left ring-1 ring-inset transition sm:flex-col sm:items-start focus-ring',
              selected === p.id ? (currency === 'AG' ? 'bg-gem/10 ring-gem/55' : 'bg-neon-gold/10 ring-neon-gold/55') : 'bg-white/[0.03] ring-white/[0.08] hover:ring-white/20',
            )}
          >
            <span className="flex flex-wrap items-center gap-2">
              <Amount currency={p.currency} value={p.amount} size="md" className="text-white" />
              {p.tag && <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-300">{t(`topup.tags.${p.tag}`)}</span>}
            </span>
            <span className="text-sm font-semibold text-slate-400">{formatRupiah(p.price, currentLocale())}</span>
          </button>
        ))}
      </div>

      {pkg && (
        <div className="mt-4 rounded-xl bg-white/[0.03] p-3.5 ring-1 ring-inset ring-white/[0.06]">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">{t('topup.youGet')}</span>
            <Amount currency={pkg.currency} value={pkg.amount} size="sm" className="text-white" />
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-slate-500">{t('topup.total')}</span>
            <span className="font-bold text-white">{formatRupiah(pkg.price, currentLocale())}</span>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-4 flex gap-2 rounded-xl bg-neon-red/10 px-3.5 py-3 text-sm font-semibold text-neon-red" role="alert">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> {t(error)}
        </p>
      )}

      <Button variant={currency === 'AG' ? 'gem' : 'gold'} size="lg" className="mt-5 w-full" disabled={!pkg} loading={busy} onClick={checkout}>
        {t('topup.continue')}
      </Button>
    </Modal>
  )
}
