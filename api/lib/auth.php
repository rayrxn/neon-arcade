<?php
// Login, registrasi, sesi (cookie httpOnly), profil.
declare(strict_types=1);

const SESSION_COOKIE = 'na_session';
const SESSION_TTL_S = 7 * 86400;
const USERNAME_RE = '/^[A-Za-z0-9_]{3,16}$/';

function set_session_cookie(string $token, int $ttl): void
{
    if (PHP_SAPI === 'cli') { $GLOBALS['NEON_COOKIE'] = $token; return; }
    setcookie(SESSION_COOKIE, $token, [
        'expires' => $ttl > 0 ? time() + $ttl : time() - 3600,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function session_token(): ?string
{
    $t = PHP_SAPI === 'cli' ? ($GLOBALS['NEON_COOKIE'] ?? null) : ($_COOKIE[SESSION_COOKIE] ?? null);
    return is_string($t) && preg_match('/^[0-9a-f]{64}$/', $t) ? $t : null;
}

function client_ip(): ?string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? null;
    return $ip && filter_var($ip, FILTER_VALIDATE_IP) ? $ip : null;
}

function create_session(string $userId): void
{
    $token = rand_hex(32);
    q('INSERT INTO sessions (user_id, token_hash, csrf_token, expires_at, ip, user_agent) VALUES (?, ?, ?, now() + make_interval(secs => ?), ?::inet, ?)',
        [$userId, hash('sha256', $token), rand_hex(16), SESSION_TTL_S, client_ip(), substr($_SERVER['HTTP_USER_AGENT'] ?? 'cli', 0, 300)]);
    set_session_cookie($token, SESSION_TTL_S);
}

/** User yang sedang login (atau null). Sesi diperpanjang selama dipakai. */
function current_user(bool $required = true): ?array
{
    $cache = $GLOBALS['NEON_USER'] ?? false;
    if ($cache !== false) {
        if (!$cache && $required) fail('errors.sessionExpired', [], 401);
        return $cache ?: null;
    }
    $token = session_token();
    $u = null;
    if ($token) {
        $u = q1('SELECT u.*, s.id AS session_id, s.expires_at AS session_expires FROM sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = ? AND s.expires_at > now()', [hash('sha256', $token)]);
        if ($u && strtotime($u['session_expires']) - time() < SESSION_TTL_S - 3600) {
            q('UPDATE sessions SET expires_at = now() + make_interval(secs => ?) WHERE id = ?', [SESSION_TTL_S, $u['session_id']]);
            set_session_cookie($token, SESSION_TTL_S);
        }
    }
    if ($u) {
        $block = qv('SELECT account_block(?::uuid)', [$u['id']]);
        if ($block) {
            q('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
            set_session_cookie('', -1);
            $GLOBALS['NEON_USER'] = null;
            fail($block, ban_vars($u), 403);
        }
    }
    if ($u) touch_presence($u);
    $GLOBALS['NEON_USER'] = $u ?: null;
    // Akun yang wajib ganti password hanya boleh membaca data diri, ganti password, atau logout.
    if ($u && !empty($u['must_change_password']) && $u['must_change_password'] !== 'f'
        && !in_array($GLOBALS['NEON_PATH'] ?? '', ['me', 'sync', 'auth/password', 'auth/logout', 'client-error'], true)) {
        fail('errors.mustChangePassword', [], 403);
    }
    if (!$u && $required) fail('errors.sessionExpired', [], 401);
    return $u;
}

/** Details shown on the banned screen (reason, until, when, issued by). */
function ban_vars(array $u): array
{
    $until = iso_to_ms($u['ban_until'] ?? null);
    return [
        'reason' => $u['ban_reason'] ?? '—', 'until' => $until, 'permanent' => $until === null,
        'at' => iso_to_ms($u['banned_at'] ?? null), 'by' => !empty($u['banned_by']) ? username_of($u['banned_by']) : null,
    ];
}

function normalize_email($email): string
{
    return strtolower(trim((string) $email));
}

function api_register(): array
{
    $username = trim((string) arg('username', ''));
    $email = normalize_email(arg('email', ''));
    $password = (string) arg('password', '');
    if (!preg_match(USERNAME_RE, $username)) fail('validation.usernameFormat');
    captcha_require_tx();
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 120) fail('validation.emailFormat');
    if (strlen($password) < 8 || strlen($password) > 200) fail('validation.passwordLength');
    $hash = password_hash($password, PASSWORD_ARGON2ID);
    return tx(function () use ($username, $email, $hash) {
        $id = (string) qv('SELECT api_register(?, ?, ?)', [$username, $email, $hash]);
        q('UPDATE users SET avatar = ?::jsonb, last_login_at = now() WHERE id = ?', [jenc(['kind' => 'preset', 'id' => preset_for($username)]), $id]);
        create_session($id);
        [$p, $meta] = load_docs($id);
        $out = mark_login($id, $p, $meta, now_ms());
        save_docs($id, $p, $meta);
        return me_payload($id, $p, $meta) + ['out' => $out];
    });
}

function api_login(): array
{
    // Login boleh pakai email atau username.
    $email = normalize_email(arg('email', ''));
    $password = (string) arg('password', '');
    captcha_require_tx();
    return tx(function () use ($email, $password) {
        if (!str_contains($email, '@')) {
            $byName = qv('SELECT email FROM users WHERE username = ?', [$email]);
            if ($byName) $email = (string) $byName;
        }
        if (!qv('SELECT api_login_allowed(?)', [$email])) {
            $first = qv("SELECT min(at) FROM (SELECT at FROM login_attempts WHERE email = ? AND NOT ok AND at > now() - interval '15 minutes' ORDER BY at DESC LIMIT 5) x", [$email]);
            $minutes = max(1, (int) ceil((strtotime((string) $first) + 900 - time()) / 60));
            fail('errors.tooManyAttempts', ['minutes' => $minutes], 429);
        }
        $u = q1('SELECT * FROM users WHERE email = ?', [$email]);
        $ok = $u && password_verify($password, $u['password_hash']);
        if (!$ok) {
            q('INSERT INTO login_attempts (email, ok, ip) VALUES (?, false, ?::inet)', [$email, client_ip()]);
            $fails = (int) qv("SELECT count(*) FROM login_attempts WHERE email = ? AND NOT ok AND at > now() - interval '15 minutes'", [$email]);
            log_event('LOGIN_FAILED', $u['id'] ?? null);
            // Simpan percobaan gagal walau request berakhir error.
            db()->commit();
            db()->beginTransaction();
            fail($fails >= 5 ? 'errors.tooManyAttempts' : 'errors.wrongCredentials', ['minutes' => 15], 401);
        }
        $block = qv('SELECT account_block(?::uuid)', [$u['id']]);
        if ($block) fail($block, ban_vars($u), 403);
        if (password_needs_rehash($u['password_hash'], PASSWORD_ARGON2ID)) {
            q('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_ARGON2ID), $u['id']]);
        }
        q('INSERT INTO login_attempts (email, ok, ip) VALUES (?, true, ?::inet)', [$email, client_ip()]);
        q('UPDATE users SET last_login_at = now() WHERE id = ?', [$u['id']]);
        create_session($u['id']);
        log_event('USER_LOGIN', $u['id']);
        [$p, $meta] = load_docs($u['id']);
        $out = mark_login($u['id'], $p, $meta, now_ms());
        save_docs($u['id'], $p, $meta);
        return me_payload($u['id'], $p, $meta) + ['out' => $out];
    });
}

function api_logout(): array
{
    $token = session_token();
    if ($token) q('DELETE FROM sessions WHERE token_hash = ?', [hash('sha256', $token)]);
    set_session_cookie('', -1);
    return ['ok' => true];
}

function me_payload(string $userId, array $p, array $meta): array
{
    $u = q1('SELECT * FROM users WHERE id = ?', [$userId]);
    $profile = jdec((string) qv('SELECT profile FROM user_docs WHERE user_id = ?', [$userId]), []);
    return ['user' => user_view($u, $profile)] + state_view($userId, $p, $meta);
}

function api_me(): array
{
    $u = current_user(false);
    if (!$u) return ['user' => null, 'serverTime' => now_ms()];
    return tx(function () use ($u) {
        settle_transfers();
        [$p, $meta] = load_docs($u['id']);
        $out = mark_login($u['id'], $p, $meta, now_ms());
        save_docs($u['id'], $p, $meta);
        return me_payload($u['id'], $p, $meta) + ['out' => $out];
    });
}

function api_profile(): array
{
    $u = current_user();
    return tx(function () use ($u) {
        [$p, $meta, $profile] = load_docs($u['id']);
        $sets = [];
        $vals = [];
        $patch = body();
        if (array_key_exists('displayName', $patch)) {
            $dn = trim((string) $patch['displayName']);
            if (mb_strlen($dn) < 2 || mb_strlen($dn) > 24) fail('errors.displayNameLength');
            $sets[] = 'display_name = ?';
            $vals[] = $dn;
        }
        if (array_key_exists('username', $patch) && trim((string) $patch['username']) !== $u['username']) {
            $name = trim((string) $patch['username']);
            if (!preg_match(USERNAME_RE, $name)) fail('validation.usernameFormat');
            if (qv('SELECT 1 FROM users WHERE username = ? AND id <> ?', [$name, $u['id']])) fail('errors.usernameTaken');
            $sets[] = 'username = ?';
            $vals[] = $name;
        }
        if (array_key_exists('avatar', $patch)) {
            $av = $patch['avatar'];
            $itemPreset = ['aurora' => 'avatar-aurora', 'ember' => 'avatar-ember'];
            $okPreset = is_array($av) && ($av['kind'] ?? '') === 'preset' && (in_array($av['id'] ?? '', AVATAR_PRESETS, true)
                || (isset($itemPreset[$av['id'] ?? '']) && in_array($itemPreset[$av['id']], $meta['inventory'], true)));
            $okItem = is_array($av) && ($av['kind'] ?? '') === 'item' && in_array($av['id'] ?? '', $meta['inventory'], true);
            $okImage = is_array($av) && ($av['kind'] ?? '') === 'image' && is_string($av['src'] ?? null)
                && preg_match('#^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$#', $av['src']) && strlen($av['src']) <= 400000;
            if (!$okPreset && !$okItem && !$okImage) fail('errors.invalidInput');
            $sets[] = 'avatar = ?::jsonb';
            $vals[] = jenc($av);
            $profile['avatarSet'] = true;
        }
        if (array_key_exists('frame', $patch)) {
            $f = $patch['frame'];
            if ($f !== null && !in_array($f, $meta['inventory'], true)) fail('errors.invalidInput');
            $profile['frame'] = $f;
        }
        if (array_key_exists('equipped', $patch) && is_array($patch['equipped'])) {
            $eq = [];
            $owned = fn($id) => is_string($id) && (in_array($id, $meta['inventory'], true) || in_array($id, FREE_ITEMS, true));
            foreach ($patch['equipped'] as $slot => $item) {
                if (!in_array($slot, ['avatar', 'title', 'chatBadge', 'banner', 'badges'], true) || $item === null) continue;
                if ($slot === 'badges') {
                    if (!is_array($item) || count($item) > 3) fail('errors.invalidInput');
                    foreach ($item as $b) if (!$owned($b)) fail('errors.invalidInput');
                    $eq['badges'] = array_values(array_unique($item));
                    continue;
                }
                if (!$owned($item)) fail('errors.invalidInput');
                $eq[$slot] = $item;
            }
            $profile['equipped'] = $eq;
        }
        if ($sets) {
            $vals[] = $u['id'];
            q('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?', $vals);
        }
        save_docs($u['id'], $p, $meta, $profile);
        return me_payload($u['id'], $p, $meta);
    });
}

const FREE_ITEMS = ['title-rookie', 'emote-gg', 'emote-wave'];

function api_password(): array
{
    $u = current_user();
    $current = (string) arg('current', '');
    $next = (string) arg('next', '');
    if (!password_verify($current, $u['password_hash'])) fail('errors.wrongPassword');
    if (strlen($next) < 8 || strlen($next) > 200) fail('validation.passwordLength');
    return tx(function () use ($u, $next) {
        q('UPDATE users SET password_hash = ?, must_change_password = FALSE WHERE id = ?', [password_hash($next, PASSWORD_ARGON2ID), $u['id']]);
        // Keluarkan perangkat lain, pertahankan sesi ini.
        q('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [$u['id'], $u['session_id']]);
        log_event('PASSWORD_CHANGED', $u['id']);
        return ['ok' => true];
    });
}
