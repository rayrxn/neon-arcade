<?php
// R 1.1.1: two-step sign-in, absolute sessions, strict mode, console parity.
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
    foreach (['NEON_MEMBERSHIPS_DIRTY', 'NEON_LEVELS_DIRTY', 'NEON_CARDS_DIRTY', 'NEON_SHOP_DIRTY', 'NEON_EMOTES_DIRTY', 'NEON_ROLES_DIRTY', 'NEON_TERMS_DIRTY'] as $k) $GLOBALS[$k] = true;
    $GLOBALS['NEON_KV_DIRTY'] = ['economy' => true, 'moderation' => true, 'memberships' => true];
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
    else { $failures[] = $name; echo "  ✗ $name " . ($info !== null ? mb_substr(json_encode($info, JSON_UNESCAPED_UNICODE), 0, 600) : '') . "\n"; }
}
function expect_error(string $name, array $res, string $code): void
{
    check($name, !$res['ok'] && $res['code'] === $code, $res['ok'] ? 'ok' : [$res['code'], $res['vars'] ?? null]);
}
function me(string $as): array { return call('GET', 'me', [], $as)['data']; }
function bal(string $as, string $c = 'AC'): float { return (float) me($as)['wallet'][$c === 'AC' ? 'balance' : 'gems']; }
function uid(string $as): string { return me($as)['user']['id']; }
function extras(string $as): array { return me($as)['extras']; }
function admin(string $as, string $name, array $args = []): array { return call('POST', 'admin/action', ['name' => $name, 'args' => $args], $as); }
function rid(): string { return 'r' . bin2hex(random_bytes(8)); }
function setbal(string $id, float $ac, float $ag): void
{
    $w = q1('SELECT ac_balance, ag_balance FROM wallets WHERE user_id = ?', [$id]);
    if ($ac != (float) $w['ac_balance']) qv("SELECT wallet_post(?::uuid, 'AC', ?::numeric, 'adjust', 'system', 'test', 'test', NULL, NULL, NULL, ?)", [$id, (string) ($ac - (float) $w['ac_balance']), rid()]);
    if ($ag != (float) $w['ag_balance']) qv("SELECT wallet_post(?::uuid, 'AG', ?::numeric, 'adjust', 'system', 'test', 'test', NULL, NULL, NULL, ?)", [$id, (string) ($ag - (float) $w['ag_balance']), rid()]);
}

$LOG = getenv('NEON_MAIL_LOG');
@unlink($LOG);
function mails(): array { global $LOG; return is_file($LOG) ? array_map(fn($l) => json_decode($l, true), array_filter(explode("\n", file_get_contents($LOG)))) : []; }
function lastCode(): string { $m = mails(); $t = $m ? end($m)['text'] : ''; preg_match('/\b(\d{6})\b/', $t, $x); return $x[1] ?? ''; }
$tag = substr(bin2hex(random_bytes(3)), 0, 6);
$_SERVER['REMOTE_ADDR'] = '10.1.2.3';
echo "Neon Arcade — R 1.1.1 security tests\n";

echo "TOTP math\n";
check('RFC 6238 test vector (SHA1, T=59 → 287082)', totp_at(b32_encode('12345678901234567890'), 1) === '287082');
check('base32 round trip', b32_decode(b32_encode("\x00\xffhello")) === "\x00\xffhello");
check('secrets are encrypted at rest', str_starts_with(sec_encrypt('ABC'), 'g:') && sec_decrypt(sec_encrypt('ABC')) === 'ABC');

$r = call('POST', 'auth/register', ['username' => "sec_$tag", 'email' => "sec$tag@t.id", 'password' => 'rahasia123'], 'u');
check('register', $r['ok'], $r);
$UID = $r['data']['user']['id'];
check('me shows security (off, 7-day sessions)', array_key_exists('method', $r['data']['user']['security'] ?? []) && $r['data']['user']['security']['method'] === null && $r['data']['user']['security']['sessionHours'] === 168, $r['data']['user']['security'] ?? null);
check('session ends 7 days after sign-in', abs(strtotime((string) qv('SELECT max(expires_at) FROM sessions WHERE user_id = ?', [$UID])) - time() - 7 * 86400) < 60);

echo "Authenticator (TOTP)\n";
$s = call('POST', 'security/2fa/setup', ['method' => 'totp'], 'u');
check('setup returns secret + otpauth URI', $s['ok'] && strlen($s['data']['secret']) === 32 && str_starts_with($s['data']['uri'], 'otpauth://totp/'), $s);
$secret = $s['data']['secret'];
expect_error('wrong password refused', call('POST', 'security/2fa/enable', ['method' => 'totp', 'code' => totp_at($secret, intdiv(time(), 30)), 'password' => 'nope12345'], 'u'), 'errors.wrongPassword');
expect_error('wrong code refused', call('POST', 'security/2fa/enable', ['method' => 'totp', 'code' => '000000', 'password' => 'rahasia123'], 'u'), 'security.errors.badCode');
$e = call('POST', 'security/2fa/enable', ['method' => 'totp', 'code' => totp_at($secret, intdiv(time(), 30)), 'password' => 'rahasia123'], 'u');
check('enabled with a valid code', $e['ok'] && $e['data']['security']['method'] === 'totp', $e);
check('stored secret is not plain text', !str_contains((string) qv('SELECT totp_secret FROM users WHERE id = ?', [$UID]), $secret));
$nBefore = (int) qv('SELECT count(*) FROM sessions WHERE user_id = ?', [$UID]);
$l = call('POST', 'auth/login', ['email' => "sec_$tag", 'password' => 'rahasia123'], 'u2');
check('password alone no longer signs in: a ticket comes back', $l['ok'] && ($l['data']['twofa']['method'] ?? '') === 'totp' && empty($l['data']['user']), $l);
$ticket = $l['data']['twofa']['ticket'];
check('no session yet', (int) qv('SELECT count(*) FROM sessions WHERE user_id = ?', [$UID]) === $nBefore);
expect_error('wrong code', call('POST', 'auth/2fa', ['ticket' => $ticket, 'code' => '111111'], 'u2'), 'security.errors.badCode');
$v = call('POST', 'auth/2fa', ['ticket' => $ticket, 'code' => totp_at($secret, intdiv(time(), 30) + 1)], 'u2');
check('code finishes sign-in', $v['ok'] && $v['data']['user']['id'] === $UID, $v);
expect_error('ticket works once', call('POST', 'auth/2fa', ['ticket' => $ticket, 'code' => totp_at($secret, intdiv(time(), 30) + 1)], 'u2'), 'security.errors.expired');
$l = call('POST', 'auth/login', ['email' => "sec_$tag", 'password' => 'rahasia123'], 'u3');
expect_error('the same code cannot be used twice', call('POST', 'auth/2fa', ['ticket' => $l['data']['twofa']['ticket'], 'code' => totp_at($secret, intdiv(time(), 30) + 1)], 'u3'), 'security.errors.badCode');
for ($i = 0; $i < 4; $i++) call('POST', 'auth/2fa', ['ticket' => $l['data']['twofa']['ticket'], 'code' => '000000'], 'u3');
expect_error('5 wrong codes burn the ticket', call('POST', 'auth/2fa', ['ticket' => $l['data']['twofa']['ticket'], 'code' => '000000'], 'u3'), 'security.errors.tooMany');

echo "Strict sessions\n";
expect_error('players cannot turn on strict mode', call('POST', 'security/strict', ['on' => true, 'code' => totp_at($secret, intdiv(time(), 30) - 1)], 'u'), 'admin.errors.forbidden');
q("UPDATE users SET role = 'admin' WHERE id = ?", [$UID]);
q('UPDATE users SET totp_last_step = 0 WHERE id = ?', [$UID]);
$st = call('POST', 'security/strict', ['on' => true, 'code' => totp_at($secret, intdiv(time(), 30))], 'u');
check('admin turns on strict mode with the authenticator', $st['ok'] && $st['data']['security']['strict'] === true && $st['data']['security']['sessionHours'] === 3, $st);
check('existing sessions are cut to 3 hours', (int) qv("SELECT count(*) FROM sessions WHERE user_id = ? AND expires_at > now() + interval '3 hours 5 minutes'", [$UID]) === 0);
q('UPDATE users SET totp_last_step = 0 WHERE id = ?', [$UID]);
$l = call('POST', 'auth/login', ['email' => "sec_$tag", 'password' => 'rahasia123'], 'u4');
$v = call('POST', 'auth/2fa', ['ticket' => $l['data']['twofa']['ticket'], 'code' => totp_at($secret, intdiv(time(), 30))], 'u4');
check('strict sign-in session lasts 3 hours', $v['ok'] && abs(strtotime((string) qv('SELECT max(expires_at) FROM sessions WHERE user_id = ?', [$UID])) - time() - 3 * 3600) < 60, $v);

echo "Console recovery + parity\n";
$con = fn(string $path, array $body = []) => call('POST', $path, $body);
check('unlock console', $con('console/unlock', ['key' => 'test-console-key-123'])['ok']);
$st = call('GET', 'console/state')['data'];
check('catalog has groups, commands and admin actions', isset($st['catalog']['groups']['economy']) && count(array_filter($st['catalog']['items'], fn($i) => $i['kind'] === 'action')) >= 60, count($st['catalog']['items'] ?? []));
$x = $con('console/exec', ['command' => "2fa sec_$tag"])['data'];
check('2fa status', $x['ok'] && str_contains($x['output'], 'authenticator') && str_contains($x['output'], 'strict      on'), $x);
$x = $con('console/exec', ['command' => "strict sec_$tag off", 'confirm' => "strict sec_$tag off"])['data'];
check('console turns strict off', $x['ok'] && qv('SELECT strict_session FROM users WHERE id = ?', [$UID]) === false, $x);
$x = $con('console/exec', ['command' => "2fa-off sec_$tag lost phone", 'confirm' => "2fa-off sec_$tag lost phone"])['data'];
check('console removes 2FA (recovery)', $x['ok'] && qv('SELECT twofa_method FROM users WHERE id = ?', [$UID]) === null, $x);
check('and signs the player out everywhere', (int) qv('SELECT count(*) FROM sessions WHERE user_id = ?', [$UID]) === 0);
$x = $con('console/exec', ['command' => 'help'])['data'];
check('help is grouped', $x['ok'] && str_contains($x['output'], 'PLAYERS') && str_contains($x['output'], 'admin actions'), $x);
$x = $con('console/exec', ['command' => 'help do setMembership'])['data'];
check('help explains an admin action with an example', $x['ok'] && str_contains($x['output'], 'Example: do setMembership'), $x);
$x = $con('console/exec', ['command' => "do setMembership userId=@sec_$tag tier=vvip days=30 reason=\"event prize\""])['data'];
check('do: admin action runs with @name', $x['ok'] && member_tier($UID) === 'vvip', $x);
$x = $con('console/exec', ['command' => "do adjustCurrency userId=@sec_$tag currency=AC delta=5000 reason=bonus"])['data'];
check('do: dangerous action asks for confirmation', !empty($x['confirm']), $x);
$before = (float) qv('SELECT ac_balance FROM wallets WHERE user_id = ?', [$UID]);
$x = $con('console/exec', ['command' => "do adjustCurrency userId=@sec_$tag currency=AC delta=5000 reason=bonus", 'confirm' => "do adjustCurrency userId=@sec_$tag currency=AC delta=5000 reason=bonus"])['data'];
check('do: confirmed action changes the wallet', $x['ok'] && (float) qv('SELECT ac_balance FROM wallets WHERE user_id = ?', [$UID]) == $before + 5000, $x);
$x = $con('console/exec', ['command' => 'do setGameMaxBet slug=crash'])['data'];
check('do: missing field explained', !$x['ok'] && str_contains($x['output'], 'missing maxBet'), $x);
$x = $con('console/exec', ['command' => 'actions economy'])['data'];
check('actions lists a group', $x['ok'] && str_contains($x['output'], 'adjustCurrency'), $x);

echo "Console fixes\n";
$run = function (string $c) use ($con) { return $con('console/exec', ['command' => $c, 'confirm' => $c])['data']; };
$x = $run("users sec_");
check('users search works (no collation error)', $x['ok'] && str_contains($x['output'], "sec_$tag"), $x);
$x = $run('announce all Console test message');
check('announce works', $x['ok'] && str_contains($x['output'], 'sent to'), $x);
$before = kv_get('memberships');
$x = $run('do setMembershipConfig vvipPrice=777');
$GLOBALS['NEON_KV_DIRTY']['memberships'] = true;
$after = kv_get('memberships');
check('membership settings keep untouched values', $x['ok'] && (int) $after['vvip']['price'] === 777 && (int) $after['vip']['price'] === (int) $before['vip']['price'] && $after['vip']['benefits'] == $before['vip']['benefits'], [$x, $before, $after]);
$eco = kv_get('economy');
$x = $run('do setEconomy convertMaxAgPerDay=321');
$GLOBALS['NEON_KV_DIRTY']['economy'] = true;
check('exchange settings keep untouched values', $x['ok'] && (int) kv_get('economy')['convertMaxAgPerDay'] === 321 && (int) kv_get('economy')['acPerAg'] === (int) $eco['acPerAg'], $x);
$x = $run('do setFeature key=chat state=off');
check('select value "off" stays text', $x['ok'], $x);
$run('do setFeature key=chat state=public');
$x = $run('do setGameStatus slug=crash status=bogus');
check('bad choice is explained', !$x['ok'] && str_contains($x['output'], 'one of: live'), $x);
$x = $run('do setGameControls slug=crash typo=1');
check('unknown field is explained', !$x['ok'] && str_contains($x['output'], 'unknown field'), $x);
$x = $run('do economyAnalytics');
check('economy report prints', $x['ok'] && str_contains($x['output'], 'circulation'), $x);
$x = $run('do setTicketStatus ticketId=00000000-0000-0000-0000-000000000000 status=CLOSED');
check('admin errors come back with a code and the action help', !$x['ok'] && !empty($x['errorCode']) && str_contains($x['output'], 'Fields:'), $x);

echo "Email code\n";
q("UPDATE users SET email_verified_at = now(), role = 'user' WHERE id = ?", [$UID]);
$r2 = call('POST', 'auth/login', ['email' => "sec_$tag", 'password' => 'rahasia123'], 'u5');
check('signed in again (2FA was removed)', $r2['ok'] && !empty($r2['data']['user']), $r2);
$s = call('POST', 'security/2fa/setup', ['method' => 'email'], 'u5');
check('email setup sends a code', $s['ok'] && strlen(lastCode()) === 6, $s);
$e = call('POST', 'security/2fa/enable', ['method' => 'email', 'code' => lastCode(), 'password' => 'rahasia123'], 'u5');
check('email 2FA on', $e['ok'] && $e['data']['security']['method'] === 'email', $e);
q("UPDATE auth_codes SET created_at = created_at - interval '2 minutes' WHERE user_id = ?", [$UID]);
$l = call('POST', 'auth/login', ['email' => "sec_$tag", 'password' => 'rahasia123'], 'u6');
check('login sends an email code', $l['ok'] && $l['data']['twofa']['method'] === 'email' && strlen(lastCode()) === 6, $l);
$v = call('POST', 'auth/2fa', ['ticket' => $l['data']['twofa']['ticket'], 'code' => lastCode()], 'u6');
check('email code signs in', $v['ok'] && $v['data']['user']['id'] === $UID, $v);
echo "Strict sessions with email\n";
q("UPDATE users SET role = 'admin' WHERE id = ?", [$UID]);
q("UPDATE auth_codes SET created_at = created_at - interval '2 minutes' WHERE user_id = ?", [$UID]);
check('strict: send email code', call('POST', 'security/2fa/send', [], 'u6')['ok']);
$st = call('POST', 'security/strict', ['on' => true, 'code' => lastCode()], 'u6');
check('admin turns on strict mode with email codes', $st['ok'] && $st['data']['security']['strict'] === true && $st['data']['security']['sessionHours'] === 3, $st);
q("UPDATE auth_codes SET created_at = created_at - interval '2 minutes' WHERE user_id = ?", [$UID]);
$l = call('POST', 'auth/login', ['email' => "sec_$tag", 'password' => 'rahasia123'], 'u7');
check('strict + email: login asks for an email code', $l['ok'] && $l['data']['twofa']['method'] === 'email' && $l['data']['twofa']['strict'] === true, $l);
$v = call('POST', 'auth/2fa', ['ticket' => $l['data']['twofa']['ticket'], 'code' => lastCode()], 'u7');
check('strict + email: session lasts 3 hours', $v['ok'] && abs(strtotime((string) qv('SELECT max(expires_at) FROM sessions WHERE user_id = ?', [$UID])) - time() - 3 * 3600) < 60, $v);
q('UPDATE users SET email_verified_at = NULL, strict_session = FALSE WHERE id = ?', [$UID]);
expect_error('strict + email needs a verified email', call('POST', 'security/strict', ['on' => true, 'code' => '123456'], 'u7'), 'security.errors.verifyEmailFirst');
q("UPDATE users SET email_verified_at = now(), role = 'user' WHERE id = ?", [$UID]);
q("UPDATE auth_codes SET created_at = created_at - interval '2 minutes' WHERE user_id = ?", [$UID]);
check('confirm code for turning off', call('POST', 'security/2fa/send', [], 'u7')['ok']);
$d = call('POST', 'security/2fa/disable', ['password' => 'rahasia123', 'code' => lastCode()], 'u7');
check('2FA off with password + code', $d['ok'] && $d['data']['security']['method'] === null, $d);

check('console words: JSON in single quotes keeps its quotes', console_words("do editUser patch='{\"displayName\":\"Ray X\"}' reason=\"two words\"") === ['do', 'editUser', 'patch={"displayName":"Ray X"}', 'reason=two words']);

echo $failures ? "\n" . count($failures) . " failed: " . implode(', ', $failures) . "\n" : "\nALL PASSED — $pass passed\n";
exit($failures ? 1 : 0);
