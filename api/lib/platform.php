<?php
// Tahap 2 — data bersama & aksi sosial: direktori pemain, presence, chat, teman/blokir/favorit,
// notifikasi, transfer, redeem, jackpot, laporan, tiket support.
// Port dari src/services/{transfers,redeem,jackpot,chat,social,reports,support}.js.
declare(strict_types=1);

const TRANSFER_LIMITS = ['AC' => ['min' => 10, 'max' => 100000, 'daily' => 50000], 'AG' => ['min' => 1, 'max' => 10, 'daily' => 3]];
const AG_HOLD_S = 60;
const JACKPOT_THRESHOLD = 10000;
const ONLINE_WINDOW_MS = 75000;
const EMOTES = ['emote-gg' => ['gg', 'GG'], 'emote-wave' => ['wave', '👋'], 'emote-fire' => ['fire', '🔥'], 'emote-gem' => ['gem', '💎']];
const FREE_EMOTES = ['emote-gg', 'emote-wave'];
const CHAT_BADGES = ['chat-star', 'chat-bolt'];
const ITEM_IDS = [
    'neon-frame', 'gold-frame', 'violet-frame', 'crimson-frame', 'mint-frame', 'avatar-aurora', 'avatar-ember', 'badge-first-win', 'badge-streak-7',
    'badge-streak-30', 'badge-level-15', 'badge-level-50', 'badge-quest', 'badge-season', 'title-rookie', 'title-grinder', 'title-quest-master',
    'title-veteran', 'title-legend', 'chat-star', 'chat-bolt', 'banner-aurora', 'banner-ember', 'banner-ocean', 'emote-gg', 'emote-wave', 'emote-fire', 'emote-gem',
];
const GAME_SLUGS = ['dice', 'limbo', 'coinflip', 'plinko', 'roulette', 'case-opening', 'case-battle', 'crash', 'mines', 'blackjack'];
const REPORT_TYPES = ['player', 'message', 'profile', 'game', 'technical', 'other'];
const REPORT_REASONS = ['cheating', 'harassment', 'spam', 'offensive', 'scam', 'bug', 'other'];
const TICKET_CATEGORIES = ['account', 'wallet', 'game', 'bug', 'report', 'other'];
const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_FOR_USER', 'RESOLVED', 'CLOSED'];

function is_staff_role(string $role): bool
{
    return in_array($role, ['super_admin', 'admin', 'moderator', 'support', 'developer'], true);
}

function has_perm(array $u, string $perm): bool
{
    return (bool) qv('SELECT 1 FROM role_permissions WHERE role = ?::user_role AND permission = ?', [$u['role'], $perm]);
}

function require_user_perm(array $u, string $perm): void
{
    if (!has_perm($u, $perm) || qv('SELECT account_block(?::uuid)', [$u['id']])) fail('admin.errors.forbidden', [], 403);
}

/** Tandai online (dibatasi sekali per 30 detik). */
function touch_presence(array $u): void
{
    if (empty($u['last_seen_at']) || time() - strtotime($u['last_seen_at']) > 30) {
        q('UPDATE users SET last_seen_at = now() WHERE id = ?', [$u['id']]);
    }
}

function username_of(?string $id): string
{
    if (!$id) return '—';
    return (string) (qv('SELECT username FROM users WHERE id = ?', [$id]) ?: '—');
}

// ───────────────────────────── Direktori pemain (tanpa email) ─────────────────────────────

function public_user_view(array $u, array $profile): array
{
    $v = user_view($u, $profile);
    $v['email'] = '';
    $v['key'] = 'u:' . $u['id'];
    $v['lastSeenAt'] = iso_to_ms($u['last_seen_at'] ?? null);
    unset($v['testControl'], $v['mustChangePassword']);
    return $v;
}

/** Progres pemain lain secukupnya untuk leaderboard, profil publik, trending (tanpa flag & detail sesi). */
function progress_summary(array $p): array
{
    $p = normalize_progress($p);
    $sessions = array_map(fn($s) => [
        'id' => $s['id'], 'game' => $s['game'], 'bet' => $s['bet'], 'payout' => $s['payout'], 'multiplier' => $s['multiplier'],
        'result' => $s['result'], 'status' => $s['status'] ?? null, 'at' => $s['at'], 'isTest' => !empty($s['isTest']), 'xp' => $s['xp'] ?? 0,
    ], array_slice($p['sessions'], 0, 20));
    return progress_json([
        'xp' => $p['xp'], 'stats' => $p['stats'], 'daily' => $p['daily'], 'quests' => ['daily' => ['period' => null, 'progress' => [], 'claimed' => []], 'weekly' => ['period' => null, 'progress' => [], 'claimed' => []], 'completed' => $p['quests']['completed'] ?? 0],
        'achievements' => $p['achievements'], 'sessions' => $sessions, 'open' => [], 'flags' => [], 'loginDays' => [], 'levelHistory' => array_slice($p['levelHistory'], 0, 20),
        'milestones' => [], 'season' => $p['season'], 'seasonHistory' => $p['seasonHistory'], 'periodStats' => $p['periodStats'], 'recentXp' => [],
    ]);
}

// ───────────────────────────── Bentuk data frontend ─────────────────────────────

function chat_view(array $m): array
{
    $data = jdec($m['data'] ?? null, []);
    $v = ['id' => $m['id'], 'type' => $m['type'], 'userId' => $m['user_id'], 'text' => $m['body'], 'at' => iso_to_ms($m['created_at']), 'flagged' => (bool) $m['flagged'], 'badge' => $m['badge'], 'reports' => (int) ($m['reports'] ?? 0)];
    if (!empty($data['jackpotId'])) $v['jackpotId'] = $data['jackpotId'];
    if ($m['deleted_at']) $v['deleted'] = ['by' => username_of($m['deleted_by']), 'at' => iso_to_ms($m['deleted_at']), 'reason' => $m['delete_reason']];
    return $v;
}

function report_view(array $r): array
{
    $events = q('SELECT e.*, u.username AS admin_name FROM report_events e LEFT JOIN users u ON u.id = e.admin_id WHERE report_id = ? ORDER BY at', [$r['id']])->fetchAll();
    $notes = [];
    $history = [];
    foreach ($events as $e) {
        $by = $e['admin_name'] ?? ($r['reporter_id'] ? username_of($r['reporter_id']) : 'system');
        if ($e['action'] === 'note') $notes[] = ['id' => (string) $e['id'], 'by' => $by, 'text' => $e['note'], 'at' => iso_to_ms($e['at'])];
        else {
            $h = ['at' => iso_to_ms($e['at']), 'by' => $by, 'action' => $e['action']];
            $map = ['created' => 'new', 'investigate' => 'investigating', 'resolve' => 'resolved', 'dismiss' => 'dismissed', 'escalate' => 'escalated', 'reopen' => 'investigating'];
            if (isset($map[$e['action']])) $h['status'] = $map[$e['action']];
            if ($e['action'] === 'assign') $h['to'] = $e['note'];
            elseif ($e['note'] && $e['action'] !== 'created') $h['reason'] = $e['note'];
            $history[] = $h;
        }
    }
    $assignee = $r['assignee_id'] ? ['id' => $r['assignee_id'], 'name' => username_of($r['assignee_id'])] : null;
    $resolver = null;
    foreach (array_reverse($events) as $e) if (in_array($e['action'], ['resolve', 'dismiss'], true)) { $resolver = $e['admin_name']; break; }
    return [
        'id' => $r['id'], 'at' => iso_to_ms($r['created_at']),
        'reporterId' => $r['reporter_id'] ?? 'system', 'reporterName' => $r['reporter_id'] ? username_of($r['reporter_id']) : 'Anti-cheat',
        'targetType' => $r['target_type'], 'targetUserId' => $r['target_user_id'], 'targetName' => $r['target_user_id'] ? username_of($r['target_user_id']) : null,
        'messageId' => $r['message_id'], 'sessionId' => $r['session_id'], 'flagId' => $r['flag_id'],
        'category' => $r['category'] ?? $r['reason'], 'description' => $r['description'], 'evidence' => (object) jdec($r['evidence'], []),
        'status' => $r['status'], 'priority' => $r['priority'], 'assignee' => $assignee, 'notes' => $notes, 'history' => $history,
        'resolution' => $r['resolution'], 'resolvedAt' => iso_to_ms($r['resolved_at']), 'resolvedBy' => $resolver,
    ];
}

function ticket_view(array $t, bool $staff): array
{
    $msgs = q('SELECT m.*, u.username FROM ticket_messages m JOIN users u ON u.id = m.author_id WHERE ticket_id = ? ORDER BY m.id', [$t['id']])->fetchAll();
    $messages = [];
    $notes = [];
    foreach ($msgs as $m) {
        if ($m['internal']) {
            if ($staff) $notes[] = ['id' => (string) $m['id'], 'by' => $m['username'], 'text' => $m['body'], 'at' => iso_to_ms($m['created_at'])];
            continue;
        }
        $messages[] = ['id' => (string) $m['id'], 'by' => $m['author_id'], 'name' => $m['username'], 'staff' => (bool) $m['is_staff'], 'text' => $m['body'], 'at' => iso_to_ms($m['created_at'])];
    }
    return [
        'id' => $t['id'], 'userId' => $t['user_id'], 'username' => username_of($t['user_id']), 'category' => $t['category'], 'subject' => $t['subject'],
        'status' => $t['status'], 'assignee' => $t['assignee_id'] ? ['id' => $t['assignee_id'], 'name' => username_of($t['assignee_id'])] : null,
        'info' => (object) jdec($t['info'], []), 'createdAt' => iso_to_ms($t['created_at']), 'updatedAt' => iso_to_ms($t['updated_at']), 'closedAt' => iso_to_ms($t['closed_at']),
        'messages' => $messages, 'notes' => $notes, 'history' => jdec($t['history'], []),
    ];
}

function announcement_view(array $a): array
{
    return ['id' => $a['id'], 'title' => $a['title'], 'message' => $a['message'], 'type' => $a['type'], 'startAt' => iso_to_ms($a['start_at']), 'endAt' => iso_to_ms($a['end_at']),
        'active' => (bool) $a['active'], 'createdAt' => iso_to_ms($a['created_at']), 'createdBy' => username_of($a['created_by'])];
}

function system_view(): array
{
    $s = q1('SELECT * FROM system_settings WHERE id = 1');
    $services = [];
    foreach (q('SELECT o.*, u.username FROM service_status_overrides o LEFT JOIN users u ON u.id = o.admin_id')->fetchAll() as $o) {
        $services[$o['service']] = ['status' => $o['status'], 'note' => $o['note'], 'by' => $o['username'], 'at' => iso_to_ms($o['updated_at'])];
    }
    return [
        'maintenance' => ['enabled' => (bool) $s['maintenance_enabled'], 'message' => (string) ($s['maintenance_message'] ?? ''), 'until' => iso_to_ms($s['maintenance_until'])],
        'services' => (object) $services,
        'autoFreezeCritical' => (bool) $s['auto_freeze_critical'],
    ];
}

function game_config_view(): array
{
    $out = [];
    foreach (q('SELECT slug, status, max_bet FROM games')->fetchAll() as $g) $out[$g['slug']] = ['status' => $g['status'], 'maxBet' => (int) $g['max_bet']];
    return $out;
}

function code_defs_view(): array
{
    $out = [];
    foreach (q('SELECT c.*, u.username FROM redeem_codes c LEFT JOIN users u ON u.id = c.created_by')->fetchAll() as $c) {
        $out[$c['code']] = ['rewards' => jdec($c['rewards'], []), 'globalLimit' => $c['max_uses'] ? (int) $c['max_uses'] : null, 'maxUses' => $c['max_uses'] ? (int) $c['max_uses'] : null,
            'perUser' => (int) $c['per_user'], 'expiresAt' => iso_to_ms($c['expires_at']), 'active' => (bool) $c['active'], 'createdAt' => iso_to_ms($c['created_at']), 'createdBy' => $c['username'] ?? 'system'];
    }
    return $out;
}

function code_usage_view(): array
{
    $out = [];
    foreach (q('SELECT code, count(*) AS n FROM redeem_uses GROUP BY code')->fetchAll() as $r) $out[$r['code']] = (int) $r['n'];
    return $out;
}

// ───────────────────────────── Sinkronisasi ─────────────────────────────

/** Data bersama untuk pemain yang login (dipanggil berkala & setelah aksi sosial). */
function sync_view(array $me): array
{
    settle_transfers();
    $staff = is_staff_role($me['role']);
    $users = [];
    $progress = [];
    $presence = [];
    $rows = q('SELECT u.*, d.progress, d.profile FROM users u LEFT JOIN user_docs d ON d.user_id = u.id ORDER BY u.created_at')->fetchAll();
    foreach ($rows as $r) {
        $profile = jdec($r['profile'], []);
        if ($r['id'] === $me['id']) continue;
        $users[] = public_user_view($r, $profile);
        $progress[$r['id']] = progress_summary(jdec($r['progress'], []));
        if ($r['last_seen_at']) $presence[$r['id']] = iso_to_ms($r['last_seen_at']);
    }
    $presence[$me['id']] = now_ms();

    $chat = array_reverse(array_map('chat_view', q("SELECT m.*, (SELECT count(*) FROM reports r WHERE r.message_id = m.id) AS reports FROM chat_messages m ORDER BY m.created_at DESC LIMIT 150")->fetchAll()));
    $hidden = q('SELECT message_id FROM chat_hidden WHERE user_id = ?', [$me['id']])->fetchAll(PDO::FETCH_COLUMN);
    $jackpots = array_map(fn($j) => ['id' => $j['id'], 'userId' => $j['user_id'], 'username' => $j['username'], 'amount' => num($j['amount']), 'currency' => 'AC', 'game' => $j['game'], 'at' => iso_to_ms($j['at'])],
        q('SELECT j.*, u.username FROM jackpots j JOIN users u ON u.id = j.user_id ORDER BY j.at DESC LIMIT 50')->fetchAll());
    $friendships = array_map(fn($f) => ['id' => $f['id'], 'from' => $f['requester_id'], 'to' => $f['addressee_id'], 'status' => $f['status'], 'at' => iso_to_ms($f['created_at']), 'acceptedAt' => iso_to_ms($f['accepted_at'])],
        q('SELECT * FROM friendships WHERE requester_id = ? OR addressee_id = ?', [$me['id'], $me['id']])->fetchAll());
    $blocks = [];
    foreach (q('SELECT user_id, blocked_id FROM user_blocks WHERE user_id = ? OR blocked_id = ?', [$me['id'], $me['id']])->fetchAll() as $b) $blocks[$b['user_id']][] = $b['blocked_id'];
    $favorites = [];
    foreach (q('SELECT user_id, game FROM favorites ORDER BY created_at DESC')->fetchAll() as $f) $favorites[$f['user_id']][] = $f['game'];

    $reportRows = q($staff && has_perm($me, 'reports.view') ? 'SELECT * FROM reports ORDER BY created_at DESC LIMIT 500' : 'SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 100', $staff && has_perm($me, 'reports.view') ? [] : [$me['id']])->fetchAll();
    $ticketStaff = has_perm($me, 'support.manage');
    $ticketRows = q($ticketStaff ? 'SELECT * FROM support_tickets ORDER BY updated_at DESC LIMIT 500' : 'SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC', $ticketStaff ? [] : [$me['id']])->fetchAll();
    $slow = (int) qv('SELECT chat_slow_mode_sec FROM system_settings WHERE id = 1');

    return [
        'users' => $users,
        'progress' => (object) $progress,
        'platform' => [
            'chat' => $chat, 'hidden' => (object) [$me['id'] => $hidden], 'presence' => (object) $presence, 'jackpots' => $jackpots,
            'friendships' => $friendships, 'blocks' => (object) $blocks, 'favorites' => (object) $favorites, 'chatSettings' => ['slowMode' => $slow],
            'codeUsage' => (object) code_usage_view(), 'seededAt' => 1,
        ],
        'admin' => [
            'announcements' => array_map('announcement_view', q('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 100')->fetchAll()),
            'gameConfig' => (object) game_config_view(),
            'system' => system_view(),
            'reports' => array_map('report_view', $reportRows),
            'tickets' => array_map(fn($t) => ticket_view($t, $ticketStaff), $ticketRows),
            'codes' => (object) ($staff ? code_defs_view() : []),
        ],
        'notifications' => notifications_view($me['id']),
        'serverTime' => now_ms(),
    ];
}

// ───────────────────────────── Transfer ─────────────────────────────

/** Selesaikan transfer AG yang masa tahannya sudah lewat (dipanggil setiap sinkronisasi). */
function settle_transfers(): void
{
    $due = q("SELECT * FROM transfers WHERE status = 'pending' AND release_at <= now() ORDER BY release_at LIMIT 50 FOR UPDATE SKIP LOCKED")->fetchAll();
    foreach ($due as $t) {
        $rx = wallet_post($t['to_id'], $t['currency'], $t['amount'], 'receive', 'transfer', 'transfer', $t['note'] ?: null, null, 'transfer:' . $t['id'] . ':receive');
        q("UPDATE transfers SET status = 'success', receive_tx = ?, settled_at = now() WHERE id = ?", [$rx, $t['id']]);
        notify($t['to_id'], 'transferIn', ['amount' => num($t['amount']), 'currency' => $t['currency'], 'username' => username_of($t['from_id'])]);
    }
}

function sent_today(string $userId, string $currency): float
{
    return (float) qv("SELECT coalesce(sum(amount), 0) FROM transfers WHERE from_id = ? AND currency = ?::currency_code AND status <> 'failed' AND created_at >= date_trunc('day', now())", [$userId, $currency]);
}

function transfer_send(array $me, array $a): array
{
    $to = (string) ($a['toUserId'] ?? '');
    $currency = (string) ($a['currency'] ?? '');
    $amount = $a['amount'] ?? null;
    $note = mb_substr(trim((string) ($a['note'] ?? '')), 0, 80);
    if (!isset(TRANSFER_LIMITS[$currency])) fail('errors.invalidAmount');
    $lim = TRANSFER_LIMITS[$currency];
    $block = qv('SELECT account_block(?::uuid)', [$me['id']]);
    if ($block) fail($block);
    if ($me['wallet_frozen']) fail('errors.walletFrozen');
    if ($me['is_test']) fail('errors.testAccount');
    if (!$to || !preg_match('/^[0-9a-f-]{36}$/', $to)) fail('send.errors.noRecipient');
    if ($to === $me['id']) fail('send.errors.self');
    $rcpt = q1('SELECT id, username, status FROM users WHERE id = ?', [$to]);
    if (!$rcpt) fail('send.errors.noRecipient');
    if (!is_int($amount) && !(is_float($amount) && floor($amount) == $amount)) fail(is_numeric($amount) && $amount > 0 ? 'send.errors.wholeNumber' : 'errors.invalidAmount');
    $amount = (int) $amount;
    if ($amount <= 0) fail('errors.invalidAmount');
    if ($amount < $lim['min']) fail('send.errors.min', ['min' => $lim['min'], 'currency' => $currency]);
    if ($amount > $lim['max']) fail('send.errors.max', ['max' => $lim['max'], 'currency' => $currency]);
    $bal = (float) qv($currency === 'AC' ? 'SELECT ac_balance FROM wallets WHERE user_id = ?' : 'SELECT ag_balance FROM wallets WHERE user_id = ?', [$me['id']]);
    if ($amount > $bal) fail('errors.insufficient');

    if (sent_today($me['id'], $currency) + $amount > $lim['daily']) {
        $id = (string) qv("INSERT INTO transfers (from_id, to_id, currency, amount, note, status, reason) VALUES (?, ?, ?::currency_code, ?, ?, 'failed', 'dailyLimit') RETURNING id", [$me['id'], $to, $currency, $amount, $note]);
        notify($me['id'], 'transferFailed', ['amount' => $amount, 'currency' => $currency, 'username' => $rcpt['username'], 'reason' => 'dailyLimit']);
        return ['status' => 'failed', 'reason' => 'dailyLimit', 'id' => $id];
    }
    $id = (string) qv("INSERT INTO transfers (from_id, to_id, currency, amount, note, status, release_at) VALUES (?, ?, ?::currency_code, ?, ?, ?, ?) RETURNING id",
        [$me['id'], $to, $currency, $amount, $note, $currency === 'AG' ? 'pending' : 'success', $currency === 'AG' ? date('c', time() + AG_HOLD_S) : null]);
    $sx = wallet_post($me['id'], $currency, -$amount, 'send', 'transfer', 'transfer', $note ?: null, null, 'transfer:' . $id . ':send');
    q('UPDATE transfers SET send_tx = ? WHERE id = ?', [$sx, $id]);
    if ($currency === 'AG') {
        notify($me['id'], 'transferPending', ['amount' => $amount, 'currency' => $currency, 'username' => $rcpt['username']]);
        log_event('TRANSFER_PENDING', $me['id'], ['to' => $to, 'currency' => $currency, 'amount' => $amount]);
        return ['status' => 'pending', 'id' => $id];
    }
    $rx = wallet_post($to, $currency, $amount, 'receive', 'transfer', 'transfer', $note ?: null, null, 'transfer:' . $id . ':receive');
    q("UPDATE transfers SET receive_tx = ?, settled_at = now() WHERE id = ?", [$rx, $id]);
    notify($to, 'transferIn', ['amount' => $amount, 'currency' => $currency, 'username' => $me['username']]);
    log_event('TRANSFER_SENT', $me['id'], ['to' => $to, 'currency' => $currency, 'amount' => $amount]);
    return ['status' => 'success', 'id' => $id];
}

// ───────────────────────────── Redeem ─────────────────────────────

function redeem_resolve(array $me, $raw): array
{
    $code = substr(preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $raw)), 0, 16);
    if (!preg_match('/^[A-Z0-9]{4,16}$/', $code)) fail('redeem.errors.format');
    $def = q1('SELECT * FROM redeem_codes WHERE code = ?', [$code]);
    if (!$def || !$def['active']) fail('redeem.errors.invalid');
    if ($def['expires_at'] && strtotime($def['expires_at']) < time()) fail('redeem.errors.expired');
    if ((int) qv('SELECT count(*) FROM redeem_uses WHERE code = ? AND user_id = ?', [$code, $me['id']]) >= (int) $def['per_user']) fail('redeem.errors.used');
    $used = (int) qv('SELECT count(*) FROM redeem_uses WHERE code = ?', [$code]);
    if ($def['max_uses'] && $used >= (int) $def['max_uses']) fail('redeem.errors.soldOut');
    $rewards = jdec($def['rewards'], []);
    return ['code' => $code, 'rewards' => $rewards, 'expiresAt' => iso_to_ms($def['expires_at']), 'remaining' => $def['max_uses'] ? (int) $def['max_uses'] - $used : null,
        'rare' => (bool) array_filter($rewards, fn($r) => ($r['kind'] ?? '') === 'AG')];
}

function redeem_claim(array $me, array &$meta, array &$profile, $raw): array
{
    $block = qv('SELECT account_block(?::uuid)', [$me['id']]);
    if ($block) fail($block);
    if ($me['wallet_frozen']) fail('errors.walletFrozen');
    q('SELECT code FROM redeem_codes WHERE code = ? FOR UPDATE', [substr(preg_replace('/[^A-Z0-9]/', '', strtoupper((string) $raw)), 0, 16)]);
    $info = redeem_resolve($me, $raw);
    $n = (int) qv('SELECT count(*) FROM redeem_uses WHERE code = ? AND user_id = ?', [$info['code'], $me['id']]);
    $tx = null;
    foreach ($info['rewards'] as $i => $r) {
        if (in_array($r['kind'] ?? '', ['AC', 'AG'], true)) {
            $tx = wallet_post($me['id'], $r['kind'], $r['amount'], 'redeem', 'redeem', 'redeem', 'code ' . $info['code'], null, "redeem:{$info['code']}:$n:$i");
        } elseif (($r['kind'] ?? '') === 'item' && in_array($r['id'] ?? '', ITEM_IDS, true)) {
            grant_item($meta, $r['id']);
            if (str_ends_with($r['id'], '-frame') && empty($profile['frame'])) $profile['frame'] = $r['id'];
        }
    }
    q('INSERT INTO redeem_uses (code, user_id, tx_id) VALUES (?, ?, ?)', [$info['code'], $me['id'], $tx]);
    array_unshift($meta['redeemed'], ['code' => $info['code'], 'rewards' => $info['rewards'], 'at' => now_ms()]);
    notify($me['id'], 'redeem', ['code' => $info['code'], 'rewards' => $info['rewards']]);
    log_event('REDEEM_USED', $me['id'], ['code' => $info['code']]);
    return $info;
}

// ───────────────────────────── Jackpot ─────────────────────────────

function record_jackpot(string $userId, float $amount, string $game): void
{
    if ($amount < JACKPOT_THRESHOLD) return;
    $id = (string) qv('INSERT INTO jackpots (user_id, amount, game) VALUES (?, ?, ?) RETURNING id', [$userId, (string) $amount, $game]);
    q("INSERT INTO chat_messages (user_id, type, body, data) VALUES (NULL, 'jackpot', 'jackpot', ?::jsonb)", [jenc(['jackpotId' => $id])]);
    $name = username_of($userId);
    q("INSERT INTO notifications (user_id, kind, data) SELECT id, 'jackpot', ?::jsonb FROM users WHERE id <> ? AND NOT is_test", [jenc(['username' => $name, 'amount' => $amount, 'game' => $game]), $userId]);
}

// ───────────────────────────── Chat ─────────────────────────────

const BLOCKED_WORDS = ['anjing', 'bangsat', 'kontol', 'memek', 'ngentot', 'goblok', 'tolol', 'babi', 'kampret', 'fuck', 'shit', 'bitch', 'asshole'];

function chat_moderate(string $text): array
{
    $flagged = false;
    $masked = preg_replace_callback('/\b(' . implode('|', BLOCKED_WORDS) . ')\w*/iu', function ($m) use (&$flagged) {
        $flagged = true;
        return mb_substr($m[0], 0, 1) . str_repeat('*', mb_strlen($m[0]) - 1);
    }, $text);
    return [$masked, $flagged];
}

function chat_send(array $me, array &$p, array &$meta, array $profile, $raw): array
{
    $now = now_ms();
    if (($me['muted_until'] ?? null) === 'infinity') fail('chat.errors.mutedPermanent');
    if (!empty($me['muted_until']) && strtotime($me['muted_until']) > time()) {
        fail('chat.errors.muted', ['until' => local_dt(iso_to_ms($me['muted_until']))->format('d/m/Y H:i')]);
    }
    if ($me['status'] !== 'active') fail('errors.accountFrozen');
    $clean = trim(preg_replace('/\s+/u', ' ', (string) $raw));
    if ($clean === '') fail('chat.errors.empty');
    if (mb_strlen($clean) > 200) fail('chat.errors.tooLong', ['max' => 200]);
    if (preg_match('/(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|net|org|io|gg|id|xyz|me|ly)\b/i', $clean)) fail('chat.errors.noLinks');
    $mine = q("SELECT body, created_at FROM chat_messages WHERE user_id = ? AND type = 'user' AND created_at > now() - interval '61 seconds' ORDER BY created_at DESC", [$me['id']])->fetchAll();
    $slow = (int) qv('SELECT chat_slow_mode_sec FROM system_settings WHERE id = 1') * 1000;
    $gap = max(3000, $slow);
    if ($mine) {
        $since = $now - iso_to_ms($mine[0]['created_at']);
        if ($since < $gap) fail($slow > 3000 ? 'chat.errors.slowMode' : 'chat.errors.slowDown', ['seconds' => (int) ceil(($gap - $since) / 1000)]);
    }
    if (count(array_filter($mine, fn($m) => $now - iso_to_ms($m['created_at']) < 30000)) >= 5) fail('chat.errors.slowDown');
    [$text, $flagged] = chat_moderate($clean);
    $owned = array_merge(FREE_EMOTES, $meta['inventory']);
    $text = preg_replace_callback('/:([a-z]{2,12}):/', function ($m) use ($owned) {
        foreach (EMOTES as $id => [$code, $glyph]) if ($code === $m[1] && in_array($id, $owned, true)) return $glyph;
        return $m[0];
    }, $text);
    if ($mine && $now - iso_to_ms($mine[0]['created_at']) < 60000 && mb_strtolower($mine[0]['body']) === mb_strtolower($text)) fail('chat.errors.duplicate');
    $badge = $profile['equipped']['chatBadge'] ?? null;
    $badge = in_array($badge, CHAT_BADGES, true) && in_array($badge, $meta['inventory'], true) ? $badge : null;
    $row = q1("INSERT INTO chat_messages (user_id, type, body, flagged, badge) VALUES (?, 'user', ?, ?, ?) RETURNING *", [$me['id'], $text, $flagged, $badge]);
    log_event('MESSAGE_SENT', $me['id'], ['messageId' => $row['id'], 'flagged' => $flagged]);
    if ($flagged) log_event('SECURITY_EVENT', $me['id'], ['kind' => 'profanity', 'messageId' => $row['id']]);
    preg_match_all('/@([a-zA-Z0-9_]{3,16})/', $text, $mm);
    foreach (array_unique(array_map('strtolower', $mm[1])) as $name) {
        $uid = qv('SELECT id FROM users WHERE username = ? AND id <> ?', [$name, $me['id']]);
        if ($uid) notify((string) $uid, 'mention', ['username' => $me['username'], 'text' => $text]);
    }
    $out = track_metric($me['id'], $p, $meta, 'chat', 1, $now);
    return ['message' => chat_view($row + ['reports' => 0]), 'out' => $out];
}

function chat_hide(array $me, string $messageId): array
{
    if (!preg_match('/^[0-9a-f-]{36}$/', $messageId) || !qv('SELECT 1 FROM chat_messages WHERE id = ?', [$messageId])) fail('admin.errors.invalid');
    q('INSERT INTO chat_hidden (user_id, message_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [$me['id'], $messageId]);
    return ['ok' => true];
}

// ───────────────────────────── Teman, blokir, favorit ─────────────────────────────

function is_blocked_either(string $a, string $b): bool
{
    return (bool) qv('SELECT 1 FROM user_blocks WHERE (user_id = ? AND blocked_id = ?) OR (user_id = ? AND blocked_id = ?)', [$a, $b, $b, $a]);
}

function friend_pair(string $a, string $b): ?array
{
    return q1('SELECT * FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?) FOR UPDATE', [$a, $b, $b, $a]);
}

function friend_request(array $me, $username): array
{
    $name = strtolower(ltrim(trim((string) $username), '@'));
    $t = q1('SELECT id, username FROM users WHERE username = ?', [$name]);
    if (!$t) fail('friends.errors.notFound');
    if ($t['id'] === $me['id']) fail('friends.errors.self');
    if (is_blocked_either($me['id'], $t['id'])) fail('friends.errors.blocked');
    $ex = friend_pair($me['id'], $t['id']);
    if ($ex && $ex['status'] === 'accepted') fail('friends.errors.already');
    if ($ex && $ex['requester_id'] === $me['id']) fail('friends.errors.pending');
    if ($ex) return friend_accept($me, $ex['id']);
    if ((int) qv("SELECT count(*) FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)", [$me['id'], $me['id']]) >= 200) fail('friends.errors.limit');
    if ((int) qv("SELECT count(*) FROM friendships WHERE requester_id = ? AND created_at > now() - interval '1 hour'", [$me['id']]) >= 20) fail('friends.errors.rate');
    $id = (string) qv("INSERT INTO friendships (requester_id, addressee_id, status) VALUES (?, ?, 'pending') RETURNING id", [$me['id'], $t['id']]);
    notify($t['id'], 'friendRequest', ['username' => $me['username'], 'requestId' => $id]);
    log_event('FRIEND_REQUEST_SENT', $me['id'], ['targetId' => $t['id']]);
    return ['id' => $id];
}

function friend_accept(array $me, string $id): array
{
    $row = preg_match('/^[0-9a-f-]{36}$/', $id) ? q1('SELECT * FROM friendships WHERE id = ? FOR UPDATE', [$id]) : null;
    if (!$row || $row['addressee_id'] !== $me['id'] || $row['status'] !== 'pending') fail('friends.errors.noRequest');
    q("UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE id = ?", [$id]);
    notify($row['requester_id'], 'friendAccept', ['username' => $me['username']]);
    log_event('FRIEND_ACCEPTED', $me['id'], ['friendId' => $row['requester_id']]);
    return ['id' => $id];
}

function friend_decline(array $me, string $id): array
{
    $row = preg_match('/^[0-9a-f-]{36}$/', $id) ? q1('SELECT * FROM friendships WHERE id = ?', [$id]) : null;
    if (!$row || $row['status'] !== 'pending' || ($row['addressee_id'] !== $me['id'] && $row['requester_id'] !== $me['id'])) fail('friends.errors.noRequest');
    q('DELETE FROM friendships WHERE id = ?', [$id]);
    return ['ok' => true];
}

function friend_remove(array $me, string $friendId): array
{
    $row = preg_match('/^[0-9a-f-]{36}$/', $friendId) ? friend_pair($me['id'], $friendId) : null;
    if (!$row) fail('friends.errors.noRequest');
    q('DELETE FROM friendships WHERE id = ?', [$row['id']]);
    log_event('FRIEND_REMOVED', $me['id'], ['friendId' => $friendId]);
    return ['ok' => true];
}

function user_block(array $me, string $target, bool $on): array
{
    if (!preg_match('/^[0-9a-f-]{36}$/', $target) || $target === $me['id'] || !qv('SELECT 1 FROM users WHERE id = ?', [$target])) fail('friends.errors.notFound');
    if ($on) {
        q('INSERT INTO user_blocks (user_id, blocked_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [$me['id'], $target]);
        q('DELETE FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)', [$me['id'], $target, $target, $me['id']]);
        log_event('USER_BLOCKED', $me['id'], ['targetId' => $target]);
    } else {
        q('DELETE FROM user_blocks WHERE user_id = ? AND blocked_id = ?', [$me['id'], $target]);
    }
    return ['ok' => true];
}

function favorite_toggle(array $me, string $slug): array
{
    if (!in_array($slug, GAME_SLUGS, true)) fail('errors.notFound');
    if (qv('SELECT 1 FROM favorites WHERE user_id = ? AND game = ?', [$me['id'], $slug])) {
        q('DELETE FROM favorites WHERE user_id = ? AND game = ?', [$me['id'], $slug]);
        return ['on' => false];
    }
    q('INSERT INTO favorites (user_id, game) VALUES (?, ?)', [$me['id'], $slug]);
    return ['on' => true];
}

// ───────────────────────────── Laporan ─────────────────────────────

function report_create(array $me, array $a): array
{
    $type = (string) ($a['targetType'] ?? '');
    $reason = (string) ($a['reason'] ?? '');
    if (!in_array($type, REPORT_TYPES, true) || !in_array($reason, REPORT_REASONS, true)) fail('reports.errors.invalid');
    $text = trim(preg_replace('/\s+/u', ' ', (string) ($a['description'] ?? '')));
    if (mb_strlen($text) < 10) fail('reports.errors.short');
    if (mb_strlen($text) > 1000) fail('reports.errors.long');
    $target = !empty($a['targetUserId']) && preg_match('/^[0-9a-f-]{36}$/', (string) $a['targetUserId']) ? q1('SELECT id FROM users WHERE id = ?', [$a['targetUserId']]) : null;
    if (in_array($type, ['player', 'message', 'profile', 'game'], true) && !$target) fail('reports.errors.noTarget');
    if ($target && $target['id'] === $me['id']) fail('reports.errors.self');
    if (qv("SELECT 1 FROM reports WHERE reporter_id = ? AND created_at > now() - interval '60 seconds'", [$me['id']])) fail('reports.errors.cooldown');
    if ((int) qv("SELECT count(*) FROM reports WHERE reporter_id = ? AND created_at > now() - interval '1 hour'", [$me['id']]) >= 5) fail('reports.errors.rate');
    $messageId = !empty($a['messageId']) && preg_match('/^[0-9a-f-]{36}$/', (string) $a['messageId']) ? $a['messageId'] : null;
    $sessionId = !empty($a['sessionId']) && preg_match('/^[0-9a-f-]{36}$/', (string) $a['sessionId']) ? $a['sessionId'] : null;
    $evidence = [];
    if ($messageId) {
        $m = q1('SELECT id, body, user_id, created_at FROM chat_messages WHERE id = ?', [$messageId]);
        if (!$m) fail('reports.errors.noTarget');
        $evidence['message'] = ['id' => $m['id'], 'text' => $m['body'], 'at' => iso_to_ms($m['created_at']), 'userId' => $m['user_id']];
    }
    if ($sessionId) {
        $s = q1('SELECT id, game, bet, payout, multiplier, status, started_at FROM game_sessions WHERE id = ?', [$sessionId]);
        if ($s) $evidence['session'] = ['id' => $s['id'], 'game' => $s['game'], 'bet' => num($s['bet']), 'payout' => num($s['payout']), 'multiplier' => num($s['multiplier']), 'status' => $s['status'], 'at' => iso_to_ms($s['started_at'])];
        else $sessionId = null;
    }
    try {
        $id = (string) qv('INSERT INTO reports (reporter_id, target_type, target_user_id, message_id, session_id, reason, category, description, evidence, priority) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?) RETURNING id',
            [$me['id'], $type, $target['id'] ?? null, $messageId, $sessionId, $reason, $reason, $text, jenc((object) $evidence), in_array($reason, ['cheating', 'scam'], true) ? 'high' : 'normal']);
    } catch (PDOException $e) {
        if (($e->errorInfo[0] ?? '') === '23505') fail('reports.errors.duplicate');
        throw $e;
    }
    q("INSERT INTO report_events (report_id, admin_id, action, internal) VALUES (?, NULL, 'created', FALSE)", [$id]);
    if ($messageId) q('INSERT INTO chat_hidden (user_id, message_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [$me['id'], $messageId]);
    notify($me['id'], 'reportUpdate', ['reportId' => $id, 'status' => 'new']);
    log_event('REPORT_CREATED', $me['id'], ['reportId' => $id, 'targetUserId' => $target['id'] ?? null, 'reportType' => $type]);
    return report_view(q1('SELECT * FROM reports WHERE id = ?', [$id]));
}

// ───────────────────────────── Tiket support ─────────────────────────────

function ticket_clean($text, int $min, int $max): string
{
    $v = trim(preg_replace('/[ \t]+/u', ' ', (string) $text));
    if (mb_strlen($v) < $min) fail('support.errors.short', ['min' => $min]);
    if (mb_strlen($v) > $max) fail('support.errors.long', ['max' => $max]);
    return $v;
}

function ticket_hist(string $id, array $entry): void
{
    q("UPDATE support_tickets SET history = history || ?::jsonb, updated_at = now() WHERE id = ?", [jenc([$entry]), $id]);
}

function ticket_load(string $id): array
{
    $t = q1('SELECT * FROM support_tickets WHERE id = ? FOR UPDATE', [$id]);
    if (!$t) fail('errors.notFound');
    return $t;
}

function ticket_create(array $me, array $a): array
{
    $cat = (string) ($a['category'] ?? '');
    if (!in_array($cat, TICKET_CATEGORIES, true)) fail('support.errors.category');
    $subject = ticket_clean($a['subject'] ?? '', 4, 80);
    $msg = ticket_clean($a['message'] ?? '', 10, 2000);
    if ((int) qv("SELECT count(*) FROM support_tickets WHERE user_id = ? AND status NOT IN ('RESOLVED', 'CLOSED')", [$me['id']]) >= 3) fail('support.errors.openLimit', ['max' => 3]);
    if (qv("SELECT 1 FROM support_tickets WHERE user_id = ? AND created_at > now() - interval '120 seconds'", [$me['id']])) fail('support.errors.cooldown');
    do { $id = 'T-' . strtoupper(rand_hex(3)); } while (qv('SELECT 1 FROM support_tickets WHERE id = ?', [$id]));
    $info = ['sessionId' => mb_substr(trim((string) ($a['sessionId'] ?? '')), 0, 32), 'txId' => mb_substr(trim((string) ($a['txId'] ?? '')), 0, 32)];
    q("INSERT INTO support_tickets (id, user_id, category, subject, info, history) VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb)",
        [$id, $me['id'], $cat, $subject, jenc($info), jenc([['at' => now_ms(), 'by' => $me['username'], 'status' => 'OPEN']])]);
    q('INSERT INTO ticket_messages (ticket_id, author_id, body) VALUES (?, ?, ?)', [$id, $me['id'], $msg]);
    log_event('TICKET_CREATED', $me['id'], ['ticketId' => $id, 'category' => $cat]);
    return ['id' => $id];
}

function ticket_reply(array $me, string $id, $text): array
{
    $t = ticket_load($id);
    $isOwner = $t['user_id'] === $me['id'];
    $isStaff = has_perm($me, 'support.manage');
    if (!$isOwner && !$isStaff) fail('admin.errors.forbidden');
    if ($t['status'] === 'CLOSED') fail('support.errors.closed');
    $body = ticket_clean($text, 2, 2000);
    $asStaff = $isStaff && !$isOwner;
    $s = $t['status'];
    $status = $asStaff ? (in_array($s, ['OPEN', 'IN_PROGRESS'], true) ? 'WAITING_FOR_USER' : $s) : (in_array($s, ['WAITING_FOR_USER', 'RESOLVED'], true) ? 'OPEN' : $s);
    q('INSERT INTO ticket_messages (ticket_id, author_id, body, is_staff) VALUES (?, ?, ?, ?)', [$id, $me['id'], $body, $asStaff]);
    q('UPDATE support_tickets SET status = ?::ticket_status, updated_at = now() WHERE id = ?', [$status, $id]);
    if ($status !== $s) ticket_hist($id, ['at' => now_ms(), 'by' => $me['username'], 'status' => $status]);
    if ($asStaff) {
        notify($t['user_id'], 'ticket', ['ticketId' => $id, 'event' => 'reply']);
        audit_log($me, 'ticket.reply', $t['user_id'], null, $id, null, ['ticketId' => $id], '—');
    }
    log_event('TICKET_UPDATED', $me['id'], ['ticketId' => $id, 'status' => $status]);
    return ['ok' => true];
}

function ticket_reopen(array $me, string $id): array
{
    $t = ticket_load($id);
    $isStaff = has_perm($me, 'support.manage');
    if ($t['user_id'] !== $me['id'] && !$isStaff) fail('admin.errors.forbidden');
    if (!in_array($t['status'], ['RESOLVED', 'CLOSED'], true)) fail('admin.errors.invalid');
    if (!$isStaff && time() - strtotime($t['updated_at']) > 7 * 86400) fail('support.errors.reopenWindow');
    q("UPDATE support_tickets SET status = 'OPEN', updated_at = now() WHERE id = ?", [$id]);
    ticket_hist($id, ['at' => now_ms(), 'by' => $me['username'], 'status' => 'OPEN', 'action' => 'reopen']);
    log_event('TICKET_UPDATED', $me['id'], ['ticketId' => $id, 'status' => 'OPEN']);
    return ['ok' => true];
}

function ticket_status(array $me, string $id, string $status): array
{
    require_user_perm($me, 'support.manage');
    if (!in_array($status, TICKET_STATUSES, true)) fail('admin.errors.invalid');
    $t = ticket_load($id);
    if ($t['status'] === $status) return ['ok' => true];
    q('UPDATE support_tickets SET status = ?::ticket_status, updated_at = now(), closed_at = CASE WHEN ? THEN now() ELSE closed_at END WHERE id = ?', [$status, $status === 'CLOSED', $id]);
    ticket_hist($id, ['at' => now_ms(), 'by' => $me['username'], 'status' => $status]);
    notify($t['user_id'], 'ticket', ['ticketId' => $id, 'event' => 'status', 'status' => $status]);
    audit_log($me, 'ticket.status', $t['user_id'], null, $id, $t['status'], $status, '—');
    log_event('TICKET_UPDATED', $me['id'], ['ticketId' => $id, 'status' => $status]);
    return ['ok' => true];
}

function ticket_assign(array $me, string $id, ?string $adminId): array
{
    require_user_perm($me, 'support.manage');
    $t = ticket_load($id);
    $assignee = null;
    if ($adminId) {
        $assignee = preg_match('/^[0-9a-f-]{36}$/', $adminId) ? q1('SELECT * FROM users WHERE id = ?', [$adminId]) : null;
        if (!$assignee || !has_perm($assignee, 'support.manage')) fail('admin.errors.invalid');
    }
    q("UPDATE support_tickets SET assignee_id = ?, status = CASE WHEN status = 'OPEN' AND ? THEN 'IN_PROGRESS'::ticket_status ELSE status END, updated_at = now() WHERE id = ?", [$assignee['id'] ?? null, (bool) $assignee, $id]);
    ticket_hist($id, ['at' => now_ms(), 'by' => $me['username'], 'action' => 'assign', 'to' => $assignee['username'] ?? '—']);
    audit_log($me, 'ticket.assign', $t['user_id'], null, $id, $t['assignee_id'] ? username_of($t['assignee_id']) : null, $assignee['username'] ?? null, '—');
    return ['ok' => true];
}

function ticket_note(array $me, string $id, $text): array
{
    require_user_perm($me, 'support.manage');
    ticket_load($id);
    q('INSERT INTO ticket_messages (ticket_id, author_id, body, is_staff, internal) VALUES (?, ?, ?, TRUE, TRUE)', [$id, $me['id'], ticket_clean($text, 2, 1000)]);
    return ['ok' => true];
}

// ───────────────────────────── Notifikasi ─────────────────────────────

function notif_action(array $me, string $action, ?string $id): array
{
    if ($action === 'read' && $id && preg_match('/^[0-9a-f-]{36}$/', $id)) q('UPDATE notifications SET read_at = now() WHERE id = ? AND user_id = ? AND read_at IS NULL', [$id, $me['id']]);
    elseif ($action === 'readAll') q('UPDATE notifications SET read_at = now() WHERE user_id = ? AND read_at IS NULL', [$me['id']]);
    elseif ($action === 'clear') q('DELETE FROM notifications WHERE user_id = ?', [$me['id']]);
    else fail('admin.errors.invalid');
    return ['ok' => true];
}
