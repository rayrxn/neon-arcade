<?php
// Chess PvP: rules engine (1:1 port of src/lib/chess.js, perft-checked in api/tests) + wagered matches.
// The server is the referee: every move is validated here, clocks run on server time, stakes are escrowed.
declare(strict_types=1);

const CH_START = ['b' => 'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR', 't' => 'w', 'c' => 'KQkq', 'e' => -1, 'h' => 0, 'n' => 0];
const CH_N = [-17, -15, -10, -6, 6, 10, 15, 17];
const CH_K = [-9, -8, -7, -1, 1, 7, 8, 9];
const CH_DIAG = [-9, -7, 7, 9];
const CH_ORTH = [-8, -1, 1, 8];
const CH_RAKE = 0.05;          // 5% of the pot goes to the house on a decisive game
const CH_TIMES = [3, 5, 10];   // minutes per side
const CH_MAX_PLIES = 400;

function ch_white(string $p): bool { return $p >= 'A' && $p <= 'Z'; }
function ch_own(string $p, string $t): bool { return $p !== '.' && ($t === 'w' ? ch_white($p) : !ch_white($p)); }
function ch_step(int $from, int $d): int
{
    $to = $from + $d;
    if ($to < 0 || $to > 63) return -1;
    return abs(($to & 7) - ($from & 7)) > 2 ? -1 : $to;
}

function ch_attacked(string $b, int $sq, string $by): bool
{
    $P = $by === 'w' ? 'P' : 'p';
    foreach ($by === 'w' ? [7, 9] : [-7, -9] as $d) { $f = ch_step($sq, $d); if ($f >= 0 && $b[$f] === $P) return true; }
    $kn = $by === 'w' ? 'N' : 'n';
    foreach (CH_N as $d) { $f = ch_step($sq, $d); if ($f >= 0 && $b[$f] === $kn) return true; }
    $kg = $by === 'w' ? 'K' : 'k';
    foreach (CH_K as $d) { $f = ch_step($sq, $d); if ($f >= 0 && $b[$f] === $kg) return true; }
    foreach ([[CH_DIAG, $by === 'w' ? 'BQ' : 'bq'], [CH_ORTH, $by === 'w' ? 'RQ' : 'rq']] as [$dirs, $set]) {
        foreach ($dirs as $d) {
            $f = $sq;
            while (true) {
                $n = ch_step($f, $d);
                if ($n < 0 || abs(($n & 7) - ($f & 7)) > 1) break;
                $f = $n;
                if ($b[$f] === '.') continue;
                if (str_contains($set, $b[$f])) return true;
                break;
            }
        }
    }
    return false;
}

function ch_in_check(array $s, ?string $side = null): bool
{
    $side ??= $s['t'];
    return ch_attacked($s['b'], strpos($s['b'], $side === 'w' ? 'K' : 'k'), $side === 'w' ? 'b' : 'w');
}

function ch_pseudo(array $s): array
{
    $b = $s['b']; $t = $s['t']; $out = [];
    $add = function (int $f, int $to) use (&$out, $b) {
        if (strtolower($b[$f]) === 'p' && ($to < 8 || $to > 55)) foreach (['q', 'r', 'b', 'n'] as $pr) $out[] = ['f' => $f, 't' => $to, 'p' => $pr];
        else $out[] = ['f' => $f, 't' => $to];
    };
    for ($f = 0; $f < 64; $f++) {
        $pc = $b[$f];
        if (!ch_own($pc, $t)) continue;
        $p = strtolower($pc);
        if ($p === 'p') {
            $dir = $t === 'w' ? -8 : 8;
            $one = $f + $dir;
            if ($one >= 0 && $one < 64 && $b[$one] === '.') {
                $add($f, $one);
                if (($f >> 3) === ($t === 'w' ? 6 : 1) && $b[$one + $dir] === '.') $out[] = ['f' => $f, 't' => $one + $dir];
            }
            foreach ($t === 'w' ? [-9, -7] : [7, 9] as $d) {
                $to = ch_step($f, $d);
                if ($to < 0 || abs(($to & 7) - ($f & 7)) !== 1) continue;
                if (($b[$to] !== '.' && !ch_own($b[$to], $t)) || $to === $s['e']) $add($f, $to);
            }
        } elseif ($p === 'n' || $p === 'k') {
            foreach ($p === 'n' ? CH_N : CH_K as $d) { $to = ch_step($f, $d); if ($to >= 0 && !ch_own($b[$to], $t)) $out[] = ['f' => $f, 't' => $to]; }
            if ($p === 'k') {
                $opp = $t === 'w' ? 'b' : 'w';
                $home = $t === 'w' ? 60 : 4;
                if ($f === $home && !ch_attacked($b, $home, $opp)) {
                    [$ks, $qs] = $t === 'w' ? ['K', 'Q'] : ['k', 'q'];
                    if (str_contains($s['c'], $ks) && $b[$home + 1] === '.' && $b[$home + 2] === '.' && !ch_attacked($b, $home + 1, $opp)) $out[] = ['f' => $f, 't' => $home + 2];
                    if (str_contains($s['c'], $qs) && $b[$home - 1] === '.' && $b[$home - 2] === '.' && $b[$home - 3] === '.' && !ch_attacked($b, $home - 1, $opp)) $out[] = ['f' => $f, 't' => $home - 2];
                }
            }
        } else {
            $dirs = $p === 'b' ? CH_DIAG : ($p === 'r' ? CH_ORTH : array_merge(CH_DIAG, CH_ORTH));
            foreach ($dirs as $d) {
                $cur = $f;
                while (true) {
                    $to = ch_step($cur, $d);
                    if ($to < 0 || abs(($to & 7) - ($cur & 7)) > 1 || ch_own($b[$to], $t)) break;
                    $out[] = ['f' => $f, 't' => $to];
                    if ($b[$to] !== '.') break;
                    $cur = $to;
                }
            }
        }
    }
    return $out;
}

function ch_apply(array $s, array $m): array
{
    $b = $s['b'];
    $pc = $b[$m['f']];
    $p = strtolower($pc);
    $cap = $b[$m['t']] !== '.';
    $b[$m['t']] = !empty($m['p']) ? ($s['t'] === 'w' ? strtoupper($m['p']) : $m['p']) : $pc;
    $b[$m['f']] = '.';
    if ($p === 'p' && $m['t'] === $s['e']) $b[$m['t'] + ($s['t'] === 'w' ? 8 : -8)] = '.';
    if ($p === 'k' && abs($m['t'] - $m['f']) === 2) {
        $rf = $m['t'] > $m['f'] ? $m['f'] + 3 : $m['f'] - 4;
        $b[($m['f'] + $m['t']) >> 1] = $b[$rf];
        $b[$rf] = '.';
    }
    $c = $s['c'];
    if ($pc === 'K') $c = str_replace(['K', 'Q'], '', $c);
    if ($pc === 'k') $c = str_replace(['k', 'q'], '', $c);
    foreach ([$m['f'], $m['t']] as $sq) {
        if ($sq === 63) $c = str_replace('K', '', $c);
        if ($sq === 56) $c = str_replace('Q', '', $c);
        if ($sq === 7) $c = str_replace('k', '', $c);
        if ($sq === 0) $c = str_replace('q', '', $c);
    }
    return ['b' => $b, 't' => $s['t'] === 'w' ? 'b' : 'w', 'c' => $c, 'e' => $p === 'p' && abs($m['t'] - $m['f']) === 16 ? ($m['f'] + $m['t']) >> 1 : -1,
        'h' => $p === 'p' || $cap ? 0 : $s['h'] + 1, 'n' => $s['n'] + 1];
}

function ch_legal(array $s): array
{
    return array_values(array_filter(ch_pseudo($s), fn($m) => !ch_in_check(ch_apply($s, $m), $s['t'])));
}

function ch_status(array $s): ?string
{
    if (!ch_legal($s)) return ch_in_check($s) ? 'checkmate' : 'stalemate';
    if ($s['h'] >= 100) return 'fifty';
    $rest = preg_replace('/[.kK]/', '', $s['b']);
    if (in_array($rest, ['', 'n', 'N', 'b', 'B'], true)) return 'insufficient';
    if ($s['n'] >= CH_MAX_PLIES) return 'length';
    return null;
}

// ───────────────────────────── Matches ─────────────────────────────

/** Escrow a stake; database errors (not enough balance, frozen wallet) come back as player errors. */
function ch_debit(string $uid, string $cur, float $stake, string $key): void
{
    try {
        wallet_post($uid, $cur, -$stake, 'bet', 'game', 'chess', 'Chess stake', null, $key);
    } catch (Throwable $e) {
        throw map_db_error($e);
    }
}

function ch_view(array $m, ?array $me): array
{
    $now = now_ms();
    $st = jdec($m['state'], CH_START);
    $clock = jdec($m['clock'], ['w' => 0, 'b' => 0]);
    if ($m['status'] === 'active' && $m['turn_at']) $clock[$st['t']] = max(0, $clock[$st['t']] - ($now - iso_to_ms($m['turn_at'])));
    $side = $me ? ($me['id'] === $m['white_id'] ? 'w' : ($me['id'] === $m['black_id'] ? 'b' : null)) : null;
    return [
        'id' => $m['id'], 'status' => $m['status'], 'result' => $m['result'], 'reason' => $m['reason'],
        'white' => $m['white_id'] ? ['id' => $m['white_id'], 'username' => username_of($m['white_id'])] : null,
        'black' => $m['black_id'] ? ['id' => $m['black_id'], 'username' => username_of($m['black_id'])] : null,
        'stake' => num((float) $m['stake']), 'currency' => $m['currency'], 'minutes' => (int) $m['minutes'],
        'state' => $st, 'moves' => jdec($m['moves'], []), 'clock' => $clock, 'you' => $side, 'serverTime' => $now,
        'check' => $m['status'] === 'active' && ch_in_check($st),
    ];
}

function ch_lock(string $id): array
{
    if (!preg_match('/^[0-9a-f-]{36}$/', $id)) fail('play.errors.invalid');
    $m = q1('SELECT * FROM chess_matches WHERE id = ? FOR UPDATE', [$id]);
    if (!$m) fail('play.errors.invalid');
    return $m;
}

/** Pay out a finished game. result: 'w' | 'b' | 'draw'. Idempotent through the ledger keys. */
function ch_finish(array $m, string $result, string $reason): array
{
    $stake = (float) $m['stake'];
    $cur = $m['currency'];
    if ($stake > 0 && $m['black_id']) {
        if ($result === 'draw') {
            foreach ([$m['white_id'], $m['black_id']] as $uid) wallet_post($uid, $cur, $stake, 'refund', 'game', 'chess', 'Chess draw refund', null, "chess:{$m['id']}:$uid:draw");
        } else {
            $win = $result === 'w' ? $m['white_id'] : $m['black_id'];
            wallet_post($win, $cur, round2($stake * 2 * (1 - CH_RAKE)), 'win', 'game', 'chess', 'Chess win', null, "chess:{$m['id']}:win");
        }
    }
    q("UPDATE chess_matches SET status = 'done', result = ?, reason = ?, ended_at = now() WHERE id = ?", [$result, $reason, $m['id']]);
    foreach (array_filter([$m['white_id'], $m['black_id']]) as $uid) {
        $won = $result === 'draw' ? null : (($result === 'w') === ($uid === $m['white_id']));
        notify($uid, 'chess', ['matchId' => $m['id'], 'result' => $won === null ? 'draw' : ($won ? 'win' : 'loss'), 'reason' => $reason]);
    }
    $m['status'] = 'done'; $m['result'] = $result; $m['reason'] = $reason;
    return $m;
}

/** Flag fall: the side to move ran out of time. */
function ch_check_clock(array $m): array
{
    if ($m['status'] !== 'active' || !$m['turn_at']) return $m;
    $st = jdec($m['state'], CH_START);
    $clock = jdec($m['clock'], []);
    if ($clock[$st['t']] - (now_ms() - iso_to_ms($m['turn_at'])) <= 0) {
        $clock[$st['t']] = 0;
        q('UPDATE chess_matches SET clock = ?::jsonb WHERE id = ?', [jenc($clock), $m['id']]);
        $m['clock'] = jenc($clock);
        return ch_finish($m, $st['t'] === 'w' ? 'b' : 'w', 'timeout');
    }
    return $m;
}

function chess_action(array $me, string $action, array $a): array
{
    switch ($action) {
        case 'create': {
            $min = (int) ($a['minutes'] ?? 5);
            if (!in_array($min, CH_TIMES, true)) fail('play.errors.invalid');
            $cur = ($a['currency'] ?? 'AC') === 'AG' ? 'AG' : 'AC';
            $stake = (float) ($a['stake'] ?? 0);
            if ($stake < 0) fail('play.errors.invalid');
            if (qv("SELECT count(*) FROM chess_matches WHERE (white_id = ? OR black_id = ?) AND status IN ('waiting', 'active')", [$me['id'], $me['id']]) >= 1) fail('play.chess.busy');
            if ($stake > 0) { $stake = check_bet($stake); check_loyalty_bet($me, $cur, (int) $stake, 'chess'); }
            $id = (string) qv("INSERT INTO chess_matches (white_id, stake, currency, minutes, state, clock) VALUES (?, ?, ?::currency_code, ?, ?::jsonb, ?::jsonb) RETURNING id",
                [$me['id'], (string) $stake, $cur, $min, jenc(CH_START), jenc(['w' => $min * 60000, 'b' => $min * 60000])]);
            if ($stake > 0) ch_debit($me['id'], $cur, $stake, "chess:$id:{$me['id']}:stake");
            return ch_view(q1('SELECT * FROM chess_matches WHERE id = ?', [$id]), $me);
        }
        case 'join': {
            $m = ch_lock((string) ($a['id'] ?? ''));
            if ($m['status'] !== 'waiting' || $m['white_id'] === $me['id']) fail('play.chess.notOpen');
            if (qv("SELECT count(*) FROM chess_matches WHERE (white_id = ? OR black_id = ?) AND status IN ('waiting', 'active')", [$me['id'], $me['id']]) >= 1) fail('play.chess.busy');
            $stake = (float) $m['stake'];
            if ($stake > 0) {
                check_loyalty_bet($me, $m['currency'], (int) $stake, 'chess');
                ch_debit($me['id'], $m['currency'], $stake, "chess:{$m['id']}:{$me['id']}:stake");
            }
            // Colours are drawn at random so the creator does not always move first.
            $swap = random_int(0, 1) === 1;
            q("UPDATE chess_matches SET white_id = ?, black_id = ?, status = 'active', turn_at = now(), started_at = now() WHERE id = ?",
                [$swap ? $me['id'] : $m['white_id'], $swap ? $m['white_id'] : $me['id'], $m['id']]);
            notify($m['white_id'], 'chess', ['matchId' => $m['id'], 'event' => 'joined', 'by' => $me['username']]);
            return ch_view(q1('SELECT * FROM chess_matches WHERE id = ?', [$m['id']]), $me);
        }
        case 'cancel': {
            $m = ch_lock((string) ($a['id'] ?? ''));
            if ($m['status'] !== 'waiting' || $m['white_id'] !== $me['id']) fail('play.chess.notOpen');
            if ((float) $m['stake'] > 0) wallet_post($me['id'], $m['currency'], (float) $m['stake'], 'refund', 'game', 'chess', 'Chess cancelled', null, "chess:{$m['id']}:cancel");
            q("UPDATE chess_matches SET status = 'cancelled', ended_at = now() WHERE id = ?", [$m['id']]);
            return ['ok' => true];
        }
        case 'move': {
            $m = ch_check_clock(ch_lock((string) ($a['id'] ?? '')));
            if ($m['status'] !== 'active') return ch_view($m, $me);
            $st = jdec($m['state'], CH_START);
            $side = $me['id'] === $m['white_id'] ? 'w' : ($me['id'] === $m['black_id'] ? 'b' : null);
            if ($side !== $st['t']) fail('play.chess.notYourTurn');
            $f = $a['from'] ?? null; $t = $a['to'] ?? null; $pr = $a['promo'] ?? null;
            if (!is_int($f) || !is_int($t)) fail('play.errors.invalid');
            $mv = null;
            foreach (ch_legal($st) as $lm) if ($lm['f'] === $f && $lm['t'] === $t && (($lm['p'] ?? null) === null || $lm['p'] === ($pr ?: 'q'))) { $mv = $lm; break; }
            if (!$mv) fail('play.chess.illegal');
            $clock = jdec($m['clock'], []);
            $clock[$side] = max(0, $clock[$side] - (now_ms() - iso_to_ms($m['turn_at'])));
            $next = ch_apply($st, $mv);
            $moves = jdec($m['moves'], []);
            $moves[] = $mv;
            q('UPDATE chess_matches SET state = ?::jsonb, moves = ?::jsonb, clock = ?::jsonb, turn_at = now() WHERE id = ?', [jenc($next), jenc($moves), jenc($clock), $m['id']]);
            $m = q1('SELECT * FROM chess_matches WHERE id = ?', [$m['id']]);
            $end = ch_status($next);
            if ($end) $m = ch_finish($m, $end === 'checkmate' ? $side : 'draw', $end);
            return ch_view($m, $me);
        }
        case 'resign': {
            $m = ch_lock((string) ($a['id'] ?? ''));
            if ($m['status'] !== 'active') fail('play.chess.notOpen');
            $side = $me['id'] === $m['white_id'] ? 'w' : ($me['id'] === $m['black_id'] ? 'b' : null);
            if (!$side) fail('play.errors.invalid');
            return ch_view(ch_finish($m, $side === 'w' ? 'b' : 'w', 'resign'), $me);
        }
    }
    fail('errors.notFound', [], 404);
}

function chess_state(?array $me, string $id): array
{
    return tx(function () use ($me, $id) {
        $m = ch_check_clock(ch_lock($id));
        return ch_view($m, $me);
    });
}

function chess_lobby(?array $me): array
{
    $open = array_map(fn($m) => ['id' => $m['id'], 'host' => username_of($m['white_id']), 'stake' => num((float) $m['stake']), 'currency' => $m['currency'], 'minutes' => (int) $m['minutes'], 'mine' => $me && $m['white_id'] === $me['id']],
        q("SELECT * FROM chess_matches WHERE status = 'waiting' AND created_at > now() - interval '30 minutes' ORDER BY created_at DESC LIMIT 30")->fetchAll());
    $active = $me ? q1("SELECT id FROM chess_matches WHERE (white_id = ? OR black_id = ?) AND status IN ('waiting', 'active') ORDER BY created_at DESC LIMIT 1", [$me['id'], $me['id']]) : null;
    $recent = $me ? array_map(fn($m) => ch_view($m, $me), q("SELECT * FROM chess_matches WHERE (white_id = ? OR black_id = ?) AND status = 'done' ORDER BY ended_at DESC LIMIT 5", [$me['id'], $me['id']])->fetchAll()) : [];
    return ['open' => $open, 'active' => $active['id'] ?? null, 'recent' => array_map(fn($v) => array_diff_key($v, ['moves' => 1, 'state' => 1]), $recent), 'times' => CH_TIMES, 'rake' => CH_RAKE];
}
