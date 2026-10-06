import { Crown, FlaskConical, Gavel, LifeBuoy, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { useT } from '@/i18n'

/** Tag role staf di samping nama. Warna per role ada di index.css (.role-tag--*). */
const ICONS = { super_admin: Crown, admin: ShieldCheck, moderator: Gavel, support: LifeBuoy, developer: FlaskConical }

export default function RoleTag({ role, className }) {
  const { t } = useT()
  const Icon = ICONS[role]
  if (!Icon) return null
  return (
    <span className={clsx('role-tag', `role-tag--${role}`, className)} title={t(`admin.roles.${role}`)}>
      <Icon className="role-tag__icon" aria-hidden="true" strokeWidth={2.6} />
      <span className="role-tag__text">{t(`admin.roles.${role}`)}</span>
    </span>
  )
}
