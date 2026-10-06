<?php
// Owner panel for platform v2: economy, loyalty, player roles, shop, emotes, missions, memberships, chat moderation.
declare(strict_types=1);

function admin_v2_view(array $me): array
{
    $out = ['catalog' => catalog_view(true), 'moderation' => kv_get('moderation')];
    if (has_perm($me, 'moderation') || has_perm($me, 'moderation.config')) {
        $out['modLog'] = array_map(fn($l) => ['id' => (string) $l['id'], 'userId' => $l['user_id'], 'username' => $l['username'], 'action' => $l['action'], 'reason' => $l['reason'],
            'body' => $l['body'], 'matched' => $l['matched'], 'admin' => $l['admin_name'], 'at' => iso_to_ms($l['at'])],
            q('SELECT l.*, u.username, a.username AS admin_name FROM chat_moderation_log l LEFT JOIN users u ON u.id = l.user_id LEFT JOIN users a ON a.id = l.admin_id ORDER BY l.at DESC LIMIT 300')->fetchAll());
        $out['terms'] = array_map(fn($t) => ['term' => $t['term'], 'severity' => (int) $t['severity'], 'match' => $t['match'], 'at' => iso_to_ms($t['created_at'])],
            q('SELECT * FROM chat_terms ORDER BY severity DESC, term')->fetchAll());
    }
    if (has_perm($me, 'rewards.manage')) {
        $out['claims'] = array_map('claim_view', q("SELECT c.*, u.username, r.username AS reviewer FROM reward_claims c JOIN users u ON u.id = c.user_id LEFT JOIN users r ON r.id = c.reviewed_by
            ORDER BY (c.status = 'pending') DESC, c.created_at DESC LIMIT 300")->fetchAll());
    }
    if (has_perm($me, 'memberships.manage')) {
        $out['memberships'] = array_map(fn($m) => ['id' => $m['id'], 'userId' => $m['user_id'], 'username' => $m['username'], 'tier' => $m['tier'], 'active' => (bool) $m['active'] && (!$m['ends_at'] || strtotime($m['ends_at']) > time()),
            'startsAt' => iso_to_ms($m['starts_at']), 'endsAt' => iso_to_ms($m['ends_at']), 'by' => $m['admin_name'], 'note' => $m['note'],
            'managerId' => $m['manager_id'], 'manager' => $m['manager_name']],
            q('SELECT m.*, u.username, a.username AS admin_name, mg.username AS manager_name FROM memberships m JOIN users u ON u.id = m.user_id LEFT JOIN users a ON a.id = m.activated_by LEFT JOIN users mg ON mg.id = m.manager_id ORDER BY m.created_at DESC LIMIT 300')->fetchAll());
    }
    if (has_perm($me, 'economy.manage') || has_perm($me, 'shop.manage')) {
        $out['purchases'] = array_map(fn($p) => ['id' => $p['id'], 'userId' => $p['user_id'], 'username' => $p['username'], 'item' => $p['item_id'], 'price' => num($p['price_ag']), 'at' => iso_to_ms($p['created_at'])],
            q('SELECT p.*, u.username FROM shop_purchases p JOIN users u ON u.id = p.user_id ORDER BY p.created_at DESC LIMIT 200')->fetchAll());
    }
    if (has_perm($me, 'economy.manage')) {
        $out['suspicious'] = suspicious_transactions();
    }
    return $out;
}

/**
 * Transactions worth a look (last 7 days, test accounts excluded), each with the reason it was picked:
 * a staff member crediting their own account, a game payout far above the player's normal bet limit,
 * a very large transfer, or a large redeem.
 */
function suspicious_transactions(): array
{
    $rows = q("SELECT t.*, u.username, u.role, u.loyalty_xp, u.loyalty_floor, u.loyalty_override, u.id AS uid FROM wallet_transactions t JOIN users u ON u.id = t.user_id
               WHERE t.created_at > now() - interval '7 days' AND NOT u.is_test AND t.status = 'success'
                 AND ((t.category = 'admin' AND t.admin_id = t.user_id)
                   OR (t.category = 'game' AND t.amount > 0)
                   OR (t.category = 'transfer' AND ((t.currency = 'AC' AND abs(t.amount) >= 10000000) OR (t.currency = 'AG' AND abs(t.amount) >= 500)))
                   OR (t.category = 'redeem' AND ((t.currency = 'AC' AND t.amount >= 1000000) OR (t.currency = 'AG' AND t.amount >= 50))))
               ORDER BY t.created_at DESC LIMIT 1500")->fetchAll();
    $out = [];
    foreach ($rows as $t) {
        $why = null;
        if ($t['category'] === 'admin') $why = 'selfCredit';
        elseif ($t['category'] === 'transfer') $why = 'bigTransfer';
        elseif ($t['category'] === 'redeem') $why = 'bigRedeem';
        else {
            $limit = bet_limits(['id' => $t['uid'], 'loyalty_xp' => $t['loyalty_xp'], 'loyalty_floor' => $t['loyalty_floor'], 'loyalty_override' => $t['loyalty_override']])[$t['currency'] === 'AG' ? 'AG' : 'AC'];
            if ((float) $t['amount'] >= 100 * $limit) $why = 'hugeWin';
        }
        if (!$why) continue;
        $out[] = ['id' => $t['id'], 'userId' => $t['user_id'], 'username' => $t['username'], 'currency' => $t['currency'], 'amount' => num($t['amount']),
            'type' => $t['type'], 'category' => $t['category'], 'reason' => $t['reason'], 'why' => $why, 'at' => iso_to_ms($t['created_at'])];
        if (count($out) >= 200) break;
    }
    return $out;
}

// ── validation helpers ──

function v_int($v, int $min, int $max, string $err = 'admin.errors.invalid'): int
{
    if (!is_numeric($v) || floor((float) $v) != (float) $v || (int) $v < $min || (int) $v > $max) fail($err);
    return (int) $v;
}

function v_num($v, float $min, float $max): float
{
    if (!is_numeric($v) || (float) $v < $min || (float) $v > $max) fail('admin.errors.invalid');
    return round((float) $v, 2);
}

function v_str($v, int $min, int $max): string
{
    $s = trim((string) $v);
    if (mb_strlen($s) < $min || mb_strlen($s) > $max) fail('admin.errors.invalid');
    return $s;
}

function v_color($v): string
{
    $s = trim((string) $v);
    if (!preg_match('/^#[0-9a-fA-F]{6}$/', $s)) fail('admin.errors.color');
    return strtolower($s);
}

function v_slug($v, int $max = 40): string
{
    $s = strtolower(trim((string) $v));
    if (!preg_match('/^[a-z0-9][a-z0-9-]{1,' . ($max - 1) . '}$/', $s)) fail('admin.errors.slug');
    return $s;
}

function v_list($v, int $maxItems = 12, int $maxLen = 80): array
{
    if (!is_array($v)) fail('admin.errors.invalid');
    $out = [];
    foreach ($v as $x) {
        $s = trim((string) $x);
        if ($s !== '') $out[] = mb_substr($s, 0, $maxLen);
    }
    return array_slice($out, 0, $maxItems);
}

function v_ts($v): ?string
{
    if ($v === null || $v === '') return null;
    if (!is_numeric($v)) fail('admin.errors.invalid');
    return gmdate('c', (int) floor((float) $v / 1000));
}

function v_style($v, string $kind): array
{
    $v = is_array($v) ? $v : [];
    $out = [];
    foreach (['color', 'color2', 'accent'] as $k) if (!empty($v[$k])) $out[$k] = v_color($v[$k]);
    if (isset($v['colors'])) $out['colors'] = array_map('v_color', array_slice((array) $v['colors'], 0, 6));
    if (!empty($v['glyph'])) $out['glyph'] = mb_substr((string) $v['glyph'], 0, 4);
    if (!empty($v['kind']) && in_array($v['kind'], ['scan', 'aurora', 'stars'], true)) $out['kind'] = $v['kind'];
    foreach (['animated', 'glitch'] as $k) if (!empty($v[$k])) $out[$k] = true;
    if ($kind === 'nameEffect' && count($out['colors'] ?? []) < 2) fail('admin.errors.colors');
    if ($kind === 'profileEffect' && empty($out['kind'])) $out['kind'] = 'aurora';
    return $out;
}

function target_user(string $id): array
{
    $u = preg_match('/^[0-9a-f-]{36}$/', $id) ? q1('SELECT * FROM users WHERE id = ? FOR UPDATE', [$id]) : null;
    if (!$u) fail('admin.errors.noUser');
    return $u;
}

/** Owner panel actions. Returns null when the action isn't one of these (falls through to the classic actions). */
function admin_v2_action(array $me, string $name, array $a): ?array
{
    switch ($name) {
        // ── Economy ──
        case 'setEconomy': {
            require_user_perm($me, 'economy.manage');
            $r = adm_reason($a['reason'] ?? '');
            $before = kv_get('economy');
            $next = ['acPerAg' => v_int($a['acPerAg'] ?? 0, 100, 100000000), 'convertMinAg' => v_int($a['convertMinAg'] ?? 1, 1, 1000), 'convertMaxAgPerDay' => v_int($a['convertMaxAgPerDay'] ?? 200, 1, 1000000)];
            kv_set('economy', $next);
            audit_log($me, 'economy.update', null, 'Converter', 'economy', $before, $next, $r);
            return ['ok' => true];
        }

        // ── Loyalty ──
        case 'setLoyaltyXp': {
            require_user_perm($me, 'loyalty.manage');
            $r = adm_reason($a['reason'] ?? '');
            $t = target_user((string) ($a['userId'] ?? ''));
            $xp = v_int($a['xp'] ?? -1, 0, 1000000000);
            add_loyalty_xp($t['id'], $xp - (int) $t['loyalty_xp'], 'admin', $me['id']);
            audit_log($me, 'loyalty.xp', $t['id'], null, $t['id'], (int) $t['loyalty_xp'], $xp, $r);
            return ['ok' => true];
        }
        case 'setLoyaltyCard': {
            require_user_perm($me, 'loyalty.manage');
            $r = adm_reason($a['reason'] ?? '');
            $t = target_user((string) ($a['userId'] ?? ''));
            $card = $a['card'] ?? null;
            if ($card !== null && !isset(cards_all()[$card])) fail('admin.errors.invalid');
            $mode = (string) ($a['mode'] ?? 'override');
            $before = ['card' => effective_card($t), 'floor' => $t['loyalty_floor'], 'override' => $t['loyalty_override']];
            if ($mode === 'floor') q('UPDATE users SET loyalty_floor = ? WHERE id = ?', [$card ?? 'none', $t['id']]);
            elseif ($mode === 'override') q('UPDATE users SET loyalty_override = ? WHERE id = ?', [$card, $t['id']]);
            else fail('admin.errors.invalid');
            $after = q1('SELECT * FROM users WHERE id = ?', [$t['id']]);
            if (card_rank(effective_card($after)) > card_rank($before['card'])) notify($t['id'], 'loyaltyUp', ['card' => effective_card($after), 'name' => cards_all()[effective_card($after)]['name']]);
            audit_log($me, 'loyalty.card', $t['id'], null, $t['id'], $before, ['card' => effective_card($after), 'floor' => $after['loyalty_floor'], 'override' => $after['loyalty_override']], $r);
            return ['ok' => true];
        }
        case 'updateCard': {
            require_user_perm($me, 'loyalty.manage');
            $r = adm_reason($a['reason'] ?? '');
            $slug = (string) ($a['slug'] ?? '');
            $c = cards_all()[$slug] ?? null;
            if (!$c) fail('admin.errors.invalid');
            $p = is_array($a['patch'] ?? null) ? $a['patch'] : [];
            $next = [
                'name' => isset($p['name']) ? v_str($p['name'], 2, 24) : $c['name'],
                'xp_required' => $slug === 'none' ? 0 : (isset($p['xpRequired']) ? v_int($p['xpRequired'], 1, 1000000000) : (int) $c['xp_required']),
                'max_bet_ac' => isset($p['maxBetAC']) ? v_num($p['maxBetAC'], 1, 100000000) : (float) $c['max_bet_ac'],
                'max_bet_ag' => isset($p['maxBetAG']) ? v_num($p['maxBetAG'], 1, 1000000) : (float) $c['max_bet_ag'],
                'color' => isset($p['color']) ? v_color($p['color']) : $c['color'],
                'benefits' => isset($p['benefits']) ? v_list($p['benefits']) : jdec($c['benefits'], []),
                'perks' => array_replace(card_perks($slug), is_array($p['perks'] ?? null) ? [
                    'dailyAc' => v_int($p['perks']['dailyAc'] ?? 0, 0, 100000000), 'dailyAg' => v_int($p['perks']['dailyAg'] ?? 0, 0, 100000),
                    'convertPct' => v_int($p['perks']['convertPct'] ?? 0, 0, 10000), 'shopDiscount' => v_int($p['perks']['shopDiscount'] ?? 0, 0, 90),
                    'lxpPct' => v_int($p['perks']['lxpPct'] ?? 0, 0, 500),
                ] : []),
            ];
            // XP thresholds must keep the card order.
            foreach (cards_all() as $o) {
                if ($o['slug'] === $slug) continue;
                if (((int) $o['rank'] < (int) $c['rank'] && (int) $o['xp_required'] >= $next['xp_required'] && $slug !== 'none')
                    || ((int) $o['rank'] > (int) $c['rank'] && (int) $o['xp_required'] <= $next['xp_required'])) fail('admin.errors.cardOrder');
            }
            q('UPDATE loyalty_cards SET name = ?, xp_required = ?, max_bet_ac = ?, max_bet_ag = ?, unlock_ac = NULL, unlock_ag = NULL, color = ?, benefits = ?::jsonb, perks = ?::jsonb, updated_at = now() WHERE slug = ?',
                [$next['name'], $next['xp_required'], (string) $next['max_bet_ac'], (string) $next['max_bet_ag'], $next['color'], jenc($next['benefits']), jenc($next['perks']), $slug]);
            $GLOBALS['NEON_CARDS_DIRTY'] = true;
            audit_log($me, 'loyalty.cardConfig', null, $c['name'], $slug, card_view($c), $next, $r);
            return ['ok' => true];
        }

        // ── Player roles ──
        case 'setPlayerRole': {
            require_user_perm($me, 'playerroles.manage');
            $r = adm_reason($a['reason'] ?? '');
            $t = target_user((string) ($a['userId'] ?? ''));
            $role = $a['role'] ?? null;
            if ($role !== null && !isset(roles_all()[$role])) fail('admin.errors.invalid');
            q('UPDATE users SET player_role = ? WHERE id = ?', [$role, $t['id']]);
            audit_log($me, 'playerRole.assign', $t['id'], null, $t['id'], $t['player_role'], $role, $r);
            return ['ok' => true];
        }
        case 'upsertPlayerRole': {
            require_user_perm($me, 'playerroles.manage');
            $r = adm_reason($a['reason'] ?? '');
            $x = is_array($a['role'] ?? null) ? $a['role'] : [];
            $slug = v_slug($x['slug'] ?? '', 24);
            $b = is_array($x['benefits'] ?? null) ? $x['benefits'] : [];
            $benefits = ['dailyBonusPct' => v_num($b['dailyBonusPct'] ?? 0, 0, 100), 'perks' => v_list($b['perks'] ?? [])];
            $row = [$slug, v_str($x['name'] ?? '', 2, 24), v_int($x['rank'] ?? 0, 0, 99), v_str($x['icon'] ?? 'sparkles', 2, 24), v_color($x['color'] ?? ''), v_int($x['minLevel'] ?? 1, 1, 10000), jenc($benefits), !empty($x['active'])];
            $before = roles_all()[$slug] ?? null;
            q('INSERT INTO player_roles (slug, name, rank, icon, color, min_level, benefits, active) VALUES (?, ?, ?, ?, ?, ?, ?::jsonb, ?)
               ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, rank = EXCLUDED.rank, icon = EXCLUDED.icon, color = EXCLUDED.color, min_level = EXCLUDED.min_level, benefits = EXCLUDED.benefits, active = EXCLUDED.active', $row);
            $GLOBALS['NEON_ROLES_DIRTY'] = true;
            audit_log($me, $before ? 'playerRole.edit' : 'playerRole.create', null, $row[1], $slug, $before ? role_view($before) : null, $x, $r);
            return ['ok' => true];
        }
        case 'deletePlayerRole': {
            require_user_perm($me, 'playerroles.manage');
            $r = adm_reason($a['reason'] ?? '');
            $slug = (string) ($a['slug'] ?? '');
            $role = roles_all()[$slug] ?? null;
            if (!$role) fail('admin.errors.invalid');
            if (count(roles_all()) <= 1) fail('admin.errors.lastRole');
            q('UPDATE users SET player_role = NULL WHERE player_role = ?', [$slug]);
            q("UPDATE emotes SET unlock_type = 'free', unlock_value = NULL WHERE unlock_type = 'role' AND unlock_value = ?", [$slug]);
            q('DELETE FROM player_roles WHERE slug = ?', [$slug]);
            $GLOBALS['NEON_ROLES_DIRTY'] = true;
            $GLOBALS['NEON_EMOTES_DIRTY'] = true;
            audit_log($me, 'playerRole.delete', null, $role['name'], $slug, role_view($role), null, $r);
            return ['ok' => true];
        }

        // ── Shop ──
        case 'upsertShopItem': {
            require_user_perm($me, 'shop.manage');
            $r = adm_reason($a['reason'] ?? '');
            $x = is_array($a['item'] ?? null) ? $a['item'] : [];
            $id = v_slug($x['id'] ?? '');
            $kind = (string) ($x['kind'] ?? '');
            $category = (string) ($x['category'] ?? '');
            if (!in_array($kind, ['boost', 'emote', 'profileEffect', 'chatEffect', 'nameEffect', 'theme', 'badge', 'frame'], true)) fail('admin.errors.invalid');
            if (!in_array($category, ['boosts', 'emotes', 'profile-effects', 'chat-effects', 'name-effects', 'themes', 'badges', 'cosmetics', 'loyalty', 'limited', 'event'], true)) fail('admin.errors.invalid');
            $effect = [];
            if ($kind === 'boost') {
                $e = is_array($x['effect'] ?? null) ? $x['effect'] : [];
                $type = (string) ($e['type'] ?? '');
                if (!in_array($type, ['xp', 'lxp', 'daily'], true)) fail('admin.errors.invalid');
                $effect = ['type' => $type, 'mult' => v_num($e['mult'] ?? 1.5, 1.01, 5)] + ($type === 'daily' ? ['uses' => v_int($e['uses'] ?? 1, 1, 30)] : ['minutes' => v_int($e['minutes'] ?? 60, 1, 1440)]);
            }
            if ($kind === 'emote') {
                $code = (string) ($x['effect']['emote'] ?? '');
                if (!isset(emotes_all()[$code])) fail('admin.errors.emote');
                $effect = ['emote' => $code];
            }
            $req = is_array($x['requires'] ?? null) ? $x['requires'] : [];
            $requires = [];
            if (!empty($req['card'])) { if (!isset(cards_all()[$req['card']])) fail('admin.errors.invalid'); $requires['card'] = $req['card']; }
            if (!empty($req['membership'])) { if (!in_array($req['membership'], ['vip', 'vvip'], true)) fail('admin.errors.invalid'); $requires['membership'] = $req['membership']; }
            $rarity = (string) ($x['rarity'] ?? 'common');
            if (!in_array($rarity, ['common', 'rare', 'epic', 'legendary'], true)) fail('admin.errors.invalid');
            $stock = ($x['stock'] ?? null) === null || $x['stock'] === '' ? null : v_int($x['stock'], 0, 1000000);
            $row = [$id, $category, $kind, v_str($x['name'] ?? '', 2, 40), v_str($x['description'] ?? '', 0, 200), (string) v_num($x['price'] ?? -1, 0, 1000000), $rarity,
                !empty($x['repeatable']), !array_key_exists('active', $x) || !empty($x['active']), v_ts($x['availableFrom'] ?? null), v_ts($x['availableUntil'] ?? null), $stock,
                jenc((object) $requires), jenc((object) ($kind === 'boost' || $kind === 'emote' ? (array) ($x['style'] ?? []) : v_style($x['style'] ?? [], $kind))), jenc((object) $effect), v_int($x['sort'] ?? 0, -1000, 100000)];
            if ($kind === 'boost' || $kind === 'emote') {
                $st = is_array($x['style'] ?? null) ? $x['style'] : [];
                $row[13] = jenc((object) array_filter(['glyph' => isset($st['glyph']) ? mb_substr((string) $st['glyph'], 0, 4) : null, 'color' => !empty($st['color']) ? v_color($st['color']) : null]));
            }
            $before = shop_items_all()[$id] ?? null;
            q('INSERT INTO shop_items (id, category, kind, name, description, price_ag, rarity, repeatable, active, available_from, available_until, stock, requires, style, effect, sort)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?::jsonb, ?)
               ON CONFLICT (id) DO UPDATE SET category = EXCLUDED.category, kind = EXCLUDED.kind, name = EXCLUDED.name, description = EXCLUDED.description, price_ag = EXCLUDED.price_ag,
                 rarity = EXCLUDED.rarity, repeatable = EXCLUDED.repeatable, active = EXCLUDED.active, available_from = EXCLUDED.available_from, available_until = EXCLUDED.available_until,
                 stock = EXCLUDED.stock, requires = EXCLUDED.requires, style = EXCLUDED.style, effect = EXCLUDED.effect, sort = EXCLUDED.sort, updated_at = now()', $row);
            $GLOBALS['NEON_SHOP_DIRTY'] = true;
            audit_log($me, $before ? 'shop.edit' : 'shop.create', null, $row[3], $id, $before ? shop_item_view($before) : null, $x, $r);
            return ['ok' => true];
        }
        case 'setShopItemActive': {
            require_user_perm($me, 'shop.manage');
            $r = adm_reason($a['reason'] ?? '');
            $item = shop_items_all()[(string) ($a['id'] ?? '')] ?? null;
            if (!$item) fail('admin.errors.invalid');
            q('UPDATE shop_items SET active = ?, updated_at = now() WHERE id = ?', [!empty($a['active']), $item['id']]);
            $GLOBALS['NEON_SHOP_DIRTY'] = true;
            audit_log($me, !empty($a['active']) ? 'shop.enable' : 'shop.disable', null, $item['name'], $item['id'], (bool) $item['active'], !empty($a['active']), $r);
            return ['ok' => true];
        }
        case 'grantItem': {
            require_user_perm($me, 'shop.manage');
            $r = adm_reason($a['reason'] ?? '');
            $t = target_user((string) ($a['userId'] ?? ''));
            $item = shop_items_all()[(string) ($a['itemId'] ?? '')] ?? null;
            if (!$item) fail('admin.errors.invalid');
            $qty = v_int($a['qty'] ?? 1, -1000, 1000);
            if ($qty === 0) fail('admin.errors.invalid');
            q("INSERT INTO shop_inventory (user_id, item_id, qty, source) VALUES (?, ?, GREATEST(0, ?), 'admin') ON CONFLICT (user_id, item_id) DO UPDATE SET qty = GREATEST(0, shop_inventory.qty + ?)", [$t['id'], $item['id'], $qty, $qty]);
            audit_log($me, $qty > 0 ? 'item.grant' : 'item.revoke', $t['id'], $item['name'], $item['id'], null, $qty, $r);
            return ['ok' => true];
        }

        // ── Emotes ──
        case 'upsertEmote': {
            require_user_perm($me, 'emotes.manage');
            $r = adm_reason($a['reason'] ?? '');
            $x = is_array($a['emote'] ?? null) ? $a['emote'] : [];
            $code = strtolower(trim((string) ($x['code'] ?? '')));
            if (!preg_match('/^[a-z]{2,12}$/', $code)) fail('admin.errors.emoteCode');
            $type = (string) ($x['unlockType'] ?? 'free');
            if (!in_array($type, ['free', 'shop', 'item', 'card', 'vip', 'vvip', 'level', 'role'], true)) fail('admin.errors.invalid');
            $val = trim((string) ($x['unlockValue'] ?? '')) ?: null;
            if ($type === 'card' && !isset(cards_all()[(string) $val])) fail('admin.errors.invalid');
            if ($type === 'role' && !isset(roles_all()[(string) $val])) fail('admin.errors.invalid');
            if ($type === 'level') $val = (string) v_int($val, 1, 10000);
            if ($type === 'shop' && !isset(shop_items_all()[(string) $val])) fail('admin.errors.invalid');
            if (in_array($type, ['free', 'vip', 'vvip'], true)) $val = null;
            $cat = (string) ($x['category'] ?? 'general');
            $rarity = (string) ($x['rarity'] ?? 'common');
            $anim = (string) ($x['anim'] ?? 'none');
            if (!in_array($cat, ['general', 'reactions', 'funny', 'rare', 'loyalty', 'vip', 'vvip', 'events'], true) || !in_array($rarity, ['common', 'rare', 'epic', 'legendary'], true)
                || !in_array($anim, ['none', 'bounce', 'pulse', 'wiggle', 'spin', 'float', 'shine'], true)) fail('admin.errors.invalid');
            $row = [$code, v_str($x['glyph'] ?? '', 1, 16), v_str($x['name'] ?? '', 2, 24), $cat, $rarity, $type, $val, $anim, !array_key_exists('active', $x) || !empty($x['active']), v_int($x['sort'] ?? 0, -1000, 100000)];
            $before = emotes_all()[$code] ?? null;
            q('INSERT INTO emotes (code, glyph, name, category, rarity, unlock_type, unlock_value, anim, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (code) DO UPDATE SET glyph = EXCLUDED.glyph, name = EXCLUDED.name, category = EXCLUDED.category, rarity = EXCLUDED.rarity, unlock_type = EXCLUDED.unlock_type,
                 unlock_value = EXCLUDED.unlock_value, anim = EXCLUDED.anim, active = EXCLUDED.active, sort = EXCLUDED.sort', $row);
            $GLOBALS['NEON_EMOTES_DIRTY'] = true;
            audit_log($me, $before ? 'emote.edit' : 'emote.create', null, ':' . $code . ':', $code, $before ? emote_view($before) : null, $x, $r);
            return ['ok' => true];
        }

        // ── Missions ──
        case 'upsertMission': {
            require_user_perm($me, 'rewards.manage');
            $r = adm_reason($a['reason'] ?? '');
            $x = is_array($a['mission'] ?? null) ? $a['mission'] : [];
            $id = v_slug($x['id'] ?? '');
            $link = trim((string) ($x['link'] ?? ''));
            if ($link !== '' && !preg_match('#^https://[^\s<>"]{4,290}$#', $link)) fail('admin.errors.link');
            $row = [$id, v_str($x['title'] ?? '', 3, 60), v_str($x['description'] ?? '', 0, 300), trim((string) ($x['gameName'] ?? '')) ?: null, $link ?: null,
                (string) v_num($x['rewardAC'] ?? 0, 0, 100000000), (string) v_num($x['rewardAG'] ?? 0, 0, 100000), v_int($x['rewardLXP'] ?? 0, 0, 1000000),
                !empty($x['repeatable']), v_int($x['cooldownHours'] ?? 24, 0, 8760), ($x['maxClaims'] ?? null) === null || $x['maxClaims'] === '' ? null : v_int($x['maxClaims'], 1, 100000),
                !array_key_exists('active', $x) || !empty($x['active']), v_int($x['sort'] ?? 0, -1000, 100000)];
            $before = q1('SELECT * FROM reward_missions WHERE id = ?', [$id]);
            q('INSERT INTO reward_missions (id, title, description, game_name, link, reward_ac, reward_ag, reward_lxp, repeatable, cooldown_hours, max_claims, active, sort)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description, game_name = EXCLUDED.game_name, link = EXCLUDED.link, reward_ac = EXCLUDED.reward_ac,
                 reward_ag = EXCLUDED.reward_ag, reward_lxp = EXCLUDED.reward_lxp, repeatable = EXCLUDED.repeatable, cooldown_hours = EXCLUDED.cooldown_hours, max_claims = EXCLUDED.max_claims,
                 active = EXCLUDED.active, sort = EXCLUDED.sort', $row);
            audit_log($me, $before ? 'mission.edit' : 'mission.create', null, $row[1], $id, $before ? mission_view($before) : null, $x, $r);
            return ['ok' => true];
        }
        case 'reviewClaim':
            return mission_review($me, (string) ($a['claimId'] ?? ''), !empty($a['approve']), trim((string) ($a['note'] ?? '')));

        // ── Memberships ──
        case 'setMembership': {
            require_user_perm($me, 'memberships.manage');
            $r = adm_reason($a['reason'] ?? '');
            $t = target_user((string) ($a['userId'] ?? ''));
            $tier = $a['tier'] ?? null;
            return membership_set($me, $t['id'], $tier === null || $tier === '' ? null : (string) $tier, (int) ($a['days'] ?? 30), $r);
        }
        case 'setManager': {
            require_user_perm($me, 'memberships.manage');
            $t = target_user((string) ($a['userId'] ?? ''));
            $mid = (string) ($a['managerId'] ?? '');
            $m = q1('SELECT id, manager_id FROM memberships WHERE user_id = ? AND active', [$t['id']]);
            if (!$m) fail('perks.errors.members');
            $manager = $mid === '' ? null : q1("SELECT id, username, role FROM users WHERE id = ? AND role <> 'user'", [$mid]);
            if ($mid !== '' && !$manager) fail('admin.errors.invalid');
            q('UPDATE memberships SET manager_id = ? WHERE id = ?', [$manager['id'] ?? null, $m['id']]);
            if ($manager) notify($t['id'], 'announcement', ['title' => 'Your private manager', 'message' => '@' . $manager['username'] . ' is now your private manager.']);
            audit_log($me, 'membership.manager', $t['id'], null, $m['id'], $m['manager_id'], $manager['id'] ?? null, adm_reason($a['reason'] ?? ''));
            return ['ok' => true];
        }
        case 'grantPass': {
            require_user_perm($me, 'memberships.manage');
            $t = target_user((string) ($a['userId'] ?? ''));
            $season = current_season(now_ms());
            q("INSERT INTO season_passes (user_id, season_id, source) VALUES (?, ?, 'admin') ON CONFLICT DO NOTHING", [$t['id'], $season['id']]);
            audit_log($me, 'pass.grant', $t['id'], null, (string) $season['id'], null, ['season' => $season['id']], adm_reason($a['reason'] ?? ''));
            return ['ok' => true];
        }
        case 'setMembershipConfig': {
            require_user_perm($me, 'memberships.manage');
            $r = adm_reason($a['reason'] ?? '');
            $before = kv_get('memberships');
            $next = [];
            foreach (['vip', 'vvip'] as $tier) {
                $x = is_array($a[$tier] ?? null) ? $a[$tier] : [];
                $next[$tier] = ['price' => v_int($x['price'] ?? 0, 0, 100000000), 'days' => v_int($x['days'] ?? 30, 1, 3650), 'benefits' => v_list($x['benefits'] ?? [], 16)];
            }
            kv_set('memberships', $next);
            audit_log($me, 'membership.config', null, 'VIP / VVIP', 'memberships', $before, $next, $r);
            return ['ok' => true];
        }

        // ── Chat moderation ──
        case 'setModeration': {
            require_user_perm($me, 'moderation.config');
            $r = adm_reason($a['reason'] ?? '');
            $level = (string) ($a['level'] ?? '');
            if (!in_array($level, ['relaxed', 'standard', 'strict'], true)) fail('admin.errors.invalid');
            $before = kv_get('moderation');
            $next = ['level' => $level, 'autoMute' => !empty($a['autoMute']), 'autoMuteStrikes' => v_int($a['autoMuteStrikes'] ?? 3, 2, 20),
                'autoMuteMinutes' => v_int($a['autoMuteMinutes'] ?? 10, 1, 1440), 'repeatLimit' => v_int($a['repeatLimit'] ?? 8, 4, 30)];
            kv_set('moderation', $next);
            audit_log($me, 'moderation.config', null, 'Chat moderation', 'moderation', $before, $next, $r);
            return ['ok' => true];
        }
        case 'addTerm': {
            require_user_perm($me, 'moderation.config');
            $term = strtolower(trim((string) ($a['term'] ?? '')));
            if (!preg_match('/^[a-z]{2,40}$/', $term)) fail('admin.errors.term');
            $sev = v_int($a['severity'] ?? 2, 1, 3);
            $match = (string) ($a['match'] ?? 'word');
            if (!in_array($match, ['word', 'prefix', 'contains'], true)) fail('admin.errors.invalid');
            q('INSERT INTO chat_terms (term, severity, match, created_by) VALUES (?, ?, ?, ?) ON CONFLICT (term) DO UPDATE SET severity = EXCLUDED.severity, match = EXCLUDED.match', [$term, $sev, $match, $me['id']]);
            $GLOBALS['NEON_TERMS_DIRTY'] = true;
            audit_log($me, 'moderation.term', null, $term, $term, null, ['severity' => $sev, 'match' => $match], '—');
            return ['ok' => true];
        }
        case 'removeTerm': {
            require_user_perm($me, 'moderation.config');
            $term = (string) ($a['term'] ?? '');
            if (!qv('DELETE FROM chat_terms WHERE term = ? RETURNING term', [$term])) fail('admin.errors.invalid');
            $GLOBALS['NEON_TERMS_DIRTY'] = true;
            audit_log($me, 'moderation.termRemove', null, $term, $term, null, null, '—');
            return ['ok' => true];
        }
    }
    return null;
}
