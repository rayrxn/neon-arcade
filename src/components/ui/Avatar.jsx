import clsx from 'clsx'
import { initials } from '@/utils/format'
import { ITEMS } from '@/config/economy'

export const PRESET_STYLES = {
  cyan: 'from-[#5ef0ff] to-[#1a7cff]',
  violet: 'from-[#c79bff] to-[#ff4d8d]',
  sunset: 'from-[#ffd36b] to-[#ff7a3d]',
  mint: 'from-[#5df0b4] to-[#22a6ff]',
  rose: 'from-[#ff9cc0] to-[#ff4d5e]',
  steel: 'from-[#b8c4d6] to-[#5b6b85]',
  aurora: 'from-[#6ff2ff] via-[#a35bff] to-[#ff4d8d]',
  ember: 'from-[#ffd36b] via-[#ff7a3d] to-[#ff2e4d]',
}

const SIZES = {
  xs: 'h-6 w-6 rounded-md text-[9px]',
  sm: 'h-8 w-8 rounded-lg text-[10px]',
  md: 'h-9 w-9 rounded-xl text-[11px]',
  lg: 'h-12 w-12 rounded-xl text-sm',
  xl: 'h-20 w-20 rounded-2xl text-xl',
}
const DOT = { xs: 'h-2 w-2', sm: 'h-2.5 w-2.5', md: 'h-2.5 w-2.5', lg: 'h-3 w-3', xl: 'h-4 w-4' }

/**
 * Avatar user: preset gradien + inisial, atau foto yang di-upload.
 * `frame` (item dari redeem/event) tampil sebagai ring berwarna.
 */
export default function Avatar({ user, name, size = 'md', online, showFrame = true, className }) {
  const label = user?.displayName || user?.username || name || ''
  const avatar = user?.avatar ?? { kind: 'preset', id: 'cyan' }
  const frame = showFrame && user?.frame ? ITEMS[user.frame] : null

  return (
    <span className={clsx('relative inline-flex shrink-0', className)}>
      <span
        className={clsx(
          'grid place-items-center overflow-hidden font-display font-extrabold text-onaccent',
          SIZES[size],
          avatar.kind === 'image' ? 'bg-ink-800' : clsx('bg-gradient-to-br', PRESET_STYLES[avatar.id] ?? PRESET_STYLES.cyan),
          frame && clsx('ring-2 ring-offset-2 ring-offset-ink-950', frame.ring),
        )}
        aria-hidden
      >
        {avatar.kind === 'image' ? <img src={avatar.src} alt="" className="h-full w-full object-cover" /> : initials(label)}
      </span>
      {online !== undefined && (
        <span
          className={clsx(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-ink-950',
            DOT[size],
            online ? 'bg-neon-green' : 'bg-slate-600',
          )}
        />
      )}
    </span>
  )
}
