import { Navigate, Route, Routes } from 'react-router-dom'
import AuthPage from '@/pages/AuthPage'
import HomePage from '@/pages/HomePage'
import GamesPage from '@/pages/GamesPage'
import GameRoute from '@/pages/GameRoute'
import JackpotPage from '@/pages/JackpotPage'
import ChatPage from '@/pages/ChatPage'
import WalletPage from '@/pages/WalletPage'
import RedeemPage from '@/pages/RedeemPage'
import ProfilePage from '@/pages/ProfilePage'
import SettingsPage from '@/pages/SettingsPage'
import RewardsPage from '@/pages/RewardsPage'
import ShopPage from '@/pages/ShopPage'
import LoyaltyPage from '@/pages/LoyaltyPage'
import MembershipPage from '@/pages/MembershipPage'
import BattlePassPage from '@/pages/BattlePassPage'
import HistoryPage from '@/pages/HistoryPage'
import LeaderboardPage from '@/pages/LeaderboardPage'
import FriendsPage from '@/pages/FriendsPage'
import InventoryPage from '@/pages/InventoryPage'
import PublicProfilePage from '@/pages/PublicProfilePage'
import NotificationsPage from '@/pages/NotificationsPage'
import SupportPage from '@/pages/SupportPage'
import StatusPage from '@/pages/StatusPage'
import { ResetPasswordPage, VerifyEmailPage } from '@/pages/AccountLinkPages'
import { ModerationQueue } from '@/admin/pages/Moderation'
import { SupportAdmin } from '@/admin/pages/Support'
import { SystemAdmin } from '@/admin/pages/System'
import AdminLayout from '@/admin/AdminLayout'
import { ChatModerationAdmin, EconomyAdmin, EmotesAdmin, LoyaltyAdmin, MembershipsAdmin, MissionsAdmin, PlayerRolesAdmin, ShopAdmin } from '@/admin/pages/Platform'
import AdminDashboard from '@/admin/pages/Dashboard'
import SystemConsolePage from '@/pages/SystemConsolePage'
import { FeaturesAdmin, MonitoringAdmin, QaCenter } from '@/admin/pages/Core'
import { UserDetail, UserList } from '@/admin/pages/Users'
import { AntiCheat, GamesAdmin, Sessions, Wallets } from '@/admin/pages/Operations'
import { AchievementsAdmin, AnnouncementsAdmin, ChatAdmin, CodesAdmin, DailyAdmin, LogsAdmin, Moderation, QuestsAdmin, RewardsOverview, SettingsAdmin, TestModeAdmin } from '@/admin/pages/Content'
import AppLayout from '@/components/layout/AppLayout'
import RequireAuth from '@/components/routing/RequireAuth'
import ThemeController from '@/components/runtime/ThemeController'
import PerformanceController from '@/components/runtime/PerformanceController'
import BannedScreen from '@/components/runtime/BannedScreen'
import PlatformRuntime from '@/components/runtime/PlatformRuntime'
import ServerGate from '@/components/runtime/ServerGate'
import RootBoundary from '@/components/runtime/RootBoundary'
import PasswordGate from '@/components/runtime/PasswordGate'
import Toaster from '@/components/ui/Toaster'
import { useCurrentUser } from '@/store/useAuthStore'
import { can } from '@/config/roles'

/** Halaman admin per-permission: role tanpa akses diarahkan ke dashboard admin. */
function Guard({ perm, children }) {
  const role = useCurrentUser()?.role
  return can(role, perm) ? children : <Navigate to="/admin" replace />
}

export default function App() {
  return (
    <>
      <div className="arcade-bg" aria-hidden />
      <ThemeController />
      <PerformanceController />
      <BannedScreen />
      <RootBoundary>
      <ServerGate>
      <PlatformRuntime />
      <PasswordGate />
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/status" element={<StatusPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/system-console" element={<SystemConsolePage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route index element={<HomePage />} />
            <Route path="games" element={<GamesPage />} />
            <Route path="games/:slug" element={<GameRoute />} />
            <Route path="jackpot" element={<JackpotPage />} />
            <Route path="chat" element={<ChatPage />} />
            <Route path="wallet" element={<WalletPage />} />
            <Route path="redeem" element={<RedeemPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="rewards" element={<RewardsPage />} />
            <Route path="shop" element={<ShopPage />} />
            <Route path="loyalty" element={<LoyaltyPage />} />
            <Route path="membership" element={<MembershipPage />} />
            <Route path="pass" element={<BattlePassPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="history/:id" element={<HistoryPage />} />
            <Route path="leaderboard" element={<LeaderboardPage />} />
            <Route path="friends" element={<FriendsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="u/:username" element={<PublicProfilePage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="support" element={<SupportPage />} />
            <Route path="support/:id" element={<SupportPage />} />
          </Route>
        </Route>

        <Route element={<RequireAuth permission="dashboard" />}>
          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<Guard perm="users.view"><UserList /></Guard>} />
            <Route path="users/:id" element={<Guard perm="users.view"><UserDetail /></Guard>} />
            <Route path="wallets" element={<Guard perm="wallet.manage"><Wallets /></Guard>} />
            <Route path="games" element={<Guard perm="games.manage"><GamesAdmin /></Guard>} />
            <Route path="sessions" element={<Guard perm="sessions.view"><Sessions /></Guard>} />
            <Route path="anticheat" element={<Guard perm={['anticheat', 'security.review']}><AntiCheat /></Guard>} />
            <Route path="features" element={<Guard perm="features.manage"><FeaturesAdmin /></Guard>} />
            <Route path="monitoring" element={<Guard perm={['errors.view', 'system.manage']}><MonitoringAdmin /></Guard>} />
            <Route path="qa" element={<Guard perm="qa.run"><QaCenter /></Guard>} />
            <Route path="moderation" element={<Guard perm="reports.view"><ModerationQueue /></Guard>} />
            <Route path="support" element={<Guard perm="support.manage"><SupportAdmin /></Guard>} />
            <Route path="system" element={<Guard perm="system.manage"><SystemAdmin /></Guard>} />
            <Route path="restrictions" element={<Guard perm="moderation"><Moderation /></Guard>} />
            <Route path="rewards" element={<Guard perm="rewards.view"><RewardsOverview /></Guard>} />
            <Route path="daily" element={<Guard perm="rewards.view"><DailyAdmin /></Guard>} />
            <Route path="quests" element={<Guard perm="rewards.view"><QuestsAdmin /></Guard>} />
            <Route path="achievements" element={<Guard perm="rewards.view"><AchievementsAdmin /></Guard>} />
            <Route path="codes" element={<Guard perm="codes.manage"><CodesAdmin /></Guard>} />
            <Route path="chat" element={<Guard perm="moderation"><ChatAdmin /></Guard>} />
            <Route path="chat-filter" element={<Guard perm="moderation.config"><ChatModerationAdmin /></Guard>} />
            <Route path="economy" element={<Guard perm="economy.manage"><EconomyAdmin /></Guard>} />
            <Route path="loyalty" element={<Guard perm="loyalty.manage"><LoyaltyAdmin /></Guard>} />
            <Route path="player-roles" element={<Guard perm="playerroles.manage"><PlayerRolesAdmin /></Guard>} />
            <Route path="shop" element={<Guard perm="shop.manage"><ShopAdmin /></Guard>} />
            <Route path="emotes" element={<Guard perm="emotes.manage"><EmotesAdmin /></Guard>} />
            <Route path="missions" element={<Guard perm="rewards.manage"><MissionsAdmin /></Guard>} />
            <Route path="memberships" element={<Guard perm="memberships.manage"><MembershipsAdmin /></Guard>} />
            <Route path="announcements" element={<Guard perm="announcements.manage"><AnnouncementsAdmin /></Guard>} />
            <Route path="reports" element={<Guard perm="moderation"><ChatAdmin reportsOnly /></Guard>} />
            <Route path="analytics" element={<Guard perm="analytics"><AdminDashboard full /></Guard>} />
            <Route path="logs" element={<Guard perm="logs.view"><LogsAdmin /></Guard>} />
            <Route path="testmode" element={<Guard perm="testmode"><TestModeAdmin /></Guard>} />
            <Route path="settings" element={<SettingsAdmin />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ServerGate>
      </RootBoundary>
      <Toaster />
    </>
  )
}
