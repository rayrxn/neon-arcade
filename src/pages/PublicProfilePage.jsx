import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Ban, Check, Flag, UserPlus, UserRound } from 'lucide-react'
import Button from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/Controls'
import { ErrorState, Skeleton, useQuery } from '@/components/ui/PageKit'
import ReportDialog from '@/components/social/ReportDialog'
import { ProfileDetails, ProfileHero } from '@/components/profile/ProfileSummary'
import { useAuthStore, useCurrentUser } from '@/store/useAuthStore'
import { useProgressStore, getProgress } from '@/store/useProgressStore'
import { isOnline, usePlatformStore } from '@/store/usePlatformStore'
import { toast } from '@/store/useUiStore'
import { blockUser, findUserByName, friendIds, outgoingRequests, sendFriendRequest, unblockUser } from '@/services/social'
import { errorKey } from '@/utils/errors'
import { useT } from '@/i18n'

export default function PublicProfilePage() {
  const { t } = useT()
  const { username } = useParams()
  const me = useCurrentUser()
  const users = useAuthStore((s) => s.users)
  const byUser = useProgressStore((s) => s.byUser)
  const platform = usePlatformStore()
  const [report, setReport] = useState(false)

  const query = useQuery(() => {
    const user = findUserByName(username)
    if (!user) return null
    return { user, progress: getProgress(user.id) }
  }, [username, users, byUser])

  if (query.loading) return <Skeleton rows={4} />
  if (query.error) return <ErrorState error={query.error} onRetry={query.retry} />
  if (!query.data) return <div className="glass rounded-2xl"><EmptyState icon={UserRound} title={t('publicProfile.notFound')} body={t('publicProfile.notFoundBody', { user: username })} action={<Link to="/leaderboard" className="text-sm font-bold text-neon-cyan">{t('nav.leaderboard')}</Link>} /></div>

  const { user, progress } = query.data
  const self = user.id === me?.id
  const isFriend = friendIds(me.id, platform).includes(user.id)
  const pending = outgoingRequests(me.id, platform).some((r) => r.to === user.id)
  const blocked = (platform.blocks[me.id] ?? []).includes(user.id)
  const run = async (fn, ok) => {
    try {
      await fn()
      toast({ tone: 'success', title: t(ok) })
    } catch (err) {
      toast({ tone: 'error', title: t(errorKey(err), err?.vars) })
    }
  }

  return (
    <div className="space-y-6">
      <ProfileHero
        user={user}
        progress={progress}
        online={isOnline(platform.presence, user.id)}
        actions={
          self ? (
            <Link to="/profile"><Button size="sm" variant="ghost">{t('publicProfile.editOwn')}</Button></Link>
          ) : (
            <>
              {isFriend ? (
                <Button size="sm" variant="ghost" disabled><Check className="h-4 w-4" /> {t('publicProfile.friends')}</Button>
              ) : (
                <Button size="sm" disabled={pending || blocked || user.isDemo} onClick={() => run(() => sendFriendRequest(user.username), 'friends.sent')}>
                  <UserPlus className="h-4 w-4" /> {pending ? t('friends.pendingLabel') : t('friends.add')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => run(() => (blocked ? unblockUser(user.id) : blockUser(user.id)), blocked ? 'friends.unblocked' : 'friends.blockedToast')}>
                <Ban className="h-4 w-4" /> {blocked ? t('friends.unblock') : t('friends.block')}
              </Button>
              <Button size="sm" variant="danger" onClick={() => setReport(true)}><Flag className="h-4 w-4" /> {t('reports.short')}</Button>
            </>
          )
        }
      />
      <ProfileDetails user={user} progress={progress} favorites={platform.favorites[user.id] ?? []} />
      <ReportDialog open={report} onClose={() => setReport(false)} preset={{ targetUserId: user.id, targetName: user.username, reason: 'harassment' }} />
    </div>
  )
}
