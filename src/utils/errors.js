/**
 * Error dengan kode i18n. UI menerjemahkan lewat t(error.code, error.vars),
 * jadi pesan selalu ikut bahasa aktif. Backend nanti cukup mengirim kode yang sama.
 */
export class AppError extends Error {
  constructor(code, vars) {
    super(code)
    this.code = code
    this.vars = vars
  }
}

export const errorKey = (err) => (err instanceof AppError || err?.code ? err.code : 'errors.generic')
