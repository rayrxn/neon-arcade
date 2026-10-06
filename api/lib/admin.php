<?php
// Tahap 2 — Admin panel di server: snapshot data asli + semua aksi admin (RBAC, alasan wajib, audit log).
// Port dari src/services/admin.js. Aksi yang sudah punya fungsi SQL teruji (functions.sql) memakai fungsi itu.
declare(strict_types=1);

const ROLE_RANK = ['super_admin' => 5, 'admin' => 4, 'moderator' => 3, 'support' => 2, 'developer' => 2, 'user' => 0];
const AUDIT_CODES = [
    'user.ban' => 'ADMIN_BAN', 'user.tempban' => 'ADMIN_TEMP_BAN', 'user.unban' => 'ADMIN_UNBAN', 'user.warn' => 'ADMIN_WARN',
    'user.unwarn' => 'ADMIN_REMOVE_WARNING', 'user.freeze' => 'ADMIN_FREEZE_ACCOUNT', 'user.unfreeze' => 'ADMIN_UNFREEZE_ACCOUNT',
    'chat.mute' => 'ADMIN_MUTE', 'chat.unmute' => 'ADMIN_UNMUTE', 'wallet.freeze' => 'ADMIN_FREEZE_WALLET', 'wallet.unfreeze' => 'ADMIN_UNFREEZE_WALLET',
    'wallet.reverse' => 'ADMIN_REVERSE_TRANSACTION', 'user.role' => 'ADMIN_CHANGE_ROLE', 'report.assign' => 'ADMIN_ASSIGN_REPORT', 'report.note' => 'ADMIN_REPORT_NOTE',
];

function code_for(string $action, ?string $currency = null): string
{
    if (in_array($action, ['wallet.add', 'wallet.remove', 'wallet.reset'], true)) return 'ADMIN_' . ($currency ?? 'AC') . '_ADJUSTMENT';
    return AUDIT_CODES[$action] ?? 'ADMIN_' . strtoupper(preg_replace('/[.\-]/', '_', $action));
}

/** Tulis audit log (append-only). */
function audit_log(array $admin, string $action, ?string $targetUser, ?string $label, ?string $entity, $before, $after, string $reason, ?string $currency = null): void
{
    q('INSERT INTO admin_audit_log (code, admin_id, admin_role, action, target_user, target_label, entity_id, previous, next, reason, ip, user_agent)
       VALUES (?, ?, ?::user_role, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?::inet, ?)',
        [code_for($action, $currency), $admin['id'], $admin['role'], $action, $targetUser, $label, $entity, jenc($before), jenc($after), $reason ?: '—', client_ip(), substr($_SERVER['HTTP_USER_AGENT'] ?? 'server', 0, 300)]);
}

function adm_reason($reason): string
{
    $r = trim((string) $reason);
    if (mb_strlen($r) < 5) fail('admin.errors.reason');
    return mb_substr($r, 0, 300);
}

function adm_target(array $admin, $userId, bool $allowSelf = false): array
{
    $t = is_string($userId) && preg_match('/^[0-9a-f-]{36}$/', $userId) ? q1('SELECT * FROM users WHERE id = ? FOR UPDATE', [$userId]) : null;
    if (!$t) fail('admin.errors.noUser');
    if (!$allowSelf && $t['id'] === $admin['id']) fail('admin.errors.self');
    if ($t['id'] !== $admin['id'] && (ROLE_RANK[$t['role']] ?? 0) >= (ROLE_RANK[$admin['role']] ?? 0)) fail('admin.errors.rank');
    return $t;
}

// ───────────────────────────── Snapshot ─────────────────────────────

function flag_view(array $f): array
{
    $ev = jdec($f['evidence'], []);
    return [
        'id' => $f['id'], 'type' => $f['type'], 'risk' => $f['risk'], 'status' => $f['status'], 'at' => iso_to_ms($f['created_at']), 'lastAt' => iso_to_ms($f['last_at']),
        'count' => (int) $f['occurrences'], 'sessionId' => $f['session_id'], 'game' => $f['game'] ?? null, 'expected' => $f['expected'], 'submitted' => $f['submitted'],
        'evidence' => (object) $ev, 'reviewedBy' => $f['reviewer'] ?? null, 'reviewedAt' => iso_to_ms($f['reviewed_at']), 'reviewReason' => $f['review_reason'],
    ];
}

function admin_user_view(array $u, array $profile, bool $sensitive): array
{
    $v = user_view($u, $profile);
    if (!$sensitive) $v['email'] = '';
    $v['key'] = $sensitive ? $u['email'] : 'u:' . $u['id'];
    $v['muteReason'] = $u['mute_reason'] ?? null;
    $v['lastSeenAt'] = iso_to_ms($u['last_seen_at'] ?? null);
    $v['loginHistory'] = array_map(fn($a) => ['at' => iso_to_ms($a['at']), 'ok' => (bool) $a['ok'], 'kind' => $a['ok'] ? 'login' : 'password'],
        q('SELECT ok, at FROM login_attempts WHERE email = ? ORDER BY at DESC LIMIT 30', [$u['email']])->fetchAll());
    $v['warnings'] = array_map(fn($w) => ['id' => $w['id'], 'reason' => $w['reason'], 'by' => $w['by_name'], 'byId' => $w['admin_id'], 'at' => iso_to_ms($w['created_at']),
        'removedAt' => iso_to_ms($w['removed_at']), 'removedBy' => $w['removed_name'], 'removeReason' => $w['remove_reason']],
        q('SELECT w.*, a.username AS by_name, r.username AS removed_name FROM user_warnings w LEFT JOIN users a ON a.id = w.admin_id LEFT JOIN users r ON r.id = w.removed_by WHERE w.user_id = ? ORDER BY w.created_at DESC', [$u['id']])->fetchAll());
    if ($v['ban']) $v['ban'] += ['by' => null, 'at' => null];
    return $v;
}

/** Semua data yang dibaca halaman admin (dibatasi permission). */
function admin_snapshot(array $me): array
{
    require_user_perm($me, 'dashboard');
    $sensitive = has_perm($me, 'users.sensitive');
    $users = [];
    $wallets = [];
    $progress = [];
    $flagsByUser = [];
    foreach (q('SELECT f.*, s.game, r.username AS reviewer FROM cheat_flags f LEFT JOIN game_sessions s ON s.id = f.session_id LEFT JOIN users r ON r.id = f.reviewed_by ORDER BY f.created_at DESC LIMIT 2000')->fetchAll() as $f) {
        $flagsByUser[$f['user_id']][] = flag_view($f);
    }
    foreach (q('SELECT u.*, d.progress, d.wallet_meta, d.profile FROM users u LEFT JOIN user_docs d ON d.user_id = u.id ORDER BY u.created_at')->fetchAll() as $r) {
        $profile = jdec($r['profile'], []);
        $meta = jdec($r['wallet_meta'], []) + ['inventory' => [], 'redeemed' => [], 'totalWagered' => 0, 'totalWon' => 0, 'rounds' => 0, 'wins' => 0, 'biggestWin' => null, 'lastBonusAt' => null];
        $users[] = admin_user_view($r, $profile, $sensitive);
        $wallets[$r['id']] = wallet_view($r['id'], $meta, 100);
        $p = normalize_progress(jdec($r['progress'], []));
        $p['flags'] = $flagsByUser[$r['id']] ?? [];
        $p['open'] = [];
        $progress[$r['id']] = progress_json($p);
    }
    $logs = array_map(fn($l) => [
        'id' => (string) $l['id'], 'at' => iso_to_ms($l['at']), 'code' => $l['code'], 'adminId' => $l['admin_id'] ?? 'system', 'adminName' => $l['admin_name'] ?? 'system',
        'role' => $l['admin_id'] ? $l['admin_role'] : 'system', 'action' => $l['action'], 'target' => $l['target_name'] ?? $l['target_label'], 'targetId' => $l['target_user'],
        'entityId' => $l['entity_id'], 'reason' => $l['reason'], 'before' => jdec($l['previous'], null), 'after' => jdec($l['next'], null),
        'device' => ['ip' => $l['ip'] ?? '—', 'agent' => $l['user_agent'] ?? '—', 'screen' => null],
    ], has_perm($me, 'logs.view') ? q('SELECT l.*, a.username AS admin_name, t.username AS target_name FROM admin_audit_log l LEFT JOIN users a ON a.id = l.admin_id LEFT JOIN users t ON t.id = l.target_user ORDER BY l.at DESC LIMIT 1500')->fetchAll() : []);
    $events = array_map(fn($e) => jdec($e['data'], []) + ['id' => (string) $e['id'], 'type' => $e['type'], 'userId' => $e['user_id'], 'at' => iso_to_ms($e['at'])],
        q('SELECT * FROM events ORDER BY at DESC LIMIT 2000')->fetchAll());
    $errors = array_map(fn($e) => ['id' => (string) $e['id'], 'at' => iso_to_ms($e['at']), 'context' => $e['context'], 'code' => $e['code'], 'message' => $e['message'], 'stack' => mb_substr((string) $e['stack'], 0, 600)],
        has_perm($me, 'system.manage') ? q('SELECT * FROM error_log ORDER BY at DESC LIMIT 200')->fetchAll() : []);
    return [
        'users' => $users, 'wallets' => (object) $wallets, 'progress' => (object) $progress,
        'admin' => ['logs' => $logs, 'events' => $events, 'errors' => $errors, 'codes' => (object) code_defs_view()],
        'serverTime' => now_ms(),
    ];
}

// ───────────────────────────── Aksi ─────────────────────────────

/** Jalankan fungsi admin SQL; error kodenya sama dengan frontend. */
function sql_admin(string $sql, array $params)
{
    return qv($sql, $params);
}

function lock_docs(string $userId): array
{
    return load_docs($userId);
}

function admin_action(array $me, string $name, array $a)
{
    $uid = $a['userId'] ?? null;
    switch ($name) {
        case 'editUser': {
            require_user_perm($me, 'users.edit');
            $r = adm_reason($a['reason'] ?? '');
            $t = adm_target($me, $uid, true);
            $patch = is_array($a['patch'] ?? null) ? $a['patch'] : [];
            $next = [];
            if (isset($patch['displayName'])) {
                $d = trim((string) $patch['displayName']);
                if (mb_strlen($d) < 2 || mb_strlen($d) > 24) fail('errors.displayNameLength');
                q('UPDATE users SET display_name = ? WHERE id = ?', [$d, $t['id']]);
                $next['displayName'] = $d;
            }
            if (isset($patch['username']) && $patch['username'] !== $t['username']) {
                $n = trim((string) $patch['username']);
                if (!preg_match('/^[a-zA-Z0-9_]{3,16}$/', $n)) fail('validation.usernameFormat');
                if (qv('SELECT 1 FROM users WHERE username = ? AND id <> ?', [$n, $t['id']])) fail('errors.usernameTaken');
                q('UPDATE users SET username = ? WHERE id = ?', [$n, $t['id']]);
                $next['username'] = $n;
            }
            if (!empty($patch['resetAvatar'])) {
                q("UPDATE users SET avatar = '{\"kind\":\"preset\",\"id\":\"steel\"}'::jsonb WHERE id = ?", [$t['id']]);
                $next['avatar'] = 'reset';
            }
            audit_log($me, 'user.edit', $t['id'], null, $t['id'], ['displayName' => $t['display_name'], 'username' => $t['username']], $next, $r);
            return ['ok' => true];
        }
        case 'setRole':
            if (!array_key_exists((string) ($a['role'] ?? ''), ROLE_RANK)) fail('admin.errors.invalid');
            sql_admin('SELECT admin_set_role(?::uuid, ?::uuid, ?::user_role, ?)', [$me['id'], $uid, (string) ($a['role'] ?? ''), adm_reason($a['reason'] ?? '')]);
            return ['ok' => true];
        case 'banUser': {
            $h = $a['hours'] ?? null;
            if ($h !== null && !is_numeric($h)) fail('admin.errors.invalid');
            sql_admin('SELECT admin_ban(?::uuid, ?::uuid, ?::int, ?)', [$me['id'], $uid, $h === null ? null : (int) round((float) $h), adm_reason($a['reason'] ?? '')]);
            return ['ok' => true];
        }
        case 'unbanUser':
            sql_admin('SELECT admin_unban(?::uuid, ?::uuid, ?)', [$me['id'], $uid, adm_reason($a['reason'] ?? '')]);
            return ['ok' => true];
        case 'freezeAccount': {
            require_user_perm($me, 'users.freeze');
            $r = adm_reason($a['reason'] ?? '');
            $t = adm_target($me, $uid);
            $frozen = !empty($a['frozen']);
            q('UPDATE users SET status = ?::account_status WHERE id = ?', [$frozen ? 'frozen' : 'active', $t['id']]);
            if ($frozen) q('DELETE FROM sessions WHERE user_id = ?', [$t['id']]);
            notify($t['id'], 'security', ['event' => $frozen ? 'frozen' : 'restored']);
            audit_log($me, $frozen ? 'user.freeze' : 'user.unfreeze', $t['id'], null, $t['id'], $t['status'], $frozen ? 'frozen' : 'active', $r);
            return ['ok' => true];
        }
        case 'freezeWallet':
            sql_admin('SELECT admin_freeze_wallet(?::uuid, ?::uuid, ?, ?)', [$me['id'], $uid, !empty($a['frozen']), adm_reason($a['reason'] ?? '')]);
            log_event(!empty($a['frozen']) ? 'WALLET_FROZEN' : 'WALLET_UNFROZEN', $uid, ['adminId' => $me['id']]);
            return ['ok' => true];
        case 'adjustCurrency': {
            $cur = (string) ($a['currency'] ?? '');
            $delta = $a['delta'] ?? null;
            if (!in_array($cur, ['AC', 'AG'], true) || !is_int($delta)) fail('admin.errors.invalid');
            $before = (float) qv($cur === 'AC' ? 'SELECT ac_balance FROM wallets WHERE user_id = ?' : 'SELECT ag_balance FROM wallets WHERE user_id = ?', [$uid]);
            sql_admin('SELECT admin_adjust(?::uuid, ?::uuid, ?::currency_code, ?::numeric, ?)', [$me['id'], $uid, $cur, (string) $delta, adm_reason($a['reason'] ?? '')]);
            return ['before' => num($before), 'change' => $delta, 'after' => num($before + $delta)];
        }
        case 'resetCurrency': {
            require_user_perm($me, 'wallet.manage');
            $r = adm_reason($a['reason'] ?? '');
            $t = adm_target($me, $uid, true);
            $which = (string) ($a['which'] ?? '');
            $list = $which === 'both' ? ['AC', 'AG'] : (in_array($which, ['AC', 'AG'], true) ? [$which] : fail('admin.errors.invalid'));
            $w = q1('SELECT ac_balance, ag_balance FROM wallets WHERE user_id = ? FOR UPDATE', [$t['id']]);
            $before = [];
            foreach ($list as $c) {
                $bal = (float) ($c === 'AC' ? $w['ac_balance'] : $w['ag_balance']);
                $before[$c] = num($bal);
                if ($bal > 0) {
                    $tx = wallet_post_admin($t['id'], $c, -$bal, $me['id'], $r);
                    notify($t['id'], 'adminDebit', ['amount' => num($bal), 'currency' => $c]);
                }
            }
            audit_log($me, 'wallet.reset', $t['id'], null, $t['id'], $before, array_fill_keys($list, 0), $r, $list[0]);
            return ['ok' => true];
        }
        case 'resetProgress': {
            require_user_perm($me, 'progress.reset');
            $r = adm_reason($a['reason'] ?? '');
            $t = adm_target($me, $uid, true);
            $part = (string) ($a['part'] ?? '');
            [$p, $meta, $profile] = lock_docs($t['id']);
            $fresh = empty_progress();
            $before = null;
            if ($part === 'progression') { $before = ['xp' => $p['xp']]; $p['xp'] = 0; $p['achievements'] = []; $p['stats'] = $fresh['stats']; }
            elseif ($part === 'quests') $p['quests'] = $fresh['quests'];
            elseif ($part === 'daily') { $before = $p['daily']; $p['daily'] = $fresh['daily']; }
            elseif ($part === 'profile') {
                q("UPDATE users SET display_name = username, avatar = '{\"kind\":\"preset\",\"id\":\"steel\"}'::jsonb WHERE id = ?", [$t['id']]);
                $profile = ['frame' => null, 'equipped' => [], 'avatarSet' => false];
            } else fail('admin.errors.invalid');
            if ($part === 'progression') q('DELETE FROM user_achievements WHERE user_id = ?', [$t['id']]);
            save_docs($t['id'], $p, $meta, $profile);
            audit_log($me, "progress.reset.$part", $t['id'], null, $t['id'], $before, null, $r);
            return ['ok' => true];
        }
        case 'updateFlag': {
            require_user_perm($me, 'anticheat');
            $r = adm_reason($a['reason'] ?? '');
            $status = (string) ($a['status'] ?? '');
            if (!in_array($status, ['open', 'reviewing', 'confirmed', 'dismissed'], true)) fail('admin.errors.invalid');
            $f = preg_match('/^[0-9a-f-]{36}$/', (string) ($a['flagId'] ?? '')) ? q1('SELECT * FROM cheat_flags WHERE id = ? FOR UPDATE', [$a['flagId']]) : null;
            if (!$f) fail('errors.notFound');
            q('UPDATE cheat_flags SET status = ?, reviewed_by = ?, reviewed_at = now(), review_reason = ? WHERE id = ?', [$status, $me['id'], $r, $f['id']]);
            audit_log($me, "anticheat.$status", $f['user_id'], null, $f['id'], $f['status'], $status, $r);
            return ['ok' => true];
        }
        case 'invalidateSession': {
            require_user_perm($me, 'sessions.invalidate');
            $r = adm_reason($a['reason'] ?? '');
            $sid = (string) ($a['sessionId'] ?? '');
            $gs = preg_match('/^[0-9a-f-]{36}$/', $sid) ? q1('SELECT * FROM game_sessions WHERE id = ? FOR UPDATE', [$sid]) : null;
            if (!$gs || $gs['status'] === 'OPEN') fail('admin.errors.noSession');
            if (qv('SELECT 1 FROM session_invalidations WHERE session_id = ?', [$sid])) fail('admin.errors.alreadyDone');
            $userId = $gs['user_id'];
            [$p, $meta] = lock_docs($userId);
            $gain = round2((float) $gs['payout'] - (float) $gs['bet']);
            $bal = (float) qv('SELECT ac_balance FROM wallets WHERE user_id = ? FOR UPDATE', [$userId]);
            $removed = $gain > 0 && !$gs['is_test'] ? min($gain, $bal) : 0;
            $rev = null;
            if ($removed > 0) $rev = (string) qv("SELECT wallet_post(?::uuid, 'AC', ?::numeric, 'reversal', 'reversal', 'admin', ?, ?::uuid, ?::uuid, ?::uuid, ?)",
                [$userId, (string) -$removed, $r, $sid, $me['id'], $gs['payout_tx_id'], 'invalidate:' . $sid]);
            $original = ['result' => ['WON' => 'win', 'DRAW' => 'push'][$gs['status']] ?? 'loss', 'payout' => num($gs['payout']), 'multiplier' => num($gs['multiplier'])];
            $violation = mb_substr((string) ($a['violation'] ?? 'manual'), 0, 32);
            q('INSERT INTO session_invalidations (session_id, original_result, violation, reversal_tx_id, admin_id, reason) VALUES (?, ?::jsonb, ?, ?, ?, ?)', [$sid, jenc($original), $violation, $rev, $me['id'], $r]);
            q("UPDATE game_sessions SET status = 'INVALID', verification = 'rejected' WHERE id = ?", [$sid]);
            $record = ['originalResult' => $original, 'violation' => $violation, 'action' => $removed > 0 ? 'rewardRemoved' : 'sessionInvalidated', 'removed' => $removed, 'admin' => $me['username'], 'reason' => $r, 'at' => now_ms()];
            foreach ($p['sessions'] as &$s) if ($s['id'] === $sid) { $s['invalidated'] = $record; $s['status'] = 'INVALID'; }
            unset($s);
            save_docs($userId, $p, $meta);
            notify($userId, 'security', ['event' => 'sessionInvalidated', 'game' => $gs['game']]);
            audit_log($me, 'anticheat.invalidate', $userId, null, $sid, $original, ['removed' => $removed], $r);
            return $record;
        }
        case 'deleteMessage': {
            require_user_perm($me, 'moderation');
            $r = adm_reason($a['reason'] ?? '');
            $m = preg_match('/^[0-9a-f-]{36}$/', (string) ($a['messageId'] ?? '')) ? q1('SELECT * FROM chat_messages WHERE id = ?', [$a['messageId']]) : null;
            if (!$m) fail('admin.errors.invalid');
            q('UPDATE chat_messages SET deleted_by = ?, deleted_at = now(), delete_reason = ? WHERE id = ?', [$me['id'], $r, $m['id']]);
            audit_log($me, 'chat.delete', $m['user_id'], null, $m['id'], $m['body'], null, $r);
            log_event('MESSAGE_DELETED', $m['user_id'], ['messageId' => $m['id'], 'adminId' => $me['id']]);
            return ['ok' => true];
        }
        case 'muteUser': {
            $min = $a['minutes'] ?? null;
            $r = adm_reason($a['reason'] ?? '');
            sql_admin('SELECT admin_mute(?::uuid, ?::uuid, ?::int, ?)', [$me['id'], $uid, $min === null ? null : (int) $min, $r]);
            q('UPDATE users SET mute_reason = ? WHERE id = ?', [$min === 0 ? null : $r, $uid]);
            log_event($min === 0 ? 'USER_UNMUTED' : 'USER_MUTED', $uid, ['adminId' => $me['id']]);
            return ['ok' => true];
        }
        case 'warnUser':
            $wid = sql_admin('SELECT admin_warn(?::uuid, ?::uuid, ?)', [$me['id'], $uid, adm_reason($a['reason'] ?? '')]);
            log_event('USER_WARNED', $uid, ['warningId' => $wid, 'adminId' => $me['id']]);
            return ['id' => $wid];
        case 'removeWarning': {
            require_user_perm($me, 'users.warn');
            $r = adm_reason($a['reason'] ?? '');
            $t = adm_target($me, $uid);
            $w = preg_match('/^[0-9a-f-]{36}$/', (string) ($a['warningId'] ?? '')) ? q1('SELECT * FROM user_warnings WHERE id = ? AND user_id = ?', [$a['warningId'], $t['id']]) : null;
            if (!$w || $w['removed_at']) fail('admin.errors.alreadyDone');
            q('UPDATE user_warnings SET removed_at = now(), removed_by = ?, remove_reason = ? WHERE id = ?', [$me['id'], $r, $w['id']]);
            notify($t['id'], 'security', ['event' => 'warningRemoved']);
            audit_log($me, 'user.unwarn', $t['id'], null, $w['id'], $w['reason'], null, $r);
            return ['ok' => true];
        }
        case 'reverseTransaction': {
            $txId = (string) ($a['txId'] ?? '');
            if (!preg_match('/^[0-9a-f-]{36}$/', $txId)) fail('admin.errors.noTx');
            $rev = sql_admin('SELECT admin_reverse(?::uuid, ?::uuid, ?)', [$me['id'], $txId, adm_reason($a['reason'] ?? '')]);
            return ['id' => $rev];
        }
        case 'reportAction': {
            require_user_perm($me, 'reports.manage');
            $rid = (string) ($a['reportId'] ?? '');
            $action = (string) ($a['action'] ?? '');
            $rp = preg_match('/^[0-9a-f-]{36}$/', $rid) ? q1('SELECT * FROM reports WHERE id = ? FOR UPDATE', [$rid]) : null;
            if (!$rp) fail('errors.notFound');
            if ($action === 'note') {
                $text = trim((string) ($a['note'] ?? ''));
                if (mb_strlen($text) < 2) fail('admin.errors.reason');
                q("INSERT INTO report_events (report_id, admin_id, action, note) VALUES (?, ?, 'note', ?)", [$rid, $me['id'], mb_substr($text, 0, 1000)]);
                audit_log($me, 'report.note', $rp['target_user_id'], null, $rid, $rp['status'], null, mb_substr($text, 0, 120));
                return ['ok' => true];
            }
            if ($action === 'assign') {
                $aid = $a['assigneeId'] ?? null;
                $as = null;
                if ($aid) {
                    $as = preg_match('/^[0-9a-f-]{36}$/', (string) $aid) ? q1('SELECT * FROM users WHERE id = ?', [$aid]) : null;
                    if (!$as || !has_perm($as, 'reports.manage')) fail('admin.errors.invalid');
                }
                q('UPDATE reports SET assignee_id = ? WHERE id = ?', [$as['id'] ?? null, $rid]);
                q("INSERT INTO report_events (report_id, admin_id, action, note) VALUES (?, ?, 'assign', ?)", [$rid, $me['id'], $as['username'] ?? '—']);
                audit_log($me, 'report.assign', $rp['target_user_id'], null, $rid, $rp['assignee_id'] ? username_of($rp['assignee_id']) : null, $as['username'] ?? null, '—');
                return ['ok' => true];
            }
            if ($action === 'reopen' && in_array($rp['status'], ['new', 'investigating', 'escalated'], true)) fail('admin.errors.invalid');
            $reason = $action === 'investigate' ? null : (string) (($a['reason'] ?? '') ?: ($a['resolution'] ?? ''));
            $status = sql_admin('SELECT report_action(?::uuid, ?::uuid, ?, ?)', [$me['id'], $rid, $action, $reason]);
            return ['status' => $status];
        }
        case 'setMaintenance': {
            require_user_perm($me, 'system.manage');
            $r = adm_reason($a['reason'] ?? '');
            $s = q1('SELECT * FROM system_settings WHERE id = 1');
            $until = !empty($a['until']) ? (is_numeric($a['until']) ? date('c', (int) ($a['until'] / 1000)) : date('c', strtotime((string) $a['until']))) : null;
            $msg = mb_substr(trim((string) ($a['message'] ?? '')), 0, 300);
            q('UPDATE system_settings SET maintenance_enabled = ?, maintenance_message = ?, maintenance_until = ? WHERE id = 1', [!empty($a['enabled']), $msg, $until]);
            audit_log($me, !empty($a['enabled']) ? 'system.maintenance.on' : 'system.maintenance.off', null, 'maintenance', null,
                ['enabled' => (bool) $s['maintenance_enabled'], 'message' => $s['maintenance_message']], ['enabled' => !empty($a['enabled']), 'message' => $msg, 'until' => $until], $r);
            log_event(!empty($a['enabled']) ? 'MAINTENANCE_STARTED' : 'MAINTENANCE_ENDED', $me['id'], ['until' => $until]);
            return ['ok' => true];
        }
        case 'setServiceStatus': {
            require_user_perm($me, 'system.manage');
            $r = adm_reason($a['reason'] ?? '');
            $svc = (string) ($a['service'] ?? '');
            $st = $a['status'] ?? null;
            if (!in_array($svc, ['website', 'api', 'database', 'auth', 'games', 'chat', 'notifications'], true) || ($st && !in_array($st, ['OPERATIONAL', 'DEGRADED', 'MAINTENANCE', 'OUTAGE'], true))) fail('admin.errors.invalid');
            $before = qv('SELECT status FROM service_status_overrides WHERE service = ?', [$svc]) ?: 'auto';
            if ($st) q('INSERT INTO service_status_overrides (service, status, note, admin_id) VALUES (?, ?::service_status, ?, ?) ON CONFLICT (service) DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, admin_id = EXCLUDED.admin_id, updated_at = now()',
                [$svc, $st, mb_substr(trim((string) ($a['note'] ?? '')), 0, 200) ?: null, $me['id']]);
            else q('DELETE FROM service_status_overrides WHERE service = ?', [$svc]);
            audit_log($me, 'system.service', null, $svc, null, $before, $st ?? 'auto', $r);
            return ['ok' => true];
        }
        case 'setAutoFreeze': {
            require_user_perm($me, 'system.manage');
            $r = adm_reason($a['reason'] ?? '');
            q('UPDATE system_settings SET auto_freeze_critical = ? WHERE id = 1', [!empty($a['on'])]);
            audit_log($me, 'system.autofreeze', null, 'anticheat', null, empty($a['on']), !empty($a['on']), $r);
            return ['ok' => true];
        }
        case 'setSlowMode': {
            require_user_perm($me, 'moderation');
            $r = adm_reason($a['reason'] ?? '');
            $v = max(0, min(300, (int) round((float) ($a['seconds'] ?? 0))));
            $before = (int) qv('SELECT chat_slow_mode_sec FROM system_settings WHERE id = 1');
            q('UPDATE system_settings SET chat_slow_mode_sec = ? WHERE id = 1', [$v]);
            audit_log($me, 'chat.slowmode', null, 'global-chat', null, $before, $v, $r);
            return ['ok' => true];
        }
        case 'endSeasonNow': {
            require_user_perm($me, 'system.manage');
            $r = adm_reason($a['reason'] ?? '');
            $now = now_ms();
            $cur = current_season($now);
            $next = ['id' => $cur['id'] + 1, 'startAt' => $now, 'endAt' => $now + SEASON_LENGTH_DAYS * DAY_MS];
            q("INSERT INTO neon_kv (key, value) VALUES ('season', ?::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [jenc($next)]);
            audit_log($me, 'season.end', null, 'season-' . $cur['id'], null, $cur['id'], $next['id'], $r);
            log_event('SEASON_ENDED', $me['id'], ['seasonId' => $cur['id']]);
            return $next;
        }
        case 'createCode': {
            require_user_perm($me, 'codes.manage');
            $r = adm_reason($a['reason'] ?? '');
            $key = preg_replace('/[^A-Z0-9]/', '', strtoupper((string) ($a['code'] ?? '')));
            if (!preg_match('/^[A-Z0-9]{4,16}$/', $key)) fail('redeem.errors.format');
            if (qv('SELECT 1 FROM redeem_codes WHERE code = ?', [$key])) fail('admin.errors.codeExists');
            $kind = (string) ($a['kind'] ?? '');
            if ($kind === 'item') {
                if (!in_array($a['itemId'] ?? '', ITEM_IDS, true)) fail('admin.errors.invalid');
                $reward = ['kind' => 'item', 'id' => $a['itemId']];
            } else {
                $amt = $a['amount'] ?? null;
                if (!in_array($kind, ['AC', 'AG'], true) || !is_int($amt) || $amt < 1) fail('admin.errors.invalid');
                if ($kind === 'AG' && $amt > 10) fail('admin.errors.agLimit');
                $reward = ['kind' => $kind, 'amount' => $amt];
            }
            $max = (int) ($a['maxUses'] ?? 0);
            $per = max(1, min(10, (int) ($a['perUser'] ?? 1)));
            $exp = !empty($a['expiresAt']) ? (is_numeric($a['expiresAt']) ? date('c', (int) ($a['expiresAt'] / 1000)) : date('c', strtotime((string) $a['expiresAt']))) : null;
            q('INSERT INTO redeem_codes (code, rewards, max_uses, per_user, expires_at, active, created_by) VALUES (?, ?::jsonb, ?, ?, ?, ?, ?)',
                [$key, jenc([$reward]), $max > 0 ? $max : null, $per, $exp, !empty($a['active']), $me['id']]);
            audit_log($me, 'code.create', null, $key, $key, null, ['reward' => $reward, 'maxUses' => $max ?: null, 'perUser' => $per, 'expiresAt' => $exp], $r);
            return ['code' => $key];
        }
        case 'setCodeActive': {
            require_user_perm($me, 'codes.manage');
            $r = adm_reason($a['reason'] ?? '');
            $code = (string) ($a['code'] ?? '');
            if (!qv('SELECT 1 FROM redeem_codes WHERE code = ?', [$code])) fail('errors.notFound');
            q('UPDATE redeem_codes SET active = ? WHERE code = ?', [!empty($a['active']), $code]);
            audit_log($me, !empty($a['active']) ? 'code.enable' : 'code.disable', null, $code, $code, empty($a['active']), !empty($a['active']), $r);
            return ['ok' => true];
        }
        case 'saveAnnouncement': {
            require_user_perm($me, 'announcements.manage');
            $r = adm_reason($a['reason'] ?? '');
            $d = is_array($a['data'] ?? null) ? $a['data'] : [];
            $title = trim((string) ($d['title'] ?? ''));
            $msg = trim((string) ($d['message'] ?? ''));
            if (mb_strlen($title) < 3 || mb_strlen($msg) < 3) fail('admin.errors.announcement');
            $type = in_array($d['type'] ?? '', ['info', 'event', 'update', 'maintenance'], true) ? $d['type'] : 'info';
            $toIso = fn($v) => !empty($v) ? (is_numeric($v) ? date('c', (int) ($v / 1000)) : date('c', strtotime((string) $v))) : null;
            $start = $toIso($d['startAt'] ?? null) ?? date('c');
            $end = $toIso($d['endAt'] ?? null);
            $active = !empty($d['active']);
            $isNew = empty($d['id']) || !qv('SELECT 1 FROM announcements WHERE id::text = ?', [(string) $d['id']]);
            if ($isNew) {
                $id = (string) qv('INSERT INTO announcements (title, message, type, start_at, end_at, active, created_by) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id',
                    [mb_substr($title, 0, 80), mb_substr($msg, 0, 400), $type, $start, $end, $active, $me['id']]);
                if ($active) q("INSERT INTO notifications (user_id, kind, data) SELECT id, 'announcement', ?::jsonb FROM users", [jenc(['title' => mb_substr($title, 0, 80), 'message' => mb_substr($msg, 0, 400)])]);
            } else {
                $id = (string) $d['id'];
                q('UPDATE announcements SET title = ?, message = ?, type = ?, start_at = ?, end_at = ?, active = ? WHERE id = ?', [mb_substr($title, 0, 80), mb_substr($msg, 0, 400), $type, $start, $end, $active, $id]);
            }
            audit_log($me, $isNew ? 'announcement.create' : 'announcement.update', null, mb_substr($title, 0, 80), $id, null, ['active' => $active, 'type' => $type], $r);
            return announcement_view(q1('SELECT * FROM announcements WHERE id = ?', [$id]));
        }
        case 'setGameStatus': {
            require_user_perm($me, 'games.manage');
            $r = adm_reason($a['reason'] ?? '');
            $slug = (string) ($a['slug'] ?? '');
            $st = (string) ($a['status'] ?? '');
            $before = qv('SELECT status FROM games WHERE slug = ?', [$slug]);
            if (!$before || !in_array($st, ['live', 'maintenance', 'disabled'], true)) fail('admin.errors.invalid');
            q('UPDATE games SET status = ? WHERE slug = ?', [$st, $slug]);
            audit_log($me, 'game.status', null, $slug, $slug, $before, $st, $r);
            return ['ok' => true];
        }
        case 'setGameMaxBet': {
            require_user_perm($me, 'games.manage');
            $r = adm_reason($a['reason'] ?? '');
            $slug = (string) ($a['slug'] ?? '');
            $mb = $a['maxBet'] ?? null;
            $before = qv('SELECT max_bet FROM games WHERE slug = ?', [$slug]);
            if (!$before || !is_int($mb) || $mb < 10 || $mb > 100000) fail('admin.errors.invalid');
            q('UPDATE games SET max_bet = ? WHERE slug = ?', [$mb, $slug]);
            audit_log($me, 'game.maxBet', null, $slug, $slug, (int) $before, $mb, $r);
            return ['ok' => true];
        }
        case 'setTestAccount': {
            require_user_perm($me, 'testmode');
            $r = adm_reason($a['reason'] ?? '');
            $t = is_string($uid) && preg_match('/^[0-9a-f-]{36}$/', $uid) ? q1('SELECT * FROM users WHERE id = ?', [$uid]) : null;
            if (!$t) fail('admin.errors.noUser');
            if ($t['id'] !== $me['id'] && (ROLE_RANK[$t['role']] ?? 0) >= (ROLE_RANK[$me['role']] ?? 0)) fail('admin.errors.rank');
            if (qv("SELECT 1 FROM game_sessions WHERE user_id = ? AND status = 'OPEN'", [$t['id']])) fail('play.errors.roundOpen');
            $on = !empty($a['isTest']);
            q("UPDATE users SET is_test = ?, test_control = 'off' WHERE id = ?", [$on, $t['id']]);
            audit_log($me, $on ? 'test.enable' : 'test.disable', $t['id'], null, $t['id'], !$on, $on, $r);
            return ['ok' => true];
        }
        case 'setTestControl': {
            require_user_perm($me, 'testmode');
            $r = adm_reason($a['reason'] ?? '');
            $t = is_string($uid) && preg_match('/^[0-9a-f-]{36}$/', $uid) ? q1('SELECT * FROM users WHERE id = ?', [$uid]) : null;
            if (!$t || !$t['is_test']) fail('admin.errors.notTest');
            $mode = (string) ($a['mode'] ?? '');
            if (!in_array($mode, ['off', 'win', 'loss'], true)) fail('admin.errors.invalid');
            q('UPDATE users SET test_control = ? WHERE id = ?', [$mode, $t['id']]);
            audit_log($me, 'test.control', $t['id'], null, $t['id'], $t['test_control'], $mode, $r);
            return ['ok' => true];
        }
        case 'simulate': {
            require_user_perm($me, 'testmode');
            $r = adm_reason($a['reason'] ?? '');
            $t = is_string($uid) && preg_match('/^[0-9a-f-]{36}$/', $uid) ? q1('SELECT * FROM users WHERE id = ?', [$uid]) : null;
            if (!$t || !$t['is_test']) fail('admin.errors.notTest');
            $kind = (string) ($a['kind'] ?? '');
            if ($kind === 'wins10' || $kind === 'losses10') {
                [$p, $meta] = lock_docs($t['id']);
                $win = $kind === 'wins10';
                for ($i = 0; $i < 10; $i++) array_unshift($p['sessions'], ['id' => rand_hex(8), 'game' => 'dice', 'bet' => 100, 'payout' => $win ? 198 : 0, 'multiplier' => $win ? 1.98 : 0,
                    'result' => $win ? 'win' : 'loss', 'status' => $win ? 'WON' : 'LOST', 'at' => now_ms(), 'isTest' => true, 'nonce' => 0, 'detail' => ['simulated' => true], 'xp' => 0]);
                $p['sessions'] = array_slice($p['sessions'], 0, 100);
                save_docs($t['id'], $p, $meta);
            } elseif ($kind === 'jackpot') notify($t['id'], 'jackpot', ['username' => $t['username'], 'amount' => 25000, 'game' => 'jackpot', 'test' => true]);
            elseif ($kind === 'reward') notify($t['id'], 'adminCredit', ['amount' => 500, 'currency' => 'AC', 'test' => true]);
            elseif ($kind === 'levelUp') notify($t['id'], 'levelUp', ['level' => 99, 'test' => true]);
            elseif ($kind === 'quest') notify($t['id'], 'quest', ['scope' => 'daily', 'quest' => 'play3', 'test' => true]);
            elseif ($kind === 'daily') notify($t['id'], 'daily', ['day' => 7, 'rewards' => [['kind' => 'AC', 'amount' => 1500]], 'test' => true]);
            else fail('admin.errors.invalid');
            audit_log($me, "test.simulate.$kind", $t['id'], null, $t['id'], null, ['isTest' => true], $r);
            return ['ok' => true];
        }
        case 'logAdminLogin':
            if (!has_perm($me, 'dashboard')) return ['ok' => false];
            if (!qv("SELECT 1 FROM admin_audit_log WHERE admin_id = ? AND action = 'admin.login' AND at > now() - interval '6 hours'", [$me['id']])) {
                audit_log($me, 'admin.login', null, null, null, null, null, '—');
            }
            return ['ok' => true];
        // Tiket support (staff)
        case 'setTicketStatus': return ticket_status($me, (string) ($a['ticketId'] ?? ''), (string) ($a['status'] ?? ''));
        case 'assignTicket': return ticket_assign($me, (string) ($a['ticketId'] ?? ''), $a['adminId'] ?? null);
        case 'addTicketNote': return ticket_note($me, (string) ($a['ticketId'] ?? ''), $a['text'] ?? '');
    }
    fail('errors.notFound', [], 404);
}

/** Debit/kredit admin langsung lewat ledger (dipakai reset saldo). */
function wallet_post_admin(string $userId, string $currency, float $amount, string $adminId, string $reason): string
{
    return (string) qv("SELECT wallet_post(?::uuid, ?::currency_code, ?::numeric, 'adjust', 'admin', 'admin', ?, NULL, ?::uuid, NULL, ?)",
        [$userId, $currency, (string) $amount, $reason, $adminId, 'admin:' . rand_hex(12)]);
}
