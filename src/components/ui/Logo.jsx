import { useId } from 'react'
import clsx from 'clsx'

export default function Logo({ compact = false, className }) {
  const gid = `logo-${useId().replace(/:/g, '')}`
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      {/* 1.0.0 mark: an Arcade Chip ring (8 inserts) around the arcade "A", gold coin as the crossbar. */}
      <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#22e1ff" />
            <stop offset="1" stopColor="#7c5cff" />
          </linearGradient>
        </defs>
        <circle cx="16" cy="16" r="15" fill="#0a0d18" />
        <circle cx="16" cy="16" r="13.2" fill="none" stroke={`url(#${gid})`} strokeWidth="2.6" strokeDasharray="7.37 3" transform="rotate(-128.5 16 16)" />
        <circle cx="16" cy="16" r="9.4" fill="none" stroke="#22e1ff" strokeOpacity="0.22" strokeWidth="0.8" />
        <path d="M10.6 21.6 16 10.2 21.4 21.6" fill="none" stroke="#f4f1ea" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="18" r="2.1" fill="#ffc83d" />
      </svg>
      {!compact && (
        <span className="flex items-center whitespace-nowrap font-display text-[13.5px] font-extrabold leading-none tracking-tight text-white">
          NEON<span className="mx-[2px] inline-block text-neon-cyan">/</span>ARCADE
        </span>
      )}
    </span>
  )
}
