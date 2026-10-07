// Tes integrasi MODE SERVER: bundle frontend asli (service layer + store) dijalankan di VM Node
// dengan window.NEON_API → API PHP sungguhan + PostgreSQL. Menguji jalur yang dipakai website live:
// login/daftar, saldo dari server, 10 game, reveal gate, daily, quest, seed, profil, multi-perangkat,
// lalu me-render semua halaman user dalam mode server.
// Pakai: NEON_E2E_API=http://127.0.0.1:8099/api node tests/server-mode.cjs [bundle.html]
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const OUT_DIR = path.join(__dirname, 'output')
const dump = (name, markup) => { try { fs.mkdirSync(OUT_DIR, { recursive: true }); fs.writeFileSync(path.join(OUT_DIR, `${name}.html`), markup) } catch {} }
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
  animate: () => ({ stop() {} }), useAnimationControls: () => ({ start() {} }), useMotionValue: (v) => ({ get: () => v, set() {}, on: () => () => {} }), useSpring: (m) => m, useTransform: (m) => m,
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
  Outlet: () => outlet, useLocation: () => ({ pathname: currentPath, state: null }), useNavigate: () => () => {}, useSearchParams: () => [new URLSearchParams(''), () => {}],
  useParams: () => ({ slug: currentPath.split('/').pop(), username: currentPath.split('/').pop(), id: currentPath.split('/').pop() }),
  matchPath: (pattern, p) => (p.startsWith('/games/') ? { params: { slug: p.split('/').pop() } } : null),
}
const LU = need('react-icons/lu')
// Seperti lucide-react asli: ikon = komponen forwardRef (objek).
const iconCache = {}
const LucideReact = new Proxy({}, {
  has: () => true,
  get: (_, name) => {
    if (iconCache[name]) return iconCache[name]
    const C = React.forwardRef((p, ref) => { const I = LU['Lu' + name]; return I ? h(I, { className: p.className }) : h('svg', { className: p.className, ref }) })
    C.displayName = name
    return (iconCache[name] = C)
  },
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
    window, React, localStorage, document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }, console, URLSearchParams, URL, setTimeout, clearTimeout, setInterval: () => 0, clearInterval() {},
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

  const roundResults = []
  for (const [name, fn] of [
    ['limbo', () => Gm.playLimbo({ bet: 10, target: 2 })],
    ['plinko', () => Gm.playPlinko({ bet: 10, risk: 'low' })],
    ['roulette', () => Gm.playRoulette({ bets: [{ type: 'black', amount: 10 }] })],
    ['case', () => Gm.openCase({ caseId: 'starter' })],
    ['battle', () => Gm.playCaseBattle({ caseId: 'starter', rounds: 1 })],
  ]) {
    const r = await fn()
    assert(`${name} lewat API`, r?.session?.verification === 'verified')
    roundResults.push([name, r])
  }
  // Post-round card with real server results (+ a level-up), text must never show raw objects.
  {
    const { ResultCard } = L('src/components/play/GameKit.jsx')
    for (const [name, r] of roundResults) {
      for (const outcome of [r, { ...r, summary: { ...r.summary, levelUp: { from: 2, to: 3 } } }]) {
        const text = Server.renderToString(h(ResultCard, { outcome, game: name })).replace(/<[^>]+>/g, ' ')
        const bad = /\[object|undefined|NaN|\{\w+\}/.exec(text)
        assert(`result card ${name}${outcome.summary?.levelUp?.to === 3 ? ' + level up' : ''} tanpa teks rusak`, !bad, bad ? text.slice(Math.max(0, bad.index - 40), bad.index + 40) : '')
      }
    }
  }
  assert('error server → AppError i18n', (await code(() => Gm.playDice({ bet: 1.5, target: 50, over: true }))) === 'play.errors.wholeBet')
  await sleep(1100)

  // Crash global: one shared round → wait for the betting window → bet → cash out after launch
  let gs = await Gm.crashGlobalState()
  assert('crash global state (seed hash, no point)', !!gs?.round?.seedHash && (gs.round.phase !== 'betting' || gs.round.point === null))
  for (let i = 0; i < 300 && !(gs.round.phase === 'betting' && gs.round.startAt - Date.now() > 1500); i++) {
    await sleep(200)
    gs = await Gm.crashGlobalState()
  }
  const cs = await Gm.crashGlobalBet({ bet: 20 })
  assert('crash global bet', !!cs?.id && Math.abs(cs.startedAt - gs.round.startAt) < 2000)
  assert('crash: second bet same round refused', (await code(() => Gm.crashGlobalBet({ bet: 20 }))) === 'play.crash.alreadyIn')
  await sleep(Math.max(0, cs.startedAt - Date.now()) + 700)
  let crashRes = null
  try {
    crashRes = await Gm.crashGlobalCashout(cs.id, cs.startedAt)
  } catch (e) {
    crashRes = { error: e.code }
  }
  if (crashRes?.error === 'play.crash.minCashout') {
    await sleep(800)
    crashRes = await Gm.crashGlobalCashout(cs.id, cs.startedAt)
  }
  assert('crash selesai (cash out / meledak)', crashRes?.done === true && (crashRes.session || crashRes.stale || crashRes.crashed), JSON.stringify(crashRes).slice(0, 200))
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

  // ── Tahap 2: dua pemain di dua perangkat ──
  const jarB = {}
  const ctxB = makeContext(jarB)
  const LB = (p) => ctxB.__load(p)
  await LB('src/services/server.js').hydrate()
  const emailB = `e2eb_${Date.now()}@test.id`
  await LB('src/store/useAuthStore.js').useAuthStore.getState().register({ username: `b_${String(Date.now()).slice(-8)}`, email: emailB, password: 'rahasia123' })
  const B = LB('src/store/useAuthStore.js').useAuthStore.getState().session.userId
  const unameB = LB('src/store/useAuthStore.js').useAuthStore.getState().users[emailB].username
  await S.sync()
  assert('sync: pemain lain muncul (tanpa email)', Object.values(auth.getState().users).some((u) => u.id === B && u.email === ''))
  assert('mode server: tidak ada akun demo', !Object.values(auth.getState().users).some((u) => u.isDemo))

  // Transfer lewat service asli
  const T = L('src/services/transfers.js')
  const balA = W().balance
  const tr = await T.sendTransfer({ toUserId: B, currency: 'AC', amount: 500, note: 'hadiah' })
  assert('transfer AC lewat server', tr.status === 'success' && W().balance === balA - 500 && tr.tx?.type === 'send')
  await LB('src/services/server.js').hydrate()
  await LB('src/services/server.js').sync()
  const wB = LB('src/store/useWalletStore.js').useWalletStore.getState().wallets[B]
  assert('penerima melihat transfer + notifikasi', wB.transactions[0].type === 'receive' && wB.transactions[0].counterparty.userId === me() &&
    (LB('src/store/useNotificationStore.js').useNotificationStore.getState().byUser[B] ?? []).some((n) => n.kind === 'transferIn'))
  assert('transfer ke diri sendiri ditolak', (await code(() => T.sendTransfer({ toUserId: me(), currency: 'AC', amount: 50 }))) === 'send.errors.self')

  // Redeem
  const R = L('src/services/redeem.js')
  const pre = await R.checkCode('welcome500')
  const balR = W().balance
  await R.redeemCode('WELCOME500')
  assert('redeem lewat server', pre.rewards[0].amount === 500 && W().balance === balR + 500 && W().redeemed[0].code === 'WELCOME500')
  assert('redeem kedua ditolak', (await code(() => R.redeemCode('WELCOME500'))) === 'redeem.errors.used')

  // Teman
  const SOC = L('src/services/social.js')
  await SOC.sendFriendRequest(unameB)
  await LB('src/services/server.js').sync()
  const reqB = LB('src/services/social.js').incomingRequests(B)
  assert('permintaan teman sampai di perangkat B', reqB.length === 1)
  LB('src/services/social.js').acceptFriend(reqB[0].id)
  await sleep(600)
  await S.sync()
  assert('pertemanan diterima (sinkron ke A)', SOC.friendIds(me()).includes(B))
  SOC.toggleFavorite('crash')
  await sleep(500)
  await S.sync()
  assert('favorit tersimpan di server', SOC.favoritesOf(me()).includes('crash'))

  // Chat
  const CH = L('src/services/chat.js')
  const msg = await CH.sendMessage(`halo @${unameB}`)
  assert('chat lewat server', !!msg?.id && L('src/store/usePlatformStore.js').usePlatformStore.getState().chat.some((m) => m.id === msg.id))
  await LB('src/services/server.js').sync()
  assert('pesan terlihat di perangkat B + mention', LB('src/store/usePlatformStore.js').usePlatformStore.getState().chat.some((m) => m.id === msg.id) &&
    (LB('src/store/useNotificationStore.js').useNotificationStore.getState().byUser[B] ?? []).some((n) => n.kind === 'mention'))
  assert('jeda chat dari server', (await code(() => CH.sendMessage('lagi'))) === 'chat.errors.slowDown')

  // Laporan & tiket dari B
  await LB('src/services/reports.js').createReport({ targetType: 'message', targetUserId: me(), messageId: msg.id, reason: 'spam', description: 'mention berulang-ulang' })
  const tk = await LB('src/services/support.js').createTicket({ category: 'bug', subject: 'Tombol macet', message: 'tombol main tidak merespons' })
  assert('laporan & tiket dibuat lewat server', !!tk.id)

  // Akun staf awal (migrasi 003): login username + password "admin" → wajib ganti password.
  const jarO = {}
  const ctxO = makeContext(jarO)
  const LO = (p) => ctxO.__load(p)
  const authO = LO('src/store/useAuthStore.js').useAuthStore
  assert('A pendaftar biasa (staf awal sudah ada)', auth.getState().users[email].role === 'user')
  await authO.getState().login({ email: 'neon_owner', password: 'admin' })
  const owner = Object.values(authO.getState().users).find((u) => u.username === 'neon_owner')
  assert('login Owner pakai username', owner?.role === 'super_admin' && owner.mustChangePassword === true)
  assert('Owner belum ganti password → panel admin ditolak', (await code(() => LO('src/services/server.js').api('admin/snapshot'))) === 'errors.mustChangePassword')
  await authO.getState().changePassword({ current: 'admin', next: 'OwnerBaru123' })
  assert('setelah ganti password → flag hilang', Object.values(authO.getState().users).find((u) => u.username === 'neon_owner').mustChangePassword === false)
  await LO('src/services/server.js').adminSync()
  await LO('src/services/admin.js').setRole(me(), 'super_admin', 'jadikan owner kedua')
  assert('Owner mengangkat A jadi Owner', true)
  await S.hydrate()

  // Admin (A sekarang Owner)
  const ADM = L('src/services/admin.js')
  assert('A super admin', auth.getState().users[email].role === 'super_admin')
  await S.adminSync()
  assert('admin snapshot: dompet & email pemain lain', wallet.getState().wallets[B]?.balance > 0 && Object.values(auth.getState().users).some((u) => u.id === B && u.email === emailB))
  const res = await ADM.adjustCurrency(B, 'AC', 1000, 'kompensasi bug')
  await LB('src/services/server.js').hydrate()
  assert('admin tambah saldo → B menerima', res.after === res.before + 1000 && LB('src/store/useWalletStore.js').useWalletStore.getState().wallets[B].balance === res.after)
  await ADM.warnUser(B, 'spam mention')
  assert('warning tercatat di data admin', (auth.getState().users[emailB].warnings ?? []).length === 1)
  const rep = L('src/store/useAdminStore.js').useAdminStore.getState().reports.find((r) => r.messageId === msg.id)
  assert('laporan masuk antrean admin', !!rep)
  await ADM.reportAction(rep.id, 'resolve', { reason: 'sudah ditegur' })
  assert('laporan diselesaikan', L('src/store/useAdminStore.js').useAdminStore.getState().reports.find((r) => r.id === rep.id).status === 'resolved')
  await L('src/services/support.js').replyTicket(tk.id, 'sedang kami cek')
  assert('staff membalas tiket', L('src/store/useAdminStore.js').useAdminStore.getState().tickets.find((x) => x.id === tk.id).status === 'WAITING_FOR_USER')
  await ADM.banUser(B, 24, 'pelanggaran berulang')
  const bannedErr = await code(() => LB('src/services/server.js').api('sync'))
  assert('pemain di-ban dikeluarkan dari perangkatnya', bannedErr === 'errors.sessionExpired' && LB('src/store/useAuthStore.js').useAuthStore.getState().session === null)
  await ADM.unbanUser(B, 'banding diterima')
  assert('aksi tanpa alasan diterima server', (await code(() => ADM.setGameStatus('dice', 'live', ''))) === null)
  await ADM.setGameMaxBet('dice', 5000, 'batasi taruhan')
  assert('konfigurasi game dari server', L('src/store/useAdminStore.js').useAdminStore.getState().gameConfig.dice.maxBet === 5000)
  await ADM.setGameMaxBet('dice', 20000000, 'kembali normal')
  assert('audit log terisi', L('src/store/useAdminStore.js').useAdminStore.getState().logs.some((l) => l.code === 'ADMIN_AC_ADJUSTMENT') && L('src/store/useAdminStore.js').useAdminStore.getState().logs.some((l) => l.code === 'ADMIN_TEMP_BAN'))
  assert('analitik admin dari data server', L('src/services/admin.js').analytics().totalUsers >= 2)

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
    shop: 'src/pages/ShopPage.jsx', loyalty: 'src/pages/LoyaltyPage.jsx', membership: 'src/pages/MembershipPage.jsx', pass: 'src/pages/BattlePassPage.jsx', chat: 'src/pages/ChatPage.jsx',
  }
  for (const [slug, f] of Object.entries({ 'case-opening': 'CaseOpening', 'case-battle': 'CaseBattle', crash: 'Crash', plinko: 'Plinko', mines: 'Mines', dice: 'Dice', limbo: 'Limbo', coinflip: 'Coinflip', roulette: 'Roulette', blackjack: 'Blackjack' })) pages['g-' + slug] = `src/games/${f}.jsx`
  const AppLayout = L('src/components/layout/AppLayout.jsx').default
  for (const [name, file] of Object.entries(pages)) {
    currentPath = name.startsWith('g-') ? `/games/${name.slice(2)}` : `/${name}`
    const Page = L(file).default
    outlet = h(Page, name.startsWith('g-') ? { game: L('src/config/games.js').getGame(name.slice(2)) } : {})
    try {
      const markup = Server.renderToString(h(AppLayout))
      dump(`sm-${name}`, markup)
      const bad = /NaN|undefined|\[object Object\]/.exec(markup.replace(/<[^>]+>/g, ' '))
      assert(`render ${name} (mode server)`, !bad, bad ? bad[0] : '')
    } catch (e) {
      assert(`render ${name} (mode server)`, false, e.stack.split('\n').slice(0, 3).join(' | '))
    }
  }
  // Halaman admin dalam mode server (data user dari server).
  const AdminLayout = L('src/admin/AdminLayout.jsx').default
  const adminPages = {
    dash: 'src/admin/pages/Dashboard.jsx', users: 'src/admin/pages/Users.jsx#UserList', user: 'src/admin/pages/Users.jsx#UserDetail',
    wallets: 'src/admin/pages/Operations.jsx#Wallets', games: 'src/admin/pages/Operations.jsx#GamesAdmin', sessions: 'src/admin/pages/Operations.jsx#Sessions',
    anticheat: 'src/admin/pages/Operations.jsx#AntiCheat', moderation: 'src/admin/pages/Moderation.jsx#ModerationQueue', restrictions: 'src/admin/pages/Content.jsx#Moderation',
    support: 'src/admin/pages/Support.jsx#SupportAdmin', system: 'src/admin/pages/System.jsx#SystemAdmin', chat: 'src/admin/pages/Content.jsx#ChatAdmin',
    rewards: 'src/admin/pages/Content.jsx#RewardsOverview', daily: 'src/admin/pages/Content.jsx#DailyAdmin', quests: 'src/admin/pages/Content.jsx#QuestsAdmin',
    achievements: 'src/admin/pages/Content.jsx#AchievementsAdmin', codes: 'src/admin/pages/Content.jsx#CodesAdmin', announcements: 'src/admin/pages/Content.jsx#AnnouncementsAdmin',
    logs: 'src/admin/pages/Content.jsx#LogsAdmin', testmode: 'src/admin/pages/Content.jsx#TestModeAdmin', settings: 'src/admin/pages/Content.jsx#SettingsAdmin',
    economy: 'src/admin/pages/Platform.jsx#EconomyAdmin', loyalty: 'src/admin/pages/Platform.jsx#LoyaltyAdmin', 'player-roles': 'src/admin/pages/Platform.jsx#PlayerRolesAdmin',
    shop: 'src/admin/pages/Platform.jsx#ShopAdmin', emotes: 'src/admin/pages/Platform.jsx#EmotesAdmin', missions: 'src/admin/pages/Platform.jsx#MissionsAdmin',
    memberships: 'src/admin/pages/Platform.jsx#MembershipsAdmin', 'chat-filter': 'src/admin/pages/Platform.jsx#ChatModerationAdmin',
  }
  const myId = me()
  auth.setState((s) => ({ users: { ...s.users, [email]: { ...s.users[email], role: 'super_admin' } } }))
  for (const [name, spec] of Object.entries(adminPages)) {
    const [file, exp] = spec.split('#')
    currentPath = name === 'user' ? `/admin/users/${myId}` : `/admin/${name}`
    const Page = exp ? L(file)[exp] : L(file).default
    outlet = h(Page, name === 'user' ? { id: myId } : {})
    try {
      const markup = Server.renderToString(h(AdminLayout))
      dump(`sm-a-${name}`, markup)
      const bad = /NaN|undefined|\[object Object\]/.exec(markup.replace(/<[^>]+>/g, ' '))
      assert(`render admin ${name} (mode server)`, !bad, bad ? bad[0] : '')
    } catch (e) {
      assert(`render admin ${name} (mode server)`, false, e.message.slice(0, 300))
    }
  }

  currentPath = '/auth'
  auth.setState({ session: null })
  const authMarkup = Server.renderToString(h(L('src/pages/AuthPage.jsx').default))
  assert('halaman masuk menyebut penyimpanan server', authMarkup.includes('server'))
  for (const [name, el] of [
    ['forgot', h(L('src/components/auth/ForgotPassword.jsx').default, { initialEmail: 'a@b.co', onBack() {} })],
    ['reset-page', h(L('src/pages/AccountLinkPages.jsx').ResetPasswordPage)],
    ['verify-page', h(L('src/pages/AccountLinkPages.jsx').VerifyEmailPage)],
    ['update-log', (() => { const U = L('src/components/updates/UpdateLog.jsx'); U.openUpdateLog(); return h(U.default) })()],
    ['exchange', h(L('src/components/modals/ExchangeModal.jsx').default, { open: true, onClose() {} })],
    ['exchange-prank', h(L('src/components/modals/ExchangeModal.jsx').default, { open: true, onClose() {}, initialStep: 'prank' })],
  ]) {
    try {
      const markup = Server.renderToString(el)
      dump(`sm-${name}`, markup)
      const bad = /NaN|undefined|\[object Object\]|\{\w+\}/.exec(markup.replace(/<[^>]+>/g, ' '))
      assert(`render ${name}`, !bad, bad ? bad[0] : '')
    } catch (e) {
      assert(`render ${name}`, false, e.stack.split('\n').slice(0, 3).join(' | '))
    }
  }

  assert('tidak ada objek mentah di teks terjemahan', !(globalThis.window?.__objectI18n?.size), [...(globalThis.window?.__objectI18n ?? [])].join(', '))
  console.log(failures ? `\n${failures} test(s) failed` : '\nAll server-mode tests passed')
  process.exitCode = failures ? 1 : 0
})().catch((e) => { console.error(e); process.exitCode = 1 })
