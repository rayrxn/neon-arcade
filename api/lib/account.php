<?php
declare(strict_types=1);

/** Password reset (from the sign-in page) and email verification (from Settings), both by emailed link. */

const RESET_TTL_MIN = 30;
const VERIFY_TTL_H = 24;

function token_new(): array
{
    $raw = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    return [$raw, hash('sha256', $raw)];
}

function mail_lang(): string
{
    return arg('lang', 'en') === 'id' ? 'id' : 'en';
}

function mask_email(string $email): string
{
    [$name, $domain] = array_pad(explode('@', $email, 2), 2, '');
    $keep = mb_substr($name, 0, min(2, max(1, mb_strlen($name) - 1)));
    return $keep . str_repeat('•', max(1, min(6, mb_strlen($name) - mb_strlen($keep)))) . '@' . $domain;
}

/** Find a live token (unused, not expired). */
function token_find(string $raw, string $kind): ?array
{
    if (!preg_match('/^[A-Za-z0-9_-]{40,60}$/', $raw)) return null;
    return q1("SELECT t.*, u.username, u.email AS current_email, u.status FROM email_tokens t JOIN users u ON u.id = t.user_id
               WHERE t.token_hash = ? AND t.kind = ? AND t.used_at IS NULL AND t.expires_at > now()", [hash('sha256', $raw), $kind]) ?: null;
}

/** Always answers ok so the form can't be used to find out which emails have an account. */
function api_forgot(): array
{
    $email = normalize_email(arg('email', ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) fail('validation.emailFormat');
    $ip = client_ip();
    return tx(function () use ($email, $ip) {
        if ((int) qv("SELECT count(*) FROM email_tokens WHERE ip = ?::inet AND kind = 'reset' AND created_at > now() - interval '1 hour'", [$ip]) >= 10) fail('auth.errors.tooManyEmails', ['minutes' => 60], 429);
        $u = q1('SELECT id, username, email, status FROM users WHERE email = ?', [$email]);
        if ($u && $u['status'] !== 'deleted') {
            $recent = (int) qv("SELECT count(*) FROM email_tokens WHERE user_id = ? AND kind = 'reset' AND created_at > now() - interval '15 minutes'", [$u['id']]);
            if ($recent < 3) {
                q("UPDATE email_tokens SET used_at = now() WHERE user_id = ? AND kind = 'reset' AND used_at IS NULL", [$u['id']]);
                [$raw, $hash] = token_new();
                q("INSERT INTO email_tokens (user_id, kind, token_hash, email, ip, expires_at) VALUES (?, 'reset', ?, ?, ?::inet, now() + make_interval(mins => ?))",
                    [$u['id'], $hash, $u['email'], $ip, RESET_TTL_MIN]);
                $m = mail_render('reset', mail_lang(), ['user' => $u['username'], 'email' => $u['email'], 'url' => site_url() . '/#/reset-password?token=' . $raw]);
                mail_send($u['email'], $m['subject'], $m['html'], $m['text']);
                log_event('PASSWORD_RESET_REQUESTED', $u['id']);
            }
        }
        return ['ok' => true, 'ttlMinutes' => RESET_TTL_MIN];
    });
}

function api_reset_check(): array
{
    $t = token_find((string) arg('token', ''), 'reset');
    if (!$t) fail('auth.errors.linkInvalid');
    return ['ok' => true, 'email' => mask_email((string) $t['current_email']), 'username' => $t['username'], 'expiresAt' => iso_to_ms($t['expires_at'])];
}

function api_reset_password(): array
{
    $raw = (string) arg('token', '');
    $password = (string) arg('password', '');
    if (strlen($password) < 8 || strlen($password) > 200) fail('validation.passwordLength');
    return tx(function () use ($raw, $password) {
        $t = token_find($raw, 'reset');
        if (!$t) fail('auth.errors.linkInvalid');
        q('SELECT id FROM email_tokens WHERE id = ? FOR UPDATE', [$t['id']]);
        q('UPDATE email_tokens SET used_at = now() WHERE id = ?', [$t['id']]);
        // The link went to the inbox, so the address is proven too.
        q('UPDATE users SET password_hash = ?, must_change_password = FALSE, email_verified_at = COALESCE(email_verified_at, now()) WHERE id = ?',
            [password_hash($password, PASSWORD_ARGON2ID), $t['user_id']]);
        q('DELETE FROM sessions WHERE user_id = ?', [$t['user_id']]);
        q('DELETE FROM login_attempts WHERE email = ? AND NOT ok', [$t['current_email']]);
        log_event('PASSWORD_RESET', $t['user_id']);
        notify($t['user_id'], 'security', ['event' => 'passwordReset']);
        return ['ok' => true, 'username' => $t['username']];
    });
}

function api_verify_send(): array
{
    $u = current_user();
    if (!empty($u['email_verified_at'])) fail('auth.errors.alreadyVerified');
    return tx(function () use ($u) {
        $last = qv("SELECT max(created_at) FROM email_tokens WHERE user_id = ? AND kind = 'verify'", [$u['id']]);
        $wait = $last ? 60 - (time() - strtotime((string) $last)) : 0;
        if ($wait > 0) fail('auth.errors.waitResend', ['seconds' => $wait], 429);
        if ((int) qv("SELECT count(*) FROM email_tokens WHERE user_id = ? AND kind = 'verify' AND created_at > now() - interval '1 hour'", [$u['id']]) >= 5) fail('auth.errors.tooManyEmails', ['minutes' => 60], 429);
        q("UPDATE email_tokens SET used_at = now() WHERE user_id = ? AND kind = 'verify' AND used_at IS NULL", [$u['id']]);
        [$raw, $hash] = token_new();
        q("INSERT INTO email_tokens (user_id, kind, token_hash, email, ip, expires_at) VALUES (?, 'verify', ?, ?, ?::inet, now() + make_interval(hours => ?))",
            [$u['id'], $hash, $u['email'], client_ip(), VERIFY_TTL_H]);
        $m = mail_render('verify', mail_lang(), ['user' => $u['username'], 'email' => $u['email'], 'url' => site_url() . '/#/verify-email?token=' . $raw]);
        $sent = mail_send($u['email'], $m['subject'], $m['html'], $m['text']);
        if (!$sent) fail('auth.errors.mailFailed', [], 502);
        log_event('EMAIL_VERIFY_SENT', $u['id']);
        return ['ok' => true, 'email' => mask_email((string) $u['email']), 'resendIn' => 60];
    });
}

function api_verify_email(): array
{
    $raw = (string) arg('token', '');
    return tx(function () use ($raw) {
        $t = token_find($raw, 'verify');
        if (!$t) fail('auth.errors.linkInvalid');
        // The account's email changed after the link was sent: the old link no longer proves anything.
        if (strtolower((string) $t['email']) !== strtolower((string) $t['current_email'])) fail('auth.errors.linkInvalid');
        q('UPDATE email_tokens SET used_at = now() WHERE id = ?', [$t['id']]);
        q('UPDATE users SET email_verified_at = now() WHERE id = ?', [$t['user_id']]);
        log_event('EMAIL_VERIFIED', $t['user_id']);
        return ['ok' => true, 'username' => $t['username']];
    });
}
