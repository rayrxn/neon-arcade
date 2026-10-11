import { useId } from 'react'
import clsx from 'clsx'

/** Arcade Chip (AC): a gold casino chip with white edge inserts and an engraved "A". `spin` flips it with CSS. */
export default function CoinIcon({ size = 20, spin = false, className }) {
  const id = `chip-${useId().replace(/:/g, '')}`
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={clsx('inline-block shrink-0', spin && 'chip-spin', className)} aria-hidden>
      <defs>
        <radialGradient id={`${id}b`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#fff1b8" />
          <stop offset="0.45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#b45309" />
        </radialGradient>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fde68a" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${id}b)`} stroke="#78350f" strokeWidth="1" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <rect key={a} x="14.2" y="1.4" width="3.6" height="5" rx="1" fill="#fffbeb" transform={`rotate(${a} 16 16)`} />
      ))}
      <circle cx="16" cy="16" r="9.6" fill={`url(#${id}c)`} stroke="#92400e" strokeWidth="0.8" strokeDasharray="1.6 1.2" />
      <path d="M11.6 21 L16 10.4 L20.4 21 M13.2 17.4 H18.8" fill="none" stroke="#78350f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <ellipse cx="11" cy="9" rx="4" ry="2" fill="#fff" opacity="0.4" transform="rotate(-30 11 9)" />
    </svg>
  )
}
