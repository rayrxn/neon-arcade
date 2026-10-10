<?php
// Port 1:1 dari src/utils/rng.js — provably fair (HMAC-SHA256) + pemetaan float → hasil game.
declare(strict_types=1);

const HOUSE_EDGE = 0.01;

/** Float deterministik di [0,1): HMAC_SHA256(serverSeed, "clientSeed:nonce:cursor"), 4 byte per float. */
function generate_floats(string $serverSeed, string $clientSeed, int $nonce, int $count): array
{
    $floats = [];
    for ($cursor = 0; count($floats) < $count; $cursor++) {
        $b = array_values(unpack('C*', hash_hmac('sha256', "$clientSeed:$nonce:$cursor", $serverSeed, true)));
        for ($i = 0; $i < 32 && count($floats) < $count; $i += 4) {
            $floats[] = $b[$i] / 256 + $b[$i + 1] / 65536 + $b[$i + 2] / 16777216 + $b[$i + 3] / 4294967296;
        }
    }
    return $floats;
}

function pick_weighted(float $f, array $items, string $key = 'weight'): array
{
    $total = array_sum(array_column($items, $key));
    $target = $f * $total;
    foreach ($items as $item) {
        if ($target < $item[$key]) return $item;
        $target -= $item[$key];
    }
    return $items[count($items) - 1];
}

function shuffle_with_floats(array $arr, array $floats): array
{
    $r = array_values($arr);
    for ($i = count($r) - 1, $f = 0; $i > 0; $i--, $f++) {
        $j = (int) floor($floats[$f] * ($i + 1));
        [$r[$i], $r[$j]] = [$r[$j], $r[$i]];
    }
    return $r;
}

function crash_point(float $f, float $edge = HOUSE_EDGE): float
{
    $raw = (1 - $edge) / (1 - $f);
    return max(1, floor($raw * 100) / 100);
}

function limbo_result(float $f, float $edge = HOUSE_EDGE): float
{
    return crash_point($f, $edge);
}

function dice_roll(float $f): float
{
    return floor($f * 10001) / 100;
}

function dice_multiplier(float $chance, float $edge = HOUSE_EDGE): float
{
    return $chance <= 0 ? 0 : floor(((100 * (1 - $edge)) / $chance) * 10000) / 10000;
}

function roulette_number(float $f): int
{
    return (int) floor($f * 37);
}

function coinflip_side(float $f): string
{
    return $f < 0.5 ? 'heads' : 'tails';
}

function plinko_path(array $floats, int $rows): array
{
    $path = array_map(fn($f) => $f < 0.5 ? 0 : 1, array_slice($floats, 0, $rows));
    return ['path' => $path, 'bin' => array_sum($path)];
}

function mine_positions(array $floats, int $mines, int $grid = 25): array
{
    $pos = array_slice(shuffle_with_floats(range(0, $grid - 1), $floats), 0, $mines);
    sort($pos);
    return $pos;
}

const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function create_deck(): array
{
    $deck = [];
    foreach (SUITS as $s) foreach (RANKS as $r) $deck[] = ['rank' => $r, 'suit' => $s, 'id' => "$r-$s"];
    return $deck;
}

/** Float acak non-deterministik (hanya untuk akun test Force Win/Loss, sama seperti Math.random di JS). */
function rand_float(): float
{
    return random_int(0, PHP_INT_MAX - 1) / PHP_INT_MAX;
}
