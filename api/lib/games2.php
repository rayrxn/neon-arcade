<?php
// v2.2 games: Keno (instant) and the "ladder" engine behind Tower, Cross the Road and Pump.
// Everything settles on the server from the player's provably fair floats (begin/finish in games.php).
declare(strict_types=1);

// ───────────────────────────── Keno ─────────────────────────────
// 40 numbers, the player picks 1–10, the server draws 10. Paytable ≈ 94% RTP (v2.6 economy pass) (see api/tests/stage9_test.php).
const KENO_POOL = 40;
const KENO_DRAW = 10;
const KENO_PAY = [
    1 => [0.0, 3.76],
    2 => [0.0, 1.81, 4.17],
    3 => [0.0, 0.0, 5.71, 13.13],
    4 => [0.0, 0.0, 2.96, 6.82, 15.68],
    5 => [0.0, 0.0, 1.8, 4.15, 9.56, 43.98],
    6 => [0.0, 0.0, 0.0, 4.85, 11.17, 25.7, 118.26],
    7 => [0.0, 0.0, 0.0, 2.96, 6.81, 15.67, 36.06, 165.88],
    8 => [0.0, 0.0, 0.0, 0.0, 8.36, 19.24, 44.27, 101.82, 468.4],
    9 => [0.0, 0.0, 0.0, 0.0, 5.04, 11.59, 26.66, 61.32, 141.05, 648.83],
    10 => [0.0, 0.0, 0.0, 0.0, 3.26, 7.5, 17.25, 39.69, 91.29, 209.98, 965.94],
];

/** Draw 10 distinct numbers 1..40 with a partial Fisher–Yates over the round floats. */
function keno_draw(array $floats): array
{
    $pool = range(1, KENO_POOL);
    for ($i = 0; $i < KENO_DRAW; $i++) {
        $j = $i + (int) floor($floats[$i] * (KENO_POOL - $i));
        [$pool[$i], $pool[$j]] = [$pool[$j], $pool[$i]];
    }
    return array_slice($pool, 0, KENO_DRAW);
}

function play_keno(Ctx $c, array $a): array
{
    $picks = $a['picks'] ?? null;
    if (!is_array($picks)) fail('play.errors.invalid');
    $picks = array_values(array_unique(array_map('intval', $picks)));
    if (count($picks) < 1 || count($picks) > 10) fail('play.errors.invalid');
    foreach ($picks as $p) if ($p < 1 || $p > KENO_POOL) fail('play.errors.invalid');
    sort($picks);
    $n = count($picks);
    $round = begin($c, 'keno', $a['bet'] ?? null, KENO_DRAW);
    $floats = forced($round, KENO_DRAW, fn($f) => KENO_PAY[$n][count(array_intersect(keno_draw($f), $picks))] > 0);
    $drawn = keno_draw($floats);
    $hits = array_values(array_intersect($drawn, $picks));
    $m = KENO_PAY[$n][count($hits)];
    return ['drawn' => $drawn, 'hits' => $hits, 'multiplier' => $m]
        + finish($c, $round, $m, $m > 0 ? 'win' : 'loss', ['picks' => $picks, 'drawn' => $drawn, 'hits' => count($hits)]);
}

// ───────────────────────────── Ladder: Tower / Cross the Road / Pump ─────────────────────────────
// Each step survives with probability p. Multiplier after k steps = 0.96 / p^k (4% edge), floored to 2 decimals.
// Tower: one float per row decides where the single bomb (or the single safe tile) is; the player's pick decides.
// Cross / Pump: step k fails when float[k] >= p.
const LADDER_RTP = 0.96;
const LADDER = [
    'tower' => ['steps' => 9, 'modes' => [
        'easy' => ['cols' => 4, 'one' => 'bomb'], 'medium' => ['cols' => 3, 'one' => 'bomb'],
        'hard' => ['cols' => 2, 'one' => 'safe'], 'expert' => ['cols' => 3, 'one' => 'safe'],
    ]],
    'cross' => ['steps' => 20, 'modes' => ['easy' => ['p' => 0.9], 'medium' => ['p' => 0.8], 'hard' => ['p' => 0.7], 'daredevil' => ['p' => 0.55]]],
    'pump' => ['steps' => 25, 'modes' => ['easy' => ['p' => 0.96], 'medium' => ['p' => 0.9], 'hard' => ['p' => 0.8], 'expert' => ['p' => 0.65]]],
];

function ladder_p(string $game, string $mode): float
{
    $m = LADDER[$game]['modes'][$mode];
    if ($game !== 'tower') return (float) $m['p'];
    return $m['one'] === 'bomb' ? ($m['cols'] - 1) / $m['cols'] : 1 / $m['cols'];
}

function ladder_mult(string $game, string $mode, int $k): float
{
    return $k <= 0 ? 1.0 : floor(LADDER_RTP / (ladder_p($game, $mode) ** $k) * 100) / 100;
}

/** Tower row layout from its float: the column holding the single bomb / safe tile. */
function tower_special(float $f, int $cols): int
{
    return min($cols - 1, (int) floor($f * $cols));
}

function ladder_survives(array $r, int $k, ?int $pick): bool
{
    $f = $r['lf'][$k];
    if ($r['game'] !== 'tower') return $f < ladder_p($r['game'], $r['mode']);
    $m = LADDER['tower']['modes'][$r['mode']];
    $col = tower_special($f, $m['cols']);
    return $m['one'] === 'bomb' ? $pick !== $col : $pick === $col;
}

function ladder_public(array $r): array
{
    return ['id' => $r['id'], 'game' => $r['game'], 'mode' => $r['mode'], 'step' => $r['step'], 'path' => $r['path'], 'bet' => $r['bet'],
        'multiplier' => ladder_mult($r['game'], $r['mode'], $r['step']), 'next' => ladder_mult($r['game'], $r['mode'], $r['step'] + 1),
        'steps' => LADDER[$r['game']]['steps']];
}

/** Full layout revealed when the round ends (tower: special column per row; others: the step that would fail). */
function ladder_reveal(array $r): array
{
    if ($r['game'] === 'tower') {
        $cols = LADDER['tower']['modes'][$r['mode']]['cols'];
        return ['layout' => array_map(fn($f) => tower_special($f, $cols), $r['lf'])];
    }
    $p = ladder_p($r['game'], $r['mode']);
    $fail = null;
    foreach ($r['lf'] as $i => $f) if ($f >= $p) { $fail = $i; break; }
    return ['failAt' => $fail];
}

function ladder_start(Ctx $c, array $a, string $game): array
{
    $mode = (string) ($a['mode'] ?? '');
    if (!isset(LADDER[$game]['modes'][$mode])) fail('play.errors.invalid');
    $round = begin($c, $game, $a['bet'] ?? null, LADDER[$game]['steps'], ['mode' => $mode, 'step' => 0, 'path' => []]);
    $round['lf'] = $round['floats']; // kept server-side only (save_open drops 'floats'); never sent to the player
    save_open($round);
    return ['done' => false] + ladder_public($round);
}

function ladder_step(Ctx $c, array $a, string $game): array
{
    $id = $a['id'] ?? null;
    $r = load_open($c, $game, $id);
    if (!$r) return stale_round($c, $game, $id);
    $pick = null;
    if ($game === 'tower') {
        $pick = $a['pick'] ?? null;
        if (!(is_int($pick) && $pick >= 0 && $pick < LADDER['tower']['modes'][$r['mode']]['cols'])) fail('play.errors.invalid');
    }
    $k = $r['step'];
    // Test accounts (Force Win/Loss) re-roll this step's float; normal players never pass here.
    if (!empty($r['isTest']) && $r['control'] !== 'off') {
        $want = $r['control'] === 'win';
        for ($i = 0; $i < 200 && ladder_survives($r, $k, $pick) !== $want; $i++) $r['lf'][$k] = rand_float();
    }
    if (!ladder_survives($r, $k, $pick)) {
        $r['path'][] = $pick;
        return ['done' => true, 'lost' => true, 'step' => $k, 'path' => $r['path']] + ladder_reveal($r)
            + finish($c, $r, 0, 'loss', ['mode' => $r['mode'], 'steps' => $k]);
    }
    $r['step'] = $k + 1;
    $r['path'][] = $pick;
    if ($r['step'] >= LADDER[$game]['steps']) return ladder_cashout($c, ['id' => $id], $game, $r);
    save_open($r);
    return ['done' => false] + ladder_public($r);
}

function ladder_cashout(Ctx $c, array $a, string $game, ?array $loaded = null): array
{
    $id = $a['id'] ?? null;
    $r = $loaded ?? load_open($c, $game, $id);
    if (!$r) return stale_round($c, $game, $id);
    if ($r['step'] === 0) {
        return ['done' => true, 'lost' => false, 'step' => 0, 'path' => []] + ladder_reveal($r)
            + finish($c, $r, 1, 'push', ['mode' => $r['mode'], 'steps' => 0], 'CANCELLED');
    }
    $m = ladder_mult($game, $r['mode'], $r['step']);
    return ['done' => true, 'lost' => false, 'step' => $r['step'], 'path' => $r['path'], 'multiplier' => $m] + ladder_reveal($r)
        + finish($c, $r, $m, 'win', ['mode' => $r['mode'], 'steps' => $r['step']]);
}

function tower_start(Ctx $c, array $a): array { return ladder_start($c, $a, 'tower'); }
function tower_step(Ctx $c, array $a): array { return ladder_step($c, $a, 'tower'); }
function tower_cashout(Ctx $c, array $a): array { return ladder_cashout($c, $a, 'tower'); }
function cross_start(Ctx $c, array $a): array { return ladder_start($c, $a, 'cross'); }
function cross_step(Ctx $c, array $a): array { return ladder_step($c, $a, 'cross'); }
function cross_cashout(Ctx $c, array $a): array { return ladder_cashout($c, $a, 'cross'); }
function pump_start(Ctx $c, array $a): array { return ladder_start($c, $a, 'pump'); }
function pump_step(Ctx $c, array $a): array { return ladder_step($c, $a, 'pump'); }
function pump_cashout(Ctx $c, array $a): array { return ladder_cashout($c, $a, 'pump'); }

// ───────────────────────────── Tarot ─────────────────────────────
// Three cards are drawn (with replacement) from the 22 major arcana. Each card has a multiplier for the chosen
// risk; the payout is the product of the three, floored to 2 decimals. Mean card value ≈ 0.94^(1/3) → ≈ 94% RTP.
const TAROT_CARDS = ['tower', 'death', 'devil', 'hanged', 'moon', 'hermit', 'fool', 'temperance', 'justice', 'hierophant', 'priestess', 'strength', 'emperor', 'empress', 'lovers', 'chariot', 'magician', 'judgement', 'wheel', 'star', 'sun', 'world'];
const TAROT_PAY = [
    'low' => [0.26, 0.45, 0.54, 0.63, 0.72, 0.72, 0.81, 0.81, 0.9, 0.9, 0.9, 0.9, 0.98, 0.98, 1.07, 1.07, 1.16, 1.26, 1.35, 1.44, 1.62, 1.97],
    'medium' => [0.0, 0.14, 0.29, 0.36, 0.43, 0.51, 0.58, 0.66, 0.73, 0.73, 0.73, 0.88, 0.88, 0.94, 1.09, 1.17, 1.31, 1.46, 1.61, 1.83, 2.19, 2.92],
    'high' => [0.0, 0.0, 0.0, 0.0, 0.0, 0.11, 0.17, 0.29, 0.29, 0.47, 0.59, 0.59, 0.71, 0.88, 0.88, 1.17, 1.47, 1.77, 2.06, 2.36, 2.94, 4.72],
];

function play_tarot(Ctx $c, array $a): array
{
    $risk = (string) ($a['risk'] ?? '');
    if (!isset(TAROT_PAY[$risk])) fail('play.errors.invalid');
    $round = begin($c, 'tarot', $a['bet'] ?? null, 3);
    $pick = fn($f) => array_map(fn($x) => min(21, (int) floor($x * 22)), $f);
    $mult = fn($idx) => floor(TAROT_PAY[$risk][$idx[0]] * TAROT_PAY[$risk][$idx[1]] * TAROT_PAY[$risk][$idx[2]] * 100) / 100;
    $idx = $pick(forced($round, 3, fn($f) => $mult($pick($f)) > 1));
    $m = $mult($idx);
    $cards = array_map(fn($i) => ['card' => TAROT_CARDS[$i], 'mult' => TAROT_PAY[$risk][$i]], $idx);
    return ['cards' => $cards, 'multiplier' => $m]
        + finish($c, $round, $m, $m > 1 ? 'win' : ($m == 1 ? 'push' : 'loss'), ['risk' => $risk, 'cards' => array_column($cards, 'card')]);
}


// ───────────────────────────── Sweet (tumble slot) ─────────────────────────────
// 6×5 grid. 8+ of the same symbol anywhere pays; winners vanish, the rest falls, new symbols drop in (max 20 tumbles).
// Bomb symbols carry ×2–×100; at the end of a winning spin the win is multiplied by the sum of bombs on the grid.
// Pays are calibrated by api/tests/sweet_rtp.php to ≈ 96.5% RTP. Win capped at ×5000.
const SWEET_COLS = 6;
const SWEET_ROWS = 5;
const SWEET_FLOATS = 1300;
const SWEET_MAX = 5000;
const SWEET_WEIGHTS = [90, 85, 80, 75, 55, 45, 35, 25, 3]; // 0–7 symbols, 8 = bomb
const SWEET_BOMBS = [2, 2, 3, 3, 4, 5, 8, 10, 15, 25, 50, 100];
const SWEET_PAY_SCALE = 0.2355; // measured: 0.2467 → 98.5% over 500k spins, so 0.2355 ≈ 94%
const SWEET_PAY = [ // [8–9, 10–11, 12+] × bet, before SWEET_PAY_SCALE
    [0.25, 0.75, 2], [0.4, 0.9, 4], [0.5, 1, 5], [0.8, 1.2, 8],
    [1, 1.5, 10], [1.5, 2, 12], [2, 5, 15], [10, 25, 50],
];

function sweet_spin(array $f, float $scale = SWEET_PAY_SCALE): array
{
    $i = 0;
    $next = function () use (&$f, &$i): float { return $f[$i++] ?? 0.5; };
    $total = array_sum(SWEET_WEIGHTS);
    $draw = function () use ($next, $total): array {
        $r = $next() * $total;
        foreach (SWEET_WEIGHTS as $s => $w) { if ($r < $w) break; $r -= $w; }
        return $s === 8 ? ['s' => 8, 'b' => SWEET_BOMBS[min(11, (int) floor($next() * 12))]] : ['s' => $s];
    };
    $grid = [];
    for ($c = 0; $c < SWEET_COLS; $c++) for ($r = 0; $r < SWEET_ROWS; $r++) $grid[$c][$r] = $draw();
    $steps = [];
    $win = 0.0;
    for ($t = 0; $t < 20; $t++) {
        $count = array_fill(0, 8, 0);
        foreach ($grid as $col) foreach ($col as $cell) if ($cell['s'] < 8) $count[$cell['s']]++;
        $wins = [];
        foreach ($count as $s => $n) if ($n >= 8) {
            $pay = round(SWEET_PAY[$s][$n >= 12 ? 2 : ($n >= 10 ? 1 : 0)] * $scale, 4);
            $wins[] = ['s' => $s, 'n' => $n, 'pay' => $pay];
            $win += $pay;
        }
        $steps[] = ['grid' => $grid, 'wins' => $wins];
        if (!$wins) break;
        $gone = array_column($wins, 's');
        for ($c = 0; $c < SWEET_COLS; $c++) {
            $keep = array_values(array_filter($grid[$c], fn($cell) => !in_array($cell['s'], $gone, true)));
            $fresh = [];
            for ($k = count($keep); $k < SWEET_ROWS; $k++) $fresh[] = $draw();
            $grid[$c] = array_merge($fresh, $keep);
        }
    }
    $bombs = 0;
    if ($win > 0) foreach (end($steps)['grid'] as $col) foreach ($col as $cell) if ($cell['s'] === 8) $bombs += $cell['b'];
    $mult = min(SWEET_MAX, floor($win * ($bombs > 0 ? $bombs : 1) * 100) / 100);
    return ['steps' => $steps, 'base' => round($win, 2), 'bombs' => $bombs, 'mult' => $mult];
}

function play_sweet(Ctx $c, array $a): array
{
    $round = begin($c, 'sweet', $a['bet'] ?? null, SWEET_FLOATS);
    $spin = sweet_spin(forced($round, SWEET_FLOATS, fn($f) => sweet_spin($f)['mult'] > 1));
    $m = $spin['mult'];
    return $spin + finish($c, $round, $m, $m > 1 ? 'win' : ($m == 1 ? 'push' : 'loss'), ['tumbles' => count($spin['steps']) - 1, 'bombs' => $spin['bombs']]);
}

// ───────────────────────────── Horse Racing (shared rounds) ─────────────────────────────
// Every round: 6 horses with odds from the round seed, one race for everyone. Bets close when the race starts.
// Win probability p_i = w_i / Σw, payout = 0.94 / p_i (6% edge). Winner and finishing order come from the same
// seed (HMAC "horse:<id>:<n>"), published as a hash before and revealed after the race.
const HORSE_COUNT = 6;
const HORSE_BET_MS = 15000;
const HORSE_RACE_MS = 12000;
const HORSE_PAUSE_MS = 5000;
const HORSE_EDGE = 0.06;

function horse_float(string $seed, int $id, int $n): float
{
    return hexdec(substr(hash_hmac('sha256', "horse:$id:$n", $seed), 0, 13)) / 4503599627370496;
}

/** Odds and finishing order for a round, fully determined by its seed. */
function horse_draw(string $seed, int $id): array
{
    $w = [];
    for ($i = 0; $i < HORSE_COUNT; $i++) $w[] = 1 + 7 * horse_float($seed, $id, $i) ** 2;
    $sum = array_sum($w);
    $p = array_map(fn($x) => $x / $sum, $w);
    $odds = array_map(fn($x) => floor((1 - HORSE_EDGE) / $x * 100) / 100, $p);
    $t = horse_float($seed, $id, 6);
    $winner = HORSE_COUNT - 1;
    foreach ($p as $i => $x) { if ($t < $x) { $winner = $i; break; } $t -= $x; }
    $rest = array_values(array_diff(range(0, HORSE_COUNT - 1), [$winner]));
    $key = [];
    foreach ($rest as $i) $key[$i] = $p[$i] * horse_float($seed, $id, 7 + $i);
    usort($rest, fn($a, $b) => $key[$b] <=> $key[$a]);
    return ['odds' => $odds, 'p' => $p, 'finish' => array_merge([$winner], $rest)];
}

/** Current round; settles the finished one and opens the next when it is time. */
function horse_current(int $now): array
{
    $r = q1('SELECT * FROM horse_rounds ORDER BY id DESC LIMIT 1');
    if ($r && $now < iso_to_ms($r['end_at']) + HORSE_PAUSE_MS) {
        if (!$r['settled'] && $now >= iso_to_ms($r['end_at'])) { q('SELECT pg_advisory_xact_lock(424243)'); horse_settle((int) $r['id']); }
        return $r;
    }
    q('SELECT pg_advisory_xact_lock(424243)');
    $r = q1('SELECT * FROM horse_rounds ORDER BY id DESC LIMIT 1');
    if ($r && $now < iso_to_ms($r['end_at']) + HORSE_PAUSE_MS) return $r;
    if ($r && !$r['settled']) horse_settle((int) $r['id']);
    $seed = rand_hex(32);
    $id = (int) qv("SELECT nextval(pg_get_serial_sequence('horse_rounds', 'id'))");
    $d = horse_draw($seed, $id);
    $start = $now + HORSE_BET_MS;
    q('INSERT INTO horse_rounds (id, server_seed, seed_hash, odds, finish, start_at, end_at) VALUES (?, ?, ?, ?::jsonb, ?::jsonb, to_timestamp(? / 1000.0), to_timestamp(? / 1000.0))',
        [$id, $seed, hash('sha256', $seed), jenc($d['odds']), jenc($d['finish']), $start, $start + HORSE_RACE_MS]);
    return q1('SELECT * FROM horse_rounds WHERE id = ?', [$id]);
}

function horse_settle(int $roundId): void
{
    $r = q1('SELECT * FROM horse_rounds WHERE id = ? FOR UPDATE', [$roundId]);
    if (!$r || $r['settled']) return;
    $odds = jdec($r['odds'], []);
    $winner = (int) jdec($r['finish'], [])[0];
    foreach (q("SELECT b.* FROM horse_bets b JOIN game_sessions s ON s.id = b.session_id WHERE b.round_id = ? AND s.status = 'OPEN'", [$roundId])->fetchAll() as $b) {
        $u = q1('SELECT * FROM users WHERE id = ?', [$b['user_id']]);
        [$p, $meta] = load_docs($b['user_id']);
        $c = new Ctx($u, $p, $meta, now_ms());
        $c->currency = $b['currency'];
        $round = load_open($c, 'horse', $b['session_id']);
        if (!$round) continue;
        $win = (int) $b['horse'] === $winner;
        $m = $win ? (float) $odds[(int) $b['horse']] : 0;
        finish($c, $round, $m, $win ? 'win' : 'loss', ['round' => $roundId, 'horse' => (int) $b['horse'], 'winner' => $winner]);
        q('UPDATE horse_bets SET payout = ? WHERE round_id = ? AND user_id = ?', [(string) round2($round['bet'] * $m), $roundId, $b['user_id']]);
        save_docs($b['user_id'], $c->p, $c->meta);
    }
    q('UPDATE horse_rounds SET settled = TRUE WHERE id = ?', [$roundId]);
}

function horse_bet(Ctx $c, array $a): array
{
    $horse = $a['horse'] ?? null;
    if (!(is_int($horse) && $horse >= 0 && $horse < HORSE_COUNT)) fail('play.errors.invalid');
    $r = horse_current($c->now);
    if ($c->now >= iso_to_ms($r['start_at'])) fail('play.horse.closed');
    if (qv('SELECT 1 FROM horse_bets WHERE round_id = ? AND user_id = ?', [$r['id'], $c->user['id']])) fail('play.horse.already');
    $round = begin($c, 'horse', $a['bet'] ?? null, 1, ['horse' => $horse, 'globalRound' => (int) $r['id']]);
    $round['proof']['serverSeedHash'] = $r['seed_hash'];
    save_open($round);
    q('INSERT INTO horse_bets (round_id, user_id, session_id, horse, bet, currency) VALUES (?, ?, ?, ?, ?, ?::currency_code)',
        [$r['id'], $c->user['id'], $round['id'], $horse, (string) $round['bet'], $round['currency']]);
    return ['id' => $round['id'], 'roundId' => (int) $r['id'], 'horse' => $horse, 'bet' => $round['bet'], 'currency' => $round['currency']];
}

/** Public state. Finishing order and seed only after the race ends. */
function horse_state(?array $me): array
{
    $now = now_ms();
    $r = horse_current($now);
    $start = iso_to_ms($r['start_at']);
    $end = iso_to_ms($r['end_at']);
    $done = $now >= $end;
    $bets = array_map(fn($b) => ['username' => $b['username'], 'horse' => (int) $b['horse'], 'bet' => num($b['bet']), 'currency' => $b['currency'], 'payout' => $b['payout'] === null ? null : num($b['payout'])],
        q('SELECT b.horse, b.bet, b.currency, b.payout, u.username FROM horse_bets b JOIN users u ON u.id = b.user_id WHERE b.round_id = ? ORDER BY b.bet DESC LIMIT 50', [$r['id']])->fetchAll());
    $mine = $me ? q1('SELECT horse, bet, currency, payout FROM horse_bets WHERE round_id = ? AND user_id = ?', [$r['id'], $me['id']]) : null;
    $history = array_map(fn($h) => ['id' => (int) $h['id'], 'winner' => (int) jdec($h['finish'], [0])[0], 'odds' => jdec($h['odds'], []), 'seed' => $h['server_seed'], 'hash' => $h['seed_hash']],
        q('SELECT id, finish, odds, server_seed, seed_hash FROM horse_rounds WHERE end_at <= now() ORDER BY id DESC LIMIT 12')->fetchAll());
    return [
        'round' => ['id' => (int) $r['id'], 'phase' => $now < $start ? 'betting' : ($done ? 'finished' : 'racing'), 'startAt' => $start, 'endAt' => $end,
            'nextAt' => $end + HORSE_PAUSE_MS, 'odds' => jdec($r['odds'], []), 'seedHash' => $r['seed_hash'],
            'finish' => $now >= $start ? jdec($r['finish'], []) : null, 'seed' => $done ? $r['server_seed'] : null],
        'bets' => $bets,
        'mine' => $mine ? ['horse' => (int) $mine['horse'], 'bet' => num($mine['bet']), 'currency' => $mine['currency'], 'payout' => $mine['payout'] === null ? null : num($mine['payout'])] : null,
        'history' => $history,
        'serverTime' => $now,
    ];
}
