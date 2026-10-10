import { Flame } from 'lucide-react'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNow } from '@/hooks/useNow'
import { formatCountdown } from '@/utils/format'
import { useT } from '@/i18n'

/** Shows a running Jam Gacor (global event or a personal boost). */
export default function GacorBanner() {
  const { t } = useT()
  const g = usePlatformStore((s) => s.gacor)
  const now = useNow(1000)
  if (!g || g.until <= now) return null
  return (
    <div className="flex items-center gap-3 rounded-xl bg-neon-gold/10 px-4 py-2.5 text-sm ring-1 ring-inset ring-neon-gold/30">
      <Flame className="h-4 w-4 shrink-0 text-neon-gold" />
      <p className="min-w-0 flex-1 font-semibold text-slate-100">
        {g.label || (g.personal ? t('gacor.personal', { mult: g.mult }) : t('gacor.global', { mult: g.mult }))}
        <span className="ml-1 font-normal text-slate-400">· {t('gacor.hint')}</span>
      </p>
      <span className="num shrink-0 font-mono text-xs font-bold text-neon-gold">{formatCountdown(g.until - now)}</span>
    </div>
  )
}
