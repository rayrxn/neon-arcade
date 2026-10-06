import { useAdminStore } from '@/store/useAdminStore'
import { randomHex } from '@/utils/rng'

/**
 * Log error "server-side": pesan internal disimpan untuk admin (Admin → System),
 * user hanya melihat pesan aman lewat kode i18n.
 */
export function logError(context, err) {
  try {
    const entry = {
      id: randomHex(6),
      at: Date.now(),
      context,
      code: err?.code ?? null,
      message: String(err?.message ?? err).slice(0, 300),
      stack: String(err?.stack ?? '').split('\n').slice(0, 4).join('\n'),
    }
    useAdminStore.setState((s) => ({ errors: [entry, ...(s.errors ?? [])].slice(0, 200) }))
    console.error(`[${context}]`, err)
  } catch {
    /* logging tidak boleh menggagalkan operasi */
  }
}
