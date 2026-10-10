<?php
// v2.2 games: Keno (instant) and the "ladder" engine behind Tower, Cross the Road and Pump.
// Everything settles on the server from the player's provably fair floats (begin/finish in games.php).
declare(strict_types=1);

// ───────────────────────────── Keno ─────────────────────────────
// 40 numbers, the player picks 1–10, the server draws 10. Paytable ≈ 97% RTP (see api/tests/stage9_test.php).
const KENO_POOL = 40;
const KENO_DRAW = 10;
const KENO_PAY = [
    1 => [0.0, 3.88],
    2 => [0.0, 1.88, 4.31],
    3 => [0.0, 0.0, 5.89, 13.56],
    4 => [0.0, 0.0, 3.06, 7.04, 16.19],
    5 => [0.0, 0.0, 1.87, 4.29, 9.87, 45.38],
    6 => [0.0, 0.0, 0.0, 5.02, 11.53, 26.53, 122.04],
    7 => [0.0, 0.0, 0.0, 3.06, 7.03, 16.18, 37.21, 171.18],
    8 => [0.0, 0.0, 0.0, 0.0, 8.64, 19.86, 45.69, 105.08, 483.35],
    9 => [0.0, 0.0, 0.0, 0.0, 5.2, 11.96, 27.51, 63.28, 145.55, 669.54],
    10 => [0.0, 0.0, 0.0, 0.0, 3.37, 7.74, 17.81, 40.96, 94.21, 216.69, 996.77],
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
// Each step survives with probability p. Multiplier after k steps = 0.99 / p^k (1% edge), floored to 2 decimals.
// Tower: one float per row decides where the single bomb (or the single safe tile) is; the player's pick decides.
// Cross / Pump: step k fails when float[k] >= p.
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
    return $k <= 0 ? 1.0 : floor(0.99 / (ladder_p($game, $mode) ** $k) * 100) / 100;
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
// risk; the payout is the product of the three, floored to 2 decimals. Mean card value = 0.97^(1/3) → ≈ 97% RTP.
const TAROT_CARDS = ['tower', 'death', 'devil', 'hanged', 'moon', 'hermit', 'fool', 'temperance', 'justice', 'hierophant', 'priestess', 'strength', 'emperor', 'empress', 'lovers', 'chariot', 'magician', 'judgement', 'wheel', 'star', 'sun', 'world'];
const TAROT_PAY = [
    'low' => [0.27, 0.46, 0.55, 0.64, 0.73, 0.73, 0.82, 0.82, 0.91, 0.91, 0.91, 0.91, 1.0, 1.0, 1.09, 1.09, 1.18, 1.28, 1.37, 1.46, 1.64, 2.0],
    'medium' => [0.0, 0.15, 0.3, 0.37, 0.44, 0.52, 0.59, 0.67, 0.74, 0.74, 0.74, 0.89, 0.89, 0.96, 1.11, 1.19, 1.33, 1.48, 1.63, 1.85, 2.22, 2.96],
    'high' => [0.0, 0.0, 0.0, 0.0, 0.0, 0.12, 0.18, 0.3, 0.3, 0.48, 0.6, 0.6, 0.72, 0.89, 0.89, 1.19, 1.49, 1.79, 2.09, 2.39, 2.98, 4.77],
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
const SWEET_PAY_SCALE = 0.24; // measured: 0.2467 → 98.5% over 500k spins, so 0.24 ≈ 96%
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
