import { Crown, FlaskConical, Gavel, LifeBuoy, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { useT } from '@/i18n'

/**
 * Staff tag next to the name. Each role has its own theme (index.css, .role-tag--*):
 * Owner = emerald crown with a rotating aurora ring and rising sparks,
 * Admin = crimson enforcer plate with moving energy stripes and a beveled cut,
 * Moderator = gold justice plate with a striking gavel,
 * Helper = ocean lifeline with rolling water,
 * Tester = orange lab plate with bubbling particles and a code glitch.
 * Staff tags sit above every card and membership tag.
 */
const ICONS = { super_admin: Crown, admin: ShieldCheck, moderator: Gavel, support: LifeBuoy, developer: FlaskConical }

export default function RoleTag({ role, className }) {
  const { t } = useT()
  const Icon = ICONS[role]
  if (!Icon) return null
  const label = t(`admin.roles.${role}`)
  return (
    <span className={clsx('role-tag', `role-tag--${role}`, className)} title={label}>
      <span className="role-tag__ring" aria-hidden="true" />
      <span className="role-tag__fx" aria-hidden="true">
        <i /><i /><i />
      </span>
      <Icon className="role-tag__icon" aria-hidden="true" strokeWidth={2.6} />
      <span className="role-tag__text" data-text={label}>{label}</span>
    </span>
  )
}
