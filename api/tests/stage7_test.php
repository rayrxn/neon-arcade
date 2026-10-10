<?php
// v4: Monarch card, card rewards, VVIP includes VIP, richer battle pass, new Shop items.
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


echo "Neon Arcade — v4 tests (Monarch, card rewards, VVIP includes VIP, battle pass, shop)\n";
$tag = substr((string) time(), -5);
foreach (['own' => 'own4', 'a' => 'a4', 'b' => 'b4', 'c' => 'c4'] as $k => $name) {
    $r = call('POST', 'auth/register', ['username' => "{$name}_$tag", 'email' => "$name$tag@t.id", 'password' => 'rahasia123'], $k);
    if (!$r['ok']) { echo "register failed $k\n"; exit(1); }
}
$OWN = uid('own'); $A = uid('a'); $B = uid('b'); $C = uid('c');
q("UPDATE users SET role = 'super_admin' WHERE id = ?", [$OWN]);
$GLOBALS['NEON_NO_COOLDOWN'] = true;
function mem(string $id): ?array { $GLOBALS['NEON_MEMBERSHIPS_DIRTY'] = true; return q1("SELECT tier, ends_at, extract(epoch from ends_at - now()) / 86400 AS days FROM memberships WHERE user_id = ? AND active", [$id]) ?: null; }
function lxp(string $id, int $n): void { tx(fn() => add_loyalty_xp($id, $n, 'admin')); }

echo "Monarch card\n";
$m = array_values(array_filter(catalog_view()['cards'], fn($c) => $c['slug'] === 'monarch'))[0] ?? null;
check('Monarch exists above Black', $m && $m['rank'] === 6 && $m['xpRequired'] === 1500000, $m);
check('Monarch limits: 50,000,000 AC / 2,000 AG', $m['maxBetAC'] == 50000000 && $m['maxBetAG'] == 2000);
check('card thresholds: 1,499,999 → Black, 1,500,000 → Monarch', card_for_xp(1499999) === 'black' && card_for_xp(1500000) === 'monarch');
check('Monarch perks: 18% Shop, +30% XP, VVIP 30 days once', $m['perks']['shopDiscount'] == 18 && $m['perks']['xpPct'] == 30 && $m['perks']['onceTier'] === 'vvip' && $m['perks']['onceDays'] == 30);

echo "One-time card rewards\n";
lxp($A, 100000);
$x = mem($A);
check('reaching Platinum with XP gives VIP for 7 days', $x && $x['tier'] === 'vip' && abs($x['days'] - 7) < 0.01, $x);
check('a notification tells the player', (int) qv("SELECT count(*) FROM notifications WHERE user_id = ? AND kind = 'membership'", [$A]) >= 1);
lxp($A, 250000);
$x = mem($A);
check('Infinite adds VIP 21 days on top (7 + 21)', $x['tier'] === 'vip' && abs($x['days'] - 28) < 0.01, $x);
lxp($A, 650000);
$x = mem($A);
check('Black upgrades to VVIP 14 days and keeps the remaining VIP days (14 + 28)', $x['tier'] === 'vvip' && abs($x['days'] - 42) < 0.02, $x);
lxp($A, 1000000);
$x = mem($A);
check('Monarch extends VVIP by 30 days', $x['tier'] === 'vvip' && abs($x['days'] - 72) < 0.02, $x);
check('each card reward is given only once', (int) qv("SELECT count(*) FROM perk_claims WHERE user_id = ? AND kind = 'card_once'", [$A]) === 4);
expect_error('nothing left to claim', call('POST', 'perk/claim', ['kind' => 'card_once'], 'a'), 'perks.errors.nothing');
// Jumping several cards at once pays every reward on the way.
lxp($B, 1000000);
$x = mem($B);
check('jumping straight to Black pays Platinum + Infinite + Black (VVIP 14 + VIP 28 carried)', $x['tier'] === 'vvip' && abs($x['days'] - 42) < 0.02, $x);
// Card given by the Owner (override) does not pay the XP reward.
admin('own', 'setLoyaltyCard', ['userId' => $C, 'card' => 'black', 'mode' => 'override', 'reason' => 'partner']);
check('Owner override does not pay card rewards', mem($C) === null && extras('c')['perks']['card']['onceDue'] === []);
// Retroactive: a player who already had the XP before this update can claim.
q('UPDATE users SET loyalty_xp = 100000 WHERE id = ?', [$C]);
admin('own', 'setLoyaltyCard', ['userId' => $C, 'card' => null, 'mode' => 'override', 'reason' => 'end']);
check('reward shows as due for an older Platinum player', count(extras('c')['perks']['card']['onceDue']) === 1);
$r = call('POST', 'perk/claim', ['kind' => 'card_once'], 'c');
check('claim the due reward from the Loyalty page', $r['ok'] && mem($C)['tier'] === 'vip', $r);

echo "Card weekly bonus & XP bonus\n";
q('UPDATE users SET loyalty_xp = 25000 WHERE id = ?', [$C]);
q('UPDATE memberships SET active = FALSE WHERE user_id = ?', [$C]);
$GLOBALS['NEON_MEMBERSHIPS_DIRTY'] = true;
setbal($C, 0, 0);
$r = call('POST', 'perk/claim', ['kind' => 'card_weekly'], 'c');
check('Gold weekly bonus: 125,000 AC + 1 AG', $r['ok'] && bal('c') == 125000 && bal('c', 'AG') == 1, $r);
expect_error('weekly bonus once a week', call('POST', 'perk/claim', ['kind' => 'card_weekly'], 'c'), 'perks.errors.claimed');
$r = call('POST', 'perk/claim', ['kind' => 'card_monthly'], 'c');
check('Gold monthly bonus: 375,000 AC + 3 AG', $r['ok'] && bal('c') == 500000 && bal('c', 'AG') == 4, $r);
expect_error('monthly bonus once a month', call('POST', 'perk/claim', ['kind' => 'card_monthly'], 'c'), 'perks.errors.claimed');
$d = call('POST', 'game/dice', ['bet' => 1000, 'target' => 50, 'over' => true], 'c');
$base = game_xp(1000, $d['data']['result']['session']['result'] === 'win');
check('Gold: +10% game XP', $d['data']['result']['session']['xp'] === (int) floor($base * 1.1), [$d['data']['result']['session']['xp'], $base]);

echo "VVIP includes VIP\n";
q('UPDATE memberships SET active = FALSE WHERE user_id = ?', [$B]);
admin('own', 'setMembership', ['userId' => $B, 'tier' => 'vvip', 'days' => 30, 'reason' => 'paid']);
$GLOBALS['NEON_MEMBERSHIPS_DIRTY'] = true;
$pv = extras('b')['perks'];
check('VVIP sees the included VIP bonuses', !empty($pv['vipIncluded']) && $pv['vipIncluded']['daily']['claimed'] === false, $pv['vipIncluded'] ?? null);
setbal($B, 0, 0);
check('VVIP daily bonus', call('POST', 'perk/claim', ['kind' => 'member_daily'], 'b')['ok'] && bal('b') == 75000);
check('…and the VIP daily bonus too', call('POST', 'perk/claim', ['kind' => 'member_daily', 'tier' => 'vip'], 'b')['ok'] && bal('b') == 95000);
expect_error('VIP daily only once', call('POST', 'perk/claim', ['kind' => 'member_daily', 'tier' => 'vip'], 'b'), 'perks.errors.claimed');
check('VIP weekly and VIP welcome reward for VVIP', call('POST', 'perk/claim', ['kind' => 'member_weekly', 'tier' => 'vip'], 'b')['ok'] && call('POST', 'perk/claim', ['kind' => 'member_once', 'tier' => 'vip'], 'b')['ok']);
check('VVIP can use the VIP room and VIP-only cosmetics', tier_rank(member_tier($B)) >= tier_rank('vip') && owns_style_item(q1('SELECT * FROM users WHERE id = ?', [$B]), 'vip-name', null, 'vvip'));
q('UPDATE memberships SET active = FALSE WHERE user_id = ?', [$C]);
admin('own', 'setMembership', ['userId' => $C, 'tier' => 'vip', 'days' => 30, 'reason' => 'paid']);
$GLOBALS['NEON_MEMBERSHIPS_DIRTY'] = true;
expect_error('VIP cannot claim VVIP bonuses', call('POST', 'perk/claim', ['kind' => 'member_daily', 'tier' => 'vvip'], 'c'), 'perks.errors.members');

echo "Battle pass\n";
$cat = catalog_view()['pass'] ?? pass_catalog();
$free50 = $cat['rewards'][49]['free'];
$prem50 = $cat['rewards'][49]['premium'];
check('every free tier has a reward', count(array_filter($cat['rewards'], fn($r) => count($r['free']) > 0)) === 50);
check('free tier 50 gives VIP for 30 days', in_array(['kind' => 'membership', 'tier' => 'vip', 'days' => 30], $free50, true), $free50);
check('premium tier 50 gives VVIP + champion badge', in_array(['kind' => 'membership', 'tier' => 'vvip', 'days' => 14], $prem50, true) && in_array(['kind' => 'item', 'id' => 'pass-crown'], $prem50, true));
check('premium track has exclusive cosmetics', count(array_filter($cat['rewards'], fn($r) => count(array_filter($r['premium'], fn($x) => $x['kind'] === 'item' && str_starts_with($x['id'], 'pass-'))) > 0)) >= 5);
$sid = current_season(now_ms())['id'];
$D = $A; // no matter: use a fresh account for the pass end
call('POST', 'auth/register', ['username' => "d4_$tag", 'email' => "d4$tag@t.id", 'password' => 'rahasia123'], 'd');
$D = uid('d');
q("UPDATE user_docs SET progress = jsonb_set(progress, '{season}', jsonb_build_object('id', ?::int, 'xp', 50000, 'tiersClaimed', '[]'::jsonb)) WHERE user_id = ?", [$sid, $D]);
$r = call('POST', 'pass/claim', ['track' => 'free', 'tier' => 50], 'd');
check('claiming free tier 50 activates VIP for 30 days', $r['ok'] && mem($D)['tier'] === 'vip' && abs(mem($D)['days'] - 30) < 0.01, $r);
check('pass-exclusive cosmetics cannot be bought', call('POST', 'shop/buy', ['itemId' => 'pass-name', 'requestId' => rid()], 'd')['code'] === 'shop.errors.unavailable');
$r = call('POST', 'pass/claim', ['track' => 'free', 'tier' => 10], 'd');
check('free tier 10 gives the Season Badge (equippable)', $r['ok'] && owns_style_item(q1('SELECT * FROM users WHERE id = ?', [$D]), 'pass-badge'));

echo "Shop\n";
setbal($D, 0, 500);
foreach (['mega-lucky', 'loyalty-overdrive', 'triple-daily', 'chat-royal', 'name-aurora', 'frame-holo', 'badge-diamond'] as $item) {
    check("new item for sale: $item", call('POST', 'shop/buy', ['itemId' => $item, 'requestId' => rid()], 'd')['ok']);
}
expect_error('Monarch items need the Monarch card', call('POST', 'shop/buy', ['itemId' => 'name-monarch', 'requestId' => rid()], 'd'), 'shop.errors.requires');

echo $failures ? "\n" . count($failures) . " failed: " . implode(', ', $failures) . "\n" : "\nALL PASSED — $pass passed\n";
exit($failures ? 1 : 0);
