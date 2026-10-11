/** Password reset and email verification (server mode only). */
import { api, applyPayload, applyUser } from '@/services/server'
import { useAuthStore } from '@/store/useAuthStore'
import { usePrefsStore } from '@/store/usePrefsStore'

const lang = () => usePrefsStore.getState().language

export const requestPasswordReset = (email) => api('auth/forgot', { email: String(email).trim(), lang: lang() })
export const checkResetLink = (token) => api('auth/reset/check', { token })
export const resetPassword = (token, password, username) => api('auth/reset', { token, password, ...(username ? { username } : {}) })
export const changeEmail = async (email, password) => applyPayload(await api('auth/email', { email: String(email).trim(), password }))
export const sendVerificationEmail = () => api('auth/verify/send', { lang: lang() })

export async function verifyEmail(token) {
  const res = await api('auth/verify', { token })
  // Signed in on this device: show the verified badge right away.
  const { session, users } = useAuthStore.getState()
  const me = session ? users[session.email] : null
  if (me && me.username === res.username) applyUser({ ...me, emailVerified: true })
  return res
}

/** R 1.1.1 security settings: two-step sign-in and strict sessions. Each returns { security } on success. */
const applySecurity = (r) => {
  const { session, users } = useAuthStore.getState()
  const me = session ? users[session.email] : null
  if (me && r?.security) applyUser({ ...me, security: r.security })
  return r
}
export const startTwoFactor = (method) => api('security/2fa/setup', { method, lang: lang() })
export const enableTwoFactor = (method, code, password) => api('security/2fa/enable', { method, code, password }).then(applySecurity)
export const sendSecurityCode = () => api('security/2fa/send', { lang: lang() })
export const disableTwoFactor = (code, password) => api('security/2fa/disable', { code, password }).then(applySecurity)
export const setStrictSessions = (on, code) => api('security/strict', { on, code }).then(applySecurity)
