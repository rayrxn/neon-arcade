<?php
// Account email: password reset and email verification.
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
function chat(string $as, string $text): array
{
    q("UPDATE chat_messages SET created_at = created_at - interval '2 minutes' WHERE user_id = ?", [uid($as)]);
    return call('POST', 'chat/send', ['text' => $text], $as);
}
function cool(): void { usleep(1100000); }
function sync(string $as): array { return call('GET', 'sync', [], $as)['data']; }


echo "Neon Arcade — account email tests (password reset, email verification)\n";
$LOG = getenv('NEON_MAIL_LOG');
if (!$LOG) { echo "NEON_MAIL_LOG not set\n"; exit(1); }
@unlink($LOG);
function mails(): array { global $LOG; return is_file($LOG) ? array_map(fn($l) => json_decode($l, true), array_filter(explode("\n", file_get_contents($LOG)))) : []; }
function lastMail(): ?array { $m = mails(); return $m ? end($m) : null; }
function tokenOf(array $mail): string { preg_match('/token=([A-Za-z0-9_-]+)/', $mail['text'], $m); return $m[1] ?? ''; }

$tag = substr((string) time(), -5);
$r = call('POST', 'auth/register', ['username' => "mailer_$tag", 'email' => "mailer$tag@t.id", 'password' => 'rahasia123'], 'u');
if (!$r['ok']) { echo "register failed\n"; exit(1); }
$EMAIL = "mailer$tag@t.id";

echo "Email verification\n";
check('new account starts unverified', me('u')['user']['emailVerified'] === false);
$r = call('POST', 'auth/verify/send', ['lang' => 'en'], 'u');
check('verification email sent', $r['ok'] && count(mails()) === 1 && lastMail()['to'] === $EMAIL, $r);
$m = lastMail();
check('email is branded HTML with a working link', str_contains($m['html'], 'NEON') && str_contains($m['html'], '/verify-email?token=') && str_contains($m['subject'], 'Verify'));
check('plain-text fallback included', str_contains($m['text'], '/verify-email?token='));
check('masked address in the response', isset($r['data']['email']) && !str_contains($r['data']['email'], "mailer$tag@") && str_ends_with($r['data']['email'], '@t.id'), $r['data']['email'] ?? null);
expect_error('resend within 60 s is refused', call('POST', 'auth/verify/send', [], 'u'), 'auth.errors.waitResend');
$tok = tokenOf($m);
expect_error('wrong token rejected', call('POST', 'auth/verify', ['token' => str_repeat('x', 43)]), 'auth.errors.linkInvalid');
$r = call('POST', 'auth/verify', ['token' => $tok]);
check('verification link works without being signed in', $r['ok'] && $r['data']['username'] === "mailer_$tag", $r);
check('account is now verified', me('u')['user']['emailVerified'] === true);
expect_error('link works only once', call('POST', 'auth/verify', ['token' => $tok]), 'auth.errors.linkInvalid');
expect_error('verified account cannot request another link', call('POST', 'auth/verify/send', [], 'u'), 'auth.errors.alreadyVerified');
check('Indonesian email copy', str_contains(mail_render('verify', 'id', ['user' => 'a', 'email' => 'b', 'url' => 'https://x'])['subject'], 'Verifikasi'));

echo "Password reset\n";
@unlink($LOG);
$r = call('POST', 'auth/forgot', ['email' => 'nobody' . $tag . '@t.id', 'lang' => 'en']);
check('unknown email: same ok answer, no email sent', $r['ok'] && count(mails()) === 0);
expect_error('invalid email format rejected', call('POST', 'auth/forgot', ['email' => 'not-an-email']), 'validation.emailFormat');
$r = call('POST', 'auth/forgot', ['email' => strtoupper($EMAIL), 'lang' => 'id']);
check('reset email sent (email is case-insensitive)', $r['ok'] && count(mails()) === 1 && lastMail()['to'] === $EMAIL, $r);
$m = lastMail();
check('reset email in Indonesian with link', str_contains($m['subject'], 'password') && str_contains($m['html'], '/reset-password?token='));
$tok = tokenOf($m);
$c = call('POST', 'auth/reset/check', ['token' => $tok]);
check('link check shows the masked email', $c['ok'] && str_ends_with($c['data']['email'], '@t.id') && !str_contains($c['data']['email'], "mailer$tag@"), $c);
call('POST', 'auth/forgot', ['email' => $EMAIL]);
call('POST', 'auth/forgot', ['email' => $EMAIL]);
call('POST', 'auth/forgot', ['email' => $EMAIL]);
check('max 3 reset emails per 15 minutes', count(mails()) === 3, count(mails()));
expect_error('older link stops working once a newer one is sent', call('POST', 'auth/reset/check', ['token' => $tok]), 'auth.errors.linkInvalid');
$tok = tokenOf(lastMail());
expect_error('short new password rejected', call('POST', 'auth/reset', ['token' => $tok, 'password' => 'short']), 'validation.passwordLength');
$r = call('POST', 'auth/reset', ['token' => $tok, 'password' => 'barubaru123']);
check('password reset with the link', $r['ok'], $r);
check('reset signs out every device', call('GET', 'me', [], 'u')['data']['user'] === null);
expect_error('old password no longer works', call('POST', 'auth/login', ['email' => $EMAIL, 'password' => 'rahasia123'], 'u'), 'errors.wrongCredentials');
check('new password works', call('POST', 'auth/login', ['email' => $EMAIL, 'password' => 'barubaru123'], 'u')['ok']);
expect_error('reset link works only once', call('POST', 'auth/reset', ['token' => $tok, 'password' => 'lagilagi123']), 'auth.errors.linkInvalid');
q("UPDATE email_tokens SET created_at = created_at - interval '1 hour'");
call('POST', 'auth/forgot', ['email' => $EMAIL]);
$tok = tokenOf(lastMail());
q("UPDATE email_tokens SET expires_at = now() - interval '1 second' WHERE used_at IS NULL");
expect_error('expired link rejected', call('POST', 'auth/reset', ['token' => $tok, 'password' => 'lagilagi123']), 'auth.errors.linkInvalid');
check('tokens stored only as hashes', (int) qv('SELECT count(*) FROM email_tokens WHERE token_hash = ?', [$tok]) === 0 && (int) qv('SELECT count(*) FROM email_tokens WHERE token_hash = ?', [hash('sha256', $tok)]) === 1);
check('security notice for the reset', (int) qv("SELECT count(*) FROM notifications WHERE user_id = (SELECT id FROM users WHERE email = ?) AND kind = 'security'", [$EMAIL]) >= 1);

echo $failures ? "\n" . count($failures) . " failed: " . implode(', ', $failures) . "\n" : "\nALL PASSED — $pass passed\n";
exit($failures ? 1 : 0);
