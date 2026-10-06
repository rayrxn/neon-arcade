import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import clsx from 'clsx'
import AnimatedNumber from '@/components/ui/AnimatedNumber'
import { CurrencyIcon } from '@/components/ui/Currency'
import { useDisplayBalance, useWalletStore } from '@/store/useWalletStore'
import { formatCoins, formatSigned } from '@/utils/format'
import { useRevealStore } from '@/services/reveal'
import { useT } from '@/i18n'

const RING = {
  AC: 'ring-neon-gold/25 hover:ring-neon-gold/45',
  AG: 'ring-gem/30 hover:ring-gem/50',
}

/**
 * Saldo real-time per mata uang. Berlangganan langsung ke wallet store: setiap
 * transaksi (bet, payout, transfer, redeem) langsung menggerakkan angka + label +/−.
 */
export default function BalanceChip({ currency }) {
  const { t } = useT()
  // Payout game yang animasinya belum selesai belum ditampilkan (lihat services/reveal.js).
  const balance = useDisplayBalance(currency)
  const lastDelta = useWalletStore((s) => s.lastDelta)
  const anyHeld = useRevealStore((s) => Object.keys(s.held).length > 0)
  const [queued, setQueued] = useState(null)
  const seenOnMount = useRef(lastDelta?.id)
  const [flash, setFlash] = useState(null)

  useEffect(() => {
    if (!lastDelta || lastDelta.currency !== currency || lastDelta.id === seenOnMount.current) return
    // Label "+xxx" untuk payout ikut ditahan sampai reveal.
    if (anyHeld && lastDelta.amount > 0) return setQueued(lastDelta)
    setFlash(lastDelta)
    const timer = setTimeout(() => setFlash(null), 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastDelta, currency])

  useEffect(() => {
    if (anyHeld || !queued) return
    setFlash(queued)
    setQueued(null)
    const timer = setTimeout(() => setFlash(null), 1500)
    return () => clearTimeout(timer)
  }, [anyHeld, queued])

  return (
    <Link
      to="/wallet"
      className={clsx(
        'relative flex h-9 items-center gap-1.5 rounded-xl bg-white/[0.04] pl-1.5 pr-2.5 ring-1 ring-inset transition sm:h-10 sm:gap-2 sm:pl-2 sm:pr-3 focus-ring',
        RING[currency],
        flash && (flash.amount > 0 ? '!ring-neon-green/70' : '!ring-neon-red/60'),
      )}
      title={t(`currency.${currency}.name`)}
    >
      <CurrencyIcon currency={currency} size={20} spin={currency === 'AC'} />
      <AnimatedNumber value={balance} className="font-mono text-[13px] font-bold text-white sm:text-sm" />
      <span className={clsx('hidden font-mono text-[10px] font-bold sm:inline', currency === 'AG' ? 'text-gem' : 'text-neon-gold')}>{currency}</span>
      <span className="sr-only">{t(`currency.${currency}.name`)}: {formatCoins(balance)}</span>

      <AnimatePresence>
        {flash && (
          <motion.span
            key={flash.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 6 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.35 }}
            className={clsx('pointer-events-none absolute right-1 top-full font-mono text-xs font-bold', flash.amount > 0 ? 'text-neon-green' : 'text-neon-red')}
          >
            {formatSigned(flash.amount)} {currency}
          </motion.span>
        )}
      </AnimatePresence>
    </Link>
  )
}
