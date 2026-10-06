/**
 * utils/rng.js — Provably Fair RNG Engine (pusat semua hasil acak game).
 *
 * Protokol commit–reveal (standar industri "provably fair"):
 *   1. serverSeed dibuat diam-diam. Pemain hanya melihat SHA-256(serverSeed) SEBELUM bermain.
 *   2. Pemain mengontrol clientSeed. Setiap taruhan memakai nonce yang terus naik.
 *   3. Byte hasil = HMAC_SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${cursor}`).
 *      Setiap 4 byte → 1 float di [0, 1). Satu taruhan bisa meminta banyak float (cursor naik tiap 32 byte).
 *   4. Saat seed dirotasi, serverSeed lama dibuka → semua ronde lama bisa dihitung ulang & diverifikasi.
 *
 * Semua fungsi di sini MURNI & SINKRON (SHA-256/HMAC ditulis sendiri, tanpa crypto.subtle),
 * jadi tetap jalan saat app dibuka lewat http://IP-LAN dari HP — crypto.subtle hanya ada di secure context.
 *
 * Cara pakai di game (Fase 3+):
 *   const { floats, proof } = useFairnessStore.getState().roll(1)
 *   const multiplier = crashPoint(floats[0])
 */

// ───────────────────────────── Byte helpers ─────────────────────────────

const encoder = new TextEncoder()
export const utf8 = (str) => encoder.encode(String(str))

export const bytesToHex = (bytes) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')

/** Hex acak yang aman secara kriptografis (getRandomValues tersedia juga di non-secure context). */
export function randomHex(byteLength = 32) {
  const bytes = new Uint8Array(byteLength)
  globalThis.crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

// ───────────────────────────── SHA-256 (FIPS 180-4) ─────────────────────────────

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]

const rotr = (x, n) => (x >>> n) | (x << (32 - n))

/** SHA-256 atas Uint8Array → Uint8Array(32). */
export function sha256Bytes(message) {
  const length = message.length
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6)
  padded.set(message)
  padded[length] = 0x80

  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000)) // bit length (high 32)
  view.setUint32(padded.length - 4, (length * 8) >>> 0) // bit length (low 32)

  const H = Uint32Array.from(H0)
  const W = new Uint32Array(64)

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(offset + i * 4)
    for (let i = 16; i < 64; i++) {
      const w15 = W[i - 15]
      const w2 = W[i - 2]
      const s0 = rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)
      const s1 = rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0
    }

    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K[i] + W[i]) | 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0
      h = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }

    H[0] += a
    H[1] += b
    H[2] += c
    H[3] += d
    H[4] += e
    H[5] += f
    H[6] += g
    H[7] += h
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  H.forEach((word, i) => outView.setUint32(i * 4, word))
  return out
}

export const sha256Hex = (input) => bytesToHex(sha256Bytes(typeof input === 'string' ? utf8(input) : input))

/** HMAC-SHA256 (RFC 2104). */
export function hmacSha256(keyBytes, messageBytes) {
  let key = keyBytes.length > 64 ? sha256Bytes(keyBytes) : keyBytes
  const block = new Uint8Array(64)
  block.set(key)

  const inner = new Uint8Array(64 + messageBytes.length)
  const outer = new Uint8Array(64 + 32)
  for (let i = 0; i < 64; i++) {
    inner[i] = block[i] ^ 0x36
    outer[i] = block[i] ^ 0x5c
  }
  inner.set(messageBytes, 64)
  outer.set(sha256Bytes(inner), 64)
  return sha256Bytes(outer)
}

export const hmacSha256Hex = (key, message) => bytesToHex(hmacSha256(utf8(key), utf8(message)))

// ───────────────────────────── Seeds & floats ─────────────────────────────

export const generateServerSeed = () => randomHex(32)
export const generateClientSeed = () => randomHex(10)

/**
 * Menghasilkan `count` float deterministik di [0, 1) dari pasangan seed + nonce.
 * Presisi 32-bit per float (4 byte): b0/256 + b1/256² + b2/256³ + b3/256⁴.
 */
export function generateFloats({ serverSeed, clientSeed, nonce, count = 1 }) {
  const floats = []
  const key = utf8(serverSeed)
  for (let cursor = 0; floats.length < count; cursor++) {
    const bytes = hmacSha256(key, utf8(`${clientSeed}:${nonce}:${cursor}`))
    for (let i = 0; i < 32 && floats.length < count; i += 4) {
      floats.push(bytes[i] / 256 + bytes[i + 1] / 256 ** 2 + bytes[i + 2] / 256 ** 3 + bytes[i + 3] / 256 ** 4)
    }
  }
  return floats
}

/** Verifikasi satu ronde setelah serverSeed dibuka. */
export function verifyRoll({ serverSeed, serverSeedHash, clientSeed, nonce, count = 1 }) {
  return {
    hashMatches: sha256Hex(serverSeed) === serverSeedHash,
    floats: generateFloats({ serverSeed, clientSeed, nonce, count }),
  }
}

// ───────────────────────────── Float → hasil game ─────────────────────────────
// Semua mapper menerima float yang sudah dihasilkan, jadi bisa diverifikasi ulang 1:1.

export const HOUSE_EDGE = 0.01

/** Integer di [0, max). */
export const floatToInt = (float, max) => Math.floor(float * max)

/** Integer di [min, max] (inklusif). */
export const randomInRange = (float, min, max) => min + Math.floor(float * (max - min + 1))

/** Pilih item berbobot. items: [{ weight, ... }] */
export function pickWeighted(float, items, weightKey = 'weight') {
  const total = items.reduce((sum, item) => sum + item[weightKey], 0)
  let target = float * total
  for (const item of items) {
    if (target < item[weightKey]) return item
    target -= item[weightKey]
  }
  return items[items.length - 1]
}

/** Fisher–Yates dengan float provably fair. Butuh `array.length - 1` float. */
export function shuffleWithFloats(array, floats) {
  const result = array.slice()
  for (let i = result.length - 1, f = 0; i > 0; i--, f++) {
    const j = Math.floor(floats[f] * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

/** Jumlah float yang dibutuhkan tiap mode — dipakai saat memanggil roll(count). */
export const FLOATS_REQUIRED = {
  caseOpening: 1,
  caseBattle: 2, // 1 pemain + 1 bot per ronde
  plinko: (rows) => rows,
  roulette: 1,
  blackjack: 51, // shuffle 52 kartu
  reme: 51,
  mines: 24, // shuffle 25 petak
  crash: 1,
  dice: 1,
  limbo: 1,
  coinflip: 1,
}

/** Tier rarity Gacha / Case Opening. Bobot = persen peluang. */
export const RARITY_TIERS = [
  { id: 'common', label: 'Common', weight: 50, color: '#9aa4b8' },
  { id: 'rare', label: 'Rare', weight: 30, color: '#3b9bff' },
  { id: 'epic', label: 'Epic', weight: 15, color: '#a35bff' },
  { id: 'legendary', label: 'Legendary', weight: 4, color: '#ffc83d' },
  { id: 'secret', label: 'Secret', weight: 1, color: '#ff4d8d' },
]

export const rollRarity = (float) => pickWeighted(float, RARITY_TIERS)

/**
 * Titik crash dengan house edge. Distribusi: P(crash ≥ x) = (1 - edge) / x.
 * Hasil minimal 1.00x, dibulatkan ke bawah 2 desimal.
 */
export function crashPoint(float, houseEdge = HOUSE_EDGE) {
  const raw = (1 - houseEdge) / (1 - float)
  return Math.max(1, Math.floor(raw * 100) / 100)
}

/** Limbo memakai distribusi yang sama dengan Crash. */
export const limboResult = crashPoint

/** Dice: 0.00 – 100.00 (10.001 kemungkinan). */
export const diceRoll = (float) => Math.floor(float * 10001) / 100

/** Payout dice dari win chance (%) dengan house edge. */
export const diceMultiplier = (winChance, houseEdge = HOUSE_EDGE) =>
  winChance <= 0 ? 0 : Math.floor(((100 * (1 - houseEdge)) / winChance) * 10000) / 10000

/** Roulette Eropa: 0–36. */
export const rouletteNumber = (float) => floatToInt(float, 37)

export const coinflipSide = (float) => (float < 0.5 ? 'heads' : 'tails')

/** Plinko: arah tiap baris (0 = kiri, 1 = kanan). Index bin = jumlah langkah kanan. */
export function plinkoPath(floats, rows) {
  const path = floats.slice(0, rows).map((f) => (f < 0.5 ? 0 : 1))
  return { path, bin: path.reduce((sum, step) => sum + step, 0) }
}

/** Mines: posisi ranjau (index 0–24) dari shuffle 25 petak. */
export function minePositions(floats, mineCount, gridSize = 25) {
  const tiles = Array.from({ length: gridSize }, (_, i) => i)
  return shuffleWithFloats(tiles, floats).slice(0, mineCount).sort((a, b) => a - b)
}

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs']
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

/** Deck standar 52 kartu (urut). Kocok dengan shuffleWithFloats(deck, floats). */
export const createDeck = () => SUITS.flatMap((suit) => RANKS.map((rank) => ({ rank, suit, id: `${rank}-${suit}` })))
