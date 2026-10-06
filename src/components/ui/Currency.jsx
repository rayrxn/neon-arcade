import { useId } from 'react'
import clsx from 'clsx'
import CoinIcon from './CoinIcon'
import AnimatedNumber from './AnimatedNumber'
import { formatCoins } from '@/utils/format'

/** Arcade Gem (AG) — permata ungu bersegi, sengaja beda bentuk & warna dari koin AC. */
export function GemIcon({ size = 20, className }) {
  const gid = `gem-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={clsx('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3ccff" />
          <stop offset="0.45" stopColor="#a86bff" />
          <stop offset="1" stopColor="#6b2fd6" />
        </linearGradient>
      </defs>
      <path d="M7 3h10l5 6-10 12L2 9z" fill={`url(#${gid})`} />
      <path d="M2 9h20M7 3l5 6 5-6M12 9v12" fill="none" stroke="#f3e8ff" strokeOpacity="0.55" strokeWidth="1" strokeLinejoin="round" />
      <path d="M7 3h10l5 6-10 12L2 9z" fill="none" stroke="#4c1d95" strokeOpacity="0.5" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  )
}

export function CurrencyIcon({ currency, size = 20, spin = false, className }) {
  return currency === 'AG' ? <GemIcon size={size} className={className} /> : <CoinIcon size={size} spin={spin} className={className} />
}

const CODE_TONE = { AC: 'text-neon-gold', AG: 'text-gem' }

/**
 * Nominal + ikon + kode mata uang. Selalu dipakai saat menampilkan AC/AG
 * supaya keduanya tidak pernah tertukar.
 */
export function Amount({ currency, value, signed = false, animated = false, size = 'md', className, iconSize, tone }) {
  const sizes = {
    sm: { text: 'text-sm', icon: 15, code: 'text-[10px]' },
    md: { text: 'text-base', icon: 18, code: 'text-[11px]' },
    lg: { text: 'text-2xl', icon: 24, code: 'text-xs' },
    xl: { text: 'text-3xl sm:text-4xl', icon: 30, code: 'text-sm' },
  }[size]
  const sign = signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : ''
  return (
    <span className={clsx('inline-flex items-center gap-1.5 font-mono font-bold', sizes.text, tone, className)}>
      <CurrencyIcon currency={currency} size={iconSize ?? sizes.icon} />
      <span className="num tracking-tight">
        {sign}
        {animated ? <AnimatedNumber value={signed ? Math.abs(value) : value} /> : formatCoins(signed ? Math.abs(value) : value)}
      </span>
      <span className={clsx('font-bold', sizes.code, CODE_TONE[currency])}>{currency}</span>
    </span>
  )
}
