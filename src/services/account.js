/** Password reset and email verification (server mode only). */
import { api, applyUser } from '@/services/server'
import { useAuthStore } from '@/store/useAuthStore'
import { usePrefsStore } from '@/store/usePrefsStore'

const lang = () => usePrefsStore.getState().language

export const requestPasswordReset = (email) => api('auth/forgot', { email: String(email).trim(), lang: lang() })
export const checkResetLink = (token) => api('auth/reset/check', { token })
export const resetPassword = (token, password) => api('auth/reset', { token, password })
export const sendVerificationEmail = () => api('auth/verify/send', { lang: lang() })

export async function verifyEmail(token) {
  const res = await api('auth/verify', { token })
  // Signed in on this device: show the verified badge right away.
  const { session, users } = useAuthStore.getState()
  const me = session ? users[session.email] : null
  if (me && me.username === res.username) applyUser({ ...me, emailVerified: true })
  return res
}
