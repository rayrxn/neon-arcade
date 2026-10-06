import { useId } from 'react'
import clsx from 'clsx'

export default function Logo({ compact = false, className }) {
  const gid = `logo-${useId().replace(/:/g, '')}`
  return (
    <span className={clsx('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22e1ff" />
            <stop offset="1" stopColor="#a35bff" />
          </linearGradient>
        </defs>
        <rect x="1" y="1" width="30" height="30" rx="9" fill="#0b0e18" stroke={`url(#${gid})`} strokeWidth="1.5" />
        <path d="M9.5 22 16 9.5 22.5 22" fill="none" stroke={`url(#${gid})`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="18.6" r="2.3" fill="#ffc83d" />
      </svg>
      {!compact && (
        <span className="font-display text-[15px] font-extrabold leading-none tracking-tight text-white">
          NEON<span className="text-neon-cyan">/</span>ARCADE
        </span>
      )}
    </span>
  )
}
