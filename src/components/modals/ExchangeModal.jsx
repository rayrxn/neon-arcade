import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Banknote, Building2, Loader2, Smartphone } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { CurrencyIcon } from '@/components/ui/Currency'
import { useDisplayBalance } from '@/store/useWalletStore'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

/**
 * "Exchange to Rupiah" — a joke. It walks through amount → bank / e-wallet → processing, then reveals
 * "PRANK!". Nothing is sent or stored, no account details are asked for, and balances don't change:
 * AC and AG are play money with no cash value.
 */
const METHODS = {
  bank: [
    { id: 'bca', name: 'BCA', color: '#1d4ed8' },
    { id: 'bri', name: 'BRI', color: '#0369a1' },
    { id: 'bni', name: 'BNI', color: '#ea580c' },
    { id: 'mandiri', name: 'Mandiri', color: '#ca8a04' },
  ],
  ewallet: [
    { id: 'gopay', name: 'GoPay', color: '#0ea5e9' },
    { id: 'dana', name: 'DANA', color: '#2563eb' },
    { id: 'ovo', name: 'OVO', color: '#7c3aed' },
    { id: 'shopeepay', name: 'ShopeePay', color: '#ea580c' },
  ],
}
// A totally official exchange rate.
const RATE = { AC: 0.01, AG: 150 }
const rupiah = (n) => `Rp${Math.floor(n).toLocaleString('id-ID')}`

function Confetti() {
  const bits = Array.from({ length: 28 }, (_, i) => i)
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {bits.map((i) => (
        <motion.span
          key={i}
          className="absolute top-0 block h-2 w-1.5 rounded-sm"
          style={{ left: `${(i * 37) % 100}%`, background: ['#22d3ee', '#f472b6', '#facc15', '#a78bfa', '#34d399'][i % 5] }}
          initial={{ y: -20, rotate: 0, opacity: 1 }}
          animate={{ y: 420, rotate: 360 + i * 40, opacity: 0 }}
          transition={{ duration: 1.6 + (i % 5) * 0.25, delay: (i % 7) * 0.06, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}

export default function ExchangeModal({ open, onClose, initialStep = 'amount' }) {
  const { t } = useT()
  const [step, setStep] = useState(initialStep) // amount | method | processing | prank
  const [currency, setCurrency] = useState('AC')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState(null)
  const balance = useDisplayBalance(currency)
  const value = Math.floor(Number(amount) || 0)
  const ok = value > 0 && value <= balance

  useEffect(() => {
    if (!open) return
    setStep(initialStep)
    setAmount('')
    setMethod(null)
  }, [open])

  useEffect(() => {
    if (step !== 'processing') return
    const id = setTimeout(() => {
      setStep('prank')
      play('jackpot')
    }, 2200)
    return () => clearTimeout(id)
  }, [step])

  const pickMethod = (m) => setMethod(m)
  const all = [...METHODS.bank, ...METHODS.ewallet]
  const chosen = all.find((m) => m.id === method)

  return (
    <Modal open={open} onClose={onClose} locked={step === 'processing'} title={step === 'prank' ? undefined : t('exchange.title')} icon={step === 'prank' ? undefined : <span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-green/10 text-neon-green"><Banknote className="h-5 w-5" /></span>}>
      <AnimatePresence mode="wait" initial={false}>
        {step === 'amount' && (
          <motion.div key="amount" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
            <p className="text-sm text-slate-400">{t('exchange.subtitle')}</p>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.06]">
              {['AC', 'AG'].map((c) => (
                <button key={c} type="button" onClick={() => setCurrency(c)} aria-pressed={currency === c} className={clsx('flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition', currency === c ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200')}>
                  <CurrencyIcon currency={c} size={15} /> {c}
                </button>
              ))}
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-400" htmlFor="exchange-amount">{t('exchange.amount')}</label>
            <div className="input-shell mt-1.5 flex items-center gap-2 px-3">
              <CurrencyIcon currency={currency} size={18} />
              <input id="exchange-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="0" className="num h-12 min-w-0 flex-1 bg-transparent font-mono text-lg font-bold text-white outline-none" />
              <button type="button" onClick={() => setAmount(String(Math.floor(balance)))} className="h-8 rounded-lg bg-white/[0.06] px-2.5 text-xs font-bold text-slate-300 hover:bg-white/10">Max</button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{t('exchange.balance', { amount: formatCoins(balance), currency })}</p>
            <div className="mt-4 flex items-center justify-between rounded-xl bg-neon-green/[0.06] px-4 py-3 ring-1 ring-inset ring-neon-green/20">
              <span className="text-xs font-semibold text-slate-400">{t('exchange.youGet')}</span>
              <span className="num font-mono text-xl font-bold text-neon-green">{rupiah(value * RATE[currency])}</span>
            </div>
            <Button size="lg" className="mt-5 w-full" disabled={!ok} onClick={() => setStep('method')}>{t('exchange.next')} <ArrowRight className="h-4 w-4" /></Button>
          </motion.div>
        )}

        {step === 'method' && (
          <motion.div key="method" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}>
            <button type="button" onClick={() => setStep('amount')} className="-ml-1 mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> {t('exchange.back')}</button>
            {[['bank', Building2, t('exchange.bank')], ['ewallet', Smartphone, t('exchange.ewallet')]].map(([group, Icon, label]) => (
              <div key={group} className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Icon className="h-3.5 w-3.5" /> {label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {METHODS[group].map((m) => (
                    <button key={m.id} type="button" onClick={() => pickMethod(m.id)} aria-pressed={method === m.id} className={clsx('flex h-12 items-center gap-2.5 rounded-xl px-3 text-sm font-bold text-white ring-1 ring-inset transition', method === m.id ? 'bg-white/[0.08] ring-neon-cyan/60' : 'bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.06]')}>
                      <span className="grid h-7 w-7 place-items-center rounded-lg text-[10px] font-black text-white" style={{ background: m.color }}>{m.name.slice(0, 2).toUpperCase()}</span>
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 text-sm ring-1 ring-inset ring-white/[0.06]">
              <span className="text-slate-400">{formatCoins(value)} {currency}</span>
              <span className="num font-mono font-bold text-neon-green">{rupiah(value * RATE[currency])}</span>
            </div>
            <Button size="lg" className="mt-4 w-full" disabled={!method} onClick={() => setStep('processing')}>{chosen ? t('exchange.confirmTo', { method: chosen.name }) : t('exchange.choose')}</Button>
          </motion.div>
        )}

        {step === 'processing' && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid place-items-center py-10 text-center">
            <Loader2 className="h-10 w-10 animate-spin text-neon-cyan" />
            <p className="mt-4 font-display text-lg font-bold text-white">{t('exchange.processing')}</p>
            <p className="mt-1 text-sm text-slate-400">{t('exchange.processingTo', { method: chosen?.name ?? '' })}</p>
          </motion.div>
        )}

        {step === 'prank' && (
          <motion.div key="prank" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }} className="relative overflow-hidden py-6 text-center">
            <Confetti />
            <motion.div animate={{ rotate: [0, -10, 10, -6, 6, 0] }} transition={{ duration: 0.9, delay: 0.2 }} className="text-7xl" aria-hidden="true">🤡</motion.div>
            <h2 className="prank-title mt-3 font-display text-5xl font-black tracking-tight">PRANK!</h2>
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-slate-300">{t('exchange.prankBody')}</p>
            <p className="mx-auto mt-2 max-w-xs text-xs text-slate-500">{t('exchange.prankNote')}</p>
            <Button size="lg" className="mt-6 w-full" onClick={onClose}>{t('exchange.prankOk')}</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
