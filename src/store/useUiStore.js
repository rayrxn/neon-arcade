import { create } from 'zustand'
import { randomHex } from '@/utils/rng'

/**
 * State UI sementara (tidak dipersist): modal aktif dan toast.
 *   openModal('send', { currency: 'AG' })   → ModalHost merender SendModal
 *   toast({ tone: 'success', title: '...' })
 */
export const useUiStore = create((set, get) => ({
  modal: null, // { type, props }
  toasts: [],
  levelUp: null, // { from, to, xp, rewards } — overlay naik level

  showLevelUp: (info) =>
    set((s) => ({
      levelUp: s.levelUp
        ? { from: Math.min(s.levelUp.from, info.from), to: Math.max(s.levelUp.to, info.to), xp: (s.levelUp.xp ?? 0) + (info.xp ?? 0), rewards: [...(s.levelUp.rewards ?? []), ...(info.rewards ?? [])] }
        : info,
    })),
  hideLevelUp: () => set({ levelUp: null }),

  openModal: (type, props = {}) => set({ modal: { type, props } }),
  closeModal: () => set({ modal: null }),

  toast: ({ tone = 'info', title, body, duration = 4200 }) => {
    const id = randomHex(4)
    set((s) => ({ toasts: [...s.toasts, { id, tone, title, body }].slice(-4) }))
    setTimeout(() => get().dismissToast(id), duration)
    return id
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))

export const openModal = (type, props) => useUiStore.getState().openModal(type, props)
export const toast = (options) => useUiStore.getState().toast(options)
