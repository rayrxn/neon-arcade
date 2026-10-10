<?php
// v2.0 core: game controls, session termination, maintenance schedule, security review, tickets, announcements, feature flags, captcha, QA.
declare(strict_types=1);

require __DIR__ . '/../index.php';

$pass = 0;
$failures = [];
$cookies = [];

function call(string $method, string $path, array $body = [], ?string $as = null): array
{
    global $cookies;
    $GLOBALS['NEON_BODY'] = $body;
    unset($GLOBALS['NEON_BODY_PARSED'], $GLOBALS['NEON_USER']);
    foreach (['NEON_MEMBERSHIPS_DIRTY', 'NEON_LEVELS_DIRTY', 'NEON_CARDS_DIRTY', 'NEON_SHOP_DIRTY', 'NEON_EMOTES_DIRTY', 'NEON_ROLES_DIRTY', 'NEON_TERMS_DIRTY'] as $k) $GLOBALS[$k] = true;
    $GLOBALS['NEON_KV_DIRTY'] = ['economy' => true, 'moderation' => true, 'memberships' => true];
    $GLOBALS['NEON_COOKIE'] = $as !== null ? ($cookies[$as] ?? null) : null;
    try {
        $data = route($method, $path);
        if ($as !== null && isset($GLOBALS['NEON_COOKIE'])) $cookies[$as] = $GLOBALS['NEON_COOKIE'];
        return ['ok' => true, 'data' => json_decode(jenc($data), true)];
    } catch (ApiError $e) {
        return ['ok' => false, 'code' => $e->getMessage(), 'vars' => $e->vars];
    }
}
function check(string $name, bool $cond, $info = null): void
{
    global $pass, $failures;
    if ($cond) { $pass++; echo "  ✓ $name\n"; }
    else { $failures[] = $name; echo "  ✗ $name " . ($info !== null ? mb_substr(json_encode($info, JSON_UNESCAPED_UNICODE), 0, 600) : '') . "\n"; }
}
function expect_error(string $name, array $res, string $code): void
{
    check($name, !$res['ok'] && $res['code'] === $code, $res['ok'] ? 'ok' : [$res['code'], $res['vars'] ?? null]);
}
function me(string $as): array { return call('GET', 'me', [], $as)['data']; }
function bal(string $as, string $c = 'AC'): float { return (float) me($as)['wallet'][$c === 'AC' ? 'balance' : 'gems']; }
function uid(string $as): string { return me($as)['user']['id']; }
function extras(string $as): array { return me($as)['extras']; }
function admin(string $as, string $name, array $args = []): array { return call('POST', 'admin/action', ['name' => $name, 'args' => $args], $as); }
function rid(): string { return 'r' . bin2hex(random_bytes(8)); }
function setbal(string $id, float $ac, float $ag): void
{
    $w = q1('SELECT ac_balance, ag_balance FROM wallets WHERE user_id = ?', [$id]);
    if ($ac != (float) $w['ac_balance']) qv("SELECT wallet_post(?::uuid, 'AC', ?::numeric, 'adjust', 'system', 'test', 'test', NULL, NULL, NULL, ?)", [$id, (string) ($ac - (float) $w['ac_balance']), rid()]);
    if ($ag != (float) $w['ag_balance']) qv("SELECT wallet_post(?::uuid, 'AG', ?::numeric, 'adjust', 'system', 'test', 'test', NULL, NULL, NULL, ?)", [$id, (string) ($ag - (float) $w['ag_balance']), rid()]);
}
function chat(string $as, string $text): array
{
    q("UPDATE chat_messages SET created_at = created_at - interval '2 minutes' WHERE user_id = ?", [uid($as)]);
    return call('POST', 'chat/send', ['text' => $text], $as);
}
function cool(): void { usleep(1100000); }
function sync(string $as): array { return call('GET', 'sync', [], $as)['data']; }



echo "Neon Arcade — v2.0 core tests\n";
$tag = substr((string) time(), -5);
foreach (['own' => 'own8', 'adm' => 'adm8', 'mod' => 'mod8', 'a' => 'a8', 'v' => 'v8', 't' => 't8'] as $k => $name) {
    $r = call('POST', 'auth/register', ['username' => "{$name}_$tag", 'email' => "$name$tag@t.id", 'password' => 'rahasia123'], $k);
    if (!$r['ok']) { echo "register failed $k\n"; exit(1); }
}
$OWN = uid('own'); $ADM = uid('adm'); $MOD = uid('mod'); $A = uid('a'); $V = uid('v'); $T = uid('t');
q("UPDATE users SET role = 'super_admin' WHERE id = ?", [$OWN]);
q("UPDATE users SET role = 'admin' WHERE id = ?", [$ADM]);
q("UPDATE users SET role = 'moderator' WHERE id = ?", [$MOD]);
q("UPDATE users SET role = 'developer' WHERE id = ?", [$T]);
q("INSERT INTO memberships (user_id, tier, ends_at) VALUES (?, 'vip', now() + interval '30 days')", [$V]);
$GLOBALS['NEON_NO_COOLDOWN'] = true;

echo "Game controls\n";
setbal($A, 1000000, 100);
$r = admin('own', 'setGameControls', ['slug' => 'mines', 'reason' => 'test', 'patch' => ['bettingEnabled' => false]]);
check('owner can pause betting for a game', $r['ok'], $r);
expect_error('paused betting blocks new rounds', call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'a'), 'play.errors.bettingOff');
admin('own', 'setGameControls', ['slug' => 'mines', 'reason' => 'test', 'patch' => ['bettingEnabled' => true, 'newSessions' => false]]);
expect_error('new rounds off blocks new rounds', call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'a'), 'play.errors.newSessionsOff');
admin('own', 'setGameControls', ['slug' => 'mines', 'reason' => 'test', 'patch' => ['newSessions' => true, 'maxBet' => 500]]);
expect_error('per-game max bet is enforced', call('POST', 'game/mines-start', ['bet' => 600, 'mines' => 3], 'a'), 'play.errors.maxBet');
admin('own', 'setGameControls', ['slug' => 'mines', 'reason' => 'test', 'patch' => ['maxBet' => 1500000000, 'maintenanceFrom' => (time() - 60) * 1000, 'maintenanceUntil' => (time() + 3600) * 1000, 'maintenanceMessage' => 'Fixing tiles']]);
expect_error('scheduled per-game maintenance blocks players', call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'a'), 'play.errors.gameMaintenance');
$cfg = sync('a')['admin']['gameConfig']['mines'];
check('game config shows the scheduled maintenance + message', $cfg['status'] === 'maintenance' && $cfg['maintenanceMessage'] === 'Fixing tiles', $cfg);
admin('own', 'setGameControls', ['slug' => 'mines', 'reason' => 'test', 'patch' => ['maintenanceFrom' => null, 'maintenanceUntil' => null]]);
expect_error('moderator cannot change game controls', admin('mod', 'setGameControls', ['slug' => 'mines', 'reason' => 'x', 'patch' => ['status' => 'disabled']]), 'admin.errors.forbidden');

echo "Session termination (refund)\n";
$before = bal('a');
$r = call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'a');
check('round opens', $r['ok'], $r);
$sid = (string) qv("SELECT id FROM game_sessions WHERE user_id = ? AND status = 'OPEN'", [$A]);
check('bet is taken', abs(bal('a') - ($before - 100)) < 0.01);
check('open round shows in admin view', in_array($sid, array_column(admin_v3_view(q1('SELECT * FROM users WHERE id = ?', [$OWN]))['openSessions'], 'id'), true));
expect_error('moderator cannot end rounds', admin('mod', 'endSession', ['sessionId' => $sid, 'reason' => 'x']), 'admin.errors.forbidden');
$r = admin('adm', 'endSession', ['sessionId' => $sid, 'reason' => 'stuck']);
check('admin ends the round', $r['ok'], $r);
check('stake refunded exactly once', abs(bal('a') - $before) < 0.01);
check('round is CANCELLED', qv('SELECT status FROM game_sessions WHERE id = ?', [$sid]) === 'CANCELLED');
expect_error('ending again is refused', admin('adm', 'endSession', ['sessionId' => $sid, 'reason' => 'again']), 'admin.errors.noSession');
check('refund idempotent (one refund tx)', (int) qv("SELECT count(*) FROM wallet_transactions WHERE idempotency_key = ?", ['refund:' . $sid]) === 1);
check('audit log written', (bool) qv("SELECT 1 FROM admin_audit_log WHERE action = 'session.end' AND entity_id = ?", [$sid]));
call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'a');
$r = admin('own', 'terminateUserSessions', ['userId' => $A, 'reason' => 'emergency']);
check('terminate signs the player out and cancels their rounds', $r['ok'] && $r['data']['result']['rounds'] === 1 && $r['data']['result']['logins'] >= 1, $r);
check('player is signed out', call('GET', 'me', [], 'a')['data']['user'] === null);
call('POST', 'auth/login', ['email' => "a8$tag@t.id", 'password' => 'rahasia123'], 'a');
check('player can log back in', call('GET', 'me', [], 'a')['data']['user'] !== null);

echo "Emergency shutdown\n";
expect_error('needs the confirmation word', admin('own', 'emergencyShutdown', ['reason' => 'x', 'confirm' => 'yes']), 'admin.errors.confirm');
call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'a');
$r = admin('own', 'emergencyShutdown', ['reason' => 'incident', 'confirm' => 'SHUTDOWN', 'message' => 'Back soon']);
check('shutdown ends open rounds', $r['ok'] && $r['data']['result']['ended'] >= 1, $r);
expect_error('players are blocked by maintenance', call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'a'), 'errors.maintenance');
admin('own', 'emergencyShutdown', ['reason' => 'resolved', 'confirm' => 'SHUTDOWN', 'enabled' => false]);
check('shutdown can be lifted', call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'a')['ok']);
admin('own', 'endGameSessions', ['reason' => 'cleanup']);

echo "Maintenance schedule + bypass\n";
admin('own', 'setMaintenance', ['enabled' => true, 'message' => 'Later', 'startsAt' => (time() + 3600) * 1000, 'reason' => 'plan']);
check('future maintenance does not block yet', call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'a')['ok']);
admin('own', 'endGameSessions', ['reason' => 'cleanup']);
check('sync shows startsAt for the countdown', sync('a')['admin']['system']['maintenance']['startsAt'] > now_ms());
admin('own', 'setMaintenance', ['enabled' => true, 'message' => 'Now', 'bypassTesters' => false, 'reason' => 'go']);
expect_error('testers blocked when bypass is off', call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 't'), 'errors.maintenance');
check('admins still bypass', call('POST', 'game/mines-start', ['bet' => 100, 'mines' => 3], 'adm')['ok']);
admin('own', 'endGameSessions', ['reason' => 'cleanup']);
admin('own', 'setMaintenance', ['enabled' => false, 'reason' => 'done', 'bypassTesters' => true]);

echo "Security review\n";
tx(fn() => qv("SELECT raise_flag(?::uuid, 'impossibleXp', 'high', NULL, 'a', 'b')", [$A]));
$fid = (string) qv("SELECT id FROM cheat_flags WHERE user_id = ? AND type = 'impossibleXp'", [$A]);
$r = admin('mod', 'reviewFlag', ['flagId' => $fid, 'decision' => 'false_positive', 'reason' => 'lag']);
check('moderator can mark a false positive', $r['ok'] && qv('SELECT status FROM cheat_flags WHERE id = ?', [$fid]) === 'false_positive', $r);
expect_error('moderator cannot confirm (needs anticheat)', admin('mod', 'reviewFlag', ['flagId' => $fid, 'decision' => 'confirm', 'reason' => 'x']), 'admin.errors.forbidden');
$r = admin('mod', 'reviewFlag', ['flagId' => $fid, 'decision' => 'escalate', 'reason' => 'looks bad', 'note' => 'see session']);
check('escalate raises severity to critical and notifies admins', $r['ok'] && qv('SELECT severity FROM cheat_flags WHERE id = ?', [$fid]) === 'critical' && (bool) qv("SELECT 1 FROM notifications WHERE user_id = ? AND data->>'event' = 'flagEscalated'", [$ADM]));
expect_error('unknown decision rejected', admin('own', 'reviewFlag', ['flagId' => $fid, 'decision' => 'nuke', 'reason' => 'x']), 'admin.errors.invalid');

echo "Tickets\n";
$tk = call('POST', 'ticket/create', ['category' => 'bug', 'subject' => 'Broken tile', 'message' => 'The mines tile did not open.'], 'a');
$tid = $tk['data']['result']['id'] ?? '';
q("UPDATE users SET role = 'support' WHERE id = ?", [$MOD]);
$r = admin('mod', 'ticketClaim', ['ticketId' => $tid]);
check('helper claims a ticket → CLAIMED', $r['ok'] && qv('SELECT status FROM support_tickets WHERE id = ?', [$tid]) === 'CLAIMED', $r);
expect_error('someone else cannot claim without taking over', admin('adm', 'ticketClaim', ['ticketId' => $tid]), 'support.errors.claimed');
check('priority can be set', admin('mod', 'ticketPriority', ['ticketId' => $tid, 'priority' => 'urgent'])['ok'] && qv('SELECT priority FROM support_tickets WHERE id = ?', [$tid]) === 'urgent');
check('escalate marks it and adds an internal note', admin('mod', 'ticketEscalate', ['ticketId' => $tid, 'reason' => 'refund needed'])['ok'] && qv('SELECT escalated FROM support_tickets WHERE id = ?', [$tid]));
$view = array_values(array_filter(sync('mod')['admin']['tickets'], fn($x) => $x['id'] === $tid))[0] ?? [];
check('ticket view has priority + escalated', ($view['priority'] ?? '') === 'urgent' && !empty($view['escalated']), $view);
q("UPDATE users SET role = 'moderator' WHERE id = ?", [$MOD]);
check('player closes own ticket', call('POST', 'ticket/close', ['ticketId' => $tid], 'a')['ok'] && qv('SELECT status FROM support_tickets WHERE id = ?', [$tid]) === 'CLOSED');
expect_error('another player cannot close it', call('POST', 'ticket/close', ['ticketId' => $tid], 'v'), 'admin.errors.forbidden');

echo "Announcements\n";
$r = admin('own', 'saveAnnouncement', ['reason' => 'news', 'data' => ['title' => 'VIP night', 'message' => 'Double XP for VIP', 'active' => true, 'target' => 'vip', 'priority' => 'high', 'sound' => false]]);
check('targeted announcement saved', $r['ok'] && $r['data']['result']['target'] === 'vip' && $r['data']['result']['priority'] === 'high' && $r['data']['result']['deliveredAt'] !== null, $r);
$aid = $r['data']['result']['id'];
check('VIP member got the notification', (bool) qv("SELECT 1 FROM notifications WHERE user_id = ? AND data->>'announcementId' = ?", [$V, $aid]));
check('non-VIP did not', !qv("SELECT 1 FROM notifications WHERE user_id = ? AND data->>'announcementId' = ?", [$A, $aid]));
check('non-VIP does not see it in the banner list', !in_array($aid, array_column(sync('a')['admin']['announcements'], 'id'), true));
check('VIP sees it', in_array($aid, array_column(sync('v')['admin']['announcements'], 'id'), true));
$r = admin('own', 'saveAnnouncement', ['reason' => 'later', 'data' => ['title' => 'Testers', 'message' => 'New build tomorrow', 'active' => true, 'target' => 'tester', 'startAt' => (time() + 3600) * 1000]]);
check('scheduled announcement is not delivered yet', $r['ok'] && $r['data']['result']['deliveredAt'] === null, $r);
q("UPDATE announcements SET start_at = now() - interval '1 minute' WHERE id = ?", [$r['data']['result']['id']]);
sync('a');
check('delivered on the next sync, testers only', (bool) qv("SELECT 1 FROM notifications WHERE user_id = ? AND data->>'announcementId' = ?", [$T, $r['data']['result']['id']]) && !qv("SELECT 1 FROM notifications WHERE user_id = ? AND data->>'announcementId' = ?", [$V, $r['data']['result']['id']]));
check('delivered only once', (int) qv("SELECT count(*) FROM notifications WHERE user_id = ? AND data->>'announcementId' = ?", [$T, $r['data']['result']['id']]) === 1 && (sync('t') || true) && (int) qv("SELECT count(*) FROM notifications WHERE user_id = ? AND data->>'announcementId' = ?", [$T, $r['data']['result']['id']]) === 1);

echo "Feature flags\n";
expect_error('admin cannot change feature flags (Owner only)', admin('adm', 'setFeature', ['key' => 'transfers', 'state' => 'off', 'reason' => 'x']), 'admin.errors.forbidden');
check('owner sets transfers to VIP only', admin('own', 'setFeature', ['key' => 'transfers', 'state' => 'vip', 'reason' => 'beta'])['ok']);
unset($GLOBALS['NEON_FEATURES']);
check('player sees it off, VIP sees it on', sync('a')['admin']['features']['transfers']['on'] === false && (function () { unset($GLOBALS['NEON_FEATURES']); return sync('v')['admin']['features']['transfers']['on'] === true; })());
unset($GLOBALS['NEON_FEATURES']);
$ex = null;
try { require_feature(q1('SELECT * FROM users WHERE id = ?', [$A]), 'transfers'); } catch (ApiError $e) { $ex = $e->getMessage(); }
check('require_feature blocks the player', $ex === 'errors.featureOff');
admin('own', 'setFeature', ['key' => 'transfers', 'state' => 'public', 'reason' => 'live']);
expect_error('unknown feature rejected', admin('own', 'setFeature', ['key' => 'nope', 'state' => 'off', 'reason' => 'x']), 'admin.errors.invalid');
foreach (['shop' => ['shop/buy', ['itemId' => 'badge-clef', 'requestId' => 'x']], 'chat' => ['chat/send', ['text' => 'hi']], 'crash' => ['game/crash-start', ['bet' => 10]], 'exchange' => ['convert', ['amount' => 1]], 'cases' => ['game/case-open', ['caseId' => 'x']]] as $fk => [$path, $body]) {
    admin('own', 'setFeature', ['key' => $fk, 'state' => 'off', 'reason' => 'test']);
    unset($GLOBALS['NEON_FEATURES']);
    expect_error("$fk off → $path refused", call('POST', $path, $body, 'a'), 'errors.featureOff');
    admin('own', 'setFeature', ['key' => $fk, 'state' => 'public', 'reason' => 'test']);
    unset($GLOBALS['NEON_FEATURES']);
}

echo "Captcha (built-in proof of work)\n";
$GLOBALS['NEON_CAPTCHA_MODE'] = 'pow';
$c = call('GET', 'captcha')['data'];
check('challenge issued', $c['mode'] === 'pow' && $c['bits'] >= 8 && str_contains($c['challenge'], '.'), $c);
expect_error('register without captcha refused', call('POST', 'auth/register', ['username' => "bot_$tag", 'email' => "bot$tag@t.id", 'password' => 'rahasia123']), 'auth.errors.captcha');
$sol = null;
for ($i = 0; $i < 5000000; $i++) { if (leading_zero_bits(hash('sha256', $c['challenge'] . ':' . base_convert((string) $i, 10, 36), true)) >= $c['bits']) { $sol = base_convert((string) $i, 10, 36); break; } }
expect_error('wrong solution refused', call('POST', 'auth/register', ['username' => "bot_$tag", 'email' => "bot$tag@t.id", 'password' => 'rahasia123', 'captcha' => ['challenge' => $c['challenge'], 'solution' => 'zzzzzzz1']]), 'auth.errors.captcha');
$r = call('POST', 'auth/register', ['username' => "human_$tag", 'email' => "human$tag@t.id", 'password' => 'rahasia123', 'captcha' => ['challenge' => $c['challenge'], 'solution' => $sol]], 'h');
check('correct solution accepted', $r['ok'], $r);
expect_error('a challenge works only once', call('POST', 'auth/register', ['username' => "human2_$tag", 'email' => "human2$tag@t.id", 'password' => 'rahasia123', 'captcha' => ['challenge' => $c['challenge'], 'solution' => $sol]]), 'auth.errors.captchaExpired');
$forged = explode('.', $c['challenge'])[0] . '.' . str_repeat('0', 64);
expect_error('forged signature refused', call('POST', 'auth/login', ['email' => "a8$tag@t.id", 'password' => 'rahasia123', 'captcha' => ['challenge' => $forged, 'solution' => $sol]]), 'auth.errors.captcha');
$GLOBALS['NEON_CAPTCHA_MODE'] = 'off';

echo "Economy analytics + errors + QA\n";
$r = admin('own', 'economyAnalytics');
check('economy analytics has circulation, flows, distribution', $r['ok'] && isset($r['data']['result']['circulation']['AC'], $r['data']['result']['flows7d'], $r['data']['result']['distributionAG']), $r);
q("INSERT INTO error_log (context, code, message) VALUES ('api:test', 'X', 'boom')");
$r = admin('adm', 'errorLog', ['context' => 'api:']);
check('error log readable by admin', $r['ok'] && in_array('boom', array_column($r['data']['result'], 'message'), true));
expect_error('players cannot read errors', admin('a', 'errorLog'), 'admin.errors.forbidden');
$r = admin('own', 'qaRun');
check('QA run returns checks with no failures', $r['ok'] && count($r['data']['result']['checks']) > 10 && $r['data']['result']['summary']['error'] === 0, $r['ok'] ? array_values(array_filter($r['data']['result']['checks'], fn($c) => $c['status'] === 'error')) : $r);
expect_error('players cannot run QA', admin('a', 'qaRun'), 'admin.errors.forbidden');

echo "Vivace + loyalty curve\n";
$GLOBALS['NEON_CARDS_DIRTY'] = true;
$vv = array_values(array_filter(catalog_view()['cards'], fn($c) => $c['slug'] === 'vivace'))[0] ?? null;
check('Vivace exists above Monarch (rank 7, 4M XP)', $vv && $vv['rank'] === 7 && $vv['xpRequired'] === 4000000, $vv);
check('Vivace max bet 125M AC / 5,000 AG (2.5× Monarch)', $vv['maxBetAC'] == 125000000 && $vv['maxBetAG'] == 5000);
check('Vivace perks beat Monarch', $vv['perks']['lxpPct'] == 35 && $vv['perks']['shopDiscount'] == 22 && $vv['perks']['onceDays'] == 60);
check('thresholds: 3,999,999 → Monarch, 4,000,000 → Vivace', card_for_xp(3999999) === 'monarch' && card_for_xp(4000000) === 'vivace');
check('daily game Loyalty XP cap grows with the card', card_perks('none')['lxpCap'] == 4000 && card_perks('black')['lxpCap'] == 18000 && card_perks('vivace')['lxpCap'] == 30000);
q('UPDATE users SET loyalty_xp = 60000000 WHERE id = ?', [$V]);
setbal($V, 0, 100);
check('Vivace items need the Vivace card (VIP alone is not enough)', call('POST', 'shop/buy', ['itemId' => 'badge-clef', 'requestId' => rid()], 'v')['ok'] && call('POST', 'shop/buy', ['itemId' => 'badge-clef', 'requestId' => rid()], 'a')['code'] === 'shop.errors.requires');

echo "Identity: prefix/suffix with codes\n";
q("INSERT INTO memberships (user_id, tier, ends_at) VALUES (?, 'vvip', now() + interval '30 days') ON CONFLICT DO NOTHING", [$A]);
q("UPDATE memberships SET tier = 'vvip' WHERE user_id = ? AND active", [$A]);
$GLOBALS['NEON_MEMBERSHIPS_DIRTY'] = true;
$r = call('POST', 'profile/affix', ['prefix' => '&6&lKING&r', 'suffix' => '&kxx&r'], 'a');
check('VVIP saves codes (visible length counted without codes)', $r['ok'] && qv('SELECT name_prefix FROM users WHERE id = ?', [$A]) === '&6&lKING&r', $r);
expect_error('more than 10 visible characters refused', call('POST', 'profile/affix', ['prefix' => '&aABCDEFGHIJK'], 'a'), 'perks.errors.affix');
expect_error('players cannot pose as ADMIN', call('POST', 'profile/affix', ['prefix' => '&cADMIN'], 'a'), 'perks.errors.affixReserved');
expect_error('or as staff with spacing tricks', call('POST', 'profile/affix', ['suffix' => 'M.O.D'], 'a'), 'perks.errors.affixReserved');
expect_error('no HTML', call('POST', 'profile/affix', ['prefix' => '<b>x'], 'a'), 'perks.errors.affix');
check('a real admin may use ADMIN', call('POST', 'profile/affix', ['prefix' => '&cADMIN'], 'adm')['ok']);
expect_error('VIP (not VVIP) players cannot set one', call('POST', 'profile/affix', ['prefix' => 'x'], 'v'), 'perks.errors.vvip');

echo "Crash curve\n";
check('default crash max is ×10,000', crash_cfg()['maxMult'] == 10000);
check('extreme floats are capped at the maximum', crash_point_cfg(0.999999999) == 10000);
check('low multipliers follow the fair curve', crash_point_cfg(0.5) == crash_point(0.5));
$o = crash_odds(1000);
check('×1000 is rarer than fair (tail < 1)', $o < 0.99 / 1000 && $o > 0, $o);
$r = admin('own', 'setCrashConfig', ['preset' => 'calm', 'reason' => 'test']);
$GLOBALS['NEON_KV_DIRTY']['crash'] = true;
check('owner switches to Calm preset (max ×1000)', $r['ok'] && crash_cfg()['maxMult'] == 1000 && crash_point_cfg(0.9999999) == 1000, $r);
expect_error('invalid custom curve refused', admin('own', 'setCrashConfig', ['preset' => 'custom', 'maxMult' => 50000, 'edge' => 0.01, 'tail' => 1, 'reason' => 'x']), 'admin.errors.invalid');
check('custom curve saved', admin('own', 'setCrashConfig', ['preset' => 'custom', 'maxMult' => 5000, 'edge' => 0.02, 'tail' => 0.9, 'reason' => 'x'])['ok'] && (($GLOBALS['NEON_KV_DIRTY']['crash'] = true) && crash_cfg()['maxMult'] == 5000));
expect_error('edge above 10% refused', admin('own', 'setCrashConfig', ['preset' => 'custom', 'maxMult' => 100, 'edge' => 0.5, 'tail' => 1, 'reason' => 'x']), 'admin.errors.invalid');
expect_error('unknown preset refused', admin('own', 'setCrashConfig', ['preset' => 'nope', 'reason' => 'x']), 'admin.errors.invalid');
check('crash config changes are audited', (int) qv("SELECT count(*) FROM admin_audit_log WHERE action = 'crash.config'") >= 2);
expect_error('moderators cannot change it', admin('mod', 'setCrashConfig', ['preset' => 'wild', 'reason' => 'x']), 'admin.errors.forbidden');
admin('own', 'setCrashConfig', ['preset' => 'standard', 'reason' => 'reset']);

echo "Activity history\n";
$_GET['kind'] = 'all';
$r = call('GET', 'activity', [], 'v');
check('activity lists wallet + Loyalty XP rows, newest first', $r['ok'] && count($r['data']) > 0 && $r['data'][0]['at'] >= end($r['data'])['at'], $r);
$_GET['kind'] = 'lxp';
$r = call('GET', 'activity', [], 'v');
check('kind filter: only Loyalty XP', $r['ok'] && !array_filter($r['data'], fn($x) => $x['kind'] !== 'lxp'), $r);
$_GET['kind'] = 'ag';
$r = call('GET', 'activity', [], 'v');
check('kind filter: only AG wallet rows', $r['ok'] && !array_filter($r['data'], fn($x) => ($x['currency'] ?? '') !== 'AG'), $r);
expect_error('needs a session', call('GET', 'activity'), 'errors.sessionExpired');
unset($_GET['kind']);

echo "Owner console\n";
$_SERVER['REMOTE_ADDR'] = '10.9.8.7';
$con = fn(string $path, array $body = []) => call('POST', $path, $body);
check('console is enabled (key configured)', call('GET', 'console/state')['data']['enabled'] === true);
expect_error('commands need an unlocked console', $con('console/exec', ['command' => 'status']), 'console.errors.expired');
expect_error('wrong key refused', $con('console/unlock', ['key' => 'nope-nope-nope']), 'console.errors.badKey');
check('failed unlock is audited (persists)', (int) qv("SELECT count(*) FROM console_audit WHERE command = 'unlock' AND NOT ok") >= 1);
check('correct key unlocks', $con('console/unlock', ['key' => 'test-console-key-123'])['ok']);
$x = $con('console/exec', ['command' => 'status'])['data'];
check('status runs', $x['ok'] && str_contains($x['output'], 'database'), $x);
$x = $con('console/exec', ['command' => 'rm -rf /'])['data'];
check('no shell: unknown command', !$x['ok'] && str_contains($x['output'], 'unknown command'));
$x = $con('console/exec', ['command' => "ban own8_$tag 2 console test"])['data'];
check('destructive command asks for confirmation first', !empty($x['confirm']) && qv('SELECT status FROM users WHERE id = ?', [$OWN]) === 'active', $x);
$x = $con('console/exec', ['command' => "ban own8_$tag 2 console test", 'confirm' => "ban own8_$tag 2 console test"])['data'];
check('console can ban even an Owner (authority above roles)', $x['ok'] && qv('SELECT status FROM users WHERE id = ?', [$OWN]) === 'banned', $x);
check('console ban is in the admin audit log', (bool) qv("SELECT 1 FROM admin_audit_log WHERE action = 'user.ban' AND target_user = ? AND admin_id IS NULL", [$OWN]));
check('unban', $con('console/exec', ['command' => "unban own8_$tag"])['data']['ok'] && qv('SELECT status FROM users WHERE id = ?', [$OWN]) === 'active');
$b0 = (float) qv('SELECT ag_balance FROM wallets WHERE user_id = ?', [$A]);
$x = $con('console/exec', ['command' => "wallet a8_$tag AG 25 gift", 'confirm' => "wallet a8_$tag AG 25 gift"])['data'];
check('wallet adjustment writes a ledger entry', $x['ok'] && abs((float) qv('SELECT ag_balance FROM wallets WHERE user_id = ?', [$A]) - $b0 - 25) < 0.01, $x);
$x = $con('console/exec', ['command' => "wallet a8_$tag XX 5 bad", 'confirm' => "wallet a8_$tag XX 5 bad"])['data'];
check('bad arguments show usage', !$x['ok'] && str_contains($x['output'], 'usage'));
check('every command is audited', (int) qv('SELECT count(*) FROM console_audit') >= 8);
check('help lists commands', str_contains($con('console/exec', ['command' => 'help'])['data']['output'], 'shutdown'));
check('lock ends the session', $con('console/lock')['ok']);
expect_error('locked again', $con('console/exec', ['command' => 'status']), 'console.errors.expired');
for ($i = 0; $i < 5; $i++) $con('console/unlock', ['key' => 'wrong-key-' . $i]);
expect_error('rate limited after 5 wrong keys', $con('console/unlock', ['key' => 'test-console-key-123']), 'console.errors.tooMany');

echo $failures ? "\n" . count($failures) . " failed: " . implode(', ', $failures) . "\n" : "\nALL PASSED — $pass passed\n";
exit($failures ? 1 : 0);
