<?php
declare(strict_types=1);

/**
 * Core v2: game controls, emergency shutdown, session termination, extended maintenance, security review,
 * ticket workflow, targeted announcements, feature flags, economy analytics, anti-bot captcha.
 * admin_v3_action() runs before admin_v2_action(); it returns null for names it does not handle.
 */

// ───────────────────────────── Feature flags ─────────────────────────────

/** Features that can be switched OFF / TESTER / VIP / PUBLIC. Missing rows mean PUBLIC. */
const FEATURE_KEYS = [
    'chat' => 'Global chat', 'transfers' => 'AG transfers', 'shop' => 'Shop', 'cases' => 'Case opening', 'battles' => 'Case battles',
    'pass' => 'Battle pass', 'exchange' => 'Exchange', 'crash' => 'Crash', 'leaderboard' => 'Leaderboards', 'football' => 'Football predictions',
    'chess' => 'Chess PvP', 'racing' => 'Racing PvP', 'horse' => 'Horse racing', 'arcade' => 'Skill arcades', 'tarot' => 'Tarot',
];

function feature_states(): array
{
    if (!isset($GLOBALS['NEON_FEATURES'])) {
        $GLOBALS['NEON_FEATURES'] = q('SELECT key, state FROM feature_flags')->fetchAll(PDO::FETCH_KEY_PAIR);
    }
    return $GLOBALS['NEON_FEATURES'];
}

function feature_allowed(?array $u, string $key): bool
{
    $state = feature_states()[$key] ?? 'public';
    if ($state === 'public') return true;
    if (!$u) return false;
    if (in_array($u['role'], ['super_admin', 'admin'], true)) return true; // admins can always check a feature
    if ($state === 'tester') return in_array($u['role'], ['developer', 'super_admin', 'admin'], true);
    if ($state === 'vip') return (bool) member_tier($u['id']) || is_staff_role($u['role']);
    return false;
}

function require_feature(?array $u, string $key): void
{
    if (!feature_allowed($u, $key)) fail('errors.featureOff', ['feature' => FEATURE_KEYS[$key] ?? $key], 400);
}

/** POST routes guarded by a feature flag. Cash-out / tick stay open so running rounds can always finish. */
const FEATURE_ROUTES = [
    'chat/send' => 'chat', 'transfer' => 'transfers', 'shop/buy' => 'shop', 'shop/use' => 'shop', 'convert' => 'exchange',
    'pass/buy' => 'pass', 'pass/claim' => 'pass', 'game/case-open' => 'cases', 'game/case-battle' => 'battles',
    'game/crash-start' => 'crash', 'game/crash-bet' => 'crash', 'game/horse-bet' => 'horse',
];

function route_feature_guard(string $path): void
{
    if (isset(FEATURE_ROUTES[$path])) require_feature(current_user(), FEATURE_ROUTES[$path]);
}

/** What the current player may use (+ the raw state for staff). */
function features_view(?array $u): array
{
    $states = feature_states();
    $out = [];
    foreach (FEATURE_KEYS as $k => $label) {
        $out[$k] = ['on' => feature_allowed($u, $k), 'state' => $u && is_staff_role($u['role']) ? ($states[$k] ?? 'public') : null, 'label' => $label];
    }
    return $out;
}

// ───────────────────────────── Announcements ─────────────────────────────

const ANNOUNCE_TARGETS = ['all', 'here', 'vip', 'vvip', 'members', 'tester', 'moderator', 'staff'];

/** SQL for the users an announcement reaches. */
function announce_audience(string $target): array
{
    $member = "EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = u.id AND m.active AND (m.ends_at IS NULL OR m.ends_at > now())%s)";
    return match ($target) {
        'here' => ["u.last_seen_at > now() - (? * interval '1 millisecond')", [ONLINE_WINDOW_MS]],
        'vip' => [sprintf($member, " AND m.tier = 'vip'"), []],
        'vvip' => [sprintf($member, " AND m.tier = 'vvip'"), []],
        'members' => [sprintf($member, ''), []],
        'tester' => ["u.role = 'developer'", []],
        'moderator' => ["u.role = 'moderator'", []],
        'staff' => ["u.role IN ('super_admin', 'admin', 'moderator', 'support', 'developer')", []],
        default => ['TRUE', []],
    };
}

function announce_reaches(array $me, string $target): bool
{
    if (is_staff_role($me['role']) && has_perm($me, 'announcements.manage')) return true;
    $tier = member_tier($me['id']);
    return match ($target) {
        'all', 'here' => true,
        'vip' => $tier === 'vip',
        'vvip' => $tier === 'vvip',
        'members' => (bool) $tier,
        'tester' => $me['role'] === 'developer',
        'moderator' => $me['role'] === 'moderator',
        'staff' => is_staff_role($me['role']),
        default => false,
    };
}

/** Send due announcements once (called on every sync; cheap when nothing is due). */
function deliver_announcements(): int
{
    $due = q("SELECT * FROM announcements WHERE active AND delivered_at IS NULL AND start_at <= now() AND (end_at IS NULL OR end_at > now()) ORDER BY start_at LIMIT 5 FOR UPDATE SKIP LOCKED")->fetchAll();
    $n = 0;
    foreach ($due as $a) {
        [$where, $params] = announce_audience((string) ($a['target'] ?? 'all'));
        $data = jenc(['title' => $a['title'], 'message' => mb_substr((string) $a['message'], 0, 1000), 'priority' => $a['priority'] ?? 'normal', 'sound' => (bool) ($a['sound'] ?? true), 'target' => $a['target'] ?? 'all', 'announcementId' => $a['id']]);
        $st = q("INSERT INTO notifications (user_id, kind, data) SELECT u.id, 'announcement', ?::jsonb FROM users u WHERE u.status <> 'banned' AND $where", array_merge([$data], $params));
        q('UPDATE announcements SET delivered_at = now() WHERE id = ?', [$a['id']]);
        $n += $st->rowCount();
    }
    return $n;
}

function save_announcement_v3(array $me, array $a): array
{
    require_user_perm($me, 'announcements.manage');
    $r = adm_reason($a['reason'] ?? '');
    $d = is_array($a['data'] ?? null) ? $a['data'] : [];
    $title = trim((string) ($d['title'] ?? ''));
    $msg = trim((string) ($d['message'] ?? ''));
    if (mb_strlen($title) < 3 || mb_strlen($msg) < 3) fail('admin.errors.announcement');
    $type = in_array($d['type'] ?? '', ['info', 'event', 'update', 'maintenance'], true) ? $d['type'] : 'info';
    $target = in_array($d['target'] ?? '', ANNOUNCE_TARGETS, true) ? $d['target'] : 'all';
    $priority = in_array($d['priority'] ?? '', ['low', 'normal', 'high', 'urgent'], true) ? $d['priority'] : 'normal';
    $sound = !array_key_exists('sound', $d) || !empty($d['sound']);
    $toIso = fn($v) => !empty($v) ? (is_numeric($v) ? date('c', (int) ($v / 1000)) : date('c', strtotime((string) $v))) : null;
    $start = $toIso($d['startAt'] ?? null) ?? date('c');
    $end = $toIso($d['endAt'] ?? null);
    if ($end && strtotime($end) <= strtotime($start)) fail('admin.errors.invalid');
    // No end date → shown for 3 days, so a forgotten banner does not stay forever.
    if (!$end) $end = date('c', strtotime($start) + 3 * 86400);
    $active = !empty($d['active']);
    $isNew = empty($d['id']) || !qv('SELECT 1 FROM announcements WHERE id::text = ?', [(string) $d['id']]);
    $vals = [mb_substr($title, 0, 80), mb_substr($msg, 0, 1000), $type, $start, $end, $active, $target, $priority, $sound];
    if ($isNew) {
        $id = (string) qv('INSERT INTO announcements (title, message, type, start_at, end_at, active, target, priority, sound, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id', array_merge($vals, [$me['id']]));
    } else {
        $id = (string) $d['id'];
        // Editing an announcement that was not delivered yet keeps it scheduled; a resend must be explicit.
        q('UPDATE announcements SET title = ?, message = ?, type = ?, start_at = ?, end_at = ?, active = ?, target = ?, priority = ?, sound = ?, delivered_at = CASE WHEN ? THEN NULL ELSE delivered_at END WHERE id = ?',
            array_merge($vals, [!empty($d['resend']), $id]));
    }
    $sent = deliver_announcements();
    audit_log($me, $isNew ? 'announcement.create' : 'announcement.update', null, mb_substr($title, 0, 80), $id, null, ['active' => $active, 'type' => $type, 'target' => $target, 'priority' => $priority, 'startAt' => $start, 'delivered' => $sent], $r);
    return announcement_view(q1('SELECT * FROM announcements WHERE id = ?', [$id]));
}

// ───────────────────────────── Sessions ─────────────────────────────

/** Cancel an open round and give the stake back (idempotent per session). */
function end_game_session(array $gs, string $why): bool
{
    if ($gs['status'] !== 'OPEN') return false;
    if (!empty($gs['bet_tx_id']) && empty($gs['is_test']) && $gs['is_test'] !== true) {
        wallet_post($gs['user_id'], $gs['currency'] ?? 'AC', (float) $gs['bet'], 'refund', 'refund', 'game', $why, $gs['id'], 'refund:' . $gs['id']);
    }
    q("UPDATE game_sessions SET status = 'CANCELLED', finished_at = now(), detail = detail || ?::jsonb WHERE id = ? AND status = 'OPEN'", [jenc(['cancelled' => $why]), $gs['id']]);
    notify($gs['user_id'], 'security', ['event' => 'roundCancelled', 'game' => $gs['game'], 'amount' => num($gs['bet']), 'currency' => $gs['currency'] ?? 'AC', 'reason' => $why]);
    log_event('GAME_CANCELLED', $gs['user_id'], ['session' => $gs['id'], 'game' => $gs['game'], 'reason' => $why]);
    return true;
}

function end_open_sessions(?string $game, string $why): int
{
    $rows = $game
        ? q("SELECT * FROM game_sessions WHERE status = 'OPEN' AND game = ? FOR UPDATE", [$game])->fetchAll()
        : q("SELECT * FROM game_sessions WHERE status = 'OPEN' FOR UPDATE")->fetchAll();
    $n = 0;
    foreach ($rows as $gs) if (end_game_session($gs, $why)) $n++;
    return $n;
}

// ───────────────────────────── Economy analytics ─────────────────────────────

function economy_analytics(): array
{
    $bal = q("SELECT count(*) AS n, coalesce(sum(ac_balance), 0) AS ac, coalesce(sum(ag_balance), 0) AS ag,
                     coalesce(avg(ac_balance), 0) AS ac_avg, coalesce(avg(ag_balance), 0) AS ag_avg,
                     coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY ac_balance), 0) AS ac_med,
                     coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY ag_balance), 0) AS ag_med
              FROM wallets w JOIN users u ON u.id = w.user_id WHERE NOT u.is_test")->fetch();
    $flows = [];
    foreach (q("SELECT t.currency, t.category::text AS category, sum(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) AS gen, sum(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END) AS spent, count(*) AS n
                FROM wallet_transactions t WHERE t.created_at > now() - interval '7 days' GROUP BY 1, 2 ORDER BY 1, 2")->fetchAll() as $f) {
        $flows[] = ['currency' => $f['currency'], 'category' => $f['category'], 'generated' => num($f['gen']), 'spent' => num($f['spent']), 'count' => (int) $f['n']];
    }
    $top = array_map(fn($r) => ['userId' => $r['user_id'], 'username' => $r['username'], 'ac' => num($r['ac_balance']), 'ag' => num($r['ag_balance'])],
        q('SELECT w.user_id, u.username, w.ac_balance, w.ag_balance FROM wallets w JOIN users u ON u.id = w.user_id WHERE NOT u.is_test ORDER BY w.ag_balance DESC, w.ac_balance DESC LIMIT 10')->fetchAll());
    $buckets = [];
    foreach (q("SELECT CASE WHEN ag_balance < 100 THEN '<100' WHEN ag_balance < 1000 THEN '100-1K' WHEN ag_balance < 10000 THEN '1K-10K' WHEN ag_balance < 100000 THEN '10K-100K' ELSE '100K+' END AS b, count(*) AS n
                FROM wallets w JOIN users u ON u.id = w.user_id WHERE NOT u.is_test GROUP BY 1")->fetchAll() as $b) $buckets[$b['b']] = (int) $b['n'];
    $games = array_map(fn($g) => ['game' => $g['game'], 'currency' => $g['currency'], 'rounds' => (int) $g['n'], 'wagered' => num($g['bet']), 'paid' => num($g['paid']),
        'rtp' => (float) $g['bet'] > 0 ? round((float) $g['paid'] / (float) $g['bet'] * 100, 2) : null],
        q("SELECT game, currency, count(*) AS n, sum(bet) AS bet, sum(payout) AS paid FROM game_sessions WHERE NOT is_test AND status <> 'OPEN' AND started_at > now() - interval '7 days' GROUP BY 1, 2 ORDER BY 4 DESC")->fetchAll());
    // Safeguards: FLAG (automatic) → REVIEW (staff) → ACTION (manual). Nothing here changes balances.
    $alerts = [];
    foreach ($games as $g) if ($g['rtp'] !== null && $g['rounds'] >= 200 && $g['rtp'] > 105) $alerts[] = ['level' => 'high', 'code' => 'rtp', 'game' => $g['game'], 'currency' => $g['currency'], 'value' => $g['rtp']];
    foreach (q("SELECT t.user_id, u.username, t.currency, sum(t.amount) AS gain FROM wallet_transactions t JOIN users u ON u.id = t.user_id
                WHERE t.created_at > now() - interval '24 hours' AND NOT u.is_test AND t.category NOT IN ('admin', 'transfer') GROUP BY 1, 2, 3
                HAVING (t.currency = 'AG' AND sum(t.amount) > 50000) OR (t.currency = 'AC' AND sum(t.amount) > 500000000) ORDER BY 4 DESC LIMIT 20")->fetchAll() as $x) {
        $alerts[] = ['level' => 'medium', 'code' => 'fastGain', 'userId' => $x['user_id'], 'username' => $x['username'], 'currency' => $x['currency'], 'value' => num($x['gain'])];
    }
    return [
        'players' => (int) $bal['n'],
        'circulation' => ['AC' => num($bal['ac']), 'AG' => num($bal['ag'])],
        'average' => ['AC' => round((float) $bal['ac_avg'], 2), 'AG' => round((float) $bal['ag_avg'], 2)],
        'median' => ['AC' => round((float) $bal['ac_med'], 2), 'AG' => round((float) $bal['ag_med'], 2)],
        'flows7d' => $flows, 'top' => $top, 'distributionAG' => (object) $buckets, 'games7d' => $games, 'alerts' => $alerts,
        'at' => now_ms(),
    ];
}

// ───────────────────────────── Anti-bot captcha ─────────────────────────────

function captcha_cfg(): array
{
    $c = config()['captcha'] ?? [];
    $k = kv_get('captcha'); // set from Admin → Settings; overrides neon-config when present
    $mode = $GLOBALS['NEON_CAPTCHA_MODE'] ?? ($k['mode'] ?? ($c['mode'] ?? 'auto'));
    $secret = (string) (($k['secret'] ?? '') !== '' ? $k['secret'] : ($c['turnstile_secret'] ?? ''));
    $site = (string) (($k['site'] ?? '') !== '' ? $k['site'] : ($c['turnstile_site'] ?? ''));
    if ($mode === 'auto') $mode = $secret !== '' && $site !== '' ? 'turnstile' : 'pow';
    return ['mode' => $mode, 'site' => $site, 'secret' => $secret, 'bits' => (int) ($c['pow_bits'] ?? 16)];
}

function captcha_key(): string
{
    $c = config();
    return hash('sha256', 'neon-captcha|' . ($c['app_secret'] ?? ($c['db']['pass'] ?? '') . '|' . ($c['db']['name'] ?? '')));
}

/** Public: what the browser has to solve. */
function captcha_challenge(): array
{
    $cfg = captcha_cfg();
    if ($cfg['mode'] === 'off') return ['mode' => 'off'];
    if ($cfg['mode'] === 'turnstile') return ['mode' => 'turnstile', 'siteKey' => $cfg['site']];
    $payload = rtrim(strtr(base64_encode(jenc(['n' => rand_hex(12), 'b' => $cfg['bits'], 'e' => time() + 300])), '+/', '-_'), '=');
    return ['mode' => 'pow', 'challenge' => $payload . '.' . hash_hmac('sha256', $payload, captcha_key()), 'bits' => $cfg['bits']];
}

function leading_zero_bits(string $bin): int
{
    $bits = 0;
    foreach (str_split($bin) as $ch) {
        $o = ord($ch);
        if ($o === 0) { $bits += 8; continue; }
        while (($o & 0x80) === 0) { $bits++; $o <<= 1; }
        break;
    }
    return $bits;
}

/** Throws auth.errors.captcha when the request did not pass the challenge. */
function captcha_require(): void
{
    $cfg = captcha_cfg();
    if ($cfg['mode'] === 'off') return;
    $c = arg('captcha');
    if (!is_array($c)) fail('auth.errors.captcha', [], 400);
    if ($cfg['mode'] === 'turnstile') {
        $token = (string) ($c['token'] ?? '');
        if ($token === '' || strlen($token) > 2048) fail('auth.errors.captcha');
        $ctx = stream_context_create(['http' => ['method' => 'POST', 'timeout' => 6, 'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => http_build_query(['secret' => $cfg['secret'], 'response' => $token, 'remoteip' => client_ip() ?? ''])]]);
        $res = @file_get_contents('https://challenges.cloudflare.com/turnstile/v0/siteverify', false, $ctx);
        $ok = $res !== false && !empty(json_decode($res, true)['success']);
        if (!$ok) fail('auth.errors.captcha');
        return;
    }
    $challenge = (string) ($c['challenge'] ?? '');
    $solution = (string) ($c['solution'] ?? '');
    [$payload, $sig] = array_pad(explode('.', $challenge, 2), 2, '');
    if ($payload === '' || !hash_equals(hash_hmac('sha256', $payload, captcha_key()), $sig) || !preg_match('/^[0-9a-z]{1,16}$/', $solution)) fail('auth.errors.captcha');
    $p = json_decode((string) base64_decode(strtr($payload, '-_', '+/')), true);
    if (!is_array($p) || ($p['e'] ?? 0) < time()) fail('auth.errors.captchaExpired');
    if (leading_zero_bits(hash('sha256', $challenge . ':' . $solution, true)) < (int) $p['b']) fail('auth.errors.captcha');
    // One use per challenge.
    $used = q('INSERT INTO captcha_used (nonce) VALUES (?) ON CONFLICT DO NOTHING', [(string) $p['n']])->rowCount();
    if (!$used) fail('auth.errors.captchaExpired');
    if (random_int(1, 50) === 1) q("DELETE FROM captcha_used WHERE at < now() - interval '1 hour'");
}

/** captcha_require() in its own transaction (auth endpoints run outside tx()). */
function captcha_require_tx(): void
{
    if (captcha_cfg()['mode'] === 'off') return;
    tx(fn() => captcha_require());
}

// ───────────────────────────── Crash curve ─────────────────────────────

/** Presets: max multiplier, house edge and tail (how quickly very high multipliers become rarer above ×100). */
const CRASH_PRESETS = [
    'standard' => ['maxMult' => 10000, 'edge' => 0.01, 'tail' => 0.92],
    'calm' => ['maxMult' => 1000, 'edge' => 0.01, 'tail' => 0.8],
    'wild' => ['maxMult' => 10000, 'edge' => 0.01, 'tail' => 1.0],
];

function crash_cfg(): array
{
    $c = kv_get('crash');
    return ['preset' => (string) $c['preset'], 'maxMult' => max(2, min(10000, (float) $c['maxMult'])), 'edge' => max(0, min(0.1, (float) $c['edge'])), 'tail' => max(0.5, min(1, (float) $c['tail']))];
}

/** Crash point from a uniform float, using the admin curve. Fair base (1-edge)/(1-f), then above ×100 the excess is
 *  compressed by `tail` (1.0 = pure fair curve), then capped at maxMult. Runs only on the server. */
function crash_point_cfg(float $f, ?array $c = null): float
{
    $c ??= crash_cfg();
    $p = crash_point($f, $c['edge']);
    if ($p > 100 && $c['tail'] < 1) $p = floor(100 * pow($p / 100, $c['tail']) * 100) / 100;
    return min($c['maxMult'], $p);
}

/** P(point >= x) under the current curve — shown to admins so the effect of a change is visible. */
function crash_odds(float $x, ?array $c = null): float
{
    $c ??= crash_cfg();
    if ($x > $c['maxMult']) return 0.0;
    $base = $x <= 100 || $c['tail'] >= 1 ? $x : 100 * pow($x / 100, 1 / $c['tail']);
    return min(1, (1 - $c['edge']) / $base);
}

function crash_view(): array
{
    $c = crash_cfg();
    $odds = [];
    foreach ([2, 10, 100, 1000, 10000] as $x) $odds[(string) $x] = $x > $c['maxMult'] ? 0 : round(crash_odds($x, $c), 8);
    $sched = kv_get('crash_sched')['rounds'] ?? [];
    ksort($sched);
    $cur = (int) qv('SELECT COALESCE(max(id), 0) FROM crash_rounds');
    return $c + ['presets' => CRASH_PRESETS, 'odds' => $odds, 'currentRound' => $cur, 'scheduled' => array_map(fn($k, $v) => ['round' => (int) $k, 'point' => (float) $v], array_keys($sched), $sched)];
}

// ───────────────────────────── QA center ─────────────────────────────

/** Real health checks against the live database (read-only). */
function qa_run(): array
{
    $checks = [];
    $add = function (string $id, string $group, bool $ok, $detail = null, string $level = 'error') use (&$checks) {
        $checks[] = ['id' => $id, 'group' => $group, 'status' => $ok ? 'pass' : $level, 'detail' => $detail];
    };
    $t0 = microtime(true);
    $add('db.connect', 'database', (bool) qv('SELECT 1'), round((microtime(true) - $t0) * 1000, 1) . ' ms');
    $tables = ['users', 'wallets', 'wallet_transactions', 'game_sessions', 'games', 'cheat_flags', 'support_tickets', 'announcements', 'feature_flags', 'console_audit', 'captcha_used'];
    $missing = array_values(array_filter($tables, fn($t) => !qv('SELECT to_regclass(?)', ['public.' . $t])));
    $add('db.tables', 'database', !$missing, $missing ? 'missing: ' . implode(', ', $missing) : count($tables) . ' tables');
    foreach (['game_start', 'raise_flag', 'flag_policy', 'maintenance_blocks', 'game_blocked', 'wallet_post'] as $fn) {
        $add("db.fn.$fn", 'database', (bool) qv('SELECT 1 FROM pg_proc WHERE proname = ?', [$fn]), null);
    }
    // Ledger: the last successful transaction per wallet must match the stored balance.
    $bad = q("WITH lastat AS (SELECT user_id, currency, max(created_at) AS m FROM wallet_transactions WHERE status = 'success' GROUP BY 1, 2)
              SELECT count(*) FROM lastat l JOIN wallets w ON w.user_id = l.user_id
              WHERE NOT EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.user_id = l.user_id AND t.currency = l.currency AND t.status = 'success' AND t.created_at = l.m
                                AND t.balance_after = CASE WHEN l.currency = 'AC' THEN w.ac_balance ELSE w.ag_balance END)")->fetchColumn();
    $add('economy.ledger', 'economy', (int) $bad === 0, (int) $bad . ' mismatched wallets', 'warn');
    $neg = (int) qv('SELECT count(*) FROM wallets WHERE ac_balance < 0 OR ag_balance < 0');
    $add('economy.negative', 'economy', $neg === 0, "$neg negative balances");
    $dupe = (int) qv("SELECT count(*) FROM (SELECT user_id, idempotency_key FROM wallet_transactions GROUP BY 1, 2 HAVING count(*) > 1) x");
    $add('economy.doubleReward', 'economy', $dupe === 0, "$dupe duplicated reward keys");
    $stale = (int) qv("SELECT count(*) FROM game_sessions WHERE status = 'OPEN' AND started_at < now() - interval '6 hours'");
    $add('games.staleRounds', 'games', $stale === 0, "$stale open rounds older than 6 h", 'warn');
    $badCfg = (int) qv('SELECT count(*) FROM games WHERE max_bet < 10 OR max_bet_ag < 1');
    $add('games.config', 'games', $badCfg === 0, "$badCfg games with an invalid max bet");
    $off = q("SELECT slug FROM games WHERE status <> 'live' OR NOT betting_enabled OR NOT new_sessions")->fetchAll(PDO::FETCH_COLUMN);
    $add('games.paused', 'games', !$off, $off ? implode(', ', $off) : 'all live', 'info');
    $m = q1('SELECT maintenance_enabled, maintenance_until FROM system_settings WHERE id = 1');
    $add('system.maintenance', 'system', !$m['maintenance_enabled'], $m['maintenance_enabled'] ? 'maintenance is ON' : 'off', 'info');
    $err = (int) qv("SELECT count(*) FROM error_log WHERE at > now() - interval '1 hour'");
    $add('system.errors1h', 'system', $err < 20, "$err errors in the last hour", 'warn');
    $cap = captcha_cfg();
    $add('security.captcha', 'security', $cap['mode'] !== 'off', $cap['mode'], 'warn');
    $crit = (int) qv("SELECT count(*) FROM cheat_flags WHERE severity = 'critical' AND status IN ('open', 'escalated')");
    $add('security.critical', 'security', $crit === 0, "$crit open critical events", 'warn');
    $mail = config()['mail'] ?? [];
    $add('mail.config', 'system', !empty($mail['host']) || !empty($mail['from']) || getenv('NEON_MAIL_LOG'), !empty($mail['host']) ? 'SMTP' : 'PHP mail()', 'warn');
    $console = !empty(config()['console']['key_hash']);
    $add('console.key', 'security', $console, $console ? 'configured' : 'not configured (console disabled)', 'info');
    $sum = ['pass' => 0, 'info' => 0, 'warn' => 0, 'error' => 0];
    foreach ($checks as $c) $sum[$c['status']]++;
    return ['checks' => $checks, 'summary' => $sum, 'at' => now_ms(), 'ms' => round((microtime(true) - $t0) * 1000)];
}

// ───────────────────────────── Admin actions ─────────────────────────────

function admin_v3_view(array $me): array
{
    $out = ['features' => features_view($me), 'crash' => crash_view(), 'luck' => luck_admin_view(), 'captcha' => captcha_admin_view()];
    if (has_perm($me, 'economy.manage')) $out['economy'] = economy_analytics();
    if (has_perm($me, 'errors.view') || has_perm($me, 'system.manage')) {
        $out['errorSummary'] = array_map(fn($r) => ['context' => $r['context'], 'code' => $r['code'], 'count' => (int) $r['n'], 'last' => iso_to_ms($r['last'])],
            q("SELECT split_part(context, ':', 1) || ':' || split_part(context, ':', 2) AS context, code, count(*) AS n, max(at) AS last FROM error_log WHERE at > now() - interval '24 hours' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 30")->fetchAll());
    }
    if (has_perm($me, 'sessions.terminate')) {
        $out['openSessions'] = array_map(fn($s) => ['id' => $s['id'], 'userId' => $s['user_id'], 'username' => $s['username'], 'game' => $s['game'], 'bet' => num($s['bet']), 'currency' => $s['currency'], 'startedAt' => iso_to_ms($s['started_at'])],
            q("SELECT s.id, s.user_id, u.username, s.game, s.bet, s.currency, s.started_at FROM game_sessions s JOIN users u ON u.id = s.user_id WHERE s.status = 'OPEN' ORDER BY s.started_at LIMIT 200")->fetchAll());
    }
    return $out;
}

function admin_v3_action(array $me, string $name, array $a)
{
    switch ($name) {
        case 'setGameControls': {
            require_user_perm($me, 'games.manage');
            $r = adm_reason($a['reason'] ?? '');
            $slug = (string) ($a['slug'] ?? '');
            $g = q1('SELECT * FROM games WHERE slug = ? FOR UPDATE', [$slug]);
            if (!$g) fail('admin.errors.invalid');
            $p = is_array($a['patch'] ?? null) ? $a['patch'] : [];
            $set = [];
            $vals = [];
            if (isset($p['status'])) {
                if (!in_array($p['status'], ['live', 'maintenance', 'disabled'], true)) fail('admin.errors.invalid');
                $set[] = 'status = ?'; $vals[] = $p['status'];
            }
            foreach (['bettingEnabled' => 'betting_enabled', 'newSessions' => 'new_sessions'] as $k => $col) {
                if (array_key_exists($k, $p)) { $set[] = "$col = ?"; $vals[] = (bool) $p[$k]; }
            }
            if (array_key_exists('maxBet', $p)) {
                $v = (int) $p['maxBet'];
                if ($v < 10 || $v > 2000000000) fail('admin.errors.invalid');
                $set[] = 'max_bet = ?'; $vals[] = $v;
            }
            if (array_key_exists('maxBetAG', $p)) {
                $v = (int) $p['maxBetAG'];
                if ($v < 1 || $v > 10000000) fail('admin.errors.invalid');
                $set[] = 'max_bet_ag = ?'; $vals[] = $v;
            }
            if (array_key_exists('maintenanceMessage', $p)) { $set[] = 'maintenance_message = ?'; $vals[] = mb_substr(trim((string) $p['maintenanceMessage']), 0, 300) ?: null; }
            $toIso = fn($v) => !empty($v) ? (is_numeric($v) ? date('c', (int) ($v / 1000)) : date('c', strtotime((string) $v))) : null;
            if (array_key_exists('maintenanceFrom', $p)) { $set[] = 'maintenance_from = ?'; $vals[] = $toIso($p['maintenanceFrom']); }
            if (array_key_exists('maintenanceUntil', $p)) { $set[] = 'maintenance_until = ?'; $vals[] = $toIso($p['maintenanceUntil']); }
            if (!$set) fail('admin.errors.invalid');
            q('UPDATE games SET ' . implode(', ', $set) . ', updated_at = now() WHERE slug = ?', array_merge($vals, [$slug]));
            $GLOBALS['NEON_GAMES_DIRTY'] = true;
            $ended = !empty($a['forceEnd']) ? end_open_sessions($slug, 'admin') : 0;
            audit_log($me, 'game.controls', null, $slug, $slug,
                ['status' => $g['status'], 'betting' => (bool) $g['betting_enabled'], 'newSessions' => (bool) $g['new_sessions'], 'maxBet' => (int) $g['max_bet'], 'maxBetAG' => (int) $g['max_bet_ag']],
                $p + ['ended' => $ended], $r);
            return ['ok' => true, 'ended' => $ended];
        }
        case 'endGameSessions': {
            require_user_perm($me, 'sessions.terminate');
            $r = adm_reason($a['reason'] ?? '');
            $slug = isset($a['slug']) && $a['slug'] !== '' ? (string) $a['slug'] : null;
            if ($slug !== null && !qv('SELECT 1 FROM games WHERE slug = ?', [$slug])) fail('admin.errors.invalid');
            $n = end_open_sessions($slug, 'admin');
            audit_log($me, 'sessions.endAll', null, $slug ?? 'all', $slug, null, ['ended' => $n], $r);
            return ['ok' => true, 'ended' => $n];
        }
        case 'endSession': {
            require_user_perm($me, 'sessions.terminate');
            $r = adm_reason($a['reason'] ?? '');
            $sid = (string) ($a['sessionId'] ?? '');
            $gs = preg_match('/^[0-9a-f-]{36}$/', $sid) ? q1('SELECT * FROM game_sessions WHERE id = ? FOR UPDATE', [$sid]) : null;
            if (!$gs || $gs['status'] !== 'OPEN') fail('admin.errors.noSession');
            end_game_session($gs, 'admin');
            audit_log($me, 'session.end', $gs['user_id'], null, $sid, 'OPEN', 'CANCELLED', $r);
            return ['ok' => true];
        }
        case 'terminateUserSessions': {
            // Emergency: sign a player out everywhere (login sessions) and cancel their open rounds.
            require_user_perm($me, 'sessions.terminate');
            $r = adm_reason($a['reason'] ?? '');
            $t = adm_target($me, $a['userId'] ?? null);
            $logins = q('DELETE FROM sessions WHERE user_id = ?', [$t['id']])->rowCount();
            $rounds = 0;
            foreach (q("SELECT * FROM game_sessions WHERE user_id = ? AND status = 'OPEN' FOR UPDATE", [$t['id']])->fetchAll() as $gs) if (end_game_session($gs, 'admin')) $rounds++;
            audit_log($me, 'sessions.terminate', $t['id'], null, null, null, ['logins' => $logins, 'rounds' => $rounds], $r);
            chat_mod_notice('kick', $t['id'], $me, $r);
            return ['ok' => true, 'logins' => $logins, 'rounds' => $rounds];
        }
        case 'emergencyShutdown': {
            require_user_perm($me, 'system.manage');
            $r = adm_reason($a['reason'] ?? '');
            if (($a['confirm'] ?? '') !== 'SHUTDOWN') fail('admin.errors.confirm');
            $on = !array_key_exists('enabled', $a) || !empty($a['enabled']);
            if ($on) {
                q("UPDATE system_settings SET maintenance_enabled = TRUE, maintenance_starts_at = NULL, maintenance_until = NULL, maintenance_message = ? WHERE id = 1",
                    [mb_substr(trim((string) ($a['message'] ?? '')), 0, 300) ?: 'Emergency maintenance']);
                q("UPDATE games SET new_sessions = FALSE, updated_at = now()");
                $ended = end_open_sessions(null, 'emergency');
            } else {
                q('UPDATE system_settings SET maintenance_enabled = FALSE WHERE id = 1');
                q('UPDATE games SET new_sessions = TRUE, updated_at = now()');
                $ended = 0;
            }
            $GLOBALS['NEON_GAMES_DIRTY'] = true;
            audit_log($me, $on ? 'system.emergency.on' : 'system.emergency.off', null, 'emergency', null, null, ['ended' => $ended], $r);
            log_event($on ? 'MAINTENANCE_STARTED' : 'MAINTENANCE_ENDED', $me['id'], ['emergency' => true]);
            return ['ok' => true, 'ended' => $ended];
        }
        case 'setMaintenance': {
            if (!has_perm($me, 'maintenance.manage')) require_user_perm($me, 'system.manage');
            $r = adm_reason($a['reason'] ?? '');
            $s = q1('SELECT * FROM system_settings WHERE id = 1');
            $toIso = fn($v) => !empty($v) ? (is_numeric($v) ? date('c', (int) ($v / 1000)) : date('c', strtotime((string) $v))) : null;
            $until = $toIso($a['until'] ?? null);
            $starts = $toIso($a['startsAt'] ?? null);
            if ($until && $starts && strtotime($until) <= strtotime($starts)) fail('admin.errors.invalid');
            $msg = mb_substr(trim((string) ($a['message'] ?? '')), 0, 300);
            $byA = array_key_exists('bypassAdmins', $a) ? !empty($a['bypassAdmins']) : (bool) $s['maintenance_bypass_admins'];
            $byT = array_key_exists('bypassTesters', $a) ? !empty($a['bypassTesters']) : (bool) $s['maintenance_bypass_testers'];
            q('UPDATE system_settings SET maintenance_enabled = ?, maintenance_message = ?, maintenance_until = ?, maintenance_starts_at = ?, maintenance_bypass_admins = ?, maintenance_bypass_testers = ? WHERE id = 1',
                [!empty($a['enabled']), $msg, $until, $starts, $byA, $byT]);
            audit_log($me, !empty($a['enabled']) ? 'system.maintenance.on' : 'system.maintenance.off', null, 'maintenance', null,
                ['enabled' => (bool) $s['maintenance_enabled'], 'message' => $s['maintenance_message']],
                ['enabled' => !empty($a['enabled']), 'message' => $msg, 'startsAt' => $starts, 'until' => $until, 'bypassAdmins' => $byA, 'bypassTesters' => $byT], $r);
            log_event(!empty($a['enabled']) ? 'MAINTENANCE_STARTED' : 'MAINTENANCE_ENDED', $me['id'], ['until' => $until, 'startsAt' => $starts]);
            return ['ok' => true];
        }
        case 'reviewFlag': {
            require_user_perm($me, 'security.review');
            $r = adm_reason($a['reason'] ?? '');
            $map = ['dismiss' => 'dismissed', 'false_positive' => 'false_positive', 'review' => 'reviewing', 'escalate' => 'escalated', 'confirm' => 'confirmed', 'reopen' => 'open'];
            $status = $map[(string) ($a['decision'] ?? '')] ?? null;
            if (!$status) fail('admin.errors.invalid');
            if ($status === 'confirmed' && !has_perm($me, 'anticheat')) fail('admin.errors.forbidden');
            $f = preg_match('/^[0-9a-f-]{36}$/', (string) ($a['flagId'] ?? '')) ? q1('SELECT * FROM cheat_flags WHERE id = ? FOR UPDATE', [$a['flagId']]) : null;
            if (!$f) fail('errors.notFound');
            $note = mb_substr(trim((string) ($a['note'] ?? '')), 0, 300) ?: null;
            q('UPDATE cheat_flags SET status = ?, reviewed_by = ?, reviewed_at = now(), review_reason = ?, review_note = ?, severity = CASE WHEN ? THEN \'critical\' ELSE severity END WHERE id = ?',
                [$status, $me['id'], $r, $note, $status === 'escalated' && $f['severity'] === 'high', $f['id']]);
            if ($status === 'escalated') {
                foreach (q("SELECT id FROM users WHERE role IN ('super_admin', 'admin') AND id <> ?", [$me['id']])->fetchAll(PDO::FETCH_COLUMN) as $adm) {
                    notify($adm, 'security', ['event' => 'flagEscalated', 'flagId' => $f['id'], 'type' => $f['type'], 'username' => username_of($f['user_id'])]);
                }
            }
            audit_log($me, "security.$status", $f['user_id'], null, $f['id'], $f['status'], $status, $r);
            return ['ok' => true];
        }
        case 'ticketClaim': {
            require_user_perm($me, 'support.manage');
            $t = ticket_load((string) ($a['ticketId'] ?? ''));
            if (in_array($t['status'], ['RESOLVED', 'CLOSED'], true)) fail('support.errors.closed');
            if ($t['assignee_id'] && $t['assignee_id'] !== $me['id'] && empty($a['force'])) fail('support.errors.claimed', ['name' => username_of($t['assignee_id'])]);
            q("UPDATE support_tickets SET assignee_id = ?, status = CASE WHEN status = 'OPEN' THEN 'CLAIMED'::ticket_status ELSE status END, updated_at = now() WHERE id = ?", [$me['id'], $t['id']]);
            ticket_hist($t['id'], ['at' => now_ms(), 'by' => $me['username'], 'action' => 'claim', 'status' => $t['status'] === 'OPEN' ? 'CLAIMED' : $t['status']]);
            notify($t['user_id'], 'ticket', ['ticketId' => $t['id'], 'event' => 'claimed', 'by' => $me['username']]);
            audit_log($me, 'ticket.claim', $t['user_id'], null, $t['id'], $t['assignee_id'] ? username_of($t['assignee_id']) : null, $me['username'], '—');
            return ['ok' => true];
        }
        case 'ticketPriority': {
            require_user_perm($me, 'support.manage');
            $p = (string) ($a['priority'] ?? '');
            if (!in_array($p, ['low', 'normal', 'high', 'urgent'], true)) fail('admin.errors.invalid');
            $t = ticket_load((string) ($a['ticketId'] ?? ''));
            q('UPDATE support_tickets SET priority = ?, updated_at = now() WHERE id = ?', [$p, $t['id']]);
            ticket_hist($t['id'], ['at' => now_ms(), 'by' => $me['username'], 'action' => 'priority', 'to' => $p]);
            audit_log($me, 'ticket.priority', $t['user_id'], null, $t['id'], $t['priority'] ?? 'normal', $p, '—');
            return ['ok' => true];
        }
        case 'ticketEscalate': {
            require_user_perm($me, 'support.manage');
            $r = adm_reason($a['reason'] ?? '');
            $t = ticket_load((string) ($a['ticketId'] ?? ''));
            q("UPDATE support_tickets SET escalated = TRUE, priority = CASE WHEN priority IN ('low', 'normal') THEN 'high' ELSE priority END, updated_at = now() WHERE id = ?", [$t['id']]);
            ticket_hist($t['id'], ['at' => now_ms(), 'by' => $me['username'], 'action' => 'escalate']);
            q('INSERT INTO ticket_messages (ticket_id, author_id, body, is_staff, internal) VALUES (?, ?, ?, TRUE, TRUE)', [$t['id'], $me['id'], 'Escalated: ' . $r]);
            foreach (q("SELECT id FROM users WHERE role IN ('super_admin', 'admin') AND id <> ?", [$me['id']])->fetchAll(PDO::FETCH_COLUMN) as $adm) {
                notify($adm, 'ticket', ['ticketId' => $t['id'], 'event' => 'escalated', 'by' => $me['username']]);
            }
            audit_log($me, 'ticket.escalate', $t['user_id'], null, $t['id'], false, true, $r);
            return ['ok' => true];
        }
        case 'saveAnnouncement':
            return save_announcement_v3($me, $a);
        case 'deliverAnnouncements': {
            require_user_perm($me, 'announcements.manage');
            return ['ok' => true, 'sent' => deliver_announcements()];
        }
        case 'setFeature': {
            require_user_perm($me, 'features.manage');
            $r = adm_reason($a['reason'] ?? '');
            $key = (string) ($a['key'] ?? '');
            $state = (string) ($a['state'] ?? '');
            if (!isset(FEATURE_KEYS[$key]) || !in_array($state, ['off', 'tester', 'vip', 'public'], true)) fail('admin.errors.invalid');
            $before = feature_states()[$key] ?? 'public';
            q('INSERT INTO feature_flags (key, state, label, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET state = EXCLUDED.state, updated_by = EXCLUDED.updated_by, updated_at = now()',
                [$key, $state, FEATURE_KEYS[$key], $me['id']]);
            unset($GLOBALS['NEON_FEATURES']);
            audit_log($me, 'feature.set', null, $key, $key, $before, $state, $r);
            return ['ok' => true];
        }
        case 'economyAnalytics': {
            require_user_perm($me, 'economy.manage');
            return economy_analytics();
        }
        case 'errorLog': {
            if (!has_perm($me, 'errors.view')) require_user_perm($me, 'system.manage');
            $ctx = (string) ($a['context'] ?? '');
            $rows = $ctx !== ''
                ? q('SELECT * FROM error_log WHERE context LIKE ? ORDER BY at DESC LIMIT 200', [str_replace(['%', '_'], ['\\%', '\\_'], $ctx) . '%'])->fetchAll()
                : q('SELECT * FROM error_log ORDER BY at DESC LIMIT 200')->fetchAll();
            return array_map(fn($e) => ['id' => (string) $e['id'], 'at' => iso_to_ms($e['at']), 'context' => $e['context'], 'code' => $e['code'], 'message' => $e['message'], 'stack' => mb_substr((string) $e['stack'], 0, 2000), 'userId' => $e['user_id'] ?? null], $rows);
        }
        case 'setCrashConfig': {
            require_user_perm($me, 'games.manage');
            $r = adm_reason($a['reason'] ?? '');
            $preset = (string) ($a['preset'] ?? 'custom');
            if (isset(CRASH_PRESETS[$preset])) $next = ['preset' => $preset] + CRASH_PRESETS[$preset];
            elseif ($preset === 'custom') {
                $m = (float) ($a['maxMult'] ?? 0); $e = (float) ($a['edge'] ?? -1); $tl = (float) ($a['tail'] ?? 0);
                if ($m < 2 || $m > 10000 || $e < 0 || $e > 0.1 || $tl < 0.5 || $tl > 1) fail('admin.errors.invalid');
                $next = ['preset' => 'custom', 'maxMult' => $m, 'edge' => $e, 'tail' => $tl];
            } else fail('admin.errors.invalid');
            $before = crash_cfg();
            kv_set('crash', $next);
            audit_log($me, 'crash.config', null, 'crash', null, $before, $next, $r);
            return crash_view();
        }
        case 'qaRun': {
            require_user_perm($me, 'qa.run');
            $r = qa_run();
            audit_log($me, 'qa.run', null, 'qa', null, null, $r['summary'], '—');
            return $r;
        }
        case 'scheduleCrash':
        case 'unscheduleCrash':
        case 'resetAnnouncements':
        case 'setLuck':
        case 'clearLuck':
        case 'setCaptcha':
            return admin_v4_action($me, $name, $a);
        case 'clearErrors': {
            require_user_perm($me, 'system.manage');
            $r = adm_reason($a['reason'] ?? '');
            $n = q("DELETE FROM error_log WHERE at < now() - interval '1 hour'")->rowCount();
            audit_log($me, 'errors.clear', null, 'error_log', null, null, ['deleted' => $n], $r);
            return ['ok' => true, 'deleted' => $n];
        }
    }
    return null;
}

/** Player closes their own ticket. */
function ticket_close_by_user(array $me, string $id): array
{
    $t = ticket_load($id);
    if ($t['user_id'] !== $me['id']) fail('admin.errors.forbidden');
    if ($t['status'] === 'CLOSED') return ['ok' => true];
    q("UPDATE support_tickets SET status = 'CLOSED', closed_by_user = TRUE, closed_at = now(), updated_at = now() WHERE id = ?", [$id]);
    ticket_hist($id, ['at' => now_ms(), 'by' => $me['username'], 'status' => 'CLOSED', 'action' => 'closedByUser']);
    log_event('TICKET_UPDATED', $me['id'], ['ticketId' => $id, 'status' => 'CLOSED']);
    return ['ok' => true];
}

/**
 * Player activity history: wallet entries (games, rewards, cases, transfers, AC/AG), Loyalty XP and sign-ins.
 * Newest first, max 200 rows, last 90 days. IPs are masked.
 */
function activity_view(array $u, string $kind): array
{
    if (!in_array($kind, ['all', 'ac', 'ag', 'rewards', 'games', 'lxp', 'security'], true)) $kind = 'all';
    $rows = [];
    if ($kind !== 'lxp' && $kind !== 'security') {
        $where = ['user_id = ?', "created_at > now() - interval '90 days'"];
        $args = [$u['id']];
        if ($kind === 'ac' || $kind === 'ag') { $where[] = 'currency = ?'; $args[] = strtoupper($kind); }
        if ($kind === 'rewards') $where[] = "type = 'reward'";
        if ($kind === 'games') $where[] = 'session_id IS NOT NULL';
        foreach (q('SELECT currency, amount, balance_after, type, category, source, reason, status, created_at FROM wallet_transactions WHERE ' . implode(' AND ', $where) . ' ORDER BY created_at DESC LIMIT 200', $args) as $r) {
            $rows[] = ['kind' => 'wallet', 'type' => $r['type'], 'category' => $r['category'], 'source' => $r['source'], 'reason' => $r['reason'],
                'currency' => $r['currency'], 'amount' => num((float) $r['amount']), 'balance' => num((float) $r['balance_after']), 'status' => $r['status'], 'at' => iso_to_ms($r['created_at'])];
        }
    }
    if ($kind === 'all' || $kind === 'lxp') {
        foreach (q("SELECT amount, source, at FROM loyalty_xp_log WHERE user_id = ? AND at > now() - interval '90 days' ORDER BY at DESC LIMIT 200", [$u['id']]) as $r) {
            $rows[] = ['kind' => 'lxp', 'amount' => (int) $r['amount'], 'source' => $r['source'], 'at' => iso_to_ms($r['at'])];
        }
    }
    if ($kind === 'all' || $kind === 'security') {
        foreach (q("SELECT ok, host(ip) AS ip, at FROM login_attempts WHERE email = ? AND at > now() - interval '90 days' ORDER BY at DESC LIMIT 50", [$u['email']]) as $r) {
            $ip = (string) $r['ip'];
            $masked = str_contains($ip, ':') ? implode(':', array_slice(explode(':', $ip), 0, 3)) . ':…' : preg_replace('/\.\d+$/', '.x', $ip);
            $rows[] = ['kind' => 'login', 'ok' => (bool) $r['ok'], 'ip' => $masked, 'at' => iso_to_ms($r['at'])];
        }
    }
    usort($rows, fn($a, $b) => $b['at'] <=> $a['at']);
    return array_slice($rows, 0, 200);
}

// ───────────────────────────── Moderation notices in chat ─────────────────────────────

/** Public line in global chat when staff bans, kicks or mutes someone (like a game server). */
function chat_mod_notice(string $action, string $targetId, array $me, ?string $reason = null, ?string $duration = null): void
{
    $name = username_of($targetId);
    if (!$name) return;
    q("INSERT INTO chat_messages (user_id, type, body, data) VALUES (NULL, 'mod', 'mod', ?::jsonb)", [jenc([
        'action' => $action, 'user' => $name, 'by' => $me['username'], 'reason' => $reason !== null ? mb_substr($reason, 0, 120) : null, 'duration' => $duration,
    ])]);
}

// ───────────────────────────── Jam Gacor (luck boost) ─────────────────────────────
// The RNG is never touched (provably fair stays valid). A boost pays an extra bonus on top of a WIN:
// bonus = profit × (mult − 1), capped at 10× the bet, posted as a separate "Jam Gacor" reward.

const LUCK_MAX_MULT = 5;

function luck_state(): array
{
    $s = kv_get('luck');
    $now = now_ms();
    $g = $s['global'] ?? null;
    if ($g && ($g['until'] ?? 0) <= $now) $g = null;
    $users = array_filter($s['users'] ?? [], fn($u) => ($u['until'] ?? 0) > $now);
    return ['global' => $g, 'users' => $users];
}

function luck_mult(string $userId): float
{
    $s = luck_state();
    return max(1.0, (float) ($s['global']['mult'] ?? 1), (float) ($s['users'][$userId]['mult'] ?? 1));
}

/** Called after a winning round is paid. Returns the bonus paid (0 when no boost). */
function luck_bonus(string $userId, string $cur, float $bet, float $payout, string $sessionId): float
{
    if ($payout <= $bet) return 0.0;
    $m = luck_mult($userId);
    if ($m <= 1) return 0.0;
    $bonus = round2(min(($payout - $bet) * ($m - 1), $bet * 10));
    if ($bonus <= 0) return 0.0;
    wallet_post($userId, $cur, $bonus, 'reward', 'perk', 'gacor', 'Jam Gacor ×' . rtrim(rtrim(number_format($m, 2, '.', ''), '0'), '.'), $sessionId, "gacor:$sessionId:$cur");
    return $bonus;
}

/** What players see (global event only; personal boosts are private). */
function luck_public(?array $u): ?array
{
    $s = luck_state();
    $mine = $u ? ($s['users'][$u['id']] ?? null) : null;
    if (!$s['global'] && !$mine) return null;
    $best = $mine && (!$s['global'] || $mine['mult'] > $s['global']['mult']) ? $mine : $s['global'];
    return ['mult' => (float) $best['mult'], 'until' => (int) $best['until'], 'personal' => $best === $mine, 'label' => $best['label'] ?? null];
}

function luck_admin_view(): array
{
    $s = luck_state();
    $users = [];
    foreach ($s['users'] as $id => $u) $users[] = ['userId' => $id, 'username' => username_of($id), 'mult' => (float) $u['mult'], 'until' => (int) $u['until']];
    return ['global' => $s['global'], 'users' => $users, 'maxMult' => LUCK_MAX_MULT];
}

// ───────────────────────────── Captcha settings (admin) ─────────────────────────────

function captcha_admin_view(): array
{
    $c = captcha_cfg();
    $k = kv_get('captcha');
    return ['mode' => $c['mode'], 'setting' => $k['mode'] ?? 'config', 'siteKey' => $c['site'], 'hasSecret' => $c['secret'] !== '', 'bits' => $c['bits']];
}

/** Extra v3 admin actions (v2.2). Returns null when the action is not one of these. */
function admin_v4_action(array $me, string $name, array $a): ?array
{
    switch ($name) {
        case 'resetAnnouncements': {
            require_user_perm($me, 'announcements.manage');
            $r = adm_reason($a['reason'] ?? '');
            $n = q("UPDATE announcements SET active = FALSE, end_at = LEAST(COALESCE(end_at, now()), now()) WHERE active OR end_at IS NULL OR end_at > now()")->rowCount();
            q("UPDATE notifications SET read_at = now() WHERE kind = 'announcement' AND read_at IS NULL");
            audit_log($me, 'announcement.reset', null, 'all', null, null, ['ended' => $n], $r);
            return ['ok' => true, 'ended' => $n];
        }
        case 'setLuck': {
            require_user_perm($me, 'economy.manage');
            $r = adm_reason($a['reason'] ?? '');
            $mult = round((float) ($a['mult'] ?? 0), 2);
            $min = (int) ($a['minutes'] ?? 0);
            if ($mult < 1.1 || $mult > LUCK_MAX_MULT || $min < 1 || $min > 7 * 1440) fail('admin.errors.invalid');
            $entry = ['mult' => $mult, 'until' => now_ms() + $min * 60000, 'by' => $me['username'], 'label' => mb_substr(trim((string) ($a['label'] ?? '')), 0, 40) ?: null];
            $s = luck_state();
            $target = null;
            if (!empty($a['username'])) {
                $target = q1('SELECT id, username FROM users WHERE lower(username) = lower(?)', [(string) $a['username']]);
                if (!$target) fail('admin.errors.userNotFound');
                $s['users'][$target['id']] = $entry;
            } else {
                $s['global'] = $entry;
                q("INSERT INTO chat_messages (user_id, type, body, data) VALUES (NULL, 'mod', 'mod', ?::jsonb)", [jenc(['action' => 'gacor', 'mult' => $mult, 'minutes' => $min, 'by' => $me['username']])]);
            }
            kv_set('luck', $s);
            audit_log($me, 'luck.set', $target['id'] ?? null, $target['username'] ?? 'global', null, null, $entry, $r);
            return luck_admin_view();
        }
        case 'clearLuck': {
            require_user_perm($me, 'economy.manage');
            $r = adm_reason($a['reason'] ?? '');
            $s = luck_state();
            if (!empty($a['userId'])) unset($s['users'][(string) $a['userId']]);
            else $s['global'] = null;
            kv_set('luck', $s);
            audit_log($me, 'luck.clear', $a['userId'] ?? null, $a['userId'] ?? 'global', null, null, null, $r);
            return luck_admin_view();
        }
        case 'scheduleCrash': {
            // Fix the crash point of a future global round (Owner only). Max 50 queued, only rounds not created yet.
            require_user_perm($me, 'economy.manage');
            $r = adm_reason($a['reason'] ?? '');
            $round = (int) ($a['round'] ?? 0);
            $point = round((float) ($a['point'] ?? 0), 2);
            $cur = (int) qv('SELECT COALESCE(max(id), 0) FROM crash_rounds');
            if ($round <= $cur || $round > $cur + 1000000 || $point < 1 || $point > crash_cfg()['maxMult']) fail('admin.errors.crashRound', ['current' => $cur, 'max' => crash_cfg()['maxMult']]);
            $s = kv_get('crash_sched');
            $s['rounds'] = $s['rounds'] ?? [];
            if (count($s['rounds']) >= 50 && !isset($s['rounds'][(string) $round])) fail('admin.errors.invalid');
            $s['rounds'][(string) $round] = $point;
            kv_set('crash_sched', $s);
            audit_log($me, 'crash.schedule', null, "round $round", (string) $round, null, ['point' => $point], $r);
            return crash_view();
        }
        case 'unscheduleCrash': {
            require_user_perm($me, 'economy.manage');
            $r = adm_reason($a['reason'] ?? '');
            $s = kv_get('crash_sched');
            unset($s['rounds'][(string) (int) ($a['round'] ?? 0)]);
            kv_set('crash_sched', $s);
            audit_log($me, 'crash.unschedule', null, 'round ' . (int) ($a['round'] ?? 0), null, null, null, $r);
            return crash_view();
        }
        case 'setCaptcha': {
            require_user_perm($me, 'system.manage');
            $r = adm_reason($a['reason'] ?? '');
            $mode = (string) ($a['mode'] ?? '');
            if (!in_array($mode, ['config', 'pow', 'turnstile'], true)) fail('admin.errors.invalid');
            $k = kv_get('captcha');
            $next = ['mode' => $mode === 'config' ? null : $mode, 'site' => $k['site'] ?? '', 'secret' => $k['secret'] ?? ''];
            if (isset($a['siteKey'])) $next['site'] = mb_substr(trim((string) $a['siteKey']), 0, 120);
            if (isset($a['secret']) && trim((string) $a['secret']) !== '') $next['secret'] = mb_substr(trim((string) $a['secret']), 0, 200);
            if ($mode === 'turnstile' && ($next['site'] === '' || $next['secret'] === '')) fail('admin.errors.captchaKeys');
            kv_set('captcha', $next);
            audit_log($me, 'captcha.set', null, 'captcha', null, null, ['mode' => $mode, 'site' => $next['site'], 'secret' => $next['secret'] !== '' ? 'set' : ''], $r);
            return captcha_admin_view();
        }
    }
    return null;
}

/**
 * Cheap change detector polled every few seconds by the browser. Returns short fingerprints; when one changes,
 * the client pulls the full data (me / sync). Account: balances, progress, docs, card XP, role/status, memberships,
 * notifications. Shared: latest chat message, announcements, maintenance/game settings.
 */
function pulse_view(?array $u): array
{
    $shared = (string) qv("SELECT concat_ws('|', (SELECT max(created_at) FROM chat_messages), (SELECT max(created_at) FROM announcements),
        (SELECT max(updated_at) FROM games), (SELECT value::text FROM neon_kv WHERE key = 'luck'))");
    $out = ['shared' => substr(md5($shared), 0, 12), 'serverTime' => now_ms()];
    if ($u) {
        $acct = (string) qv("SELECT concat_ws('|', w.ac_balance, w.ag_balance, w.updated_at, u.role, u.status, u.loyalty_xp, u.wallet_frozen,
            (SELECT updated_at FROM user_progress WHERE user_id = u.id), (SELECT updated_at FROM user_docs WHERE user_id = u.id),
            (SELECT max(created_at) FROM memberships WHERE user_id = u.id), (SELECT count(*) FROM memberships WHERE user_id = u.id AND active),
            (SELECT max(created_at) FROM notifications WHERE user_id = u.id))
            FROM users u LEFT JOIN wallets w ON w.user_id = u.id WHERE u.id = ?", [$u['id']]);
        $out['account'] = substr(md5($acct), 0, 12);
    }
    return $out;
}

