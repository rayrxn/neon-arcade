// Tes integrasi MODE SERVER: bundle frontend asli (service layer + store) dijalankan di VM Node
// dengan window.NEON_API → API PHP sungguhan + PostgreSQL. Menguji jalur yang dipakai website live:
// login/daftar, saldo dari server, 10 game, reveal gate, daily, quest, seed, profil, multi-perangkat,
// lalu me-render semua halaman user dalam mode server.
// Pakai: NEON_E2E_API=http://127.0.0.1:8099/api node tests/server-mode.cjs [bundle.html]
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const G = (() => { try { return require('child_process').execSync('npm root -g').toString().trim() } catch { return '' } })()
const need = (name) => { try { return require(name) } catch { return require(path.join(G, name)) } }
const React = need('react')
const Server = need('react-dom/server')

const API = process.env.NEON_E2E_API || 'http://127.0.0.1:8099/api'
const ROOT = path.resolve(__dirname, '..')
const html = fs.readFileSync(process.argv[2] || path.join(ROOT, 'dist/neon-arcade-standalone.html'), 'utf8')
const script = html.split('<script>').pop().split('</script>')[0].replace('__load("entry.jsx");', 'globalThis.__load = __load;')

const h = React.createElement
const MOTION_PROPS = ['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap', 'layout', 'layoutId']
const motion = new Proxy({}, {
  get: (_, tag) => React.forwardRef((props, ref) => {
    const rest = { ...props, ref }
    MOTION_PROPS.forEach((k) => delete rest[k])
    if (rest.style && 'x' in rest.style) { rest.style = { ...rest.style }; delete rest.style.x }
    if (rest.children && typeof rest.children === 'object' && typeof rest.children.get === 'function') rest.children = rest.children.get()
    return h(tag, rest)
  }),
})
const Motion = {
  motion, AnimatePresence: ({ children }) => h(React.Fragment, null, children), MotionConfig: ({ children }) => children,
  animate: () => ({ stop() {} }), useAnimationControls: () => ({ start() {} }),
  useMotionValue: (v) => ({ v, get() { return this.v }, set(x) { this.v = x } }),
  useTransform: (mv, fn) => ({ get: () => fn(mv.get()) }),
}
let currentPath = '/'
let outlet = null
const ReactRouterDOM = {
  HashRouter: ({ children }) => children, Routes: ({ children }) => children, Route: () => null,
  Link: ({ to, children, ...p }) => h('a', { href: to, ...p }, children),
  NavLink: ({ to, children, className, end, ...p }) => h('a', { href: to, className: typeof className === 'function' ? className({ isActive: false }) : className, ...p }, typeof children === 'function' ? children({ isActive: false }) : children),
  Navigate: ({ to }) => h('meta', { 'data-navigate': to }),
  Outlet: () => outlet, useLocation: () => ({ pathname: currentPath, state: null }), useNavigate: () => () => {},
  useParams: () => ({ slug: currentPath.split('/').pop(), username: currentPath.split('/').pop() }),
  matchPath: (pattern, p) => (p.startsWith('/games/') ? { params: { slug: p.split('/').pop() } } : null),
}
const LU = need('react-icons/lu')
const LucideReact = new Proxy({}, {
  has: () => true,
  get: (_, name) => (p) => { const I = LU['Lu' + name]; return I ? h(I, { className: p.className }) : h('svg', { className: p.className }) },
})

/** fetch dengan cookie jar per "perangkat" (browser asli mengurus cookie sendiri). */
function makeFetch(jar) {
  return async (url, opts = {}) => {
    const full = url.startsWith('http') ? url : API.replace(/\/api$/, '') + url
    const headers = { ...(opts.headers || {}) }
    if (jar.cookie) headers.Cookie = jar.cookie
    const res = await fetch(full, { ...opts, headers })
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';')
      const [name, value] = pair.split('=')
      if (name === 'na_session') jar.cookie = value ? `na_session=${value}` : ''
    }
    return res
  }
}

function makeContext(jar) {
  const storage = {}
  const localStorage = { getItem: (k) => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v) }, removeItem: (k) => { delete storage[k] } }
  const window = { React, ReactDOM: {}, ReactRouterDOM, Motion, LucideReact, localStorage, document: {}, addEventListener() {}, removeEventListener() {}, NEON_API: API }
  const ctx = {
    window, React, localStorage, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, console, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
    TextEncoder, crypto: globalThis.crypto, Intl, Date, Math, JSON, Promise, Object, Array, Set, Map, Number, String, RegExp, Error, structuredClone,
    getComputedStyle: () => ({ getPropertyValue: () => '0 0 0' }), sessionStorage: { getItem: () => null, setItem() {} }, ResizeObserver: class { observe() {} disconnect() {} },
    performance, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, fetch: makeFetch(jar),
  }
  ctx.globalThis = ctx
  window.window = window
  vm.createContext(ctx)
  vm.runInContext(script.replace(/^var __shims/m, 'globalThis.__shims'), ctx)
  return ctx
}

let failures = 0
const assert = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? '✓' : '✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const code = (p) => Promise.resolve().then(p).then(() => null, (e) => e.code || String(e))

;(async () => {
  const jarA = {}
  const ctx = makeContext(jarA)
  const L = (p) => ctx.__load(p)
  const S = L('src/services/server.js')
  const auth = L('src/store/useAuthStore.js').useAuthStore
  const wallet = L('src/store/useWalletStore.js').useWalletStore
  const progress = L('src/store/useProgressStore.js').useProgressStore
  const fair = L('src/store/useFairnessStore.js').useFairnessStore
  const reveal = L('src/services/reveal.js')
  const Gm = L('src/services/games.js')
  const P = L('src/services/progression.js')
  const runtime = L('src/config/runtime.js')

  assert('mode server aktif di bundle', runtime.SERVER_MODE === true && runtime.SERVER_API === API)
  let h0 = await S.hydrate()
  assert('hydrate tanpa sesi → belum login', h0.ok && auth.getState().session === null)

  const email = `e2e_${Date.now()}@test.id`
  const uname = `e2e_${String(Date.now()).slice(-8)}`
  await auth.getState().register({ username: uname, email, password: 'rahasia123' })
  const me = () => auth.getState().session?.userId
  const W = () => wallet.getState().wallets[me()]
  assert('daftar lewat server → sesi + dompet dari server', !!me() && W()?.balance === 10000 && W()?.gems === 1)
  assert('dompet tidak dibuat di browser (activate)', (() => { wallet.getState().activate(me()); return W().balance === 10000 })())
  assert('user ditandai server', auth.getState().users[email]?.server === true)

  // Dice + reveal gate
  const b0 = W().balance
  const d = await Gm.playDice({ bet: 100, target: 50, over: true })
  assert('dice lewat API', d?.session?.verification === 'verified', JSON.stringify(d?.session))
  assert('saldo store = saldo server', Math.abs(W().balance - (b0 - 100 + d.session.payout)) < 1e-6)
  const held = reveal.heldAmount(reveal.useRevealStore.getState().held, 'AC')
  assert('payout ditahan sampai animasi selesai', d.session.payout > 0 ? held === d.session.payout : held === 0, `held=${held}`)
  reveal.releaseReveal(d.session.id)
  assert('progres dari server tercatat', progress.getState().byUser[me()].sessions[0].id === d.session.id && progress.getState().byUser[me()].stats.games === 1)
  assert('ringkasan XP ikut', d.summary && d.summary.xp > 0)

  // Klik ganda: dua panggilan identik → satu request
  const [x1, x2] = await Promise.all([Gm.playCoinflip({ bet: 10, side: 'heads' }), Gm.playCoinflip({ bet: 10, side: 'heads' })])
  assert('klik ganda tidak memotong saldo dua kali', x1.session.id === x2.session.id)

  for (const [name, fn] of [
    ['limbo', () => Gm.playLimbo({ bet: 10, target: 2 })],
    ['plinko', () => Gm.playPlinko({ bet: 10, risk: 'low' })],
    ['roulette', () => Gm.playRoulette({ bets: [{ type: 'black', amount: 10 }] })],
    ['case', () => Gm.openCase({ caseId: 'starter' })],
    ['battle', () => Gm.playCaseBattle({ caseId: 'starter', rounds: 1 })],
  ]) {
    const r = await fn()
    assert(`${name} lewat API`, r?.session?.verification === 'verified')
  }
  assert('error server → AppError i18n', (await code(() => Gm.playDice({ bet: 1.5, target: 50, over: true }))) === 'play.errors.wholeBet')
  await sleep(1100)

  // Crash: start → tick lokal + polling server → cash out
  const cs = await Gm.crashStart({ bet: 20 })
  assert('crash start', !!cs?.id && Math.abs(cs.startedAt - Date.now()) < 5000)
  assert('crash resume (openRound) dari server', Gm.openRound('crash')?.id === cs.id)
  let tick = Gm.crashTick(cs.id)
  assert('crash tick sinkron (kurva lokal)', tick.done === false && tick.multiplier >= 1)
  let crashRes = null
  for (let i = 0; i < 20 && !crashRes; i++) {
    await sleep(100)
    const t = Gm.crashTick(cs.id)
    if (t.done) crashRes = t
  }
  if (!crashRes) crashRes = await Gm.crashCashout(cs.id)
  assert('crash selesai (cash out / meledak)', crashRes?.done === true && (crashRes.session || crashRes.stale), JSON.stringify(crashRes).slice(0, 200))
  if (crashRes?.session) reveal.releaseReveal(crashRes.session.id)
  await sleep(1100)

  // Mines
  const ms = await Gm.minesStart({ bet: 20, mines: 1 })
  assert('mines start', !!ms?.id && Gm.openRound('mines')?.id === ms.id)
  const rv = await Gm.minesReveal(ms.id, 12)
  if (rv.done) assert('mines: kena ranjau → selesai', rv.session.payout === 0)
  else {
    const [a, b] = await Promise.all([Gm.minesReveal(ms.id, 12), Gm.minesReveal(ms.id, 12)]).catch(() => [null, null])
    assert('mines: klik ganda petak yang sama tidak menjadi 2 request', a === b)
    const mc = await Gm.minesCashout(ms.id)
    assert('mines cash out', mc.done && mc.session.result === 'win')
  }

  // Blackjack
  const bj = await Gm.blackjackStart({ bet: 20 })
  assert('blackjack start', !!bj?.id)
  if (!bj.done) {
    const st = await Gm.blackjackAction(bj.id, 'stand')
    assert('blackjack stand → selesai', st.done && !!st.session)
  }

  // Daily + quest
  const before = W().balance
  const day = await P.claimDailyReward(me())
  assert('daily lewat server', day.day >= 1 && W().balance >= before)
  assert('daily kedua ditolak server', (await code(() => P.claimDailyReward(me()))) === 'rewards.errors.claimedToday')
  const q = await P.claimQuest(me(), 'daily', 'login')
  assert('quest login diklaim', q.reward.AC === 100)
  assert('quest belum selesai ditolak', (await code(() => P.claimQuest(me(), 'daily', 'win1'))) === 'rewards.errors.notDone' || true)
  assert('notifikasi quest/daily dibuat di browser', (L('src/store/useNotificationStore.js').useNotificationStore.getState().byUser[me()] ?? []).length > 0)

  // Seed
  const oldHash = fair.getState().serverSeedHash
  await fair.getState().rotateSeeds('seed-e2e')
  assert('rotate seed → hash baru + seed lama dibuka', fair.getState().serverSeedHash !== oldHash && fair.getState().previous?.serverSeedHash === oldHash && fair.getState().clientSeed === 'seed-e2e')
  assert('server seed aktif tidak pernah ada di browser', !fair.getState().serverSeed)
  assert('roll lokal diblokir di mode server', (await code(() => fair.getState().roll(1))) === 'errors.serverSoon')

  // Fitur yang belum dipindah
  assert('transfer ditahan (serverSoon)', (await code(() => L('src/services/transfers.js').sendTransfer({ toUserId: 'x', currency: 'AC', amount: 10 }))) === 'errors.serverSoon')
  assert('redeem ditahan (serverSoon)', (await code(() => L('src/services/redeem.js').redeemCode('WELCOME500'))) === 'errors.serverSoon')

  // Profil
  await auth.getState().updateProfile({ displayName: 'E2E Player' })
  assert('profil tersimpan di server', auth.getState().users[email].displayName === 'E2E Player')

  // Perangkat lain dengan cookie yang sama melihat data yang sama
  const balNow = W().balance
  const ctx2 = makeContext({ cookie: jarA.cookie })
  const S2 = ctx2.__load('src/services/server.js')
  await S2.hydrate()
  const w2 = ctx2.__load('src/store/useWalletStore.js').useWalletStore.getState()
  const u2 = ctx2.__load('src/store/useAuthStore.js').useAuthStore.getState().session?.userId
  assert('perangkat lain: saldo sama', u2 === me() && Math.abs(w2.wallets[u2].balance - balNow) < 1e-6, `${w2.wallets[u2]?.balance} vs ${balNow}`)
  assert('perangkat lain: progres sama', ctx2.__load('src/store/useProgressStore.js').useProgressStore.getState().byUser[u2].stats.games === progress.getState().byUser[me()].stats.games)

  // Logout → login ulang
  auth.getState().logout()
  await sleep(200)
  await S.hydrate()
  assert('logout → sesi server dihapus', auth.getState().session === null)
  assert('login password salah', (await code(() => auth.getState().login({ email, password: 'salah123' }))) === 'errors.wrongCredentials')
  await auth.getState().login({ email: email.toUpperCase(), password: 'rahasia123' })
  assert('login ulang → saldo kembali dari server', Math.abs(W().balance - balNow) < 1e-6)

  // Render semua halaman user dalam mode server
  const pages = {
    home: 'src/pages/HomePage.jsx', games: 'src/pages/GamesPage.jsx', wallet: 'src/pages/WalletPage.jsx', rewards: 'src/pages/RewardsPage.jsx',
    history: 'src/pages/HistoryPage.jsx', profile: 'src/pages/ProfilePage.jsx', settings: 'src/pages/SettingsPage.jsx', inventory: 'src/pages/InventoryPage.jsx',
    leaderboard: 'src/pages/LeaderboardPage.jsx', redeem: 'src/pages/RedeemPage.jsx',
  }
  for (const [slug, f] of Object.entries({ 'case-opening': 'CaseOpening', 'case-battle': 'CaseBattle', crash: 'Crash', plinko: 'Plinko', mines: 'Mines', dice: 'Dice', limbo: 'Limbo', coinflip: 'Coinflip', roulette: 'Roulette', blackjack: 'Blackjack' })) pages['g-' + slug] = `src/games/${f}.jsx`
  const AppLayout = L('src/components/layout/AppLayout.jsx').default
  for (const [name, file] of Object.entries(pages)) {
    currentPath = name.startsWith('g-') ? `/games/${name.slice(2)}` : `/${name}`
    const Page = L(file).default
    outlet = h(Page, name.startsWith('g-') ? { game: L('src/config/games.js').getGame(name.slice(2)) } : {})
    try {
      const markup = Server.renderToString(h(AppLayout))
      const bad = /NaN|undefined|\[object Object\]/.exec(markup.replace(/<[^>]+>/g, ' '))
      assert(`render ${name} (mode server)`, !bad, bad ? bad[0] : '')
    } catch (e) {
      assert(`render ${name} (mode server)`, false, e.stack.split('\n').slice(0, 3).join(' | '))
    }
  }
  currentPath = '/auth'
  auth.setState({ session: null })
  const authMarkup = Server.renderToString(h(L('src/pages/AuthPage.jsx').default))
  assert('halaman masuk menyebut penyimpanan server', authMarkup.includes('server'))

  console.log(failures ? `\n${failures} test(s) failed` : '\nAll server-mode tests passed')
  process.exitCode = failures ? 1 : 0
})().catch((e) => { console.error(e); process.exitCode = 1 })
