import { sha256Bytes, utf8 } from '@/utils/rng'
import { AppError } from '@/utils/errors'

/**
 * Anti-bot check for login, register and password reset.
 * Built-in proof-of-work challenge: the browser spends a fraction of a second hashing,
 *    which is nothing for a person and expensive for a bot that sends thousands of requests.
 */

const zeroBits = (bytes) => {
  let bits = 0
  for (const b of bytes) {
    if (b === 0) { bits += 8; continue }
    let o = b
    while ((o & 0x80) === 0) { bits++; o <<= 1 }
    break
  }
  return bits
}

/** Find a nonce whose SHA-256 has `bits` leading zero bits. Yields to the UI every few thousand tries. */
export async function solvePow(challenge, bits) {
  const prefix = `${challenge}:`
  for (let i = 0; i < 50_000_000; i++) {
    const s = i.toString(36)
    if (zeroBits(sha256Bytes(utf8(prefix + s))) >= bits) return s
    if (i % 4000 === 3999) await new Promise((r) => setTimeout(r, 0))
  }
  throw new AppError('auth.errors.captcha')
}

/** Ask the server what to solve and return the `captcha` field for the request body (or null when off). */
export async function captchaProof(fetchChallenge) {
  const c = await fetchChallenge()
  if (!c || c.mode === 'off') return null
  return { challenge: c.challenge, solution: await solvePow(c.challenge, c.bits) }
}

// ── Visible check on the auth forms (HumanCheck) ──
let prepared = null
export const setPreparedCaptcha = (c) => {
  prepared = c ? { ...c, at: Date.now() } : null
}
/** One proof per request. Tells the widget to reset so the next attempt gets a fresh check. */
export function takePreparedCaptcha() {
  const c = prepared && Date.now() - prepared.at < 4 * 60_000 ? prepared : null
  prepared = null
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('neon-captcha-used'))
  if (!c) return null
  const { at, ...proof } = c
  return proof
}
