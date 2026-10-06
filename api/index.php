<?php
// Neon Arcade API — router. Semua respons JSON: { ok: true, data } atau { ok: false, error: { code, vars } }.
declare(strict_types=1);

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/rng.php';
require __DIR__ . '/lib/progression.php';
require __DIR__ . '/lib/state.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/games.php';

/** Jalankan aksi yang mengubah progres user dalam satu transaksi, lalu kirim snapshot state. */
function with_user(callable $fn, bool $lightWhenOpen = false): array
{
    $u = current_user();
    return tx(function () use ($u, $fn, $lightWhenOpen) {
        [$p, $meta] = load_docs($u['id']);
        $c = new Ctx($u, $p, $meta, now_ms());
        $result = $fn($c);
        // Langkah di tengah ronde (tick Crash, buka petak Mines, hit Blackjack) tidak mengubah
        // saldo/progres → jawaban ringan tanpa snapshot lengkap.
        if ($lightWhenOpen && is_array($result) && ($result['done'] ?? null) === false) {
            return ['result' => $result, 'state' => ['serverTime' => now_ms()]];
        }
        save_docs($u['id'], $c->p, $c->meta);
        return ['result' => $result, 'state' => state_view($u['id'], $c->p, $c->meta)];
    });
}

function route(string $method, string $path): array
{
    if ($method === 'GET' && $path === 'health') {
        return ['status' => 'ok', 'db' => (bool) qv('SELECT 1'), 'serverTime' => now_ms(), 'version' => 1];
    }
    if ($method === 'GET' && $path === 'me') return api_me();

    if ($method !== 'POST') fail('errors.notFound', [], 404);
    switch ($path) {
        case 'auth/register': return api_register();
        case 'auth/login': return api_login();
        case 'auth/logout': return api_logout();
        case 'auth/password': return api_password();
        case 'profile': return api_profile();

        case 'daily/claim':
            return with_user(fn(Ctx $c) => claim_daily_reward($c->user['id'], $c->p, $c->meta, $c->now));
        case 'quest/claim':
            return with_user(fn(Ctx $c) => claim_quest($c->user['id'], $c->p, $c->meta, (string) arg('scope', ''), (string) arg('id', ''), $c->now));
        case 'metric':
            // Hanya metrik yang belum dihitung server (chat masih di browser, profil sekali saja).
            $metric = (string) arg('metric', '');
            if (!in_array($metric, ['chat', 'profile'], true)) fail('play.errors.invalid');
            if ($metric === 'profile') {
                // Quest profil hanya kalau profil benar-benar lengkap (dicek di server).
                $u = current_user();
                $profile = jdec((string) qv('SELECT profile FROM user_docs WHERE user_id = ?', [$u['id']]), []);
                $avatar = jdec($u['avatar'] ?? null, []);
                $complete = $u['display_name'] !== $u['username'] && (!empty($profile['avatarSet']) || ($avatar['kind'] ?? '') === 'image')
                    && !empty($profile['equipped']['title']) && !empty($profile['frame']);
                if (!$complete) fail('rewards.errors.notDone');
            }
            return with_user(fn(Ctx $c) => track_metric($c->user['id'], $c->p, $c->meta, $metric, 1, $c->now));

        case 'fairness/rotate':
            $u = current_user();
            return tx(function () use ($u) {
                if (qv("SELECT 1 FROM game_sessions WHERE user_id = ? AND status = 'OPEN'", [$u['id']])) fail('play.errors.roundOpen');
                $next = trim(mb_substr((string) arg('clientSeed', ''), 0, 64));
                $cur = q1('SELECT id, client_seed FROM fairness_seeds WHERE user_id = ? AND revealed_at IS NULL FOR UPDATE', [$u['id']]);
                if ($cur) q('UPDATE fairness_seeds SET revealed_at = now() WHERE id = ?', [$cur['id']]);
                $seed = rand_hex(32);
                q('INSERT INTO fairness_seeds (user_id, server_seed, server_seed_hash, client_seed) VALUES (?, ?, ?, ?)',
                    [$u['id'], $seed, hash('sha256', $seed), $next !== '' ? $next : ($cur['client_seed'] ?? rand_hex(10))]);
                return fairness_view($u['id']);
            });
    }

    if (str_starts_with($path, 'game/')) {
        $action = substr($path, 5);
        $fn = GAME_ACTIONS[$action] ?? null;
        if (!$fn) fail('errors.notFound', [], 404);
        $light = in_array($action, ['crash-tick', 'mines-reveal', 'blackjack-action'], true);
        return with_user(fn(Ctx $c) => $fn($c, body()), $light);
    }
    fail('errors.notFound', [], 404);
}

function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo jenc($payload);
}

function main(): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = trim(preg_replace('#^.*?/api/?#', '', $uri), '/');
    if ($path === '' || $path === 'index.php') $path = (string) ($_GET['r'] ?? 'health');
    try {
        // CSRF: request yang mengubah data wajib membawa header khusus (form lintas situs tidak bisa).
        if ($method === 'POST' && ($_SERVER['HTTP_X_NEON'] ?? '') !== '1') fail('errors.generic', [], 403);
        respond(200, ['ok' => true, 'data' => route($method, $path)]);
    } catch (ApiError $e) {
        respond($e->status, ['ok' => false, 'error' => ['code' => $e->getMessage(), 'vars' => (object) $e->vars]]);
    } catch (Throwable $e) {
        $mapped = map_db_error($e);
        if ($mapped instanceof ApiError) {
            respond(400, ['ok' => false, 'error' => ['code' => $mapped->getMessage(), 'vars' => new stdClass()]]);
            return;
        }
        try {
            q('INSERT INTO error_log (context, code, message, stack) VALUES (?, ?, ?, ?)', ['api:' . $path, get_class($e), substr($e->getMessage(), 0, 2000), substr($e->getTraceAsString(), 0, 4000)]);
        } catch (Throwable $ignored) {
        }
        respond(500, ['ok' => false, 'error' => ['code' => 'errors.generic', 'vars' => new stdClass()]]);
    }
}

if (PHP_SAPI !== 'cli' || !empty($GLOBALS['NEON_RUN_MAIN'])) main();
