import { Fragment, useMemo } from 'react'
import { Crown, Dice5, Flame, Gem, Shield, Sparkles, Sprout, Star, Target, Zap } from 'lucide-react'
import clsx from 'clsx'
import RoleTag from './RoleTag'
import FormattedText, { stripCodes } from './FormattedText'
import { usePrefsStore } from '@/store/usePrefsStore'
import { useT } from '@/i18n'
import { cardOf, emoteMap, itemOf, roleOf, useCatalog } from '@/services/platform2'

/**
 * Player identity pieces shared by chat, profile, leaderboard and friends:
 * styled names (name effects), tags (staff, loyalty card, progression role, VIP), emote text.
 * Style data comes from the server catalog; nothing here decides ownership.
 */

const ROLE_ICONS = { sprout: Sprout, dice: Dice5, target: Target, flame: Flame, shield: Shield, gem: Gem, crown: Crown, zap: Zap, star: Star, sparkles: Sparkles }
export const roleIcon = (name) => ROLE_ICONS[name] ?? Sparkles

const gradient = (colors = []) => `linear-gradient(90deg, ${[...colors, colors[0]].filter(Boolean).join(', ')})`

/** Effect styles a name item can carry (style.anim). "glitch: true" on older items maps to glitch. */
const NAME_ANIMS = new Set(['flow', 'glitch', 'wave', 'pulse', 'fire', 'shine', 'electric'])

/** Per-letter effects (watery wave) animate each character; the colors cycle through the item's palette. */
function Letters({ text, colors }) {
  return Array.from(text).map((ch, i) => (
    <span key={i} className="name-fx__ch" style={{ '--i': i, color: colors[i % colors.length] }}>{ch === ' ' ? '\u00a0' : ch}</span>
  ))
}

/**
 * Display name with the equipped name effect. The VVIP prefix / suffix are part of the same run:
 * same font, same baseline, and the effect (gradient, glitch, watery wave, …) covers all of it.
 */
export function StyledName({ user, className, children }) {
  const catalog = useCatalog()
  const fx = itemOf(catalog, user?.style?.nameEffect)
  const colors = fx?.style?.colors
  const base = children ?? user?.displayName ?? '—'
  const pre = children == null ? user?.namePrefix || null : null
  const suf = children == null ? user?.nameSuffix || null : null
  const hasFx = Array.isArray(colors) && colors.length >= 2
  const anim = hasFx ? (NAME_ANIMS.has(fx.style.anim) ? fx.style.anim : fx.style.glitch ? 'glitch' : 'flow') : null

  if (!hasFx) {
    if (!pre && !suf) return <span className={className}>{base}</span>
    return (
      <span className={clsx('name-run', className)}>
        {pre && <FormattedText text={pre} className="name-affix" />}
        {pre && ' '}
        {base}
        {suf && ' '}
        {suf && <FormattedText text={suf} className="name-affix" />}
      </span>
    )
  }
  const full = typeof base === 'string' ? [pre && stripCodes(pre), base, suf && stripCodes(suf)].filter(Boolean).join(' ') : null
  const style = { backgroundImage: gradient(colors), '--fx-a': colors[0], '--fx-b': colors[1], '--fx-c': colors[2] ?? colors[0] }
  if (anim === 'wave' && full) {
    return <span className={clsx('name-fx-wave', className)} style={{ '--fx-a': colors[0], '--fx-b': colors[1] }} aria-label={full}><Letters text={full} colors={colors} /></span>
  }
  return (
    <span className={clsx('name-fx', `name-fx--${anim}`, className)} style={style} data-text={full ?? undefined}>
      {pre && <><FormattedText text={pre} />{' '}</>}
      {base}
      {suf && <>{' '}<FormattedText text={suf} /></>}
    </span>
  )
}

/** Small loyalty card tag ([SILVER], [GOLD], ...). Hidden for "No Card". */
export function CardTag({ slug, className }) {
  const catalog = useCatalog()
  if (!slug || slug === 'none') return null
  const card = cardOf(catalog, slug)
  return (
    <span className={clsx('id-tag', `card-tag card-tag--${slug}`, className)} style={{ '--tag': card.color }} title={`${card.name} card`}>
      {slug === 'monarch' ? <span className="card-tag__crown" aria-hidden="true">♛</span> : slug === 'vivace' ? <span className="card-tag__crown card-tag__clef" aria-hidden="true">𝄞</span> : <span className="card-tag__chip" aria-hidden="true" />}
      <span className="card-tag__name" data-text={card.name}>{card.name}</span>
    </span>
  )
}

/** Progression role tag ([NEWCOMER] … [LEGENDARY]); the bling grows with the rank (index.css, .role-chip--r0…r6). */
export function PlayerRoleTag({ slug, className, showNewcomer = false }) {
  const catalog = useCatalog()
  const role = roleOf(catalog, slug)
  if (!role || (!showNewcomer && role.rank === 0)) return null
  const Icon = roleIcon(role.icon)
  return (
    <span className={clsx('id-tag role-chip', `role-chip--r${Math.max(0, Math.min(6, role.rank))}`, `role-chip--${slug}`, className)} style={{ '--tag': role.color }} title={role.name}>
      <span className="role-chip__fx" aria-hidden="true"><i /><i /><i /></span>
      <Icon className="role-chip__icon" strokeWidth={2.6} aria-hidden="true" />
      <span className="role-chip__text" data-text={role.name}>{role.name}</span>
    </span>
  )
}

export function MemberTag({ tier, className }) {
  if (!tier) return null
  return <span className={clsx('id-tag member-tag', `member-tag--${tier}`, className)}>{tier === 'vvip' ? 'VVIP' : 'VIP'}</span>
}

/** Equipped badge from the shop (glyph). */
export function StyleBadge({ user, className }) {
  const catalog = useCatalog()
  const b = itemOf(catalog, user?.style?.badge)
  if (!b?.style?.glyph) return null
  return <span className={clsx('style-badge', className)} style={{ color: b.style.color ?? '#e2e8f0', '--sb': b.style.color ?? '#e2e8f0' }} title={b.description ? `${b.name} — ${b.description}` : b.name} aria-label={b.name}>{b.style.glyph}</span>
}

/** All tags for a user, in a fixed order: staff → membership → loyalty card → progression role.
 *  `max` (default: the viewer's "visible role tags" setting) hides the rest behind a "+N" chip; nothing is removed. */
export function UserTags({ user, className, compact = false, max, withBadge = true }) {
  const { t } = useT()
  const pref = usePrefsStore((s) => s.maxRoleTags ?? 3)
  const catalog = useCatalog()
  if (!user) return null
  const limit = max ?? pref
  const items = []
  if (['super_admin', 'admin', 'moderator', 'support', 'developer'].includes(user.role)) items.push({ k: 'r', label: t(`admin.roles.${user.role}`), el: <RoleTag key="r" role={user.role} /> })
  if (user.membership) items.push({ k: 'm', label: user.membership.toUpperCase(), el: <MemberTag key="m" tier={user.membership} /> })
  if (user.loyaltyCard && user.loyaltyCard !== 'none') items.push({ k: 'c', label: cardOf(catalog, user.loyaltyCard)?.name ?? user.loyaltyCard, el: <CardTag key="c" slug={user.loyaltyCard} /> })
  if (!compact && user.playerRole) {
    const role = roleOf(catalog, user.playerRole)
    if (role) items.push({ k: 'p', label: role.name, el: <PlayerRoleTag key="p" slug={user.playerRole} showNewcomer /> })
  }
  const shown = limit >= items.length ? items : items.slice(0, Math.max(0, limit))
  const hidden = items.slice(shown.length)
  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-1 align-middle', className)}>
      {shown.map((x) => x.el)}
      {hidden.length > 0 && <span className="id-tag tag-more" title={hidden.map((x) => x.label).join(' · ')} aria-label={hidden.map((x) => x.label).join(', ')}>+{hidden.length}</span>}
      {withBadge && <StyleBadge user={user} />}
    </span>
  )
}

/**
 * The standard way to show a player: [ROLE TAGS] [PREFIX] Name [SUFFIX] [badge].
 * Tags sit LEFT of the name (limited by the viewer's setting, "+N" for the rest); the equipped badge sits right.
 */
export function PlayerName({ user, className, nameClassName, compact = true, max, tags = true }) {
  if (!user) return null
  return (
    <span className={clsx('player-name inline-flex min-w-0 items-center gap-1.5', className)}>
      {tags && <UserTags user={user} compact={compact} max={max} withBadge={false} className="shrink-0" />}
      <StyledName user={user} className={clsx('min-w-0 truncate', nameClassName)} />
      <StyleBadge user={user} className="shrink-0" />
    </span>
  )
}

/** One emote glyph, animated per catalog setting. */
export function Emote({ emote, size = 'md', className }) {
  if (!emote) return null
  const text = emote.glyph.length > 2 && /^[A-Za-z]+$/.test(emote.glyph)
  return (
    <span className={clsx('emote', `emote--${size}`, emote.anim !== 'none' && `emote-anim--${emote.anim}`, text && 'emote--text', className)} title={`:${emote.code}:`} role="img" aria-label={emote.name}>
      {emote.glyph}
    </span>
  )
}

/** Chat text: @mentions highlighted, :emote: tokens drawn as emotes. Unknown tokens stay plain text. */
export function RichText({ text, myUsername }) {
  const catalog = useCatalog()
  const map = useMemo(() => emoteMap(catalog), [catalog])
  const parts = String(text ?? '').split(/(@[a-zA-Z0-9_]{3,16}|:[a-z]{2,12}:)/g)
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 3) {
      const mine = part.slice(1).toLowerCase() === myUsername?.toLowerCase()
      return <span key={i} className={clsx('font-semibold', mine ? 'rounded bg-neon-cyan/15 px-0.5 text-neon-cyan' : 'text-neon-cyan')}>{part}</span>
    }
    if (part.startsWith(':') && part.endsWith(':') && map[part.slice(1, -1)]) return <Emote key={i} emote={map[part.slice(1, -1)]} />
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** Inline style for a chat message with an equipped chat effect. */
export function chatEffectProps(catalog, user) {
  const fx = itemOf(catalog, user?.style?.chatEffect)
  // VVIP: highlighted messages (used when no chat effect is equipped).
  if (!fx?.style?.color && user?.membership === 'vvip') return { className: 'chat-highlight' }
  if (!fx?.style?.color) return {}
  return {
    className: clsx('chat-fx', fx.style.animated && 'chat-fx--animated'),
    style: { '--fx': fx.style.color, '--fx2': fx.style.color2 ?? fx.style.color },
  }
}

/** Profile banner: theme colors + animated profile effect. */
export function ProfileBanner({ user, fallback, className }) {
  const catalog = useCatalog()
  const theme = itemOf(catalog, user?.style?.theme)
  const fx = itemOf(catalog, user?.style?.profileEffect)
  const colors = theme?.style?.colors
  // Banner upload pemain (gambar sendiri) menang atas tema; efek profil tetap tampil di atasnya.
  const image = user?.bannerUrl
  return (
    <div
      className={clsx('relative overflow-hidden', !colors && !image && fallback, className)}
      style={image ? { backgroundImage: `url("${image}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : colors ? { backgroundImage: `linear-gradient(120deg, ${colors[0]}, ${colors[1] ?? colors[0]})` } : undefined}
    >
      {image && <span className="absolute inset-0 bg-gradient-to-t from-ink-950/50 to-transparent" aria-hidden="true" />}
      {fx?.style?.kind && <ProfileFx kind={fx.style.kind} colors={fx.style.colors ?? ['#22d3ee', '#a855f7']} />}
    </div>
  )
}

export function ProfileFx({ kind, colors }) {
  if (kind === 'scan') return <span className="pfx-scan" style={{ '--c1': colors[0] }} aria-hidden="true" />
  if (kind === 'notes') return <span className="fx-vivace" aria-hidden="true">{['♪', '♫', '𝄞', '♩', '♬', '♪'].map((n, i) => <span key={i} style={{ left: `${8 + i * 16}%`, animationDelay: `${i * -1.15}s`, fontSize: `${14 + (i % 3) * 5}px` }}>{n}</span>)}</span>
  if (kind === 'stars') return <span className="pfx-stars" style={{ '--c1': colors[0], '--c2': colors[1] ?? colors[0] }} aria-hidden="true" />
  return (
    <span className="pfx-aurora" aria-hidden="true">
      {colors.slice(0, 3).map((c, i) => <span key={i} style={{ background: c, animationDelay: `${i * -4}s` }} />)}
    </span>
  )
}

/** Ring color for an avatar from an equipped shop frame (null → default). */
export function useFrameColor(user) {
  const catalog = useCatalog()
  return itemOf(catalog, user?.style?.frame)?.style?.color ?? null
}
