<?php
// Tes role staf: akun awal, login username, wajib ganti password, izin per role, reset rilis.
declare(strict_types=1);

require __DIR__ . '/../index.php';

$pass = 0;
$failures = [];
$cookies = [];

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
    else { $failures[] = $name; echo "  ✗ $name " . ($info !== null ? json_encode($info, JSON_UNESCAPED_UNICODE) : '') . "\n"; }
}
function expect_error(string $name, array $res, string $code): void
{
    check($name, !$res['ok'] && $res['code'] === $code, $res['ok'] ? 'ok' : $res['code']);
}
function me(string $as): array { return call('GET', 'me', [], $as)['data']; }
function admin(string $as, string $name, array $args = []): array { return call('POST', 'admin/action', ['name' => $name, 'args' => $args], $as); }

echo "Neon Arcade — tes role staf\n";
$STAFF = ['owner' => ['neon_owner', 'super_admin'], 'admin' => ['neon_admin', 'admin'], 'mod' => ['neon_mod', 'moderator'], 'helper' => ['neon_helper', 'support'], 'tester' => ['neon_tester', 'developer']];

// ── Akun awal ──
foreach ($STAFF as $k => [$name, $role]) {
    $u = q1('SELECT * FROM users WHERE username = ?', [$name]);
    check("akun $name ada dengan role $role", $u && $u['role'] === $role, $u['role'] ?? null);
    check("akun $name wajib ganti password", $u && $u['must_change_password'] === true);
}
check('tester = akun test', (bool) qv("SELECT is_test FROM users WHERE username = 'neon_tester'"));
check('akun awal punya saldo awal', (float) qv("SELECT ac_balance FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.username = 'neon_owner'") == 10000);

// ── Login pakai username + password "admin" ──
expect_error('password salah ditolak', call('POST', 'auth/login', ['email' => 'neon_owner', 'password' => 'admin1'], 'x'), 'errors.wrongCredentials');
foreach ($STAFF as $k => [$name]) {
    $r = call('POST', 'auth/login', ['email' => strtoupper($name), 'password' => 'admin'], $k);
    check("login $name (username, huruf besar)", $r['ok'] && $r['data']['user']['mustChangePassword'] === true, $r);
}
$r = call('POST', 'auth/login', ['email' => 'owner@arcadebet.my.id', 'password' => 'admin'], 'owner2');
check('login pakai email juga bisa', $r['ok']);

// ── Gerbang ganti password ──
expect_error('sebelum ganti: admin snapshot diblokir', call('GET', 'admin/snapshot', [], 'owner'), 'errors.mustChangePassword');
expect_error('sebelum ganti: aksi admin diblokir', admin('owner', 'setMaintenance', ['enabled' => true, 'reason' => 'tes tes']), 'errors.mustChangePassword');
expect_error('sebelum ganti: main game diblokir', call('POST', 'daily/claim', [], 'owner'), 'errors.mustChangePassword');
check('sebelum ganti: me & sync tetap jalan', call('GET', 'me', [], 'owner')['ok'] && call('GET', 'sync', [], 'owner')['ok']);
expect_error('password baru terlalu pendek', call('POST', 'auth/password', ['current' => 'admin', 'next' => 'abc'], 'owner'), 'validation.passwordLength');
foreach ($STAFF as $k => [$name]) {
    $r = call('POST', 'auth/password', ['current' => 'admin', 'next' => "Rahasia{$k}123"], $k);
    check("ganti password $name", $r['ok'], $r);
}
check('setelah ganti: flag hilang', me('owner')['user']['mustChangePassword'] === false);
$o2 = call('GET', 'me', [], 'owner2');
check('setelah ganti: sesi lain (owner2) dikeluarkan', !$o2['ok'] || empty($o2['data']['user']), $o2);
expect_error('password lama "admin" tidak berlaku lagi', call('POST', 'auth/login', ['email' => 'neon_owner', 'password' => 'admin'], 'y'), 'errors.wrongCredentials');
check('setelah ganti: admin snapshot jalan', call('GET', 'admin/snapshot', [], 'owner')['ok']);

// ── Flag tidak bocor ke pemain lain ──
$r = call('POST', 'auth/register', ['username' => 'pemain_s3', 'email' => 'pemain_s3@t.id', 'password' => 'rahasia123'], 'p1');
check('pemain baru terdaftar', $r['ok'], $r);
$P1 = me('p1')['user']['id'];
$pub = array_values(array_filter(call('GET', 'sync', [], 'p1')['data']['users'], fn($u) => $u['username'] === 'neon_owner'))[0] ?? null;
check('sync publik: role terlihat (untuk tag)', $pub && $pub['role'] === 'super_admin');
check('sync publik: status password bawaan tidak dikirim', $pub && !array_key_exists('mustChangePassword', $pub));

// ── Izin per role ──
$snap = fn($as) => call('GET', 'admin/snapshot', [], $as);
check('helper bisa buka panel', $snap('helper')['ok']);
check('tester bisa buka panel', $snap('tester')['ok']);
expect_error('pemain biasa tidak bisa buka panel', $snap('p1'), 'admin.errors.forbidden');
check('helper boleh warning pemain', admin('helper', 'warnUser', ['userId' => $P1, 'reason' => 'spam di chat'])['ok']);
expect_error('helper tidak boleh ban', admin('helper', 'banUser', ['userId' => $P1, 'hours' => 1, 'reason' => 'spam di chat']), 'admin.errors.forbidden');
expect_error('tester tidak boleh warning', admin('tester', 'warnUser', ['userId' => $P1, 'reason' => 'spam di chat']), 'admin.errors.forbidden');
expect_error('tester tidak boleh ubah status game', admin('tester', 'setGameStatus', ['game' => 'dice', 'status' => 'disabled', 'reason' => 'tes tes']), 'admin.errors.forbidden');
check('moderator boleh ban sementara', admin('mod', 'banUser', ['userId' => $P1, 'hours' => 1, 'reason' => 'spam berulang'])['ok']);
check('moderator boleh unban', admin('mod', 'unbanUser', ['userId' => $P1, 'reason' => 'sudah minta maaf'])['ok']);
expect_error('moderator tidak boleh ubah saldo', admin('mod', 'adjustCurrency', ['userId' => $P1, 'currency' => 'AC', 'delta' => 100, 'reason' => 'kompensasi']), 'admin.errors.forbidden');
$HELPER = me('helper')['user']['id'];
expect_error('helper tidak boleh menindak moderator', admin('helper', 'warnUser', ['userId' => me('mod')['user']['id'], 'reason' => 'tes rank']), 'admin.errors.rank');
check('admin boleh ubah saldo', admin('admin', 'adjustCurrency', ['userId' => $P1, 'currency' => 'AC', 'delta' => 500, 'reason' => 'kompensasi bug'])['ok']);
expect_error('admin tidak boleh ganti role', admin('admin', 'setRole', ['userId' => $P1, 'role' => 'moderator', 'reason' => 'promosi staf']), 'admin.errors.forbidden');
expect_error('admin tidak boleh reset rilis', admin('admin', 'releaseReset', ['scope' => 'testers', 'confirm' => 'RESET TESTER', 'reason' => 'rilis v1']), 'admin.errors.forbidden');
check('owner boleh ganti role', admin('owner', 'setRole', ['userId' => $P1, 'role' => 'developer', 'reason' => 'jadikan tester'])['ok']);
admin('owner', 'setRole', ['userId' => $P1, 'role' => 'user', 'reason' => 'kembali jadi pemain']);

// ── Reset rilis ──
$TESTER = me('tester')['user']['id'];
$OWNER = me('owner')['user']['id'];
q("UPDATE user_docs SET progress = jsonb_set(progress, '{xp}', '5000') WHERE user_id IN (?, ?, ?)", [$TESTER, $OWNER, $P1]);
qv("SELECT wallet_post(?::uuid, 'AC', 777, 'adjust', 'system', 'tes', 'tes', NULL, NULL, NULL, 'tes:s3:t')", [$TESTER]);
$balOf = fn($id) => (float) qv('SELECT ac_balance FROM wallets WHERE user_id = ?', [$id]);
$xpOf = fn($id) => (int) qv("SELECT (progress->>'xp')::int FROM user_docs WHERE user_id = ?", [$id]);
$p1Bal = $balOf($P1);
expect_error('reset: teks konfirmasi salah', admin('owner', 'releaseReset', ['scope' => 'testers', 'confirm' => 'reset', 'reason' => 'rilis v1']), 'admin.errors.invalid');
expect_error('reset: alasan wajib', admin('owner', 'releaseReset', ['scope' => 'testers', 'confirm' => 'RESET TESTER', 'reason' => '']), 'admin.errors.reason');
$r = admin('owner', 'releaseReset', ['scope' => 'testers', 'confirm' => 'RESET TESTER', 'reason' => 'rilis v1.1']);
check('reset tester jalan', $r['ok'] && $r['data']['result']['accounts'] >= 1, $r);
check('reset tester: saldo tester kembali 10.000 AC', $balOf($TESTER) == 10000, $balOf($TESTER));
check('reset tester: XP tester 0', $xpOf($TESTER) === 0);
check('reset tester: owner & pemain tidak tersentuh', $xpOf($OWNER) === 5000 && $xpOf($P1) === 5000 && $balOf($P1) == $p1Bal);
check('reset tester: notifikasi releaseReset', (bool) qv("SELECT 1 FROM notifications WHERE user_id = ? AND kind = 'releaseReset'", [$TESTER]));
check('reset tercatat di audit log', (bool) qv("SELECT 1 FROM admin_audit_log WHERE action = 'release.reset' AND admin_id = ?", [$OWNER]));
check('reset tercatat di ledger (bisa ditelusuri)', (bool) qv("SELECT 1 FROM wallet_transactions WHERE user_id = ? AND source = 'release_reset'", [$TESTER]));
$r = admin('owner', 'releaseReset', ['scope' => 'global', 'confirm' => 'RESET GLOBAL', 'reason' => 'rilis v2.0']);
check('reset global jalan', $r['ok'], $r);
check('reset global: semua akun saldo 10.000 AC + 1 AG', (int) qv('SELECT count(*) FROM wallets WHERE ac_balance <> 10000 OR ag_balance <> 1') === 0);
check('reset global: XP semua 0', (int) qv("SELECT count(*) FROM user_docs WHERE coalesce((progress->>'xp')::int, 0) <> 0") === 0);
check('reset global: role & akun tetap', qv("SELECT role FROM users WHERE id = ?", [$OWNER]) === 'super_admin');

// ── CLI ──
$out = shell_exec('NEON_CONFIG=' . escapeshellarg((string) getenv('NEON_CONFIG')) . ' php ' . escapeshellarg(__DIR__ . '/../../tools/hosting/release-reset.php') . ' testers "rilis lewat cli" 2>&1');
check('CLI reset tester', str_contains((string) $out, '"ok":true'), $out);

echo "\n" . ($failures ? count($failures) . " gagal, $pass lulus\n" : "Semua $pass tes lulus\n");
exit($failures ? 1 : 0);
