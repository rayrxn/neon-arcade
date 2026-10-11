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
const ARCADE_RUN_XP_CAP = 100;     // per run
const ARCADE_DAY_XP_CAP = 300;     // per game per day

function arcade_start(Ctx $c, array $a): array
{
    $game = (string) ($a['game'] ?? '');
    if (!isset(ARCADE[$game])) fail('play.errors.invalid');
    q("UPDATE arcade_runs SET ended_at = now(), score = 0 WHERE user_id = ? AND game = ? AND ended_at IS NULL", [$c->user['id'], $game]);
    $id = (string) qv('INSERT INTO arcade_runs (user_id, game) VALUES (?, ?) RETURNING id', [$c->user['id'], $game]);
    return ['runId' => $id, 'game' => $game];
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
    q('UPDATE arcade_runs SET ended_at = now(), score = ?, xp = ? WHERE id = ?', [$score, $xp, $id]);
    commit_out($c->user['id'], $c->p, $c->meta, $out, false, $c->now);
    return ['score' => $score, 'xp' => $xp, 'valid' => $valid, 'best' => arcade_best($c->user['id'], $run['game'])] + $out;
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
        'best' => $me ? arcade_best($me['id'], $game) : 0, 'xpLeft' => max(0, ARCADE_DAY_XP_CAP - $used), 'xpPer' => ARCADE[$game]['xpPer'], 'runCap' => ARCADE_RUN_XP_CAP];
}
