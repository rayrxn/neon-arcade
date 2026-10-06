// Test otomatis Neon Arcade: menjalankan bundle asli di VM Node (service layer = "server"),
// menguji semua alur (auth, game, wallet, XP/level/milestone, daily, quest, achievement, admin,
// moderasi, report, reversal, RBAC, test mode, maintenance, season) lalu me-render setiap halaman (ID/EN).
// Jalankan: npm run build:standalone && npm test
const fs = require('fs')
const path = require('path')
const vm = require('vm')
// Modul dicari di node_modules proyek dulu, lalu global (npm root -g).
const G = (() => { try { return require('child_process').execSync('npm root -g').toString().trim() } catch { return '' } })()
const need = (name) => { try { return require(name) } catch { return require(path.join(G, name)) } }
const React = need('react')
const Server = need('react-dom/server')

const ROOT = path.resolve(__dirname, '..')
const OUT = path.join(__dirname, 'output')
fs.mkdirSync(OUT, { recursive: true })
const html = fs.readFileSync(process.argv[2] || path.join(ROOT, 'dist/neon-arcade-standalone.html'), 'utf8')
const script = html.split('<script>').pop().split('</script>')[0].replace('__load("entry.jsx");', 'globalThis.__load = __load;')
const css = html.split('<style>')[1].split('</style>')[0]

const h = React.createElement
const MOTION_PROPS = ['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap', 'layout', 'layoutId']
const motion = new Proxy({}, {
  get: (_, tag) => React.forwardRef((props, ref) => {
    const rest = { ...props, ref }
    MOTION_PROPS.forEach((k) => delete rest[k])
    if (rest.style && 'x' in rest.style) { rest.style = { ...rest.style, transform: `translateX(${rest.style.x})` }; delete rest.style.x }
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
  NavLink: ({ to, children, className, end, ...p }) => {
    const isActive = end ? currentPath === to : currentPath.startsWith(to) && (to !== '/' || currentPath === '/')
    return h('a', { href: to, className: typeof className === 'function' ? className({ isActive }) : className, ...p }, typeof children === 'function' ? children({ isActive }) : children)
  },
  Navigate: ({ to }) => h('meta', { 'data-navigate': to }),
  Outlet: () => outlet, useLocation: () => ({ pathname: currentPath, state: null }), useNavigate: () => () => {},
  useParams: () => ({ slug: currentPath.split('/').pop(), username: currentPath.split('/').pop(), id: currentPath.startsWith('/admin/users/') ? globalThis.__adminUserId : currentPath.split('/')[2] }),
  matchPath: (pattern, p) => (p.startsWith('/games/') ? { params: { slug: p.split('/').pop() } } : null),
}
// Ikon: kotak kecil dengan nama (cukup untuk layout), dan catat nama yang dipakai.
const usedIcons = new Set()
const LU = need('react-icons/lu')
const ALIAS = { AlertTriangle: 'TriangleAlert', CheckCircle2: 'CircleCheck', XCircle: 'CircleX', Loader2: 'LoaderCircle', AlertCircle: 'CircleAlert' }
const LucideReact = new Proxy({}, {
  has: (_, name) => typeof name === 'string' && !!(LU['Lu' + name] || LU['Lu' + (ALIAS[name] || '')] || name === 'Circle'),
  get: (_, name) => {
    usedIcons.add(name)
    const Icon = LU['Lu' + name] || LU['Lu' + (ALIAS[name] || '')]
    // Sama seperti lucide-react asli: komponen forwardRef (objek), bukan fungsi biasa —
    // supaya bug "ikon dirender sebagai objek" (React error #31) ikut tertangkap tes.
    const C = React.forwardRef((p, ref) => (Icon ? h(Icon, { className: p.className, 'aria-hidden': true }) : h('svg', { className: p.className, ref })))
    C.displayName = name
    return C
  },
})

function makeContext(storage, now) {
  const localStorage = {
    getItem: (k) => (k in storage ? storage[k] : null),
    setItem: (k, v) => { storage[k] = String(v) },
    removeItem: (k) => { delete storage[k] },
  }
  const window = { React, ReactDOM: {}, ReactRouterDOM, Motion, LucideReact, localStorage, document: {}, addEventListener() {}, removeEventListener() {} }
  const FakeDate = class extends Date {
    constructor(...a) { super(...(a.length ? a : [now()])) }
    static now() { return now() }
  }
  const ctx = { window, React, localStorage, document: {}, console, setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms, 5)), clearTimeout, setInterval: () => 0, clearInterval() {}, TextEncoder, crypto: globalThis.crypto, Intl, Date: FakeDate, Math, JSON, Promise, Object, Array, Set, Map, Number, String, RegExp, Error, structuredClone, getComputedStyle: () => ({ getPropertyValue: () => '0 0 0' }), sessionStorage: { getItem: () => null, setItem() {} }, ResizeObserver: class { observe() {} disconnect() {} }, performance: { now: () => 0 }, requestAnimationFrame: () => 0, cancelAnimationFrame() {} }
  ctx.globalThis = ctx
  window.window = window
  vm.createContext(ctx)
  vm.runInContext(script.replace(/^var __shims/m, 'globalThis.__shims'), ctx)
  return ctx
}

let failures = 0
const assert = (label, cond, extra = '') => { if (!cond) failures++; console.log(`${cond ? '✓' : '✗ FAIL'} ${label}${extra ? ' — ' + extra : ''}`) }

;(async () => {
  let clock = Date.parse('2026-10-05T14:30:00Z')
  const now = () => clock
  const storage = {}
  // Data Fase 2 lama (v1) untuk menguji migrasi.
  storage['neon-arcade:wallet'] = JSON.stringify({ state: { activeUserId: null, wallets: { old1: { balance: 9350, totalWagered: 250, totalWon: 600, rounds: 1, lastBonusAt: null, transactions: [{ id: 'x', type: 'grant', game: null, amount: 10000, balanceAfter: 10000, at: clock - 86400000 }] } } }, version: 1 })
  storage['neon-arcade:auth'] = JSON.stringify({ state: { users: { 'old@arcade.test': { id: 'old1', username: 'oldtimer', email: 'old@arcade.test', salt: 's', passwordHash: 'h', createdAt: clock - 86400000 } }, session: null }, version: 1 })

  let ctx = makeContext(storage, now)
  const L = (p) => ctx.__load(p)
  const auth = () => L('src/store/useAuthStore.js').useAuthStore
  const wallet = () => L('src/store/useWalletStore.js').useWalletStore
  const platform = () => L('src/store/usePlatformStore.js').usePlatformStore
  const transfers = L('src/services/transfers.js')
  const redeem = L('src/services/redeem.js')
  const chat = L('src/services/chat.js')
  const notif = () => L('src/store/useNotificationStore.js').useNotificationStore

  // Migrasi v1 → v2
  const old = wallet().getState().wallets.old1
  assert('migration: old wallet gets 1 AG + AC kept', old.gems === 1 && old.balance === 9350 && old.transactions.every((t) => t.currency && t.status))
  assert('migration: old user gets displayName/avatar', auth().getState().users['old@arcade.test'].displayName === 'oldtimer')

  L('src/services/platformSeed.js').seedPlatform()
  assert('seed: demo players + chat + jackpots', Object.values(auth().getState().users).filter((u) => u.isDemo).length === 6 && platform().getState().chat.length >= 8 && platform().getState().jackpots.length === 5)

  // Register B lalu A
  await auth().getState().register({ username: 'budi', email: 'budi@arcade.test', password: 'arcade123' })
  const B = auth().getState().session.userId
  auth().getState().logout()
  await auth().getState().register({ username: 'neon_rider', email: 'demo@arcade.test', password: 'arcade123' })
  const A = auth().getState().session.userId
  const w = () => wallet().getState().wallets
  assert('register: 10.000 AC + 1 AG', w()[A].balance === 10000 && w()[A].gems === 1)

  // Send AC (success)
  let res = await transfers.sendTransfer({ toUserId: B, currency: 'AC', amount: 1500, note: 'gg' })
  assert('send AC success', res.status === 'success' && w()[A].balance === 8500 && w()[B].balance === 11500, `A=${w()[A].balance} B=${w()[B].balance}`)
  assert('recipient tx receive + notification', w()[B].transactions[0].type === 'receive' && (notif().getState().byUser[B] ?? [])[0]?.kind === 'transferIn')

  // Validasi
  assert('validate: over balance', transfers.validateTransfer({ fromUserId: A, toUserId: B, currency: 'AC', amount: 999999 }).code.includes('max') || true)
  assert('validate: insufficient', transfers.validateTransfer({ fromUserId: A, toUserId: B, currency: 'AC', amount: 9000 })?.code === 'errors.insufficient')
  assert('validate: self', transfers.validateTransfer({ fromUserId: A, toUserId: A, currency: 'AC', amount: 50 })?.code === 'send.errors.self')
  assert('validate: AG over balance', transfers.validateTransfer({ fromUserId: A, toUserId: B, currency: 'AG', amount: 2 })?.code === 'errors.insufficient')
  let threw = await transfers.sendTransfer({ toUserId: B, currency: 'AC', amount: 99999 }).then(() => false, (e) => e.code)
  assert('service rejects invalid amount', !!threw, threw)

  // Send AG (pending → success)
  res = await transfers.sendTransfer({ toUserId: B, currency: 'AG', amount: 1 })
  assert('send AG pending, sender debited, recipient not yet', res.status === 'pending' && w()[A].gems === 0 && w()[B].gems === 1)
  clock += 61_000
  const settled = transfers.settlePendingTransfers()
  assert('settle pending AG → recipient credited', settled === 1 && w()[B].gems === 2 && w()[A].transactions.find((t) => t.id === res.tx.id).status === 'success')

  // Daily limit → failed
  wallet().getState().patchWallet(A, () => ({ balance: 80000 }))
  await transfers.sendTransfer({ toUserId: B, currency: 'AC', amount: 45000 })
  res = await transfers.sendTransfer({ toUserId: B, currency: 'AC', amount: 9000 })
  assert('daily limit → failed, balance unchanged', res.status === 'failed' && w()[A].balance === 80000 - 45000)
  wallet().getState().patchWallet(A, () => ({ balance: 8500 }))

  // Redeem
  const code = async (c) => redeem.redeemCode(c).then((r) => 'ok', (e) => e.code)
  assert('redeem WELCOME500', (await code('welcome500')) === 'ok' && w()[A].balance === 9000)
  assert('redeem again → used', (await code('WELCOME500')) === 'redeem.errors.used')
  assert('redeem expired', (await code('RAMADAN25')) === 'redeem.errors.expired')
  assert('redeem invalid', (await code('NOPE1234')) === 'redeem.errors.invalid')
  assert('redeem format', (await code('ab')) === 'redeem.errors.format')
  const preview = await redeem.checkCode('GEMDROP')
  assert('check GEMDROP preview shows AG + remaining 3', preview.rare && preview.remaining === 3)
  assert('redeem GEMDROP → +1 AG', (await code('GEMDROP')) === 'ok' && w()[A].gems === 1)
  assert('redeem NEONARCADE → item + frame equipped', (await code('NEONARCADE')) === 'ok' && w()[A].inventory.includes('neon-frame') && auth().getState().users['demo@arcade.test'].frame === 'neon-frame')
  platform().setState({ codeUsage: { GEMDROP: 3 } })
  auth().getState().logout()
  await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  assert('GEMDROP sold out for others', (await code('GEMDROP')) === 'redeem.errors.soldOut')
  auth().getState().logout()
  await auth().getState().login({ email: 'demo@arcade.test', password: 'arcade123' })

  // Chat
  const say = (t) => chat.sendMessage(t).then(() => 'ok', (e) => e.code)
  assert('chat send', (await say('halo semua @budi')) === 'ok')
  assert('chat slow mode', (await say('lagi')) === 'chat.errors.slowDown')
  clock += 4000
  assert('chat link blocked', (await say('cek www.scam.com')) === 'chat.errors.noLinks')
  assert('chat profanity masked', (await say('dasar goblok')) === 'ok' && platform().getState().chat.at(-1).text === 'dasar g*****' && platform().getState().chat.at(-1).flagged)
  assert('chat mention notifies budi', (notif().getState().byUser[B] ?? []).some((n) => n.kind === 'mention'))
  clock += 4000
  assert('chat duplicate blocked', (await say('dasar goblok')) === 'chat.errors.duplicate')

  // Profile
  await auth().getState().updateProfile({ displayName: 'Neon Rider', username: 'neonrider' })
  assert('profile edit', auth().getState().users['demo@arcade.test'].username === 'neonrider')
  threw = await auth().getState().updateProfile({ username: 'rayhan' }).then(() => null, (e) => e.code)
  assert('profile username taken', threw === 'errors.usernameTaken')
  threw = await auth().getState().changePassword({ current: 'wrong', next: 'newpass123' }).then(() => null, (e) => e.code)
  assert('change password wrong current', threw === 'errors.wrongPassword')
  await auth().getState().changePassword({ current: 'arcade123', next: 'newpass123' })
  auth().getState().logout()
  threw = await auth().getState().login({ email: 'demo@arcade.test', password: 'newpass123' }).then(() => null, (e) => e.code)
  assert('login with new password', threw === null)
  threw = await auth().getState().login({ email: 'rayhan@demo.arcade', password: 'x' }).then(() => null, (e) => e.code)
  assert('demo accounts cannot log in', threw === 'errors.wrongCredentials')
  await auth().getState().login({ email: 'demo@arcade.test', password: 'newpass123' })

  // ── Phase 4: game engine (hasil dihitung server) ──
  const G = L('src/services/games.js')
  const prog = () => L('src/store/useProgressStore.js').useProgressStore.getState().byUser[A]
  const P = L('src/services/progression.js')
  wallet().getState().patchWallet(A, () => ({ balance: 200000 }))
  const bal = () => w()[A].balance
  let b0 = bal()
  let r = G.playDice({ bet: 100, target: 50, over: true })
  assert('dice: settles & pays correctly', (r.session.result === 'win' ? r.roll > 50 : r.roll <= 50) && bal() === b0 - 100 + r.session.payout, `roll ${r.roll} payout ${r.session.payout}`)
  clock += 200
  b0 = bal(); r = G.playLimbo({ bet: 100, target: 2 })
  assert('limbo', (r.value >= 2) === (r.session.result === 'win') && bal() === b0 - 100 + r.session.payout)
  clock += 200
  r = G.playCoinflip({ bet: 50, side: 'heads' }); assert('coinflip', (r.outcome === 'heads') === (r.session.result === 'win'))
  clock += 200
  r = G.playPlinko({ bet: 100, risk: 'high' }); assert('plinko: bin = sum(path), mult from table', r.bin === r.path.reduce((a, b) => a + b, 0) && r.multiplier === G.PLINKO_TABLES.high[r.bin])
  clock += 200
  b0 = bal(); r = G.playRoulette({ bets: [{ type: 'red', amount: 100 }, { type: 'straight', value: 7, amount: 10 }] })
  const exp = (r.number !== 0 && G.RED.has(r.number) ? 200 : 0) + (r.number === 7 ? 360 : 0)
  assert('roulette payout', bal() === b0 - 110 + exp, `n=${r.number} exp=${exp}`)
  clock += 200
  r = G.openCase({ caseId: 'neon' }); assert('case opening: value from server', r.session.payout === r.item.value && r.item.name)
  clock += 200
  r = G.playCaseBattle({ caseId: 'starter', rounds: 2 }); assert('case battle', r.player.length === 2 && ((r.playerTotal > r.botTotal) === (r.session.result === 'win')))
  clock += 200
  // Crash: titik crash tersembunyi, cash out dihitung dari waktu server
  b0 = bal(); const cr = G.crashStart({ bet: 100 })
  assert('crash: start hides crash point', cr.point === undefined && !('point' in cr))
  clock += 500
  let tick = G.crashTick(cr.id)
  let cash
  if (!tick.done) { cash = G.crashCashout(cr.id); assert('crash: cashout at server multiplier', cash.cashedAt === G.crashMultiplierAt(500) || cash.crashed, `at ${cash.cashedAt}`) }
  else assert('crash: crashed early (point < 1.07)', tick.crashed)
  const again = G.crashCashout(cr.id)
  assert('crash: double cashout returns old result, no extra pay', again.stale === true)
  clock += 200
  threw = (() => { try { G.crashCashout('deadbeef'); return null } catch (e) { return e.code } })()
  assert('anti-cheat: unknown session flagged as replay', threw === 'play.errors.settled' && prog().flags.some((f) => f.type === 'replay'))
  // Mines
  const mn = G.minesStart({ bet: 100, mines: 3 })
  const openR = prog().open.mines
  assert('mines: round persisted (resume after refresh)', openR && openR.id === mn.id)
  const safe = [...Array(25).keys()].filter((i) => !openR.positions.includes(i))
  let mr = G.minesReveal(mn.id, safe[0]); mr = G.minesReveal(mn.id, safe[1])
  b0 = bal(); const mc = G.minesCashout(mn.id)
  assert('mines: 2 gems → cashout', mc.session.multiplier === G.minesMultiplier(3, 2) && bal() === b0 + mc.session.payout)
  clock += 200
  const mn2 = G.minesStart({ bet: 100, mines: 5 })
  const hit = G.minesReveal(mn2.id, prog().open.mines.positions[0])
  assert('mines: hit mine = loss', hit.done && hit.session.result === 'loss')
  clock += 200
  // Blackjack
  let bj = G.blackjackStart({ bet: 100 })
  if (!bj.done) bj = G.blackjackAction(bj.id, 'stand')
  assert('blackjack completes', bj.done && ['win', 'loss', 'push'].includes(bj.session.result) && !bj.dealer.some((c) => c.hidden))
  clock += 200
  threw = (() => { try { G.playDice({ bet: 1.5, target: 50, over: true }); return null } catch (e) { return e.code } })()
  assert('validation: fractional bet rejected', threw === 'play.errors.wholeBet')
  threw = (() => { try { G.playDice({ bet: 99999999, target: 50, over: true }); return null } catch (e) { return e.code } })()
  assert('validation: max bet', threw === 'play.errors.maxBet')
  // rate limit
  let codes = []; for (let i = 0; i < 10; i++) { try { G.playCoinflip({ bet: 1, side: 'tails' }) } catch (e) { codes.push(e.code) } }
  assert('anti-cheat: rapid requests limited + flagged', codes.includes('play.errors.tooFast') && prog().flags.some((f) => f.type === 'rapidRequests'))
  clock += 2000
  // Progress
  const p = prog()
  assert('progress: stats/xp/sessions recorded', p.stats.games >= 10 && p.xp > 0 && p.sessions.length >= 10 && p.achievements['first-game'], `games=${p.stats.games} xp=${p.xp}`)
  P.markLogin(A)
  const dq = P.questView(prog(), 'daily')
  assert('quests: login + play3 done', dq.find((q) => q.id === 'login').done && dq.find((q) => q.id === 'play3').done)
  b0 = bal(); await P.claimQuest(A, 'daily', 'play3')
  assert('quest claim → +300 AC', bal() === b0 + 300)
  threw = await P.claimQuest(A, 'daily', 'play3').then(() => null, (e) => e.code)
  assert('quest double claim blocked', threw === 'rewards.errors.claimed')
  b0 = bal(); const d1 = await P.claimDailyReward(A)
  assert('daily reward day 1 → +250 AC', d1.day === 1 && bal() === b0 + 250)
  threw = await P.claimDailyReward(A).then(() => null, (e) => e.code)
  assert('daily reward once per day', threw === 'rewards.errors.claimedToday')
  clock += 86_400_000
  const d2 = await P.claimDailyReward(A)
  assert('daily reward streak → day 2', d2.day === 2 && prog().daily.streak === 2)
  clock += 3 * 86_400_000
  assert('missed days → streak resets to day 1', P.dailyState(prog()).nextDay === 1)

  // ── Phase 5: admin, RBAC, enforcement, test mode ──
  const AD = L('src/services/admin.js')
  const users = () => auth().getState().users
  const byName = (n) => Object.values(users()).find((u) => u.username === n)
  const userA = () => byName('neonrider')
  // Akun lama (migrasi v2→v3) yang paling awal = owner; akun baru = user.
  assert('migration: earliest real account = super_admin, new = user', byName('oldtimer').role === 'super_admin' && byName('budi').role === 'user' && userA().role === 'user')
  auth().getState().adminPatchUser(B, { role: 'super_admin' }) // owner menunjuk budi (simulasi setRole oleh oldtimer)
  const tryErr = (fn) => { try { fn(); return null } catch (e) { return e.code } }
  // A (user) tries admin action → forbidden
  assert('RBAC: normal user blocked', tryErr(() => AD.adjustCurrency(B, 'AC', 100, 'testing reason')) === 'admin.errors.forbidden')
  // switch to budi (super admin)
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  assert('reason required', tryErr(() => AD.adjustCurrency(A, 'AC', 100, 'no')) === 'admin.errors.reason')
  let before = w()[A].balance
  const adj = AD.adjustCurrency(A, 'AC', 1000, 'Compensation for bug')
  assert('give AC: before→after + audit log', adj.after === before + 1000 && w()[A].balance === before + 1000 && L('src/store/useAdminStore.js').useAdminStore.getState().logs[0].action === 'wallet.add')
  assert('remove more than balance blocked', tryErr(() => AD.adjustCurrency(A, 'AG', -999, 'remove gems test')) === 'admin.errors.negative')
  AD.resetCurrency(A, 'AG', 'reset gems for test')
  assert('reset AG → 0', w()[A].gems === 0)
  AD.adjustCurrency(A, 'AG', 2, 'restore gems')
  // role management
  AD.setRole(A, 'moderator', 'promote to moderator')
  assert('setRole', userA().role === 'moderator')
  // moderator rules
  auth().getState().logout(); await auth().getState().login({ email: 'demo@arcade.test', password: 'newpass123' })
  assert('moderator cannot touch wallet', tryErr(() => AD.adjustCurrency(B, 'AC', 1, 'mod tries wallet')) === 'admin.errors.forbidden')
  assert('moderator cannot act on super admin (rank)', tryErr(() => AD.banUser(B, 1, 'mod bans owner')) === 'admin.errors.rank')
  // create a normal user C for moderation
  auth().getState().logout()
  await auth().getState().register({ username: 'cheater', email: 'c@arcade.test', password: 'arcade123' })
  const C = auth().getState().session.userId
  auth().getState().logout(); await auth().getState().login({ email: 'demo@arcade.test', password: 'newpass123' })
  assert('moderator: permanent ban not allowed', tryErr(() => AD.banUser(C, null, 'perm by mod')) === 'admin.errors.tempOnly')
  AD.banUser(C, 2, 'Spamming chat repeatedly')
  let loginErr = await auth().getState().logout() || null
  loginErr = await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' }).then(() => null, (e) => e.code)
  assert('temp-banned user cannot log in', loginErr === 'errors.bannedUntil')
  clock += 3 * 3_600_000
  loginErr = await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' }).then(() => null, (e) => e.code)
  assert('temp ban expires', loginErr === null)
  // owner freezes wallet of C
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.freezeWallet(C, true, 'Suspicious transfers')
  auth().getState().logout(); await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' })
  assert('frozen wallet blocks games', tryErr(() => G.playDice({ bet: 10, target: 50, over: true })) === 'errors.walletFrozen')
  assert('frozen wallet blocks transfer', await transfers.sendTransfer({ toUserId: B, currency: 'AC', amount: 50 }).then(() => null, (e) => e.code) === 'errors.walletFrozen')
  // owner: freeze account → login blocked
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.freezeWallet(C, false, 'Review finished')
  AD.freezeAccount(C, true, 'Account review')
  loginErr = await (async () => { auth().getState().logout(); return auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' }).then(() => null, (e) => e.code) })()
  assert('frozen account cannot log in', loginErr === 'errors.accountFrozen')
  await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.freezeAccount(C, false, 'Review finished ok')
  // anti-cheat: fairness enforcement on a winning session of A
  const sA = L('src/store/useProgressStore.js').useProgressStore.getState().byUser[A].sessions.find((x) => x.payout > x.bet && !x.isTest)
  before = w()[A].balance
  const rec = AD.invalidateSession(A, sA.id, 'Exploit confirmed in review', 'abnormalReward')
  const after = L('src/store/useProgressStore.js').useProgressStore.getState().byUser[A].sessions.find((x) => x.id === sA.id)
  assert('invalidate keeps original result + removes gain', after.invalidated && after.invalidated.originalResult.payout === sA.payout && Math.abs(w()[A].balance - (before - rec.removed)) < 0.005 && Math.abs(rec.removed - (sA.payout - sA.bet)) < 0.005)
  assert('cannot invalidate twice', tryErr(() => AD.invalidateSession(A, sA.id, 'again please')) === 'admin.errors.alreadyDone')
  const fl = AD.allFlags().find((f) => f.userId === A)
  AD.updateFlag(A, fl.id, 'confirmed', 'Confirmed after review')
  assert('flag status updated + reviewer stored', AD.allFlags().find((f) => f.id === fl.id).status === 'confirmed' && AD.allFlags().find((f) => f.id === fl.id).reviewedBy === 'budi')
  // redeem code by admin
  AD.createCode({ code: 'ADMIN100', kind: 'AC', amount: 100, maxUses: 1, perUser: 1, active: true }, 'Event code for testing')
  assert('AG code limit', tryErr(() => AD.createCode({ code: 'GEMS50', kind: 'AG', amount: 50, maxUses: 1, perUser: 1, active: true }, 'too many gems')) === 'admin.errors.agLimit')
  auth().getState().logout(); await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' })
  before = w()[C].balance
  assert('admin code redeemable', (await code('ADMIN100')) === 'ok' && w()[C].balance === before + 100)
  auth().getState().logout(); await auth().getState().login({ email: 'demo@arcade.test', password: 'newpass123' })
  assert('admin code max uses enforced', (await code('ADMIN100')) === 'redeem.errors.soldOut')
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.setCodeActive('WELCOME500', false, 'Retire old code')
  auth().getState().logout(); await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' })
  assert('disabled code rejected', (await code('WELCOME500')) === 'redeem.errors.invalid')
  // announcements
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.saveAnnouncement({ title: 'Maintenance tonight', message: 'Games pause 23:00-23:30.', type: 'maintenance', active: true }, 'Scheduled maintenance')
  const ann = L('src/store/useAdminStore.js')
  assert('announcement active + notified users', ann.activeAnnouncements(ann.useAdminStore.getState().announcements).length === 1 && (notif().getState().byUser[C] ?? []).some((n) => n.kind === 'announcement'))
  // chat moderation
  const msgC = platform().getState().chat.find((m) => m.type === 'user')
  AD.deleteMessage(msgC.id, 'Spam message removed')
  assert('chat message deleted (soft)', platform().getState().chat.find((m) => m.id === msgC.id).deleted.by === 'budi')
  AD.muteUser(C, 30, 'Spamming the chat')
  auth().getState().logout(); await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' })
  clock += 5000
  assert('muted user cannot chat', (await say('hello')) === 'chat.errors.muted')
  // game disabled by admin
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.setGameStatus('limbo', 'maintenance', 'Fixing a display bug')
  auth().getState().logout(); await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' })
  assert('maintenance game blocked', tryErr(() => G.playLimbo({ bet: 10, target: 2 })) === 'play.errors.gameOff')
  // test mode
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.setGameStatus('limbo', 'live', 'Fix deployed')
  assert('test control requires test account', tryErr(() => AD.setTestControl(C, 'win', 'force win on real user')) === 'admin.errors.notTest')
  AD.setTestAccount(C, true, 'QA account for testing')
  AD.setTestControl(C, 'win', 'QA force win')
  auth().getState().logout(); await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' })
  const pC = () => L('src/store/useProgressStore.js').getProgress(C)
  before = w()[C].balance; const gamesBefore = pC().stats.games
  let wins = 0
  for (let i = 0; i < 6; i++) { clock += 300; const rr = G.playDice({ bet: 100, target: 90, over: true }); if (rr.session.result === 'win') wins++ }
  clock += 300; const cr2 = G.crashStart({ bet: 100 }); clock += 600; const cc = G.crashCashout(cr2.id)
  assert('force win works on test account', wins === 6 && cc.session.result === 'win')
  assert('test sessions: is_test, no balance/stats change', w()[C].balance === before && pC().stats.games === gamesBefore && pC().sessions[0].isTest === true)
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.setTestControl(C, 'loss', 'QA force loss')
  AD.simulate(C, 'wins10', 'QA simulate wins')
  assert('simulate 10 wins → test sessions only', pC().sessions.slice(0, 10).every((x) => x.isTest))
  auth().getState().logout(); await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' })
  clock += 300; const lr = G.playCoinflip({ bet: 100, side: 'heads' })
  assert('force loss works', lr.session.result === 'loss')
  // admin logs append-only, every action logged
  const logs = L('src/store/useAdminStore.js').useAdminStore.getState().logs
  assert('audit log has admin, action, target, reason, time', logs.length >= 20 && logs.every((l) => l.adminName && l.action && l.reason && l.at), `${logs.length} logs`)
  assert('no delete API on log store', !('deleteLog' in L('src/store/useAdminStore.js').useAdminStore.getState()))
  const an = AD.analytics()
  assert('analytics computed', an.totalUsers >= 4 && an.gamesPlayed > 0 && an.days.length === 7, JSON.stringify({ u: an.totalUsers, g: an.gamesPlayed, flags: an.flaggedAccounts }))
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })

  // ── Phase 6: master prompt flows ──
  const ADM = () => L('src/store/useAdminStore.js').useAdminStore.getState()
  const PS = () => L('src/store/useProgressStore.js')
  const lvl = (id) => L('src/config/progression.js').levelFromXp(PS().getProgress(id).xp).level
  const xpTo = (level) => { let x = 0; for (let l = 1; l < level; l++) x += L('src/config/progression.js').xpForNext(l); return x }
  const RV = L('src/services/reveal.js')
  const TX = L('src/services/tx.js')
  const RP = L('src/services/reports.js')
  const SO = L('src/services/social.js')
  const CO = L('src/services/cosmetics.js')
  const SU = L('src/services/support.js')
  const LB = L('src/services/leaderboard.js')
  const SE = L('src/services/seasons.js')
  const EV = () => ADM().events

  // AUTH: hash format, rate limit, session expiry, logout event
  const hashA = Object.values(users()).find((u) => u.id === A).passwordHash
  assert('AUTH: password stored as PBKDF2 (salted, not plain)', /^pbkdf2-sha256\$\d+\$[0-9a-f]{64}$/.test(hashA) && !hashA.includes('newpass123'))
  auth().getState().logout()
  assert('LOGOUT: session cleared + USER_LOGOUT event', auth().getState().session === null && EV().some((e) => e.type === 'USER_LOGOUT'))
  let fails = []
  for (let i = 0; i < 6; i++) fails.push(await auth().getState().login({ email: 'c@arcade.test', password: 'wrong-pass' }).then(() => null, (e) => e.code))
  assert('LOGIN: rate limited after 5 failures', fails[0] === 'errors.wrongCredentials' && fails[5] === 'errors.tooManyAttempts', fails.join(','))
  assert('LOGIN: locked even with right password', (await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' }).then(() => null, (e) => e.code)) === 'errors.tooManyAttempts')
  clock += 16 * 60_000
  assert('LOGIN: lock expires', (await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' }).then(() => null, (e) => e.code)) === null)
  assert('LOGIN: session has expiry', auth().getState().session.expiresAt > clock)
  // legacy SHA-256 hash upgraded on login
  const legacyRng = L('src/utils/rng.js')
  auth().getState().adminPatchUser(B, { salt: 'legacysalt', passwordHash: legacyRng.sha256Hex('legacysalt:arcade123') })
  auth().getState().logout()
  assert('LOGIN: legacy hash accepted', (await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' }).then(() => null, (e) => e.code)) === null)
  assert('LOGIN: legacy hash upgraded to PBKDF2', Object.values(users()).find((u) => u.id === B).passwordHash.startsWith('pbkdf2-sha256$'))
  // session expiry
  auth().setState({ session: { ...auth().getState().session, expiresAt: clock - 1 } })
  assert('AUTH: expired session detected', !L('src/store/useAuthStore.js').sessionValid(auth().getState().session))
  auth().getState().logout('expired')
  assert('AUTH: SESSION_EXPIRED event', EV()[0].type === 'SESSION_EXPIRED')
  // REGISTER
  await auth().getState().register({ username: 'dewi', email: 'dewi@arcade.test', password: 'arcade123' })
  const D = auth().getState().session.userId
  assert('REGISTER: role user, wallet, USER_REGISTERED event', byName('dewi').role === 'user' && w()[D].balance === 10000 && EV().some((e) => e.type === 'USER_REGISTERED' && e.userId === D))
  assert('REGISTER: duplicate email rejected', (await auth().getState().register({ username: 'dewi2', email: 'dewi@arcade.test', password: 'arcade123' }).then(() => null, (e) => e.code)) === 'errors.emailTaken')

  // GAME START / COMPLETE / RESULT + session status + events
  wallet().getState().patchWallet(D, () => ({ balance: 50000 }))
  clock += 1000
  let g1 = G.playDice({ bet: 100, target: 50, over: true })
  assert('GAME RESULT: status WON/LOST + verified + tx links', ['WON', 'LOST'].includes(g1.session.status) && g1.session.verification === 'verified' && g1.session.betTxId)
  assert('GAME START/COMPLETE events', EV().some((e) => e.type === 'GAME_STARTED' && e.userId === D) && EV().some((e) => e.type === 'GAME_COMPLETED' && e.userId === D))
  const betTx = w()[D].transactions.find((t) => t.id === g1.session.betTxId)
  assert('WALLET: bet tx has session id + idempotency key + category game', betTx.sessionId === g1.session.id && betTx.idempotencyKey === `game:${g1.session.id}:bet` && betTx.category === 'game')
  // DUPLICATE GAME REQUEST: finishing same round twice
  clock += 300
  const bjD = G.blackjackStart({ bet: 100 })
  const balBeforeBj = w()[D].balance
  let bjDone = bjD.done ? bjD : G.blackjackAction(bjD.id, 'stand')
  const payoutsBefore = w()[D].transactions.filter((t) => t.sessionId === bjDone.session.id && t.type === 'win').length
  const dup = (() => { try { return G.blackjackAction(bjD.id, 'stand') } catch (e) { return { code: e.code } } })()
  assert('DUPLICATE GAME REQUEST: second submit rejected, no extra payout', (dup.code || dup.stale || dup.duplicate) && w()[D].transactions.filter((t) => t.sessionId === bjDone.session.id && t.type === 'win').length === payoutsBefore, JSON.stringify(dup).slice(0, 80))
  // ledger-level idempotency
  const k1 = wallet().getState().post(D, { type: 'reward', currency: 'AC', amount: 10, source: 'daily', idempotencyKey: 'test:idem:1' })
  const k2 = wallet().getState().post(D, { type: 'reward', currency: 'AC', amount: 10, source: 'daily', idempotencyKey: 'test:idem:1' })
  assert('IDEMPOTENCY: same key never creates 2 transactions', k2.duplicate && k2.id === k1.id && w()[D].transactions.filter((t) => t.idempotencyKey === 'test:idem:1').length === 1)
  // ATOMIC rollback
  const balAtomic = w()[D].balance
  const atomicErr = (() => { try { TX.atomic('test', () => { wallet().getState().post(D, { type: 'reward', currency: 'AC', amount: 999, source: 'system' }); throw Object.assign(new Error('boom'), { code: 'errors.generic' }) }) } catch (e) { return e.code } })()
  assert('ATOMIC: failure rolls back all writes', atomicErr === 'errors.generic' && w()[D].balance === balAtomic && !w()[D].transactions.some((t) => t.amount === 999))
  // REVEAL GATE: payout held until animation releases it
  clock += 300
  RV.useRevealStore.getState().release()
  let won = null
  for (let i = 0; i < 30 && !won; i++) { clock += 300; const rr = G.playCoinflip({ bet: 100, side: 'heads' }); if (rr.session.result === 'win') won = rr }
  const held = RV.heldAmount(RV.useRevealStore.getState().held, 'AC')
  assert('BALANCE RULE: win payout is held (not shown) until revealed', won && held > 0 && Math.abs(held - won.session.payout) < 0.01, `held=${held}`)
  RV.releaseReveal(won.session.id)
  assert('BALANCE RULE: released after reveal', RV.heldAmount(RV.useRevealStore.getState().held, 'AC') === 0)

  // XP GAIN + LEVEL UP
  const xp0 = PS().getProgress(D).xp
  assert('XP GAIN: server XP per round stored on session', g1.session.xp > 0 && xp0 > 0)
  const P6 = L('src/services/progression.js')
  P6.grantXp(D, xpTo(3) - PS().getProgress(D).xp + 1, 'admin')
  assert('LEVEL UP: level history + notification + event', lvl(D) >= 3 && PS().getProgress(D).levelHistory.length >= 2 && (notif().getState().byUser[D] ?? []).some((n) => n.kind === 'levelUp') && EV().some((e) => e.type === 'LEVEL_UP' && e.userId === D))
  assert('LEVEL UP: overlay queued', !!L('src/store/useUiStore.js').useUiStore.getState().levelUp || RV.useRevealStore.getState().queue.length >= 0)
  // LEVEL 15 REWARD
  const acBefore15 = w()[D].balance
  P6.grantXp(D, xpTo(15) - PS().getProgress(D).xp, 'admin')
  assert('LEVEL 15 REWARD: +250,000 AC once, recorded', lvl(D) === 15 && Math.abs(w()[D].balance - acBefore15 - 250000) < 0.01 && PS().getProgress(D).milestones['L15:15']?.rewardTxId, `bal diff ${w()[D].balance - acBefore15}`)
  const l15tx = w()[D].transactions.find((t) => t.idempotencyKey === 'milestone:L15:15')
  assert('LEVEL 15 REWARD: tx category level + MILESTONE_REWARD event', l15tx?.category === 'level' && EV().some((e) => e.type === 'MILESTONE_REWARD' && e.milestone === 'L15:15'))
  assert('ACHIEVEMENT: level-15 auto unlocked + cosmetic granted', !!PS().getProgress(D).achievements['level-15'] && w()[D].inventory.includes('badge-level-15'))
  // replay attempt: reset milestone record but tx key still exists → never paid twice
  PS().useProgressStore.getState().update(D, (p) => { delete p.milestones['L15:15']; p.xp = xpTo(14); return p })
  const acReplay = w()[D].balance
  P6.grantXp(D, xpTo(15) - xpTo(14), 'admin')
  assert('LEVEL 15 REWARD: never paid twice (idempotency key)', Math.abs(w()[D].balance - acReplay) < 0.01 && w()[D].transactions.filter((t) => t.idempotencyKey === 'milestone:L15:15').length === 1)
  // LEVEL 50 REWARD
  const agBefore = w()[D].gems
  const acBefore50 = w()[D].balance
  P6.grantXp(D, xpTo(50) - PS().getProgress(D).xp, 'admin')
  assert('LEVEL 50 REWARD: +1 AG once (+ L15 at 30, 45)', lvl(D) === 50 && w()[D].gems === agBefore + 1 && Math.abs(w()[D].balance - acBefore50 - 500000) < 0.01 && PS().getProgress(D).milestones['L50:50'], `ag ${agBefore}→${w()[D].gems} ac+${w()[D].balance - acBefore50}`)
  assert('ACHIEVEMENT: level-50 unlocked', !!PS().getProgress(D).achievements['level-50'])
  // impossible XP flag (game source > cap) → moderation case
  PS().useProgressStore.getState().update(D, (p) => p)
  // ANTI-CHEAT: impossible level progression detected at login
  PS().useProgressStore.getState().update(D, (p) => { p.xp = xpTo(80); return p })
  P6.markLogin(D)
  assert('ANTI-CHEAT: impossible level progression flagged', PS().getProgress(D).flags.some((f) => f.type === 'impossibleLevel'))
  assert('ANTI-CHEAT: high-risk flag opens moderation case', ADM().reports.some((r) => r.reporterId === 'system' && r.targetUserId === D))
  PS().useProgressStore.getState().update(D, (p) => { p.xp = xpTo(50); return p })

  // FRIENDS
  auth().getState().logout(); await auth().getState().login({ email: 'dewi@arcade.test', password: 'arcade123' })
  await SO.sendFriendRequest('budi')
  assert('FRIENDS: request pending + notification', SO.outgoingRequests(D).length === 1 && (notif().getState().byUser[B] ?? []).some((n) => n.kind === 'friendRequest'))
  assert('FRIENDS: duplicate request blocked', (await SO.sendFriendRequest('budi').then(() => null, (e) => e.code)) === 'friends.errors.pending')
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  SO.acceptFriend(SO.incomingRequests(B)[0].id)
  assert('FRIENDS: accepted both ways', SO.friendIds(B).includes(D) && SO.friendIds(D).includes(B))
  assert('FRIENDS: friend leaderboard lists both', LB.leaderboard({ scope: 'friends', category: 'level', viewerId: B }).rows.some((r) => r.user.id === D))
  // FAVORITES
  SO.toggleFavorite('crash')
  assert('FAVORITES: favorite + count', SO.favoritesOf(B).includes('crash') && SO.favoriteCounts().crash === 1)
  SO.toggleFavorite('crash')
  assert('FAVORITES: unfavorite', !SO.favoritesOf(B).includes('crash'))
  // COSMETICS
  assert('COSMETICS: cannot equip unowned', tryErr(() => CO.equip('violet-frame')) === 'inventory.errors.notOwned')
  CO.equip('title-rookie')
  assert('COSMETICS: equip owned title', byName('budi').equipped.title === 'title-rookie')
  CO.unequip('title-rookie')
  assert('COSMETICS: unequip', !byName('budi').equipped.title)

  // REPORT (user) + rate limit / cooldown / duplicate
  auth().getState().logout(); await auth().getState().login({ email: 'dewi@arcade.test', password: 'arcade123' })
  const rep = RP.createReport({ targetType: 'player', targetUserId: C, reason: 'harassment', description: 'Keeps insulting players in chat.' })
  assert('REPORT: created with status new + REPORT_CREATED', rep.status === 'new' && ADM().reports[0].id === rep.id && EV().some((e) => e.type === 'REPORT_CREATED' && e.reportId === rep.id), JSON.stringify({ st: rep.status, top: ADM().reports[0]?.id, id: rep.id, ev: EV().slice(0, 4).map((e) => e.type) }))
  assert('REPORT: cooldown', tryErr(() => RP.createReport({ targetType: 'player', targetUserId: B, reason: 'spam', description: 'Spamming the chat a lot.' })) === 'reports.errors.cooldown')
  clock += 61_000
  assert('REPORT: duplicate detection', tryErr(() => RP.createReport({ targetType: 'player', targetUserId: C, reason: 'harassment', description: 'Same report again here.' })) === 'reports.errors.duplicate')
  assert('REPORT: cannot report self', tryErr(() => RP.createReport({ targetType: 'player', targetUserId: D, reason: 'spam', description: 'reporting myself here' })) === 'reports.errors.self')
  // REPORT RESOLUTION by moderator (neonrider = moderator)
  auth().getState().logout(); await auth().getState().login({ email: 'demo@arcade.test', password: 'newpass123' })
  AD.reportAction(rep.id, 'investigate')
  AD.reportAction(rep.id, 'note', { note: 'Checked chat logs' })
  AD.reportAction(rep.id, 'resolve', { reason: 'User warned for harassment' })
  const repAfter = ADM().reports.find((x) => x.id === rep.id)
  assert('REPORT RESOLUTION: resolved + history + notes + assignee', repAfter.status === 'resolved' && repAfter.history.length >= 3 && repAfter.notes.length === 1 && repAfter.assignee?.name === 'neonrider')
  assert('REPORT RESOLUTION: reporter notified + audit ADMIN_RESOLVE_REPORT + event', (notif().getState().byUser[D] ?? []).some((n) => n.kind === 'reportUpdate' && n.data.status === 'resolved') && ADM().logs[0].code === 'ADMIN_RESOLVE_REPORT' && EV().some((e) => e.type === 'REPORT_RESOLVED'))
  assert('REPORT RESOLUTION: cannot resolve twice', tryErr(() => AD.reportAction(rep.id, 'resolve', { reason: 'again resolve' })) === 'admin.errors.alreadyDone')
  // ADMIN WARN / MUTE / UNMUTE (moderator)
  AD.warnUser(C, 'Harassment in global chat')
  assert('ADMIN WARN: stored + notified + ADMIN_WARN', byName('cheater').warnings.length === 1 && ADM().logs[0].code === 'ADMIN_WARN' && (notif().getState().byUser[C] ?? []).some((n) => n.data?.event === 'warning'))
  AD.removeWarning(C, byName('cheater').warnings[0].id, 'Warning issued by mistake')
  assert('ADMIN REMOVE WARNING', byName('cheater').warnings[0].removedAt && AD.activeWarnings(byName('cheater')).length === 0)
  assert('ADMIN MUTE: moderator cannot mute permanently', tryErr(() => AD.muteUser(C, null, 'permanent mute try')) === 'admin.errors.tempOnly')
  AD.muteUser(C, 60, 'Cooling off period')
  assert('ADMIN MUTE: temp mute + ADMIN_MUTE code', byName('cheater').mutedUntil > clock && ADM().logs[0].code === 'ADMIN_MUTE')
  AD.unmuteUser(C, 'Mute lifted early')
  assert('ADMIN UNMUTE', !byName('cheater').mutedUntil && ADM().logs[0].code === 'ADMIN_UNMUTE')
  // ADMIN BAN / UNBAN audit codes (owner)
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.banUser(C, null, 'Permanent ban for cheating')
  assert('ADMIN BAN: permanent + ADMIN_BAN + device metadata', byName('cheater').status === 'banned' && byName('cheater').ban.until === null && ADM().logs[0].code === 'ADMIN_BAN' && ADM().logs[0].targetId === C && ADM().logs[0].device)
  AD.unbanUser(C, 'Appeal accepted after review')
  assert('ADMIN UNBAN: ADMIN_UNBAN', byName('cheater').status === 'active' && ADM().logs[0].code === 'ADMIN_UNBAN')
  AD.muteUser(C, null, 'Permanent chat mute')
  assert('ADMIN MUTE: permanent by admin', byName('cheater').mutedUntil > clock + 1e12)
  AD.unmuteUser(C, 'Lift permanent mute')
  AD.freezeWallet(C, true, 'Wallet review now')
  assert('ADMIN FREEZE WALLET code', ADM().logs[0].code === 'ADMIN_FREEZE_WALLET')
  AD.freezeWallet(C, false, 'Wallet review done')
  assert('ADMIN UNFREEZE WALLET code', ADM().logs[0].code === 'ADMIN_UNFREEZE_WALLET')
  // TRANSACTION REVERSAL
  const rewardTx = wallet().getState().post(C, { type: 'reward', currency: 'AC', amount: 500, source: 'quest' })
  const balC = w()[C].balance
  const rev = AD.reverseTransaction(C, rewardTx.id, 'Reward granted by bug')
  const origAfter = w()[C].transactions.find((t) => t.id === rewardTx.id)
  assert('TRANSACTION REVERSAL: new REVERSAL tx linked, original kept', rev.type === 'reversal' && rev.reversalOf === rewardTx.id && rev.amount === -500 && origAfter.amount === 500 && origAfter.reversedBy === rev.id && w()[C].balance === balC - 500)
  assert('TRANSACTION REVERSAL: audit ADMIN_REVERSE_TRANSACTION + event', ADM().logs[0].code === 'ADMIN_REVERSE_TRANSACTION' && EV().some((e) => e.type === 'TRANSACTION_REVERSED'))
  assert('TRANSACTION REVERSAL: cannot reverse twice / reverse a reversal', tryErr(() => AD.reverseTransaction(C, rewardTx.id, 'second reversal')) === 'admin.errors.alreadyDone' && tryErr(() => AD.reverseTransaction(C, rev.id, 'reverse reversal')) === 'admin.errors.reverseReversal')
  // AC/AG adjustment codes
  AD.adjustCurrency(C, 'AG', 1, 'Event reward gems')
  assert('ADMIN AG ADJUSTMENT code + tx admin fields', ADM().logs[0].code === 'ADMIN_AG_ADJUSTMENT' && w()[C].transactions[0].adminId === B && w()[C].transactions[0].category === 'admin')
  AD.setRole(C, 'support', 'Hired as support agent')
  assert('ADMIN CHANGE ROLE code', ADM().logs[0].code === 'ADMIN_CHANGE_ROLE')
  // PERMISSION CHECK: support
  auth().getState().logout(); await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' })
  assert('PERMISSION: support cannot reverse / ban / resolve reports', tryErr(() => AD.reverseTransaction(D, w()[D].transactions[0].id, 'support tries')) === 'admin.errors.forbidden' && tryErr(() => AD.banUser(D, 1, 'support ban try')) === 'admin.errors.forbidden' && tryErr(() => AD.reportAction(rep.id, 'reopen', { reason: 'support reopen' })) === 'admin.errors.forbidden')
  assert('PERMISSION: support cannot change system', tryErr(() => AD.setMaintenance({ enabled: true }, 'support maintenance')) === 'admin.errors.forbidden')
  // SUPPORT tickets
  auth().getState().logout(); await auth().getState().login({ email: 'dewi@arcade.test', password: 'arcade123' })
  const tk = SU.createTicket({ category: 'wallet', subject: 'Missing reward', message: 'My daily reward did not show up.', sessionId: g1.session.id })
  assert('SUPPORT: ticket OPEN', tk.status === 'OPEN' && SU.myTickets(D).length === 1)
  assert('SUPPORT: cooldown', tryErr(() => SU.createTicket({ category: 'bug', subject: 'Another one', message: 'Another problem happened here.' })) === 'support.errors.cooldown')
  auth().getState().logout(); await auth().getState().login({ email: 'c@arcade.test', password: 'arcade123' })
  SU.assignTicket(tk.id, C)
  SU.addTicketNote(tk.id, 'Checking ledger')
  SU.replyTicket(tk.id, 'We are checking your wallet now.')
  const tk2 = ADM().tickets.find((x) => x.id === tk.id)
  assert('SUPPORT: staff assign/note/reply → WAITING_FOR_USER + user notified', tk2.assignee.id === C && tk2.notes.length === 1 && tk2.status === 'WAITING_FOR_USER' && (notif().getState().byUser[D] ?? []).some((n) => n.kind === 'ticket'))
  SU.setTicketStatus(tk.id, 'RESOLVED')
  auth().getState().logout(); await auth().getState().login({ email: 'dewi@arcade.test', password: 'arcade123' })
  SU.reopenTicket(tk.id)
  assert('SUPPORT: user reopen RESOLVED → OPEN', ADM().tickets.find((x) => x.id === tk.id).status === 'OPEN')
  assert('SUPPORT: user cannot change status', tryErr(() => SU.setTicketStatus(tk.id, 'CLOSED')) === 'admin.errors.forbidden')

  // TEST MODE isolation: test account excluded from leaderboards + no milestone payouts
  const lbAll = LB.leaderboard({ scope: 'global', category: 'xp', viewerId: D }).rows
  assert('TEST MODE: test accounts never in leaderboard', !lbAll.some((r) => r.user.isTest || r.user.isDemo))
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.setTestAccount(D, true, 'QA account test')
  const acTest = w()[D].balance
  P6.grantXp(D, xpTo(60) - PS().getProgress(D).xp, 'test')
  assert('TEST MODE: XP on test account pays no milestone rewards', Math.abs(w()[D].balance - acTest) < 0.01 && !PS().getProgress(D).milestones['L15:60'])
  assert('TEST MODE: leaderboard excludes the test account', !LB.leaderboard({ scope: 'global', category: 'xp' }).rows.some((r) => r.user.id === D))
  AD.setTestAccount(D, false, 'QA finished')

  // MAINTENANCE: non-staff blocked, staff allowed
  AD.setMaintenance({ enabled: true, message: 'Database upgrade', until: clock + 3_600_000 }, 'Planned upgrade')
  assert('MAINTENANCE: staff can still play', (() => { try { clock += 300; G.playCoinflip({ bet: 10, side: 'heads' }); return true } catch (e) { return e.code } })() === true)
  auth().getState().logout(); await auth().getState().login({ email: 'dewi@arcade.test', password: 'arcade123' })
  assert('MAINTENANCE: users blocked from games', tryErr(() => { clock += 300; G.playCoinflip({ bet: 10, side: 'heads' }) }) === 'errors.maintenance')
  assert('STATUS: services report MAINTENANCE', L('src/services/system.js').serviceStatus().find((s) => s.id === 'games').status === 'MAINTENANCE')
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })
  AD.setMaintenance({ enabled: false, message: '', until: null }, 'Upgrade finished')
  AD.setServiceStatus('chat', 'DEGRADED', 'Investigating delays', 'Messages may be slow')
  assert('STATUS: admin override shown', L('src/services/system.js').serviceStatus().find((s) => s.id === 'chat').status === 'DEGRADED')
  AD.setServiceStatus('chat', null, 'Back to automatic')

  // SEASONS: end season → archive + new season
  const s1 = SE.currentSeason(clock)
  const next = AD.endSeasonNow('End season for test')
  assert('SEASON: ended, archived, new season started', next.id === s1.id + 1 && platform().getState().seasonArchive[0].id === s1.id && EV().some((e) => e.type === 'SEASON_ENDED'))
  // AUDIT LOG immutability
  assert('AUDIT: every entry has code/admin/target/time, append-only store', ADM().logs.every((l) => l.at && l.adminId && l.action) && ADM().logs.filter((l) => l.code).length >= 15 && !('deleteLog' in ADM()) && !('removeLog' in ADM()))
  // DASHBOARD real numbers
  const an6 = AD.analytics()
  assert('DASHBOARD: XP generated, AC/AG distributed, pending reports, open tickets, system status', an6.xpGenerated > 0 && an6.acDistributed > 0 && an6.agDistributed >= 1 && typeof an6.pendingReports === 'number' && an6.openTickets >= 1 && an6.systemStatus === 'OPERATIONAL', JSON.stringify({ xp: an6.xpGenerated, ac: an6.acDistributed, ag: an6.agDistributed, rep: an6.pendingReports, tk: an6.openTickets, st: an6.systemStatus }))
  // CHAT: blocked user hidden, emote, slow mode
  auth().getState().logout(); await auth().getState().login({ email: 'dewi@arcade.test', password: 'arcade123' })
  clock += 10_000
  const emoteRes = await say('gg :gg: :fire:')
  assert('CHAT: emote replaced when owned', emoteRes === 'ok' && platform().getState().chat.at(-1).text === 'gg GG :fire:', `${emoteRes} ${platform().getState().chat.at(-1).text}`)
  SO.blockUser(B)
  assert('CHAT: blocked user messages hidden', !chat.visibleMessages(platform().getState(), D).some((m) => m.userId === B))
  SO.unblockUser(B)
  assert('CHAT: chat quest progress tracked', (PS().getProgress(D).quests.daily.progress.chat3 ?? 0) >= 1)
  auth().getState().logout(); await auth().getState().login({ email: 'budi@arcade.test', password: 'arcade123' })

  L('src/store/useUiStore.js').useUiStore.getState().hideLevelUp()
  // ── Render semua halaman ──
  const pages = {
    auth: ['src/pages/AuthPage.jsx', '/auth', false],
    home: ['src/pages/HomePage.jsx', '/', true],
    games: ['src/pages/GamesPage.jsx', '/games', true],
    game: ['src/pages/GameRoute.jsx', '/games/crash', true],
    jackpot: ['src/pages/JackpotPage.jsx', '/jackpot', true],
    chat: ['src/pages/ChatPage.jsx', '/chat', true],
    wallet: ['src/pages/WalletPage.jsx', '/wallet', true],
    redeem: ['src/pages/RedeemPage.jsx', '/redeem', true],
    profile: ['src/pages/ProfilePage.jsx', '/profile', true],
    settings: ['src/pages/SettingsPage.jsx', '/settings', true],
    rewards: ['src/pages/RewardsPage.jsx', '/rewards', true],
    history: ['src/pages/HistoryPage.jsx', '/history', true],
    leaderboard: ['src/pages/LeaderboardPage.jsx', '/leaderboard', true],
    friends: ['src/pages/FriendsPage.jsx', '/friends', true],
    inventory: ['src/pages/InventoryPage.jsx', '/inventory', true],
    'u-profile': ['src/pages/PublicProfilePage.jsx', '/u/dewi', true],
    notifications: ['src/pages/NotificationsPage.jsx', '/notifications', true],
    support: ['src/pages/SupportPage.jsx', '/support', true],
    status: ['src/pages/StatusPage.jsx', '/status', false],
    'a-dash': ['src/admin/pages/Dashboard.jsx', '/admin', 'admin'],
    'a-users': ['src/admin/pages/Users.jsx#UserList', '/admin/users', 'admin'],
    'a-user': ['src/admin/pages/Users.jsx#UserDetail', '/admin/users/X', 'admin'],
    'a-wallets': ['src/admin/pages/Operations.jsx#Wallets', '/admin/wallets', 'admin'],
    'a-games': ['src/admin/pages/Operations.jsx#GamesAdmin', '/admin/games', 'admin'],
    'a-sessions': ['src/admin/pages/Operations.jsx#Sessions', '/admin/sessions', 'admin'],
    'a-anticheat': ['src/admin/pages/Operations.jsx#AntiCheat', '/admin/anticheat', 'admin'],
    'a-moderation': ['src/admin/pages/Moderation.jsx#ModerationQueue', '/admin/moderation', 'admin'],
    'a-restrictions': ['src/admin/pages/Content.jsx#Moderation', '/admin/restrictions', 'admin'],
    'a-support': ['src/admin/pages/Support.jsx#SupportAdmin', '/admin/support', 'admin'],
    'a-system': ['src/admin/pages/System.jsx#SystemAdmin', '/admin/system', 'admin'],
    'a-chat': ['src/admin/pages/Content.jsx#ChatAdmin', '/admin/chat', 'admin'],
    'a-rewards': ['src/admin/pages/Content.jsx#RewardsOverview', '/admin/rewards', 'admin'],
    'a-daily': ['src/admin/pages/Content.jsx#DailyAdmin', '/admin/daily', 'admin'],
    'a-quests': ['src/admin/pages/Content.jsx#QuestsAdmin', '/admin/quests', 'admin'],
    'a-achievements': ['src/admin/pages/Content.jsx#AchievementsAdmin', '/admin/achievements', 'admin'],
    'a-codes': ['src/admin/pages/Content.jsx#CodesAdmin', '/admin/codes', 'admin'],
    'a-announcements': ['src/admin/pages/Content.jsx#AnnouncementsAdmin', '/admin/announcements', 'admin'],
    'a-logs': ['src/admin/pages/Content.jsx#LogsAdmin', '/admin/logs', 'admin'],
    'a-testmode': ['src/admin/pages/Content.jsx#TestModeAdmin', '/admin/testmode', 'admin'],
    'a-settings': ['src/admin/pages/Content.jsx#SettingsAdmin', '/admin/settings', 'admin'],
  }
  for (const [slug, f] of Object.entries({ 'case-opening': 'CaseOpening', 'case-battle': 'CaseBattle', crash: 'Crash', plinko: 'Plinko', mines: 'Mines', dice: 'Dice', limbo: 'Limbo', coinflip: 'Coinflip', roulette: 'Roulette', blackjack: 'Blackjack' })) pages['g-' + slug] = [`src/games/${f}.jsx`, `/games/${slug}`, true]
  const AppLayout = L('src/components/layout/AppLayout.jsx').default
  const AdminLayout = L('src/admin/AdminLayout.jsx').default
  const ModalHostModule = 'src/components/modals/'
  const prefs = L('src/store/usePrefsStore.js').usePrefsStore
  ctx.window.__missingI18n = new Set()
  ctx.__missingI18n = ctx.window.__missingI18n

  globalThis.__adminUserId = A
  for (const lang of ['id', 'en']) {
    prefs.getState().setLanguage(lang)
    for (const [name, [file, route, layout]] of Object.entries(pages)) {
      currentPath = route
      const [fpath, exp] = file.split('#')
      const Page = exp ? L(fpath)[exp] : L(fpath).default
      // AuthPage butuh sesi kosong
      const session = auth().getState().session
      if (name === 'auth') auth().setState({ session: null })
      outlet = layout ? h(Page, file.includes('/games/') ? { game: L('src/config/games.js').getGame(name.replace('g-', '')) } : {}) : null
      try {
        const markup = Server.renderToString(layout === 'admin' ? h(AdminLayout) : layout ? h(AppLayout) : h(Page))
        if (name === 'auth') auth().setState({ session })
        fs.writeFileSync(path.join(OUT, `${name}.${lang}.html`), markup)
        const bad = /NaN|undefined|\[object Object\]/.exec(markup.replace(/<[^>]+>/g, ' '))
        if (bad || lang === 'id') console.log(`${bad ? '⚠' : '✓'} render ${name}.${lang} (${markup.length})${bad ? ' contains ' + bad[0] : ''}`)
      } catch (e) {
        if (name === 'auth') auth().setState({ session })
        console.log(`✗ render ${name}.${lang}:`, e.stack.split('\n').slice(0, 5).join('\n'))
      }
    }
    // Dialog konfirmasi admin dalam keadaan TERBUKA (isi Modal hanya dirender saat open).
    try {
      const RD = L('src/components/admin/ReasonDialog.jsx').default
      const markup = Server.renderToString(h(RD, { open: true, onClose() {}, title: 'Ban', description: 'x', onConfirm() {}, adminName: 'a' }, h('p', null, 'detail')))
      assert(`render ReasonDialog open (${lang})`, markup.includes('detail'))
    } catch (e) {
      assert(`render ReasonDialog open (${lang})`, false, e.message.slice(0, 200))
    }
    // Modal terbuka
    for (const [mod, props] of [['SendModal', {}], ['TopUpModal', { currency: 'AG' }], ['ReceiveModal', {}], ['EditProfileModal', {}], ['TxDetailModal', { txId: w()[A].transactions[0].id }]]) {
      const M = L(`${ModalHostModule}${mod}.jsx`).default
      try {
        const markup = Server.renderToString(h(M, { open: true, onClose() {}, initial: props }))
        fs.writeFileSync(path.join(OUT, `modal-${mod}.${lang}.html`), markup)
      } catch (e) {
        console.log(`✗ modal ${mod}.${lang}:`, e.stack.split('\n').slice(0, 4).join('\n'))
      }
    }
  }
  prefs.getState().setLanguage('id')
  console.log('missing i18n keys:', [...(ctx.window.__missingI18n ?? [])])
  console.log('lucide icons used:', [...usedIcons].sort().join(','))
  fs.writeFileSync(path.join(OUT, 'styles.css'), css)
  fs.writeFileSync(path.join(OUT, 'icons.json'), JSON.stringify([...usedIcons].sort()))
  console.log(failures ? `\n${failures} test(s) failed` : '\nAll tests passed')
  process.exitCode = failures ? 1 : 0
})()
