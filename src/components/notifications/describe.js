import { ArrowDownLeft, AtSign, Award, Coins, Megaphone, Clock3, Gift, ListChecks, Send, ShieldAlert, Sparkles, Ticket, Trophy, XCircle, UserPlus, UserCheck, Flag, LifeBuoy } from 'lucide-react'
import { formatCoins } from '@/utils/format'
import { ITEMS } from '@/config/economy'
import { getGameName } from '@/config/games'
import { pick } from '@/i18n'

export const rewardsText = (rewards, lang) =>
  (rewards ?? [])
    .map((r) => {
      if (!r || typeof r !== 'object') return r == null ? '' : String(r)
      if (r.kind === 'item') return pick(ITEMS[r.id]?.name ?? r.name, lang) ?? r.id ?? ''
      return r.amount != null ? `${formatCoins(r.amount)} ${r.kind ?? ''}`.trim() : pick(r.name ?? r.label, lang) ?? r.kind ?? ''
    })
    .filter(Boolean)
    .join(' + ')

const META = {
  transferIn: { icon: ArrowDownLeft, tone: 'text-neon-green bg-neon-green/10' },
  transferOut: { icon: Send, tone: 'text-neon-cyan bg-neon-cyan/10' },
  transferPending: { icon: Clock3, tone: 'text-neon-gold bg-neon-gold/10' },
  transferFailed: { icon: XCircle, tone: 'text-neon-red bg-neon-red/10' },
  redeem: { icon: Ticket, tone: 'text-neon-purple bg-neon-purple/10' },
  jackpot: { icon: Trophy, tone: 'text-neon-gold bg-neon-gold/10' },
  mention: { icon: AtSign, tone: 'text-neon-cyan bg-neon-cyan/10' },
  levelUp: { icon: Sparkles, tone: 'text-neon-cyan bg-neon-cyan/10' },
  quest: { icon: ListChecks, tone: 'text-neon-green bg-neon-green/10' },
  achievement: { icon: Award, tone: 'text-neon-purple bg-neon-purple/10' },
  daily: { icon: Gift, tone: 'text-neon-gold bg-neon-gold/10' },
  security: { icon: ShieldAlert, tone: 'text-neon-red bg-neon-red/10' },
  adminCredit: { icon: Coins, tone: 'text-neon-gold bg-neon-gold/10' },
  announcement: { icon: Megaphone, tone: 'text-neon-cyan bg-neon-cyan/10' },
  adminDebit: { icon: Coins, tone: 'text-slate-300 bg-white/[0.06]' },
  friendRequest: { icon: UserPlus, tone: 'text-neon-cyan bg-neon-cyan/10' },
  friendAccept: { icon: UserCheck, tone: 'text-neon-green bg-neon-green/10' },
  reportUpdate: { icon: Flag, tone: 'text-neon-gold bg-neon-gold/10' },
  ticket: { icon: LifeBuoy, tone: 'text-neon-purple bg-neon-purple/10' },
  reward: { icon: Gift, tone: 'text-neon-gold bg-neon-gold/10' },
  releaseReset: { icon: Sparkles, tone: 'text-neon-cyan bg-neon-cyan/10' },
}

/** Judul & isi notifikasi dalam bahasa aktif. */
export function describeNotification(t, lang, n) {
  const d = n.data ?? {}
  const amount = d.amount != null ? `${formatCoins(d.amount)} ${d.currency ?? 'AC'}` : ''
  const vars = { amount, user: `@${d.username ?? '—'}`, code: d.code, game: getGameName(d.game), text: d.text }
  if (n.kind === 'redeem' || n.kind === 'daily') vars.reward = rewardsText((d.rewards ?? []).filter((r) => r.kind !== 'XP'), lang) || '—'
  if (n.kind === 'levelUp') {
    vars.level = d.level
    vars.reward = rewardsText(d.rewards, lang)
  }
  if (n.kind === 'reportUpdate') vars.status = t(`moderation.status.${d.status ?? 'new'}`)
  if (n.kind === 'ticket') {
    vars.id = d.ticketId
    vars.status = d.status ? t(`support.status.${d.status}`) : ''
  }
  if (n.kind === 'daily') vars.day = d.day
  if (n.kind === 'quest') vars.quest = t(`rewards.quests.${d.quest}`)
  if (n.kind === 'achievement') vars.achievement = t(`rewards.achievements.${d.achievement}.name`)
  if (n.kind === 'transferFailed') vars.reason = t(`send.reasons.${d.reason ?? 'unknown'}`)
  const prefix = d.test ? '[TEST] ' : ''
  const meta = META[n.kind] ?? META.transferOut
  if (n.kind === 'announcement') return { ...meta, title: d.title, body: d.message }
  if (n.kind === 'security') {
    const event = d.event ?? 'suspicious'
    const sv = { ...vars, until: d.permanent ? t('admin.permanent') : d.until ? new Date(d.until).toLocaleString() : '', reason: d.reason && d.reason !== '—' ? d.reason : '', amount: d.amount != null ? `${formatCoins(Math.abs(d.amount))} ${d.currency ?? 'AC'}` : '' }
    return { ...meta, title: t(`notifications.securityEvents.${event}.title`, sv), body: t(`notifications.securityEvents.${event}.body`, sv) }
  }
  if (n.kind === 'levelUp' && vars.reward) return { ...meta, title: prefix + t('notifications.levelUp.title', vars), body: t('notifications.levelUp.bodyReward', vars) }
  if (n.kind === 'ticket') return { ...meta, title: t(`notifications.ticket.${d.event === 'status' ? 'statusTitle' : 'replyTitle'}`, vars), body: t(`notifications.ticket.${d.event === 'status' ? 'statusBody' : 'replyBody'}`, vars) }
  return {
    ...meta,
    title: prefix + t(`notifications.${n.kind}.title`, vars),
    body: t(`notifications.${n.kind}.body`, vars),
  }
}
