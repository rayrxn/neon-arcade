import { useId } from 'react'
import clsx from 'clsx'
import CoinIcon from './CoinIcon'
import AnimatedNumber from './AnimatedNumber'
import { formatCoins } from '@/utils/format'

/** Arcade Gem (AG): a brilliant-cut violet gem with facets and a sparkle — clearly different from the gold chip. */
export function GemIcon({ size = 20, className }) {
  const gid = `gem-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={clsx('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f5e9ff" />
          <stop offset="0.4" stopColor="#c084fc" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <path d="M9 5 H23 L30 12 L16 29 L2 12 Z" fill={`url(#${gid})`} stroke="#4c1d95" strokeWidth="1" strokeLinejoin="round" />
      <path d="M2 12 H30 L16 29 Z" fill="#7c3aed" opacity="0.45" />
      <path d="M9 5 L12 12 L16 5 L20 12 L23 5" fill="#faf5ff" opacity="0.5" />
      <path d="M12 12 L16 29 L20 12" fill="none" stroke="#ede9fe" strokeOpacity="0.6" strokeWidth="0.8" />
      <path d="M2 12 H30" stroke="#ede9fe" strokeOpacity="0.7" strokeWidth="0.8" />
      <path d="M26 2.5 L26.8 4.6 L29 5.4 L26.8 6.2 L26 8.4 L25.2 6.2 L23 5.4 L25.2 4.6 Z" fill="#fff" />
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
