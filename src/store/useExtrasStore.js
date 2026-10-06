import { create } from 'zustand'

/**
 * Per-user data from the server that isn't part of wallet/progress:
 * shop inventory, active boosts, owned emotes, equipped style items, loyalty, membership, mission claims.
 * Never persisted in the browser — the server is the only source.
 */
export const useExtrasStore = create(() => ({ byUser: {} }))

const EMPTY = {
  inventory: {}, boosts: [], emotes: [], emoteFavs: [], emoteRecent: [], style: {},
  loyalty: { xp: 0, card: 'none', next: 'silver', nextXp: 5000, maxBetAC: 250000, maxBetAG: 10, log: [] },
  playerRole: null, membership: null, claims: [], convertedToday: 0,
}
export const emptyExtras = EMPTY
