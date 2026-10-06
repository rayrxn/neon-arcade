import { Bell, Gift, Gamepad2, History, LifeBuoy, Package, ShieldHalf, House, MessagesSquare, Settings, Ticket, Trophy, UserRound, Users, Wallet, Crown, ShoppingBag, WalletCards, Gem, Flame } from 'lucide-react'

/** Menu utama. `group` memisahkan bagian di sidebar: main, social, account. */
export const NAV_ITEMS = [
  { to: '/', end: true, labelKey: 'nav.home', icon: House, group: 'play' },
  { to: '/games', labelKey: 'nav.games', icon: Gamepad2, group: 'play' },
  { to: '/jackpot', labelKey: 'nav.jackpot', icon: Trophy, group: 'play' },
  { to: '/leaderboard', labelKey: 'nav.leaderboard', icon: Crown, group: 'play' },
  { to: '/pass', labelKey: 'nav.pass', icon: Flame, group: 'progress' },
  { to: '/rewards', labelKey: 'nav.rewards', icon: Gift, group: 'progress' },
  { to: '/loyalty', labelKey: 'nav.loyalty', icon: WalletCards, group: 'progress' },
  { to: '/shop', labelKey: 'nav.shop', icon: ShoppingBag, group: 'progress' },
  { to: '/membership', labelKey: 'nav.membership', icon: Gem, group: 'progress' },
  { to: '/chat', labelKey: 'nav.chat', icon: MessagesSquare, group: 'social' },
  { to: '/friends', labelKey: 'nav.friends', icon: Users, group: 'social' },
  { to: '/notifications', labelKey: 'nav.notifications', icon: Bell, group: 'social' },
  { to: '/wallet', labelKey: 'nav.wallet', icon: Wallet, group: 'account' },
  { to: '/history', labelKey: 'nav.history', icon: History, group: 'account' },
  { to: '/inventory', labelKey: 'nav.inventory', icon: Package, group: 'account' },
  { to: '/redeem', labelKey: 'nav.redeem', icon: Ticket, group: 'account' },
  { to: '/profile', labelKey: 'nav.profile', icon: UserRound, group: 'account' },
  { to: '/support', labelKey: 'nav.support', icon: LifeBuoy, group: 'account' },
]
export const NAV_GROUPS = ['play', 'progress', 'social', 'account']

export const SETTINGS_ITEM = { to: '/settings', labelKey: 'nav.settings', icon: Settings }
export const ADMIN_ITEM = { to: '/admin', labelKey: 'nav.admin', icon: ShieldHalf }

/** Tab bar bawah di HP — 5 tujuan paling sering dipakai. */
export const MOBILE_TABS = ['/', '/games', '/chat', '/wallet', '/profile'].map((to) => NAV_ITEMS.find((n) => n.to === to))

const TITLES = Object.fromEntries([...NAV_ITEMS, SETTINGS_ITEM].map((n) => [n.to, n.labelKey]))
export const titleKeyFor = (pathname) => TITLES[pathname] ?? TITLES[`/${pathname.split('/')[1]}`] ?? null
