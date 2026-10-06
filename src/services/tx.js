import { useWalletStore } from '@/store/useWalletStore'
import { useProgressStore } from '@/store/useProgressStore'
import { usePlatformStore } from '@/store/usePlatformStore'
import { useNotificationStore } from '@/store/useNotificationStore'
import { useAdminStore } from '@/store/useAdminStore'
import { useAuthStore } from '@/store/useAuthStore'
import { logError } from './errorLog'

/**
 * Transaksi atomik mode lokal (pengganti BEGIN / COMMIT / ROLLBACK).
 * Semua store yang bisa berubah dalam satu operasi di-snapshot dulu; kalau ada langkah
 * yang gagal, semuanya dikembalikan ke kondisi awal. Jadi tidak pernah ada:
 *   - transaksi tanpa perubahan saldo, atau saldo berubah tanpa transaksi
 *   - XP masuk padahal sesi game gagal
 *   - notifikasi reward padahal wallet tidak berubah
 * Di backend nanti: satu database transaction dengan isolation SERIALIZABLE.
 */
const STORES = [useWalletStore, useProgressStore, usePlatformStore, useNotificationStore, useAdminStore, useAuthStore]

let depth = 0

export function atomic(label, fn) {
  if (depth > 0) return fn() // transaksi bersarang ikut transaksi terluar
  const snapshots = STORES.map((store) => store.getState())
  depth++
  try {
    return fn()
  } catch (err) {
    STORES.forEach((store, i) => store.setState(snapshots[i], true))
    if (!err?.code) logError(label, err)
    throw err
  } finally {
    depth--
  }
}
