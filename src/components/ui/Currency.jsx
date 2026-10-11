import { useId } from 'react'
import clsx from 'clsx'
import CoinIcon from './CoinIcon'
import AnimatedNumber from './AnimatedNumber'
import { formatCoins } from '@/utils/format'

/** Arcade Gem (AG): an octagonal step-cut gem seen from above — table, crown facets and a rim light. */
export function GemIcon({ size = 20, className }) {
  const g = `gem-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={clsx('shrink-0', className)} aria-hidden>
      <defs>
        <linearGradient id={`${g}a`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f0abfc" /><stop offset="0.5" stopColor="#a855f7" /><stop offset="1" stopColor="#4c1d95" /></linearGradient>
        <linearGradient id={`${g}b`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="0.6" stopColor="#e9d5ff" /><stop offset="1" stopColor="#c084fc" /></linearGradient>
      </defs>
      <path d="M11 2 H21 L30 11 V21 L21 30 H11 L2 21 V11 Z" fill={`url(#${g}a)`} stroke="#3b0764" strokeWidth="1" strokeLinejoin="round" />
      <path d="M11 2 L13 9 L2 11 Z M21 2 L19 9 L30 11 Z M30 21 L23 19 L21 30 Z M2 21 L9 19 L11 30 Z" fill="#fff" opacity="0.18" />
      <path d="M13 9 H19 L23 13 V19 L19 23 H13 L9 19 V13 Z" fill={`url(#${g}b)`} stroke="#7e22ce" strokeWidth="0.6" />
      <path d="M11 2 L13 9 M21 2 L19 9 M30 11 L23 13 M30 21 L23 19 M21 30 L19 23 M11 30 L13 23 M2 21 L9 19 M2 11 L9 13" stroke="#f5d0fe" strokeOpacity="0.55" strokeWidth="0.7" />
      <path d="M14 11 L17.5 11 L13 15.5 L13 12 Z" fill="#fff" opacity="0.85" />
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
