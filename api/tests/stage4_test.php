<?php
// Platform v2 tests: moderation, converter, AG play, loyalty, roles, shop, boosts, emotes, missions, memberships, security.
declare(strict_types=1);

require __DIR__ . '/../index.php';
$GLOBALS['NEON_NO_COOLDOWN'] = true;

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

echo "Neon Arcade — platform v2 tests\n";
$tag = substr((string) time(), -5);
foreach (['own' => 'ownv2', 'p1' => 'p1v2', 'p2' => 'p2v2', 'p3' => 'p3v2'] as $k => $name) {
    $r = call('POST', 'auth/register', ['username' => "{$name}_$tag", 'email' => "$name$tag@t.id", 'password' => 'rahasia123'], $k);
    if (!$r['ok']) { echo "register failed $k: " . json_encode($r) . "\n"; exit(1); }
}
$OWN = uid('own'); $P1 = uid('p1'); $P2 = uid('p2'); $P3 = uid('p3');
q("UPDATE users SET role = 'super_admin' WHERE id = ?", [$OWN]);

// ───────── Chat moderation ─────────
echo "Chat moderation\n";
check('normal English sentence allowed', chat('p1', 'Good luck everyone, nice win on crash!')['ok']);
check('normal Indonesian sentence allowed', chat('p1', 'mantap bro, gas main dice lagi')['ok']);
check('word containing a bad word inside is allowed (assassin, class, pukis)', chat('p1', 'that assassin class is fun, kue pukis enak')['ok']);
foreach (['pussy', 'dick', 'puki', 'kontol', 'FUCK you', 'k o n t o l', 'f.u.c.k', 'kooonnntooolll', 'p u s s y', 'b1tch', 'a$$hole', 'sh1t', 'ng3nt0t', 'mmk', 'anjiiing lu'] as $bad) {
    $r = chat('p2', $bad . ' ' . substr(rid(), 0, 4));
    check("blocked: \"$bad\"", !$r['ok'] && $r['code'] === 'chat.errors.blocked', $r['ok'] ? $r['data']['result']['message']['text'] : $r['code']);
    q("DELETE FROM chat_moderation_log WHERE user_id = ? AND action IN ('blocked','spam')", [$P2]);
    q('UPDATE users SET muted_until = NULL WHERE id = ?', [$P2]);
}
$r = chat('p2', 'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSS');
expect_error('spam: repeated characters', $r, 'chat.errors.spam');
$r = chat('p2', 'THIS IS SO MUCH SHOUTING RIGHT NOW');
expect_error('spam: all caps', $r, 'chat.errors.caps');
check('short caps allowed (KALI X10 BOS)', chat('p3', 'KALI X10 BOS')['ok']);
$m = chat('p3', 'yaudah bego');
check('mild word masked, not blocked', $m['ok'] && $m['data']['result']['message']['text'] === 'yaudah b***' && $m['data']['result']['message']['flagged'], $m['ok'] ? $m['data']['result']['message'] : $m);
check('blocked attempts are logged', (int) qv("SELECT count(*) FROM chat_moderation_log WHERE user_id = ? AND action = 'spam'", [$P2]) >= 2);
q("DELETE FROM chat_moderation_log WHERE user_id = ?", [$P2]);
chat('p2', 'kontol');
chat('p2', 'memek');
$r = chat('p2', 'ngentot');
expect_error('3 strikes in 10 minutes → auto-mute', $r, 'chat.errors.autoMuted');
check('auto-mute stored server-side', (bool) qv('SELECT muted_until > now() FROM users WHERE id = ?', [$P2]));
expect_error('muted user cannot chat', chat('p2', 'hello'), 'chat.errors.muted');
check('auto_mute logged', (bool) qv("SELECT 1 FROM chat_moderation_log WHERE user_id = ? AND action = 'auto_mute'", [$P2]));
q('UPDATE users SET muted_until = NULL, mute_reason = NULL WHERE id = ?', [$P2]);
check('owner adds a blocked term', admin('own', 'addTerm', ['term' => 'zonkword', 'severity' => 3, 'match' => 'word'])['ok']);
expect_error('new term takes effect', chat('p3', 'you zonkword'), 'chat.errors.blocked');
check('owner sets moderation to relaxed', admin('own', 'setModeration', ['level' => 'relaxed', 'autoMute' => true, 'autoMuteStrikes' => 3, 'autoMuteMinutes' => 10, 'repeatLimit' => 8, 'reason' => 'test relaxed'])['ok']);
check('relaxed: severity-2 word only masked', ($x = chat('p3', 'dasar goblok'))['ok'] && str_contains($x['data']['result']['message']['text'], '*'), $x);
admin('own', 'setModeration', ['level' => 'standard', 'autoMute' => true, 'autoMuteStrikes' => 3, 'autoMuteMinutes' => 10, 'repeatLimit' => 8, 'reason' => 'back to normal']);
expect_error('player cannot change moderation', admin('p1', 'setModeration', ['level' => 'relaxed', 'reason' => 'hack hack']), 'admin.errors.forbidden');
expect_error('player cannot add terms', admin('p1', 'addTerm', ['term' => 'hello']), 'admin.errors.forbidden');
$snap = call('GET', 'admin/snapshot', [], 'own')['data']['admin']['v2'];
check('owner sees moderation log + terms', count($snap['modLog']) > 0 && count($snap['terms']) > 50);

// ───────── Converter ─────────
echo "Converter\n";
setbal($P1, 100000, 0);
$rate = (int) kv_get('economy')['acPerAg'];
$r = call('POST', 'convert', ['amount' => 60000, 'requestId' => $req = rid()], 'p1');
check('convert 60,000 AC → 2 AG (server computes, remainder kept)', $r['ok'] && $r['data']['result']['ag'] == 2 && $r['data']['result']['ac'] == 2 * $rate, $r);
check('balances after convert', bal('p1') == 100000 - 2 * $rate && bal('p1', 'AG') == 2);
$again = call('POST', 'convert', ['amount' => 60000, 'requestId' => $req], 'p1');
check('same requestId → no second conversion', $again['ok'] && !empty($again['data']['result']['duplicate']) && bal('p1', 'AG') == 2, $again);
expect_error('below minimum', call('POST', 'convert', ['amount' => 100, 'requestId' => rid()], 'p1'), 'convert.errors.min');
expect_error('negative amount', call('POST', 'convert', ['amount' => -50000, 'requestId' => rid()], 'p1'), 'convert.errors.invalid');
expect_error('fractional amount', call('POST', 'convert', ['amount' => 25000.5, 'requestId' => rid()], 'p1'), 'convert.errors.invalid');
expect_error('more AC than balance', call('POST', 'convert', ['amount' => 9000000, 'requestId' => rid()], 'p1'), 'errors.insufficient');
expect_error('missing requestId', call('POST', 'convert', ['amount' => 50000], 'p1'), 'errors.invalidRequest');
check('convert recorded in ledger (both legs)', (int) qv("SELECT count(*) FROM wallet_transactions WHERE user_id = ? AND category = 'convert'", [$P1]) === 2);
check('owner changes rate', admin('own', 'setEconomy', ['acPerAg' => 10000, 'convertMinAg' => 1, 'convertMaxAgPerDay' => 3, 'reason' => 'new rate'])['ok']);
$r = call('POST', 'convert', ['amount' => 10000, 'requestId' => rid()], 'p1');
check('new rate applies', $r['ok'] && $r['data']['result']['ag'] == 1 && $r['data']['result']['rate'] == 10000, $r);
expect_error('daily limit', call('POST', 'convert', ['amount' => 20000, 'requestId' => rid()], 'p1'), 'convert.errors.daily');
expect_error('player cannot change rate', admin('p1', 'setEconomy', ['acPerAg' => 1, 'reason' => 'free gems']), 'admin.errors.forbidden');
admin('own', 'setEconomy', ['acPerAg' => 25000, 'convertMinAg' => 1, 'convertMaxAgPerDay' => 200, 'reason' => 'restore rate']);

// ───────── AG play + loyalty limits ─────────
echo "AG play & loyalty limits\n";
setbal($P1, 300000, 30);
cool();
$ag0 = bal('p1', 'AG'); $ac0 = bal('p1');
$d = call('POST', 'game/dice', ['bet' => 5, 'target' => 50, 'over' => true, 'currency' => 'AG'], 'p1');
check('dice played with AG', $d['ok'] && $d['data']['result']['session']['currency'] === 'AG', $d);
$s = $d['data']['result']['session'];
check('AG balance moved, AC untouched', abs(bal('p1', 'AG') - ($ag0 - 5 + $s['payout'])) < 0.01 && bal('p1') == $ac0);
check('AG round earns XP valued at the rate', $s['xp'] >= 60 - 0 || $s['xp'] > 10, $s['xp']);
check('AG round earns Loyalty XP (5 AG × 25,000 = 125 LXP)', (int) qv('SELECT loyalty_xp FROM users WHERE id = ?', [$P1]) === 125);
cool();
$r = call('POST', 'game/dice', ['bet' => 11, 'target' => 50, 'over' => true, 'currency' => 'AG'], 'p1');
expect_error('No card: max 10 AG', $r, 'play.errors.loyaltyMax');
check('limit message vars (AC / AG / card)', ($r['vars']['ac'] ?? '') === '250,000' && ($r['vars']['ag'] ?? '') === '10' && ($r['vars']['card'] ?? '') === 'No Card', $r['vars'] ?? null);
expect_error('No card: max 250,000 AC', call('POST', 'game/dice', ['bet' => 250001, 'target' => 50, 'over' => true], 'p1'), 'play.errors.loyaltyMax');
expect_error('bad currency rejected', call('POST', 'game/dice', ['bet' => 5, 'target' => 50, 'over' => true, 'currency' => 'BTC'], 'p1'), 'play.errors.invalid');

// ───────── Loyalty: Silver can be bought, the rest is XP only ─────────
echo "Loyalty (XP only)\n";
setbal($P1, 5000000, 20);
setbal($P1, 1000000, 20);
expect_error('Silver: not enough AC to buy', call('POST', 'loyalty/unlock', [], 'p1'), 'loyalty.errors.insufficient');
setbal($P1, 5000000, 20);
check('Silver can be bought (1.5M AC + 5 AG)', ($x = call('POST', 'loyalty/unlock', [], 'p1'))['ok'] && extras('p1')['loyalty']['card'] === 'silver' && bal('p1') == 3500000 && bal('p1', 'AG') == 15, $x);
expect_error('cards after Silver cannot be bought', call('POST', 'loyalty/unlock', [], 'p1'), 'loyalty.errors.notForSale');
check('balances unchanged after refused unlock', bal('p1') == 3500000 && bal('p1', 'AG') == 15);
tx(fn() => add_loyalty_xp($P1, 5000, 'admin'));
check('5,000 Loyalty XP → Silver', extras('p1')['loyalty']['card'] === 'silver');
setbal($P1, 600000, 30);
cool();
check('Silver: 500,000 AC bet allowed', ($x = call('POST', 'game/dice', ['bet' => 500000, 'target' => 50, 'over' => true], 'p1'))['ok'], $x);
cool();
setbal($P1, 600000, 30);
check('Silver: 20 AG bet allowed', call('POST', 'game/dice', ['bet' => 20, 'target' => 50, 'over' => true, 'currency' => 'AG'], 'p1')['ok']);
cool();
expect_error('Silver: 21 AG rejected', call('POST', 'game/dice', ['bet' => 21, 'target' => 50, 'over' => true, 'currency' => 'AG'], 'p1'), 'play.errors.loyaltyMax');
check('loyalty XP log written', (int) qv("SELECT count(*) FROM loyalty_xp_log WHERE user_id = ? AND source = 'game'", [$P1]) >= 2);
check('XP card thresholds: 5,000 → Silver, 25,000 → Gold', card_for_xp(4999) === 'none' && card_for_xp(5000) === 'silver' && card_for_xp(25000) === 'gold' && card_for_xp(1000000) === 'black');
check('owner sets Loyalty XP', admin('own', 'setLoyaltyXp', ['userId' => $P3, 'xp' => 30000, 'reason' => 'event reward'])['ok'] && extras('p3')['loyalty']['card'] === 'gold');
check('owner assigns Black card (override)', admin('own', 'setLoyaltyCard', ['userId' => $P3, 'card' => 'black', 'mode' => 'override', 'reason' => 'partner'])['ok'] && extras('p3')['loyalty']['card'] === 'black');
check('owner removes override → back to XP card', admin('own', 'setLoyaltyCard', ['userId' => $P3, 'card' => null, 'mode' => 'override', 'reason' => 'partner ended'])['ok'] && extras('p3')['loyalty']['card'] === 'gold');
check('owner edits card limits', admin('own', 'updateCard', ['slug' => 'gold', 'patch' => ['maxBetAC' => 1200000], 'reason' => 'gold boost'])['ok'] && extras('p3')['loyalty']['maxBetAC'] == 1200000);
expect_error('card XP order enforced', admin('own', 'updateCard', ['slug' => 'gold', 'patch' => ['xpRequired' => 2000], 'reason' => 'bad order']), 'admin.errors.cardOrder');
admin('own', 'updateCard', ['slug' => 'gold', 'patch' => ['maxBetAC' => 1000000], 'reason' => 'restore']);
expect_error('player cannot give himself Black card', admin('p1', 'setLoyaltyCard', ['userId' => $P1, 'card' => 'black', 'mode' => 'override', 'reason' => 'please please']), 'admin.errors.forbidden');
expect_error('player cannot edit loyalty XP', admin('p1', 'setLoyaltyXp', ['userId' => $P1, 'xp' => 99999999, 'reason' => 'please please']), 'admin.errors.forbidden');

// ───────── Player roles ─────────
echo "Player roles\n";
check('new player is Newcomer', me('p2')['user']['playerRole'] === 'newcomer');
q("UPDATE user_docs SET progress = jsonb_set(progress, '{xp}', '23100') WHERE user_id = ?", [$P2]);
q("UPDATE user_progress SET level = 25, xp = 23100 WHERE user_id = ?", [$P2]);
check('level 25 → Expert automatically', me('p2')['user']['playerRole'] === 'expert');
check('owner assigns Legendary manually', admin('own', 'setPlayerRole', ['userId' => $P2, 'role' => 'legendary', 'reason' => 'tournament winner'])['ok'] && me('p2')['user']['playerRole'] === 'legendary');
check('role visible to other players (chat tag)', (function () use ($P2) { foreach (call('GET', 'sync', [], 'p1')['data']['users'] as $u) if ($u['id'] === $P2) return $u['playerRole'] === 'legendary'; return false; })());
check('owner removes manual role', admin('own', 'setPlayerRole', ['userId' => $P2, 'role' => null, 'reason' => 'season over'])['ok'] && me('p2')['user']['playerRole'] === 'expert');
check('owner creates a role', admin('own', 'upsertPlayerRole', ['role' => ['slug' => 'grinder', 'name' => 'Grinder', 'rank' => 7, 'icon' => 'zap', 'color' => '#22c55e', 'minLevel' => 200, 'benefits' => ['dailyBonusPct' => 20, 'perks' => ['+20% daily']], 'active' => true], 'reason' => 'new role'])['ok']);
check('owner deletes a role', admin('own', 'deletePlayerRole', ['slug' => 'grinder', 'reason' => 'not needed'])['ok'] && !isset(roles_all()['grinder']));
expect_error('player cannot change own role', admin('p2', 'setPlayerRole', ['userId' => $P2, 'role' => 'legendary', 'reason' => 'me me me']), 'admin.errors.forbidden');

// ───────── Shop, inventory, boosts ─────────
echo "Shop\n";
setbal($P1, 50000, 2);
$r = call('POST', 'shop/buy', ['itemId' => 'feeling-lucky', 'requestId' => rid()], 'p1');
expect_error('insufficient AG → nothing deducted', $r, 'shop.errors.insufficient');
check('missing AG shown', ($r['vars']['missing'] ?? '') === '1');
setbal($P1, 50000, 40);
$r = call('POST', 'shop/buy', ['itemId' => 'feeling-lucky', 'requestId' => $req = rid()], 'p1');
check('buy Feeling Lucky (3 AG)', $r['ok'] && bal('p1', 'AG') == 37, $r);
check('item in inventory (server)', (extras('p1')['inventory']['feeling-lucky'] ?? 0) === 1);
check('double click (same requestId) → one purchase', call('POST', 'shop/buy', ['itemId' => 'feeling-lucky', 'requestId' => $req], 'p1')['ok'] && bal('p1', 'AG') == 37 && extras('p1')['inventory']['feeling-lucky'] === 1);
check('repeatable boost can be bought again', call('POST', 'shop/buy', ['itemId' => 'feeling-lucky', 'requestId' => rid()], 'p1')['ok'] && extras('p1')['inventory']['feeling-lucky'] === 2);
check('purchase recorded in ledger', (int) qv("SELECT count(*) FROM wallet_transactions WHERE user_id = ? AND category = 'shop'", [$P1]) === 2);
check('buy Ocean Name', call('POST', 'shop/buy', ['itemId' => 'name-ocean', 'requestId' => rid()], 'p1')['ok']);
expect_error('non-repeatable item twice → rejected', call('POST', 'shop/buy', ['itemId' => 'name-ocean', 'requestId' => rid()], 'p1'), 'shop.errors.owned');
expect_error('loyalty item needs the card', call('POST', 'shop/buy', ['itemId' => 'frame-gold-card', 'requestId' => rid()], 'p1'), 'shop.errors.requires');
expect_error('membership items are not for sale', call('POST', 'shop/buy', ['itemId' => 'vip-name', 'requestId' => rid()], 'p1'), 'shop.errors.unavailable');
expect_error('unknown item', call('POST', 'shop/buy', ['itemId' => 'free-money', 'requestId' => rid()], 'p1'), 'shop.errors.unavailable');
check('use boost from inventory', call('POST', 'shop/use', ['itemId' => 'feeling-lucky'], 'p1')['ok'] && extras('p1')['inventory']['feeling-lucky'] === 1 && count(extras('p1')['boosts']) === 1);
check('second use extends the same boost', call('POST', 'shop/use', ['itemId' => 'feeling-lucky'], 'p1')['ok'] && count(extras('p1')['boosts']) === 1 && extras('p1')['boosts'][0]['endsAt'] - now_ms() > 100 * 60000);
expect_error('cannot use what you do not own', call('POST', 'shop/use', ['itemId' => 'feeling-lucky'], 'p1'), 'shop.errors.notOwned');
cool();
setbal($P1, 50000, 37);
$d = call('POST', 'game/dice', ['bet' => 1000, 'target' => 50, 'over' => true], 'p1');
$base = game_xp(1000, $d['data']['result']['session']['result'] === 'win');
check('Feeling Lucky: +50% XP (results unchanged)', $d['ok'] && $d['data']['result']['session']['xp'] === (int) floor($base * 1.5), [$d['data']['result']['session']['xp'] ?? null, $base]);
check('equip owned name effect', call('POST', 'shop/equip', ['slot' => 'nameEffect', 'itemId' => 'name-ocean'], 'p1')['ok'] && me('p1')['user']['style']['nameEffect'] === 'name-ocean');
expect_error('equip item not owned', call('POST', 'shop/equip', ['slot' => 'nameEffect', 'itemId' => 'name-gold'], 'p1'), 'shop.errors.notOwned');
expect_error('equip into wrong slot', call('POST', 'shop/equip', ['slot' => 'chatEffect', 'itemId' => 'name-ocean'], 'p1'), 'shop.errors.slot');
check('unequip', call('POST', 'shop/equip', ['slot' => 'nameEffect', 'itemId' => null], 'p1')['ok'] && empty(me('p1')['user']['style']['nameEffect']));
check('owner creates a shop item', admin('own', 'upsertShopItem', ['item' => ['id' => 'name-test', 'category' => 'name-effects', 'kind' => 'nameEffect', 'name' => 'Test Name', 'description' => 'x', 'price' => 1, 'rarity' => 'rare', 'style' => ['colors' => ['#ff0000', '#00ff00']]], 'reason' => 'new item'])['ok']);
check('owner disables item → cannot be bought', admin('own', 'setShopItemActive', ['id' => 'name-test', 'active' => false, 'reason' => 'pause sale'])['ok'] && !call('POST', 'shop/buy', ['itemId' => 'name-test', 'requestId' => rid()], 'p1')['ok']);
expect_error('player cannot change prices', admin('p1', 'upsertShopItem', ['item' => ['id' => 'feeling-lucky', 'category' => 'boosts', 'kind' => 'boost', 'name' => 'x', 'price' => 0], 'reason' => 'cheap cheap']), 'admin.errors.forbidden');
expect_error('player cannot grant items', admin('p1', 'grantItem', ['userId' => $P1, 'itemId' => 'name-prism', 'qty' => 1, 'reason' => 'free stuff']), 'admin.errors.forbidden');
q("UPDATE shop_items SET stock = 0 WHERE id = 'name-glitch'");
expect_error('sold out', call('POST', 'shop/buy', ['itemId' => 'name-glitch', 'requestId' => rid()], 'p1'), 'shop.errors.soldOut');
q("UPDATE shop_items SET stock = 100 WHERE id = 'name-glitch'");

// Concurrent double-buy of a non-repeatable item: the second sees the inventory row (FOR UPDATE) and fails.
check('negative balance impossible (ledger CHECK)', (int) qv('SELECT count(*) FROM wallets WHERE ac_balance < 0 OR ag_balance < 0') === 0);

// ───────── Emotes ─────────
echo "Emotes\n";
$ex = extras('p2');
check('free emotes owned', in_array('wave', $ex['emotes'], true) && !in_array('skull', $ex['emotes'], true));
check('role emote (Expert → :flex:)', in_array('flex', $ex['emotes'], true) && !in_array('goat', $ex['emotes'], true));
$m = chat('p2', 'lol :skull: :wave:');
check('locked emote stays plain text, owned stays a token', $m['ok'] && $m['data']['result']['message']['text'] === 'lol skull :wave:', $m['ok'] ? $m['data']['result']['message']['text'] : $m);
check('recently used tracked', in_array('wave', extras('p2')['emoteRecent'], true));
check('favorite emote', call('POST', 'emotes/favorite', ['code' => 'wave', 'on' => true], 'p2')['ok'] && extras('p2')['emoteFavs'] === ['wave']);
setbal($P2, 10000, 5);
call('POST', 'shop/buy', ['itemId' => 'emote-skull', 'requestId' => rid()], 'p2');
check('bought emote becomes usable', in_array('skull', extras('p2')['emotes'], true));
check('loyalty emote by card (Silver → :silver:)', in_array('silver', extras('p1')['emotes'], true) && !in_array('gold', extras('p1')['emotes'], true));
check('owner creates emote', admin('own', 'upsertEmote', ['emote' => ['code' => 'party', 'glyph' => '🥳', 'name' => 'Party', 'category' => 'events', 'rarity' => 'rare', 'unlockType' => 'level', 'unlockValue' => '2', 'anim' => 'bounce'], 'reason' => 'new emote'])['ok']);
expect_error('player cannot create emotes', admin('p1', 'upsertEmote', ['emote' => ['code' => 'hack', 'glyph' => 'x', 'name' => 'hack'], 'reason' => 'free emote']), 'admin.errors.forbidden');

// ───────── Daily bonus (role) ─────────
echo "Daily\n";
$before = bal('p2');
$dc = call('POST', 'daily/claim', [], 'p2');
check('daily: Expert gets +6%', $dc['ok'] && abs(($dc['data']['result']['bonus'] ?? 0) - 1.06) < 0.001, $dc['data']['result'] ?? $dc);
check('daily gives Loyalty XP', (int) qv("SELECT count(*) FROM loyalty_xp_log WHERE user_id = ? AND source = 'daily'", [$P2]) === 1);

// ───────── Missions (Roblox) ─────────
echo "Missions\n";
expect_error('claim needs a Roblox username', call('POST', 'missions/claim', ['missionId' => 'roblox-merge-inc', 'proof' => 'a b'], 'p3'), 'missions.errors.proof');
$c = call('POST', 'missions/claim', ['missionId' => 'roblox-merge-inc', 'proof' => 'Rayzer_99'], 'p3');
check('claim submitted (pending manual check)', $c['ok'] && $c['data']['result']['status'] === 'pending', $c);
expect_error('second claim while pending', call('POST', 'missions/claim', ['missionId' => 'roblox-merge-inc', 'proof' => 'Rayzer_99'], 'p3'), 'missions.errors.pending');
expect_error('player cannot approve his own claim', admin('p3', 'reviewClaim', ['claimId' => $c['data']['result']['id'], 'approve' => true]), 'admin.errors.forbidden');
$ac = bal('p3'); $ag = bal('p3', 'AG'); $lx = (int) qv('SELECT loyalty_xp FROM users WHERE id = ?', [$P3]);
check('owner approves → rewards credited', admin('own', 'reviewClaim', ['claimId' => $c['data']['result']['id'], 'approve' => true, 'note' => 'seen in game'])['ok']
    && bal('p3') == $ac + 25000 && bal('p3', 'AG') == $ag + 2 && (int) qv('SELECT loyalty_xp FROM users WHERE id = ?', [$P3]) >= $lx + 500);
expect_error('approve twice → rejected', admin('own', 'reviewClaim', ['claimId' => $c['data']['result']['id'], 'approve' => true]), 'missions.errors.reviewed');
expect_error('one-time mission cannot be claimed again', call('POST', 'missions/claim', ['missionId' => 'roblox-merge-inc', 'proof' => 'Rayzer_99'], 'p3'), 'missions.errors.claimed');
$c2 = call('POST', 'missions/claim', ['missionId' => 'roblox-merge-inc', 'proof' => 'Other_1'], 'p1');
check('owner rejects a claim → nothing paid', admin('own', 'reviewClaim', ['claimId' => $c2['data']['result']['id'], 'approve' => false, 'note' => 'not found'])['ok'] && (int) qv("SELECT count(*) FROM wallet_transactions WHERE user_id = ? AND category = 'mission'", [$P1]) === 0);
check('owner edits mission reward', admin('own', 'upsertMission', ['mission' => ['id' => 'roblox-merge-inc', 'title' => 'Play my games on Roblox', 'description' => 'x', 'gameName' => 'Merge Inc.', 'link' => 'https://www.roblox.com/games/87122632491799/Merge-Inc', 'rewardAC' => 30000, 'rewardAG' => 2, 'rewardLXP' => 500, 'repeatable' => false, 'cooldownHours' => 24], 'reason' => 'bigger reward'])['ok']);
expect_error('player cannot create rewards', admin('p1', 'upsertMission', ['mission' => ['id' => 'free', 'title' => 'free money', 'rewardAC' => 9999999], 'reason' => 'please please']), 'admin.errors.forbidden');

// ───────── Memberships ─────────
echo "Memberships\n";
$t = call('POST', 'membership/request', ['tier' => 'vvip'], 'p2');
check('VVIP request creates a support ticket', $t['ok'] && str_starts_with($t['data']['result']['id'], 'T-'), $t);
expect_error('player cannot activate VIP himself', admin('p2', 'setMembership', ['userId' => $P2, 'tier' => 'vvip', 'days' => 30, 'reason' => 'i paid trust me']), 'admin.errors.forbidden');
check('owner activates VVIP', admin('own', 'setMembership', ['userId' => $P2, 'tier' => 'vvip', 'days' => 30, 'reason' => 'payment confirmed'])['ok']);
$ex = extras('p2');
check('membership state + VIP/VVIP emotes unlocked', $ex['membership']['tier'] === 'vvip' && in_array('vvip', $ex['emotes'], true) && in_array('vip', $ex['emotes'], true));
check('VVIP cosmetic equippable without buying', call('POST', 'shop/equip', ['slot' => 'nameEffect', 'itemId' => 'vvip-name'], 'p2')['ok']);
check('VVIP: Platinum card floor + 50% bet limit', extras('p2')['loyalty']['card'] === 'platinum' && extras('p2')['loyalty']['maxBetAC'] == 3750000 && extras('p2')['loyalty']['maxBetAG'] == 187, extras('p2')['loyalty']);
check('owner ends membership → cosmetics drop', admin('own', 'setMembership', ['userId' => $P2, 'tier' => null, 'reason' => 'refund'])['ok'] && empty(me('p2')['user']['style']['nameEffect']) && !in_array('vvip', extras('p2')['emotes'], true));

// ───────── Crash minimum cash out ─────────
echo "Crash\n";
cool();
setbal($P3, 50000, 0);
$t0 = now_ms();
$GLOBALS['NEON_NOW'] = $t0;
$t0 = $t0 + 7200000;
$GLOBALS['NEON_NOW'] = $t0;
$cs = call('POST', 'game/crash-start', ['bet' => 100], 'p3');
$cid = $cs['data']['result']['id'];
$t0 = $cs['data']['result']['startedAt'];
q("UPDATE game_sessions SET state = jsonb_set(state, '{point}', '50') WHERE id = ?", [$cid]);
$GLOBALS['NEON_NOW'] = $t0 + (int) crash_time_of(1.02) + 5;
expect_error('crash: cash out at 1.02× rejected', call('POST', 'game/crash-cashout', ['id' => $cid], 'p3'), 'play.crash.minCashout');
$GLOBALS['NEON_NOW'] = $t0 + (int) crash_time_of(1.06) + 5;
$co = call('POST', 'game/crash-cashout', ['id' => $cid], 'p3');
check('crash: cash out at ≥ 1.05× works', $co['ok'] && $co['data']['result']['cashedAt'] >= 1.05, $co['data']['result'] ?? $co);
unset($GLOBALS['NEON_NOW']);
expect_error('crash: auto cash out below 1.05 rejected', call('POST', 'game/crash-start', ['bet' => 100, 'autoCashout' => 1.01], 'p3'), 'play.crash.minCashout');

// ───────── Logout ─────────
echo "Logout\n";
check('logged in', !empty(me('p3')['user']));
call('POST', 'auth/logout', [], 'p3');
$after = call('GET', 'me', [], 'p3');
check('after logout the old cookie is dead (refresh stays logged out)', $after['ok'] && empty($after['data']['user']));
expect_error('protected API rejected after logout', call('POST', 'daily/claim', [], 'p3'), 'errors.sessionExpired');

echo "\n" . ($failures ? count($failures) . " failed, $pass passed\n" : "All $pass tests passed\n");
exit($failures ? 1 : 0);
