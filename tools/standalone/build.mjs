// Bundles src/ into ONE self-contained HTML page (libraries from CDN, no Vite needed).
// Usage: node tools/standalone/build.mjs [out.html]   (TAILWIND_BIN=/path/to/tailwindcss optional)
// JSX → CommonJS via TypeScript, tiny module registry, externals mapped to UMD globals.
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const require = createRequire(import.meta.url)
function requireAny(name) {
  try { return require(name) } catch { return require(path.join(execSync('npm root -g').toString().trim(), name)) }
}
const ts = requireAny('typescript')

const HERE_DIR = path.dirname(new URL(import.meta.url).pathname)
const ROOT = path.resolve(HERE_DIR, '../..')
const SRC = path.join(ROOT, 'src')
const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = process.argv[2] || path.join(ROOT, 'dist', 'neon-arcade-standalone.html')
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const EXTERNALS = {
  react: 'window.React',
  'react-dom': 'window.ReactDOM',
  'react-dom/client': 'window.ReactDOM',
  'react-router-dom': 'window.ReactRouterDOM',
  'framer-motion': 'window.Motion',
  // Ikon yang tidak ada di versi UMD → fallback Circle (tidak membuat halaman crash).
  'lucide-react': "(window.LucideReact && (window.__lucide || (window.__lucide = new Proxy(window.LucideReact, { get: function (t, k) { return k in t ? t[k] : (k === '__esModule' ? undefined : (t.Circle || function () { return null })) } }))))",
  'react/jsx-runtime': "__shims['react/jsx-runtime']",
  clsx: '__shims.clsx',
  zustand: '__shims.zustand',
  'zustand/middleware': "__shims['zustand/middleware']",
}

const ENTRY_ID = 'entry.jsx'
const ENTRY_SOURCE = `
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import App from '@/App'
ReactDOM.createRoot(document.getElementById('root')).render(
  <HashRouter><MotionConfig reducedMotion="user"><App /></MotionConfig></HashRouter>
)`

function resolveFile(base) {
  for (const candidate of [base, `${base}.js`, `${base}.jsx`, path.join(base, 'index.js'), path.join(base, 'index.jsx')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  throw new Error(`Cannot resolve ${base}`)
}

const modules = new Map() // id → { code, deps: {spec: id|external} }

function addModule(id, source, fromDir) {
  if (modules.has(id)) return
  const { outputText } = ts.transpileModule(source, {
    fileName: id,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const deps = {}
  modules.set(id, { code: outputText, deps })
  for (const [, , spec] of outputText.matchAll(/require\((["'])([^"']+)\1\)/g)) {
    if (EXTERNALS[spec]) { deps[spec] = { ext: spec }; continue }
    if (spec.endsWith('.css')) { deps[spec] = { ext: '__css' }; continue }
    const abs = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : path.resolve(fromDir, spec)
    const file = resolveFile(abs)
    const depId = path.relative(ROOT, file)
    deps[spec] = { id: depId }
    addModule(depId, fs.readFileSync(file, 'utf8'), path.dirname(file))
  }
}

addModule(ENTRY_ID, ENTRY_SOURCE, SRC)

let bundle = ';(function(){\n"use strict";\nvar __defs = {};\n'
for (const [id, { code, deps }] of modules) {
  bundle += `__defs[${JSON.stringify(id)}] = { deps: ${JSON.stringify(deps)}, fn: function (require, module, exports) {\n${code}\n} };\n`
}
bundle += `
var __cache = {};
function __load(id) {
  if (__cache[id]) return __cache[id].exports;
  var def = __defs[id];
  var module = { exports: {} };
  __cache[id] = module;
  def.fn(function (spec) {
    var d = def.deps[spec];
    if (!d) throw new Error('Unknown import ' + spec + ' in ' + id);
    if (d.id) return __load(d.id);
    var ext = __ext[d.ext];
    if (!ext) throw new Error('Library ' + d.ext + ' tidak termuat dari CDN');
    return ext;
  }, module, module.exports);
  return module.exports;
}
`
bundle += `var __ext = { __css: {}, ${Object.entries(EXTERNALS).map(([k, v]) => `${JSON.stringify(k)}: ${v}`).join(', ')} };\n`
bundle += `__load(${JSON.stringify(ENTRY_ID)});\n})();\n`

// Tailwind CSS compiled with the standalone CLI
// Tailwind: standalone CLI (TAILWIND_BIN) atau `npx tailwindcss` dari devDependencies.
const TW = process.env.TAILWIND_BIN || 'npx tailwindcss'
const css = execSync(`${TW} -c ${ROOT}/tailwind.config.js -i ${SRC}/index.css --minify`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] }).toString()
const shims = fs.readFileSync(path.join(HERE, 'shims.js'), 'utf8')

const CDN = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
  'https://unpkg.com/@remix-run/router@1.21.0/dist/router.umd.min.js',
  'https://unpkg.com/react-router@6.28.0/dist/umd/react-router.production.min.js',
  'https://unpkg.com/react-router-dom@6.28.0/dist/umd/react-router-dom.production.min.js',
  'https://unpkg.com/framer-motion@11.11.17/dist/framer-motion.js',
]

const html = `<title>Neon Arcade</title>
<meta name="theme-color" content="#06070c">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=JetBrains+Mono:wght@500;700&family=Manrope:wght@400;500;600;700;800&family=Unbounded:wght@500;700;800&display=swap" rel="stylesheet">
<script>
try{var p=JSON.parse(localStorage.getItem('neon-arcade:prefs')||'{}').state||{};var a=p.appearance||'dark';if(a==='system')a=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark';document.documentElement.dataset.appearance=a;if(p.language)document.documentElement.lang=p.language}catch(e){}
</script>
<style>
${css}
/* Bar tetap di atas memberi ruang untuk safe-area ponsel */
header.fixed,aside.fixed{padding-top:env(safe-area-inset-top,0px)}
#boot-error{display:none;max-width:560px;margin:15vh auto;padding:24px;border-radius:16px;border:1px solid rgba(255,77,94,.4);background:#0e111b;color:#fecaca;font:14px/1.6 Manrope,system-ui,sans-serif}
</style>
<div id="root"></div>
<div id="boot-error" role="alert"></div>
<script>
window.addEventListener('error', function (e) {
  var box = document.getElementById('boot-error');
  if (document.getElementById('root').childElementCount) return;
  box.style.display = 'block';
  box.textContent = 'Arcade gagal dimuat: ' + (e.message || 'skrip tidak bisa diunduh') + '. Coba muat ulang halaman.';
}, true);
</script>
${CDN.map((src) => `<script src="${src}" crossorigin></script>`).join('\n')}
<script>window.react = window.React;</script>
<script src="https://unpkg.com/lucide-react@0.460.0/dist/umd/lucide-react.min.js" crossorigin></script>
<script>
${shims}
${bundle}
</script>
`
fs.writeFileSync(OUT, html)
console.log(`modules: ${modules.size}, css: ${(css.length / 1024).toFixed(1)}KB, html: ${(html.length / 1024).toFixed(1)}KB → ${OUT}`)
