<?php
// Skill arcades: the game runs in the browser; the server issues a run, then checks the submitted score against
// what is humanly possible for the elapsed time. Pays capped XP only (never AC/AG), so cheating has little value.
declare(strict_types=1);

const ARCADE = [
    'snake' => ['rate' => 2.5, 'minMs' => 2000, 'maxMs' => 1800000, 'xpPer' => 2],   // food per second at most
    'moles' => ['rate' => 3.0, 'minMs' => 25000, 'maxMs' => 40000, 'xpPer' => 1],    // fixed 30 s round
    'slice' => ['rate' => 4.0, 'minMs' => 2000, 'maxMs' => 1800000, 'xpPer' => 1],
    'layer' => ['rate' => 2.2, 'minMs' => 1500, 'maxMs' => 1800000, 'xpPer' => 2],
];
// Optional AC stake: reach a score tier to win stake × tier. Skill games can be automated, so stakes are small
// (≤ 10,000 AC), the top tier is ×2.5 and a player's net arcade winnings are capped per day.
const ARCADE_TIERS = [
    'snake' => [[10, 1.2], [20, 1.8], [35, 2.5]],
    'moles' => [[25, 1.2], [40, 1.8], [55, 2.5]],
    'slice' => [[25, 1.2], [50, 1.8], [80, 2.5]],
    'layer' => [[10, 1.2], [20, 1.8], [32, 2.5]],
];
const ARCADE_MAX_STAKE = 10000;
const ARCADE_DAY_NET_CAP = 100000;

function arcade_tier(string $game, int $score): float
{
    $m = 0.0;
    foreach (ARCADE_TIERS[$game] as [$need, $mult]) if ($score >= $need) $m = $mult;
    return $m;
}

const ARCADE_RUN_XP_CAP = 100;     // per run
const ARCADE_DAY_XP_CAP = 300;     // per game per day

function arcade_start(Ctx $c, array $a): array
{
    $game = (string) ($a['game'] ?? '');
    if (!isset(ARCADE[$game])) fail('play.errors.invalid');
    $stake = (int) ($a['stake'] ?? 0);
    if ($stake < 0 || $stake > ARCADE_MAX_STAKE) fail('play.arcade.stakeMax', ['max' => number_format(ARCADE_MAX_STAKE)]);
    q("UPDATE arcade_runs SET ended_at = now(), score = 0 WHERE user_id = ? AND game = ? AND ended_at IS NULL", [$c->user['id'], $game]);
    $id = (string) qv('INSERT INTO arcade_runs (user_id, game, stake) VALUES (?, ?, ?) RETURNING id', [$c->user['id'], $game, $stake]);
    if ($stake > 0) {
        try {
            wallet_post($c->user['id'], 'AC', -$stake, 'bet', 'game', 'arcade', "Arcade $game stake", null, "arcade:$id:stake");
        } catch (Throwable $e) {
            throw map_db_error($e);
        }
    }
    return ['runId' => $id, 'game' => $game, 'stake' => $stake];
}

function arcade_finish(Ctx $c, array $a): array
{
    $id = (string) ($a['runId'] ?? '');
    $score = $a['score'] ?? null;
    if (!preg_match('/^[0-9a-f-]{36}$/', $id) || !is_int($score) || $score < 0 || $score > 100000) fail('play.errors.invalid');
    $run = q1('SELECT * FROM arcade_runs WHERE id = ? AND user_id = ? FOR UPDATE', [$id, $c->user['id']]);
    if (!$run || $run['ended_at'] !== null) fail('play.errors.settled');
    $cfg = ARCADE[$run['game']];
    $ms = $c->now - iso_to_ms($run['started_at']);
    $max = (int) ceil($cfg['rate'] * $ms / 1000) + 2;
    $valid = $ms >= $cfg['minMs'] && $ms <= $cfg['maxMs'] && $score <= $max;
    $out = new_out();
    $xp = 0;
    if ($valid) {
        $day = day_key($c->now);
        $used = (int) ($c->meta['arcade'][$day][$run['game']] ?? 0);
        $xp = max(0, min(ARCADE_RUN_XP_CAP, $score * $cfg['xpPer'], ARCADE_DAY_XP_CAP - $used));
        $c->meta['arcade'] = [$day => array_merge($c->meta['arcade'][$day] ?? [], [$run['game'] => $used + $xp])];
        apply_xp($c->p, $xp, $out, 'arcade', $c->now);
    } else {
        queue_flag($c->user['id'], 'impossibleScore', 'medium', null, "≤ $max in {$ms} ms", (string) $score);
        $score = 0;
    }
    $stake = (float) $run['stake'];
    $payout = 0.0;
    if ($stake > 0 && $valid) {
        $mult = arcade_tier($run['game'], $score);
        if ($mult > 0) {
            $day = day_key($c->now);
            $net = (float) ($c->meta['arcadeNet'][$day] ?? 0);
            $payout = round2(min($stake * $mult, $stake + max(0, ARCADE_DAY_NET_CAP - $net)));
            $c->meta['arcadeNet'] = [$day => $net + $payout - $stake];
            wallet_post($c->user['id'], 'AC', $payout, 'win', 'game', 'arcade', "Arcade {$run['game']} ×$mult", null, "arcade:$id:win");
        }
    }
    q('UPDATE arcade_runs SET ended_at = now(), score = ?, xp = ?, payout = ? WHERE id = ?', [$score, $xp, $payout, $id]);
    commit_out($c->user['id'], $c->p, $c->meta, $out, false, $c->now);
    return ['score' => $score, 'xp' => $xp, 'valid' => $valid, 'stake' => $stake, 'payout' => $payout, 'best' => arcade_best($c->user['id'], $run['game'])] + $out;
}

function arcade_best(string $uid, string $game): int
{
    return (int) qv('SELECT COALESCE(max(score), 0) FROM arcade_runs WHERE user_id = ? AND game = ?', [$uid, $game]);
}

function arcade_board(?array $me, string $game): array
{
    if (!isset(ARCADE[$game])) fail('play.errors.invalid');
    $top = q("SELECT DISTINCT ON (r.user_id) r.user_id, u.username, r.score FROM arcade_runs r JOIN users u ON u.id = r.user_id
              WHERE r.game = ? AND r.ended_at > now() - interval '1 day' AND r.score > 0 ORDER BY r.user_id, r.score DESC", [$game])->fetchAll();
    usort($top, fn($x, $y) => $y['score'] <=> $x['score']);
    $day = day_key(now_ms());
    $used = 0;
    if ($me) { [, $meta] = load_docs($me['id']); $used = (int) ($meta['arcade'][$day][$game] ?? 0); }
    return ['top' => array_map(fn($r) => ['username' => $r['username'], 'score' => (int) $r['score']], array_slice($top, 0, 10)),
        'best' => $me ? arcade_best($me['id'], $game) : 0, 'tiers' => ARCADE_TIERS[$game], 'maxStake' => ARCADE_MAX_STAKE, 'xpLeft' => max(0, ARCADE_DAY_XP_CAP - $used), 'xpPer' => ARCADE[$game]['xpPer'], 'runCap' => ARCADE_RUN_XP_CAP];
}
