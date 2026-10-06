// Cek i18n statis: semua t('a.b') di src harus ada di kamus id & en (hasil merge semua fase).
// Jalankan: npm run test:i18n
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
const SRC = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src')
const files = []
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(jsx?|mjs)$/.test(e.name) && files.push(path.join(d, e.name))))
walk(SRC)
const keys = new Set()
const dyn = new Set()
for (const f of files) {
  if (f.includes('/i18n/')) continue
  const s = fs.readFileSync(f, 'utf8')
  for (const m of s.matchAll(/\bt\(\s*'([a-zA-Z0-9_.\-]+)'/g)) keys.add(m[1])
  for (const m of s.matchAll(/\bt\(\s*`([^`]+)`/g)) dyn.add(m[1])
  for (const m of s.matchAll(/new AppError\(\s*'([a-zA-Z0-9_.\-]+)'/g)) keys.add(m[1])
  for (const m of s.matchAll(/translate\(\s*\w+,\s*'([a-zA-Z0-9_.\-]+)'/g)) keys.add(m[1])
}
// load dictionaries by transpiling ESM i18n files (pure objects)
const load = async (name) => (await import(pathToFileURL(path.join(SRC, 'i18n', name)).href)).default
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const merge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b)) o[k] = isObj(v) && isObj(a[k]) ? merge(a[k], v) : v; return o }
const names = fs.readdirSync(path.join(SRC, 'i18n')).filter((n) => /\.(id|en)\.js$|^(id|en)\.js$/.test(n))
const out = {}
for (const lang of ['id', 'en']) {
  const parts = [`${lang}.js`, ...names.filter((n) => n.endsWith(`.${lang}.js`)).sort()]
  let d = {}
  for (const p of parts) d = merge(d, await load(p))
  out[lang] = d
}
function lookup(dict, key) {
  const parts = key.split('.')
  let node = dict
  for (let i = 0; i < parts.length; i++) {
    if (node == null) return undefined
    const rest = parts.slice(i).join('.')
    if (i > 0 && typeof node === 'object' && rest in node) return node[rest]
    node = node[parts[i]]
  }
  return node
}
const missing = { id: [], en: [] }
for (const k of [...keys].sort()) for (const l of ['id', 'en']) if (lookup(out[l], k) === undefined) missing[l].push(k)
console.log('static keys', keys.size, 'missing id', missing.id.length, 'en', missing.en.length)
console.log(JSON.stringify(missing.id, null, 0))
if (process.argv[2] === 'dyn') console.log([...dyn].sort().join('\n'))
// en-only missing
console.log('EN-only missing:', missing.en.filter((k) => !missing.id.includes(k)))
const real = [...missing.id, ...missing.en].filter((k) => !k.endsWith('.'))
process.exitCode = real.length ? 1 : 0
