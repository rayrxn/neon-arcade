import { useEffect, useState } from 'react'
import clsx from 'clsx'

/**
 * Formatting codes for short player text (name prefix / suffix, profile status and bio), inspired by
 * classic block-game chat codes. Rendering only: the stored text keeps the codes, searches and IDs never change,
 * and nothing is ever injected as HTML — every segment is a plain React text node with a whitelisted class.
 *
 *   &0–&9 &a–&f  colors        &k  obfuscated (scrambles visually, real text stays in aria-label)
 *   &l bold   &o italic   &n underline   &m strikethrough   &r reset
 */
export const FORMAT_COLORS = {
  0: '#1f2937', 1: '#1d4ed8', 2: '#16a34a', 3: '#0891b2', 4: '#b91c1c', 5: '#9333ea', 6: '#f59e0b', 7: '#a1a1aa',
  8: '#52525b', 9: '#60a5fa', a: '#4ade80', b: '#67e8f9', c: '#f87171', d: '#f0abfc', e: '#fde047', f: '#ffffff',
}
const CODE_RE = /&([0-9a-fk-or])/gi

/** Text without codes (for length checks, search, accessibility). */
export const stripCodes = (s) => String(s ?? '').replace(CODE_RE, '')
export const hasCodes = (s) => /&[0-9a-fk-or]/i.test(String(s ?? ''))

/** Split into segments: { text, color, k, l, o, n, m }. */
export function parseCodes(input) {
  const s = String(input ?? '')
  const out = []
  let st = {}
  let last = 0
  for (const m of s.matchAll(CODE_RE)) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), ...st })
    const c = m[1].toLowerCase()
    if (FORMAT_COLORS[c]) st = { color: FORMAT_COLORS[c] } // a color resets styles, like the original
    else if (c === 'r') st = {}
    else st = { ...st, [c]: true }
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ text: s.slice(last), ...st })
  return out
}

// One shared ticker for every obfuscated segment on the page (cheap even with many names on screen).
const listeners = new Set()
let timer = null
function subscribe(fn) {
  listeners.add(fn)
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 80)
  return () => {
    listeners.delete(fn)
    if (!listeners.size) { clearInterval(timer); timer = null }
  }
}
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZabdeghkmnpqrstuwyz0123456789#$%&@?'
const calm = () => typeof document !== 'undefined' && (document.documentElement.hasAttribute('data-potato') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)

function Obfuscated({ text }) {
  const [, setTick] = useState(0)
  const still = calm()
  useEffect(() => (still ? undefined : subscribe(() => setTick((n) => n + 1))), [still])
  const shown = Array.from(text).map((ch) => (ch === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0])).join('')
  return <span className={clsx('fmt-k', still && 'fmt-k--still')} aria-hidden="true">{still ? text : shown}</span>
}

export default function FormattedText({ text, className }) {
  const raw = String(text ?? '')
  if (!hasCodes(raw)) return <span className={className}>{raw}</span>
  const segs = parseCodes(raw)
  return (
    <span className={clsx('fmt', className)} aria-label={stripCodes(raw)}>
      {segs.map((g, i) => {
        const cls = clsx(g.l && 'font-black', g.o && 'italic', g.n && 'underline underline-offset-2', g.m && 'line-through', g.color && 'fmt-color')
        const style = g.color ? { '--fmt': g.color } : undefined
        return <span key={i} className={cls || undefined} style={style} aria-hidden="true">{g.k ? <Obfuscated text={g.text} /> : g.text}</span>
      })}
    </span>
  )
}
