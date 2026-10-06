import { create } from 'zustand'

/**
 * Reveal gate — aturan "saldo baru berubah setelah hasil terlihat".
 *
 * Engine mengkredit payout ke ledger secara atomik saat hasil final diputuskan, lalu
 * mendaftarkan payout itu di sini sebagai "held". Header menampilkan saldo dikurangi
 * jumlah held, jadi angka saldo tidak naik duluan selama animasi berjalan.
 * Saat animasi game selesai (playOutcome), payout dilepas → saldo terlihat naik.
 * Notifikasi level up / achievement dari ronde itu juga ditahan sampai reveal.
 */
export const useRevealStore = create((set, get) => ({
  held: {}, // { [sessionId]: { currency, amount, at } }
  queue: [], // aksi UI yang ditunda sampai semua reveal selesai

  hold: (sessionId, currency, amount) => {
    if (!(amount > 0)) return
    set((s) => ({ held: { ...s.held, [sessionId]: { currency, amount, at: Date.now() } } }))
    // Pengaman: lepas otomatis kalau user meninggalkan halaman sebelum animasi selesai.
    setTimeout(() => get().release(sessionId), 12_000)
  },

  release: (sessionId) => {
    if (sessionId && !get().held[sessionId]) return
    set((s) => {
      const held = { ...s.held }
      if (sessionId) delete held[sessionId]
      else for (const k of Object.keys(held)) delete held[k]
      return { held }
    })
    if (Object.keys(get().held).length === 0) {
      const queue = get().queue
      set({ queue: [] })
      queue.forEach((fn) => fn())
    }
  },

  /** Jalankan sekarang, atau setelah reveal yang sedang berjalan selesai. */
  defer: (fn) => {
    if (Object.keys(get().held).length === 0) fn()
    else set((s) => ({ queue: [...s.queue, fn] }))
  },
}))

export const heldAmount = (held, currency) => Object.values(held).reduce((sum, h) => sum + (h.currency === currency ? h.amount : 0), 0)
export const holdReveal = (...args) => useRevealStore.getState().hold(...args)
export const releaseReveal = (id) => useRevealStore.getState().release(id)
export const deferUntilReveal = (fn) => useRevealStore.getState().defer(fn)
