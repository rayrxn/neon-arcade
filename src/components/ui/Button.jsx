import { forwardRef } from 'react'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { play } from '@/services/sound'

const VARIANTS = {
  primary: 'bg-gradient-to-b from-[#6ff2ff] to-[#14b6d6] text-onaccent shadow-glow-cyan hover:brightness-105',
  gold: 'bg-gradient-to-b from-[#ffe08a] to-[#f2a01c] text-onaccent shadow-glow-gold hover:brightness-105',
  gem: 'bg-gradient-to-b from-[#c79bff] to-[#8b4dff] text-white shadow-glow-purple hover:brightness-105 [color:#fff]',
  ghost: 'border hairline bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]',
  subtle: 'text-slate-400 hover:bg-white/[0.06] hover:text-white',
  danger: 'border border-neon-red/30 bg-neon-red/10 text-neon-red hover:bg-neon-red/15',
}

const SIZES = {
  xs: 'h-8 rounded-lg px-2.5 text-xs',
  sm: 'h-9 rounded-lg px-3.5 text-sm',
  md: 'h-11 rounded-xl px-5 text-sm',
  lg: 'h-12 rounded-xl px-6 text-[15px]',
  icon: 'h-10 w-10 rounded-xl',
}

const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, disabled, className, children, type = 'button', onClick, ...props },
  ref,
) {
  const inactive = disabled || loading
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={inactive ? undefined : { scale: 0.97 }}
      disabled={inactive}
      className={clsx(
        'relative inline-flex shrink-0 select-none items-center justify-center gap-2 font-bold tracking-tight transition-[filter,background-color,border-color,opacity,color]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950',
        'disabled:cursor-not-allowed disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      onClick={(e) => {
        play('click')
        onClick?.(e)
      }}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </motion.button>
  )
})

export default Button
