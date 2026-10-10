import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as ReactDOM from 'react-dom'
import { Link } from 'react-router-dom'
import { CalendarDays, Circle, UserRound, X } from 'lucide-react'
import clsx from 'clsx'
import Avatar from '@/components/ui/Avatar'
import FormattedText from '@/components/ui/FormattedText'
import { PlayerName, ProfileBanner, UserTags } from '@/components/ui/Identity'
import { useProgressStore } from '@/store/useProgressStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useCurrentUser } from '@/store/useAuthStore'
import { levelFromXp } from '@/config/progression'
import { formatDate } from '@/utils/format'
import { useT } from '@/i18n'

const ONLINE_MS = 75_000

/**
 * Discord-style mini profile: click a name or avatar to see banner, avatar, tags, level and presence without
 * leaving the page. Keyboard: Enter/Space opens, Esc closes and returns focus. On phones it opens as a bottom sheet.
 * Shows only public profile data (no email, balances or moderation details).
 */
export default function ProfilePopover({ user, children, className }) {
  const { t } = useT()
  const me = useCurrentUser()
  const trigger = useRef(null)
  const panel = useRef(null)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const xp = useProgressStore((s) => (user ? s.byUser[user.id]?.xp ?? 0 : 0))
  const seen = usePlatformStore((s) => (user ? s.presence?.[user.id] : null))

  const place = () => {
    const r = trigger.current?.getBoundingClientRect()
    if (!r) return
    const w = 300
    const h = panel.current?.offsetHeight ?? 280
    const left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8)
    const below = r.bottom + 8 + h < window.innerHeight
    setPos({ left, top: below ? r.bottom + 8 : Math.max(8, r.top - h - 8) })
  }
  useLayoutEffect(() => { if (open) place() }, [open])
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    const onDown = (e) => { if (!panel.current?.contains(e.target) && !trigger.current?.contains(e.target)) setOpen(false) }
    const onMove = () => place()
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    setTimeout(() => panel.current?.focus(), 0)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  if (!user) return <span className={className}>{children}</span>
  const online = user.id === me?.id || (seen && Date.now() - seen < ONLINE_MS)
  const level = levelFromXp(xp).level
  const mobile = typeof window !== 'undefined' && window.innerWidth < 640

  return (
    <>
      <span
        ref={trigger}
        role="button"
        tabIndex={0}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v) }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((v) => !v) } }}
        className={clsx('cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-neon-cyan/60', className)}
      >
        {children}
      </span>
      {open && ReactDOM.createPortal(
        <>
          {mobile && <div className="fixed inset-0 z-[80] bg-black/50" onClick={() => setOpen(false)} aria-hidden="true" />}
          <div
            ref={panel}
            role="dialog"
            aria-label={user.displayName ?? user.username}
            tabIndex={-1}
            className={clsx('mini-profile z-[81] overflow-hidden bg-ink-900 shadow-pop ring-1 ring-inset ring-white/10 outline-none',
              mobile ? 'fixed inset-x-0 bottom-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'fixed w-[300px] rounded-2xl')}
            style={!mobile && pos ? { left: pos.left, top: pos.top } : !mobile ? { visibility: 'hidden', left: 0, top: 0 } : undefined}
          >
            <ProfileBanner user={user} className="h-20" fallback="bg-gradient-to-r from-neon-cyan/30 to-neon-purple/30" />
            <button onClick={() => setOpen(false)} className="absolute right-2 top-2 rounded-lg bg-black/40 p-1 text-white/80 hover:text-white" aria-label={t('common.close')}><X className="h-4 w-4" /></button>
            <div className="relative px-4 pb-4">
              <div className="-mt-8 flex items-end gap-3">
                <span className="rounded-full ring-4 ring-ink-900"><Avatar user={user} size="lg" online={online} /></span>
                <span className={clsx('mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold', online ? 'bg-neon-green/15 text-neon-green' : 'bg-white/[0.06] text-slate-400')}>
                  <Circle className="h-2 w-2 fill-current" /> {online ? t('miniProfile.online') : t('miniProfile.offline')}
                </span>
              </div>
              <p className="mt-2 text-base font-bold text-white"><PlayerName user={user} tags={false} /></p>
              <p className="text-xs text-slate-500">@{user.username}</p>
              {user.status && <p className="mt-1 text-xs text-slate-300"><FormattedText text={user.status} /></p>}
              <div className="mt-2"><UserTags user={user} max={99} /></div>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-white/[0.04] px-2.5 py-2"><dt className="text-slate-500">{t('miniProfile.level')}</dt><dd className="num font-mono font-bold text-white">{level}</dd></div>
                <div className="rounded-lg bg-white/[0.04] px-2.5 py-2"><dt className="flex items-center gap-1 text-slate-500"><CalendarDays className="h-3 w-3" /> {t('miniProfile.joined')}</dt><dd className="font-semibold text-white">{user.createdAt ? formatDate(user.createdAt) : '—'}</dd></div>
              </dl>
              <Link to={`/u/${user.username}`} onClick={() => setOpen(false)} className="mt-3 flex h-9 items-center justify-center gap-2 rounded-xl bg-white/[0.06] text-sm font-bold text-white hover:bg-white/[0.1]">
                <UserRound className="h-4 w-4" /> {t('miniProfile.view')}
              </Link>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  )
}
