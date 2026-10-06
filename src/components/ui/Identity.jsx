import { Fragment, useMemo } from 'react'
import { Crown, Dice5, Flame, Gem, Shield, Sparkles, Sprout, Star, Target, Zap } from 'lucide-react'
import clsx from 'clsx'
import RoleTag from './RoleTag'
import { cardOf, emoteMap, itemOf, roleOf, useCatalog } from '@/services/platform2'

/**
 * Player identity pieces shared by chat, profile, leaderboard and friends:
 * styled names (name effects), tags (staff, loyalty card, progression role, VIP), emote text.
 * Style data comes from the server catalog; nothing here decides ownership.
 */

const ROLE_ICONS = { sprout: Sprout, dice: Dice5, target: Target, flame: Flame, shield: Shield, gem: Gem, crown: Crown, zap: Zap, star: Star, sparkles: Sparkles }
export const roleIcon = (name) => ROLE_ICONS[name] ?? Sparkles

const gradient = (colors = []) => `linear-gradient(90deg, ${[...colors, colors[0]].filter(Boolean).join(', ')})`

/** Display name with the equipped name effect (gradient + motion). */
export function StyledName({ user, className, children }) {
  const catalog = useCatalog()
  const fx = itemOf(catalog, user?.style?.nameEffect)
  const colors = fx?.style?.colors
  const text = children ?? user?.displayName ?? '—'
  // VVIP prefix / suffix around the name (only when the name itself is shown).
  const pre = children == null && user?.namePrefix ? <span className="name-affix">{user.namePrefix}</span> : null
  const suf = children == null && user?.nameSuffix ? <span className="name-affix">{user.nameSuffix}</span> : null
  const name = !colors || colors.length < 2 ? (
    <span className={pre || suf ? undefined : className}>{text}</span>
  ) : (
    <span className={clsx('name-fx', fx.style.glitch && 'name-fx--glitch', !(pre || suf) && className)} style={{ backgroundImage: gradient(colors) }} data-text={typeof text === 'string' ? text : undefined}>
      {text}
    </span>
  )
  if (!pre && !suf) return name
  return <span className={clsx('inline-flex min-w-0 items-baseline gap-1', className)}>{pre}{name}{suf}</span>
}

/** Small loyalty card tag ([SILVER], [GOLD], ...). Hidden for "No Card". */
export function CardTag({ slug, className }) {
  const catalog = useCatalog()
  if (!slug || slug === 'none') return null
  const card = cardOf(catalog, slug)
  return (
    <span className={clsx('id-tag', `card-tag card-tag--${slug}`, className)} style={{ '--tag': card.color }} title={`${card.name} card`}>
      <span className="card-tag__chip" aria-hidden="true" />
      {card.name}
    </span>
  )
}

/** Progression role tag ([NEWCOMER], [EXPERT], ...). */
export function PlayerRoleTag({ slug, className, showNewcomer = false }) {
  const catalog = useCatalog()
  const role = roleOf(catalog, slug)
  if (!role || (!showNewcomer && role.rank === 0)) return null
  const Icon = roleIcon(role.icon)
  return (
    <span className={clsx('id-tag role-chip', className)} style={{ '--tag': role.color }} title={role.name}>
      <Icon className="h-2.5 w-2.5" strokeWidth={2.6} aria-hidden="true" />
      {role.name}
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
  return <span className={clsx('style-badge', className)} style={{ color: b.style.color ?? '#e2e8f0' }} title={b.name}>{b.style.glyph}</span>
}

/** All tags for a user, in a fixed order: staff → membership → loyalty card → progression role → badge. */
export function UserTags({ user, className, compact = false }) {
  if (!user) return null
  return (
    <span className={clsx('inline-flex flex-wrap items-center gap-1 align-middle', className)}>
      <RoleTag role={user.role} />
      <MemberTag tier={user.membership} />
      <CardTag slug={user.loyaltyCard} />
      {!compact && <PlayerRoleTag slug={user.playerRole} showNewcomer />}
      <StyleBadge user={user} />
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
