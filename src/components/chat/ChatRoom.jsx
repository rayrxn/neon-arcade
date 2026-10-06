import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, Ban, EyeOff, Flag, MessagesSquare, MicOff, SendHorizontal, ShieldCheck, Smile, Timer, Trash2, Trophy } from 'lucide-react'
import ReportDialog from '@/components/social/ReportDialog'
import { COSMETICS } from '@/config/cosmetics'
import { emotesOf } from '@/services/cosmetics'
import { blockUser } from '@/services/social'
import { toast } from '@/store/useUiStore'
import ReasonDialog from '@/components/admin/ReasonDialog'
import { can } from '@/config/roles'
import { deleteMessage, muteUser } from '@/services/admin'
import clsx from 'clsx'
import Avatar from '@/components/ui/Avatar'
import { DemoTag, EmptyState } from '@/components/ui/Controls'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { isOnline, usePlatformStore } from '@/store/usePlatformStore'
import { MAX_LENGTH, sendMessage, visibleMessages } from '@/services/chat'
import { getGameName } from '@/config/games'
import { useNow } from '@/hooks/useNow'
import { formatCoins, formatTime, timeAgo } from '@/utils/format'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

const EMPTY = []

/** Sorot @mention di teks pesan. */
function MessageText({ text, myUsername }) {
  const parts = text.split(/(@[a-zA-Z0-9_]{3,16})/g)
  return parts.map((part, i) =>
    part.startsWith('@') ? (
      <span key={i} className={clsx('font-semibold', part.slice(1).toLowerCase() === myUsername?.toLowerCase() ? 'rounded bg-neon-cyan/15 px-0.5 text-neon-cyan' : 'text-neon-cyan')}>{part}</span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

function JackpotMessage({ jackpot, now }) {
  const { t } = useT()
  if (!jackpot) return null
  return (
    <div className="mx-3 my-2 flex items-center gap-3 rounded-xl bg-neon-gold/[0.08] px-3 py-2.5 ring-1 ring-inset ring-neon-gold/25 sm:mx-4">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-neon-gold/15 text-neon-gold"><Trophy className="h-4 w-4" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-neon-gold">{t('jackpot.announcement')}</p>
        <p className="text-sm font-semibold text-slate-200">{t('jackpot.wonOn', { user: jackpot.username, amount: `${formatCoins(jackpot.amount)} AC`, game: getGameName(jackpot.game) })}</p>
      </div>
      <span className="shrink-0 self-start text-[11px] text-slate-500">{timeAgo(jackpot.at, now)}</span>
    </div>
  )
}

function UserMessage({ message, author, me, compact, onReport, grouped, onModerate, onBlock }) {
  const { t } = useT()
  const mine = message.userId === me?.id
  const mod = !compact && can(me?.role, 'moderation')
  return (
    <div className={clsx('group relative flex gap-3 px-3 sm:px-4', grouped ? 'pt-0.5' : 'pt-3', mine && 'bg-neon-cyan/[0.03]')}>
      <div className="w-8 shrink-0">{!grouped && <Avatar user={author} name={author?.username} size="sm" />}</div>
      <div className="min-w-0 flex-1 pb-1">
        {!grouped && (
          <p className="flex flex-wrap items-baseline gap-x-1.5">
            <Link to={author ? `/u/${author.username}` : '#'} className={clsx('text-sm font-bold hover:underline', mine ? 'text-neon-cyan' : 'text-white')}>{author?.displayName ?? '—'}</Link>
            {message.badge && COSMETICS[message.badge] && <span className="rounded bg-white/[0.06] px-1 text-[10px] font-bold text-neon-gold" title={COSMETICS[message.badge].name?.en}>{COSMETICS[message.badge].glyph}</span>}
            {!compact && <span className="text-xs text-slate-500">@{author?.username}</span>}
            {author?.isDemo && <DemoTag />}
            <span className="text-[11px] text-slate-600">{formatTime(message.at)}</span>
          </p>
        )}
        {message.deleted ? (
          <p className="text-sm italic text-slate-500">{t('chat.deleted')}</p>
        ) : (
          <p className="break-words text-sm leading-relaxed text-slate-300">
            <MessageText text={message.text} myUsername={me?.username} />
            {message.flagged && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{t('chat.filtered')}</span>}
          </p>
        )}
      </div>
      {mod && !message.deleted && (
        <div className="absolute right-20 top-2 hidden gap-1 group-hover:flex">
          <button onClick={() => onModerate({ kind: 'delete', message, author })} className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-neon-red" title={t('chat.mod.delete')} aria-label={t('chat.mod.delete')}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {!mine && (
            <button onClick={() => onModerate({ kind: 'mute', message, author })} className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-neon-gold" title={t('chat.mod.mute')} aria-label={t('chat.mod.mute')}>
              <MicOff className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {!compact && !mine && !message.deleted && (
        <div className="absolute right-3 top-2 hidden gap-1 group-hover:flex group-focus-within:flex">
          {author && !author.isDemo && (
            <button onClick={() => onBlock(author)} className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-white focus-ring" title={t('chat.block')} aria-label={t('chat.block')}>
              <Ban className="h-3.5 w-3.5" />
            </button>
          )}
          <button onClick={() => onReport(message)} className="rounded-md p-1.5 text-slate-500 hover:bg-white/[0.06] hover:text-neon-red focus-ring" title={t('chat.report')} aria-label={t('chat.report')}>
            <Flag className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Global Chat. `compact` = pratinjau di Home (beberapa pesan terakhir + link).
 * Pesan & author dibaca dari store, jadi edit profil langsung terlihat di chat.
 */
export default function ChatRoom({ compact = false, limit, className }) {
  const { t } = useT()
  const me = useCurrentUser()
  const chat = usePlatformStore((s) => s.chat)
  const jackpots = usePlatformStore((s) => s.jackpots)
  const hidden = usePlatformStore((s) => (me ? s.hidden[me.id] ?? EMPTY : EMPTY))
  const blocks = usePlatformStore((s) => (me ? s.blocks[me.id] ?? EMPTY : EMPTY))
  const slowMode = usePlatformStore((s) => s.chatSettings?.slowMode ?? 0)
  const users = useAuthStore((s) => s.users)
  const now = useNow(30_000)

  const byId = useMemo(() => Object.fromEntries(Object.values(users).map((u) => [u.id, u])), [users])
  const jackpotById = useMemo(() => Object.fromEntries(jackpots.map((j) => [j.id, j])), [jackpots])
  const visible = useMemo(() => {
    const list = visibleMessages({ chat, hidden: { [me?.id]: hidden }, blocks: { [me?.id]: blocks } }, me?.id)
    return limit ? list.slice(-limit) : list
  }, [chat, hidden, blocks, limit, me?.id])

  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [atBottom, setAtBottom] = useState(true)
  const [reportedFlash, setReportedFlash] = useState(false)
  const [modAction, setModAction] = useState(null) // { kind: 'delete' | 'mute', message, author }
  const [reportMsg, setReportMsg] = useState(null)
  const [emoteOpen, setEmoteOpen] = useState(false)
  const emotes = me ? emotesOf(me.id) : []
  const listRef = useRef(null)
  const inputRef = useRef(null)

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Auto-scroll ke pesan terbaru (jika user sedang di bawah atau pesannya sendiri).
  const lastId = visible[visible.length - 1]?.id
  useLayoutEffect(() => {
    const last = visible[visible.length - 1]
    if (atBottom || last?.userId === me?.id) scrollToBottom(false)
  }, [lastId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => scrollToBottom(false), [])

  const onScroll = () => {
    const el = listRef.current
    if (el) setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 60)
  }

  const submit = async (e) => {
    e.preventDefault()
    try {
      await sendMessage(text)
      setText('')
      setError(null)
      setAtBottom(true)
    } catch (err) {
      setError({ code: errorKey(err), vars: err.vars })
    }
    inputRef.current?.focus()
  }

  const report = (message) => setReportMsg(message)
  const block = (author) => {
    try {
      blockUser(author.id)
      toast({ tone: 'success', title: t('friends.blockedToast') })
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err)) })
    }
  }

  return (
    <div className={clsx('relative flex min-h-0 flex-col', className)}>
      <div ref={listRef} onScroll={onScroll} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
        {visible.length === 0 ? (
          <EmptyState icon={MessagesSquare} title={t('chat.empty')} body={t('chat.emptyBody')} />
        ) : (
          visible.map((m, i) => {
            if (m.type === 'jackpot') return <JackpotMessage key={m.id} jackpot={jackpotById[m.jackpotId]} now={now} />
            const prev = visible[i - 1]
            const grouped = prev && prev.type === 'user' && prev.userId === m.userId && m.at - prev.at < 5 * 60_000
            return <UserMessage key={m.id} message={m} author={byId[m.userId]} me={me} compact={compact} grouped={grouped} onReport={report} onModerate={setModAction} onBlock={block} />
          })
        )}
      </div>

      <AnimatePresence>
        {!atBottom && !compact && (
          <motion.button
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            onClick={() => scrollToBottom()}
            style={{ x: '-50%' }}
            className="glass-strong absolute bottom-24 left-1/2 z-10 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-slate-200"
          >
            <ArrowDown className="h-3.5 w-3.5" /> {t('chat.latest')}
          </motion.button>
        )}
      </AnimatePresence>

      {compact ? (
        <Link to="/chat" className="flex items-center justify-center gap-2 border-t hairline px-4 py-3 text-sm font-bold text-neon-cyan hover:bg-white/[0.03]">
          {t('chat.open')}
        </Link>
      ) : (
        <form onSubmit={submit} className="border-t hairline p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <div className="input-shell flex min-w-0 flex-1 items-center pr-2">
              <input
                ref={inputRef}
                id="chat-input"
                value={text}
                maxLength={MAX_LENGTH}
                onChange={(e) => {
                  setText(e.target.value)
                  if (error) setError(null)
                }}
                placeholder={t('chat.placeholder')}
                autoComplete="off"
                className="h-11 min-w-0 flex-1 bg-transparent px-3.5 text-base text-white outline-none placeholder:text-slate-600 sm:text-sm"
              />
              {text.length > MAX_LENGTH - 40 && <span className="num font-mono text-[11px] text-slate-500">{MAX_LENGTH - text.length}</span>}
              <div className="relative">
                <button type="button" onClick={() => setEmoteOpen((o) => !o)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:text-white focus-ring" aria-label={t('chat.emotes')} aria-expanded={emoteOpen}>
                  <Smile className="h-4 w-4" />
                </button>
                {emoteOpen && (
                  <div className="glass-strong absolute bottom-10 right-0 z-20 flex w-48 flex-wrap gap-1 rounded-xl p-2">
                    {emotes.map((e) => (
                      <button key={e.id} type="button" onClick={() => { setText((v) => `${v}${v && !v.endsWith(' ') ? ' ' : ''}:${e.code}: `); setEmoteOpen(false); inputRef.current?.focus() }} className="grid h-9 min-w-9 place-items-center rounded-lg px-1.5 text-base hover:bg-white/[0.08]" title={`:${e.code}:`}>
                        {e.glyph}
                      </button>
                    ))}
                    <Link to="/inventory" className="w-full pt-1 text-center text-[10px] text-slate-500 hover:text-white">{t('chat.moreEmotes')}</Link>
                  </div>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={!text.trim()}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-neon-cyan text-onaccent transition hover:brightness-110 disabled:opacity-40 focus-ring"
              aria-label={t('chat.send')}
            >
              <SendHorizontal className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="mt-2 flex min-h-[18px] items-center gap-1.5 text-[11px]">
            {error ? (
              <span className="font-semibold text-neon-red" role="alert">{t(error.code, error.vars)}</span>
            ) : reportedFlash ? (
              <span className="flex items-center gap-1 font-semibold text-slate-400"><EyeOff className="h-3 w-3" /> {t('chat.reported')}</span>
            ) : (
              <span className="flex items-center gap-1 text-slate-600">
                {slowMode > 0 ? <><Timer className="h-3 w-3" /> {t('chat.slowModeOn', { n: slowMode })}</> : <><ShieldCheck className="h-3 w-3" /> {t('chat.rules')}</>}
              </span>
            )}
          </div>
        </form>
      )}
      <ReasonDialog
        open={!!modAction}
        onClose={() => setModAction(null)}
        adminName={me?.username}
        title={modAction?.kind === 'mute' ? t('chat.mod.muteTitle', { user: modAction?.author?.username ?? '' }) : t('chat.mod.deleteTitle')}
        description={modAction?.message?.text}
        confirmLabel={modAction?.kind === 'mute' ? t('chat.mod.mute') : t('chat.mod.delete')}
        onConfirm={(reason) => (modAction.kind === 'mute' ? muteUser(modAction.message.userId, 10, reason) : deleteMessage(modAction.message.id, reason))}
      />
      <ReportDialog
        open={!!reportMsg}
        onClose={() => setReportMsg(null)}
        preset={{ targetType: 'message', targetUserId: reportMsg?.userId, targetName: byId[reportMsg?.userId]?.username, messageId: reportMsg?.id, reason: 'offensive' }}
      />
    </div>
  )
}

/** Daftar user + status online (presence). */
export function OnlineList({ className }) {
  const { t } = useT()
  const users = useAuthStore((s) => s.users)
  const meId = useAuthStore((s) => s.session?.userId)
  const presence = usePlatformStore((s) => s.presence)
  const chat = usePlatformStore((s) => s.chat)
  const now = useNow(15_000)
  const lastSeen = (id) => Math.max(presence[id] ?? 0, ...chat.filter((m) => m.userId === id).map((m) => m.at), 0)
  const list = Object.values(users)
    // User yang sedang membuka halaman ini pasti online, walau ping presence belum terkirim.
    .map((u) => ({ user: u, online: u.id === meId || isOnline(presence, u.id, now), seen: lastSeen(u.id) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || b.seen - a.seen)

  return (
    <ul className={clsx('space-y-0.5', className)}>
      {list.map(({ user, online, seen }) => (
        <li key={user.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5">
          <Avatar user={user} size="sm" online={online} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-200">{user.displayName} {user.isDemo && <DemoTag />}</p>
            <p className="truncate text-[11px] text-slate-500">{online ? t('chat.online') : seen ? t('chat.lastSeen', { time: timeAgo(seen, now) }) : t('chat.offline')}</p>
          </div>
        </li>
      ))}
    </ul>
  )
}
