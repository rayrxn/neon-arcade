<?php
// Tes integrasi API (PHP CLI) terhadap database PostgreSQL sungguhan.
// Pakai: NEON_CONFIG=/path/test-config.php php api/tests/api_test.php
declare(strict_types=1);

require __DIR__ . '/../index.php';

$pass = 0;
$failures = [];
$cookies = [];   // nama → token sesi

function call(string $method, string $path, array $body = [], ?string $as = null): array
{
    global $cookies;
    $GLOBALS['NEON_BODY'] = $body;
    unset($GLOBALS['NEON_BODY_PARSED'], $GLOBALS['NEON_USER']);
    $GLOBALS['NEON_COOKIE'] = $as !== null ? ($cookies[$as] ?? null) : null;
    try {
        $data = route($method, $path);
        if ($as !== null && isset($GLOBALS['NEON_COOKIE'])) $cookies[$as] = $GLOBALS['NEON_COOKIE'];
        return ['ok' => true, 'data' => json_decode(jenc($data), true)];
    } catch (ApiError $e) {
        return ['ok' => false, 'code' => $e->getMessage(), 'vars' => $e->vars];
    }
}

function check(string $name, bool $cond, $info = null): void
{
    global $pass, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $failures[] = $name; echo "  ✗ $name " . ($info !== null ? json_encode($info) : '') . "\n"; }
}

function expect_error(string $name, array $res, string $code): void
{
    check($name, !$res['ok'] && $res['code'] === $code, $res['ok'] ? 'ok' : $res['code']);
}

function balance(string $as): float
{
    return (float) call('GET', 'me', [], $as)['data']['wallet']['balance'];
}

function uid(string $as): string
{
    return call('GET', 'me', [], $as)['data']['user']['id'];
}

echo "Neon Arcade API tests\n";

// ── Health & registrasi ──
check('health', call('GET', 'health')['data']['status'] === 'ok');
$r = call('POST', 'auth/register', ['username' => 'owner_1', 'email' => 'Owner@Test.id', 'password' => 'rahasia123'], 'a');
check('register ok', $r['ok'], $r);
// DB tes sudah berisi akun staf awal (migrasi 003) → pendaftar baru = user; owner_1 dijadikan Owner untuk tes admin.
check('pendaftar baru = user (staf awal sudah ada)', ($r['data']['user']['role'] ?? '') === 'user');
q("UPDATE users SET role = 'super_admin' WHERE username = 'owner_1'");
check('saldo awal 10.000 AC', ($r['data']['wallet']['balance'] ?? 0) == 10000);
check('saldo awal 1 AG', ($r['data']['wallet']['gems'] ?? 0) == 1);
check('email dinormalisasi', ($r['data']['user']['email'] ?? '') === 'owner@test.id');
check('quest login tercatat', ($r['data']['progress']['quests']['daily']['progress']['login'] ?? 0) == 1);
check('progress kosong jadi objek', is_array($r['data']['progress']['achievements'] ?? null));
expect_error('email dobel ditolak', call('POST', 'auth/register', ['username' => 'other_1', 'email' => 'owner@test.id', 'password' => 'rahasia123']), 'errors.emailTaken');
expect_error('username dobel (beda huruf) ditolak', call('POST', 'auth/register', ['username' => 'OWNER_1', 'email' => 'x@test.id', 'password' => 'rahasia123']), 'errors.usernameTaken');
expect_error('username tidak valid', call('POST', 'auth/register', ['username' => 'a b', 'email' => 'y@test.id', 'password' => 'rahasia123']), 'validation.usernameFormat');
expect_error('password pendek', call('POST', 'auth/register', ['username' => 'shorty', 'email' => 'z@test.id', 'password' => '123']), 'validation.passwordLength');
$b = call('POST', 'auth/register', ['username' => 'player_2', 'email' => 'p2@test.id', 'password' => 'rahasia123'], 'b');
check('akun kedua = user', ($b['data']['user']['role'] ?? '') === 'user');

// ── Sesi ──
check('me dengan cookie', (call('GET', 'me', [], 'a')['data']['user']['username'] ?? '') === 'owner_1');
check('me tanpa cookie → null', call('GET', 'me')['data']['user'] === null);
expect_error('aksi tanpa login ditolak', call('POST', 'game/dice', ['bet' => 10, 'target' => 50, 'over' => true]), 'errors.sessionExpired');

// ── Dice + ledger ──
$before = balance('a');
$d = call('POST', 'game/dice', ['bet' => 100, 'target' => 50, 'over' => true], 'a');
check('dice ok', $d['ok'], $d);
$res = $d['data']['result'];
$s = $res['session'];
check('dice: roll 0–100', $res['roll'] >= 0 && $res['roll'] <= 100);
check('dice: hasil sesuai roll', ($res['roll'] > 50) === ($s['result'] === 'win'));
$after = $d['data']['state']['wallet']['balance'];
check('dice: saldo = sebelum − bet + payout', abs($after - ($before - 100 + $s['payout'])) < 0.001, [$before, $after, $s['payout']]);
check('dice: XP diberikan', $s['xp'] === 11 || $s['xp'] === 16, $s['xp']);
check('dice: sesi tersimpan di progres', ($d['data']['state']['progress']['sessions'][0]['id'] ?? '') === $s['id']);
$txs = $d['data']['state']['wallet']['transactions'];
$betTx = array_values(array_filter(array_slice($txs, 0, 2), fn($x) => $x['type'] === 'bet'))[0] ?? null;
check('dice: transaksi bet tercatat + game', $betTx && $betTx['game'] === 'dice', array_slice($txs, 0, 2));
expect_error('bet pecahan ditolak', call('POST', 'game/dice', ['bet' => 1.5, 'target' => 50, 'over' => true], 'a'), 'play.errors.wholeBet');
expect_error('bet 0 ditolak', call('POST', 'game/dice', ['bet' => 0, 'target' => 50, 'over' => true], 'a'), 'play.errors.minBet');
expect_error('bet > batas loyalty ditolak', call('POST', 'game/dice', ['bet' => 250001, 'target' => 50, 'over' => true], 'a'), 'play.errors.loyaltyMax');
expect_error('saldo kurang ditolak', call('POST', 'game/dice', ['bet' => 99999, 'target' => 50, 'over' => true], 'b') + ['code' => null] , 'errors.insufficient');
// Spam: ronde ke-9 dalam satu detik ditolak dan dicatat walau request gagal.
cool();
$spam = null;
for ($i = 0; $i < 9; $i++) $spam = call('POST', 'game/coinflip', ['bet' => 1, 'side' => 'heads'], 'a');
expect_error('ronde ke-9 per detik ditolak', $spam, 'play.errors.tooFast');
check('flag rapidRequests tetap tercatat', (int) qv("SELECT count(*) FROM cheat_flags WHERE type = 'rapidRequests'") >= 1);
cool();
expect_error('target dice tidak valid', call('POST', 'game/dice', ['bet' => 10, 'target' => 99, 'over' => true], 'a'), 'play.errors.invalid');
$after = balance('a');
expect_error('error tidak mengubah saldo (cek)', call('POST', 'game/dice', ['bet' => 10, 'target' => 1, 'over' => true], 'a'), 'play.errors.invalid');
check('saldo tidak berubah setelah error', abs(balance('a') - $after) < 0.001);

// ── Provably fair: verifikasi ulang setelah rotasi seed ──
$rot = call('POST', 'fairness/rotate', ['clientSeed' => 'my-seed'], 'a');
check('rotate seed ok', $rot['ok'] && $rot['data']['clientSeed'] === 'my-seed', $rot);
$prev = $rot['data']['previous'];
check('server seed lama dibuka & hash cocok', hash('sha256', $prev['serverSeed']) === $prev['serverSeedHash']);
$f = generate_floats($prev['serverSeed'], $prev['clientSeed'], $s['nonce'], 1);
check('roll bisa diverifikasi ulang', dice_roll($f[0]) == $res['roll'], [dice_roll($f[0]), $res['roll']]);

// ── Semua game instan ──
foreach ([
    ['limbo', ['bet' => 10, 'target' => 2]],
    ['coinflip', ['bet' => 10, 'side' => 'heads']],
    ['plinko', ['bet' => 10, 'risk' => 'medium']],
    ['roulette', ['bets' => [['type' => 'red', 'amount' => 10], ['type' => 'straight', 'value' => 7, 'amount' => 5]]]],
    ['case-open', ['caseId' => 'starter']],
    ['case-battle', ['caseId' => 'starter', 'rounds' => 2]],
] as [$g, $args]) {
    $bal = balance('a');
    $x = call('POST', "game/$g", $args, 'a');
    $sess = $x['data']['result']['session'] ?? null;
    check("$g ok", $x['ok'] && $sess && $sess['verification'] === 'verified', $x);
    if ($sess) check("$g: saldo konsisten", abs($x['data']['state']['wallet']['balance'] - ($bal - $sess['bet'] + $sess['payout'])) < 0.001);
}
expect_error('roulette tanpa taruhan', call('POST', 'game/roulette', ['bets' => []], 'a'), 'play.errors.noBets');

// Batas 8 ronde/detik juga berlaku di tes → beri jeda antar bagian.
function cool(): void { usleep(1100000); }

// ── Crash (waktu dipalsukan) ──
cool();
$t0 = now_ms();
$GLOBALS['NEON_NOW'] = $t0;
$cs = call('POST', 'game/crash-start', ['bet' => 50], 'a');
check('crash start', $cs['ok'] && !isset($cs['data']['result']['point']), $cs);
$cid = $cs['data']['result']['id'];
expect_error('crash: ronde kedua ditolak', call('POST', 'game/crash-start', ['bet' => 50], 'a'), 'play.errors.roundOpen');
$point = (float) jdec((string) qv('SELECT state FROM game_sessions WHERE id = ?', [$cid]))['point'];
check('titik crash tidak dikirim ke UI', !str_contains(jenc($cs['data']['result']), 'point'));
$GLOBALS['NEON_NOW'] = $t0 + 100;
$tk = call('POST', 'game/crash-tick', ['id' => $cid], 'a');
check('crash tick berjalan', $tk['ok'] && ($point <= 1.01 || $tk['data']['result']['done'] === false), $tk['data']['result'] ?? $tk);
if ($point > 1.2) {
    $GLOBALS['NEON_NOW'] = $t0 + (int) (crash_time_of(1.1) + 50);
    $co = call('POST', 'game/crash-cashout', ['id' => $cid], 'a');
    check('crash cash out menang', $co['ok'] && $co['data']['result']['session']['result'] === 'win' && $co['data']['result']['cashedAt'] >= 1.1, $co['data']['result'] ?? $co);
    $again = call('POST', 'game/crash-cashout', ['id' => $cid], 'a');
    check('crash cash out kedua = hasil lama', $again['ok'] && !empty($again['data']['result']['stale']));
} else {
    $GLOBALS['NEON_NOW'] = $t0 + 60000;
    $co = call('POST', 'game/crash-tick', ['id' => $cid], 'a');
    check('crash meledak', $co['ok'] && $co['data']['result']['crashed'] === true);
}
// Crash meledak saat waktunya lewat
$GLOBALS['NEON_NOW'] = $t0 + 120000;
$cs2 = call('POST', 'game/crash-start', ['bet' => 20], 'a');
$cid2 = $cs2['data']['result']['id'];
$p2 = (float) jdec((string) qv('SELECT state FROM game_sessions WHERE id = ?', [$cid2]))['point'];
$GLOBALS['NEON_NOW'] = $t0 + 120000 + (int) crash_time_of($p2) + 10;
$late = call('POST', 'game/crash-cashout', ['id' => $cid2], 'a');
check('crash: cash out setelah meledak = kalah', $late['ok'] && $late['data']['result']['crashed'] === true && $late['data']['result']['session']['payout'] == 0, $late['data']['result'] ?? $late);
cool();
$fake = call('POST', 'game/crash-cashout', ['id' => '00000000-0000-0000-0000-000000000000'], 'a');
expect_error('crash: id palsu → flag replay', $fake, 'play.errors.settled');
check('flag replay tercatat', (int) qv("SELECT count(*) FROM cheat_flags WHERE type = 'replay'") >= 1);
unset($GLOBALS['NEON_NOW']);

// ── Mines ──
cool();
$ms = call('POST', 'game/mines-start', ['bet' => 30, 'mines' => 3], 'a');
check('mines start', $ms['ok'], $ms);
$mid = $ms['data']['result']['id'];
$pos = jdec((string) qv('SELECT state FROM game_sessions WHERE id = ?', [$mid]))['positions'];
check('posisi ranjau tidak dikirim ke UI', !str_contains(jenc($ms['data']['result']), 'positions'));
$safe = array_values(array_diff(range(0, 24), $pos));
$rv = call('POST', 'game/mines-reveal', ['id' => $mid, 'index' => $safe[0]], 'a');
check('mines buka petak aman', $rv['ok'] && $rv['data']['result']['done'] === false && $rv['data']['result']['multiplier'] > 1);
expect_error('mines: petak sama dua kali', call('POST', 'game/mines-reveal', ['id' => $mid, 'index' => $safe[0]], 'a'), 'play.errors.invalid');
$open = call('POST', 'game/open', ['game' => 'mines'], 'a');
check('mines: ronde bisa dilanjutkan (resume)', ($open['data']['result']['id'] ?? '') === $mid && count($open['data']['result']['revealed']) === 1);
$mc = call('POST', 'game/mines-cashout', ['id' => $mid], 'a');
check('mines cash out', $mc['ok'] && $mc['data']['result']['session']['result'] === 'win', $mc['data']['result'] ?? $mc);
$ms2 = call('POST', 'game/mines-start', ['bet' => 30, 'mines' => 3], 'a');
$mid2 = $ms2['data']['result']['id'];
$pos2 = jdec((string) qv('SELECT state FROM game_sessions WHERE id = ?', [$mid2]))['positions'];
$boom = call('POST', 'game/mines-reveal', ['id' => $mid2, 'index' => $pos2[0]], 'a');
check('mines: kena ranjau = kalah', $boom['ok'] && $boom['data']['result']['done'] === true && $boom['data']['result']['session']['payout'] == 0);

// ── Blackjack ──
cool();
for ($i = 0; $i < 3; $i++) {
    $bj = call('POST', 'game/blackjack-start', ['bet' => 40], 'a');
    check("blackjack start #$i", $bj['ok'], $bj);
    $res = $bj['data']['result'];
    if (!$res['done']) {
        check('kartu tertutup dealer disembunyikan', !empty($res['dealer'][1]['hidden']));
        $act = call('POST', 'game/blackjack-action', ['id' => $res['id'], 'action' => $i === 1 ? 'double' : 'stand'], 'a');
        check("blackjack " . ($i === 1 ? 'double' : 'stand'), $act['ok'] && $act['data']['result']['done'] === true, $act['data']['result'] ?? $act);
        if ($i === 1 && $act['ok']) check('double: taruhan jadi 2×', $act['data']['result']['session']['bet'] == 80);
    }
}

// ── Daily reward (hari dipalsukan) ──
$day0 = now_ms();
$GLOBALS['NEON_NOW'] = $day0;
$bal = balance('b');
$dc = call('POST', 'daily/claim', [], 'b');
check('daily day 1 = 250 AC', $dc['ok'] && $dc['data']['result']['day'] === 1 && abs($dc['data']['state']['wallet']['balance'] - $bal - 250) < 0.001, $dc);
expect_error('daily dua kali ditolak', call('POST', 'daily/claim', [], 'b'), 'rewards.errors.claimedToday');
$GLOBALS['NEON_NOW'] = $day0 + DAY_MS;
$dc2 = call('POST', 'daily/claim', [], 'b');
check('daily day 2 = 400 AC (besoknya)', $dc2['ok'] && $dc2['data']['result']['day'] === 2, $dc2);
$GLOBALS['NEON_NOW'] = $day0 + 2 * DAY_MS;
$dc3 = call('POST', 'daily/claim', [], 'b');
check('daily day 3 = 150 XP (+ XP achievement yang terbuka)', $dc3['ok'] && $dc3['data']['result']['day'] === 3 && $dc3['data']['result']['rewards'][0]['amount'] === 150 && $dc3['data']['result']['xp'] >= 150, $dc3['data']['result'] ?? $dc3);
$GLOBALS['NEON_NOW'] = $day0 + 5 * DAY_MS;
$dc4 = call('POST', 'daily/claim', [], 'b');
check('daily bolos → kembali ke day 1', $dc4['ok'] && $dc4['data']['result']['day'] === 1);
unset($GLOBALS['NEON_NOW']);

// ── Quest ──
$GLOBALS['NEON_NOW'] = $day0 + 10 * DAY_MS;
call('GET', 'me', [], 'b');   // login hari baru → quest login
$bal = balance('b');
$q = call('POST', 'quest/claim', ['scope' => 'daily', 'id' => 'login'], 'b');
check('klaim quest login (+100 AC, +20 XP)', $q['ok'] && abs($q['data']['state']['wallet']['balance'] - $bal - 100) < 0.001 && $q['data']['result']['xp'] >= 20, $q);
expect_error('quest dua kali ditolak', call('POST', 'quest/claim', ['scope' => 'daily', 'id' => 'login'], 'b'), 'rewards.errors.claimed');
expect_error('quest belum selesai ditolak', call('POST', 'quest/claim', ['scope' => 'daily', 'id' => 'play3'], 'b'), 'rewards.errors.notDone');
cool();
for ($i = 0; $i < 3; $i++) call('POST', 'game/coinflip', ['bet' => 10, 'side' => 'tails'], 'b');
check('quest play3 bisa diklaim setelah 3 game', call('POST', 'quest/claim', ['scope' => 'daily', 'id' => 'play3'], 'b')['ok']);
expect_error('metric tidak diizinkan', call('POST', 'metric', ['metric' => 'games'], 'b'), 'play.errors.invalid');
check('metric chat diterima', call('POST', 'metric', ['metric' => 'chat'], 'b')['ok']);
unset($GLOBALS['NEON_NOW']);

// ── Milestone level 15: dibayar sekali ──
cool();
$ub = uid('b');
q("UPDATE user_docs SET progress = jsonb_set(progress, '{xp}', '8220'::jsonb) WHERE user_id = ?", [$ub]);
$bal = balance('b');
$lv = call('POST', 'game/dice', ['bet' => 100, 'target' => 50, 'over' => true], 'b');
$sum = $lv['data']['result']['summary'];
check('naik ke level 15', ($sum['levelUp']['to'] ?? 0) === 15, $sum['levelUp'] ?? null);
$sess = $lv['data']['result']['session'];
check('milestone L15 +250.000 AC', abs($lv['data']['state']['wallet']['balance'] - ($bal - 100 + $sess['payout'] + 250000)) < 0.001);
check('milestone tercatat di tabel', (int) qv("SELECT count(*) FROM level_milestones WHERE user_id = ? AND milestone_type = 'L15'", [$ub]) === 1);
q("UPDATE user_docs SET progress = jsonb_set(progress, '{xp}', '8220'::jsonb) WHERE user_id = ?", [$ub]);   // paksa lewati level 15 lagi
$bal = balance('b');
$lv2 = call('POST', 'game/dice', ['bet' => 100, 'target' => 50, 'over' => true], 'b');
$sess2 = $lv2['data']['result']['session'];
check('milestone tidak dibayar dua kali', abs($lv2['data']['state']['wallet']['balance'] - ($bal - 100 + $sess2['payout'])) < 0.001);
check('achievement level-15 terbuka', isset($lv['data']['state']['progress']['achievements']['level-15']));
check('item achievement masuk inventory', in_array('badge-level-15', $lv['data']['state']['wallet']['inventory'], true));

// ── Profil ──
$pr = call('POST', 'profile', ['displayName' => 'Pemain Dua', 'avatar' => ['kind' => 'preset', 'id' => 'mint']], 'b');
check('update profil', $pr['ok'] && $pr['data']['user']['displayName'] === 'Pemain Dua' && $pr['data']['user']['avatar']['id'] === 'mint');
expect_error('frame yang tidak dimiliki ditolak', call('POST', 'profile', ['frame' => 'gold-frame-x'], 'b'), 'errors.invalidInput');
expect_error('username dipakai ditolak', call('POST', 'profile', ['username' => 'owner_1'], 'b'), 'errors.usernameTaken');

// ── Login, rate limit, logout ──
expect_error('password salah', call('POST', 'auth/login', ['email' => 'p2@test.id', 'password' => 'salah'], 'c'), 'errors.wrongCredentials');
$ok = call('POST', 'auth/login', ['email' => 'P2@test.id', 'password' => 'rahasia123'], 'c');
check('login (email beda huruf)', $ok['ok'] && $ok['data']['user']['username'] === 'player_2');
check('perangkat lain melihat saldo yang sama', abs($ok['data']['wallet']['balance'] - balance('b')) < 0.001);
for ($i = 0; $i < 4; $i++) call('POST', 'auth/login', ['email' => 'owner@test.id', 'password' => 'salah']);
$locked = call('POST', 'auth/login', ['email' => 'owner@test.id', 'password' => 'salah']);
expect_error('5 gagal → dikunci', $locked, 'errors.tooManyAttempts');
expect_error('password benar pun dikunci sementara', call('POST', 'auth/login', ['email' => 'owner@test.id', 'password' => 'rahasia123']), 'errors.tooManyAttempts');
check('logout', call('POST', 'auth/logout', [], 'c')['ok']);
check('setelah logout sesi hilang', call('GET', 'me', [], 'c')['data']['user'] === null);

// ── Integritas ledger ──
$bad = (int) qv('SELECT count(*) FROM wallet_transactions WHERE balance_after <> balance_before + amount');
check('semua transaksi konsisten', $bad === 0);
$diff = qv("SELECT count(*) FROM wallets w WHERE ac_balance <> (SELECT coalesce(sum(amount), 0) FROM wallet_transactions t WHERE t.user_id = w.user_id AND currency = 'AC')");
check('saldo = jumlah ledger', (int) $diff === 0);
check('tidak ada ronde menggantung', (int) qv("SELECT count(*) FROM game_sessions WHERE status = 'OPEN'") === 0);

echo "\n" . ($failures ? 'FAILED: ' . count($failures) . ' (' . implode(', ', $failures) . ')' : "ALL PASSED") . " — $pass passed\n";
exit($failures ? 1 : 0);
