/**
 * Release gate for 1.0.0 (internal 3.0.0). Until an admin publishes it (Admin → Content or console `release publish`),
 * only staff see the release (label "1.0.0 DEV TEST", release update log, trailer); players keep the latest BETA.
 */
import { usePlatformStore } from '@/store/usePlatformStore'
import { useCurrentUser } from '@/store/useAuthStore'
import { BUILD, CHANGELOG, versionLabel } from './build'

const STAFF = ['owner', 'super_admin', 'admin', 'moderator', 'support', 'developer']
export const isRelease = (v) => Number(String(v ?? '').split('.')[0]) >= 3

export function useRelease() {
  const published = usePlatformStore((s) => !!s.release?.published)
  const role = useCurrentUser()?.role
  const staff = STAFF.includes(role)
  return { published, staff, visible: published || staff }
}

/** Changelog the current viewer may see (release entries hidden from players until published). */
export function useChangelog() {
  const { visible } = useRelease()
  return visible ? CHANGELOG : CHANGELOG.filter((e) => !isRelease(e.version))
}

export function useVersionLabel() {
  const { published, visible } = useRelease()
  if (!isRelease(BUILD.version)) return versionLabel(BUILD.version)
  if (published) return versionLabel(BUILD.version)
  if (visible) return '1.0.0 DEV TEST'
  return versionLabel(CHANGELOG.find((e) => !isRelease(e.version))?.version)
}
