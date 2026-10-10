import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import clsx from 'clsx'
import { usePotato } from '@/components/runtime/PerformanceController'

/** Kartu demo di halaman awal: ronde Crash yang naik lalu meledak, berulang. Hanya animasi, tanpa saldo. */
const POINTS = [2.41, 1.37, 5.82, 1.12, 3.06, 12.4, 1.68]
export default function LiveRound({ label, crashedLabel }) {
  const [round, setRound] = useState(0)
  const [m, setM] = useState(1)
  const [crashed, setCrashed] = useState(false)
  const potato = usePotato()
  useEffect(() => {
    const point = POINTS[round % POINTS.length]
    const start = performance.now()
    let raf = 0, timer = 0
    const step = (now) => {
      const v = Math.floor(Math.exp(0.22 * ((now - start) / 1000)) * 100) / 100
      if (v >= point) {
        setM(point)
        setCrashed(true)
        timer = setTimeout(() => { setCrashed(false); setM(1); setRound((r) => r + 1) }, 1600)
        return
      }
      setM(v)
      // Potato mode: ~8 updates a second instead of every frame.
      if (potato) timer = setTimeout(() => step(performance.now()), 120)
      else raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); clearTimeout(timer) }
  }, [round, potato])
  const history = POINTS.slice(0, round % POINTS.length).slice(-4)
  return (
    <motion.div
      className="glass w-56 rounded-2xl p-4"
      initial={{ opacity: 0, x: 24, rotate: 2 }}
      animate={{ opacity: 1, x: 0, rotate: 2 }}
      transition={{ delay: 0.5, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500"><TrendingUp className="h-3.5 w-3.5 text-neon-red" /> {label}</p>
      <p className={clsx('num mt-2 font-mono text-4xl font-bold transition-colors', crashed ? 'text-neon-red' : 'text-white')}>{m.toFixed(2)}×</p>
      <p className={clsx('mt-1 h-4 text-xs font-semibold', crashed ? 'text-neon-red' : 'text-transparent')}>{crashedLabel}</p>
      <div className="mt-3 flex gap-1.5">
        {history.map((p, i) => <span key={i} className={clsx('rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold', p >= 2 ? 'bg-neon-green/10 text-neon-green' : 'bg-white/[0.06] text-slate-400')}>{p.toFixed(2)}×</span>)}
      </div>
    </motion.div>
  )
}
