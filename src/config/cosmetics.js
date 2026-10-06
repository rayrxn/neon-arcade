/**
 * Katalog kosmetik (tabel items). Semua non-cash, tidak memengaruhi hasil game.
 * kind: avatar | frame | badge | title | chatBadge | banner | emote
 * `free` = dimiliki semua akun. `source` = cara mendapatkan (ditampilkan di Inventory).
 */
export const COSMETICS = {
  // ── Bingkai avatar ──
  'neon-frame': { kind: 'frame', name: { id: 'Bingkai Neon', en: 'Neon Frame' }, ring: 'ring-neon-cyan', source: 'redeem' },
  'gold-frame': { kind: 'frame', name: { id: 'Bingkai Emas', en: 'Gold Frame' }, ring: 'ring-neon-gold', source: 'daily' },
  'violet-frame': { kind: 'frame', name: { id: 'Bingkai Violet', en: 'Violet Frame' }, ring: 'ring-neon-purple', source: 'season' },
  'crimson-frame': { kind: 'frame', name: { id: 'Bingkai Crimson', en: 'Crimson Frame' }, ring: 'ring-neon-red', source: 'achievement' },
  'mint-frame': { kind: 'frame', name: { id: 'Bingkai Mint', en: 'Mint Frame' }, ring: 'ring-neon-green', source: 'achievement' },

  // ── Avatar ──
  'avatar-aurora': { kind: 'avatar', preset: 'aurora', name: { id: 'Avatar Aurora', en: 'Aurora Avatar' }, source: 'season' },
  'avatar-ember': { kind: 'avatar', preset: 'ember', name: { id: 'Avatar Ember', en: 'Ember Avatar' }, source: 'achievement' },

  // ── Badge profil ──
  'badge-first-win': { kind: 'badge', glyph: '★', tone: 'gold', name: { id: 'Kemenangan Pertama', en: 'First Win' }, source: 'achievement' },
  'badge-streak-7': { kind: 'badge', glyph: '7', tone: 'green', name: { id: 'Streak 7 Hari', en: '7-Day Streak' }, source: 'achievement' },
  'badge-streak-30': { kind: 'badge', glyph: '30', tone: 'green', name: { id: 'Streak 30 Hari', en: '30-Day Streak' }, source: 'achievement' },
  'badge-level-15': { kind: 'badge', glyph: '15', tone: 'cyan', name: { id: 'Level 15', en: 'Level 15' }, source: 'achievement' },
  'badge-level-50': { kind: 'badge', glyph: '50', tone: 'purple', name: { id: 'Level 50', en: 'Level 50' }, source: 'achievement' },
  'badge-quest': { kind: 'badge', glyph: 'Q', tone: 'cyan', name: { id: 'Pemburu Quest', en: 'Quest Hunter' }, source: 'achievement' },
  'badge-season': { kind: 'badge', glyph: 'S', tone: 'pink', name: { id: 'Season Tier 10', en: 'Season Tier 10' }, source: 'season' },

  // ── Title (tampil di bawah nama) ──
  'title-rookie': { kind: 'title', name: { id: 'Pemain Baru', en: 'Rookie' }, free: true, source: 'default' },
  'title-grinder': { kind: 'title', name: { id: 'Grinder', en: 'Grinder' }, source: 'achievement' },
  'title-quest-master': { kind: 'title', name: { id: 'Quest Master', en: 'Quest Master' }, source: 'achievement' },
  'title-veteran': { kind: 'title', name: { id: 'Veteran Arcade', en: 'Arcade Veteran' }, source: 'achievement' },
  'title-legend': { kind: 'title', name: { id: 'Legenda', en: 'Legend' }, source: 'achievement' },

  // ── Badge chat ──
  'chat-star': { kind: 'chatBadge', glyph: '✦', tone: 'gold', name: { id: 'Bintang Chat', en: 'Chat Star' }, source: 'achievement' },
  'chat-bolt': { kind: 'chatBadge', glyph: 'ϟ', tone: 'cyan', name: { id: 'Petir Chat', en: 'Chat Bolt' }, source: 'achievement' },

  // ── Banner profil (tema) ──
  'banner-aurora': { kind: 'banner', gradient: 'from-neon-cyan/25 via-neon-purple/20 to-transparent', name: { id: 'Banner Aurora', en: 'Aurora Banner' }, source: 'season' },
  'banner-ember': { kind: 'banner', gradient: 'from-neon-red/25 via-neon-gold/15 to-transparent', name: { id: 'Banner Ember', en: 'Ember Banner' }, source: 'achievement' },
  'banner-ocean': { kind: 'banner', gradient: 'from-neon-green/20 via-neon-cyan/20 to-transparent', name: { id: 'Banner Ocean', en: 'Ocean Banner' }, source: 'achievement' },

  // ── Emote chat (ketik :kode:) ──
  'emote-gg': { kind: 'emote', code: 'gg', glyph: 'GG', free: true, name: { id: 'Emote GG', en: 'GG Emote' }, source: 'default' },
  'emote-wave': { kind: 'emote', code: 'wave', glyph: '👋', free: true, name: { id: 'Emote Lambai', en: 'Wave Emote' }, source: 'default' },
  'emote-fire': { kind: 'emote', code: 'fire', glyph: '🔥', name: { id: 'Emote Api', en: 'Fire Emote' }, source: 'daily' },
  'emote-gem': { kind: 'emote', code: 'gem', glyph: '💎', name: { id: 'Emote Gem', en: 'Gem Emote' }, source: 'season' },
}

export const COSMETIC_KINDS = ['avatar', 'frame', 'badge', 'title', 'chatBadge', 'banner', 'emote']
export const FREE_ITEMS = Object.keys(COSMETICS).filter((id) => COSMETICS[id].free)

/** Hadiah kosmetik dari achievement. */
export const ACHIEVEMENT_ITEMS = {
  'first-win': ['badge-first-win'],
  'first-levelup': ['chat-star'],
  'streak-7': ['badge-streak-7'],
  'streak-30': ['badge-streak-30', 'mint-frame'],
  'level-15': ['badge-level-15', 'banner-ember'],
  'level-50': ['badge-level-50', 'title-legend'],
  'quests-10': ['badge-quest', 'banner-ocean'],
  'quest-master': ['title-quest-master'],
  'games-100': ['title-grinder', 'avatar-ember'],
  veteran: ['title-veteran'],
  'high-score': ['crimson-frame', 'chat-bolt'],
}

/** Season: tier tiap 500 season XP; hadiah kosmetik di tier tertentu. */
export const SEASON_TIER_XP = 1000
export const SEASON_MAX_TIER = 50
export const SEASON_LENGTH_DAYS = 28
export const SEASON_TIERS = [
  { tier: 1, item: 'emote-gem' },
  { tier: 3, item: 'banner-aurora' },
  { tier: 5, item: 'violet-frame' },
  { tier: 8, item: 'avatar-aurora' },
  { tier: 10, item: 'badge-season' },
]
