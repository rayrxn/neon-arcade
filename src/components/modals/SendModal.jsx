import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock3, Search, Send, XCircle } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Avatar from '@/components/ui/Avatar'
import { Amount, CurrencyIcon } from '@/components/ui/Currency'
import { DemoTag, Segmented } from '@/components/ui/Controls'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { FIELD, useActiveWallet } from '@/store/useWalletStore'
import { isOnline, usePlatformStore } from '@/store/usePlatformStore'
import { sendTransfer, sentToday, validateTransfer } from '@/services/transfers'
import { AG_HOLD_MS, TRANSFER_LIMITS } from '@/config/economy'
import { formatCoins } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

const QUICK = { AC: [100, 500, 1000, 5000], AG: [1, 2, 3] }

function SummaryRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="min-w-0 text-right text-sm font-semibold text-slate-200">{children}</span>
    </div>
  )
}

/**
 * Send Balance — 3 langkah: isi form → ringkasan & konfirmasi → hasil (Success/Pending/Failed).
 * AG memakai konfirmasi tambahan karena mata uang langka.
 */
export default function SendModal({ open, onClose, initial = {} }) {
  const { t } = useT()
  const navigate = useNavigate()
  const me = useCurrentUser()
  const wallet = useActiveWallet()
  const users = useAuthStore((s) => s.users)
  const presence = usePlatformStore((s) => s.presence)

  const [step, setStep] = useState('form')
  const [query, setQuery] = useState('')
  const [toUserId, setToUserId] = useState(initial.toUserId ?? null)
  const [currency, setCurrency] = useState(initial.currency ?? 'AC')
  const [amountText, setAmountText] = useState('')
  const [note, setNote] = useState('')
  const [touched, setTouched] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Reset setiap kali dibuka.
  useEffect(() => {
    if (!open) return
    setStep('form')
    setQuery('')
    setToUserId(initial.toUserId ?? null)
    setCurrency(initial.currency ?? 'AC')
    setAmountText('')
    setNote('')
    setTouched(false)
    setAgreed(false)
    setResult(null)
    setError(null)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const recipients = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, '')
    return Object.values(users)
      .filter((u) => u.id !== me?.id)
      .filter((u) => !q || u.username.toLowerCase().includes(q) || u.displayName?.toLowerCase().includes(q))
      .sort((a, b) => Number(!!a.isDemo) - Number(!!b.isDemo) || a.username.localeCompare(b.username))
  }, [users, me, query])

  const recipient = Object.values(users).find((u) => u.id === toUserId) ?? null
  const amount = Number(amountText.replace(/[^\d]/g, '')) || 0
  const balance = wallet?.[FIELD[currency]] ?? 0
  const limits = TRANSFER_LIMITS[currency]
  const usedToday = me ? sentToday(me.id, currency) : 0
  const problem = me ? validateTransfer({ fromUserId: me.id, toUserId, currency, amount }) : null
  const isAG = currency === 'AG'

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await sendTransfer({ toUserId, currency, amount, note })
      setResult(res)
      setStep('result')
    } catch (err) {
      setError({ code: errorKey(err), vars: err.vars })
    } finally {
      setBusy(false)
    }
  }

  const title = step === 'review' ? t('send.reviewTitle') : step === 'result' ? t('send.resultTitle') : t('send.title')

  return (
    <Modal
      open={open}
      onClose={onClose}
      locked={busy}
      title={title}
      icon={<span className="grid h-10 w-10 place-items-center rounded-xl bg-neon-cyan/10 text-neon-cyan"><Send className="h-5 w-5" /></span>}
    >
      <AnimatePresence mode="wait" initial={false}>
        {step === 'form' && (
          <motion.div key="form" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }} className="space-y-5">
            {/* Penerima */}
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-400">{t('send.recipient')}</p>
              {recipient ? (
                <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-2.5 ring-1 ring-inset ring-white/[0.08]">
                  <Avatar user={recipient} online={isOnline(presence, recipient.id)} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-bold text-white">{recipient.displayName} {recipient.isDemo && <DemoTag />}</p>
                    <p className="truncate text-xs text-slate-500">@{recipient.username}</p>
                  </div>
                  <Button size="xs" variant="ghost" onClick={() => setToUserId(null)}>{t('common.change')}</Button>
                </div>
              ) : (
                <>
                  <div className="input-shell flex items-center gap-2 px-3">
                    <Search className="h-4 w-4 shrink-0 text-slate-500" />
                    <input
                      id="send-search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={t('send.searchPlaceholder')}
                      className="h-11 min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-600 sm:text-sm"
                      autoComplete="off"
                    />
                  </div>
                  <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto">
                    {recipients.length === 0 && <li className="px-3 py-4 text-center text-sm text-slate-500">{t('send.noUsers')}</li>}
                    {recipients.map((u) => (
                      <li key={u.id}>
                        <button onClick={() => setToUserId(u.id)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/[0.05] focus-ring">
                          <Avatar user={u} size="sm" online={isOnline(presence, u.id)} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-200">{u.displayName} {u.isDemo && <DemoTag />}</span>
                            <span className="block truncate text-xs text-slate-500">@{u.username}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {/* Mata uang */}
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-400">{t('send.currency')}</p>
              <div className="grid grid-cols-2 gap-2">
                {['AC', 'AG'].map((c) => (
                  <button
                    key={c}
                    onClick={() => setCurrency(c)}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-xl p-3 text-left ring-1 ring-inset transition focus-ring',
                      currency === c ? (c === 'AG' ? 'bg-gem/10 ring-gem/50' : 'bg-neon-gold/10 ring-neon-gold/50') : 'bg-white/[0.03] ring-white/[0.08] hover:ring-white/20',
                    )}
                  >
                    <CurrencyIcon currency={c} size={26} />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-white">{t(`currency.${c}.name`)}</span>
                      <span className="num block font-mono text-xs text-slate-500">{formatCoins(wallet?.[FIELD[c]] ?? 0)} {c}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Jumlah */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <label htmlFor="send-amount" className="text-xs font-semibold text-slate-400">{t('send.amount')}</label>
                <span className="text-xs text-slate-500">{t('send.available', { amount: `${formatCoins(balance)} ${currency}` })}</span>
              </div>
              <div className={clsx('input-shell flex items-center gap-2 px-3', touched && amountText && problem && problem.code !== 'send.errors.noRecipient' && '!border-neon-red/60')}>
                <CurrencyIcon currency={currency} size={20} />
                <input
                  id="send-amount"
                  inputMode="numeric"
                  value={amountText}
                  onChange={(e) => {
                    setTouched(true)
                    const digits = e.target.value.replace(/[^\d]/g, '').slice(0, 9)
                    setAmountText(digits ? formatCoins(Number(digits)) : '')
                  }}
                  placeholder="0"
                  className="num h-12 min-w-0 flex-1 bg-transparent font-mono text-lg font-bold text-white outline-none placeholder:text-slate-600"
                />
                <button onClick={() => { setTouched(true); setAmountText(formatCoins(Math.min(balance, limits.max))) }} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-neon-cyan hover:bg-neon-cyan/10">
                  {t('send.max')}
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {QUICK[currency].map((v) => (
                  <button key={v} onClick={() => { setTouched(true); setAmountText(formatCoins(v)) }} className="rounded-lg bg-white/[0.04] px-2.5 py-1 font-mono text-xs font-bold text-slate-300 ring-1 ring-inset ring-white/[0.07] hover:text-white">
                    {formatCoins(v)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {t('send.limits', { min: formatCoins(limits.min), daily: formatCoins(limits.daily), used: formatCoins(usedToday), currency })}
              </p>
              {touched && amountText && problem && problem.code !== 'send.errors.noRecipient' && (
                <p className="mt-1.5 text-xs font-semibold text-neon-red">{t(problem.code, { ...problem.vars, min: formatCoins(problem.vars?.min ?? 0), max: formatCoins(problem.vars?.max ?? 0) })}</p>
              )}
            </div>

            <div>
              <label htmlFor="send-note" className="mb-2 block text-xs font-semibold text-slate-400">{t('send.note')}</label>
              <input
                id="send-note"
                value={note}
                maxLength={80}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('send.notePlaceholder')}
                className="input-shell h-11 w-full px-3 text-base text-white outline-none placeholder:text-slate-600 sm:text-sm"
              />
            </div>

            <Button size="lg" className="w-full" disabled={!!problem} onClick={() => setStep('review')}>
              {t('common.continue')}
            </Button>
          </motion.div>
        )}

        {step === 'review' && recipient && (
          <motion.div key="review" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }} transition={{ duration: 0.18 }} className="space-y-4">
            <div className={clsx('rounded-2xl p-4 text-center ring-1 ring-inset', isAG ? 'bg-gem/[0.07] ring-gem/25' : 'bg-neon-gold/[0.06] ring-neon-gold/20')}>
              <p className="label-caps">{t('send.youSend')}</p>
              <Amount currency={currency} value={amount} size="xl" className="mt-2 justify-center text-white" />
              <div className="mt-3 flex items-center justify-center gap-2 text-sm text-slate-400">
                <span>{t('send.to')}</span>
                <Avatar user={recipient} size="xs" />
                <span className="font-bold text-white">@{recipient.username}</span>
              </div>
            </div>

            <div className="divide-y divide-white/[0.06] rounded-xl bg-white/[0.02] px-4 ring-1 ring-inset ring-white/[0.06]">
              <SummaryRow label={t('send.from')}>@{me?.username}</SummaryRow>
              <SummaryRow label={t('send.fee')}>{t('send.free')}</SummaryRow>
              <SummaryRow label={t('send.balanceAfter')}>
                <Amount currency={currency} value={balance - amount} size="sm" />
              </SummaryRow>
              <SummaryRow label={t('send.arrival')}>{isAG ? t('send.arrivalHold', { minutes: Math.round(AG_HOLD_MS / 60000) }) : t('send.arrivalInstant')}</SummaryRow>
              {note.trim() && <SummaryRow label={t('send.note')}><span className="break-words">{note.trim()}</span></SummaryRow>}
            </div>

            {isAG && (
              <div className="rounded-xl border border-gem/30 bg-gem/[0.08] p-4">
                <p className="flex items-center gap-2 text-sm font-bold text-white">
                  <AlertTriangle className="h-4 w-4 text-gem" /> {t('send.agWarningTitle')}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{t('send.agWarningBody')}</p>
                <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm text-slate-200">
                  <input id="send-ag-confirm" type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--gem))]" />
                  {t('send.agConfirm', { amount: formatCoins(amount) })}
                </label>
              </div>
            )}

            {error && (
              <p className="rounded-xl bg-neon-red/10 px-3.5 py-3 text-sm font-semibold text-neon-red" role="alert">
                {t(error.code, error.vars)}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setStep('form')} disabled={busy}>
                <ArrowLeft className="h-4 w-4" /> {t('common.back')}
              </Button>
              <Button variant={isAG ? 'gem' : 'primary'} className="flex-[2]" loading={busy} disabled={isAG && !agreed} onClick={submit}>
                {t('send.confirm')}
              </Button>
            </div>
          </motion.div>
        )}

        {step === 'result' && result && (
          <motion.div key="result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center py-2 text-center">
            {{
              success: <span className="grid h-16 w-16 place-items-center rounded-full bg-neon-green/15 text-neon-green ring-1 ring-neon-green/30"><CheckCircle2 className="h-8 w-8" /></span>,
              pending: <span className="grid h-16 w-16 place-items-center rounded-full bg-neon-gold/15 text-neon-gold ring-1 ring-neon-gold/30"><Clock3 className="h-8 w-8" /></span>,
              failed: <span className="grid h-16 w-16 place-items-center rounded-full bg-neon-red/15 text-neon-red ring-1 ring-neon-red/30"><XCircle className="h-8 w-8" /></span>,
            }[result.status]}
            <p className="mt-4 font-display text-xl font-bold text-white">{t(`send.result.${result.status}.title`)}</p>
            <p className="mt-2 max-w-xs text-sm text-slate-400">
              {t(`send.result.${result.status}.body`, {
                amount: `${formatCoins(amount)} ${currency}`,
                user: `@${recipient?.username}`,
                minutes: Math.round(AG_HOLD_MS / 60000),
                reason: result.reason ? t(`send.reasons.${result.reason}`) : '',
              })}
            </p>
            <div className="mt-6 flex w-full gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => { onClose(); navigate('/wallet') }}>
                {t('send.viewHistory')}
              </Button>
              <Button className="flex-1" onClick={onClose}>
                <Check className="h-4 w-4" /> {t('common.done')}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  )
}
