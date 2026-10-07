<?php
// Neon Arcade API — router. Semua respons JSON: { ok: true, data } atau { ok: false, error: { code, vars } }.
declare(strict_types=1);

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/rng.php';
require __DIR__ . '/lib/progression.php';
require __DIR__ . '/lib/state.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/games.php';
require __DIR__ . '/lib/platform.php';
require __DIR__ . '/lib/admin.php';
require __DIR__ . '/lib/platform2.php';
require __DIR__ . '/lib/admin2.php';
require __DIR__ . '/lib/platform3.php';
require __DIR__ . '/lib/mail.php';
require __DIR__ . '/lib/account.php';

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
    $GLOBALS['NEON_PATH'] = $path;
    if ($method === 'GET' && $path === 'health') {
        return ['status' => 'ok', 'db' => (bool) qv('SELECT 1'), 'serverTime' => now_ms(), 'version' => 1];
    }
    if ($method === 'GET' && $path === 'me') return api_me();
    if ($method === 'GET' && $path === 'sync') {
        $u = current_user();
        return tx(fn() => sync_view($u));
    }
    if ($method === 'GET' && $path === 'crash/state') {
        $u = current_user(false);
        return tx(fn() => crash_state($u));
    }
    if ($method === 'GET' && $path === 'stats/pnl') {
        $u = current_user();
        return tx(fn() => pnl_stats($u, (int) ($_GET['days'] ?? 7)));
    }
    if ($method === 'GET' && $path === 'admin/snapshot') {
        $u = current_user();
        return tx(fn() => admin_snapshot($u));
    }

    if ($method !== 'POST') fail('errors.notFound', [], 404);
    switch ($path) {
        case 'auth/register': return api_register();
        case 'auth/login': return api_login();
        case 'auth/logout': return api_logout();
        case 'auth/password': return api_password();
        case 'auth/forgot': return api_forgot();
        case 'auth/reset/check': return api_reset_check();
        case 'auth/reset': return api_reset_password();
        case 'auth/verify/send': return api_verify_send();
        case 'auth/verify': return api_verify_email();
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

        case 'client-error':
            // Laporan error UI dari browser (tanpa login pun boleh), dibatasi ukuran & frekuensi per IP.
            $u = current_user(false);
            $ip = client_ip();
            if ((int) qv("SELECT count(*) FROM error_log WHERE context LIKE 'client:%' AND at > now() - interval '10 minutes' AND code = ?", [(string) $ip]) >= 20) return ['ok' => true];
            $msg = mb_substr((string) arg('message', ''), 0, 1000);
            $detail = jenc(['path' => mb_substr((string) arg('path', ''), 0, 200), 'componentStack' => mb_substr((string) arg('componentStack', ''), 0, 2000), 'stack' => mb_substr((string) arg('stack', ''), 0, 2000), 'ua' => mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 200)]);
            q('INSERT INTO error_log (context, code, message, stack, user_id) VALUES (?, ?, ?, ?, ?)', ['client:' . mb_substr((string) arg('where', 'root'), 0, 50), (string) $ip, $msg ?: '(kosong)', $detail, $u['id'] ?? null]);
            return ['ok' => true];

        // ── Tahap 2: aksi yang mengubah saldo/progres → { result, state } ──
        case 'transfer':
            return with_user(fn(Ctx $c) => transfer_send($c->user, body()));
        case 'redeem/check': {
            $u = current_user();
            return ['result' => tx(fn() => redeem_resolve($u, arg('code', '')))];
        }
        case 'redeem/claim': {
            $u = current_user();
            return tx(function () use ($u) {
                [$p, $meta, $profile] = load_docs($u['id']);
                $info = redeem_claim($u, $meta, $profile, arg('code', ''));
                save_docs($u['id'], $p, $meta, $profile);
                return ['result' => $info, 'state' => state_view($u['id'], $p, $meta), 'user' => me_payload($u['id'], $p, $meta)['user']];
            });
        }
        case 'chat/send': {
            $u = current_user();
            // Moderation first: a blocked message is logged (and may auto-mute) even though the send fails.
            $raw = trim((string) preg_replace('/\s+/u', ' ', (string) arg('text', '')));
            $muted = ($u['muted_until'] ?? null) === 'infinity' || (!empty($u['muted_until']) && strtotime($u['muted_until']) > time());
            $verdict = $muted || $raw === '' || mb_strlen($raw) > 200 ? ['action' => 'allow', 'text' => $raw, 'matched' => []] : mod_check($raw);
            if (in_array($verdict['action'], ['block', 'spam'], true)) {
                $muted = mod_strike($u, $verdict, $raw);
                if ($muted) fail('chat.errors.autoMuted', ['minutes' => $muted]);
                fail($verdict['action'] === 'spam' ? ($verdict['reason'] === 'caps' ? 'chat.errors.caps' : 'chat.errors.spam') : 'chat.errors.blocked');
            }
            return tx(function () use ($u, $verdict) {
                [$p, $meta, $profile] = load_docs($u['id']);
                $res = chat_send($u, $p, $meta, $profile, $verdict['text'], $verdict, (string) arg('room', 'global'));
                save_docs($u['id'], $p, $meta, $profile);
                return ['result' => $res, 'state' => state_view($u['id'], $p, $meta)];
            });
        }

        // ── Platform v2: economy, loyalty, shop, emotes, missions, memberships → { result, state } ──
        case 'convert':
        case 'loyalty/unlock':
        case 'shop/buy':
        case 'shop/use':
        case 'shop/equip':
        case 'emotes/favorite':
        case 'missions/claim':
        case 'membership/request':
        case 'perk/claim':
        case 'profile/affix':
        case 'profile/banner':
        case 'pass/buy':
        case 'pass/claim':
        case 'manager/contact': {
            $u = current_user();
            return tx(function () use ($u, $path) {
                $res = match ($path) {
                    'convert' => convert_ac_to_ag($u, arg('amount', 0), request_id(arg('requestId', ''))),
                    'loyalty/unlock' => loyalty_unlock($u),
                    'shop/buy' => shop_buy($u, (string) arg('itemId', ''), request_id(arg('requestId', ''))),
                    'shop/use' => shop_use($u, (string) arg('itemId', '')),
                    'shop/equip' => shop_equip($u, (string) arg('slot', ''), ($i = arg('itemId', null)) === null ? null : (string) $i),
                    'emotes/favorite' => emote_favorite($u, (string) arg('code', ''), (bool) arg('on', true)),
                    'missions/claim' => mission_claim($u, (string) arg('missionId', ''), arg('proof', '')),
                    'membership/request' => membership_request($u, (string) arg('tier', '')),
                    'perk/claim' => perk_claim($u, (string) arg('kind', ''), arg('tier', null) ? (string) arg('tier') : null),
                    'profile/affix' => set_name_affix($u, arg('prefix', null), arg('suffix', null)),
                    'profile/banner' => banner_upload($u, arg('image', null)),
                    'pass/buy' => pass_buy($u),
                    'pass/claim' => pass_claim($u, (string) arg('track', 'all'), (int) arg('tier', 0)),
                    'manager/contact' => member_contact_manager($u, arg('text', '')),
                };
                [$p, $meta] = load_docs($u['id']);
                $fresh = q1('SELECT * FROM users WHERE id = ?', [$u['id']]);
                $profile = jdec((string) qv('SELECT profile FROM user_docs WHERE user_id = ?', [$u['id']]), []);
                return ['result' => $res, 'state' => state_view($u['id'], $p, $meta), 'user' => user_view($fresh, $profile)];
            });
        }

        // ── Tahap 2: aksi sosial → { result } (frontend lalu memanggil /sync) ──
        case 'chat/hide': $u = current_user(); return ['result' => tx(fn() => chat_hide($u, (string) arg('messageId', '')))];
        case 'friends/request': $u = current_user(); return ['result' => tx(fn() => friend_request($u, arg('username', '')))];
        case 'friends/accept': $u = current_user(); return ['result' => tx(fn() => friend_accept($u, (string) arg('id', '')))];
        case 'friends/decline': $u = current_user(); return ['result' => tx(fn() => friend_decline($u, (string) arg('id', '')))];
        case 'friends/remove': $u = current_user(); return ['result' => tx(fn() => friend_remove($u, (string) arg('friendId', '')))];
        case 'block': $u = current_user(); return ['result' => tx(fn() => user_block($u, (string) arg('userId', ''), (bool) arg('on', true)))];
        case 'favorite': $u = current_user(); return ['result' => tx(fn() => favorite_toggle($u, (string) arg('slug', '')))];
        case 'notifications': $u = current_user(); return ['result' => tx(fn() => notif_action($u, (string) arg('action', ''), arg('id')))];
        case 'report': $u = current_user(); return ['result' => tx(fn() => report_create($u, body()))];
        case 'ticket/create': $u = current_user(); return ['result' => tx(fn() => ticket_create($u, body()))];
        case 'ticket/reply': $u = current_user(); return ['result' => tx(fn() => ticket_reply($u, (string) arg('ticketId', ''), arg('text', '')))];
        case 'ticket/reopen': $u = current_user(); return ['result' => tx(fn() => ticket_reopen($u, (string) arg('ticketId', '')))];
        case 'admin/action': {
            $u = current_user();
            $name = (string) arg('name', '');
            $args = is_array(arg('args')) ? arg('args') : [];
            return ['result' => tx(fn() => admin_action($u, $name, $args))];
        }

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
        $cur = (string) (body()['currency'] ?? 'AC');
        if (!in_array($cur, ['AC', 'AG'], true)) fail('play.errors.invalid');
        // Cases are priced in AC.
        if (str_starts_with($action, 'case-')) $cur = 'AC';
        return with_user(function (Ctx $c) use ($fn, $cur) {
            $c->currency = $cur;
            return $fn($c, body());
        }, $light);
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
    // Banner images are served as files, not JSON.
    if ($method === 'GET' && preg_match('#^banner/([0-9a-f-]{36})$#', $path, $bm)) {
        try { banner_serve($bm[1]); } catch (Throwable $e) { http_response_code(500); }
        return;
    }
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
