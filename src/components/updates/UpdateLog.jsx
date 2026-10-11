import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Play, RefreshCw, Sparkles, Wrench, Zap } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { BUILD, CHANGELOG, formatRelease, versionLabel } from '@/config/build'
import { SERVER_MODE } from '@/config/runtime'
import { pick, useT } from '@/i18n'
import { isRelease, useChangelog, useRelease } from '@/config/release'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import ReleaseTrailer, { trailerSeen } from './ReleaseTrailer'

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
export const openUpdateLog = () => useUpdateLog.getState().show(null, 'browse', BUILD.at)

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

/** The whole journey: one card per version on a glowing timeline, Release first, then every BETA. */
function Timeline({ entries }) {
  const { t, lang } = useT()
  const [openV, setOpenV] = useState(null)
  return (
    <ol className="relative space-y-3 pl-6 before:absolute before:bottom-2 before:left-[9px] before:top-2 before:w-0.5 before:bg-gradient-to-b before:from-neon-cyan/60 before:via-violet-500/40 before:to-transparent">
      {entries.map((e, i) => {
        const [c1, c2] = e.colors ?? ['#22d3ee', '#a855f7']
        const open = openV === e.version
        return (
          <motion.li key={e.version} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 12) * 0.03 }} className="relative">
            <span className="absolute -left-6 top-3 grid h-5 w-5 place-items-center rounded-full ring-4 ring-ink-950" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }} />
            <button type="button" onClick={() => setOpenV(open ? null : e.version)} className="w-full rounded-xl bg-white/[0.03] p-3 text-left ring-1 ring-inset ring-white/[0.06] transition hover:bg-white/[0.05]" aria-expanded={open}>
              <div className="flex items-center gap-2">
                <span className={clsx('rounded-md px-1.5 py-0.5 font-mono text-[10px] font-black', isRelease(e.version) ? 'bg-amber-300 text-amber-950' : 'bg-white/10 text-slate-200')}>v{versionLabel(e.version)}</span>
                <span className="text-[11px] text-slate-500">{e.date}</span>
                <ChevronDown className={clsx('ml-auto h-4 w-4 text-slate-500 transition', open && 'rotate-180')} />
              </div>
              <p className="mt-1.5 font-display text-sm font-bold text-white">{pick(e.title, lang)}</p>
              <p className="mt-0.5 text-xs text-slate-400">{pick(e.tagline, lang)}</p>
            </button>
            <AnimatePresence initial={false}>
              {open && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-1 pb-1 pt-3"><Items entry={e} /></div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.li>
        )
      })}
      <li className="pl-0 text-[11px] font-semibold text-slate-600">{t('updates.journeyStart')}</li>
    </ol>
  )
}

/** The pop-up: a mini banner for the release, what changed, and older updates below. */
function UpdateLogModal() {
  const { t, lang } = useT()
  const { open, close } = useUpdateLog()
  const list = useChangelog()
  const [older, setOlder] = useState(false)
  if (!open) return null
  const { mode, at } = open
  const entry = open.entry ?? list[0]
  const release = isRelease(entry.version)
  const [c1, c2, c3] = entry.colors ?? ['#22d3ee', '#a855f7', '#f472b6']
  const done = () => {
    writeSeen(entry.version)
    if (mode === 'reload') window.location.reload()
    else close()
  }
  const rest = list.filter((e) => e.version !== entry.version)
  return (
    <Modal open onClose={done} title={release ? t('updates.releaseTitle') : t('updates.title')} size={release ? 'lg' : 'md'}>
      <div className="update-banner relative -mt-1 overflow-hidden rounded-2xl p-5" style={{ '--u1': c1, '--u2': c2, '--u3': c3 ?? c1 }}>
        <span className="update-banner__shine" aria-hidden="true" />
        <span className="update-banner__emoji" aria-hidden="true">{entry.emoji}</span>
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-2.5 py-1 text-[11px] font-extrabold tracking-wider text-white ring-1 ring-inset ring-white/20">
            v{versionLabel(entry.version)} {mode === 'reload' && <span className="rounded-full bg-white px-1.5 text-[9px] uppercase text-ink-950">{t('updates.live')}</span>}
          </span>
          <h2 className="mt-3 max-w-[80%] font-display text-2xl font-extrabold leading-tight tracking-tight text-white">{pick(entry.title, lang)}</h2>
          <p className="mt-1.5 max-w-[85%] text-sm text-white/80">{pick(entry.tagline, lang)}</p>
          <p className="mt-3 text-[11px] font-semibold text-white/60">{formatRelease(at, lang) ?? entry.date}</p>
        </div>
      </div>

      <div className="mt-5"><Items entry={entry} /></div>

      {release && (
        <div className="mt-6 border-t hairline pt-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-display text-sm font-bold text-white">{t('updates.journey', { n: list.length })}</p>
            <button type="button" onClick={() => useTrailer.getState().play()} className="flex items-center gap-1.5 rounded-lg bg-white/[0.05] px-2.5 py-1 text-xs font-bold text-neon-cyan ring-1 ring-inset ring-white/10 hover:bg-white/[0.08]"><Play className="h-3.5 w-3.5" /> {t('updates.watchTrailer')}</button>
          </div>
          <div className="max-h-[420px] overflow-y-auto pr-1"><Timeline entries={rest} /></div>
        </div>
      )}

      {!release && rest.length > 0 && (
        <div className="mt-5 border-t hairline pt-3">
          <button type="button" onClick={() => setOlder((v) => !v)} className="flex w-full items-center justify-between text-xs font-bold text-slate-400 hover:text-white" aria-expanded={older}>
            {t('updates.older')} <ChevronDown className={clsx('h-4 w-4 transition', older && 'rotate-180')} />
          </button>
          <AnimatePresence initial={false}>
            {older && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="max-h-72 space-y-4 overflow-y-auto pt-3 pr-1">
                  {rest.slice(0, 40).map((e) => (
                    <section key={e.version}>
                      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-white"><span aria-hidden="true">{e.emoji}</span> v{versionLabel(e.version)} · {pick(e.title, lang)} <span className="text-[11px] font-semibold text-slate-500">{e.date}</span></p>
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

const releaseVisibleNow = () => {
  if (usePlatformStore.getState().release?.published) return true
  const a = useAuthStore.getState()
  const u = a.session ? a.users[a.session.email] : null
  return ['owner', 'super_admin', 'admin', 'moderator', 'support', 'developer'].includes(u?.role)
}

/** Trailer open state (the release trailer can be replayed from the update log). */
export const useTrailer = create((set) => ({ on: false, play: () => set({ on: true }), stop: () => set({ on: false }) }))

/**
 * Shows the update log once per new version (after a reload), and watches version.json while the tab is open:
 * when the server publishes a new build, the log for it pops up with a reload button.
 * The 1.0.0 release (staff in DEV TEST, everyone once published) first plays the trailer, once per player.
 */
export default function UpdateLog() {
  const show = useUpdateLog((s) => s.show)
  const list = useChangelog()
  const { visible } = useRelease()
  const me = useCurrentUser()
  const trailer = useTrailer()
  const latest = list[0]
  useEffect(() => {
    if (!latest || readSeen() === latest.version) return
    if (isRelease(latest.version) && visible) {
      if (!me?.id) return // wait for sign-in: the trailer plays before the release log
      if (!trailerSeen(me.id)) return trailer.play()
    }
    show(latest, 'current', BUILD.at)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.version, visible, me?.id])

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
          // Players don't get the 1.0.0 release notes before it is published: they see the reload prompt with the latest BETA notes.
          const hidden = isRelease(v.entry.version) && !releaseVisibleNow()
          show(hidden ? CHANGELOG.find((e) => !isRelease(e.version)) : v.entry, 'reload', v.at ? Date.parse(v.at) : null)
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

  return (
    <>
      <UpdateLogModal />
      {trailer.on && <ReleaseTrailer userId={me?.id} onDone={() => { trailer.stop(); if (readSeen() !== latest?.version) show(latest, 'current', BUILD.at) }} />}
    </>
  )
}
