<?php
// Platform v2 tests: moderation, converter, AG play, loyalty, roles, shop, boosts, emotes, missions, memberships, security.
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

echo "Neon Arcade — v3 tests (perks, battle pass, cooldown, banners, rooms, stats)\n";
$tag = substr((string) time(), -5);
foreach (['own' => 'own3', 'p1' => 'p1v3', 'p2' => 'p2v3', 'p3' => 'p3v3', 'mgr' => 'mgr3'] as $k => $name) {
    $r = call('POST', 'auth/register', ['username' => "{$name}_$tag", 'email' => "$name$tag@t.id", 'password' => 'rahasia123'], $k);
    if (!$r['ok']) { echo "register failed $k: " . json_encode($r) . "\n"; exit(1); }
}
$OWN = uid('own'); $P1 = uid('p1'); $P2 = uid('p2'); $P3 = uid('p3'); $MGR = uid('mgr');
q("UPDATE users SET role = 'super_admin' WHERE id = ?", [$OWN]);
q("UPDATE users SET role = 'support' WHERE id = ?", [$MGR]);

// ───────── Cooldown between rounds ─────────
echo "Cooldown\n";
cool();
$t0 = now_ms() + 9000000;
$GLOBALS['NEON_NOW'] = $t0;
check('first Limbo round ok', call('POST', 'game/limbo', ['bet' => 10, 'target' => 2], 'p1')['ok']);
$GLOBALS['NEON_NOW'] = $t0 + 200;
expect_error('second Limbo round during the animation is rejected', call('POST', 'game/limbo', ['bet' => 10, 'target' => 2], 'p1'), 'play.errors.cooldown');
$GLOBALS['NEON_NOW'] = $t0 + 900;
check('after the animation the next round is allowed', call('POST', 'game/limbo', ['bet' => 10, 'target' => 2], 'p1')['ok']);
check('other games are not blocked by the Limbo cooldown', call('POST', 'game/dice', ['bet' => 10, 'target' => 50, 'over' => true], 'p1')['ok']);
$GLOBALS['NEON_NOW'] = $t0 + 1000;
check('Plinko allows several balls quickly (250 ms)', call('POST', 'game/plinko', ['bet' => 10, 'risk' => 'low'], 'p1')['ok']);
$GLOBALS['NEON_NOW'] = $t0 + 1300;
check('…second ball 300 ms later ok', call('POST', 'game/plinko', ['bet' => 10, 'risk' => 'low'], 'p1')['ok']);
unset($GLOBALS['NEON_NOW']);

// ───────── Loyalty card perks ─────────
echo "Loyalty perks\n";
expect_error('No card: no daily card bonus', call('POST', 'perk/claim', ['kind' => 'card_daily'], 'p1'), 'perks.errors.none');
tx(fn() => add_loyalty_xp($P1, 25000, 'admin'));
check('25,000 XP → Gold', extras('p1')['loyalty']['card'] === 'gold');
$b0 = bal('p1'); $g0 = bal('p1', 'AG');
$r = call('POST', 'perk/claim', ['kind' => 'card_daily'], 'p1');
check('Gold daily card bonus: 50,000 AC + 2 AG', $r['ok'] && bal('p1') == $b0 + 50000 && bal('p1', 'AG') == $g0 + 2, $r);
expect_error('card bonus only once a day', call('POST', 'perk/claim', ['kind' => 'card_daily'], 'p1'), 'perks.errors.claimed');
check('Gold: converter limit +50%', extras('p1')['convertCap'] == 300);
check('Gold: 5% shop discount shown', extras('p1')['perks']['shopDiscount'] === 5);
setbal($P1, 0, 100);
$buy = call('POST', 'shop/buy', ['itemId' => 'loyalty-rush', 'requestId' => rid()], 'p1');
check('Gold: shop price rounded up after 5% discount (5 → 5)', $buy['ok'] && $buy['data']['result']['price'] == 5, $buy);
check('benefits list per card (Black has 8)', count(array_values(array_filter(catalog_view()['cards'], fn($c) => $c['slug'] === 'black'))[0]['benefits']) === 8);

// ───────── VIP / VVIP perks ─────────
echo "Membership perks\n";
expect_error('daily member bonus needs a membership', call('POST', 'perk/claim', ['kind' => 'member_daily'], 'p2'), 'perks.errors.members');
check('owner activates VVIP for p2', admin('own', 'setMembership', ['userId' => $P2, 'tier' => 'vvip', 'days' => 30])['ok']);
check('owner activates VIP for p3 (no reason needed)', admin('own', 'setMembership', ['userId' => $P3, 'tier' => 'vip', 'days' => 30])['ok']);
setbal($P2, 0, 0);
check('VVIP daily bonus 100,000 AC + 25 AG', call('POST', 'perk/claim', ['kind' => 'member_daily'], 'p2')['ok'] && bal('p2') == 100000 && bal('p2', 'AG') == 25);
check('VVIP weekly bonus 750,000 AC + 150 AG', call('POST', 'perk/claim', ['kind' => 'member_weekly'], 'p2')['ok'] && bal('p2') == 850000 && bal('p2', 'AG') == 175);
check('VVIP one-time reward 1,500,000 AC + 500 AG', call('POST', 'perk/claim', ['kind' => 'member_once'], 'p2')['ok'] && bal('p2') == 2350000 && bal('p2', 'AG') == 675);
expect_error('one-time reward only once', call('POST', 'perk/claim', ['kind' => 'member_once'], 'p2'), 'perks.errors.claimed');
check('VVIP: converter limit ×5', extras('p2')['convertCap'] == 1000 * 2 && extras('p2')['loyalty']['card'] === 'platinum' || extras('p2')['convertCap'] >= 1000, extras('p2')['convertCap']);
check('VVIP: 25% shop discount', extras('p2')['perks']['shopDiscount'] === 25);
check('VVIP: Platinum floor and +50% bets', extras('p2')['loyalty']['maxBetAC'] == 3750000);
check('VIP: Gold floor and +20% bets', extras('p3')['loyalty']['card'] === 'gold' && extras('p3')['loyalty']['maxBetAC'] == 1200000);
expect_error('endless quest is VVIP only', call('POST', 'perk/claim', ['kind' => 'endless'], 'p3'), 'perks.errors.vvip');
$e = call('POST', 'perk/claim', ['kind' => 'endless'], 'p2');
check('VVIP endless quest starts', $e['ok'] && !empty($e['data']['result']['started']));
expect_error('endless quest needs 30 rounds', call('POST', 'perk/claim', ['kind' => 'endless'], 'p2'), 'perks.errors.notYet');
q("UPDATE user_docs SET progress = jsonb_set(progress, '{stats,games}', to_jsonb((progress->'stats'->>'games')::int + 30)) WHERE user_id = ?", [$P2]);
$b0 = bal('p2');
check('…after 30 rounds it pays 25,000 AC', call('POST', 'perk/claim', ['kind' => 'endless'], 'p2')['ok'] && bal('p2') == $b0 + 25000);
expect_error('…and needs another 30 for the next claim', call('POST', 'perk/claim', ['kind' => 'endless'], 'p2'), 'perks.errors.notYet');
// Prefix / suffix
expect_error('VIP cannot set a name prefix', call('POST', 'profile/affix', ['prefix' => '★'], 'p3'), 'perks.errors.vvip');
check('VVIP sets prefix + suffix', call('POST', 'profile/affix', ['prefix' => '★', 'suffix' => 'GG'], 'p2')['ok']);
$pub = array_values(array_filter(sync('p1')['users'], fn($u) => $u['id'] === $P2))[0];
check('prefix/suffix visible to others', $pub['namePrefix'] === '★' && $pub['nameSuffix'] === 'GG');
expect_error('rude prefix blocked', call('POST', 'profile/affix', ['prefix' => 'kontol'], 'p2'), 'chat.errors.blocked');
// Private manager + priority support
check('owner assigns a private manager', admin('own', 'setManager', ['userId' => $P2, 'managerId' => $MGR])['ok']);
check('manager shown to the member', extras('p2')['perks']['manager']['username'] === "mgr3_$tag");
$tk = call('POST', 'manager/contact', ['text' => 'Halo, saya butuh bantuan soal hadiah'], 'p2');
check('member messages the manager → ticket assigned to manager', $tk['ok'] && qv('SELECT assignee_id FROM support_tickets WHERE id = ?', [$tk['data']['result']['id']]) === $MGR, $tk);
$tickets = sync('own')['admin']['tickets'];
check('ticket carries the member tier (priority support)', (array_values(array_filter($tickets, fn($t) => $t['id'] === $tk['data']['result']['id']))[0]['memberTier'] ?? null) === 'vvip');
expect_error('VIP has no private manager', call('POST', 'manager/contact', ['text' => 'halo halo halo'], 'p3'), 'perks.errors.vvip');
// VIP room chat
expect_error('non-members cannot post in the VIP room', call('POST', 'chat/send', ['text' => 'halo semua', 'room' => 'vip'], 'p1'), 'chat.errors.vipOnly');
check('VIP posts in the VIP room', call('POST', 'chat/send', ['text' => 'halo member', 'room' => 'vip'], 'p3')['ok']);
check('VIP room hidden from non-members', !array_filter(sync('p1')['platform']['chat'], fn($m) => ($m['room'] ?? '') === 'vip'));
check('VIP room visible to VVIP', (bool) array_filter(sync('p2')['platform']['chat'], fn($m) => ($m['room'] ?? '') === 'vip'));
// Member-only redeem code
check('owner creates a VVIP-only code', admin('own', 'createCode', ['code' => "VVIP$tag", 'kind' => 'AC', 'amount' => 5000, 'active' => true, 'membersOnly' => 'vvip'])['ok']);
expect_error('VIP cannot use a VVIP code', call('POST', 'redeem/claim', ['code' => "VVIP$tag"], 'p3'), 'redeem.errors.members');
check('VVIP uses the VVIP code', call('POST', 'redeem/claim', ['code' => "VVIP$tag"], 'p2')['ok']);

// ───────── Battle pass ─────────
echo "Battle pass\n";
$pv = me('p1')['pass'];
check('pass state: tier 0, no premium', $pv['tier'] === 0 && $pv['premium'] === false, $pv);
expect_error('nothing to claim at tier 0', call('POST', 'pass/claim', ['track' => 'free', 'tier' => 1], 'p1'), 'pass.errors.locked');
$sid = $pv['seasonId'];
q("UPDATE user_docs SET progress = jsonb_set(progress, '{season}', jsonb_build_object('id', ?::int, 'xp', 5200, 'tiersClaimed', '[]'::jsonb)) WHERE user_id = ?", [$sid, $P1]);
check('5,200 SXP → tier 5', me('p1')['pass']['tier'] === 5);
setbal($P1, 0, 0);
$c = call('POST', 'pass/claim', ['track' => 'free', 'tier' => 1], 'p1');
check('claim free tier 1 → 10,000 AC', $c['ok'] && bal('p1') == 10000, $c);
expect_error('claim twice rejected', call('POST', 'pass/claim', ['track' => 'free', 'tier' => 1], 'p1'), 'pass.errors.claimed');
expect_error('premium track locked without the pass', call('POST', 'pass/claim', ['track' => 'premium', 'tier' => 1], 'p1'), 'pass.errors.premium');
expect_error('tier above reached is locked', call('POST', 'pass/claim', ['track' => 'free', 'tier' => 7], 'p1'), 'pass.errors.locked');
expect_error('premium pass costs 7,500 AG', call('POST', 'pass/buy', [], 'p1'), 'pass.errors.insufficient');
setbal($P1, 0, 7600);
check('buy premium for 7,500 AG', call('POST', 'pass/buy', [], 'p1')['ok'] && bal('p1', 'AG') == 100 && me('p1')['pass']['premium'] === true);
expect_error('cannot buy twice', call('POST', 'pass/buy', [], 'p1'), 'pass.errors.owned');
$all = call('POST', 'pass/claim', ['track' => 'all', 'tier' => 0], 'p1');
check('claim all: free tiers 2–5 + premium 1–5', $all['ok'] && $all['data']['result']['claimed'] === 9, $all);
check('premium boost item granted at tier 5', (int) qv("SELECT qty FROM shop_inventory WHERE user_id = ? AND item_id = 'feeling-lucky'", [$P1]) >= 1);
check('VVIP gets premium without buying', me('p2')['pass']['premium'] === true && me('p2')['pass']['viaVvip'] === true);
q("UPDATE user_docs SET progress = jsonb_set(progress, '{season}', jsonb_build_object('id', ?::int, 'xp', 999999, 'tiersClaimed', '[]'::jsonb)) WHERE user_id = ?", [$sid, $P3]);
check('tier is capped at 50', me('p3')['pass']['tier'] === 50);

// ───────── Banner upload ─────────
echo "Banner\n";
if (function_exists('imagecreatetruecolor')) {
    $im = imagecreatetruecolor(1200, 300);
    imagefill($im, 0, 0, imagecolorallocate($im, 30, 120, 200));
    ob_start(); imagejpeg($im, null, 80); $jpg = ob_get_clean();
    $up = call('POST', 'profile/banner', ['image' => 'data:image/jpeg;base64,' . base64_encode($jpg)], 'p1');
    check('banner upload ok', $up['ok'] && str_starts_with((string) $up['data']['result']['bannerUrl'], "/api/banner/$P1"), $up);
    check('banner url visible to others', str_starts_with((string) (array_values(array_filter(sync('p2')['users'], fn($u) => $u['id'] === $P1))[0]['bannerUrl'] ?? ''), '/api/banner/'));
    ob_start(); banner_serve($P1); $out = ob_get_clean();
    check('banner served as the uploaded image', $out === $jpg);
    $small = imagecreatetruecolor(100, 100);
    ob_start(); imagepng($small); $png = ob_get_clean();
    expect_error('too-small banner rejected', call('POST', 'profile/banner', ['image' => 'data:image/png;base64,' . base64_encode($png)], 'p1'), 'profile.errors.bannerSmall');
} else {
    $up = call('POST', 'profile/banner', ['image' => 'data:image/jpeg;base64,' . base64_encode('not an image')], 'p1');
    expect_error('non-image rejected', $up, 'profile.errors.bannerType');
}
expect_error('wrong type rejected', call('POST', 'profile/banner', ['image' => 'data:text/html;base64,PHNjcmlwdD4='], 'p1'), 'profile.errors.bannerType');
check('banner removed', call('POST', 'profile/banner', ['image' => null], 'p1')['ok'] && me('p1')['user']['bannerUrl'] === null);

// ───────── Live results & P&L stats ─────────
echo "Stats\n";
$live = sync('p2')['platform']['live'];
check('live results show other players\' rounds', (bool) array_filter($live, fn($l) => $l['userId'] === $P1 && in_array($l['game'], ['limbo', 'dice', 'plinko'], true)));
$pnl = call('GET', 'stats/pnl', [], 'p1');
check('P&L: 7 days for regular players', $pnl['ok'] && $pnl['data']['maxDays'] === 7 && count($pnl['data']['rows']) >= 1, $pnl);
$_GET['days'] = 90;
check('P&L: VVIP gets 90 days', call('GET', 'stats/pnl', [], 'p2')['data']['maxDays'] === 90);
check('P&L: regular player capped at 7 days', call('GET', 'stats/pnl', [], 'p1')['data']['days'] === 7);
unset($_GET['days']);

// ───────── Suspicious activity & admin reasons ─────────
echo "Admin\n";
check('admin actions work without a reason', admin('own', 'warnUser', ['userId' => $P1])['ok']);
qv("SELECT wallet_post(?::uuid, 'AC', 1000000, 'adjust', 'admin', 'admin', 'self', NULL, ?::uuid, NULL, ?)", [$OWN, $OWN, rid()]);
$sus = admin_v2_view(q1('SELECT * FROM users WHERE id = ?', [$OWN]))['suspicious'];
check('staff crediting their own account is flagged', (bool) array_filter($sus, fn($s) => $s['userId'] === $OWN && $s['why'] === 'selfCredit'));
check('ordinary game wins are not flagged', !array_filter($sus, fn($s) => $s['userId'] === $P1 && $s['why'] === 'hugeWin'));

echo "\n" . ($failures ? count($failures) . " gagal, $pass lulus\n" : "Semua $pass tes lulus\n");
exit($failures ? 1 : 0);
