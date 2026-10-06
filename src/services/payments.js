import { AppError } from '@/utils/errors'

/**
 * Top Up — BELUM TERHUBUNG ke payment gateway.
 * UI sudah lengkap (pilih paket → ringkasan), tetapi checkout sengaja menolak
 * supaya tidak ada saldo "palsu" yang terlihat seperti pembayaran sungguhan.
 *
 * Untuk mengaktifkan: set PAYMENTS_ENABLED = true dan implementasikan startCheckout()
 * (mis. Midtrans/Xendit Snap). Saldo dikredit oleh webhook server dengan type 'topup'.
 */
export const PAYMENTS_ENABLED = false

export async function startCheckout(/* pkg */) {
  if (!PAYMENTS_ENABLED) throw new AppError('topup.errors.notConnected')
  throw new AppError('errors.generic')
}

export const formatRupiah = (amount, locale) =>
  new Intl.NumberFormat(locale, { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount)
