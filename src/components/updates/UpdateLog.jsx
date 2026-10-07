import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, RefreshCw, Sparkles, Wrench, Zap } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { BUILD, CHANGELOG, formatRelease } from '@/config/build'
import { SERVER_MODE } from '@/config/runtime'
import { pick, useT } from '@/i18n'

const SEEN_KEY = 'neon-arcade:seen-version'
const POLL_MS = 60_000

const readSeen = () => {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}
const writeSeen = (v) => {
  try {
    localStorage.setItem(SEEN_KEY, v)
  } catch {
    /* storage blocked: the log may show again next visit */
  }
}

/** open: null | { entry, mode: 'current' | 'reload' | 'browse', at } */
export const useUpdateLog = create((set) => ({
  open: null,
  show: (entry, mode = 'browse', at = null) => set({ open: { entry, mode, at } }),
  close: () => set({ open: null }),
}))
export const openUpdateLog = () => useUpdateLog.getState().show(CHANGELOG[0], 'browse', BUILD.at)

const TAGS = {
  new: { icon: Sparkles, cls: 'bg-neon-cyan/12 text-neon-cyan ring-neon-cyan/25' },
  improve: { icon: Zap, cls: 'bg-violet-400/12 text-violet-300 ring-violet-400/25' },
  fix: { icon: Wrench, cls: 'bg-neon-green/12 text-neon-green ring-neon-green/25' },
}

function Items({ entry }) {
  const { t, lang } = useT()
  return (
    <ul className="space-y-2">
      {entry.items.map((it, i) => {
        const tag = TAGS[it.tag] ?? TAGS.new
        const Icon = tag.icon
        return (
          <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + i * 0.05 }} className="flex items-start gap-2.5 text-sm text-slate-200">
            <span className={clsx('mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ring-1 ring-inset', tag.cls)}>
              <Icon className="h-3 w-3" /> {t(`updates.tags.${it.tag}`)}
            </span>
            <span className="leading-relaxed">{pick(it, lang)}</span>
          </motion.li>
        )
      })}
    </ul>
  )
}

/** The pop-up: a mini banner for the release, what changed, and older updates below. */
function UpdateLogModal() {
  const { t, lang } = useT()
  const { open, close } = useUpdateLog()
  const [older, setOlder] = useState(false)
  if (!open) return null
  const { entry, mode, at } = open
  const [c1, c2, c3] = entry.colors ?? ['#22d3ee', '#a855f7', '#f472b6']
  const done = () => {
    writeSeen(entry.version)
    if (mode === 'reload') window.location.reload()
    else close()
  }
  const rest = CHANGELOG.filter((e) => e.version !== entry.version)
  return (
    <Modal open onClose={done} title={t('updates.title')} size="md">
      <div className="update-banner relative -mt-1 overflow-hidden rounded-2xl p-5" style={{ '--u1': c1, '--u2': c2, '--u3': c3 ?? c1 }}>
        <span className="update-banner__shine" aria-hidden="true" />
        <span className="update-banner__emoji" aria-hidden="true">{entry.emoji}</span>
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-extrabold tracking-wider text-white ring-1 ring-inset ring-white/20">
            v{entry.version} {mode === 'reload' && <span className="rounded-full bg-white px-1.5 text-[9px] uppercase text-ink-950">{t('updates.live')}</span>}
          </span>
          <h2 className="mt-3 max-w-[80%] font-display text-2xl font-extrabold leading-tight tracking-tight text-white">{pick(entry.title, lang)}</h2>
          <p className="mt-1.5 max-w-[85%] text-sm text-white/80">{pick(entry.tagline, lang)}</p>
          <p className="mt-3 text-[11px] font-semibold text-white/60">{formatRelease(at, lang) ?? entry.date}</p>
        </div>
      </div>

      <div className="mt-5"><Items entry={entry} /></div>

      {rest.length > 0 && (
        <div className="mt-5 border-t hairline pt-3">
          <button type="button" onClick={() => setOlder((v) => !v)} className="flex w-full items-center justify-between text-xs font-bold text-slate-400 hover:text-white" aria-expanded={older}>
            {t('updates.older')} <ChevronDown className={clsx('h-4 w-4 transition', older && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {older && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="max-h-72 space-y-4 overflow-y-auto pt-3 pr-1">
                  {rest.map((e) => (
                    <section key={e.version}>
                      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-white"><span aria-hidden="true">{e.emoji}</span> v{e.version} · {pick(e.title, lang)} <span className="text-[11px] font-semibold text-slate-500">{e.date}</span></p>
                      <Items entry={e} />
                    </section>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <Button size="lg" className="mt-6 w-full" onClick={done}>
        {mode === 'reload' ? <><RefreshCw className="h-4 w-4" /> {t('updates.reload')}</> : t('updates.ok')}
      </Button>
    </Modal>
  )
}

/**
 * Shows the update log once per new version (after a reload), and watches version.json while the tab is open:
 * when the server publishes a new build, the log for it pops up with a reload button.
 */
export default function UpdateLog() {
  const show = useUpdateLog((s) => s.show)
  useEffect(() => {
    // Signed-in players see the log once per version (this component only mounts inside the app layout).
    if (readSeen() !== BUILD.version) show(CHANGELOG[0], 'current', BUILD.at)
  }, [show])

  useEffect(() => {
    if (!SERVER_MODE || !BUILD.sha) return
    let alive = true
    let announced = null
    const check = async () => {
      try {
        const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const v = await res.json()
        if (alive && v?.sha && v.sha !== BUILD.sha && v.sha !== announced && v.entry) {
          announced = v.sha
          show(v.entry, 'reload', v.at ? Date.parse(v.at) : null)
        }
      } catch {
        /* offline: try again next tick */
      }
    }
    const id = setInterval(check, POLL_MS)
    const onFocus = () => document.visibilityState === 'visible' && check()
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [show])

  return <UpdateLogModal />
}
