import { Award, CalendarDays, Crown, Gift, ListChecks } from 'lucide-react'
import { Panel } from '@/components/ui/Controls'
import { AchievementGrid, DailyReward, LevelBar, QuestList, SeasonPanel } from '@/components/progress/ProgressKit'
import Missions from '@/components/progress/Missions'
import { PassStrip } from '@/pages/BattlePassPage'
import { SERVER_MODE } from '@/config/runtime'
import { useNow } from '@/hooks/useNow'
import { formatCountdown } from '@/utils/format'
import { useT } from '@/i18n'

export default function RewardsPage() {
  const { t } = useT()
  const now = useNow(60_000)
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  const daysLeft = 7 - ((new Date(now).getDay() + 6) % 7) // sampai Senin berikutnya
  const hm = (ms) => formatCountdown(ms).slice(0, 5)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-white">{t('rewards.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('rewards.subtitle')}</p>
      </div>

      <LevelBar />

      <Missions />

      {SERVER_MODE ? (
        <PassStrip />
      ) : (
        <Panel title={t('season.panel')} icon={Crown} bodyClassName="p-4 sm:p-5">
          <SeasonPanel />
        </Panel>
      )}

      <Panel title={t('rewards.daily.title')} icon={Gift} bodyClassName="p-4 sm:p-5">
        <DailyReward />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={t('rewards.dailyQuests')} icon={ListChecks} action={<span className="text-xs text-slate-500">{t('rewards.resetsIn', { time: hm(midnight - now) })}</span>}>
          <QuestList scope="daily" />
        </Panel>
        <Panel title={t('rewards.weeklyQuests')} icon={CalendarDays} action={<span className="text-xs text-slate-500">{t('rewards.resetsIn', { time: `${daysLeft}d` })}</span>}>
          <QuestList scope="weekly" />
        </Panel>
      </div>

      <Panel title={t('rewards.achievementsTitle')} icon={Award} bodyClassName="p-4 sm:p-5">
        <AchievementGrid />
      </Panel>
    </div>
  )
}
