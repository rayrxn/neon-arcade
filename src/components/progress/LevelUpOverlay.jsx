import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useUiStore } from '@/store/useUiStore'
import { CurrencyIcon } from '@/components/ui/Currency'
import { COSMETICS } from '@/config/cosmetics'
import { formatCoins } from '@/utils/format'
import { pick, useT } from '@/i18n'

/**
 * Overlay naik level: level lama → baru, XP didapat, hadiah milestone/kosmetik.
 * Dipicu services/progression.js setelah hasil game selesai ditampilkan (reveal gate).
 */
export default function LevelUpOverlay() {
  const { t, lang } = useT()
  const info = useUiStore((s) => s.levelUp)
  const hide = useUiStore((s) => s.hideLevelUp)

  useEffect(() => {
    if (!info) return
    const id = setTimeout(hide, 6500)
    const onKey = (e) => e.key === 'Escape' && hide()
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(id)
      window.removeEventListener('keydown', onKey)
    }
  }, [info, hide])

  const rewards = info?.rewards ?? []
  return (
    <AnimatePresence>
      {info && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
          onClick={hide}
          role="dialog"
          aria-live="assertive"
          aria-label={t('levelUp.title')}
        >
          <motion.div
            initial={{ scale: 0.8, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
            className="glass-strong relative w-full max-w-sm overflow-hidden rounded-3xl p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-neon-cyan/30 blur-3xl" />
            <span className="relative mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-neon-cyan/15 text-neon-cyan"><Sparkles className="h-6 w-6" /></span>
            <p className="relative mt-3 text-xs font-extrabold uppercase tracking-[0.2em] text-neon-cyan">{t('levelUp.title')}</p>
            <div className="relative mt-3 flex items-center justify-center gap-4 font-display">
              <span className="text-3xl font-bold text-slate-500 num">{info.from}</span>
              <motion.span initial={{ x: -8, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="text-slate-500">→</motion.span>
              <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 14 }} className="text-6xl font-extrabold text-white num">
                {info.to}
              </motion.span>
            </div>
            {info.xp > 0 && <p className="relative mt-2 text-sm text-slate-400">{t('levelUp.xp', { xp: formatCoins(info.xp) })}</p>}
            {rewards.length > 0 && (
              <div className="relative mt-4 space-y-2 text-left">
                <p className="label-caps">{t('levelUp.rewards')}</p>
                {rewards.map((r, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 + i * 0.12 }} className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 ring-1 ring-inset ring-white/[0.06]">
                    {r.kind === 'item' ? (
                      <>
                        <span className="grid h-7 w-7 place-items-center rounded-lg bg-neon-purple/15 text-xs font-bold text-neon-purple">★</span>
                        <span className="text-sm font-semibold text-white">{pick(COSMETICS[r.id]?.name, lang)}</span>
                      </>
                    ) : (
                      <>
                        <CurrencyIcon currency={r.kind} size={22} />
                        <span className="text-sm font-semibold text-white num">+{formatCoins(r.amount)} {r.kind}</span>
                        {r.level && <span className="ml-auto text-[11px] text-slate-500">{t('levelUp.milestone', { level: r.level })}</span>}
                      </>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
            <button onClick={hide} className="relative mt-5 h-10 w-full rounded-xl bg-neon-cyan text-sm font-bold text-onaccent focus-ring">{t('levelUp.continue')}</button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
