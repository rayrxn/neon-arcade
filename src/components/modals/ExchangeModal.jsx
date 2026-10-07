import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, ArrowRight, Banknote, Building2, Check, Loader2, Lock, Smartphone } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { CurrencyIcon } from '@/components/ui/Currency'
import { useDisplayBalance } from '@/store/useWalletStore'
import { play } from '@/services/sound'
import { formatCoins } from '@/utils/format'
import { useT } from '@/i18n'

/**
 * "Exchange to Rupiah" — a prank that looks like a real withdrawal:
 * amount → bank / e-wallet → account details → confirm → processing → "PRANK!".
 * The account number and name live only in this component's state: never sent, never stored,
 * and wiped the moment the prank is revealed. Balances don't change — AC and AG have no cash value.
 */
const METHODS = {
  bank: [
    { id: 'bca', name: 'BCA', color: '#1d4ed8', digits: [10, 10] },
    { id: 'bri', name: 'BRI', color: '#0369a1', digits: [15, 15] },
    { id: 'bni', name: 'BNI', color: '#ea580c', digits: [10, 10] },
    { id: 'mandiri', name: 'Mandiri', color: '#ca8a04', digits: [13, 13] },
  ],
  ewallet: [
    { id: 'gopay', name: 'GoPay', color: '#0ea5e9', phone: true },
    { id: 'dana', name: 'DANA', color: '#2563eb', phone: true },
    { id: 'ovo', name: 'OVO', color: '#7c3aed', phone: true },
    { id: 'shopeepay', name: 'ShopeePay', color: '#ea580c', phone: true },
  ],
}
const ALL = [...METHODS.bank, ...METHODS.ewallet]
// "Official" rates: 1 AG = Rp1.000, 100 AC = Rp1.
const RATE = { AC: 0.01, AG: 1000 }
const FEE = 2500
const MIN_RP = 10000
const rupiah = (n) => `Rp${Math.max(0, Math.floor(n)).toLocaleString('id-ID')}`
const STAGES = ['verify', 'check', 'send']

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

function BackLink({ onClick }) {
  const { t } = useT()
  return <button type="button" onClick={onClick} className="-ml-1 mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> {t('exchange.back')}</button>
}

const slide = { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 } }

export default function ExchangeModal({ open, onClose, initialStep = 'amount' }) {
  const { t } = useT()
  const [step, setStep] = useState(initialStep) // amount | method | details | confirm | processing | prank
  const [currency, setCurrency] = useState('AG')
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState(null)
  const [account, setAccount] = useState('')
  const [holder, setHolder] = useState('')
  const [touched, setTouched] = useState(false)
  const [stage, setStage] = useState(0)
  const balance = useDisplayBalance(currency)
  const value = Math.floor(Number(amount) || 0)
  const gross = value * RATE[currency]
  const net = gross - FEE
  const chosen = ALL.find((m) => m.id === method)

  const amountError = value > balance ? t('exchange.errors.balance') : value > 0 && gross < MIN_RP ? t('exchange.errors.min', { min: rupiah(MIN_RP) }) : null
  const amountOk = value > 0 && !amountError
  const digits = account.replace(/\D/g, '')
  const accountError = !chosen ? null
    : chosen.phone ? (!/^08\d{8,11}$/.test(digits) ? t('exchange.errors.phone') : null)
    : (digits.length < chosen.digits[0] || digits.length > chosen.digits[1] ? t('exchange.errors.account', { bank: chosen.name, n: chosen.digits[0] }) : null)
  const holderError = holder.trim().length < 3 ? t('exchange.errors.holder') : null
  const detailsOk = !accountError && !holderError

  const wipe = () => {
    setAccount('')
    setHolder('')
  }

  useEffect(() => {
    if (!open) return
    setStep(initialStep)
    setAmount('')
    setMethod(null)
    setTouched(false)
    setStage(0)
    wipe()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Processing walks through three believable stages, then the reveal.
  useEffect(() => {
    if (step !== 'processing') return
    setStage(0)
    const timers = [
      setTimeout(() => setStage(1), 1300),
      setTimeout(() => setStage(2), 2600),
      setTimeout(() => {
        wipe() // the details are gone before the reveal is even on screen
        setStep('prank')
        play('jackpot')
      }, 4000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [step])

  const masked = digits.length > 4 ? `${'•'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}` : digits

  return (
    <Modal open={open} onClose={() => { wipe(); onClose() }} locked={step === 'processing'} title={step === 'prank' ? undefined : t('exchange.title')} icon={step === 'prank' ? undefined : <span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-green/10 text-neon-green"><Banknote className="h-5 w-5" /></span>}>
      <AnimatePresence mode="wait" initial={false}>
        {step === 'amount' && (
          <motion.div key="amount" {...slide}>
            <p className="text-sm text-slate-400">{t('exchange.subtitle')}</p>
            <div className="mt-4 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/[0.06]">
              {['AG', 'AC'].map((c) => (
                <button key={c} type="button" onClick={() => setCurrency(c)} aria-pressed={currency === c} className={clsx('flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-bold transition', currency === c ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200')}>
                  <CurrencyIcon currency={c} size={15} /> {c}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] font-semibold text-slate-500">{currency === 'AG' ? t('exchange.rateAg') : t('exchange.rateAc')}</p>
            <label className="mt-3 block text-xs font-semibold text-slate-400" htmlFor="exchange-amount">{t('exchange.amount')}</label>
            <div className={clsx('input-shell mt-1.5 flex items-center gap-2 px-3', amountError && '!border-neon-red/60')}>
              <CurrencyIcon currency={currency} size={18} />
              <input id="exchange-amount" inputMode="numeric" autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 15))} placeholder="0" className="num h-12 min-w-0 flex-1 bg-transparent font-mono text-lg font-bold text-white outline-none" />
              <button type="button" onClick={() => setAmount(String(Math.floor(balance)))} className="h-8 rounded-lg bg-white/[0.06] px-2.5 text-xs font-bold text-slate-300 hover:bg-white/10">Max</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(currency === 'AG' ? [10, 50, 100, 500] : [1_000_000, 5_000_000, 10_000_000]).map((q) => (
                <button key={q} type="button" onClick={() => setAmount(String(q))} className="h-7 rounded-lg bg-white/[0.05] px-2.5 font-mono text-[11px] font-bold text-slate-300 hover:bg-white/10">{formatCoins(q)}</button>
              ))}
            </div>
            <p className={clsx('mt-1.5 text-xs', amountError ? 'font-semibold text-neon-red' : 'text-slate-500')}>{amountError ?? t('exchange.balance', { amount: formatCoins(balance), currency })}</p>
            <dl className="mt-4 space-y-1.5 rounded-xl bg-neon-green/[0.06] px-4 py-3 text-sm ring-1 ring-inset ring-neon-green/20">
              <div className="flex justify-between text-slate-400"><dt>{t('exchange.gross')}</dt><dd className="num font-mono">{rupiah(gross)}</dd></div>
              <div className="flex justify-between text-slate-400"><dt>{t('exchange.fee')}</dt><dd className="num font-mono">−{rupiah(value > 0 ? FEE : 0)}</dd></div>
              <div className="flex items-baseline justify-between border-t border-white/5 pt-1.5"><dt className="text-xs font-semibold text-slate-300">{t('exchange.youGet')}</dt><dd className="num font-mono text-xl font-bold text-neon-green">{rupiah(value > 0 ? net : 0)}</dd></div>
            </dl>
            <Button size="lg" className="mt-5 w-full" disabled={!amountOk} onClick={() => setStep('method')}>{t('exchange.next')} <ArrowRight className="h-4 w-4" /></Button>
          </motion.div>
        )}

        {step === 'method' && (
          <motion.div key="method" {...slide}>
            <BackLink onClick={() => setStep('amount')} />
            {[['bank', Building2, t('exchange.bank')], ['ewallet', Smartphone, t('exchange.ewallet')]].map(([group, Icon, label]) => (
              <div key={group} className="mb-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-500"><Icon className="h-3.5 w-3.5" /> {label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {METHODS[group].map((m) => (
                    <button key={m.id} type="button" onClick={() => { setMethod(m.id); setAccount(''); setTouched(false) }} aria-pressed={method === m.id} className={clsx('flex h-12 items-center gap-2.5 rounded-xl px-3 text-sm font-bold text-white ring-1 ring-inset transition', method === m.id ? 'bg-white/[0.08] ring-neon-cyan/60' : 'bg-white/[0.03] ring-white/[0.07] hover:bg-white/[0.06]')}>
                      <span className="grid h-7 w-7 place-items-center rounded-lg text-[10px] font-black text-white" style={{ background: m.color }}>{m.name.slice(0, 2).toUpperCase()}</span>
                      {m.name}
                      {method === m.id && <Check className="ml-auto h-4 w-4 text-neon-cyan" />}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <Button size="lg" className="w-full" disabled={!method} onClick={() => setStep('details')}>{t('exchange.next')} <ArrowRight className="h-4 w-4" /></Button>
          </motion.div>
        )}

        {step === 'details' && chosen && (
          <motion.form key="details" {...slide} onSubmit={(e) => { e.preventDefault(); setTouched(true); if (detailsOk) setStep('confirm') }} noValidate autoComplete="off">
            <BackLink onClick={() => setStep('method')} />
            <div className="flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-inset ring-white/[0.06]">
              <span className="grid h-8 w-8 place-items-center rounded-lg text-[10px] font-black text-white" style={{ background: chosen.color }}>{chosen.name.slice(0, 2).toUpperCase()}</span>
              <span className="text-sm font-bold text-white">{chosen.name}</span>
              <span className="num ml-auto font-mono text-sm font-bold text-neon-green">{rupiah(net)}</span>
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-400" htmlFor="exchange-account">{chosen.phone ? t('exchange.phoneLabel', { method: chosen.name }) : t('exchange.accountLabel', { bank: chosen.name })}</label>
            <input id="exchange-account" inputMode="numeric" autoComplete="off" name="neon-prank-account" value={account} onChange={(e) => setAccount(e.target.value.replace(/[^\d ]/g, '').slice(0, 20))} placeholder={chosen.phone ? '08xx xxxx xxxx' : t('exchange.accountPlaceholder', { n: chosen.digits[0] })}
              className={clsx('input-shell mt-1.5 h-12 w-full px-3 font-mono text-base font-bold tracking-wider text-white outline-none', touched && accountError && '!border-neon-red/60')} />
            {touched && accountError && <p className="mt-1.5 text-xs font-semibold text-neon-red">{accountError}</p>}
            <label className="mt-4 block text-xs font-semibold text-slate-400" htmlFor="exchange-holder">{t('exchange.holderLabel')}</label>
            <input id="exchange-holder" autoComplete="off" name="neon-prank-holder" value={holder} onChange={(e) => setHolder(e.target.value.slice(0, 50))} placeholder={t('exchange.holderPlaceholder')}
              className={clsx('input-shell mt-1.5 h-12 w-full px-3 text-base font-semibold uppercase text-white outline-none', touched && holderError && '!border-neon-red/60')} />
            {touched && holderError && <p className="mt-1.5 text-xs font-semibold text-neon-red">{holderError}</p>}
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-500"><Lock className="h-3 w-3" /> {t('exchange.secure')}</p>
            <Button type="submit" size="lg" className="mt-5 w-full">{t('exchange.next')} <ArrowRight className="h-4 w-4" /></Button>
          </motion.form>
        )}

        {step === 'confirm' && chosen && (
          <motion.div key="confirm" {...slide}>
            <BackLink onClick={() => setStep('details')} />
            <p className="text-sm font-bold text-white">{t('exchange.confirmTitle')}</p>
            <dl className="mt-3 space-y-2 rounded-xl bg-white/[0.03] p-4 text-sm ring-1 ring-inset ring-white/[0.06]">
              {[
                [t('exchange.rowAmount'), `${formatCoins(value)} ${currency}`],
                [t('exchange.rowTo'), chosen.name],
                [chosen.phone ? t('exchange.rowPhone') : t('exchange.rowAccount'), masked],
                [t('exchange.rowHolder'), holder.trim().toUpperCase()],
                [t('exchange.fee'), rupiah(FEE)],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><dt className="text-slate-400">{k}</dt><dd className="truncate text-right font-semibold text-white">{v}</dd></div>
              ))}
              <div className="flex items-baseline justify-between border-t border-white/5 pt-2"><dt className="text-slate-300">{t('exchange.youGet')}</dt><dd className="num font-mono text-lg font-bold text-neon-green">{rupiah(net)}</dd></div>
            </dl>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">{t('exchange.eta')}</p>
            <Button size="lg" className="mt-4 w-full" onClick={() => setStep('processing')}>{t('exchange.confirmTo', { method: chosen.name })}</Button>
          </motion.div>
        )}

        {step === 'processing' && (
          <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="py-6">
            <div className="grid place-items-center text-center">
              <Loader2 className="h-10 w-10 animate-spin text-neon-cyan" />
              <p className="mt-4 font-display text-lg font-bold text-white">{t('exchange.processing')}</p>
            </div>
            <ol className="mx-auto mt-5 max-w-xs space-y-2.5">
              {STAGES.map((s, i) => (
                <li key={s} className={clsx('flex items-center gap-2.5 text-sm transition', i <= stage ? 'text-white' : 'text-slate-600')}>
                  <span className={clsx('grid h-5 w-5 place-items-center rounded-full', i < stage ? 'bg-neon-green text-ink-950' : i === stage ? 'bg-neon-cyan/20 text-neon-cyan' : 'bg-white/[0.05]')}>
                    {i < stage ? <Check className="h-3 w-3" strokeWidth={3} /> : i === stage ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                  </span>
                  {t(`exchange.stages.${s}`, { method: chosen?.name ?? '' })}
                </li>
              ))}
            </ol>
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
