<?php
// Platform v2: chat moderation, converter, loyalty, player roles, shop, boosts, emotes, memberships, missions.
// Every change of balance, XP, card, role, ownership or membership happens here, on the server.
declare(strict_types=1);

// ───────────────────────────── Settings ─────────────────────────────

const KV_DEFAULTS = [
    'economy' => ['acPerAg' => 25000, 'convertMinAg' => 1, 'convertMaxAgPerDay' => 200],
    'moderation' => ['level' => 'standard', 'autoMute' => true, 'autoMuteStrikes' => 3, 'autoMuteMinutes' => 10, 'repeatLimit' => 8],
    'memberships' => [
        'vip' => ['price' => 149999, 'days' => 30, 'benefits' => []],
        'vvip' => ['price' => 499999, 'days' => 30, 'benefits' => []],
    ],
];

function kv_get(string $key): array
{
    static $cache = [];
    if (!isset($cache[$key]) || !empty($GLOBALS['NEON_KV_DIRTY'][$key])) {
        $row = qv('SELECT value FROM neon_kv WHERE key = ?', [$key]);
        $cache[$key] = array_replace_recursive(KV_DEFAULTS[$key] ?? [], $row ? jdec((string) $row, []) : []);
        unset($GLOBALS['NEON_KV_DIRTY'][$key]);
    }
    return $cache[$key];
}

function kv_set(string $key, array $value): void
{
    q('INSERT INTO neon_kv (key, value) VALUES (?, ?::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [$key, jenc($value)]);
    $GLOBALS['NEON_KV_DIRTY'][$key] = true;
}

function request_id($raw): string
{
    $id = (string) $raw;
    if (!preg_match('/^[A-Za-z0-9_-]{8,64}$/', $id)) fail('errors.invalidRequest');
    return $id;
}

// ───────────────────────────── Loyalty cards ─────────────────────────────

function cards_all(): array
{
    static $cards = null;
    if ($cards === null || !empty($GLOBALS['NEON_CARDS_DIRTY'])) {
        $cards = [];
        foreach (q('SELECT * FROM loyalty_cards ORDER BY rank')->fetchAll() as $c) $cards[$c['slug']] = $c;
        $GLOBALS['NEON_CARDS_DIRTY'] = false;
    }
    return $cards;
}

function card_rank(string $slug): int
{
    return (int) (cards_all()[$slug]['rank'] ?? 0);
}

function card_for_xp(int $xp): string
{
    $best = 'none';
    foreach (cards_all() as $slug => $c) if ($xp >= (int) $c['xp_required']) $best = $slug;
    return $best;
}

/** Card in effect: owner override, otherwise the higher of the XP card and the bought/granted floor. */
function effective_card(array $u): string
{
    if (!empty($u['loyalty_override']) && isset(cards_all()[$u['loyalty_override']])) return $u['loyalty_override'];
    $byXp = card_for_xp((int) ($u['loyalty_xp'] ?? 0));
    $best = $byXp;
    // Floor: card granted by the Owner, or the card that comes with an active VIP/VVIP membership.
    foreach ([$u['loyalty_floor'] ?? 'none', member_card_floor($u['id'] ?? '')] as $floor) {
        if ($floor && isset(cards_all()[$floor]) && card_rank($floor) > card_rank($best)) $best = $floor;
    }
    return $best;
}

function next_card(string $slug): ?array
{
    $rank = card_rank($slug);
    foreach (cards_all() as $c) if ((int) $c['rank'] === $rank + 1) return $c;
    return null;
}

function card_view(array $c): array
{
    return [
        'slug' => $c['slug'], 'name' => $c['name'], 'rank' => (int) $c['rank'], 'xpRequired' => (int) $c['xp_required'],
        'maxBetAC' => num($c['max_bet_ac']), 'maxBetAG' => num($c['max_bet_ag']),
        'unlockAC' => $c['unlock_ac'] === null ? null : num($c['unlock_ac']), 'unlockAG' => $c['unlock_ag'] === null ? null : num($c['unlock_ag']),
        'color' => $c['color'], 'benefits' => jdec($c['benefits'], []), 'perks' => card_perks($c['slug']),
    ];
}

function loyalty_view(array $u): array
{
    $xp = (int) $u['loyalty_xp'];
    $card = effective_card($u);
    $next = next_card($card);
    $c = cards_all()[$card];
    return [
        'xp' => $xp, 'card' => $card, 'floor' => $u['loyalty_floor'], 'override' => $u['loyalty_override'],
        'next' => $next ? $next['slug'] : null, 'nextXp' => $next ? (int) $next['xp_required'] : null,
        'maxBetAC' => bet_limits($u)['AC'], 'maxBetAG' => bet_limits($u)['AG'],
        'perks' => card_perks($card),
    ];
}

/** Bet limits: the Loyalty Card limit, raised by an active VIP (+20%) / VVIP (+50%) membership. */
function bet_limits(array $u): array
{
    $c = cards_all()[effective_card($u)];
    $pct = member_perk($u['id'] ?? '', 'betPct', 0);
    return ['AC' => (float) floor((float) $c['max_bet_ac'] * (1 + $pct / 100)), 'AG' => (float) floor((float) $c['max_bet_ag'] * (1 + $pct / 100)), 'card' => $c['name']];
}

/** Hard server-side bet limit from the player's Loyalty Card (+ membership bonus). */
function check_loyalty_bet(array $u, string $currency, int $bet): void
{
    $l = bet_limits($u);
    if ($bet > $l[$currency === 'AG' ? 'AG' : 'AC']) fail('play.errors.loyaltyMax', ['ac' => number_format($l['AC']), 'ag' => number_format($l['AG']), 'card' => $l['card']]);
}

const LXP_GAME_DAILY_CAP = 5000;

/** Loyalty XP from a round: 1 per 1,000 AC wagered (AG valued at the converter rate), max 250 per round. */
function game_lxp(float $valueAc): int
{
    return (int) min(250, floor($valueAc / 1000));
}

function add_loyalty_xp(string $userId, int $amount, string $source, ?string $ref = null): int
{
    if ($amount === 0) return 0;
    if ($amount > 0) {
        $amount = (int) floor($amount * boost_mult($userId, 'lxp') * (1 + card_perks(effective_card(q1('SELECT * FROM users WHERE id = ?', [$userId]) ?? []))['lxpPct'] / 100));
        if ($source === 'game') {
            $today = (int) qv("SELECT coalesce(sum(amount), 0) FROM loyalty_xp_log WHERE user_id = ? AND source = 'game' AND at > date_trunc('day', now() AT TIME ZONE 'Asia/Jakarta') AT TIME ZONE 'Asia/Jakarta'", [$userId]);
            $amount = max(0, min($amount, LXP_GAME_DAILY_CAP - $today));
            if ($amount === 0) return 0;
        }
    }
    $u = q1('SELECT * FROM users WHERE id = ? FOR UPDATE', [$userId]);
    $before = effective_card($u);
    $next = max(0, (int) $u['loyalty_xp'] + $amount);
    $amount = $next - (int) $u['loyalty_xp'];
    if ($amount === 0) return 0;
    q('UPDATE users SET loyalty_xp = ? WHERE id = ?', [$next, $userId]);
    q('INSERT INTO loyalty_xp_log (user_id, amount, source, ref) VALUES (?, ?, ?, ?)', [$userId, $amount, $source, $ref]);
    $u['loyalty_xp'] = $next;
    $after = effective_card($u);
    if (card_rank($after) > card_rank($before)) notify($userId, 'loyaltyUp', ['card' => $after, 'name' => cards_all()[$after]['name']]);
    // Reaching a card with Loyalty XP hands out its one-time membership reward (Platinum, Infinite, Black, Monarch).
    if ($amount > 0 && card_rank(card_for_xp($next)) > card_rank(card_for_xp($next - $amount))) card_once_grant_all($userId);
    return $amount;
}

/** Buy the next card with AC + AG. Atomic: both debits or nothing. */
function loyalty_unlock(array $me): array
{
    // Only the first card (Silver) can be bought; later cards are earned with Loyalty XP.
    $u = q1('SELECT * FROM users WHERE id = ? FOR UPDATE', [$me['id']]);
    if ($u['wallet_frozen']) fail('errors.walletFrozen');
    $current = effective_card($u);
    $next = next_card($current);
    if (!$next) fail('loyalty.errors.max');
    if ((int) $next['rank'] !== 1 || $next['unlock_ac'] === null || $next['unlock_ag'] === null) fail('loyalty.errors.notForSale');
    $w = q1('SELECT ac_balance, ag_balance FROM wallets WHERE user_id = ? FOR UPDATE', [$me['id']]);
    $needAc = (float) $next['unlock_ac'];
    $needAg = (float) $next['unlock_ag'];
    $missAc = max(0, $needAc - (float) $w['ac_balance']);
    $missAg = max(0, $needAg - (float) $w['ag_balance']);
    if ($missAc > 0 || $missAg > 0) fail('loyalty.errors.insufficient', ['ac' => number_format($missAc), 'ag' => number_format($missAg)]);
    $key = 'loyalty-unlock:' . $next['slug'];
    if ($needAc > 0) wallet_post($me['id'], 'AC', -$needAc, 'purchase', 'loyalty', 'loyalty', $next['name'] . ' card', null, "$key:AC");
    if ($needAg > 0) wallet_post($me['id'], 'AG', -$needAg, 'purchase', 'loyalty', 'loyalty', $next['name'] . ' card', null, "$key:AG");
    q('UPDATE users SET loyalty_floor = ? WHERE id = ?', [$next['slug'], $me['id']]);
    log_event('LOYALTY_UNLOCK', $me['id'], ['card' => $next['slug']]);
    notify($me['id'], 'loyaltyUp', ['card' => $next['slug'], 'name' => $next['name']]);
    return ['card' => $next['slug'], 'paidAC' => num($needAc), 'paidAG' => num($needAg)];
}

// ───────────────────────────── Converter ─────────────────────────────

function convert_ac_to_ag(array $me, $amountAc, string $requestId): array
{
    $cfg = kv_get('economy');
    $rate = (int) $cfg['acPerAg'];
    if (!is_numeric($amountAc) || (float) $amountAc <= 0 || floor((float) $amountAc) != (float) $amountAc) fail('convert.errors.invalid');
    $ag = (int) floor(((float) $amountAc) / $rate);
    if ($ag < (int) $cfg['convertMinAg']) fail('convert.errors.min', ['min' => number_format($rate * (int) $cfg['convertMinAg'])]);
    if (q1('SELECT 1 FROM users WHERE id = ? AND wallet_frozen', [$me['id']])) fail('errors.walletFrozen');
    $done = q1("SELECT amount FROM wallet_transactions WHERE user_id = ? AND idempotency_key = ?", [$me['id'], "convert:$requestId:AG"]);
    if ($done) return ['ac' => num($rate * (float) $done['amount']), 'ag' => num($done['amount']), 'rate' => $rate, 'duplicate' => true];
    $cost = $ag * $rate;
    if ((float) qv('SELECT ac_balance FROM wallets WHERE user_id = ?', [$me['id']]) < $cost) fail('errors.insufficient');
    $today = (float) qv("SELECT coalesce(sum(amount), 0) FROM wallet_transactions WHERE user_id = ? AND category = 'convert' AND currency = 'AG' AND created_at > now() - interval '24 hours'", [$me['id']]);
    $max = convert_cap($me);
    if ($today + $ag > $max) fail('convert.errors.daily', ['max' => $max, 'left' => max(0, $max - (int) $today)]);
    wallet_post($me['id'], 'AC', -$cost, 'convert', 'convert', 'converter', "AC → AG ($rate AC = 1 AG)", null, "convert:$requestId:AC");
    wallet_post($me['id'], 'AG', $ag, 'convert', 'convert', 'converter', "AC → AG ($rate AC = 1 AG)", null, "convert:$requestId:AG");
    log_event('CURRENCY_CONVERTED', $me['id'], ['ac' => $cost, 'ag' => $ag, 'rate' => $rate]);
    return ['ac' => num($cost), 'ag' => num($ag), 'rate' => $rate];
}

// ───────────────────────────── Player roles ─────────────────────────────

function roles_all(): array
{
    static $roles = null;
    if ($roles === null || !empty($GLOBALS['NEON_ROLES_DIRTY'])) {
        $roles = [];
        foreach (q('SELECT * FROM player_roles ORDER BY rank, min_level')->fetchAll() as $r) $roles[$r['slug']] = $r;
        $GLOBALS['NEON_ROLES_DIRTY'] = false;
    }
    return $roles;
}

function player_role_of(array $u, int $level): ?string
{
    $roles = roles_all();
    if (!empty($u['player_role']) && isset($roles[$u['player_role']]) && $roles[$u['player_role']]['active']) return $u['player_role'];
    $best = null;
    foreach ($roles as $slug => $r) if ($r['active'] && $level >= (int) $r['min_level']) $best = $slug;
    return $best;
}

function role_view(array $r): array
{
    return ['slug' => $r['slug'], 'name' => $r['name'], 'rank' => (int) $r['rank'], 'icon' => $r['icon'], 'color' => $r['color'],
        'minLevel' => (int) $r['min_level'], 'benefits' => (object) jdec($r['benefits'], []), 'active' => (bool) $r['active']];
}

function role_daily_bonus(?string $slug): float
{
    if (!$slug) return 0;
    $r = roles_all()[$slug] ?? null;
    return $r ? max(0, min(100, (float) (jdec($r['benefits'], [])['dailyBonusPct'] ?? 0))) : 0;
}

function user_level(string $userId): int
{
    return (int) (qv('SELECT level FROM user_progress WHERE user_id = ?', [$userId]) ?? 1);
}

// ───────────────────────────── Memberships ─────────────────────────────

/** Active memberships by user id (cached per request). */
function memberships_map(): array
{
    if (!isset($GLOBALS['NEON_MEMBERSHIPS']) || !empty($GLOBALS['NEON_MEMBERSHIPS_DIRTY'])) {
        $out = [];
        foreach (q("SELECT user_id, tier, ends_at FROM memberships WHERE active AND (ends_at IS NULL OR ends_at > now())")->fetchAll() as $m) $out[$m['user_id']] = $m;
        $GLOBALS['NEON_MEMBERSHIPS'] = $out;
        $GLOBALS['NEON_MEMBERSHIPS_DIRTY'] = false;
    }
    return $GLOBALS['NEON_MEMBERSHIPS'];
}

/** Player levels by user id (cached per request). */
function levels_map(): array
{
    if (!isset($GLOBALS['NEON_LEVELS']) || !empty($GLOBALS['NEON_LEVELS_DIRTY'])) {
        $GLOBALS['NEON_LEVELS'] = q('SELECT user_id, level FROM user_progress')->fetchAll(PDO::FETCH_KEY_PAIR);
        $GLOBALS['NEON_LEVELS_DIRTY'] = false;
    }
    return $GLOBALS['NEON_LEVELS'];
}

function membership_of(string $userId): ?array
{
    return q1("SELECT * FROM memberships WHERE user_id = ? AND active AND (ends_at IS NULL OR ends_at > now())", [$userId]) ?: null;
}

function tier_rank(?string $tier): int
{
    return $tier === 'vvip' ? 2 : ($tier === 'vip' ? 1 : 0);
}

/** Owner: activate / extend / end a membership. */
function membership_set(array $admin, string $userId, ?string $tier, int $days, string $note): array
{
    if ($tier !== null && !in_array($tier, ['vip', 'vvip'], true)) fail('admin.errors.invalid');
    if (!q1('SELECT 1 FROM users WHERE id = ?', [$userId])) fail('admin.errors.noUser');
    $before = membership_of($userId);
    q('UPDATE memberships SET active = FALSE WHERE user_id = ? AND active', [$userId]);
    $GLOBALS['NEON_MEMBERSHIPS_DIRTY'] = true;
    if ($tier !== null) {
        if ($days < 1 || $days > 3650) fail('admin.errors.invalid');
        q("INSERT INTO memberships (user_id, tier, ends_at, activated_by, note) VALUES (?, ?, now() + make_interval(days => ?), ?, ?)", [$userId, $tier, $days, $admin['id'], mb_substr($note, 0, 200)]);
        notify($userId, 'membership', ['tier' => $tier, 'days' => $days]);
    }
    audit_log($admin, $tier ? 'membership.activate' : 'membership.end', $userId, null, $userId, $before ? $before['tier'] : null, $tier, $note);
    return ['ok' => true];
}

/** Player asks for VIP/VVIP: a support ticket the Owner handles after payment. Payment isn't automated. */
function membership_request(array $me, string $tier): array
{
    if (!in_array($tier, ['vip', 'vvip'], true)) fail('admin.errors.invalid');
    $cfg = kv_get('memberships')[$tier];
    $label = strtoupper($tier);
    return ticket_create($me, [
        'category' => 'account',
        'subject' => "$label membership request",
        'message' => "I'd like to get $label (Rp" . number_format((int) $cfg['price'], 0, ',', '.') . "). Please send payment instructions and activate it after payment.",
    ]);
}

// ───────────────────────────── Shop, inventory, boosts ─────────────────────────────

const STYLE_SLOTS = ['nameEffect', 'chatEffect', 'profileEffect', 'theme', 'badge', 'frame'];

function shop_items_all(): array
{
    static $items = null;
    if ($items === null || !empty($GLOBALS['NEON_SHOP_DIRTY'])) {
        $items = [];
        foreach (q('SELECT * FROM shop_items ORDER BY sort, created_at')->fetchAll() as $i) $items[$i['id']] = $i;
        $GLOBALS['NEON_SHOP_DIRTY'] = false;
    }
    return $items;
}

function shop_item_view(array $i): array
{
    return [
        'id' => $i['id'], 'category' => $i['category'], 'kind' => $i['kind'], 'name' => $i['name'], 'description' => $i['description'],
        'price' => num($i['price_ag']), 'rarity' => $i['rarity'], 'repeatable' => (bool) $i['repeatable'], 'active' => (bool) $i['active'],
        'availableFrom' => iso_to_ms($i['available_from']), 'availableUntil' => iso_to_ms($i['available_until']),
        'stock' => $i['stock'] === null ? null : (int) $i['stock'], 'requires' => (object) jdec($i['requires'], []),
        'style' => (object) jdec($i['style'], []), 'effect' => (object) jdec($i['effect'], []),
    ];
}

function shop_inventory_of(string $userId): array
{
    $out = [];
    foreach (q('SELECT item_id, qty, acquired_at FROM shop_inventory WHERE user_id = ? AND qty > 0', [$userId])->fetchAll() as $r) $out[$r['item_id']] = (int) $r['qty'];
    return $out;
}

/** Does the user meet an item's requirement (card / membership)? */
function meets_requires(array $req, array $u, ?string $tier): bool
{
    if (!empty($req['card']) && card_rank(effective_card($u)) < card_rank((string) $req['card'])) return false;
    if (!empty($req['membership']) && tier_rank($tier) < tier_rank((string) $req['membership'])) return false;
    return true;
}

/** Items the user may equip: bought items + membership cosmetics while the membership is active. */
function owns_style_item(array $u, string $itemId, ?array $inventory = null, ?string $tier = null): bool
{
    $item = shop_items_all()[$itemId] ?? null;
    if (!$item) return false;
    $req = jdec($item['requires'], []);
    if (!empty($req['membership'])) return meets_requires($req, $u, $tier);
    $inventory ??= shop_inventory_of($u['id']);
    return ($inventory[$itemId] ?? 0) > 0 && meets_requires(array_diff_key($req, ['membership' => 1]), $u, $tier);
}

function shop_buy(array $me, string $itemId, string $requestId): array
{
    $prev = q1('SELECT * FROM shop_purchases WHERE user_id = ? AND request_id = ?', [$me['id'], $requestId]);
    if ($prev) return ['item' => $prev['item_id'], 'price' => num($prev['price_ag']), 'duplicate' => true];
    $item = q1('SELECT * FROM shop_items WHERE id = ? FOR UPDATE', [$itemId]);
    if (!$item || !$item['active']) fail('shop.errors.unavailable');
    if ($item['available_from'] && strtotime($item['available_from']) > time()) fail('shop.errors.notYet');
    if ($item['available_until'] && strtotime($item['available_until']) < time()) fail('shop.errors.ended');
    if ($item['stock'] !== null && (int) $item['stock'] <= 0) fail('shop.errors.soldOut');
    $u = q1('SELECT * FROM users WHERE id = ? FOR UPDATE', [$me['id']]);
    if ($u['wallet_frozen']) fail('errors.walletFrozen');
    $tier = membership_of($me['id'])['tier'] ?? null;
    $req = jdec($item['requires'], []);
    if (!meets_requires($req, $u, $tier)) fail('shop.errors.requires', ['card' => isset($req['card']) ? cards_all()[$req['card']]['name'] ?? $req['card'] : '', 'tier' => strtoupper((string) ($req['membership'] ?? ''))]);
    $owned = (int) (qv('SELECT qty FROM shop_inventory WHERE user_id = ? AND item_id = ? FOR UPDATE', [$me['id'], $itemId]) ?? 0);
    if (!$item['repeatable'] && $owned > 0) fail('shop.errors.owned');
    // Discount: the best of the Loyalty Card and membership discounts (they don't stack).
    $price = (float) ceil((float) $item['price_ag'] * (100 - shop_discount_of($u)) / 100);
    $tx = null;
    if ($price > 0) {
        $bal = (float) qv('SELECT ag_balance FROM wallets WHERE user_id = ?', [$me['id']]);
        if ($bal < $price) fail('shop.errors.insufficient', ['missing' => number_format($price - $bal, 0)]);
        $tx = wallet_post($me['id'], 'AG', -$price, 'purchase', 'shop', 'shop', $item['name'], null, "shop:$requestId");
    }
    q("INSERT INTO shop_inventory (user_id, item_id, qty, source) VALUES (?, ?, 1, 'shop') ON CONFLICT (user_id, item_id) DO UPDATE SET qty = shop_inventory.qty + 1", [$me['id'], $itemId]);
    if ($item['stock'] !== null) q('UPDATE shop_items SET stock = stock - 1 WHERE id = ?', [$itemId]);
    q('INSERT INTO shop_purchases (user_id, item_id, price_ag, tx_id, request_id) VALUES (?, ?, ?, ?, ?)', [$me['id'], $itemId, (string) $price, $tx, $requestId]);
    $GLOBALS['NEON_SHOP_DIRTY'] = true;
    log_event('SHOP_PURCHASE', $me['id'], ['item' => $itemId, 'price' => $price]);
    return ['item' => $itemId, 'price' => num($price)];
}

/** Activate a boost from the inventory (stacks: extends the running boost of the same type). */
function shop_use(array $me, string $itemId): array
{
    $item = shop_items_all()[$itemId] ?? null;
    if (!$item || $item['kind'] !== 'boost') fail('shop.errors.notUsable');
    $qty = (int) (qv('SELECT qty FROM shop_inventory WHERE user_id = ? AND item_id = ? FOR UPDATE', [$me['id'], $itemId]) ?? 0);
    if ($qty < 1) fail('shop.errors.notOwned');
    $e = jdec($item['effect'], []);
    $type = (string) ($e['type'] ?? '');
    $mult = (float) ($e['mult'] ?? 1);
    if (!in_array($type, ['xp', 'lxp', 'daily'], true) || $mult <= 1) fail('shop.errors.notUsable');
    q('UPDATE shop_inventory SET qty = qty - 1 WHERE user_id = ? AND item_id = ?', [$me['id'], $itemId]);
    if ($type === 'daily') {
        q('INSERT INTO user_boosts (user_id, item_id, type, mult, uses_left) VALUES (?, ?, ?, ?, ?)', [$me['id'], $itemId, $type, (string) $mult, (int) ($e['uses'] ?? 1)]);
    } else {
        $minutes = max(1, min(1440, (int) ($e['minutes'] ?? 60)));
        $running = q1('SELECT id, ends_at FROM user_boosts WHERE user_id = ? AND type = ? AND mult = ? AND ends_at > now() ORDER BY ends_at DESC LIMIT 1 FOR UPDATE', [$me['id'], $type, (string) $mult]);
        if ($running) q('UPDATE user_boosts SET ends_at = ends_at + make_interval(mins => ?) WHERE id = ?', [$minutes, $running['id']]);
        else q('INSERT INTO user_boosts (user_id, item_id, type, mult, ends_at) VALUES (?, ?, ?, ?, now() + make_interval(mins => ?))', [$me['id'], $itemId, $type, (string) $mult, $minutes]);
    }
    log_event('BOOST_USED', $me['id'], ['item' => $itemId]);
    return ['ok' => true];
}

function active_boosts(string $userId): array
{
    return array_map(fn($b) => ['id' => $b['id'], 'item' => $b['item_id'], 'type' => $b['type'], 'mult' => (float) $b['mult'], 'usesLeft' => $b['uses_left'] === null ? null : (int) $b['uses_left'], 'endsAt' => iso_to_ms($b['ends_at'])],
        q("SELECT * FROM user_boosts WHERE user_id = ? AND ((ends_at IS NOT NULL AND ends_at > now()) OR (uses_left IS NOT NULL AND uses_left > 0)) ORDER BY created_at", [$userId])->fetchAll());
}

function boost_mult(string $userId, string $type): float
{
    if ($type === 'daily') return (float) (qv("SELECT max(mult) FROM user_boosts WHERE user_id = ? AND type = 'daily' AND uses_left > 0", [$userId]) ?? 1);
    return (float) (qv('SELECT max(mult) FROM user_boosts WHERE user_id = ? AND type = ? AND ends_at > now()', [$userId, $type]) ?? 1);
}

function consume_daily_boost(string $userId): void
{
    $b = q1("SELECT id FROM user_boosts WHERE user_id = ? AND type = 'daily' AND uses_left > 0 ORDER BY mult DESC, created_at LIMIT 1 FOR UPDATE", [$userId]);
    if ($b) q('UPDATE user_boosts SET uses_left = uses_left - 1 WHERE id = ?', [$b['id']]);
}

/** Equip a style item (or clear the slot with null). */
function shop_equip(array $me, string $slot, ?string $itemId): array
{
    if (!in_array($slot, STYLE_SLOTS, true)) fail('shop.errors.slot');
    [$p, $meta, $profile] = load_docs($me['id']);
    $style = (array) ($profile['style'] ?? []);
    if ($itemId === null || $itemId === '') {
        unset($style[$slot]);
    } else {
        $item = shop_items_all()[$itemId] ?? null;
        if (!$item || $item['kind'] !== $slot) fail('shop.errors.slot');
        $u = q1('SELECT * FROM users WHERE id = ?', [$me['id']]);
        if (!owns_style_item($u, $itemId, null, membership_of($me['id'])['tier'] ?? null)) fail('shop.errors.notOwned');
        $style[$slot] = $itemId;
    }
    $profile['style'] = (object) $style;
    save_docs($me['id'], $p, $meta, $profile);
    return ['style' => (object) $style];
}

/** Equipped style items that are still owned (membership ended → its cosmetics drop off). */
function style_view(array $u, array $profile, ?array $inventory, ?string $tier): array
{
    $out = [];
    foreach ((array) ($profile['style'] ?? []) as $slot => $id) {
        if (!in_array($slot, STYLE_SLOTS, true) || !is_string($id)) continue;
        $item = shop_items_all()[$id] ?? null;
        if (!$item) continue;
        $req = jdec($item['requires'], []);
        $ok = !empty($req['membership']) ? meets_requires($req, $u, $tier) : ($inventory === null || ($inventory[$id] ?? 0) > 0);
        if ($ok) $out[$slot] = $id;
    }
    return $out;
}

// ───────────────────────────── Emotes ─────────────────────────────

function emotes_all(): array
{
    static $emotes = null;
    if ($emotes === null || !empty($GLOBALS['NEON_EMOTES_DIRTY'])) {
        $emotes = [];
        foreach (q('SELECT * FROM emotes ORDER BY sort, code')->fetchAll() as $e) $emotes[$e['code']] = $e;
        $GLOBALS['NEON_EMOTES_DIRTY'] = false;
    }
    return $emotes;
}

function emote_view(array $e): array
{
    return ['code' => $e['code'], 'glyph' => $e['glyph'], 'name' => $e['name'], 'category' => $e['category'], 'rarity' => $e['rarity'],
        'unlock' => ['type' => $e['unlock_type'], 'value' => $e['unlock_value']], 'anim' => $e['anim'], 'active' => (bool) $e['active']];
}

/** Emote codes the user can use right now. */
function owned_emotes(array $u, array $meta, ?array $inventory = null, ?string $tier = null, ?int $level = null): array
{
    $inventory ??= shop_inventory_of($u['id']);
    $level ??= user_level($u['id']);
    $card = card_rank(effective_card($u));
    $role = player_role_of($u, $level);
    $roleRank = $role ? (int) roles_all()[$role]['rank'] : -1;
    $out = [];
    foreach (emotes_all() as $code => $e) {
        if (!$e['active']) continue;
        $v = (string) $e['unlock_value'];
        $ok = match ($e['unlock_type']) {
            'free' => true,
            'item' => in_array($v, $meta['inventory'] ?? [], true),
            'shop' => ($inventory[$v] ?? 0) > 0,
            'card' => $card >= card_rank($v),
            'vip' => tier_rank($tier) >= 1,
            'vvip' => tier_rank($tier) >= 2,
            'level' => $level >= (int) $v,
            'role' => isset(roles_all()[$v]) && $roleRank >= (int) roles_all()[$v]['rank'],
            default => false,
        };
        if ($ok) $out[] = $code;
    }
    return $out;
}

function emote_favorite(array $me, string $code, bool $on): array
{
    if (!isset(emotes_all()[$code])) fail('errors.notFound');
    [$p, $meta, $profile] = load_docs($me['id']);
    $favs = array_values(array_filter((array) ($profile['emoteFavs'] ?? []), fn($c) => is_string($c) && $c !== $code));
    if ($on) array_unshift($favs, $code);
    $profile['emoteFavs'] = array_slice($favs, 0, 24);
    save_docs($me['id'], $p, $meta, $profile);
    return ['favorites' => $profile['emoteFavs']];
}

// ───────────────────────────── Reward missions ─────────────────────────────

function mission_view(array $m): array
{
    return ['id' => $m['id'], 'title' => $m['title'], 'description' => $m['description'], 'gameName' => $m['game_name'], 'link' => $m['link'],
        'rewardAC' => num($m['reward_ac']), 'rewardAG' => num($m['reward_ag']), 'rewardLXP' => (int) $m['reward_lxp'],
        'repeatable' => (bool) $m['repeatable'], 'cooldownHours' => (int) $m['cooldown_hours'], 'maxClaims' => $m['max_claims'] === null ? null : (int) $m['max_claims'],
        'verification' => $m['verification'], 'active' => (bool) $m['active']];
}

function claim_view(array $c): array
{
    return ['id' => $c['id'], 'missionId' => $c['mission_id'], 'userId' => $c['user_id'], 'username' => $c['username'] ?? null, 'status' => $c['status'],
        'proof' => $c['proof'], 'note' => $c['review_note'], 'reviewedBy' => $c['reviewer'] ?? null, 'reviewedAt' => iso_to_ms($c['reviewed_at']), 'at' => iso_to_ms($c['created_at'])];
}

function mission_claim(array $me, string $missionId, $proof): array
{
    $m = q1('SELECT * FROM reward_missions WHERE id = ? FOR UPDATE', [$missionId]);
    if (!$m || !$m['active']) fail('missions.errors.unavailable');
    $proof = trim((string) $proof);
    if (!preg_match('/^[A-Za-z0-9_]{3,20}$/', $proof)) fail('missions.errors.proof');
    if (qv("SELECT 1 FROM reward_claims WHERE mission_id = ? AND user_id = ? AND status = 'pending'", [$missionId, $me['id']])) fail('missions.errors.pending');
    $approved = q1("SELECT count(*) AS n, max(reviewed_at) AS last FROM reward_claims WHERE mission_id = ? AND user_id = ? AND status = 'approved'", [$missionId, $me['id']]);
    if ((int) $approved['n'] > 0 && !$m['repeatable']) fail('missions.errors.claimed');
    if ($m['max_claims'] !== null && (int) $approved['n'] >= (int) $m['max_claims']) fail('missions.errors.claimed');
    if ($m['repeatable'] && $approved['last'] && strtotime($approved['last']) + 3600 * (int) $m['cooldown_hours'] > time()) {
        fail('missions.errors.cooldown', ['hours' => (int) ceil((strtotime($approved['last']) + 3600 * (int) $m['cooldown_hours'] - time()) / 3600)]);
    }
    $id = (string) qv('INSERT INTO reward_claims (mission_id, user_id, proof) VALUES (?, ?, ?) RETURNING id', [$missionId, $me['id'], $proof]);
    log_event('MISSION_CLAIMED', $me['id'], ['mission' => $missionId]);
    return ['id' => $id, 'status' => 'pending'];
}

function mission_review(array $admin, string $claimId, bool $approve, string $note): array
{
    require_user_perm($admin, 'rewards.manage');
    if (!preg_match('/^[0-9a-f-]{36}$/', $claimId)) fail('admin.errors.invalid');
    $c = q1("SELECT * FROM reward_claims WHERE id = ? FOR UPDATE", [$claimId]);
    if (!$c || $c['status'] !== 'pending') fail('missions.errors.reviewed');
    $m = q1('SELECT * FROM reward_missions WHERE id = ?', [$c['mission_id']]);
    q('UPDATE reward_claims SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = now() WHERE id = ?', [$approve ? 'approved' : 'rejected', mb_substr($note, 0, 200) ?: null, $admin['id'], $claimId]);
    if ($approve) {
        if ((float) $m['reward_ac'] > 0) wallet_post($c['user_id'], 'AC', (float) $m['reward_ac'], 'reward', 'mission', 'mission', $m['title'], null, "mission:$claimId:AC");
        if ((float) $m['reward_ag'] > 0) wallet_post($c['user_id'], 'AG', (float) $m['reward_ag'], 'reward', 'mission', 'mission', $m['title'], null, "mission:$claimId:AG");
        if ((int) $m['reward_lxp'] > 0) add_loyalty_xp($c['user_id'], (int) $m['reward_lxp'], 'mission', $claimId);
    }
    notify($c['user_id'], 'mission', ['title' => $m['title'], 'status' => $approve ? 'approved' : 'rejected', 'note' => $note]);
    audit_log($admin, $approve ? 'mission.approve' : 'mission.reject', $c['user_id'], $m['title'], $claimId, null, null, $note ?: '—');
    return ['ok' => true];
}

// ───────────────────────────── Chat moderation ─────────────────────────────

const LEET = ['0' => 'o', '1' => 'i', '3' => 'e', '4' => 'a', '5' => 's', '7' => 't', '8' => 'b', '9' => 'g', '@' => 'a', '$' => 's', '!' => 'i', '|' => 'i', '€' => 'e', '+' => 't'];

function mod_terms(): array
{
    static $terms = null;
    if ($terms === null || !empty($GLOBALS['NEON_TERMS_DIRTY'])) {
        $terms = [];
        foreach (q('SELECT term, severity, match FROM chat_terms')->fetchAll() as $t) $terms[] = ['term' => mod_collapse($t['term']), 'raw' => $t['term'], 'severity' => (int) $t['severity'], 'match' => $t['match']];
        $GLOBALS['NEON_TERMS_DIRTY'] = false;
    }
    return $terms;
}

/** "kooonttoolll" → "kontol": repeated letters count once. */
function mod_collapse(string $s): string
{
    return (string) preg_replace('/(.)\1+/u', '$1', $s);
}

/** Lowercase, strip accents & zero-width chars, map look-alike symbols to letters. */
function mod_normalize(string $text): string
{
    $t = mb_strtolower($text);
    $t = preg_replace('/[\x{200B}-\x{200D}\x{FEFF}\x{00AD}]/u', '', $t);
    if (class_exists('Normalizer')) $t = preg_replace('/\p{Mn}/u', '', (string) Normalizer::normalize($t, Normalizer::FORM_D));
    return strtr((string) $t, LEET);
}

/**
 * Returns ['action' => allow|mask|block|spam, 'reason' => ..., 'matched' => [...], 'text' => masked text].
 * Words are matched per token (with "f u c k" / "f.u.c.k" joined back together), repeated letters
 * collapsed, and symbols mapped (4→a, $→s, ...). "contains" terms are also checked across the whole message.
 */
function mod_check(string $text): array
{
    $cfg = kv_get('moderation');
    $limit = max(4, (int) $cfg['repeatLimit']);
    if (preg_match('/(\S)\1{' . ($limit - 1) . ',}/u', $text)) return ['action' => 'spam', 'reason' => 'repeat', 'matched' => [], 'text' => $text];
    $letters = preg_replace('/[^\p{L}]/u', '', $text);
    $len = mb_strlen($letters);
    if ($len >= 16 && mb_strlen((string) preg_replace('/[^\p{Lu}]/u', '', $letters)) / $len > 0.85) return ['action' => 'spam', 'reason' => 'caps', 'matched' => [], 'text' => $text];
    $chars = preg_split('//u', (string) preg_replace('/\s/u', '', $text), -1, PREG_SPLIT_NO_EMPTY);
    if (count($chars) >= 16 && count(array_unique($chars)) <= 3) return ['action' => 'spam', 'reason' => 'repeat', 'matched' => [], 'text' => $text];

    $norm = mod_normalize($text);
    $tokens = preg_split('/[^\p{L}]+/u', $norm, -1, PREG_SPLIT_NO_EMPTY);
    // Join runs of single letters: "k o n t o l" → "kontol".
    $joined = [];
    $run = '';
    foreach ($tokens as $tk) {
        if (mb_strlen($tk) === 1) { $run .= $tk; continue; }
        if (mb_strlen($run) >= 3) $joined[] = $run;
        $run = '';
        $joined[] = $tk;
    }
    if (mb_strlen($run) >= 3) $joined[] = $run;
    $collapsed = array_map('mod_collapse', $joined);
    $compact = mod_collapse(implode('', $tokens));

    $level = $cfg['level'];
    $worst = 0;
    $matched = [];
    foreach (mod_terms() as $t) {
        $hit = false;
        foreach ($collapsed as $tk) {
            if ($tk === $t['term'] || ($t['match'] !== 'word' && str_starts_with($tk, $t['term']))) { $hit = true; break; }
        }
        if (!$hit && $t['match'] === 'contains' && mb_strlen($t['term']) >= 4 && str_contains($compact, $t['term'])) $hit = true;
        if ($hit) {
            $matched[] = $t['raw'];
            $worst = max($worst, $t['severity']);
        }
    }
    if (!$matched) return ['action' => 'allow', 'reason' => null, 'matched' => [], 'text' => $text];
    $blockAt = $level === 'strict' ? 1 : ($level === 'relaxed' ? 3 : 2);
    if ($worst >= $blockAt) return ['action' => 'block', 'reason' => 'language', 'matched' => $matched, 'text' => $text];
    if ($level === 'relaxed' && $worst < 2) return ['action' => 'allow', 'reason' => null, 'matched' => $matched, 'text' => $text];
    // Mild words: mask them in place.
    $masked = preg_replace_callback('/[\p{L}\p{N}@$!|€+]+/u', function ($m) use ($matched) {
        $w = mod_collapse(preg_replace('/[^\p{L}]/u', '', mod_normalize($m[0])));
        foreach ($matched as $raw) if ($w !== '' && str_starts_with($w, mod_collapse($raw))) return mb_substr($m[0], 0, 1) . str_repeat('*', max(1, mb_strlen($m[0]) - 1));
        return $m[0];
    }, $text);
    return ['action' => 'mask', 'reason' => 'language', 'matched' => $matched, 'text' => (string) $masked];
}

function mod_log(?string $userId, string $action, ?string $reason, ?string $body, array $matched = [], ?string $adminId = null): void
{
    q('INSERT INTO chat_moderation_log (user_id, action, reason, body, matched, admin_id) VALUES (?, ?, ?, ?, ?, ?)',
        [$userId, $action, $reason, $body === null ? null : mb_substr($body, 0, 400), $matched ? implode(', ', $matched) : null, $adminId]);
}

/** Blocked attempt: log it and auto-mute after repeated strikes. Runs in its own transaction (the send request fails). */
function mod_strike(array $me, array $verdict, string $text): ?string
{
    return tx(function () use ($me, $verdict, $text) {
        mod_log($me['id'], $verdict['action'] === 'spam' ? 'spam' : 'blocked', $verdict['reason'], $text, $verdict['matched']);
        $cfg = kv_get('moderation');
        if (!$cfg['autoMute']) return null;
        $strikes = (int) qv("SELECT count(*) FROM chat_moderation_log WHERE user_id = ? AND action IN ('blocked', 'spam') AND at > now() - interval '10 minutes'", [$me['id']]);
        if ($strikes < max(2, (int) $cfg['autoMuteStrikes'])) return null;
        $minutes = max(1, min(1440, (int) $cfg['autoMuteMinutes']));
        q("UPDATE users SET muted_until = now() + make_interval(mins => ?), mute_reason = 'Auto-mute: repeated chat violations' WHERE id = ? AND (muted_until IS NULL OR muted_until < now())", [$minutes, $me['id']]);
        mod_log($me['id'], 'auto_mute', "{$minutes}m", null);
        notify($me['id'], 'security', ['event' => 'muted', 'until' => (time() + $minutes * 60) * 1000, 'reason' => 'Auto-mute: repeated chat violations']);
        return (string) $minutes;
    });
}

// ───────────────────────────── Views ─────────────────────────────

/** Public catalog for every client (shop, emotes, cards, roles, missions, memberships, converter rate). */
function catalog_view(bool $withInactive = false): array
{
    $missions = q('SELECT * FROM reward_missions ' . ($withInactive ? '' : 'WHERE active ') . 'ORDER BY sort, created_at')->fetchAll();
    return [
        'cards' => array_values(array_map('card_view', cards_all())),
        'roles' => array_values(array_map('role_view', array_filter(roles_all(), fn($r) => $withInactive || $r['active']))),
        'emotes' => array_values(array_map('emote_view', array_filter(emotes_all(), fn($e) => $withInactive || $e['active']))),
        'shop' => array_values(array_map('shop_item_view', shop_items_all())),
        'missions' => array_map('mission_view', $missions),
        'memberships' => kv_get('memberships'),
        'memberPerks' => MEMBER_PERKS,
        'endless' => ['rounds' => ENDLESS_ROUNDS, 'ac' => ENDLESS_REWARD_AC, 'lxp' => ENDLESS_REWARD_LXP],
        'economy' => kv_get('economy'),
    ];
}

/** Per-user extras (inventory, boosts, emotes, loyalty, membership, missions). */
function extras_view(string $userId, array $meta): array
{
    $u = q1('SELECT * FROM users WHERE id = ?', [$userId]);
    $profile = jdec((string) qv('SELECT profile FROM user_docs WHERE user_id = ?', [$userId]), []);
    $inv = shop_inventory_of($userId);
    $m = membership_of($userId);
    $level = user_level($userId);
    $claims = array_map('claim_view', q('SELECT * FROM reward_claims WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [$userId])->fetchAll());
    $convertedToday = (float) qv("SELECT coalesce(sum(amount), 0) FROM wallet_transactions WHERE user_id = ? AND category = 'convert' AND currency = 'AG' AND created_at > now() - interval '24 hours'", [$userId]);
    $lxpLog = array_map(fn($r) => ['amount' => (int) $r['amount'], 'source' => $r['source'], 'at' => iso_to_ms($r['at'])],
        q('SELECT amount, source, at FROM loyalty_xp_log WHERE user_id = ? ORDER BY at DESC LIMIT 30', [$userId])->fetchAll());
    return [
        'inventory' => (object) $inv,
        'boosts' => active_boosts($userId),
        'emotes' => owned_emotes($u, $meta, $inv, $m['tier'] ?? null, $level),
        'emoteFavs' => array_values((array) ($profile['emoteFavs'] ?? [])),
        'emoteRecent' => array_values((array) ($profile['emoteRecent'] ?? [])),
        'style' => (object) style_view($u, $profile, $inv, $m['tier'] ?? null),
        'loyalty' => loyalty_view($u) + ['log' => $lxpLog],
        'playerRole' => player_role_of($u, $level),
        'membership' => $m ? ['tier' => $m['tier'], 'endsAt' => iso_to_ms($m['ends_at'])] : null,
        'claims' => $claims,
        'convertedToday' => num($convertedToday),
        'convertCap' => convert_cap($u),
        'perks' => perks_view($u, $meta),
    ];
}

/** Fields added to every user view (tags, effects). */
function user_extra_fields(array $u, array $profile): array
{
    $tier = memberships_map()[$u['id']]['tier'] ?? null;
    $level = (int) (levels_map()[$u['id']] ?? 1);
    return [
        'loyaltyCard' => effective_card($u),
        'loyaltyXp' => (int) ($u['loyalty_xp'] ?? 0),
        'playerRole' => player_role_of($u, $level),
        'playerRoleManual' => $u['player_role'] ?? null,
        'membership' => $tier,
        'style' => (object) style_view($u, $profile, null, $tier),
        'bannerUrl' => banner_url($u['id']),
        'namePrefix' => $tier === 'vvip' ? ($u['name_prefix'] ?? null) : null,
        'nameSuffix' => $tier === 'vvip' ? ($u['name_suffix'] ?? null) : null,
    ];
}
