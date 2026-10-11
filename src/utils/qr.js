/**
 * Minimal QR Code encoder (byte mode, error correction M, versions 1–40, best mask).
 * Port of the reference algorithm (ISO/IEC 18004) used to show the authenticator setup code.
 * qrMatrix(text) → array of rows, true = dark module.
 */

const ECC_M_CODEWORDS_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
const ECC_M_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
const ECC_FORMAT_BITS_M = 0

function rawModules(ver) {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (ver >= 7) r -= 36
  }
  return r
}
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_M_CODEWORDS_PER_BLOCK[ver] * ECC_M_BLOCKS[ver]

function rsDivisor(degree) {
  const res = new Array(degree).fill(0)
  res[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < res.length; j++) {
      res[j] = rsMul(res[j], root)
      if (j + 1 < res.length) res[j] ^= res[j + 1]
    }
    root = rsMul(root, 0x02)
  }
  return res
}
function rsMul(x, y) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}
function rsRemainder(data, div) {
  const res = div.map(() => 0)
  for (const b of data) {
    const f = b ^ res.shift()
    res.push(0)
    div.forEach((c, i) => { res[i] ^= rsMul(c, f) })
  }
  return res
}

function alignmentPositions(ver) {
  if (ver === 1) return []
  const n = Math.floor(ver / 7) + 2
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
  const out = [6]
  for (let pos = ver * 4 + 10; out.length < n; pos -= step) out.splice(1, 0, pos)
  return out
}

export function qrMatrix(text) {
  const bytes = Array.from(new TextEncoder().encode(text))
  let ver = 1
  for (; ver <= 40; ver++) {
    const cap = dataCodewords(ver) * 8
    const need = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8
    if (need <= cap) break
  }
  if (ver > 40) throw new Error('QR: data too long')
  // Bit stream: mode 0100 (byte), length, data, terminator, padding.
  const bits = []
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1) }
  put(4, 4)
  put(bytes.length, ver < 10 ? 8 : 16)
  bytes.forEach((b) => put(b, 8))
  const cap = dataCodewords(ver) * 8
  put(0, Math.min(4, cap - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8)
  const data = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))
  // Blocks + error correction, interleaved.
  const numBlocks = ECC_M_BLOCKS[ver]
  const eccLen = ECC_M_CODEWORDS_PER_BLOCK[ver]
  const raw = Math.floor(rawModules(ver) / 8)
  const numShort = numBlocks - (raw % numBlocks)
  const shortLen = Math.floor(raw / numBlocks)
  const div = rsDivisor(eccLen)
  const blocks = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1))
    k += dat.length
    const ecc = rsRemainder(dat, div)
    if (i < numShort) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const codewords = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= numShort) codewords.push(b[i]) })
  }
  // Matrix with function patterns.
  const size = ver * 4 + 17
  const mod = Array.from({ length: size }, () => new Array(size).fill(false))
  const fn = Array.from({ length: size }, () => new Array(size).fill(false))
  const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true }
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0) }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)); const x = cx + dx; const y = cy + dy
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4)
    }
  }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
  const al = alignmentPositions(ver)
  al.forEach((ay, i) => al.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }))
  const drawFormat = (mask) => {
    const data5 = (ECC_FORMAT_BITS_M << 3) | mask
    let rem = data5
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const b = ((data5 << 10) | rem) ^ 0x5412
    const bit = (i) => ((b >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) set(8, i, bit(i))
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8))
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i))
    set(8, size - 8, true)
  }
  drawFormat(0)
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const b = (ver << 12) | rem
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) !== 0; const a = size - 11 + (i % 3); const c = Math.floor(i / 3)
      set(a, c, dark); set(c, a, dark)
    }
  }
  // Data placement (zigzag).
  let idx = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j
      const up = ((right + 1) & 2) === 0
      const y = up ? size - 1 - v : v
      if (!fn[y][x] && idx < codewords.length * 8) {
        mod[y][x] = ((codewords[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0
        idx++
      }
    }
  }
  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ]
  const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x] }
  const penalty = () => {
    let p = 0
    const runs = (line) => {
      let s = 0
      for (let i = 0, run = 1; i < line.length; i++) {
        if (i + 1 < line.length && line[i + 1] === line[i]) run++
        else { if (run >= 5) s += run - 2; run = 1 }
      }
      return s
    }
    for (let y = 0; y < size; y++) p += runs(mod[y])
    for (let x = 0; x < size; x++) p += runs(mod.map((r) => r[x]))
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = mod[y][x]
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3
    }
    const pat = (line) => {
      let s = 0
      const str = line.map((d) => (d ? 1 : 0)).join('')
      for (const q of ['10111010000', '00001011101']) { let k = str.indexOf(q); while (k >= 0) { s += 40; k = str.indexOf(q, k + 1) } }
      return s
    }
    for (let y = 0; y < size; y++) p += pat(mod[y])
    for (let x = 0; x < size; x++) p += pat(mod.map((r) => r[x]))
    const dark = mod.reduce((a, r) => a + r.filter(Boolean).length, 0)
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10
    return p
  }
  let best = 0, bestP = Infinity
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m)
    const p = penalty()
    if (p < bestP) { bestP = p; best = m }
    applyMask(m)
  }
  applyMask(best); drawFormat(best)
  return mod
}

/** SVG path for the dark modules (1 unit per module, with a 4-module quiet zone). */
export function qrPath(text) {
  const m = qrMatrix(text)
  let d = ''
  m.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x + 4} ${y + 4}h1v1h-1z` }))
  return { d, size: m.length + 8 }
}
