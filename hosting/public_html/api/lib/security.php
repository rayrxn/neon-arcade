<?php
declare(strict_types=1);

/**
 * R 1.1.1 account security: two-step sign-in and session lifetimes.
 *  - 2FA method per account: 'email' (6-digit code by email) or 'totp' (authenticator app, RFC 6238, 30 s, ±1 step).
 *  - Sessions are absolute: 7 days, or 3 hours for Owners/Admins with strict mode on (which always asks the authenticator).
 *  - TOTP secrets are stored encrypted (AES-256-GCM, key derived from server config). Codes are single use.
 */

const TWOFA_ISSUER = 'Neon Arcade';
const SESSION_STRICT_S = 3 * 3600;
const TWOFA_CODE_TTL_MIN = 10;
const STRICT_ROLES = ['super_admin', 'admin'];

// ───────────────────────── crypto helpers ─────────────────────────

function sec_key(): string
{
    $c = config();
    return hash('sha256', 'neon-2fa|' . ($c['db']['pass'] ?? '') . '|' . ($c['db']['name'] ?? '') . '|' . ($c['console']['key_hash'] ?? ''), true);
}

function sec_encrypt(string $plain): string
{
    if (!function_exists('openssl_encrypt')) return 'p:' . $plain;
    $iv = random_bytes(12);
    $tag = '';
    $ct = openssl_encrypt($plain, 'aes-256-gcm', sec_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return 'g:' . base64_encode($iv . $tag . $ct);
}

function sec_decrypt(?string $box): ?string
{
    if ($box === null || $box === '') return null;
    if (str_starts_with($box, 'p:')) return substr($box, 2);
    $raw = base64_decode(substr($box, 2), true);
    if ($raw === false || strlen($raw) < 29) return null;
    $out = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', sec_key(), OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));
    return $out === false ? null : $out;
}

function b32_encode(string $bin): string
{
    $alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    foreach (str_split($bin) as $ch) $bits .= str_pad(decbin(ord($ch)), 8, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 5) as $chunk) $out .= $alpha[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}

function b32_decode(string $s): string
{
    $alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $s = strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $s));
    $bits = '';
    foreach (str_split($s) as $ch) $bits .= str_pad(decbin(strpos($alpha, $ch)), 5, '0', STR_PAD_LEFT);
    $out = '';
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}

/** RFC 6238 code for a time step. */
function totp_at(string $secretB32, int $step): string
{
    $h = hash_hmac('sha1', pack('N2', 0, $step), b32_decode($secretB32), true);
    $o = ord($h[19]) & 0x0f;
    $n = ((ord($h[$o]) & 0x7f) << 24) | (ord($h[$o + 1]) << 16) | (ord($h[$o + 2]) << 8) | ord($h[$o + 3]);
    return str_pad((string) ($n % 1000000), 6, '0', STR_PAD_LEFT);
}

/** Matching step (±1 window) or null. */
function totp_match(string $secretB32, string $code, int $lastStep = 0): ?int
{
    if (!preg_match('/^\d{6}$/', $code)) return null;
    $now = intdiv(time(), 30);
    foreach ([0, -1, 1] as $d) {
        $s = $now + $d;
        if ($s > $lastStep && hash_equals(totp_at($secretB32, $s), $code)) return $s;
    }
    return null;
}

function clean_code($v): string
{
    return preg_replace('/\D/', '', (string) $v);
}

// ───────────────────────── state ─────────────────────────

function strict_allowed(array $u): bool
{
    return in_array($u['role'] ?? '', STRICT_ROLES, true);
}

/** Strict sessions need two-step sign-in: the authenticator app, or email codes to a verified email. */
function strict_method_ok(array $u): void
{
    $m = $u['twofa_method'] ?? '';
    if ($m === 'totp') return;
    if ($m === 'email' && !empty($u['email_verified_at'])) return;
    fail($m === 'email' ? 'security.errors.verifyEmailFirst' : 'security.errors.needTwofa');
}

function strict_on(array $u): bool
{
    return strict_allowed($u) && !empty($u['strict_session']) && $u['strict_session'] !== 'f';
}

function session_ttl_for(array $u): int
{
    return strict_on($u) ? SESSION_STRICT_S : SESSION_TTL_S;
}

/** What the signed-in player sees in Settings. */
function security_view(array $u): array
{
    return ['method' => $u['twofa_method'] ?? null, 'strict' => strict_on($u), 'strictAllowed' => strict_allowed($u),
        'since' => iso_to_ms($u['twofa_enabled_at'] ?? null), 'sessionHours' => intdiv(session_ttl_for($u), 3600)];
}

/** The method a sign-in must pass, or null. Strict mode always means the authenticator. */
function login_method(array $u): ?string
{
    // Strict sessions use the account's own two-step method (authenticator or verified email).
    if (strict_on($u)) return $u['twofa_method'] ?: 'totp';
    return $u['twofa_method'] ?? null;
}

// ───────────────────────── codes ─────────────────────────

function code_hash(string $id, string $code): string
{
    return hash_hmac('sha256', $code, $id);
}

function mask_mail(string $email): string
{
    return function_exists('mask_email') ? mask_email($email) : $email;
}

function send_code_mail(array $u, string $code, string $purpose): void
{
    $lang = function_exists('mail_lang') ? mail_lang() : 'en';
    $id = $lang === 'id';
    $subject = $id ? "Kode masuk Neon Arcade: $code" : "Your Neon Arcade code: $code";
    $title = $purpose === 'login' ? ($id ? 'Kode masuk kamu' : 'Your sign-in code') : ($id ? 'Kode keamanan kamu' : 'Your security code');
    $intro = $purpose === 'login'
        ? ($id ? "Halo @{$u['username']}, masukkan kode ini untuk menyelesaikan login." : "Hi @{$u['username']}, enter this code to finish signing in.")
        : ($id ? "Halo @{$u['username']}, masukkan kode ini di Pengaturan untuk mengonfirmasi perubahan keamanan." : "Hi @{$u['username']}, enter this code in Settings to confirm the security change.");
    $exp = $id ? 'Kode berlaku 10 menit dan hanya bisa dipakai sekali.' : 'The code works once and expires in 10 minutes.';
    $ign = $id ? 'Bukan kamu? Abaikan email ini dan ganti password kamu.' : 'Not you? Ignore this email and change your password.';
    $e = fn(string $s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
    $html = '<!doctype html><html><body style="margin:0;background:#f3f4f7;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">'
        . '<table role="presentation" width="100%" style="max-width:480px"><tr><td style="padding:0 4px 18px;font-size:17px;font-weight:800;color:#0b0d14">NEON<span style="color:#06b6d4">/</span>ARCADE</td></tr>'
        . '<tr><td style="background:#fff;border:1px solid #e4e7ee;border-radius:18px;padding:30px 28px">'
        . '<h1 style="margin:0;font-size:22px;color:#0b0d14">' . $e($title) . '</h1>'
        . '<p style="margin:12px 0 0;font-size:15px;line-height:1.6;color:#475569">' . $e($intro) . '</p>'
        . '<p style="margin:22px 0 0;font-family:Consolas,Menlo,monospace;font-size:34px;font-weight:800;letter-spacing:10px;color:#0b0d14;background:#f1f5f9;border-radius:12px;padding:16px;text-align:center">' . $e($code) . '</p>'
        . '<p style="margin:16px 0 0;font-size:13px;color:#64748b">' . $e($exp) . '</p>'
        . '<p style="margin:10px 0 0;font-size:13px;color:#64748b">' . $e($ign) . '</p>'
        . '</td></tr></table></td></tr></table></body></html>';
    $text = "NEON/ARCADE\n\n$title\n\n$intro\n\n$code\n\n$exp\n$ign";
    if (!mail_send((string) $u['email'], $subject, $html, $text)) fail('auth.errors.mailFailed', [], 502);
}

/** New email code for a purpose (60 s between codes, 5 per hour). Returns the code row id. */
function issue_email_code(array $u, string $purpose, ?string $id = null): string
{
    $last = qv('SELECT max(created_at) FROM auth_codes WHERE user_id = ? AND method = \'email\' AND purpose = ? AND code_hash IS NOT NULL AND id <> ?', [$u['id'], $purpose, $id ?? '']);
    $wait = $last ? 60 - (time() - strtotime((string) $last)) : 0;
    if ($wait > 0) fail('auth.errors.waitResend', ['seconds' => $wait], 429);
    if ((int) qv("SELECT count(*) FROM auth_codes WHERE user_id = ? AND method = 'email' AND created_at > now() - interval '1 hour'", [$u['id']]) >= 8) fail('auth.errors.tooManyEmails', ['minutes' => 60], 429);
    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    if ($id === null) {
        q("UPDATE auth_codes SET used_at = now() WHERE user_id = ? AND purpose = ? AND used_at IS NULL", [$u['id'], $purpose]);
        $id = hash('sha256', random_bytes(32));
        q("INSERT INTO auth_codes (id, user_id, purpose, method, code_hash, ip, expires_at) VALUES (?, ?, ?, 'email', ?, ?::inet, now() + make_interval(mins => ?))",
            [$id, $u['id'], $purpose, code_hash($id, $code), client_ip(), TWOFA_CODE_TTL_MIN]);
    } else {
        q("UPDATE auth_codes SET code_hash = ?, attempts = 0, created_at = now(), expires_at = now() + make_interval(mins => ?) WHERE id = ?", [code_hash($id, $code), TWOFA_CODE_TTL_MIN, $id]);
    }
    send_code_mail($u, $code, $purpose);
    return $id;
}

/** Check a code for the signed-in player's current method (settings confirmations). */
function confirm_code(array $u, string $method, string $code): void
{
    $code = clean_code($code);
    if ($method === 'totp') {
        $secret = sec_decrypt($u['totp_secret'] ?? null);
        $step = $secret ? totp_match($secret, $code, (int) ($u['totp_last_step'] ?? 0)) : null;
        if ($step === null) fail('security.errors.badCode');
        q('UPDATE users SET totp_last_step = ? WHERE id = ?', [$step, $u['id']]);
        return;
    }
    $row = q1("SELECT * FROM auth_codes WHERE user_id = ? AND purpose = 'confirm' AND method = 'email' AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1", [$u['id']]);
    if (!$row || $row['attempts'] >= 5 || !hash_equals($row['code_hash'], code_hash($row['id'], $code))) {
        if ($row) q('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
        db()->commit();
        db()->beginTransaction();
        fail('security.errors.badCode');
    }
    q('UPDATE auth_codes SET used_at = now() WHERE id = ?', [$row['id']]);
}

// ───────────────────────── sign-in challenge ─────────────────────────

/** Password was right and 2FA is on: open a ticket instead of a session. */
function login_challenge(array $u, string $method): array
{
    $ticket = rand_hex(32);
    $id = hash('sha256', $ticket);
    q("UPDATE auth_codes SET used_at = now() WHERE user_id = ? AND purpose = 'login' AND used_at IS NULL", [$u['id']]);
    q("INSERT INTO auth_codes (id, user_id, purpose, method, ip, expires_at) VALUES (?, ?, 'login', ?, ?::inet, now() + make_interval(mins => ?))",
        [$id, $u['id'], $method, client_ip(), TWOFA_CODE_TTL_MIN]);
    if ($method === 'email') issue_email_code($u, 'login', $id);
    log_event('LOGIN_2FA_REQUIRED', $u['id'], ['method' => $method]);
    return ['twofa' => ['ticket' => $ticket, 'method' => $method, 'email' => $method === 'email' ? mask_mail((string) $u['email']) : null, 'strict' => strict_on($u), 'expiresIn' => TWOFA_CODE_TTL_MIN * 60]];
}

function challenge_row(string $ticket): array
{
    if (!preg_match('/^[0-9a-f]{64}$/', $ticket)) fail('security.errors.expired');
    $row = q1("SELECT * FROM auth_codes WHERE id = ? AND purpose = 'login' AND used_at IS NULL AND expires_at > now()", [hash('sha256', $ticket)]);
    if (!$row) fail('security.errors.expired');
    return $row;
}

function api_login_2fa(): array
{
    $ticket = (string) arg('ticket', '');
    $code = clean_code(arg('code', ''));
    return tx(function () use ($ticket, $code) {
        $row = challenge_row($ticket);
        $u = q1('SELECT * FROM users WHERE id = ?', [$row['user_id']]);
        if (!$u) fail('security.errors.expired');
        if ((int) $row['attempts'] >= 5) {
            q('UPDATE auth_codes SET used_at = now() WHERE id = ?', [$row['id']]);
            fail('security.errors.tooMany');
        }
        $ok = false;
        if ($row['method'] === 'totp') {
            $secret = sec_decrypt($u['totp_secret'] ?? null);
            $step = $secret ? totp_match($secret, $code, (int) $u['totp_last_step']) : null;
            if ($step !== null) { $ok = true; q('UPDATE users SET totp_last_step = ? WHERE id = ?', [$step, $u['id']]); }
        } else {
            $ok = $row['code_hash'] && hash_equals($row['code_hash'], code_hash($row['id'], $code));
        }
        if (!$ok) {
            q('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
            log_event('LOGIN_2FA_FAILED', $u['id']);
            db()->commit();
            db()->beginTransaction();
            fail('security.errors.badCode', ['left' => max(0, 4 - (int) $row['attempts'])]);
        }
        $block = qv('SELECT account_block(?::uuid)', [$u['id']]);
        if ($block) fail($block, ban_vars($u), 403);
        q('UPDATE auth_codes SET used_at = now() WHERE id = ?', [$row['id']]);
        return login_finish($u);
    });
}

function api_login_2fa_resend(): array
{
    $ticket = (string) arg('ticket', '');
    return tx(function () use ($ticket) {
        $row = challenge_row($ticket);
        if ($row['method'] !== 'email') fail('security.errors.badMethod');
        $u = q1('SELECT * FROM users WHERE id = ?', [$row['user_id']]);
        issue_email_code($u, 'login', $row['id']);
        return ['ok' => true, 'resendIn' => 60];
    });
}

// ───────────────────────── settings ─────────────────────────

function require_password(array $u): void
{
    if (!password_verify((string) arg('password', ''), $u['password_hash'])) fail('errors.wrongPassword');
}

/** Start enabling a method: TOTP returns a fresh secret + otpauth URI; email sends a code. */
function api_2fa_setup(): array
{
    $u = current_user();
    $method = (string) arg('method', '');
    return tx(function () use ($u, $method) {
        if (!in_array($method, ['email', 'totp'], true)) fail('security.errors.badMethod');
        if (!empty($u['twofa_method'])) fail('security.errors.alreadyOn');
        if ($method === 'email') {
            if (empty($u['email_verified_at'])) fail('security.errors.verifyEmailFirst');
            issue_email_code($u, 'setup');
            return ['ok' => true, 'method' => 'email', 'email' => mask_mail((string) $u['email']), 'resendIn' => 60];
        }
        $secret = b32_encode(random_bytes(20));
        q('UPDATE users SET totp_pending = ? WHERE id = ?', [sec_encrypt($secret), $u['id']]);
        $label = rawurlencode(TWOFA_ISSUER . ':' . $u['username']);
        $uri = "otpauth://totp/$label?secret=$secret&issuer=" . rawurlencode(TWOFA_ISSUER) . '&algorithm=SHA1&digits=6&period=30';
        return ['ok' => true, 'method' => 'totp', 'secret' => $secret, 'uri' => $uri];
    });
}

function api_2fa_enable(): array
{
    $u = current_user();
    $method = (string) arg('method', '');
    $code = clean_code(arg('code', ''));
    return tx(function () use ($u, $method, $code) {
        require_password($u);
        if (!empty($u['twofa_method'])) fail('security.errors.alreadyOn');
        if ($method === 'totp') {
            $secret = sec_decrypt($u['totp_pending'] ?? null);
            if (!$secret) fail('security.errors.expired');
            $step = totp_match($secret, $code);
            if ($step === null) fail('security.errors.badCode');
            q("UPDATE users SET twofa_method = 'totp', totp_secret = ?, totp_pending = NULL, totp_last_step = ?, twofa_enabled_at = now() WHERE id = ?", [sec_encrypt($secret), $step, $u['id']]);
        } elseif ($method === 'email') {
            $row = q1("SELECT * FROM auth_codes WHERE user_id = ? AND purpose = 'setup' AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1", [$u['id']]);
            if (!$row || (int) $row['attempts'] >= 5 || !hash_equals($row['code_hash'], code_hash($row['id'], $code))) {
                if ($row) q('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = ?', [$row['id']]);
                db()->commit();
                db()->beginTransaction();
                fail('security.errors.badCode');
            }
            q('UPDATE auth_codes SET used_at = now() WHERE id = ?', [$row['id']]);
            q("UPDATE users SET twofa_method = 'email', twofa_enabled_at = now() WHERE id = ?", [$u['id']]);
        } else fail('security.errors.badMethod');
        // Other devices sign in again with the new step.
        q('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [$u['id'], $u['session_id']]);
        log_event('TWOFA_ENABLED', $u['id'], ['method' => $method]);
        notify($u['id'], 'security', ['event' => 'twofaOn']);
        return ['ok' => true, 'security' => security_view(q1('SELECT * FROM users WHERE id = ?', [$u['id']]))];
    });
}

/** Email code for confirming a change when the method is email. */
function api_2fa_send(): array
{
    $u = current_user();
    return tx(function () use ($u) {
        if (($u['twofa_method'] ?? '') !== 'email') fail('security.errors.badMethod');
        issue_email_code($u, 'confirm');
        return ['ok' => true, 'email' => mask_mail((string) $u['email']), 'resendIn' => 60];
    });
}

function api_2fa_disable(): array
{
    $u = current_user();
    $code = (string) arg('code', '');
    return tx(function () use ($u, $code) {
        require_password($u);
        if (empty($u['twofa_method'])) return ['ok' => true, 'security' => security_view($u)];
        confirm_code($u, (string) $u['twofa_method'], $code);
        q("UPDATE users SET twofa_method = NULL, totp_secret = NULL, totp_pending = NULL, strict_session = FALSE, twofa_enabled_at = NULL WHERE id = ?", [$u['id']]);
        log_event('TWOFA_DISABLED', $u['id']);
        notify($u['id'], 'security', ['event' => 'twofaOff']);
        return ['ok' => true, 'security' => security_view(q1('SELECT * FROM users WHERE id = ?', [$u['id']]))];
    });
}

/** Owners/Admins: 3-hour sessions + authenticator on every sign-in. Needs the authenticator to turn on or off. */
function api_strict_session(): array
{
    $u = current_user();
    $on = (bool) arg('on', false);
    $code = (string) arg('code', '');
    return tx(function () use ($u, $on, $code) {
        if (!strict_allowed($u)) fail('admin.errors.forbidden', [], 403);
        strict_method_ok($u);
        confirm_code($u, $u['twofa_method'], $code);
        q('UPDATE users SET strict_session = ? WHERE id = ?', [$on, $u['id']]);
        if ($on) q("UPDATE sessions SET expires_at = LEAST(expires_at, now() + make_interval(secs => ?)) WHERE user_id = ?", [SESSION_STRICT_S, $u['id']]);
        log_event($on ? 'STRICT_SESSION_ON' : 'STRICT_SESSION_OFF', $u['id']);
        notify($u['id'], 'security', ['event' => $on ? 'strictOn' : 'strictOff']);
        return ['ok' => true, 'security' => security_view(q1('SELECT * FROM users WHERE id = ?', [$u['id']]))];
    });
}

/** Console recovery: lost phone, locked-out Owner, or approving strict mode from the server side. */
function security_admin_set(array $t, string $what, bool $on): array
{
    if ($what === 'twofa') {
        if ($on) fail('security.errors.badMethod');
        q("UPDATE users SET twofa_method = NULL, totp_secret = NULL, totp_pending = NULL, strict_session = FALSE, twofa_enabled_at = NULL WHERE id = ?", [$t['id']]);
        q('DELETE FROM sessions WHERE user_id = ?', [$t['id']]);
    } else {
        if (!strict_allowed($t)) fail('security.errors.strictRole');
        if ($on) strict_method_ok($t);
        q('UPDATE users SET strict_session = ? WHERE id = ?', [$on, $t['id']]);
        if ($on) q("UPDATE sessions SET expires_at = LEAST(expires_at, now() + make_interval(secs => ?)) WHERE user_id = ?", [SESSION_STRICT_S, $t['id']]);
    }
    log_event('SECURITY_CONSOLE', $t['id'], ['what' => $what, 'on' => $on]);
    return security_view(q1('SELECT * FROM users WHERE id = ?', [$t['id']]));
}
