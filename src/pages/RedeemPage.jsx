import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CalendarClock, CheckCircle2, Frame, History, Info, Ticket, Users } from 'lucide-react'
import clsx from 'clsx'
import Button from '@/components/ui/Button'
import { Amount } from '@/components/ui/Currency'
import { EmptyState, Panel } from '@/components/ui/Controls'
import { useActiveWallet } from '@/store/useWalletStore'
import { checkCode, normalizeCode, redeemCode } from '@/services/redeem'
import { rewardsText } from '@/components/notifications/describe'
import { ITEMS } from '@/config/economy'
import { formatDate, formatDateTime } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { pick, useT } from '@/i18n'

function RewardRow({ reward }) {
  const { t, lang } = useT()
  if (reward.kind === 'item') {
    return (
      <li className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3.5 py-3 ring-1 ring-inset ring-white/[0.06]">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-neon-cyan/10 text-neon-cyan"><Frame className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-white">{pick(ITEMS[reward.id]?.name, lang)}</span>
          <span className="block text-xs text-slate-500">{t('redeem.itemFrame')}</span>
        </span>
      </li>
    )
  }
  const rare = reward.kind === 'AG'
  return (
    <li className={clsx('flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 ring-1 ring-inset', rare ? 'bg-gem/[0.08] ring-gem/30' : 'bg-white/[0.03] ring-white/[0.06]')}>
      <span className="text-sm font-semibold text-slate-300">{t(`currency.${reward.kind}.name`)}</span>
      <Amount currency={reward.kind} value={reward.amount} signed size="md" className="text-white" />
    </li>
  )
}

/**
 * Redeem Code — 2 langkah: Cek kode (lihat hadiah) → Redeem.
 * State: idle → checking → preview → redeeming → success | error.
 */
export default function RedeemPage() {
  const { t, lang } = useT()
  const wallet = useActiveWallet()
  const [code, setCode] = useState('')
  const [state, setState] = useState('idle')
  const [info, setInfo] = useState(null)
  const [error, setError] = useState(null)

  const reset = (next = '') => {
    setCode(next)
    setState('idle')
    setInfo(null)
    setError(null)
  }

  const check = async (e) => {
    e.preventDefault()
    setState('checking')
    setError(null)
    try {
      setInfo(await checkCode(code))
      setState('preview')
    } catch (err) {
      setError(errorKey(err))
      setState('error')
    }
  }

  const redeem = async () => {
    setState('redeeming')
    try {
      setInfo(await redeemCode(info.code))
      setState('success')
    } catch (err) {
      setError(errorKey(err))
      setState('error')
    }
  }

  const history = wallet?.redeemed ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">{t('redeem.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('redeem.subtitle')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Panel title={t('redeem.enterCode')} icon={Ticket} bodyClassName="p-4 sm:p-5">
          <form onSubmit={check}>
            <label htmlFor="redeem-code" className="sr-only">{t('redeem.enterCode')}</label>
            <div className="relative flex items-stretch overflow-hidden rounded-xl border border-dashed border-white/20 bg-ink-950/60 focus-within:border-neon-purple/70">
              <span className="grid w-12 shrink-0 place-items-center border-r border-dashed border-white/20 text-neon-purple"><Ticket className="h-5 w-5" /></span>
              <input
                id="redeem-code"
                value={code}
                onChange={(e) => {
                  const next = normalizeCode(e.target.value)
                  if (state !== 'idle' && state !== 'checking') reset(next)
                  else setCode(next)
                }}
                placeholder="XXXX0000"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={state === 'checking' || state === 'redeeming'}
                className="h-14 min-w-0 flex-1 bg-transparent px-4 font-mono text-lg font-bold uppercase tracking-[0.16em] text-white outline-none placeholder:text-slate-700"
              />
            </div>
            <Button type="submit" className="mt-3 w-full" size="lg" loading={state === 'checking'} disabled={code.length < 4 || state === 'preview' || state === 'redeeming' || state === 'success'}>
              {t('redeem.check')}
            </Button>
          </form>

          <AnimatePresence mode="wait" initial={false}>
            {(state === 'preview' || state === 'redeeming') && info && (
              <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 space-y-3">
                <p className="label-caps">{t('redeem.youGet')}</p>
                <ul className="space-y-2">{info.rewards.map((r, i) => <RewardRow key={i} reward={r} />)}</ul>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {info.expiresAt && <span className="flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> {t('redeem.validUntil', { date: formatDate(info.expiresAt) })}</span>}
                  {info.remaining != null && <span className="flex items-center gap-1 text-gem"><Users className="h-3.5 w-3.5" /> {t('redeem.remaining', { count: info.remaining })}</span>}
                </div>
                {info.rare && <p className="rounded-xl bg-gem/[0.08] px-3.5 py-2.5 text-xs leading-relaxed text-slate-300 ring-1 ring-inset ring-gem/25">{t('redeem.rareNote')}</p>}
                <div className="flex gap-2 pt-1">
                  <Button variant="ghost" className="flex-1" onClick={() => reset()} disabled={state === 'redeeming'}>{t('common.cancel')}</Button>
                  <Button variant={info.rare ? 'gem' : 'primary'} className="flex-[2]" loading={state === 'redeeming'} onClick={redeem}>{t('redeem.confirm')}</Button>
                </div>
              </motion.div>
            )}

            {state === 'success' && info && (
              <motion.div key="success" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mt-5 rounded-2xl bg-neon-green/[0.07] p-5 text-center ring-1 ring-inset ring-neon-green/25">
                <CheckCircle2 className="mx-auto h-9 w-9 text-neon-green" />
                <p className="mt-3 font-display text-lg font-bold text-white">{t('redeem.successTitle')}</p>
                <p className="mt-1 text-sm text-slate-400">{t('redeem.successBody', { reward: rewardsText(info.rewards, lang) })}</p>
                <Button variant="ghost" className="mt-4" onClick={() => reset()}>{t('redeem.another')}</Button>
              </motion.div>
            )}

            {state === 'error' && error && (
              <motion.div key="error" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 flex gap-3 rounded-xl bg-neon-red/[0.08] p-4 ring-1 ring-inset ring-neon-red/25" role="alert">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-neon-red" />
                <div>
                  <p className="text-sm font-bold text-white">{t(error.startsWith('redeem.errors.') ? error.replace('redeem.errors.', 'redeem.errorTitles.') : 'redeem.errorTitles.generic')}</p>
                  <p className="mt-0.5 text-sm text-slate-400">{t(error)}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-5 flex gap-2 text-xs leading-relaxed text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {t('redeem.info')}
          </p>
        </Panel>

        <Panel title={t('redeem.history')} icon={History}>
          {history.length === 0 ? (
            <EmptyState icon={Ticket} title={t('redeem.historyEmpty')} body={t('redeem.historyEmptyBody')} />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {history.map((r) => (
                <li key={`${r.code}-${r.at}`} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-neon-purple/10 text-neon-purple"><Ticket className="h-[18px] w-[18px]" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-bold tracking-wider text-white">{r.code}</p>
                    <p className="truncate text-xs text-slate-500">{formatDateTime(r.at)}</p>
                  </div>
                  <p className="max-w-[45%] text-right text-sm font-semibold text-neon-green">+{rewardsText(r.rewards, lang)}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
