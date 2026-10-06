export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
export const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/

/** Mengembalikan { field: i18nKey } — objek kosong berarti valid. */
export function validateAuth(mode, values) {
  const errors = {}
  const email = values.email.trim()

  if (!email) errors.email = 'validation.emailRequired'
  else if (!EMAIL_RE.test(email)) errors.email = 'validation.emailFormat'

  if (!values.password) errors.password = 'validation.passwordRequired'
  else if (mode === 'register') Object.assign(errors, passwordRules(values.password, 'password'))

  if (mode === 'register') {
    const username = values.username.trim()
    if (!username) errors.username = 'validation.usernameRequired'
    else if (!USERNAME_RE.test(username)) errors.username = 'validation.usernameFormat'

    if (!values.confirm) errors.confirm = 'validation.confirmRequired'
    else if (values.confirm !== values.password) errors.confirm = 'validation.confirmMismatch'
  }
  return errors
}

/** Aturan password baru (daftar & ganti password). */
export function passwordRules(password, field = 'password') {
  if (password.length < 8) return { [field]: 'validation.passwordLength' }
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return { [field]: 'validation.passwordMix' }
  return {}
}

export function passwordStrength(password) {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^a-zA-Z0-9]/.test(password)) score++
  score = Math.min(4, score)
  return { score, labelKey: `validation.strength.${score}` }
}
