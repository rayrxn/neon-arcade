<?php
declare(strict_types=1);

/**
 * Owner Console — a separate authority boundary, not a role.
 *  - Unlocked only with the console key (stored as a password hash in ~/neon-config.php → 'console' => ['key_hash' => …]).
 *  - Short sessions (30 min, sliding), HttpOnly SameSite=Strict cookie, rate-limited unlock, every command audited.
 *  - A fixed command registry with real handlers. There is no shell, no eval and no SQL passthrough.
 *  - Destructive commands need the exact command echoed back as confirmation.
 * The same registry runs from the CLI launcher tools/owner-console.php (on the host over SSH / cPanel Terminal).
 */

const CONSOLE_COOKIE = 'neon_console';
const CONSOLE_TTL = 1800;

function console_cfg(): array
{
    return config()['console'] ?? [];
}

function console_actor(): array
{
    return ['id' => null, 'role' => 'super_admin', 'username' => 'console', 'console' => true];
}

function console_session(): ?array
{
    if (!empty($GLOBALS['NEON_CONSOLE_CLI'])) return ['id' => 'cli', 'short' => 'cli'];
    $tok = $GLOBALS['NEON_CONSOLE_TOKEN'] ?? ($_COOKIE[CONSOLE_COOKIE] ?? null);
    if (!is_string($tok) || !preg_match('/^[0-9a-f]{64}$/', $tok)) return null;
    $id = hash('sha256', $tok);
    $s = q1('SELECT * FROM console_sessions WHERE id = ? AND revoked_at IS NULL AND expires_at > now()', [$id]);
    if (!$s) return null;
    q("UPDATE console_sessions SET expires_at = now() + (? * interval '1 second') WHERE id = ?", [CONSOLE_TTL, $id]);
    return ['id' => $id, 'short' => substr($id, 0, 12)];
}

function console_set_cookie(string $token, int $ttl): void
{
    if (PHP_SAPI === 'cli') { $GLOBALS['NEON_CONSOLE_TOKEN'] = $token; return; }
    setcookie(CONSOLE_COOKIE, $token, ['expires' => $ttl > 0 ? time() + $ttl : time() - 3600, 'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'httponly' => true, 'samesite' => 'Strict']);
}

function console_audit(?string $short, string $command, bool $ok, string $result): void
{
    q('INSERT INTO console_audit (session, ip, command, ok, result) VALUES (?, ?::inet, ?, ?, ?)', [$short, client_ip(), mb_substr($command, 0, 500), $ok, mb_substr($result, 0, 4000)]);
}

function console_unlock(string $key): array
{
    $hash = (string) (console_cfg()['key_hash'] ?? '');
    if ($hash === '') fail('console.errors.disabled', [], 400);
    $ip = client_ip();
    if ((int) qv("SELECT count(*) FROM console_audit WHERE ip = ?::inet AND command = 'unlock' AND NOT ok AND at > now() - interval '15 minutes'", [$ip]) >= 5) fail('console.errors.tooMany', ['minutes' => 15], 429);
    if ($key === '' || !password_verify($key, $hash)) {
        console_audit(null, 'unlock', false, 'wrong key');
        fail('console.errors.badKey', [], 400);
    }
    $tok = rand_hex(32);
    $id = hash('sha256', $tok);
    q("INSERT INTO console_sessions (id, ip, user_agent, expires_at) VALUES (?, ?::inet, ?, now() + (? * interval '1 second'))", [$id, $ip, mb_substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 300), CONSOLE_TTL]);
    q("DELETE FROM console_sessions WHERE expires_at < now() - interval '7 days'");
    console_set_cookie($tok, CONSOLE_TTL);
    console_audit(substr($id, 0, 12), 'unlock', true, 'session opened');
    return ['ok' => true, 'expiresIn' => CONSOLE_TTL];
}

function console_lock(): array
{
    $s = console_session();
    if ($s && $s['id'] !== 'cli') {
        q('UPDATE console_sessions SET revoked_at = now() WHERE id = ?', [$s['id']]);
        console_audit($s['short'], 'lock', true, 'session closed');
    }
    console_set_cookie('', -1);
    return ['ok' => true];
}

/** Find a user by @username, username or uuid. */
function console_user(string $ref): array
{
    $ref = ltrim(trim($ref), '@');
    $u = preg_match('/^[0-9a-f-]{36}$/', $ref) ? q1('SELECT * FROM users WHERE id = ?', [$ref]) : q1('SELECT * FROM users WHERE lower(username) = lower(?)', [$ref]);
    if (!$u) throw new ConsoleError("user not found: $ref");
    return $u;
}

final class ConsoleError extends RuntimeException {}

/** Split a command line into words; "quoted text" stays together. */
function console_words(string $line): array
{
    preg_match_all('/"([^"]*)"|(\S+)/u', $line, $m, PREG_SET_ORDER);
    return array_map(fn($x) => ($x[1] ?? '') !== '' ? $x[1] : ($x[2] ?? ''), $m);
}

function console_table(array $rows, array $cols): string
{
    if (!$rows) return '(none)';
    $w = [];
    foreach ($cols as $c) $w[$c] = mb_strlen($c);
    foreach ($rows as $r) foreach ($cols as $c) $w[$c] = max($w[$c], mb_strlen((string) ($r[$c] ?? '')));
    $line = fn($r) => implode('  ', array_map(fn($c) => str_pad((string) ($r[$c] ?? ''), $w[$c] + strlen((string) ($r[$c] ?? '')) - mb_strlen((string) ($r[$c] ?? ''))), $cols));
    return implode("\n", array_merge([$line(array_combine($cols, array_map('strtoupper', $cols)))], array_map($line, $rows)));
}

/** Command registry: name => [usage, description, destructive, handler(array $args): string]. */
function console_commands(): array
{
    $me = console_actor();
    $reasonOf = fn(array $a, int $from) => trim(implode(' ', array_slice($a, $from))) ?: '—';
    return [
        'help' => ['help [command]', 'List commands or show one command.', false, function (array $a) {
            $cmds = console_commands();
            if (isset($a[0], $cmds[$a[0]])) return $cmds[$a[0]][0] . "\n  " . $cmds[$a[0]][1] . ($cmds[$a[0]][2] ? "\n  (asks for confirmation)" : '');
            $out = [];
            foreach ($cmds as $c) $out[] = str_pad($c[0], 44) . ' ' . $c[1] . ($c[2] ? ' [confirm]' : '');
            return implode("\n", $out);
        }],
        'status' => ['status', 'Server, database, maintenance and player counts.', false, function () {
            $s = q1('SELECT * FROM system_settings WHERE id = 1');
            $c = q1("SELECT count(*) AS users, count(*) FILTER (WHERE last_seen_at > now() - interval '75 seconds') AS online, count(*) FILTER (WHERE status = 'banned') AS banned FROM users");
            return implode("\n", [
                'time        ' . date('c'),
                'php         ' . PHP_VERSION,
                'database    ' . (qv('SELECT 1') ? 'ok' : 'down') . ' · ' . qv('SELECT version()'),
                'maintenance ' . ($s['maintenance_enabled'] ? 'ON' . ($s['maintenance_starts_at'] ? ' from ' . $s['maintenance_starts_at'] : '') . ($s['maintenance_until'] ? ' until ' . $s['maintenance_until'] : '') : 'off'),
                'players     ' . $c['users'] . ' total · ' . $c['online'] . ' online · ' . $c['banned'] . ' banned',
                'open rounds ' . qv("SELECT count(*) FROM game_sessions WHERE status = 'OPEN'"),
                'errors 1h   ' . qv("SELECT count(*) FROM error_log WHERE at > now() - interval '1 hour'"),
                'captcha     ' . captcha_cfg()['mode'],
            ]);
        }],
        'users' => ['users <search>', 'Find players by name or email.', false, function (array $a) {
            if (!$a) throw new ConsoleError('usage: users <search>');
            $rows = q("SELECT username, role::text AS role, status::text AS status, to_char(created_at, 'YYYY-MM-DD') AS joined FROM users WHERE username ILIKE ? OR email ILIKE ? ORDER BY username LIMIT 25", ['%' . $a[0] . '%', '%' . $a[0] . '%'])->fetchAll();
            return console_table($rows, ['username', 'role', 'status', 'joined']);
        }],
        'user' => ['user <name>', 'Show one player: role, status, balances, card, membership.', false, function (array $a) {
            if (!$a) throw new ConsoleError('usage: user <name>');
            $u = console_user($a[0]);
            $w = q1('SELECT ac_balance, ag_balance FROM wallets WHERE user_id = ?', [$u['id']]);
            return implode("\n", [
                'id          ' . $u['id'], 'username    ' . $u['username'], 'role        ' . $u['role'], 'status      ' . $u['status'] . ($u['ban_until'] ? ' until ' . $u['ban_until'] : ''),
                'AC / AG     ' . num($w['ac_balance'] ?? 0) . ' / ' . num($w['ag_balance'] ?? 0), 'membership  ' . (member_tier($u['id']) ?? '—'),
                'last seen   ' . ($u['last_seen_at'] ?? '—'), 'joined      ' . $u['created_at'],
            ]);
        }],
        'ban' => ['ban <name> <hours|perm> <reason…>', 'Ban a player (any role, including Owners).', true, function (array $a) use ($reasonOf) {
            if (count($a) < 2) throw new ConsoleError('usage: ban <name> <hours|perm> <reason>');
            $u = console_user($a[0]);
            $hours = $a[1] === 'perm' ? null : (ctype_digit($a[1]) && (int) $a[1] > 0 ? (int) $a[1] : throw new ConsoleError('hours must be a positive number or "perm"'));
            $r = $reasonOf($a, 2);
            q("UPDATE users SET status = 'banned', ban_until = ?, ban_reason = ?, banned_at = now(), banned_by = NULL WHERE id = ?", [$hours ? date('c', time() + $hours * 3600) : null, $r, $u['id']]);
            q('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
            notify($u['id'], 'security', ['event' => $hours ? 'suspended' : 'banned']);
            audit_log(console_actor(), 'user.ban', $u['id'], $u['username'], $u['id'], $u['status'], ['status' => 'banned', 'hours' => $hours, 'by' => 'console'], $r);
            return "banned @{$u['username']}" . ($hours ? " for {$hours} h" : ' permanently');
        }],
        'unban' => ['unban <name> [reason…]', 'Lift a ban.', false, function (array $a) use ($reasonOf) {
            if (!$a) throw new ConsoleError('usage: unban <name>');
            $u = console_user($a[0]);
            q("UPDATE users SET status = 'active', ban_until = NULL, ban_reason = NULL, banned_at = NULL, banned_by = NULL WHERE id = ?", [$u['id']]);
            notify($u['id'], 'security', ['event' => 'restored']);
            audit_log(console_actor(), 'user.unban', $u['id'], $u['username'], $u['id'], $u['status'], 'active', $reasonOf($a, 1));
            return "unbanned @{$u['username']}";
        }],
        'kick' => ['kick <name>', 'Sign a player out everywhere and cancel their open rounds (refunded).', true, function (array $a) {
            if (!$a) throw new ConsoleError('usage: kick <name>');
            $u = console_user($a[0]);
            $n = q('DELETE FROM sessions WHERE user_id = ?', [$u['id']])->rowCount();
            $r = 0;
            foreach (q("SELECT * FROM game_sessions WHERE user_id = ? AND status = 'OPEN' FOR UPDATE", [$u['id']])->fetchAll() as $gs) if (end_game_session($gs, 'console')) $r++;
            audit_log(console_actor(), 'sessions.terminate', $u['id'], $u['username'], null, null, ['logins' => $n, 'rounds' => $r, 'by' => 'console'], '—');
            return "@{$u['username']}: $n login sessions ended, $r rounds refunded";
        }],
        'role' => ['role <name> <user|developer|support|moderator|admin|super_admin>', 'Change a staff role.', true, function (array $a) {
            if (count($a) < 2) throw new ConsoleError('usage: role <name> <role>');
            if (!in_array($a[1], ['user', 'developer', 'support', 'moderator', 'admin', 'super_admin'], true)) throw new ConsoleError('unknown role');
            $u = console_user($a[0]);
            q('UPDATE users SET role = ?::user_role WHERE id = ?', [$a[1], $u['id']]);
            q('DELETE FROM sessions WHERE user_id = ?', [$u['id']]);
            audit_log(console_actor(), 'user.role', $u['id'], $u['username'], $u['id'], $u['role'], $a[1], 'console');
            return "@{$u['username']}: {$u['role']} → {$a[1]} (signed out to refresh permissions)";
        }],
        'wallet' => ['wallet <name> <AC|AG> <+/-amount> <reason…>', 'Add or remove coins (ledger entry, audited).', true, function (array $a) use ($reasonOf) {
            if (count($a) < 3) throw new ConsoleError('usage: wallet <name> <AC|AG> <amount> <reason>');
            $u = console_user($a[0]);
            $cur = strtoupper($a[1]);
            if (!in_array($cur, ['AC', 'AG'], true) || !preg_match('/^[+-]?\d{1,13}$/', $a[2]) || (int) $a[2] === 0) throw new ConsoleError('currency must be AC or AG and amount a whole number');
            $r = $reasonOf($a, 3);
            $tx = wallet_post($u['id'], $cur, (int) $a[2], 'adjust', 'system', 'console', $r, null, 'console:' . rand_hex(12));
            audit_log(console_actor(), (int) $a[2] > 0 ? 'wallet.add' : 'wallet.remove', $u['id'], $u['username'], $tx, null, ['amount' => (int) $a[2], 'currency' => $cur], $r, $cur);
            return "@{$u['username']}: " . ((int) $a[2] > 0 ? '+' : '') . (int) $a[2] . " $cur (tx $tx)";
        }],
        'maintenance' => ['maintenance <on|off> [message…]', 'Turn site maintenance on or off (staff keep access).', false, function (array $a) use ($reasonOf) {
            if (!in_array($a[0] ?? '', ['on', 'off'], true)) throw new ConsoleError('usage: maintenance <on|off> [message]');
            $on = $a[0] === 'on';
            q('UPDATE system_settings SET maintenance_enabled = ?, maintenance_message = CASE WHEN ? <> \'\' THEN ? ELSE maintenance_message END, maintenance_starts_at = NULL WHERE id = 1', [$on, $reasonOf($a, 1) === '—' ? '' : $reasonOf($a, 1), mb_substr($reasonOf($a, 1), 0, 300)]);
            audit_log(console_actor(), $on ? 'system.maintenance.on' : 'system.maintenance.off', null, 'maintenance', null, null, ['enabled' => $on, 'by' => 'console'], '—');
            return 'maintenance ' . ($on ? 'ON' : 'off');
        }],
        'games' => ['games', 'List games with status, betting, new rounds and max bets.', false, function () {
            $rows = array_map(fn($g) => ['slug' => $g['slug'], 'status' => $g['status'], 'betting' => $g['betting_enabled'] ? 'on' : 'OFF', 'new' => $g['new_sessions'] ? 'on' : 'OFF', 'max_ac' => num($g['max_bet']), 'max_ag' => num($g['max_bet_ag']),
                'open' => qv("SELECT count(*) FROM game_sessions WHERE game = ? AND status = 'OPEN'", [$g['slug']])], q('SELECT * FROM games ORDER BY slug')->fetchAll());
            return console_table($rows, ['slug', 'status', 'betting', 'new', 'max_ac', 'max_ag', 'open']);
        }],
        'game' => ['game <slug> <live|maintenance|disabled|betting-on|betting-off|new-on|new-off>', 'Change one game.', false, function (array $a) {
            if (count($a) < 2) throw new ConsoleError('usage: game <slug> <state>');
            if (!qv('SELECT 1 FROM games WHERE slug = ?', [$a[0]])) throw new ConsoleError('unknown game');
            $map = ['live' => ['status', 'live'], 'maintenance' => ['status', 'maintenance'], 'disabled' => ['status', 'disabled'], 'betting-on' => ['betting_enabled', true], 'betting-off' => ['betting_enabled', false], 'new-on' => ['new_sessions', true], 'new-off' => ['new_sessions', false]];
            if (!isset($map[$a[1]])) throw new ConsoleError('unknown state');
            [$col, $val] = $map[$a[1]];
            q("UPDATE games SET $col = ?, updated_at = now() WHERE slug = ?", [$val, $a[0]]);
            audit_log(console_actor(), 'game.controls', null, $a[0], $a[0], null, [$col => $val, 'by' => 'console'], '—');
            return "{$a[0]}: $col = " . var_export($val, true);
        }],
        'end-rounds' => ['end-rounds [slug]', 'Cancel open rounds (all games or one) with a full refund.', true, function (array $a) {
            $slug = $a[0] ?? null;
            if ($slug !== null && !qv('SELECT 1 FROM games WHERE slug = ?', [$slug])) throw new ConsoleError('unknown game');
            $n = end_open_sessions($slug, 'console');
            audit_log(console_actor(), 'sessions.endAll', null, $slug ?? 'all', $slug, null, ['ended' => $n, 'by' => 'console'], '—');
            return "$n rounds cancelled and refunded";
        }],
        'shutdown' => ['shutdown [message…]', 'Emergency: maintenance on, new rounds off everywhere, open rounds refunded.', true, function (array $a) use ($reasonOf) {
            q('UPDATE system_settings SET maintenance_enabled = TRUE, maintenance_starts_at = NULL, maintenance_until = NULL, maintenance_message = ? WHERE id = 1', [mb_substr($reasonOf($a, 0) === '—' ? 'Emergency maintenance' : $reasonOf($a, 0), 0, 300)]);
            q('UPDATE games SET new_sessions = FALSE, updated_at = now()');
            $n = end_open_sessions(null, 'emergency');
            audit_log(console_actor(), 'system.emergency.on', null, 'emergency', null, null, ['ended' => $n, 'by' => 'console'], $reasonOf($a, 0));
            return "EMERGENCY SHUTDOWN active · $n rounds refunded · run `restore` to reopen";
        }],
        'restore' => ['restore', 'Undo shutdown: maintenance off, new rounds on.', false, function () {
            q('UPDATE system_settings SET maintenance_enabled = FALSE WHERE id = 1');
            q('UPDATE games SET new_sessions = TRUE, updated_at = now()');
            audit_log(console_actor(), 'system.emergency.off', null, 'emergency', null, null, ['by' => 'console'], '—');
            return 'site reopened';
        }],
        'features' => ['features', 'List feature flags.', false, function () {
            $st = feature_states();
            return console_table(array_map(fn($k, $l) => ['key' => $k, 'state' => $st[$k] ?? 'public', 'label' => $l], array_keys(FEATURE_KEYS), FEATURE_KEYS), ['key', 'state', 'label']);
        }],
        'feature' => ['feature <key> <off|tester|vip|public>', 'Set a feature flag.', false, function (array $a) {
            if (count($a) < 2 || !isset(FEATURE_KEYS[$a[0]]) || !in_array($a[1], ['off', 'tester', 'vip', 'public'], true)) throw new ConsoleError('usage: feature <key> <off|tester|vip|public>');
            q('INSERT INTO feature_flags (key, state, label) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET state = EXCLUDED.state, updated_by = NULL, updated_at = now()', [$a[0], $a[1], FEATURE_KEYS[$a[0]]]);
            unset($GLOBALS['NEON_FEATURES']);
            audit_log(console_actor(), 'feature.set', null, $a[0], $a[0], null, $a[1], 'console');
            return "{$a[0]} → {$a[1]}";
        }],
        'announce' => ['announce <all|here|vip|vvip|members|tester|moderator|staff> <message…>', 'Send an announcement now.', false, function (array $a) use ($reasonOf) {
            if (count($a) < 2 || !in_array($a[0], ANNOUNCE_TARGETS, true)) throw new ConsoleError('usage: announce <target> <message>');
            $msg = mb_substr($reasonOf($a, 1), 0, 1000);
            $id = (string) qv("INSERT INTO announcements (title, message, type, start_at, active, target, priority, created_by) VALUES ('Announcement', ?, 'info', now(), TRUE, ?, 'high', NULL) RETURNING id", [$msg, $a[0]]);
            $n = deliver_announcements();
            audit_log(console_actor(), 'announcement.create', null, 'console', $id, null, ['target' => $a[0]], '—');
            return "sent to $n players (@{$a[0]})";
        }],
        'flags' => ['flags [n]', 'Open security events, most severe first.', false, function (array $a) {
            $n = min(50, max(1, (int) ($a[0] ?? 15)));
            $rows = q("SELECT to_char(f.created_at, 'MM-DD HH24:MI') AS at, u.username AS user, f.type, f.severity, f.confidence::text AS conf, f.status FROM cheat_flags f JOIN users u ON u.id = f.user_id
                       WHERE f.status IN ('open', 'reviewing', 'escalated') ORDER BY array_position(ARRAY['critical','high','medium','low','info'], f.severity), f.created_at DESC LIMIT $n")->fetchAll();
            return console_table($rows, ['at', 'user', 'type', 'severity', 'conf', 'status']);
        }],
        'errors' => ['errors [n]', 'Latest server and browser errors.', false, function (array $a) {
            $n = min(50, max(1, (int) ($a[0] ?? 10)));
            $rows = q("SELECT to_char(at, 'MM-DD HH24:MI:SS') AS at, context, left(message, 90) AS message FROM error_log ORDER BY at DESC LIMIT $n")->fetchAll();
            return console_table($rows, ['at', 'context', 'message']);
        }],
        'economy' => ['economy', 'Circulation, averages and safeguard flags.', false, function () {
            $e = economy_analytics();
            $lines = ['players     ' . $e['players'], 'AC total    ' . $e['circulation']['AC'] . ' (avg ' . $e['average']['AC'] . ', median ' . $e['median']['AC'] . ')', 'AG total    ' . $e['circulation']['AG'] . ' (avg ' . $e['average']['AG'] . ', median ' . $e['median']['AG'] . ')'];
            foreach ($e['alerts'] as $x) $lines[] = 'FLAG        ' . $x['code'] . ' ' . ($x['username'] ?? $x['game'] ?? '') . ' ' . $x['value'];
            return implode("\n", $lines);
        }],
        'qa' => ['qa', 'Run the QA health checks.', false, function () {
            $r = qa_run();
            $lines = array_map(fn($c) => str_pad(strtoupper($c['status']), 6) . str_pad($c['id'], 26) . (string) ($c['detail'] ?? ''), $r['checks']);
            $lines[] = sprintf('pass %d · info %d · warn %d · error %d · %d ms', $r['summary']['pass'], $r['summary']['info'], $r['summary']['warn'], $r['summary']['error'], $r['ms']);
            return implode("\n", $lines);
        }],
        'audit' => ['audit [n]', 'Latest console commands.', false, function (array $a) {
            $n = min(100, max(1, (int) ($a[0] ?? 20)));
            $rows = q("SELECT to_char(at, 'MM-DD HH24:MI:SS') AS at, coalesce(session, '') AS session, coalesce(host(ip), 'cli') AS ip, CASE WHEN ok THEN 'ok' ELSE 'FAIL' END AS ok, left(command, 70) AS command FROM console_audit ORDER BY at DESC LIMIT $n")->fetchAll();
            return console_table($rows, ['at', 'session', 'ip', 'ok', 'command']);
        }],
        'sessions' => ['sessions', 'Active console sessions.', false, function () {
            $rows = q("SELECT left(id, 12) AS id, coalesce(host(ip), '') AS ip, to_char(created_at, 'MM-DD HH24:MI') AS opened, to_char(expires_at, 'HH24:MI') AS expires FROM console_sessions WHERE revoked_at IS NULL AND expires_at > now() ORDER BY created_at DESC")->fetchAll();
            return console_table($rows, ['id', 'ip', 'opened', 'expires']);
        }],
        'revoke-all' => ['revoke-all', 'End every console session (including this one).', true, function () {
            $n = q('UPDATE console_sessions SET revoked_at = now() WHERE revoked_at IS NULL')->rowCount();
            return "$n console sessions revoked";
        }],
    ];
}

/** Run one command line. Destructive commands need `confirm` equal to the command line. */
function console_exec(string $line, ?string $confirm = null): array
{
    $s = console_session();
    if (!$s) fail('console.errors.expired', [], 423);
    $line = trim(preg_replace('/\s+/u', ' ', $line));
    if ($line === '' || mb_strlen($line) > 500) fail('console.errors.invalid');
    $words = console_words($line);
    $name = strtolower(array_shift($words));
    $cmds = console_commands();
    if (!isset($cmds[$name])) {
        console_audit($s['short'], $line, false, 'unknown command');
        return ['ok' => false, 'output' => "unknown command: $name — type `help`"];
    }
    [$usage, , $destructive, $fn] = $cmds[$name];
    if ($destructive && $confirm !== $line) {
        console_audit($s['short'], $line, true, 'confirmation requested');
        return ['ok' => true, 'confirm' => true, 'output' => "This changes live data: `$line`\nType the command again exactly to confirm."];
    }
    try {
        $out = tx(fn() => $fn($words));
        console_audit($s['short'], $line, true, $out);
        return ['ok' => true, 'output' => $out];
    } catch (ConsoleError $e) {
        console_audit($s['short'], $line, false, $e->getMessage());
        return ['ok' => false, 'output' => $e->getMessage() . "\nusage: $usage"];
    } catch (ApiError $e) {
        console_audit($s['short'], $line, false, $e->getMessage());
        return ['ok' => false, 'output' => 'error: ' . $e->getMessage()];
    }
}

function console_api(string $path): array
{
    if ($path === 'console/state') {
        $s = console_session();
        return ['enabled' => !empty(console_cfg()['key_hash']), 'unlocked' => (bool) $s, 'commands' => array_keys(console_commands())];
    }
    if ($path === 'console/unlock') return console_unlock((string) arg('key', ''));  // autocommit: failed attempts must persist
    if ($path === 'console/lock') return tx(fn() => console_lock());
    if ($path === 'console/exec') return console_exec((string) arg('command', ''), arg('confirm') !== null ? (string) arg('confirm') : null);
    fail('errors.notFound', [], 404);
}
