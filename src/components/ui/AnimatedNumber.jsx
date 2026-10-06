import { useEffect, useRef } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import clsx from 'clsx'
import { formatCoins } from '@/utils/format'
import { usePrefsStore } from '@/store/usePrefsStore'

/** Angka yang "menghitung" ke nilai baru. Desimal hanya muncul jika target bukan bilangan bulat. */
export default function AnimatedNumber({ value, className, duration = 0.7 }) {
  const language = usePrefsStore((s) => s.language) // format ulang saat bahasa berganti
  const motionValue = useMotionValue(value)
  const decimals = useRef(Number.isInteger(value) ? 0 : 2)
  decimals.current = Number.isInteger(value) ? 0 : 2

  const text = useTransform(motionValue, (v) => formatCoins(v, decimals.current))

  useEffect(() => {
    const controls = animate(motionValue, value, { duration, ease: [0.22, 1, 0.36, 1] })
    return () => controls.stop()
  }, [value, duration, motionValue])

  useEffect(() => {
    motionValue.set(motionValue.get() + 1e-9) // paksa render ulang teks dengan locale baru
  }, [language, motionValue])

  return <motion.span className={clsx('num', className)}>{text}</motion.span>
}
