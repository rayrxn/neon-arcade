<?php
// Port 1:1 dari src/services/progression.js + src/config/progression.js + bagian config/cosmetics.js.
// Bekerja pada dokumen progres (array) yang bentuknya sama dengan emptyProgress() di frontend.
declare(strict_types=1);

const DAY_MS = 86400000;

const DAILY_REWARDS = [
    ['day' => 1, 'rewards' => [['kind' => 'AC', 'amount' => 250]]],
    ['day' => 2, 'rewards' => [['kind' => 'AC', 'amount' => 400]]],
    ['day' => 3, 'rewards' => [['kind' => 'XP', 'amount' => 150]]],
    ['day' => 4, 'rewards' => [['kind' => 'AC', 'amount' => 600]]],
    ['day' => 5, 'rewards' => [['kind' => 'item', 'id' => 'gold-frame']], 'fallback' => ['kind' => 'AC', 'amount' => 1000]],
    ['day' => 6, 'rewards' => [['kind' => 'AC', 'amount' => 800]]],
    ['day' => 7, 'rewards' => [['kind' => 'AC', 'amount' => 1500], ['kind' => 'XP', 'amount' => 300], ['kind' => 'item', 'id' => 'emote-fire']], 'special' => true],
];

const DAILY_QUESTS = [
    ['id' => 'login', 'metric' => 'login', 'target' => 1, 'reward' => ['AC' => 100, 'XP' => 20]],
    ['id' => 'play3', 'metric' => 'games', 'target' => 3, 'reward' => ['AC' => 300, 'XP' => 60]],
    ['id' => 'win1', 'metric' => 'wins', 'target' => 1, 'reward' => ['AC' => 200, 'XP' => 40]],
    ['id' => 'wager1k', 'metric' => 'wagered', 'target' => 1000, 'reward' => ['AC' => 250, 'XP' => 50]],
    ['id' => 'xp200', 'metric' => 'xp', 'target' => 200, 'reward' => ['AC' => 300]],
    ['id' => 'chat3', 'metric' => 'chat', 'target' => 3, 'reward' => ['AC' => 150, 'XP' => 20]],
];

const WEEKLY_QUESTS = [
    ['id' => 'play20', 'metric' => 'games', 'target' => 20, 'reward' => ['AC' => 2000, 'XP' => 300]],
    ['id' => 'xp2500', 'metric' => 'xp', 'target' => 2500, 'reward' => ['AC' => 2500]],
    ['id' => 'daily10', 'metric' => 'dailyQuests', 'target' => 10, 'reward' => ['AC' => 3000, 'XP' => 400]],
    ['id' => 'multi10', 'metric' => 'bestMultiplier', 'target' => 10, 'reward' => ['AC' => 1500, 'XP' => 200]],
    ['id' => 'levelUp1', 'metric' => 'levelUp', 'target' => 1, 'reward' => ['AC' => 1000, 'XP' => 100]],
    ['id' => 'profile', 'metric' => 'profile', 'target' => 1, 'reward' => ['AC' => 500, 'XP' => 50]],
];

const MAX_METRICS = ['bestMultiplier', 'profile'];

const ACHIEVEMENTS = [
    ['id' => 'first-game', 'metric' => 'games', 'target' => 1, 'xp' => 25],
    ['id' => 'first-win', 'metric' => 'wins', 'target' => 1, 'xp' => 25],
    ['id' => 'games-10', 'metric' => 'games', 'target' => 10, 'xp' => 50],
    ['id' => 'games-100', 'metric' => 'games', 'target' => 100, 'xp' => 200],
    ['id' => 'streak-7', 'metric' => 'streak', 'target' => 7, 'xp' => 150],
    ['id' => 'high-score', 'metric' => 'bestMultiplier', 'target' => 50, 'xp' => 200],
    ['id' => 'quest-master', 'metric' => 'questsDone', 'target' => 25, 'xp' => 250],
    ['id' => 'veteran', 'metric' => 'level', 'target' => 10, 'xp' => 300],
    ['id' => 'first-levelup', 'metric' => 'level', 'target' => 2, 'xp' => 25],
    ['id' => 'level-15', 'metric' => 'level', 'target' => 15, 'xp' => 300],
    ['id' => 'level-50', 'metric' => 'level', 'target' => 50, 'xp' => 1000],
    ['id' => 'quests-10', 'metric' => 'questsDone', 'target' => 10, 'xp' => 150],
    ['id' => 'streak-30', 'metric' => 'streak', 'target' => 30, 'xp' => 500],
];

const ACHIEVEMENT_ITEMS = [
    'first-win' => ['badge-first-win'],
    'first-levelup' => ['chat-star'],
    'streak-7' => ['badge-streak-7'],
    'streak-30' => ['badge-streak-30', 'mint-frame'],
    'level-15' => ['badge-level-15', 'banner-ember'],
    'level-50' => ['badge-level-50', 'title-legend'],
    'quests-10' => ['badge-quest', 'banner-ocean'],
    'quest-master' => ['title-quest-master'],
    'games-100' => ['title-grinder', 'avatar-ember'],
    'veteran' => ['title-veteran'],
    'high-score' => ['crimson-frame', 'chat-bolt'],
];

const SEASON_TIER_XP = 1000;
const SEASON_MAX_TIER = 50;
const SEASON_LENGTH_DAYS = 28;
const SEASON_TIERS = [
    ['tier' => 1, 'item' => 'emote-gem'],
    ['tier' => 3, 'item' => 'banner-aurora'],
    ['tier' => 5, 'item' => 'violet-frame'],
    ['tier' => 8, 'item' => 'avatar-aurora'],
    ['tier' => 10, 'item' => 'badge-season'],
];

const LEVEL_MILESTONES = [
    ['type' => 'L15', 'every' => 15, 'reward' => ['kind' => 'AC', 'amount' => 250000]],
    ['type' => 'L50', 'every' => 50, 'reward' => ['kind' => 'AG', 'amount' => 1]],
];

const XP_CAP = ['game' => 70, 'quest' => 500, 'daily' => 400, 'achievement' => 1000, 'admin' => INF, 'test' => INF];
const XP_PER_MINUTE_LIMIT = 4000;

// ───────────────────────────── Rumus dasar ─────────────────────────────

function xp_for_next(int $level): int
{
    return 100 + ($level - 1) * 75;
}

function level_from_xp($xp): array
{
    $level = 1;
    $rest = max(0, (int) floor((float) $xp));
    while ($rest >= xp_for_next($level)) {
        $rest -= xp_for_next($level);
        $level++;
    }
    return ['level' => $level, 'into' => $rest, 'need' => xp_for_next($level)];
}

function game_xp($bet, bool $win): int
{
    return min(60, 10 + (int) floor($bet / 100)) + ($win ? 5 : 0);
}

function milestones_between(int $from, int $to): array
{
    $out = [];
    for ($lv = $from + 1; $lv <= $to; $lv++) {
        foreach (LEVEL_MILESTONES as $m) {
            if ($lv % $m['every'] === 0) $out[] = $m + ['level' => $lv, 'key' => $m['type'] . ':' . $lv];
        }
    }
    return $out;
}

function week_start(int $ms): int
{
    $d = local_dt($ms);
    $offset = ((int) $d->format('w') + 6) % 7;
    return iso_to_ms($d->setTime(0, 0)->modify("-$offset days")->format('c'));
}

function week_key(int $ms): string
{
    return day_key(week_start($ms));
}

function month_key(int $ms): string
{
    return local_dt($ms)->format('Y-m');
}

function empty_progress(): array
{
    return [
        'xp' => 0,
        'stats' => ['games' => 0, 'wins' => 0, 'losses' => 0, 'pushes' => 0, 'wagered' => 0, 'won' => 0, 'bestMultiplier' => 0, 'biggestWin' => 0, 'perGame' => []],
        'daily' => ['streak' => 0, 'lastClaimDay' => null, 'claims' => 0],
        'quests' => [
            'daily' => ['period' => null, 'progress' => [], 'claimed' => []],
            'weekly' => ['period' => null, 'progress' => [], 'claimed' => []],
            'completed' => 0,
        ],
        'achievements' => [],
        'sessions' => [],
        'open' => [],
        'flags' => [],
        'loginDays' => [],
        'levelHistory' => [],
        'milestones' => [],
        'season' => ['id' => null, 'xp' => 0, 'tiersClaimed' => []],
        'seasonHistory' => [],
        'periodStats' => [],
        'recentXp' => [],
    ];
}

/** Lengkapi dokumen lama dengan field yang belum ada (seperti migrate() di store). */
function normalize_progress(array $p): array
{
    foreach (empty_progress() as $k => $v) if (!array_key_exists($k, $p)) $p[$k] = $v;
    return $p;
}

/** Field yang di JS berupa objek (bukan array) — supaya JSON kosong tetap "{}". */
function progress_json(array $p): array
{
    $obj = fn($v) => (is_array($v) && $v === []) ? new stdClass() : $v;
    $p['stats']['perGame'] = $obj($p['stats']['perGame'] ?? []);
    $p['quests']['daily']['progress'] = $obj($p['quests']['daily']['progress'] ?? []);
    $p['quests']['weekly']['progress'] = $obj($p['quests']['weekly']['progress'] ?? []);
    foreach (['achievements', 'open', 'milestones', 'periodStats'] as $k) $p[$k] = $obj($p[$k] ?? []);
    return $p;
}

// ───────────────────────────── Season (platform-wide) ─────────────────────────────

function current_season(int $now): array
{
    static $cache = null;
    if ($cache && $now < $cache['endAt']) return $cache;
    $row = q1("SELECT value FROM neon_kv WHERE key = 'season'");
    $s = $row ? jdec($row['value'], null) : null;
    if (!$s) {
        $start = iso_to_ms(local_dt($now)->setTime(0, 0)->format('c'));
        $s = ['id' => 1, 'startAt' => $start, 'endAt' => $start + SEASON_LENGTH_DAYS * DAY_MS];
    }
    $changed = !$row;
    while ($now >= $s['endAt']) {
        $s = ['id' => $s['id'] + 1, 'startAt' => $s['endAt'], 'endAt' => $s['endAt'] + SEASON_LENGTH_DAYS * DAY_MS];
        $changed = true;
    }
    if ($changed) {
        q("INSERT INTO neon_kv (key, value) VALUES ('season', ?::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", [jenc($s)]);
    }
    return $cache = $s;
}

function season_tier($xp): int
{
    return (int) min(SEASON_MAX_TIER, floor(((float) ($xp ?? 0)) / SEASON_TIER_XP));
}

// ───────────────────────────── Mesin progres ─────────────────────────────

function new_out(): array
{
    return ['xp' => 0, 'quests' => [], 'achievements' => [], 'levelUp' => null, 'milestones' => [], 'items' => [], 'suspicious' => [], 'rewards' => []];
}

function roll_periods(array &$p, int $now): void
{
    if (($p['quests']['daily']['period'] ?? null) !== day_key($now)) $p['quests']['daily'] = ['period' => day_key($now), 'progress' => [], 'claimed' => []];
    if (($p['quests']['weekly']['period'] ?? null) !== week_key($now)) $p['quests']['weekly'] = ['period' => week_key($now), 'progress' => [], 'claimed' => []];
}

function period_bump(array &$p, string $field, $value, int $now): void
{
    foreach (['w:' . week_key($now), 'm:' . month_key($now)] as $key) {
        if (!isset($p['periodStats'][$key])) $p['periodStats'][$key] = ['xp' => 0, 'games' => 0, 'wins' => 0];
        $p['periodStats'][$key][$field] = ($p['periodStats'][$key][$field] ?? 0) + $value;
    }
    $keys = array_keys($p['periodStats']);
    rsort($keys, SORT_STRING);
    foreach (array_slice($keys, 24) as $k) unset($p['periodStats'][$k]);
}

function bump(array &$p, string $metric, $value, array &$out): void
{
    foreach (['daily' => DAILY_QUESTS, 'weekly' => WEEKLY_QUESTS] as $scope => $defs) {
        foreach ($defs as $q) {
            if ($q['metric'] !== $metric) continue;
            $before = $p['quests'][$scope]['progress'][$q['id']] ?? 0;
            $after = in_array($metric, MAX_METRICS, true) ? max($before, $value) : $before + $value;
            $p['quests'][$scope]['progress'][$q['id']] = $after;
            if ($before < $q['target'] && $after >= $q['target']) $out['quests'][] = ['scope' => $scope, 'id' => $q['id']];
        }
    }
}

function level_of(array $p): int
{
    return level_from_xp($p['xp'])['level'];
}

function metric_value(array $p, string $metric)
{
    if ($metric === 'streak') return $p['daily']['streak'];
    if ($metric === 'questsDone') return $p['quests']['completed'];
    if ($metric === 'level') return level_of($p);
    return $p['stats'][$metric] ?? 0;
}

function apply_xp(array &$p, $amount, array &$out, string $source, int $now): void
{
    if (!($amount > 0)) return;
    $before = level_of($p);
    $cap = XP_CAP[$source] ?? 100;
    if ($amount > $cap) $out['suspicious'][] = ['type' => 'impossibleXp', 'expected' => "≤ $cap XP ($source)", 'submitted' => "$amount XP"];
    $recent = array_values(array_filter($p['recentXp'] ?? [], fn($r) => $now - $r['at'] < 60000));
    $recent[] = ['at' => $now, 'xp' => $amount];
    $p['recentXp'] = $recent;
    $perMinute = array_sum(array_column($recent, 'xp'));
    if ($perMinute > XP_PER_MINUTE_LIMIT && $source !== 'admin' && $source !== 'test') {
        $out['suspicious'][] = ['type' => 'impossibleXp', 'expected' => '≤ ' . XP_PER_MINUTE_LIMIT . ' XP/menit', 'submitted' => "$perMinute XP/menit"];
    }

    $p['xp'] += $amount;
    $out['xp'] += $amount;
    bump($p, 'xp', $amount, $out);
    period_bump($p, 'xp', $amount, $now);

    $season = current_season($now);
    if (($p['season']['id'] ?? null) !== $season['id']) $p['season'] = ['id' => $season['id'], 'xp' => 0, 'tiersClaimed' => []];
    $tierBefore = season_tier($p['season']['xp']);
    $p['season']['xp'] += $amount;
    $tierAfter = season_tier($p['season']['xp']);
    foreach (SEASON_TIERS as $t) {
        if ($t['tier'] > $tierBefore && $t['tier'] <= $tierAfter && !in_array($t['tier'], $p['season']['tiersClaimed'], true)) {
            $p['season']['tiersClaimed'][] = $t['tier'];
            $out['items'][] = ['id' => $t['item'], 'source' => 'season'];
        }
    }

    $after = level_of($p);
    if ($after > $before) {
        if ($after - $before > 5 && $source !== 'admin' && $source !== 'test') {
            $out['suspicious'][] = ['type' => 'impossibleLevel', 'expected' => '≤ 5 level per kejadian', 'submitted' => '+' . ($after - $before) . ' level'];
        }
        for ($lv = $before + 1; $lv <= $after; $lv++) {
            array_unshift($p['levelHistory'], ['level' => $lv, 'at' => $now, 'xp' => $p['xp']]);
        }
        $p['levelHistory'] = array_slice($p['levelHistory'], 0, 200);
        $out['levelUp'] = ['from' => $out['levelUp']['from'] ?? $before, 'to' => $after];
        bump($p, 'levelUp', $after - $before, $out);
        foreach (milestones_between($before, $after) as $m) {
            if (empty($p['milestones'][$m['key']])) $out['milestones'][] = $m;
        }
    }
}

function unlock_achievements(array &$p, array &$out, int $now): void
{
    for ($pass = 0; $pass < 4; $pass++) {
        $changed = false;
        foreach (ACHIEVEMENTS as $a) {
            if (!empty($p['achievements'][$a['id']]) || metric_value($p, $a['metric']) < $a['target']) continue;
            $p['achievements'][$a['id']] = $now;
            $out['achievements'][] = $a['id'];
            foreach (ACHIEVEMENT_ITEMS[$a['id']] ?? [] as $item) $out['items'][] = ['id' => $item, 'source' => 'achievement'];
            apply_xp($p, $a['xp'], $out, 'achievement', $now);
            $changed = true;
        }
        if (!$changed) break;
    }
}

/**
 * Efek setelah dokumen progres diperbarui: bayar milestone (unik via idempotency key),
 * beri item ke inventory, catat flag. Notifikasi & overlay dibuat frontend dari $out.
 */
function commit_out(string $userId, array &$p, array &$meta, array &$out, bool $isTest, int $now): void
{
    if ($isTest) return;
    foreach ($out['milestones'] as $m) {
        $tx = wallet_post($userId, $m['reward']['kind'], $m['reward']['amount'], 'reward', 'level', 'level', 'level ' . $m['level'], null, 'milestone:' . $m['key']);
        if (empty($p['milestones'][$m['key']])) {
            $p['milestones'][$m['key']] = ['type' => $m['type'], 'level' => $m['level'], 'rewardTxId' => $tx, 'reward' => $m['reward'], 'claimedAt' => $now];
        }
        q('INSERT INTO level_milestones (user_id, milestone_type, milestone_level, reward_id) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING', [$userId, $m['type'], $m['level'], $tx]);
        $out['rewards'][] = ['kind' => $m['reward']['kind'], 'amount' => $m['reward']['amount'], 'level' => $m['level']];
        log_event('MILESTONE_REWARD', $userId, ['milestone' => $m['key'], 'tx' => $tx]);
    }
    foreach ($out['items'] as $item) {
        if (grant_item($meta, $item['id'])) $out['rewards'][] = ['kind' => 'item', 'id' => $item['id']];
    }
    foreach ($out['suspicious'] as $s) raise_flag($userId, $s['type'], 'high', null, $s['expected'], $s['submitted']);
    if ($out['xp'] > 0) log_event('XP_GAINED', $userId, ['xp' => $out['xp']]);
    // Notifikasi dibuat server → muncul di semua perangkat pemain.
    foreach ($out['quests'] as $q) {
        notify($userId, 'quest', ['scope' => $q['scope'], 'quest' => $q['id']]);
        log_event('QUEST_COMPLETED', $userId, ['quest' => $q['id'], 'scope' => $q['scope']]);
    }
    foreach ($out['achievements'] as $a) {
        notify($userId, 'achievement', ['achievement' => $a]);
        log_event('ACHIEVEMENT_UNLOCKED', $userId, ['achievement' => $a]);
    }
    if ($out['levelUp']) {
        notify($userId, 'levelUp', ['level' => $out['levelUp']['to'], 'from' => $out['levelUp']['from'], 'rewards' => array_values(array_filter($out['rewards'], fn($r) => isset($r['level'])))]);
        log_event('LEVEL_UP', $userId, $out['levelUp']);
    }
}

function grant_item(array &$meta, string $itemId): bool
{
    $inv = $meta['inventory'] ?? [];
    if (in_array($itemId, $inv, true)) return false;
    $inv[] = $itemId;
    $meta['inventory'] = $inv;
    return true;
}

// ───────────────────────────── Kejadian ─────────────────────────────

/** Ronde selesai → statistik, XP, quest, achievement (port recordGame). */
function record_game(string $userId, array &$p, array &$meta, array &$session, int $now): array
{
    $out = new_out();
    $best = 0;
    $counts = empty($session['isTest']) && $session['status'] !== 'INVALID';
    $value = (float) ($session['valueAc'] ?? $session['bet']);
    $cardXp = function_exists('card_perks') ? 1 + card_perks(effective_card(q1('SELECT * FROM users WHERE id = ?', [$userId]) ?? []))['xpPct'] / 100 : 1;
    $xp = $counts ? (int) floor(game_xp($value, $session['result'] === 'win') * boost_mult($userId, 'xp') * $cardXp) : 0;
    $session['xp'] = $xp;
    roll_periods($p, $now);
    array_unshift($p['sessions'], $session);
    $p['sessions'] = array_slice($p['sessions'], 0, 100);
    if ($counts) {
        $s = &$p['stats'];
        $win = $session['result'] === 'win';
        $s['games']++;
        $s['wagered'] += $value;
        $s['won'] += ($session['currency'] ?? 'AC') === 'AG' ? $session['payout'] * ($value / max(1, $session['bet'])) : $session['payout'];
        if ($win) $s['wins']++;
        elseif ($session['result'] === 'push') $s['pushes']++;
        else $s['losses']++;
        $isAg = ($session['currency'] ?? 'AC') === 'AG';
        if ($isAg) $s['biggestWinAG'] = max((float) ($s['biggestWinAG'] ?? 0), $session['payout']);
        else $s['biggestWin'] = max($s['biggestWin'], $session['payout']);
        $s['bestMultiplier'] = max($s['bestMultiplier'], $win ? $session['multiplier'] : 0);
        $gk = $session['game'];
        if (!isset($s['perGame'][$gk])) $s['perGame'][$gk] = ['played' => 0, 'wins' => 0, 'best' => 0, 'bestPayout' => 0, 'lastAt' => 0];
        $g = &$s['perGame'][$gk];
        $g['played']++;
        $g['lastAt'] = $session['at'];
        if ($win) $g['wins']++;
        $g['best'] = max($g['best'], $win ? $session['multiplier'] : 0);
        if ($isAg) $g['bestPayoutAG'] = max((float) ($g['bestPayoutAG'] ?? 0), $session['payout']);
        else $g['bestPayout'] = max($g['bestPayout'], $session['payout']);
        $best = $g['best'];
        unset($g, $s);
        period_bump($p, 'games', 1, $now);
        if ($win) period_bump($p, 'wins', 1, $now);
        bump($p, 'games', 1, $out);
        if ($win) bump($p, 'wins', 1, $out);
        bump($p, 'wagered', $value, $out);
        if ($win) bump($p, 'bestMultiplier', $session['multiplier'], $out);
        apply_xp($p, $xp, $out, 'game', $now);
        unlock_achievements($p, $out, $now);
    }
    commit_out($userId, $p, $meta, $out, !$counts, $now);
    return $out + ['best' => $best, 'level' => level_from_xp($p['xp'])];
}

/** Metrik non-game yang boleh dilaporkan frontend (chat & profil). */
function track_metric(string $userId, array &$p, array &$meta, string $metric, $value, int $now): array
{
    $out = new_out();
    roll_periods($p, $now);
    bump($p, $metric, $value, $out);
    commit_out($userId, $p, $meta, $out, false, $now);
    return $out;
}

function mark_login(string $userId, array &$p, array &$meta, int $now): array
{
    $out = new_out();
    roll_periods($p, $now);
    $today = day_key($now);
    if (!in_array($today, $p['loginDays'], true)) $p['loginDays'] = array_slice(array_merge([$today], $p['loginDays']), 0, 60);
    if (!(($p['quests']['daily']['progress']['login'] ?? 0) >= 1)) bump($p, 'login', 1, $out);
    commit_out($userId, $p, $meta, $out, false, $now);
    return $out;
}

function daily_state(array $p, int $now): array
{
    $today = day_key($now);
    $yesterday = day_key($now - DAY_MS);
    $claimedToday = ($p['daily']['lastClaimDay'] ?? null) === $today;
    $continues = ($p['daily']['lastClaimDay'] ?? null) === $yesterday || $claimedToday;
    $streak = $continues ? $p['daily']['streak'] : 0;
    return ['claimedToday' => $claimedToday, 'streak' => $streak, 'nextDay' => ($streak % 7) + 1];
}

function claim_daily_reward(string $userId, array &$p, array &$meta, int $now): array
{
    $state = daily_state($p, $now);
    if ($state['claimedToday']) fail('rewards.errors.claimedToday');
    $today = day_key($now);
    $def = DAILY_REWARDS[$state['nextDay'] - 1];
    $out = new_out();
    $granted = [];
    // Progression role bonus (+x%) and a Double Daily boost multiply AC/AG rewards.
    $u = q1('SELECT * FROM users WHERE id = ?', [$userId]);
    $bonus = (1 + role_daily_bonus(player_role_of($u, level_from_xp($p['xp'])['level'])) / 100) * boost_mult($userId, 'daily');
    if ($bonus > 1) {
        consume_daily_boost($userId);
        $def['rewards'] = array_map(fn($r) => in_array($r['kind'], ['AC', 'AG'], true) ? ['kind' => $r['kind'], 'amount' => $r['kind'] === 'AG' ? max($r['amount'], (int) floor($r['amount'] * $bonus)) : (int) round($r['amount'] * $bonus)] : $r, $def['rewards']);
    }
    foreach ($def['rewards'] as $r) {
        if ($r['kind'] === 'item') {
            if (in_array($r['id'], $meta['inventory'] ?? [], true) && !empty($def['fallback'])) {
                wallet_post($userId, $def['fallback']['kind'], $def['fallback']['amount'], 'reward', 'daily', 'daily', 'day-' . $def['day'], null, "daily:$today:fallback");
                $granted[] = $def['fallback'];
            } elseif (grant_item($meta, $r['id'])) {
                $granted[] = $r;
            }
        } elseif ($r['kind'] !== 'XP') {
            wallet_post($userId, $r['kind'], $r['amount'], 'reward', 'daily', 'daily', 'day-' . $def['day'], null, "daily:$today:{$r['kind']}");
            $granted[] = $r;
        } else {
            $granted[] = $r;
        }
    }
    roll_periods($p, $now);
    $p['daily'] = ['streak' => $state['streak'] + 1, 'lastClaimDay' => $today, 'lastClaimAt' => $now, 'claims' => ($p['daily']['claims'] ?? 0) + 1];
    $xp = array_sum(array_map(fn($r) => $r['kind'] === 'XP' ? $r['amount'] : 0, $def['rewards']));
    apply_xp($p, $xp, $out, 'daily', $now);
    unlock_achievements($p, $out, $now);
    q('INSERT INTO daily_claims (user_id, claim_day, streak_day, streak) VALUES (?, ?, ?, ?)', [$userId, local_dt($now)->format('Y-m-d'), $def['day'], $state['streak'] + 1]);
    log_event('DAILY_CLAIMED', $userId, ['day' => $def['day'], 'streak' => $state['streak'] + 1]);
    notify($userId, 'daily', ['day' => $def['day'], 'rewards' => $granted]);
    add_loyalty_xp($userId, 20, 'daily', $today);
    commit_out($userId, $p, $meta, $out, false, $now);
    return ['day' => $def['day'], 'rewards' => $granted, 'bonus' => round($bonus, 3)] + $out;
}

function claim_quest(string $userId, array &$p, array &$meta, string $scope, string $questId, int $now): array
{
    $defs = $scope === 'daily' ? DAILY_QUESTS : ($scope === 'weekly' ? WEEKLY_QUESTS : []);
    $def = null;
    foreach ($defs as $q) if ($q['id'] === $questId) $def = $q;
    if (!$def) fail('errors.notFound');
    roll_periods($p, $now);
    $bucket = $p['quests'][$scope];
    if (in_array($questId, $bucket['claimed'], true)) fail('rewards.errors.claimed');
    if (($bucket['progress'][$questId] ?? 0) < $def['target']) fail('rewards.errors.notDone');

    $out = new_out();
    $p['quests'][$scope]['claimed'][] = $questId;
    $p['quests']['completed']++;
    if ($scope === 'daily') bump($p, 'dailyQuests', 1, $out);
    apply_xp($p, $def['reward']['XP'] ?? 0, $out, 'quest', $now);
    unlock_achievements($p, $out, $now);
    if (($def['reward']['AC'] ?? 0) > 0) {
        wallet_post($userId, 'AC', $def['reward']['AC'], 'reward', 'quest', 'quest', "$scope:$questId", null, "quest:$scope:{$bucket['period']}:$questId");
    }
    log_event('QUEST_CLAIMED', $userId, ['scope' => $scope, 'quest' => $questId]);
    add_loyalty_xp($userId, $scope === 'weekly' ? 60 : 15, 'quest', "$scope:$questId");
    commit_out($userId, $p, $meta, $out, false, $now);
    return ['reward' => $def['reward']] + $out;
}
