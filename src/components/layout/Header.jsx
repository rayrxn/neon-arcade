import { matchPath, useLocation } from 'react-router-dom'
import { Menu, Music, Music2, Volume2, VolumeX } from 'lucide-react'
import { usePrefsStore } from '@/store/usePrefsStore'
import BalanceChip from './BalanceChip'
import NotificationBell from './NotificationBell'
import UserMenu from './UserMenu'
import { categoryKey, getGame } from '@/config/games'
import { titleKeyFor } from '@/config/navigation'
import { useT } from '@/i18n'

function MuteButton() {
  const { t } = useT()
  const muted = usePrefsStore((s) => s.sound?.muted)
  const toggle = usePrefsStore((s) => s.toggleMute)
  return (
    <button onClick={toggle} aria-pressed={muted} aria-label={muted ? t('settings.sound.unmute') : t('settings.sound.mute')} title={muted ? t('settings.sound.unmute') : t('settings.sound.mute')} className="hidden h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-white/5 hover:text-white sm:grid focus-ring">
      {muted ? <VolumeX className="h-[18px] w-[18px]" /> : <Volume2 className="h-[18px] w-[18px]" />}
    </button>
  )
}

function MusicButton() {
  const { t } = useT()
  const off = usePrefsStore((s) => s.sound?.musicOff || !(s.sound?.music > 0))
  const toggle = usePrefsStore((s) => s.toggleMusic)
  return (
    <button onClick={toggle} aria-pressed={!off} aria-label={off ? t('settings.sound.musicOn') : t('settings.sound.musicOffLabel')} title={off ? t('settings.sound.musicOn') : t('settings.sound.musicOffLabel')} className={`grid h-9 w-9 place-items-center rounded-xl transition hover:bg-white/5 focus-ring ${off ? 'text-slate-500' : 'text-neon-cyan'}`}>
      {off ? <Music2 className="h-[18px] w-[18px] opacity-60" /> : <Music className="h-[18px] w-[18px]" />}
    </button>
  )
}

export default function Header({ onMenu }) {
  const { t } = useT()
  const { pathname } = useLocation()
  const match = matchPath('/games/:slug', pathname)
  const game = match ? getGame(match.params.slug) : null
  const titleKey = titleKeyFor(pathname)

  return (
    <header className="fixed inset-x-0 top-0 z-20 lg:left-[248px]" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
      <div className="flex h-16 items-center gap-2 border-b hairline bg-ink-950/80 px-3 backdrop-blur-xl sm:gap-3 sm:px-6 lg:px-8">
        <button
          onClick={onMenu}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-300 transition hover:bg-white/5 hover:text-white lg:hidden"
          aria-label={t('nav.openMenu')}
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="hidden min-w-0 lg:block">
          <p className="label-caps">{game ? t(categoryKey(game.category)) : 'Neon Arcade'}</p>
          <h1 className="mt-0.5 truncate font-display text-[15px] font-bold text-white">{game ? game.name : titleKey ? t(titleKey) : ''}</h1>
        </div>

        <div className="flex min-w-0 items-center gap-1.5 sm:gap-2 lg:ml-auto">
          <BalanceChip currency="AC" />
          <BalanceChip currency="AG" />
        </div>
        <div className="ml-auto flex items-center gap-0.5 sm:gap-1 lg:ml-1">
          <MusicButton />
          <MuteButton />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
