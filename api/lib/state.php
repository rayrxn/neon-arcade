<?php
// State per user: dokumen progres, ledger, dan bentuk data untuk frontend.
declare(strict_types=1);

/** Satu-satunya jalan saldo berubah (SQL wallet_post: idempoten + row lock + tidak boleh minus). */
function wallet_post(string $userId, string $currency, $amount, string $type, string $category, ?string $source, ?string $reason, ?string $sessionId, string $key): string
{
    return (string) qv(
        'SELECT wallet_post(?::uuid, ?::currency_code, ?::numeric, ?, ?::tx_category, ?, ?, ?::uuid, NULL, NULL, ?)',
        [$userId, $currency, (string) $amount, $type, $category, $source, $reason, $sessionId, $key]
    );
}

/** Notifikasi untuk satu user (tabel notifications). */
function notify(string $userId, string $kind, array $data = []): void
{
    q('INSERT INTO notifications (user_id, kind, data) VALUES (?, ?, ?::jsonb)', [$userId, $kind, jenc((object) $data)]);
}

function notifications_view(string $userId, int $limit = 100): array
{
    $rows = q('SELECT id, kind, data, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ' . (int) $limit, [$userId])->fetchAll();
    return array_map(fn($n) => ['id' => $n['id'], 'kind' => $n['kind'], 'data' => (object) jdec($n['data'], []), 'at' => iso_to_ms($n['created_at']), 'read' => $n['read_at'] !== null], $rows);
}

function raise_flag(string $userId, string $type, string $risk, ?string $sessionId, string $expected, string $submitted): void
{
    q('SELECT raise_flag(?::uuid, ?, ?::flag_risk, ?::uuid, ?, ?)', [$userId, $type, $risk, $sessionId, $expected, $submitted]);
}

/**
 * Kunci & muat dokumen user untuk satu transaksi. Semua aksi yang mengubah progres
 * memanggil ini dulu → request bersamaan dari user yang sama diproses berurutan.
 */
function load_docs(string $userId): array
{
    q('INSERT INTO user_docs (user_id) VALUES (?) ON CONFLICT DO NOTHING', [$userId]);
    $row = q1('SELECT progress, wallet_meta, profile FROM user_docs WHERE user_id = ? FOR UPDATE', [$userId]);
    $meta = jdec($row['wallet_meta'], []);
    $meta += ['inventory' => [], 'redeemed' => [], 'totalWagered' => 0, 'totalWon' => 0, 'rounds' => 0, 'wins' => 0, 'biggestWin' => null, 'lastBonusAt' => null];
    return [normalize_progress(jdec($row['progress'], [])), $meta, jdec($row['profile'], [])];
}

function save_docs(string $userId, array $p, array $meta, ?array $profile = null): void
{
    $lv = level_from_xp($p['xp'])['level'];
    if ($profile === null) {
        q('UPDATE user_docs SET progress = ?::jsonb, wallet_meta = ?::jsonb, updated_at = now() WHERE user_id = ?', [jenc(progress_json($p)), jenc($meta), $userId]);
    } else {
        q('UPDATE user_docs SET progress = ?::jsonb, wallet_meta = ?::jsonb, profile = ?::jsonb, updated_at = now() WHERE user_id = ?', [jenc(progress_json($p)), jenc($meta), jenc((object) $profile), $userId]);
    }
    // Ringkasan relasional untuk leaderboard & admin (tahap berikutnya).
    $s = $p['stats'];
    q('INSERT INTO user_progress (user_id, xp, level, games, wins, losses, pushes, wagered, best_multiplier, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, now())
       ON CONFLICT (user_id) DO UPDATE SET xp = EXCLUDED.xp, level = EXCLUDED.level, games = EXCLUDED.games, wins = EXCLUDED.wins,
         losses = EXCLUDED.losses, pushes = EXCLUDED.pushes, wagered = EXCLUDED.wagered, best_multiplier = EXCLUDED.best_multiplier, updated_at = now()',
        [$userId, (int) $p['xp'], $lv, (int) $s['games'], (int) $s['wins'], (int) $s['losses'], (int) $s['pushes'], (string) $s['wagered'], (string) min($s['bestMultiplier'], 9999999999)]);
    foreach (array_keys($p['achievements'] ?? []) as $a) {
        q('INSERT INTO user_achievements (user_id, achievement_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [$userId, $a]);
    }
}

// ───────────────────────────── Bentuk data frontend ─────────────────────────────

function num($v)
{
    $f = (float) $v;
    return floor($f) == $f && abs($f) < 9.0e15 ? (int) $f : $f;
}

function user_view(array $u, array $profile = []): array
{
    $avatar = jdec($u['avatar'] ?? null, []);
    $banUntil = iso_to_ms($u['ban_until'] ?? null);
    return [
        'id' => $u['id'],
        'username' => $u['username'],
        'displayName' => $u['display_name'],
        'email' => $u['email'],
        'emailVerified' => !empty($u['email_verified_at']),
        'avatar' => $avatar ?: ['kind' => 'preset', 'id' => preset_for($u['username'])],
        'avatarSet' => !empty($profile['avatarSet']),
        'frame' => $profile['frame'] ?? null,
        'createdAt' => iso_to_ms($u['created_at']),
        'lastLoginAt' => iso_to_ms($u['last_login_at'] ?? null),
        'role' => $u['role'],
        'status' => $u['status'],
        'ban' => $u['status'] === 'banned' ? ['until' => $banUntil, 'reason' => $u['ban_reason']] : null,
        'walletFrozen' => (bool) $u['wallet_frozen'],
        'isTest' => (bool) $u['is_test'],
        'mustChangePassword' => !empty($u['must_change_password']) && $u['must_change_password'] !== 'f',
        'testControl' => $u['test_control'],
        'mutedUntil' => ($u['muted_until'] ?? null) === 'infinity' ? 8.64e15 : iso_to_ms($u['muted_until'] ?? null),
        'loginHistory' => [],
        'warnings' => [],
        'equipped' => (object) ($profile['equipped'] ?? []),
        'status' => $profile['status'] ?? null, 'bio' => $profile['bio'] ?? null,
        'server' => true,
    ] + (array_key_exists('loyalty_xp', $u) ? user_extra_fields($u, $profile) : []);
}

const AVATAR_PRESETS = ['cyan', 'violet', 'sunset', 'mint', 'rose', 'steel'];
function preset_for(string $seed): string
{
    $sum = 0;
    foreach (mb_str_split($seed) as $ch) $sum += mb_ord($ch);
    return AVATAR_PRESETS[$sum % count(AVATAR_PRESETS)];
}

function tx_view(array $t): array
{
    $v = tx_view_base($t);
    if (!empty($t['tr_id'])) {
        $isSend = $t['type'] === 'send';
        $v['counterparty'] = ['userId' => $isSend ? $t['tr_to'] : $t['tr_from'], 'username' => $isSend ? $t['tr_to_name'] : $t['tr_from_name']];
        $v['note'] = $t['tr_note'];
        if ($isSend && $t['tr_status'] === 'pending') {
            $v['status'] = 'pending';
            $v['releaseAt'] = iso_to_ms($t['tr_release']);
        }
    }
    return $v;
}

function tx_view_base(array $t): array
{
    return [
        'id' => $t['id'],
        'type' => $t['type'],
        'currency' => $t['currency'],
        'amount' => num($t['amount']),
        'balanceBefore' => num($t['balance_before']),
        'balanceAfter' => num($t['balance_after']),
        'at' => iso_to_ms($t['created_at']),
        'status' => $t['status'],
        'counterparty' => null,
        'game' => $t['game'] ?? null,
        'source' => $t['source'],
        'category' => $t['category'],
        'reason' => $t['reason'],
        'reference' => $t['reason'],
        'sessionId' => $t['session_id'],
        'idempotencyKey' => $t['idempotency_key'],
    ];
}

function wallet_view(string $userId, array $meta, int $limit = 200): array
{
    $w = q1('SELECT ac_balance, ag_balance FROM wallets WHERE user_id = ?', [$userId]);
    $rows = q("SELECT t.*, s.game, tr.id AS tr_id, tr.from_id AS tr_from, tr.to_id AS tr_to, tr.note AS tr_note, tr.status AS tr_status, tr.release_at AS tr_release,
                      uf.username AS tr_from_name, ut.username AS tr_to_name
               FROM wallet_transactions t
               LEFT JOIN game_sessions s ON s.id = t.session_id
               LEFT JOIN transfers tr ON tr.send_tx = t.id OR tr.receive_tx = t.id
               LEFT JOIN users uf ON uf.id = tr.from_id
               LEFT JOIN users ut ON ut.id = tr.to_id
               WHERE t.user_id = ? ORDER BY t.created_at DESC, t.id DESC LIMIT " . (int) $limit, [$userId])->fetchAll();
    $txs = array_map('tx_view', $rows);
    // Transfer yang ditolak limit harian: tercatat di riwayat tanpa mengubah saldo.
    foreach (q("SELECT tr.*, u.username FROM transfers tr JOIN users u ON u.id = tr.to_id WHERE tr.from_id = ? AND tr.status = 'failed' ORDER BY tr.created_at DESC LIMIT 20", [$userId])->fetchAll() as $f) {
        $txs[] = ['id' => $f['id'], 'type' => 'send', 'currency' => $f['currency'], 'amount' => -num($f['amount']), 'balanceAfter' => null, 'at' => iso_to_ms($f['created_at']), 'status' => 'failed',
            'reason' => $f['reason'], 'counterparty' => ['userId' => $f['to_id'], 'username' => $f['username']], 'note' => $f['note'], 'game' => null, 'category' => 'transfer'];
    }
    usort($txs, fn($a, $b) => $b['at'] <=> $a['at']);
    return [
        'balance' => num($w['ac_balance'] ?? 0),
        'gems' => num($w['ag_balance'] ?? 0),
        'totalWagered' => $meta['totalWagered'],
        'totalWon' => $meta['totalWon'],
        'rounds' => $meta['rounds'],
        'wins' => $meta['wins'],
        'biggestWin' => $meta['biggestWin'],
        'lastBonusAt' => $meta['lastBonusAt'],
        'inventory' => array_values($meta['inventory']),
        'redeemed' => array_values($meta['redeemed']),
        'transactions' => array_slice($txs, 0, $limit),
    ];
}

function fairness_view(string $userId): array
{
    $cur = q1('SELECT server_seed_hash, client_seed, nonce FROM fairness_seeds WHERE user_id = ? AND revealed_at IS NULL', [$userId]);
    if (!$cur) {
        $seed = rand_hex(32);
        q('INSERT INTO fairness_seeds (user_id, server_seed, server_seed_hash, client_seed) VALUES (?, ?, ?, ?)', [$userId, $seed, hash('sha256', $seed), rand_hex(10)]);
        $cur = q1('SELECT server_seed_hash, client_seed, nonce FROM fairness_seeds WHERE user_id = ? AND revealed_at IS NULL', [$userId]);
    }
    $prev = q1('SELECT server_seed, server_seed_hash, client_seed, nonce, revealed_at FROM fairness_seeds WHERE user_id = ? AND revealed_at IS NOT NULL ORDER BY revealed_at DESC LIMIT 1', [$userId]);
    return [
        'serverSeedHash' => $cur['server_seed_hash'],
        'clientSeed' => $cur['client_seed'],
        'nonce' => (int) $cur['nonce'],
        'previous' => $prev ? ['serverSeed' => $prev['server_seed'], 'serverSeedHash' => $prev['server_seed_hash'], 'clientSeed' => $prev['client_seed'], 'rounds' => (int) $prev['nonce'], 'revealedAt' => iso_to_ms($prev['revealed_at'])] : null,
    ];
}

/** Snapshot lengkap untuk frontend setelah setiap aksi. */
function state_view(string $userId, array $p, array $meta): array
{
    return [
        'wallet' => wallet_view($userId, $meta),
        'progress' => progress_json($p),
        'fairness' => fairness_view($userId),
        'season' => current_season(now_ms()),
        'open' => (object) open_rounds_view($userId),
        'notifications' => notifications_view($userId),
        'extras' => extras_view($userId, $meta),
        'pass' => pass_view($userId, $p),
        'serverTime' => now_ms(),
    ];
}
