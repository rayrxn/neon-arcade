import { useState } from 'react'
import { ArrowDown, ArrowRightLeft } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { Panel } from '@/components/ui/Controls'
import { CurrencyIcon } from '@/components/ui/Currency'
import { convertAcToAg, useCatalog, useExtras } from '@/services/platform2'
import { useDisplayBalance } from '@/store/useWalletStore'
import { toast } from '@/store/useUiStore'
import { SERVER_MODE } from '@/config/runtime'
import { errorKey } from '@/utils/errors'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

/**
 * AC → AG converter. The preview is only an estimate; the server recalculates
 * with its own rate and balance, and only whole AG are bought (unused AC stays).
 */
export default function Converter() {
  const { t } = useT()
  const { economy } = useCatalog()
  const { convertedToday, convertCap } = useExtras()
  const ac = useDisplayBalance('AC')
  const [amount, setAmount] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const rate = economy?.acPerAg ?? 25000
  const value = Number(amount) || 0
  const ag = Math.floor(value / rate)
  const cost = ag * rate
  const leftToday = Math.max(0, (convertCap ?? economy?.convertMaxAgPerDay ?? 200) - (convertedToday ?? 0))
  const problem = !value ? null : value > ac ? 'errors.insufficientAC' : ag < (economy?.convertMinAg ?? 1) ? 'convert.errors.minShort' : ag > leftToday ? 'convert.errors.dailyShort' : null

  if (!SERVER_MODE) return null

  const run = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await convertAcToAg(value)
      toast({ tone: 'success', title: t('convert.done', { ac: formatCoins(res.ac), ag: formatCoins(res.ag) }) })
      setAmount('')
      setConfirm(false)
    } catch (err) {
      setError({ code: errorKey(err), vars: err?.vars })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title={t('convert.title')} icon={ArrowRightLeft} className="scroll-mt-24" bodyClassName="p-4 sm:p-5">
      <div id="convert" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-400">{t('convert.amount')}</span>
            <span className="text-slate-500">{t('convert.yourBalance', { amount: formatCoins(ac) })}</span>
          </div>
          <div className={clsx('input-shell flex items-center gap-2 pl-3 pr-1.5', problem && '!border-neon-red/60')}>
            <CurrencyIcon currency="AC" size={18} />
            <input id="convert-amount" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/\D/g, '').slice(0, 12)); setError(null) }} placeholder={formatCoins(rate)} className="num h-11 min-w-0 flex-1 bg-transparent font-mono text-base font-bold text-white outline-none placeholder:text-slate-600" aria-label={t('convert.amount')} />
            {[['25%', 0.25], ['50%', 0.5], ['Max', 1]].map(([lbl, f]) => (
              <button key={lbl} type="button" onClick={() => setAmount(String(Math.floor((ac * f) / rate) * rate || ''))} className="h-8 rounded-lg bg-white/[0.06] px-2 text-xs font-bold text-slate-300 hover:bg-white/[0.1] hover:text-white">{lbl}</button>
            ))}
          </div>
        </div>
        <span className="mx-auto grid h-9 w-9 place-items-center rounded-full bg-white/[0.05] text-slate-400 md:mb-1"><ArrowDown className="h-4 w-4 md:-rotate-90" /></span>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-400">{t('convert.receive')}</p>
          <div className="input-shell flex h-[46px] items-center gap-2 px-3">
            <CurrencyIcon currency="AG" size={18} />
            <span className="num font-mono text-base font-bold text-white">{formatCoins(ag)}</span>
            <span className="ml-auto text-xs text-slate-500">AG</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs">
        <p className="text-slate-500">
          {t('convert.rate', { rate: formatCoins(rate) })} · {t('convert.leftToday', { n: formatCoins(leftToday) })}
          {value > cost && ag > 0 && <span className="block text-slate-400">{t('convert.remainder', { amount: formatCoins(value - cost) })}</span>}
        </p>
        <Button disabled={!ag || !!problem} onClick={() => setConfirm(true)}>{t('convert.cta')}</Button>
      </div>
      {problem && <p className="mt-2 text-xs font-semibold text-neon-red">{t(problem, { min: formatCoins(rate * (economy?.convertMinAg ?? 1)), left: leftToday })}</p>}
      {confirm && (
        <Modal
          open
          size="sm"
          onClose={() => setConfirm(false)}
          locked={busy}
          title={t('convert.confirmTitle', { ac: formatCoins(cost), ag: formatCoins(ag) })}
          icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-purple/10 text-neon-purple"><ArrowRightLeft className="h-5 w-5" /></span>}
          footer={
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setConfirm(false)} disabled={busy}>{t('common.cancel')}</Button>
              <Button variant="gem" className="flex-1" loading={busy} onClick={run}>{t('convert.confirm')}</Button>
            </>
          }
        >
          <p className="text-sm text-slate-400">{t('convert.confirmBody', { rate: formatCoins(rate) })}</p>
          {error && <p className="mt-3 rounded-xl bg-neon-red/10 px-3 py-2.5 text-sm font-semibold text-neon-red" role="alert">{t(error.code, error.vars)}</p>}
        </Modal>
      )}
    </Panel>
  )
}
