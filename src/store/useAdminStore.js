import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

/**
 * Data admin & sistem (tabel backend: admin_logs, announcements, redeem_codes, games,
 * reports, support_tickets, events, error_log, system_settings).
 * Audit log append-only: store ini sengaja tidak punya aksi hapus/ubah log.
 */
export const useAdminStore = create(
  persist(
    (set) => ({
      logs: [], // { id, at, code, adminId, adminName, role, action, target, targetId, entityId, reason, before, after, device }
      announcements: [], // { id, title, message, type, startAt, endAt, active, createdAt, createdBy }
      codes: {}, // { [CODE]: { rewards, maxUses, perUser, expiresAt, active, createdAt, createdBy } }
      gameConfig: {}, // { [slug]: { status: 'live' | 'maintenance' | 'disabled', maxBet } }
      reports: [], // lihat services/reports.js
      tickets: [], // lihat services/support.js
      events: [], // lihat services/events.js
      errors: [], // lihat services/errorLog.js
      system: {
        maintenance: { enabled: false, message: '', until: null },
        services: {}, // override status per komponen
        autoFreezeCritical: false,
      },

      appendLog: (entry) => set((s) => ({ logs: [entry, ...s.logs].slice(0, 5000) })),
      upsertAnnouncement: (a) => set((s) => ({ announcements: [a, ...s.announcements.filter((x) => x.id !== a.id)] })),
      upsertCode: (code, def) => set((s) => ({ codes: { ...s.codes, [code]: def } })),
      setGameConfig: (slug, patch) => set((s) => ({ gameConfig: { ...s.gameConfig, [slug]: { ...(s.gameConfig[slug] ?? { status: 'live' }), ...patch } } })),
    }),
    {
      name: 'neon-arcade:admin',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      // v1 → v2: reports, tickets, events, error log, system settings.
      migrate: (state) => ({
        reports: [],
        tickets: [],
        events: [],
        errors: [],
        system: { maintenance: { enabled: false, message: '', until: null }, services: {}, autoFreezeCritical: false },
        ...state,
      }),
    },
  ),
)

/** Pengumuman yang sedang tayang. */
export const activeAnnouncements = (list, now = Date.now()) =>
  list.filter((a) => a.active && (!a.startAt || a.startAt <= now) && (!a.endAt || a.endAt > now))
