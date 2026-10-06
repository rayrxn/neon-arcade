import { hmacSha256, bytesToHex, sha256Hex, utf8 } from './rng'

/**
 * Hash password: PBKDF2-HMAC-SHA256 (salt acak per user).
 * WebCrypto dipakai bila tersedia (secure context); kalau tidak, implementasi JS murni
 * dengan iterasi lebih rendah supaya tetap responsif. Format: `pbkdf2-sha256$<iter>$<hex>`.
 * Hash lama (SHA-256 tunggal, Fase 2–4) diverifikasi lalu otomatis di-upgrade saat login.
 */
const SUBTLE_ITERATIONS = 120_000
const JS_ITERATIONS = 12_000

const subtle = () => (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle ? globalThis.crypto.subtle : null)

function pbkdf2Js(password, salt, iterations) {
  const key = utf8(password)
  const first = new Uint8Array([...utf8(salt), 0, 0, 0, 1])
  let u = hmacSha256(key, first)
  const out = u.slice()
  for (let i = 1; i < iterations; i++) {
    u = hmacSha256(key, u)
    for (let j = 0; j < 32; j++) out[j] ^= u[j]
  }
  return bytesToHex(out)
}

async function pbkdf2(password, salt, iterations) {
  const s = subtle()
  if (s) {
    try {
      const key = await s.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits'])
      const bits = await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: utf8(salt), iterations }, key, 256)
      return bytesToHex(new Uint8Array(bits))
    } catch {
      /* jatuh ke implementasi JS */
    }
  }
  return pbkdf2Js(password, salt, iterations)
}

export async function hashPassword(password, salt) {
  const iterations = subtle() ? SUBTLE_ITERATIONS : JS_ITERATIONS
  return `pbkdf2-sha256$${iterations}$${await pbkdf2(password, salt, iterations)}`
}

/** Bandingkan tanpa short-circuit (constant-time sederhana). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** → { ok, legacy } — legacy = hash lama yang perlu di-upgrade. */
export async function verifyPassword(password, salt, stored) {
  if (!stored) return { ok: false, legacy: false }
  if (stored.startsWith('pbkdf2-sha256$')) {
    const [, iter, hex] = stored.split('$')
    return { ok: safeEqual(await pbkdf2(password, salt, Number(iter)), hex), legacy: false }
  }
  return { ok: safeEqual(sha256Hex(`${salt}:${password}`), stored), legacy: true }
}
