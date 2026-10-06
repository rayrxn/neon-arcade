/** Phase 8 — staff roles (Owner/Admin/Moderator/Helper/Tester), forced password change, release reset. */
export default {
  auth: {
    emailOrUsername: 'Email or username',
    emailOrUsernamePlaceholder: 'you@email.com or username',
    forceChange: {
      title: 'Change your password',
      body: 'This account still uses the default password. Change it before you continue.',
      logout: 'Log out',
    },
  },
  validation: {
    loginRequired: 'Enter your email or username.',
    loginFormat: 'Enter a valid email or username.',
    passwordSame: 'New password must be different.',
  },
  errors: {
    mustChangePassword: 'Change this account’s password first.',
  },
  notifications: {
    releaseReset: { title: 'New update, data reset', body: 'Balance and progress are back to the start. Your cosmetics stay.' },
  },
  admin: {
    roles: { super_admin: 'Owner', admin: 'Admin', moderator: 'Moderator', support: 'Helper', developer: 'Tester', user: 'User' },
    serverMode: 'Server · live database',
    settingsDesc: 'Role permissions. Only the Owner can change roles.',
    backendNoteServer: 'Every permission is checked again on the server. Menus you can’t use are hidden too.',
    errors: {
      confirmPhrase: 'Confirmation text doesn’t match.',
      serverOnly: 'Only available on the live site.',
    },
    actions: { 'release.reset': 'release reset' },
    release: {
      title: 'Release reset',
      body: 'Use this when shipping an update. Balance goes back to 10,000 AC + 1 AG; level, XP, quests, daily, stats and achievements are cleared.',
      keeps: 'Accounts, roles, names, avatars, cosmetics and the audit log stay.',
      typePhrase: 'Type {phrase} to continue',
      testers: { title: 'Reset tester accounts', body: 'Only Tester and test-mode accounts.', button: 'Reset testers' },
      global: { title: 'Global reset', body: 'Every account, staff included.', button: 'Reset global' },
    },
  },
}
