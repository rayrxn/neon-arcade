import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Preferensi perangkat: bahasa, tampilan, notifikasi, dan suara.
 * Disimpan per browser (bukan per akun) supaya halaman login pun ikut bahasa & tema yang dipilih.
 */
export const LANGUAGES = ['id', 'en']
export const APPEARANCES = ['dark', 'light', 'system']
/** Potato mode: 'auto' turns it on for weak devices / low frame rate, 'on' always, 'off' never. */
export const PERFORMANCE = ['auto', 'ultra', 'high', 'medium', 'on', 'off'] // on = Potato, off = High (older saves)
export const NOTIFICATION_KEYS = ['transfers', 'redeem', 'jackpots', 'mentions', 'progress', 'friends']
/** sfx = volume game, ui = volume antarmuka (klik, notifikasi, chat). */
const DEFAULT_SOUND = { master: 0.7, sfx: 0.8, ui: 0.7, music: 0.4, muted: false, musicOff: false, track: null }
const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0))

export const usePrefsStore = create(
  persist(
    (set) => ({
      language: 'en',
      appearance: 'dark',
      notifications: { transfers: true, redeem: true, jackpots: true, mentions: true, progress: true, friends: true },
      sound: DEFAULT_SOUND,
      betCurrency: 'AC',
      sidebarCollapsed: false,
      performance: 'auto',
      autoPotato: null,
      maxRoleTags: 3, // how many role tags to show next to a name (the rest become "+N")
      setMaxRoleTags: (n) => [0, 1, 2, 3, 4, 5].includes(n) && set({ maxRoleTags: n }), // result of the automatic check on this device: null = not measured yet
      setPerformance: (performance) => PERFORMANCE.includes(performance) && set({ performance }),
      setAutoPotato: (autoPotato) => set({ autoPotato: !!autoPotato }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      setLanguage: (language) => LANGUAGES.includes(language) && set({ language }),
      setBetCurrency: (betCurrency) => ['AC', 'AG'].includes(betCurrency) && set({ betCurrency }),
      setAppearance: (appearance) => APPEARANCES.includes(appearance) && set({ appearance }),
      setNotification: (key, value) => set((s) => ({ notifications: { ...s.notifications, [key]: !!value } })),
      setSound: (patch) =>
        set((s) => {
          const next = { ...DEFAULT_SOUND, ...s.sound, ...patch }
          return { sound: { master: clamp01(next.master), sfx: clamp01(next.sfx), ui: clamp01(next.ui), music: clamp01(next.music), muted: !!next.muted, musicOff: !!next.musicOff, track: typeof next.track === 'string' ? next.track : null } }
        }),
      toggleMute: () => set((s) => ({ sound: { ...DEFAULT_SOUND, ...s.sound, muted: !s.sound?.muted } })),
      toggleMusic: () => set((s) => ({ sound: { ...DEFAULT_SOUND, ...s.sound, musicOff: !s.sound?.musicOff, music: s.sound?.music > 0 ? s.sound.music : 0.4 } })),
    }),
    {
      name: 'neon-arcade:prefs',
      version: 5,
      storage: createJSONStorage(() => localStorage),
      // v1 → v2: pengaturan suara & notifikasi progres. v2 → v3: musik lobby aktif (dulu default 0).
      // v4 → v5: bahasa bawaan jadi English (pemain tetap bisa ganti ke Indonesia di Settings).
      migrate: (state, version) => ({
        ...state,
        ...(version < 5 ? { language: 'en' } : {}),
        sound: { ...DEFAULT_SOUND, ...(state?.sound ?? {}), ...(version < 3 && !(state?.sound?.music > 0) ? { music: 0.4 } : {}) },
        notifications: { progress: true, friends: true, ...(state?.notifications ?? {}) },
      }),
    },
  ),
)
