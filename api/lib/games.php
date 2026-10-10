<?php
// Port 1:1 dari src/services/games.js — hasil SELALU dihitung di server dari RNG provably fair.
// UI hanya mengirim pilihan (taruhan, target, petak, aksi). Payout tidak pernah diterima dari UI.
declare(strict_types=1);

const LIMITS = ['minBet' => 1];
const MAX_MULTIPLIER = [
    'dice' => 49.5, 'limbo' => 1000000, 'coinflip' => 1.98, 'plinko' => 1000, 'roulette' => 36, 'case-opening' => 20,
    'case-battle' => 40, 'crash' => 1000000000, 'mines' => 6000000, 'blackjack' => 2.5,
    'keno' => 1000, 'tower' => 1000000, 'cross' => 1000000, 'pump' => 1000000,
];
const STATUS_OF = ['win' => 'WON', 'loss' => 'LOST', 'push' => 'DRAW'];

const PLINKO_ROWS = 16;
const PLINKO_TABLES = [
    'low' => [16, 9, 2, 1.4, 1.4, 1.2, 1.1, 1, 0.5, 1, 1.1, 1.2, 1.4, 1.4, 2, 9, 16],
    'medium' => [110, 41, 10, 5, 3, 1.5, 1, 0.5, 0.3, 0.5, 1, 1.5, 3, 5, 10, 41, 110],
    'high' => [1000, 130, 26, 9, 4, 2, 0.2, 0.2, 0.2, 0.2, 0.2, 2, 4, 9, 26, 130, 1000],
];
const RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const ROULETTE_PAYOUT = ['straight' => 36, 'red' => 2, 'black' => 2, 'odd' => 2, 'even' => 2, 'low' => 2, 'high' => 2, 'dozen' => 3];

const CASES = ['starter' => 100, 'neon' => 500, 'elite' => 2500];
const CASE_ITEMS = [
    'common' => [['name' => 'Sticker Pack', 'mult' => 0.15], ['name' => 'Pixel Badge', 'mult' => 0.25], ['name' => 'Arcade Token', 'mult' => 0.35]],
    'rare' => [['name' => 'Neon Keycap', 'mult' => 0.5], ['name' => 'Glow Strap', 'mult' => 0.7], ['name' => 'Chrome Pin', 'mult' => 0.9]],
    'epic' => [['name' => 'Holo Card', 'mult' => 1.2], ['name' => 'Visor Skin', 'mult' => 1.6], ['name' => 'Synth Pad', 'mult' => 2]],
    'legendary' => [['name' => 'Gold Joystick', 'mult' => 4], ['name' => 'Plasma Blade', 'mult' => 6]],
    'secret' => [['name' => 'Founder Crown', 'mult' => 20]],
];
const TIERS = [
    ['id' => 'common', 'weight' => 50, 'color' => '#9aa4b8'],
    ['id' => 'rare', 'weight' => 30, 'color' => '#3b9bff'],
    ['id' => 'epic', 'weight' => 15, 'color' => '#a35bff'],
    ['id' => 'legendary', 'weight' => 4, 'color' => '#ffc83d'],
    ['id' => 'secret', 'weight' => 1, 'color' => '#ff4d8d'],
];

const CRASH_K = 0.12;
/** Toleransi latensi jaringan untuk cash out Crash (ms). */
const CRASH_GRACE_MS = 1500;

/** Konteks satu request game: user + dokumen yang sudah dikunci. */
final class Ctx
{
    public array $user;
    public array $p;
    public array $meta;
    public int $now;
    /** Currency of new rounds started in this request (AC or AG). */
    public string $currency = 'AC';
    public function __construct(array $user, array $p, array $meta, int $now)
    {
        $this->user = $user;
        $this->p = $p;
        $this->meta = $meta;
        $this->now = $now;
    }
}

// ───────────────────────────── Infrastruktur ─────────────────────────────

function check_bet($bet): int
{
    if (!is_int($bet) && !(is_float($bet) && floor($bet) == $bet)) fail('play.errors.wholeBet');
    $bet = (int) $bet;
    if ($bet < LIMITS['minBet']) fail('play.errors.minBet', ['min' => LIMITS['minBet']]);
    // Upper limit: bet_limits() (card × membership, global cap, per-game cap), checked in begin().
    return $bet;
}

/** Jeda minimal antar ronde per game (= lama animasi di layar), supaya tombol tidak bisa di-spam. */
const GAME_COOLDOWN_MS = ['dice' => 650, 'limbo' => 750, 'coinflip' => 1250, 'roulette' => 3200, 'case-opening' => 1500, 'case-battle' => 2500, 'plinko' => 250];

function check_cooldown(Ctx $c, string $game): void
{
    $cd = GAME_COOLDOWN_MS[$game] ?? 0;
    if ($cd <= 0 || !empty($GLOBALS['NEON_NO_COOLDOWN'])) return;
    $last = (int) ($c->meta['lastRound'][$game] ?? 0);
    $left = $last + $cd - $c->now;
    if ($left > 0) fail('play.errors.cooldown', ['seconds' => number_format($left / 1000, 1)], 429);
    $c->meta['lastRound'][$game] = $c->now;
}

/** Potong taruhan (SQL game_start: blokir akun, maintenance, rate limit, seed, nonce) + ambil float. */
function begin(Ctx $c, string $game, $bet, int $floatCount, array $extra = []): array
{
    $bet = check_bet($bet);
    $currency = $c->currency;
    check_loyalty_bet($c->user, $currency, $bet, $game);
    check_cooldown($c, $game);
    try {
        $st = jdec((string) qv('SELECT game_start(?::uuid, ?, ?::numeric, ?::currency_code)', [$c->user['id'], $game, (string) $bet, $currency]));
    } catch (Throwable $e) {
        $e = map_db_error($e);
        if ($e instanceof ApiError && $e->getMessage() === 'play.errors.tooFast') queue_flag($c->user['id'], 'rapidRequests', 'medium', null, '≤ 8 ronde/detik', '> 8 ronde/detik');
        throw $e;
    }
    $seed = q1('SELECT server_seed, client_seed FROM fairness_seeds WHERE id = ?', [$st['seed_id']]);
    $floats = generate_floats($seed['server_seed'], $seed['client_seed'], (int) $st['nonce'], $floatCount);
    if (empty($st['is_test'])) {
        if ($currency === 'AC') $c->meta['totalWagered'] = round2($c->meta['totalWagered'] + $bet);
        $c->meta['rounds']++;
    }
    return $extra + [
        'id' => $st['session_id'],
        'userId' => $c->user['id'],
        'game' => $game,
        'bet' => $bet,
        'currency' => $currency,
        'floats' => $floats,
        'proof' => ['serverSeedHash' => $st['server_seed_hash'], 'clientSeed' => $st['client_seed'], 'nonce' => (int) $st['nonce']],
        'betTxId' => $st['bet_tx'] ?? null,
        'startedAt' => $c->now,
        'isTest' => !empty($st['is_test']),
        'control' => !empty($st['is_test']) ? ($st['control'] ?? 'off') : 'off',
    ];
}

/** Akun test Force Win/Loss: acak ulang (bukan provably fair) sampai hasil sesuai. Akun biasa tidak lewat sini. */
function forced(array $round, int $count, callable $isWin): array
{
    if (empty($round['isTest']) || $round['control'] === 'off') return $round['floats'];
    $want = $round['control'] === 'win';
    for ($i = 0; $i < 500; $i++) {
        $floats = [];
        for ($j = 0; $j < $count; $j++) $floats[] = rand_float();
        if ($isWin($floats) === $want) return $floats;
    }
    return $round['floats'];
}

function classify($m): string
{
    return $m > 1 ? 'win' : ($m == 1 ? 'push' : 'loss');
}

function save_open(array $round): void
{
    $state = $round;
    unset($state['floats']);
    q('UPDATE game_sessions SET state = ?::jsonb WHERE id = ?', [jenc($state), $round['id']]);
}

function load_open(Ctx $c, string $game, ?string $id = null): ?array
{
    $row = q1("SELECT id, state FROM game_sessions WHERE user_id = ? AND game = ? AND status = 'OPEN' FOR UPDATE", [$c->user['id'], $game]);
    if (!$row || ($id && $row['id'] !== $id)) return null;
    $state = jdec($row['state'], []);
    return $state ?: null;
}

function stale_round(Ctx $c, string $game, $id): array
{
    $valid = is_string($id) && preg_match('/^[0-9a-f-]{36}$/', $id);
    $row = $valid ? q1('SELECT * FROM game_sessions WHERE id = ? AND user_id = ?', [$id, $c->user['id']]) : null;
    if ($row && $row['status'] !== 'OPEN') {
        foreach ($c->p['sessions'] as $s) if ($s['id'] === $id) return ['done' => true, 'stale' => true, 'session' => $s];
        return ['done' => true, 'stale' => true, 'session' => session_from_row($row)];
    }
    queue_flag($c->user['id'], 'replay', 'high', null, 'session aktif', 'sessionId ' . substr((string) $id, 0, 40));
    fail('play.errors.settled');
}

function session_from_row(array $r): array
{
    return [
        'id' => $r['id'], 'game' => $r['game'], 'bet' => num($r['bet']), 'payout' => num($r['payout']), 'multiplier' => num($r['multiplier']),
        'result' => ['WON' => 'win', 'DRAW' => 'push', 'CANCELLED' => 'push'][$r['status']] ?? 'loss', 'status' => $r['status'],
        'verification' => $r['verification'], 'detail' => jdec($r['detail'], []), 'at' => iso_to_ms($r['finished_at'] ?? $r['started_at']),
        'nonce' => (int) $r['nonce'], 'xp' => (int) $r['xp'], 'isTest' => (bool) $r['is_test'], 'currency' => $r['currency'] ?? 'AC',
    ];
}

/** Deteksi pola setelah sesi tersimpan (port detect()). */
function detect(Ctx $c, array $round, array $session): void
{
    $uid = $round['userId'];
    // Thresholds follow the player's own bet limit, so big-card players aren't flagged for normal play.
    $limit = bet_limits($c->user)[($session['currency'] ?? 'AC') === 'AG' ? 'AG' : 'AC'];
    if ($session['multiplier'] >= 1000 || $session['payout'] >= 200 * $limit) {
        raise_flag($uid, 'abnormalReward', $session['payout'] >= 1000 * $limit ? 'critical' : 'high', $session['id'], '≤ 1000× · ≤ ' . number_format(200 * $limit), $session['multiplier'] . '× · ' . $session['payout'] . ' ' . ($session['currency'] ?? 'AC'));
    }
    $detail = (array) $session['detail'];
    if ($round['game'] === 'mines' && ($detail['picks'] ?? 0) >= 5 && $session['durationMs'] < 400) {
        raise_flag($uid, 'impossibleDuration', 'medium', $session['id'], '≥ 400 ms', $session['durationMs'] . ' ms');
    }
    $recent = array_slice(array_values(array_filter($c->p['sessions'], fn($s) => empty($s['isTest']))), 0, 20);
    $wins = count(array_filter($recent, fn($s) => $s['result'] === 'win'));
    if (count($recent) >= 20 && $wins >= 18) raise_flag($uid, 'suspiciousPattern', 'medium', $session['id'], '≈ 50% win', "$wins/20 win");
    $net = 0;
    foreach (array_slice($c->p['sessions'], 0, 50) as $s) if (($s['currency'] ?? 'AC') === 'AC') $net += $s['payout'] - $s['bet'];
    $acLimit = bet_limits($c->user)['AC'];
    if ($net >= 100 * $acLimit) raise_flag($uid, 'abnormalCurrency', 'high', $session['id'], '< ' . number_format(100 * $acLimit) . ' AC / 50 rounds', '+' . round($net) . ' AC');
}

/** Kredit payout, catat sesi & progres (port finish()). Idempoten per sesi. */
function finish(Ctx $c, array $round, $multiplier, string $result, array $detail, ?string $status = null): array
{
    $row = q1('SELECT status FROM game_sessions WHERE id = ? FOR UPDATE', [$round['id']]);
    if (!$row || $row['status'] !== 'OPEN') {
        queue_flag($round['userId'], 'duplicateSubmission', 'low', $round['id'], 'satu penyelesaian per sesi', 'penyelesaian ulang');
        foreach ($c->p['sessions'] as $s) if ($s['id'] === $round['id']) { persist_pending_flags(); return ['session' => $s, 'summary' => null, 'duplicate' => true]; }
        fail('play.errors.settled');
    }
    $cur = $round['currency'] ?? 'AC';
    $payout = $result === 'push' ? $round['bet'] : round2($round['bet'] * $multiplier);
    $max = MAX_MULTIPLIER[$round['game']] ?? 1;
    $valid = is_finite((float) $multiplier) && $multiplier >= 0 && in_array($result, ['win', 'loss', 'push'], true)
        && $multiplier <= $max && ($result !== 'loss' || $payout <= $round['bet']);
    $session = [
        'id' => $round['id'],
        'game' => $round['game'],
        'bet' => $round['bet'],
        'payout' => $valid ? $payout : 0,
        'multiplier' => !$valid ? 0 : ($result === 'push' ? 1 : $multiplier),
        'result' => $valid ? $result : 'loss',
        'status' => !$valid ? 'INVALID' : ($status ?? STATUS_OF[$result]),
        'verification' => $valid ? 'verified' : 'rejected',
        'detail' => (object) $detail,
        'at' => $c->now,
        'durationMs' => $c->now - $round['startedAt'],
        'nonce' => $round['proof']['nonce'],
        'serverSeedHash' => $round['proof']['serverSeedHash'],
        'betTxId' => $round['betTxId'] ?? null,
        'payoutTxId' => null,
        'isTest' => !empty($round['isTest']),
        'currency' => $cur,
        // Value in AC (AG at the converter rate) — XP, Loyalty XP and stats use this.
        'valueAc' => $cur === 'AG' ? round2($round['bet'] * (int) kv_get('economy')['acPerAg']) : $round['bet'],
    ];
    if (!$valid) raise_flag($round['userId'], 'invalidState', 'critical', $round['id'], "≤ {$max}×", "{$multiplier}× ($result)");
    if ($valid && empty($round['isTest']) && $payout > 0) {
        $session['payoutTxId'] = wallet_post($round['userId'], $cur, $payout, 'win', 'game', 'game', null, $round['id'], 'game:' . $round['id'] . ':payout');
        $gacor = luck_bonus($round['userId'], $cur, (float) $round['bet'], (float) $payout, $round['id']);
        if ($gacor > 0) $session['gacorBonus'] = $gacor;
        if ($cur === 'AC') $c->meta['totalWon'] = round2($c->meta['totalWon'] + $payout);
        $c->meta['wins'] = ($c->meta['wins'] ?? 0) + 1;
        if ($cur === 'AC' && (empty($c->meta['biggestWin']) || $payout > $c->meta['biggestWin']['amount'])) {
            $c->meta['biggestWin'] = ['amount' => $payout, 'game' => $round['game'], 'at' => $c->now, 'currency' => 'AC'];
        }
        if ($result === 'win' && empty($round['is_test']) && empty($round['isTest'])) record_jackpot($round['userId'], (float) $payout, $round['game'], $cur);
    }
    $sessionArr = $session;
    $sessionArr['detail'] = $detail;
    $summary = record_game($round['userId'], $c->p, $c->meta, $sessionArr, $c->now);
    $session['xp'] = $sessionArr['xp'];
    unset($session['valueAc']);
    if ($valid && empty($round['isTest'])) $summary['loyaltyXp'] = add_loyalty_xp($round['userId'], game_lxp((float) $sessionArr['valueAc']), 'game', $round['id']);
    $summary['questsState'] = $c->p['quests'];
    q("UPDATE game_sessions SET status = ?::session_status, payout = ?, multiplier = ?, verification = ?, detail = ?::jsonb, xp = ?,
         finished_at = now(), payout_tx_id = ?::uuid WHERE id = ?",
        [$session['status'], (string) $session['payout'], (string) $session['multiplier'], $session['verification'], jenc((object) $detail),
         $session['xp'], $session['payoutTxId'], $round['id']]);
    log_event('GAME_COMPLETED', $round['userId'], ['session' => $round['id'], 'status' => $session['status'], 'payout' => $session['payout']]);
    if (empty($round['isTest'])) detect($c, $round, $session);
    return ['session' => $session, 'summary' => $summary];
}

// ───────────────────────────── Game instan ─────────────────────────────

function play_dice(Ctx $c, array $a): array
{
    $t = round(((float) ($a['target'] ?? 0)) * 100) / 100;
    if (!($t >= 2 && $t <= 98)) fail('play.errors.invalid');
    $over = !empty($a['over']);
    $chance = $over ? 100 - $t : $t;
    $multiplier = dice_multiplier($chance);
    $round = begin($c, 'dice', $a['bet'] ?? null, 1);
    $hit = fn($f) => $over ? dice_roll($f[0]) > $t : dice_roll($f[0]) < $t;
    $roll = dice_roll(forced($round, 1, $hit)[0]);
    $win = $over ? $roll > $t : $roll < $t;
    return ['roll' => $roll, 'target' => $t, 'over' => $over, 'chance' => $chance]
        + finish($c, $round, $win ? $multiplier : 0, $win ? 'win' : 'loss', ['roll' => $roll, 'target' => $t, 'over' => $over]);
}

function play_limbo(Ctx $c, array $a): array
{
    $t = floor(((float) ($a['target'] ?? 0)) * 100) / 100;
    if (!($t >= 1.01 && $t <= 1000000)) fail('play.errors.invalid');
    $round = begin($c, 'limbo', $a['bet'] ?? null, 1);
    $value = limbo_result(forced($round, 1, fn($f) => limbo_result($f[0]) >= $t)[0]);
    $win = $value >= $t;
    return ['value' => $value, 'target' => $t] + finish($c, $round, $win ? $t : 0, $win ? 'win' : 'loss', ['value' => $value, 'target' => $t]);
}

function play_coinflip(Ctx $c, array $a): array
{
    $side = $a['side'] ?? null;
    if ($side !== 'heads' && $side !== 'tails') fail('play.errors.invalid');
    $round = begin($c, 'coinflip', $a['bet'] ?? null, 1);
    $outcome = coinflip_side(forced($round, 1, fn($f) => coinflip_side($f[0]) === $side)[0]);
    $win = $outcome === $side;
    return ['outcome' => $outcome, 'side' => $side] + finish($c, $round, $win ? 1.98 : 0, $win ? 'win' : 'loss', ['side' => $side, 'outcome' => $outcome]);
}

function play_plinko(Ctx $c, array $a): array
{
    $risk = $a['risk'] ?? '';
    $table = PLINKO_TABLES[$risk] ?? null;
    if (!$table) fail('play.errors.invalid');
    $round = begin($c, 'plinko', $a['bet'] ?? null, PLINKO_ROWS);
    $res = plinko_path(forced($round, PLINKO_ROWS, fn($f) => $table[plinko_path($f, PLINKO_ROWS)['bin']] > 1), PLINKO_ROWS);
    $m = $table[$res['bin']];
    return ['path' => $res['path'], 'bin' => $res['bin'], 'risk' => $risk, 'multiplier' => $m]
        + finish($c, $round, $m, classify($m), ['bin' => $res['bin'], 'risk' => $risk]);
}

function roulette_hit(array $b, int $n): bool
{
    if ($b['type'] === 'straight') return $n === $b['value'];
    if ($n === 0) return false;
    switch ($b['type']) {
        case 'red': return in_array($n, RED, true);
        case 'black': return !in_array($n, RED, true);
        case 'odd': return $n % 2 === 1;
        case 'even': return $n % 2 === 0;
        case 'low': return $n <= 18;
        case 'high': return $n >= 19;
        case 'dozen': return (int) ceil($n / 12) === $b['value'];
    }
    return false;
}

function play_roulette(Ctx $c, array $a): array
{
    $bets = $a['bets'] ?? null;
    if (!is_array($bets) || count($bets) === 0 || count($bets) > 40) fail('play.errors.noBets');
    $clean = [];
    foreach ($bets as $b) {
        $type = $b['type'] ?? '';
        $amount = $b['amount'] ?? null;
        $value = $b['value'] ?? null;
        if (!isset(ROULETTE_PAYOUT[$type]) || !is_int($amount) || $amount < 1) fail('play.errors.invalid');
        if ($type === 'straight' && !(is_int($value) && $value >= 0 && $value <= 36)) fail('play.errors.invalid');
        if ($type === 'dozen' && !in_array($value, [1, 2, 3], true)) fail('play.errors.invalid');
        $clean[] = ['type' => $type, 'value' => $value, 'amount' => $amount];
    }
    $total = array_sum(array_column($clean, 'amount'));
    $round = begin($c, 'roulette', $total, 1);
    $returnedFor = function (int $n) use ($clean) {
        $s = 0;
        foreach ($clean as $b) if (roulette_hit($b, $n)) $s += $b['amount'] * ROULETTE_PAYOUT[$b['type']];
        return $s;
    };
    $number = roulette_number(forced($round, 1, fn($f) => $returnedFor(roulette_number($f[0])) > $total)[0]);
    $returned = $returnedFor($number);
    $multiplier = $returned / $total;
    $result = $returned > $total ? 'win' : ($returned === $total ? 'push' : 'loss');
    return ['number' => $number, 'color' => $number === 0 ? 'green' : (in_array($number, RED, true) ? 'red' : 'black'), 'returned' => $returned]
        + finish($c, $round, $multiplier, $result, ['number' => $number, 'bets' => count($clean)]);
}

// ───────────────────────────── Cases ─────────────────────────────

function draw_item(float $f1, float $f2, int $price): array
{
    $tier = pick_weighted($f1, TIERS);
    $pool = CASE_ITEMS[$tier['id']];
    $item = $pool[min(count($pool) - 1, (int) floor($f2 * count($pool)))];
    return ['tier' => $tier['id'], 'color' => $tier['color'], 'name' => $item['name'], 'value' => round2($item['mult'] * $price)];
}

function open_case(Ctx $c, array $a): array
{
    $caseId = $a['caseId'] ?? '';
    $price = CASES[$caseId] ?? null;
    if (!$price) fail('play.errors.invalid');
    $round = begin($c, 'case-opening', $price, 2);
    $f = forced($round, 2, fn($x) => draw_item($x[0], $x[1], $price)['value'] > $price);
    $item = draw_item($f[0], $f[1], $price);
    $m = $item['value'] / $price;
    return ['item' => $item] + finish($c, $round, $m, classify($m), ['case' => $caseId, 'item' => $item['name'], 'tier' => $item['tier']]);
}

function play_case_battle(Ctx $c, array $a): array
{
    $caseId = $a['caseId'] ?? '';
    $rounds = $a['rounds'] ?? null;
    $price = CASES[$caseId] ?? null;
    if (!$price || !in_array($rounds, [1, 2, 3], true)) fail('play.errors.invalid');
    $round = begin($c, 'case-battle', $price * $rounds, $rounds * 4);
    $totals = function ($fl) use ($rounds, $price) {
        $x = 0; $y = 0;
        for ($i = 0; $i < $rounds; $i++) {
            $x += draw_item($fl[$i * 4], $fl[$i * 4 + 1], $price)['value'];
            $y += draw_item($fl[$i * 4 + 2], $fl[$i * 4 + 3], $price)['value'];
        }
        return $x > $y;
    };
    $f = forced($round, $rounds * 4, $totals);
    $player = []; $bot = [];
    for ($i = 0; $i < $rounds; $i++) {
        $player[] = draw_item($f[$i * 4], $f[$i * 4 + 1], $price);
        $bot[] = draw_item($f[$i * 4 + 2], $f[$i * 4 + 3], $price);
    }
    $sum = fn($items) => round2(array_sum(array_column($items, 'value')));
    $pt = $sum($player);
    $bt = $sum($bot);
    $result = $pt > $bt ? 'win' : ($pt == $bt ? 'push' : 'loss');
    $m = $result === 'win' ? ($pt + $bt) / $round['bet'] : 0;
    return ['player' => $player, 'bot' => $bot, 'playerTotal' => $pt, 'botTotal' => $bt]
        + finish($c, $round, $m, $result, ['case' => $caseId, 'rounds' => $rounds, 'pt' => $pt, 'bt' => $bt]);
}

// ───────────────────────────── Crash ─────────────────────────────

function crash_multiplier_at(float $ms): float
{
    return floor(exp((CRASH_K * $ms) / 1000) * 100) / 100;
}

const CRASH_MIN_CASHOUT = 1.05;

function crash_time_of(float $point): float
{
    return (log($point) / CRASH_K) * 1000;
}

function crash_start(Ctx $c, array $a): array
{
    $auto = !empty($a['autoCashout']) ? floor(((float) $a['autoCashout']) * 100) / 100 : null;
    if ($auto !== null && !($auto >= CRASH_MIN_CASHOUT && $auto <= 10000)) fail('play.crash.minCashout', ['min' => number_format(CRASH_MIN_CASHOUT, 2)]);
    $round = begin($c, 'crash', $a['bet'] ?? null, 1, ['autoCashout' => $auto]);
    $round['point'] = $round['control'] === 'win' ? min(1000, crash_cfg()['maxMult']) : ($round['control'] === 'loss' ? 1 : crash_point_cfg($round['floats'][0]));
    save_open($round);
    return ['id' => $round['id'], 'startedAt' => $round['startedAt'], 'autoCashout' => $auto];
}

function crash_tick(Ctx $c, array $a): array
{
    $round = load_open($c, 'crash', $a['id'] ?? null);
    if (!$round) return ['done' => true];
    $elapsed = $c->now - $round['startedAt'];
    $current = crash_multiplier_at($elapsed);
    if ($round['autoCashout'] && $round['autoCashout'] <= $round['point'] && $current >= $round['autoCashout']) {
        $res = finish($c, $round, $round['autoCashout'], 'win', ['point' => $round['point'], 'cashedAt' => $round['autoCashout'], 'auto' => true] + crash_detail($round));
        crash_mark($round, (float) $round['autoCashout'], (float) $res['session']['payout']);
        return ['done' => true, 'crashed' => false, 'point' => $round['point'], 'cashedAt' => $round['autoCashout']] + $res;
    }
    if ($elapsed >= crash_time_of($round['point'])) {
        $res = finish($c, $round, 0, 'loss', ['point' => $round['point']] + crash_detail($round));
        crash_mark($round, null, 0);
        return ['done' => true, 'crashed' => true, 'point' => $round['point']] + $res;
    }
    return ['done' => false, 'multiplier' => $current];
}

function crash_cashout(Ctx $c, array $a): array
{
    $id = $a['id'] ?? null;
    $round = load_open($c, 'crash', $id);
    if (!$round) return stale_round($c, 'crash', $id);
    $elapsed = $c->now - $round['startedAt'];
    // Waktu klik di browser boleh dipakai bila tidak lebih lambat dari server dan masih dalam toleransi latensi.
    $client = isset($a['elapsed']) && is_numeric($a['elapsed']) ? (float) $a['elapsed'] : null;
    if ($client !== null && $client <= $elapsed && $client >= $elapsed - CRASH_GRACE_MS) $elapsed = $client;
    if ($elapsed >= crash_time_of($round['point'])) return crash_tick($c, ['id' => $id]);
    $at = max(1, crash_multiplier_at($elapsed));
    // Cash out paling cepat di 1.05× (cegah "cash out 1.01×" untuk farming XP/statistik).
    if ($at < CRASH_MIN_CASHOUT) fail('play.crash.minCashout', ['min' => number_format(CRASH_MIN_CASHOUT, 2)]);
    $res = finish($c, $round, $at, $at > 1 ? 'win' : 'push', ['point' => $round['point'], 'cashedAt' => $at] + crash_detail($round));
    crash_mark($round, $at, (float) $res['session']['payout']);
    return ['done' => true, 'crashed' => false, 'point' => $round['point'], 'cashedAt' => $at] + $res;
}

/** Global round id in the session detail (history links to the shared round). */
function crash_detail(array $round): array
{
    $c = crash_cfg();
    return (empty($round['globalRound']) ? [] : ['round' => $round['globalRound']]) + ['curve' => ['max' => $c['maxMult'], 'edge' => $c['edge'], 'tail' => $c['tail']]];
}

// ───────────────────────────── Mines ─────────────────────────────

function mines_multiplier(int $mines, int $picks): float
{
    $m = 1 - HOUSE_EDGE;
    for ($i = 0; $i < $picks; $i++) $m *= (25 - $i) / (25 - $mines - $i);
    return floor($m * 100) / 100;
}

function mines_start(Ctx $c, array $a): array
{
    $mines = $a['mines'] ?? null;
    if (!(is_int($mines) && $mines >= 1 && $mines <= 24)) fail('play.errors.invalid');
    $round = begin($c, 'mines', $a['bet'] ?? null, 24, ['mines' => $mines, 'revealed' => []]);
    $round['positions'] = mine_positions($round['floats'], $mines);
    save_open($round);
    return ['id' => $round['id'], 'mines' => $mines, 'revealed' => []];
}

function mines_reveal(Ctx $c, array $a): array
{
    $id = $a['id'] ?? null;
    $index = $a['index'] ?? null;
    $round = load_open($c, 'mines', $id);
    if (!$round) return stale_round($c, 'mines', $id);
    if (!(is_int($index) && $index >= 0 && $index < 25)) fail('play.errors.invalid');
    if (in_array($index, $round['revealed'], true)) {
        queue_flag($c->user['id'], 'modifiedState', 'low', $round['id'], 'petak belum dibuka', "petak $index (sudah dibuka)");
        fail('play.errors.invalid');
    }
    if (!empty($round['isTest']) && $round['control'] !== 'off') {
        $isMine = in_array($index, $round['positions'], true);
        if ($round['control'] === 'loss' && !$isMine) $round['positions'] = array_merge([$index], array_slice($round['positions'], 1));
        if ($round['control'] === 'win' && $isMine) {
            $free = null;
            for ($i = 0; $i < 25; $i++) if (!in_array($i, $round['positions'], true) && !in_array($i, $round['revealed'], true) && $i !== $index) { $free = $i; break; }
            $round['positions'] = array_map(fn($p) => $p === $index ? $free : $p, $round['positions']);
        }
    }
    if (in_array($index, $round['positions'], true)) {
        return ['done' => true, 'hit' => $index, 'mines' => $round['positions'], 'revealed' => $round['revealed']]
            + finish($c, $round, 0, 'loss', ['mines' => $round['mines'], 'picks' => count($round['revealed'])]);
    }
    $round['revealed'][] = $index;
    $multiplier = mines_multiplier($round['mines'], count($round['revealed']));
    if (count($round['revealed']) === 25 - $round['mines']) return mines_cashout($c, ['id' => $id], $round);
    save_open($round);
    return ['done' => false, 'revealed' => $round['revealed'], 'multiplier' => $multiplier, 'next' => mines_multiplier($round['mines'], count($round['revealed']) + 1)];
}

function mines_cashout(Ctx $c, array $a, ?array $loaded = null): array
{
    $id = $a['id'] ?? null;
    $round = $loaded ?? load_open($c, 'mines', $id);
    if (!$round) return stale_round($c, 'mines', $id);
    if (count($round['revealed']) === 0) {
        return ['done' => true, 'mines' => $round['positions'], 'revealed' => []]
            + finish($c, $round, 1, 'push', ['mines' => $round['mines'], 'picks' => 0], 'CANCELLED');
    }
    $m = mines_multiplier($round['mines'], count($round['revealed']));
    return ['done' => true, 'mines' => $round['positions'], 'revealed' => $round['revealed'], 'multiplier' => $m]
        + finish($c, $round, $m, 'win', ['mines' => $round['mines'], 'picks' => count($round['revealed'])]);
}

// ───────────────────────────── Blackjack ─────────────────────────────

function card_value(string $rank): int
{
    return $rank === 'A' ? 11 : (in_array($rank, ['K', 'Q', 'J'], true) ? 10 : (int) $rank);
}

function hand_value(array $cards): int
{
    $total = 0; $aces = 0;
    foreach ($cards as $c) { $total += card_value($c['rank']); if ($c['rank'] === 'A') $aces++; }
    while ($total > 21 && $aces > 0) { $total -= 10; $aces--; }
    return $total;
}

function is_blackjack(array $cards): bool
{
    return count($cards) === 2 && hand_value($cards) === 21;
}

function bj_view(array $r, bool $reveal): array
{
    return [
        'id' => $r['id'],
        'bet' => $r['bet'],
        'player' => $r['player'],
        'dealer' => $reveal ? $r['dealer'] : [$r['dealer'][0], ['hidden' => true, 'id' => 'hidden']],
        'playerTotal' => hand_value($r['player']),
        'dealerTotal' => $reveal ? hand_value($r['dealer']) : hand_value([$r['dealer'][0]]),
        'canDouble' => count($r['player']) === 2 && empty($r['doubled']),
    ];
}

function bj_settle(Ctx $c, array $r): array
{
    $p = hand_value($r['player']);
    $playDealer = function (array &$dealer, array &$deck) use ($p) {
        while ($p <= 21 && hand_value($dealer) < 17) $dealer[] = array_pop($deck);
        $d = hand_value($dealer);
        return $p > 21 ? 'loss' : ($d > 21 || $p > $d ? 'win' : ($p === $d ? 'push' : 'loss'));
    };
    if (!empty($r['isTest']) && $r['control'] !== 'off' && $p <= 21) {
        for ($i = 0; $i < 300; $i++) {
            $dealer = $r['dealer'];
            $deck = $r['deck'];
            shuffle($deck);
            if ($playDealer($dealer, $deck) === $r['control']) { $r['dealer'] = $dealer; $r['deck'] = $deck; break; }
        }
    }
    if (hand_value($r['dealer']) < 17 && $p <= 21) $playDealer($r['dealer'], $r['deck']);
    $d = hand_value($r['dealer']);
    $result = $p > 21 ? 'loss' : ($d > 21 || $p > $d ? 'win' : ($p === $d ? 'push' : 'loss'));
    return ['done' => true] + bj_view($r, true) + ['outcome' => $p > 21 ? 'bust' : ($d > 21 ? 'dealerBust' : $result)]
        + finish($c, $r, $result === 'win' ? 2 : 0, $result, ['player' => $p, 'dealer' => $d, 'doubled' => !empty($r['doubled'])]);
}

function blackjack_start(Ctx $c, array $a): array
{
    $r = begin($c, 'blackjack', $a['bet'] ?? null, 51);
    $deck = shuffle_with_floats(create_deck(), $r['floats']);
    $r['player'] = [array_pop($deck), array_pop($deck)];
    $r['dealer'] = [array_pop($deck), array_pop($deck)];
    $r['deck'] = $deck;
    if (is_blackjack($r['player']) || is_blackjack($r['dealer'])) {
        $both = is_blackjack($r['player']) && is_blackjack($r['dealer']);
        $result = $both ? 'push' : (is_blackjack($r['player']) ? 'win' : 'loss');
        return ['done' => true] + bj_view($r, true) + ['outcome' => $both ? 'push' : ($result === 'win' ? 'blackjack' : 'dealerBlackjack')]
            + finish($c, $r, $result === 'win' ? 2.5 : 0, $result, ['blackjack' => true]);
    }
    save_open($r);
    return ['done' => false] + bj_view($r, false);
}

function blackjack_action(Ctx $c, array $a): array
{
    $id = $a['id'] ?? null;
    $action = $a['action'] ?? '';
    $r = load_open($c, 'blackjack', $id);
    if (!$r) return stale_round($c, 'blackjack', $id);
    if ($action === 'hit') {
        if (!empty($r['isTest']) && $r['control'] === 'win') {
            foreach ($r['deck'] as $i => $card) {
                if (hand_value(array_merge($r['player'], [$card])) <= 21) {
                    array_splice($r['deck'], $i, 1);
                    $r['deck'][] = $card;
                    break;
                }
            }
        }
        $r['player'][] = array_pop($r['deck']);
        if (hand_value($r['player']) >= 21) return bj_settle($c, $r);
        save_open($r);
        return ['done' => false] + bj_view($r, false);
    }
    if ($action === 'double') {
        if (count($r['player']) !== 2 || !empty($r['doubled'])) fail('play.errors.invalid');
        if (empty($r['isTest'])) {
            wallet_post($c->user['id'], $r['currency'] ?? 'AC', -$r['bet'], 'bet', 'game', 'game', null, $r['id'], 'game:' . $r['id'] . ':double');
            if (($r['currency'] ?? 'AC') === 'AC') $c->meta['totalWagered'] = round2($c->meta['totalWagered'] + $r['bet']);
        }
        $r['bet'] *= 2;
        $r['doubled'] = true;
        q('UPDATE game_sessions SET bet = ? WHERE id = ?', [(string) $r['bet'], $r['id']]);
        $r['player'][] = array_pop($r['deck']);
        return bj_settle($c, $r);
    }
    if ($action === 'stand') return bj_settle($c, $r);
    fail('play.errors.invalid');
}

// ───────────────────────────── Resume ─────────────────────────────

function open_round(Ctx $c, array $a): ?array
{
    $game = $a['game'] ?? '';
    $r = load_open($c, $game);
    if (!$r) return null;
    if ($game === 'crash') return ['id' => $r['id'], 'startedAt' => $r['startedAt'], 'autoCashout' => $r['autoCashout']];
    if ($game === 'mines') return ['id' => $r['id'], 'mines' => $r['mines'], 'revealed' => $r['revealed'], 'bet' => $r['bet'], 'multiplier' => mines_multiplier($r['mines'], count($r['revealed']))];
    if ($game === 'blackjack') return ['done' => false] + bj_view($r, false);
    if (isset(LADDER[$game])) return ladder_public($r);
    return null;
}

const GAME_ACTIONS = [
    'dice' => 'play_dice', 'limbo' => 'play_limbo', 'coinflip' => 'play_coinflip', 'plinko' => 'play_plinko',
    'roulette' => 'play_roulette', 'case-open' => 'open_case', 'case-battle' => 'play_case_battle',
    'crash-start' => 'crash_bet', 'crash-bet' => 'crash_bet', 'crash-tick' => 'crash_tick', 'crash-cashout' => 'crash_cashout',
    'mines-start' => 'mines_start', 'mines-reveal' => 'mines_reveal', 'mines-cashout' => 'mines_cashout',
    'blackjack-start' => 'blackjack_start', 'blackjack-action' => 'blackjack_action', 'open' => 'open_round',
    'keno' => 'play_keno',
    'tower-start' => 'tower_start', 'tower-step' => 'tower_step', 'tower-cashout' => 'tower_cashout',
    'cross-start' => 'cross_start', 'cross-step' => 'cross_step', 'cross-cashout' => 'cross_cashout',
    'pump-start' => 'pump_start', 'pump-step' => 'pump_step', 'pump-cashout' => 'pump_cashout',
];

/** Ronde terbuka (Crash/Mines/Blackjack) untuk resume setelah refresh — tanpa rahasia server. */
function open_rounds_view(string $userId): array
{
    $out = [];
    foreach (q("SELECT game, state FROM game_sessions WHERE user_id = ? AND status = 'OPEN' AND game IN ('crash', 'mines', 'blackjack', 'tower', 'cross', 'pump')", [$userId])->fetchAll() as $row) {
        $r = jdec($row['state'], []);
        if (!$r) continue;
        if ($row['game'] === 'crash') $out['crash'] = ['id' => $r['id'], 'startedAt' => $r['startedAt'], 'autoCashout' => $r['autoCashout']];
        if ($row['game'] === 'mines') $out['mines'] = ['id' => $r['id'], 'mines' => $r['mines'], 'revealed' => $r['revealed'], 'bet' => $r['bet'], 'multiplier' => mines_multiplier($r['mines'], count($r['revealed']))];
        if ($row['game'] === 'blackjack') $out['blackjack'] = ['done' => false] + bj_view($r, false);
        if (isset(LADDER[$row['game']])) $out[$row['game']] = ladder_public($r);
    }
    return $out;
}
