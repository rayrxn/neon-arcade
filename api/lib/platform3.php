<?php
// Platform v3: membership & loyalty perks, battle pass, global Crash, profile banners, live results, P&L stats.
declare(strict_types=1);

// ───────────────────────────── Membership perks ─────────────────────────────

/**
 * What VIP / VVIP actually give. Game outcomes stay provably fair — perks are bonuses, limits and comfort.
 * VVIP includes everything VIP has.
 */
const MEMBER_PERKS = [
    'vip' => [
        'dailyAc' => 20000, 'dailyAg' => 1, 'weeklyAc' => 100000, 'weeklyAg' => 5, 'monthlyAc' => 300000, 'monthlyAg' => 15,
        'betPct' => 20, 'convertMult' => 2, 'shopDiscount' => 10, 'cardFloor' => 'gold',
        'onceAc' => 150000, 'onceAg' => 20, 'statsDays' => 30,
        'endless' => false, 'highlight' => false, 'affix' => false, 'manager' => false, 'pass' => false, 'room' => true, 'priority' => true,
    ],
    'vvip' => [
        'dailyAc' => 75000, 'dailyAg' => 3, 'weeklyAc' => 375000, 'weeklyAg' => 15, 'monthlyAc' => 1125000, 'monthlyAg' => 45,
        'betPct' => 50, 'convertMult' => 4, 'shopDiscount' => 20, 'cardFloor' => 'platinum',
        'onceAc' => 750000, 'onceAg' => 75, 'statsDays' => 90,
        'endless' => true, 'highlight' => true, 'affix' => true, 'manager' => true, 'pass' => true, 'room' => true, 'priority' => true,
    ],
];
const ENDLESS_ROUNDS = 30;          // VVIP endless quest: every 30 rounds…
const ENDLESS_REWARD_AC = 25000;    // …pays 25,000 AC
const ENDLESS_REWARD_LXP = 100;     // …and 100 Loyalty XP

function member_tier(string $userId): ?string
{
    return $userId === '' ? null : (memberships_map()[$userId]['tier'] ?? null);
}

function member_perk(string $userId, string $key, $default)
{
    $tier = member_tier($userId);
    return $tier ? (MEMBER_PERKS[$tier][$key] ?? $default) : $default;
}

function member_card_floor(string $userId): ?string
{
    return member_perk($userId, 'cardFloor', null);
}

function card_perks(string $slug): array
{
    $c = cards_all()[$slug] ?? null;
    return array_replace(['dailyAc' => 0, 'dailyAg' => 0, 'weeklyAc' => 0, 'weeklyAg' => 0, 'monthlyAc' => 0, 'monthlyAg' => 0, 'convertPct' => 0, 'shopDiscount' => 0, 'lxpPct' => 0, 'xpPct' => 0, 'onceTier' => null, 'onceDays' => 0], $c ? jdec($c['perks'] ?? null, []) : []);
}

/**
 * Give a membership as a reward (loyalty card, battle pass). Never shortens what the player already has:
 * same or higher tier active → extend it; lower tier active → upgrade and carry the remaining days over.
 */
function membership_grant(string $userId, string $tier, int $days, string $note): array
{
    if (!in_array($tier, ['vip', 'vvip'], true) || $days < 1) fail('errors.invalidRequest');
    $cur = q1('SELECT * FROM memberships WHERE user_id = ? AND active AND (ends_at IS NULL OR ends_at > now()) FOR UPDATE', [$userId]);
    if ($cur && tier_rank($cur['tier']) >= tier_rank($tier)) {
        if ($cur['ends_at'] !== null) q('UPDATE memberships SET ends_at = ends_at + make_interval(days => ?) WHERE id = ?', [$days, $cur['id']]);
        $result = ['tier' => $cur['tier'], 'days' => $days, 'extended' => true];
    } else {
        $carry = $cur && $cur['ends_at'] !== null ? max(0, strtotime((string) $cur['ends_at']) - time()) : 0;
        q('UPDATE memberships SET active = FALSE WHERE user_id = ? AND active', [$userId]);
        q("INSERT INTO memberships (user_id, tier, ends_at, note) VALUES (?, ?, now() + make_interval(days => ?) + make_interval(secs => ?), ?)", [$userId, $tier, $days, $carry, mb_substr($note, 0, 200)]);
        $result = ['tier' => $tier, 'days' => $days, 'extended' => false];
    }
    $GLOBALS['NEON_MEMBERSHIPS_DIRTY'] = true;
    notify($userId, 'membership', ['tier' => $result['tier'], 'days' => $days, 'reward' => $note]);
    log_event('MEMBERSHIP_REWARD', $userId, $result + ['note' => $note]);
    return $result;
}

/** Cards reached with Loyalty XP whose one-time membership reward hasn't been given yet. */
function card_once_due(array $u): array
{
    $xpRank = card_rank(card_for_xp((int) ($u['loyalty_xp'] ?? 0)));
    $due = [];
    foreach (cards_all() as $slug => $c) {
        if ((int) $c['rank'] > $xpRank) continue;
        $cp = card_perks($slug);
        if (empty($cp['onceTier']) || (int) $cp['onceDays'] < 1) continue;
        if (!perk_claimed($u['id'], 'card_once', $slug)) $due[] = ['card' => $slug, 'name' => $c['name'], 'tier' => $cp['onceTier'], 'days' => (int) $cp['onceDays']];
    }
    return $due;
}

/** Hand out every due card reward (called when a card is reached, and from the Loyalty page). */
function card_once_grant_all(string $userId): array
{
    $u = q1('SELECT * FROM users WHERE id = ?', [$userId]);
    if (!$u) return [];
    $out = [];
    foreach (card_once_due($u) as $d) {
        q('INSERT INTO perk_claims (user_id, kind, period) VALUES (?, ?, ?) ON CONFLICT DO NOTHING', [$userId, 'card_once', $d['card']]);
        $out[] = $d + membership_grant($userId, $d['tier'], $d['days'], $d['name'] . ' card reward');
    }
    return $out;
}

function shop_discount_of(array $u): int
{
    return (int) max(card_perks(effective_card($u))['shopDiscount'], member_perk($u['id'], 'shopDiscount', 0));
}

function convert_cap(array $u): int
{
    $base = (int) kv_get('economy')['convertMaxAgPerDay'];
    $card = card_perks(effective_card($u))['convertPct'];
    return (int) floor($base * (1 + $card / 100) * member_perk($u['id'], 'convertMult', 1));
}

function perk_claimed(string $userId, string $kind, string $period): bool
{
    return (bool) qv('SELECT 1 FROM perk_claims WHERE user_id = ? AND kind = ? AND period = ?', [$userId, $kind, $period]);
}

/** Claimable bonuses for the Membership / Loyalty pages. */
function perks_view(array $u, array $meta): array
{
    $now = now_ms();
    $id = $u['id'];
    $tier = member_tier($id);
    $card = effective_card($u);
    $cp = card_perks($card);
    $m = $tier ? q1('SELECT m.id, m.manager_id, mu.username AS manager_name, mu.display_name AS manager_display FROM memberships m LEFT JOIN users mu ON mu.id = m.manager_id WHERE m.user_id = ? AND m.active', [$id]) : null;
    $games = (int) qv('SELECT games FROM user_progress WHERE user_id = ?', [$id]);
    $endlessBase = (int) ($meta['endlessBase'] ?? -1);
    return [
        'tier' => $tier,
        'perks' => $tier ? MEMBER_PERKS[$tier] : null,
        'card' => [
            'slug' => $card, 'dailyAc' => (float) $cp['dailyAc'], 'dailyAg' => (float) $cp['dailyAg'], 'claimed' => perk_claimed($id, 'card_daily', day_key($now)),
            'weeklyAc' => (float) $cp['weeklyAc'], 'weeklyAg' => (float) $cp['weeklyAg'], 'weeklyClaimed' => perk_claimed($id, 'card_weekly', week_key($now)),
            'monthlyAc' => (float) $cp['monthlyAc'], 'monthlyAg' => (float) $cp['monthlyAg'], 'monthlyClaimed' => perk_claimed($id, 'card_monthly', month_key($now)),
            'xpPct' => (int) $cp['xpPct'], 'lxpPct' => (int) $cp['lxpPct'], 'onceDue' => card_once_due($u),
        ],
        // VVIP includes VIP: its VIP daily / weekly / welcome bonuses can be claimed too.
        'vipIncluded' => $tier === 'vvip' ? [
            'perks' => MEMBER_PERKS['vip'],
            'daily' => ['claimed' => perk_claimed($id, 'member_daily', 'vip:' . day_key($now))],
            'weekly' => ['claimed' => perk_claimed($id, 'member_weekly', 'vip:' . week_key($now))],
            'monthly' => ['claimed' => perk_claimed($id, 'member_monthly', 'vip:' . month_key($now))],
            'once' => $m ? ['claimed' => perk_claimed($id, 'member_once', 'vip:' . $m['id'])] : null,
        ] : null,
        'daily' => $tier ? ['claimed' => perk_claimed($id, 'member_daily', day_key($now))] : null,
        'weekly' => $tier ? ['claimed' => perk_claimed($id, 'member_weekly', week_key($now))] : null,
        'monthly' => $tier ? ['claimed' => perk_claimed($id, 'member_monthly', month_key($now))] : null,
        'once' => $m ? ['claimed' => perk_claimed($id, 'member_once', $m['id'])] : null,
        'endless' => $tier && MEMBER_PERKS[$tier]['endless']
            ? ['progress' => $endlessBase < 0 ? 0 : max(0, $games - $endlessBase), 'need' => ENDLESS_ROUNDS, 'started' => $endlessBase >= 0, 'rewardAc' => ENDLESS_REWARD_AC, 'rewardLxp' => ENDLESS_REWARD_LXP]
            : null,
        'manager' => $m && $m['manager_id'] ? ['id' => $m['manager_id'], 'username' => $m['manager_name'], 'displayName' => $m['manager_display']] : null,
        'shopDiscount' => shop_discount_of($u),
        'statsDays' => (int) member_perk($id, 'statsDays', 7),
    ];
}

/** Claim a bonus: card_daily, card_weekly, card_once, member_daily, member_weekly, member_once, endless. */
function perk_claim(array $me, string $kind, ?string $asTier = null): array
{
    $now = now_ms();
    $u = q1('SELECT * FROM users WHERE id = ? FOR UPDATE', [$me['id']]);
    if ($u['wallet_frozen']) fail('errors.walletFrozen');
    $tier = member_tier($u['id']);
    $ac = 0.0;
    $ag = 0.0;
    $lxp = 0;
    switch ($kind) {
        case 'card_daily':
            $cp = card_perks(effective_card($u));
            if ($cp['dailyAc'] <= 0 && $cp['dailyAg'] <= 0) fail('perks.errors.none');
            $period = day_key($now);
            [$ac, $ag] = [(float) $cp['dailyAc'], (float) $cp['dailyAg']];
            break;
        case 'card_weekly':
            $cp = card_perks(effective_card($u));
            if ($cp['weeklyAc'] <= 0 && $cp['weeklyAg'] <= 0) fail('perks.errors.none');
            $period = week_key($now);
            [$ac, $ag] = [(float) $cp['weeklyAc'], (float) $cp['weeklyAg']];
            break;
        case 'card_monthly':
            $cp = card_perks(effective_card($u));
            if ($cp['monthlyAc'] <= 0 && $cp['monthlyAg'] <= 0) fail('perks.errors.none');
            $period = month_key($now);
            [$ac, $ag] = [(float) $cp['monthlyAc'], (float) $cp['monthlyAg']];
            break;
        case 'card_once':
            $granted = card_once_grant_all($u['id']);
            if (!$granted) fail('perks.errors.nothing');
            return ['kind' => $kind, 'memberships' => $granted, 'ac' => 0, 'ag' => 0, 'lxp' => 0];
        case 'member_daily':
        case 'member_weekly':
        case 'member_monthly':
        case 'member_once':
            if (!$tier) fail('perks.errors.members');
            // A VVIP member also has VIP active: the VIP bonuses are separate claims ("vip:" periods).
            $use = $asTier ?: $tier;
            if (!isset(MEMBER_PERKS[$use]) || tier_rank($use) > tier_rank($tier)) fail('perks.errors.members');
            $prefix = $use !== $tier ? $use . ':' : '';
            if ($kind === 'member_once') {
                $period = $prefix . (string) qv('SELECT id FROM memberships WHERE user_id = ? AND active', [$u['id']]);
                [$ac, $ag] = [(float) MEMBER_PERKS[$use]['onceAc'], (float) MEMBER_PERKS[$use]['onceAg']];
            } else {
                $span = ['member_daily' => 'daily', 'member_weekly' => 'weekly', 'member_monthly' => 'monthly'][$kind];
                $period = $prefix . ($span === 'monthly' ? month_key($now) : ($span === 'weekly' ? week_key($now) : day_key($now)));
                [$ac, $ag] = [(float) MEMBER_PERKS[$use][$span . 'Ac'], (float) MEMBER_PERKS[$use][$span . 'Ag']];
            }
            $tier = $use;
            break;
        case 'endless':
            if (!$tier || !MEMBER_PERKS[$tier]['endless']) fail('perks.errors.vvip');
            [$p, $meta] = load_docs($u['id']);
            $games = (int) $p['stats']['games'];
            $base = (int) ($meta['endlessBase'] ?? -1);
            if ($base < 0) {
                // First visit starts the counter.
                $meta['endlessBase'] = $games;
                save_docs($u['id'], $p, $meta);
                return ['started' => true];
            }
            if ($games - $base < ENDLESS_ROUNDS) fail('perks.errors.notYet', ['left' => ENDLESS_ROUNDS - ($games - $base)]);
            $meta['endlessBase'] = $base + ENDLESS_ROUNDS;
            save_docs($u['id'], $p, $meta);
            $period = 'n' . $meta['endlessBase'];
            [$ac, $lxp] = [(float) ENDLESS_REWARD_AC, ENDLESS_REWARD_LXP];
            break;
        default:
            fail('errors.invalidRequest');
    }
    if (perk_claimed($u['id'], $kind, $period)) fail('perks.errors.claimed');
    q('INSERT INTO perk_claims (user_id, kind, period) VALUES (?, ?, ?)', [$u['id'], $kind, $period]);
    $label = ['card_daily' => 'Loyalty card daily bonus', 'card_weekly' => 'Loyalty card weekly bonus', 'card_monthly' => 'Loyalty card monthly bonus', 'member_monthly' => strtoupper((string) $tier) . ' monthly bonus', 'member_daily' => strtoupper((string) $tier) . ' daily bonus', 'member_weekly' => strtoupper((string) $tier) . ' weekly bonus', 'member_once' => strtoupper((string) $tier) . ' welcome reward', 'endless' => 'Endless quest'][$kind];
    if ($ac > 0) wallet_post($u['id'], 'AC', $ac, 'reward', 'perk', $kind, $label, null, "perk:$kind:$period:AC");
    if ($ag > 0) wallet_post($u['id'], 'AG', $ag, 'reward', 'perk', $kind, $label, null, "perk:$kind:$period:AG");
    if ($lxp > 0) add_loyalty_xp($u['id'], $lxp, 'perk', "$kind:$period");
    log_event('PERK_CLAIMED', $u['id'], ['kind' => $kind, 'ac' => $ac, 'ag' => $ag]);
    return ['kind' => $kind, 'ac' => num($ac), 'ag' => num($ag), 'lxp' => $lxp];
}

/** Words a player may not show around their name unless they hold that staff role (anti-impersonation). */
const AFFIX_RESERVED = [
    'owner' => ['super_admin'], 'master' => ['super_admin'], 'admin' => ['super_admin', 'admin'], 'staff' => ['super_admin', 'admin', 'moderator', 'support', 'developer'],
    'mod' => ['super_admin', 'admin', 'moderator'], 'moderator' => ['super_admin', 'admin', 'moderator'], 'helper' => ['super_admin', 'admin', 'support'], 'support' => ['super_admin', 'admin', 'support'],
    'tester' => ['super_admin', 'developer'], 'dev' => ['super_admin', 'developer'], 'developer' => ['super_admin', 'developer'], 'system' => [], 'console' => [], 'official' => ['super_admin'],
];

function can_affix(array $u): bool
{
    return member_tier($u['id']) === 'vvip' || is_staff_role($u['role']);
}

/** VVIP (and staff): custom prefix/suffix with formatting codes (&a…&f colors, &k &l &o &n &m &r). */
function set_name_affix(array $me, $prefix, $suffix): array
{
    if (!can_affix($me)) fail('perks.errors.vvip');
    $clean = function ($v) use ($me) {
        $v = trim((string) ($v ?? ''));
        if ($v === '') return null;
        $visible = trim(preg_replace('/&[0-9a-fk-or]/i', '', $v));
        if ($visible === '' || mb_strlen($visible) > 10 || mb_strlen($v) > 32) fail('perks.errors.affix');
        if (!preg_match('/^[\p{L}\p{N}\p{S}\p{P} ]+$/u', $v) || preg_match('/https?:|www\.|[<>]/i', $v)) fail('perks.errors.affix');
        $word = strtolower(preg_replace('/[^\p{L}\p{N}]+/u', '', $visible));
        foreach (AFFIX_RESERVED as $w => $roles) {
            if (str_contains($word, $w) && !in_array($me['role'], $roles, true)) fail('perks.errors.affixReserved', ['word' => strtoupper($w)]);
        }
        if (mod_check($visible)['action'] !== 'allow') fail('chat.errors.blocked');
        return $v;
    };
    $p = $clean($prefix);
    $s = $clean($suffix);
    q('UPDATE users SET name_prefix = ?, name_suffix = ? WHERE id = ?', [$p, $s, $me['id']]);
    return ['prefix' => $p, 'suffix' => $s];
}

/** Member contacts their private manager: a priority ticket assigned to the manager. */
function member_contact_manager(array $me, $text): array
{
    if (!member_perk($me['id'], 'manager', false)) fail('perks.errors.vvip');
    $m = q1('SELECT manager_id FROM memberships WHERE user_id = ? AND active', [$me['id']]);
    if (!$m || !$m['manager_id']) fail('perks.errors.noManager');
    $res = ticket_create($me, ['category' => 'account', 'subject' => 'VVIP · message for my manager', 'message' => (string) $text]);
    $tid = $res['id'] ?? null;
    if ($tid) q('UPDATE support_tickets SET assignee_id = ? WHERE id = ?', [$m['manager_id'], $tid]);
    if ($tid) notify($m['manager_id'], 'ticket', ['ticketId' => $tid, 'event' => 'manager']);
    return $res;
}

// ───────────────────────────── Profile banners ─────────────────────────────

function banners_map(): array
{
    if (!isset($GLOBALS['NEON_BANNERS']) || !empty($GLOBALS['NEON_BANNERS_DIRTY'])) {
        $GLOBALS['NEON_BANNERS'] = [];
        foreach (q('SELECT user_id, hash FROM user_banners')->fetchAll() as $r) $GLOBALS['NEON_BANNERS'][$r['user_id']] = $r['hash'];
        $GLOBALS['NEON_BANNERS_DIRTY'] = false;
    }
    return $GLOBALS['NEON_BANNERS'];
}

function banner_url(string $userId): ?string
{
    $h = banners_map()[$userId] ?? null;
    return $h ? "/api/banner/$userId?v=$h" : null;
}

/** Upload (data URL, JPEG/PNG/WebP ≤ 700 KB, at least 600×150) or remove (null) the profile banner. */
function banner_upload(array $me, $src): array
{
    if ($src === null || $src === '') {
        q('DELETE FROM user_banners WHERE user_id = ?', [$me['id']]);
        $GLOBALS['NEON_BANNERS_DIRTY'] = true;
        return ['bannerUrl' => null];
    }
    if (!is_string($src) || !preg_match('#^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$#', $src, $m)) fail('profile.errors.bannerType');
    $bin = base64_decode($m[2], true);
    if ($bin === false || strlen($bin) > 700000) fail('profile.errors.bannerSize');
    $info = @getimagesizefromstring($bin);
    $mime = $info['mime'] ?? '';
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp'], true)) fail('profile.errors.bannerType');
    if (($info[0] ?? 0) < 600 || ($info[1] ?? 0) < 150) fail('profile.errors.bannerSmall');
    $hash = substr(hash('sha256', $bin), 0, 16);
    $st = db()->prepare('INSERT INTO user_banners (user_id, mime, data, hash, updated_at) VALUES (?, ?, ?, ?, now())
        ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, hash = EXCLUDED.hash, updated_at = now()');
    $st->bindValue(1, $me['id']);
    $st->bindValue(2, $mime);
    $st->bindValue(3, $bin, PDO::PARAM_LOB);
    $st->bindValue(4, $hash);
    $st->execute();
    $GLOBALS['NEON_BANNERS_DIRTY'] = true;
    log_event('PROFILE_BANNER', $me['id'], ['bytes' => strlen($bin)]);
    return ['bannerUrl' => "/api/banner/{$me['id']}?v=$hash"];
}

/** Serve a banner image (public, cacheable). */
function banner_serve(string $userId): void
{
    $row = preg_match('/^[0-9a-f-]{36}$/', $userId) ? q1('SELECT mime, data, hash FROM user_banners WHERE user_id = ?', [$userId]) : null;
    $cli = headers_sent();
    if (!$row) {
        if (!$cli) { http_response_code(404); header('Cache-Control: no-store'); }
        return;
    }
    $data = is_resource($row['data']) ? stream_get_contents($row['data']) : $row['data'];
    if (!$cli) {
        header('Content-Type: ' . $row['mime']);
        header('Cache-Control: public, max-age=31536000, immutable');
        header('ETag: "' . $row['hash'] . '"');
        header('X-Content-Type-Options: nosniff');
    }
    echo $data;
}

// ───────────────────────────── Battle pass ─────────────────────────────

const PASS_TIERS = 50;
const PASS_PRICE_AG = 7500;

/** Reward table, the same every season. Free: odd tiers + every 10th. Premium: every tier, AG each tier. */
function pass_rewards(): array
{
    static $out = null;
    if ($out) return $out;
    $free = [];
    $prem = [];
    // Free track: something every tier, cosmetics along the way, VIP for 30 days at the end.
    $freeItems = [5 => 'feeling-lucky', 10 => 'pass-badge', 15 => 'double-daily', 20 => 'loyalty-rush', 25 => 'feeling-lucky', 30 => 'pass-theme', 35 => 'double-daily', 40 => 'mega-lucky', 45 => 'loyalty-rush'];
    // Premium track: AC + AG every tier, a boost or an exclusive cosmetic every few tiers, VVIP at the end.
    $premItems = [
        3 => 'feeling-lucky', 6 => 'loyalty-rush', 8 => 'double-daily', 12 => 'pass-frame', 15 => 'mega-lucky', 18 => 'triple-daily',
        21 => 'loyalty-overdrive', 24 => 'pass-name', 27 => 'mega-lucky', 30 => 'pass-chat', 33 => 'triple-daily', 36 => 'pass-fx',
        39 => 'loyalty-overdrive', 42 => 'mega-lucky', 45 => 'triple-daily', 48 => 'loyalty-overdrive',
    ];
    for ($t = 1; $t <= PASS_TIERS; $t++) {
        $f = [['kind' => 'AC', 'amount' => 10000 * $t]];
        if ($t % 5 === 0) $f[] = ['kind' => 'AG', 'amount' => $t / 5 * 3];
        if (isset($freeItems[$t])) $f[] = ['kind' => 'item', 'id' => $freeItems[$t]];
        if ($t === PASS_TIERS) $f = [['kind' => 'membership', 'tier' => 'vip', 'days' => 30], ['kind' => 'AC', 'amount' => 2500000], ['kind' => 'AG', 'amount' => 75]];
        $free[$t] = $f;
        $pr = [['kind' => 'AC', 'amount' => 60000 * $t], ['kind' => 'AG', 'amount' => 25 + 5 * $t]];
        if (isset($premItems[$t])) $pr[] = ['kind' => 'item', 'id' => $premItems[$t]];
        if ($t % 10 === 0) $pr[] = ['kind' => 'LXP', 'amount' => 2500 * ($t / 10)];
        if ($t === PASS_TIERS) $pr = [['kind' => 'membership', 'tier' => 'vvip', 'days' => 14], ['kind' => 'AC', 'amount' => 25000000], ['kind' => 'AG', 'amount' => 3000], ['kind' => 'item', 'id' => 'pass-crown'], ['kind' => 'LXP', 'amount' => 25000]];
        $prem[$t] = $pr;
    }
    return $out = ['free' => $free, 'premium' => $prem];
}

function pass_catalog(): array
{
    $r = pass_rewards();
    $rows = [];
    for ($t = 1; $t <= PASS_TIERS; $t++) $rows[] = ['tier' => $t, 'free' => $r['free'][$t] ?? [], 'premium' => $r['premium'][$t]];
    return ['tiers' => PASS_TIERS, 'xpPerTier' => SEASON_TIER_XP, 'price' => PASS_PRICE_AG, 'rewards' => $rows];
}

function pass_premium(string $userId, int $seasonId): bool
{
    if (member_perk($userId, 'pass', false)) return true;
    return (bool) qv('SELECT 1 FROM season_passes WHERE user_id = ? AND season_id = ?', [$userId, $seasonId]);
}

function pass_view(string $userId, array $p): array
{
    $now = now_ms();
    $season = current_season($now);
    $xp = ($p['season']['id'] ?? null) === $season['id'] ? (int) $p['season']['xp'] : 0;
    $claims = ($p['season']['id'] ?? null) === $season['id'] ? ($p['season']['pass'] ?? ['free' => [], 'premium' => []]) : ['free' => [], 'premium' => []];
    return [
        'seasonId' => $season['id'], 'startAt' => $season['startAt'], 'endAt' => $season['endAt'],
        'xp' => $xp, 'tier' => season_tier($xp), 'premium' => pass_premium($userId, (int) $season['id']),
        'viaVvip' => (bool) member_perk($userId, 'pass', false),
        'claimed' => ['free' => array_values($claims['free'] ?? []), 'premium' => array_values($claims['premium'] ?? [])],
    ];
}

function pass_buy(array $me): array
{
    $season = current_season(now_ms());
    if (pass_premium($me['id'], (int) $season['id'])) fail('pass.errors.owned');
    if (q1('SELECT 1 FROM users WHERE id = ? AND wallet_frozen', [$me['id']])) fail('errors.walletFrozen');
    $bal = (float) qv('SELECT ag_balance FROM wallets WHERE user_id = ? FOR UPDATE', [$me['id']]);
    if ($bal < PASS_PRICE_AG) fail('pass.errors.insufficient', ['missing' => number_format(PASS_PRICE_AG - $bal)]);
    wallet_post($me['id'], 'AG', -PASS_PRICE_AG, 'purchase', 'season', 'battle_pass', "Season {$season['id']} premium pass", null, "pass:{$season['id']}:" . $me['id']);
    q("INSERT INTO season_passes (user_id, season_id, source) VALUES (?, ?, 'ag')", [$me['id'], $season['id']]);
    log_event('PASS_PURCHASED', $me['id'], ['season' => $season['id']]);
    return ['seasonId' => $season['id'], 'premium' => true];
}

/** Claim one tier ('free' | 'premium'), or every unlocked unclaimed reward when $tier = 0. */
function pass_claim(array $me, string $track, int $tier): array
{
    $now = now_ms();
    $season = current_season($now);
    [$p, $meta] = load_docs($me['id']);
    if (($p['season']['id'] ?? null) !== $season['id']) $p['season'] = ['id' => $season['id'], 'xp' => 0, 'tiersClaimed' => []];
    $p['season']['pass'] ??= ['free' => [], 'premium' => []];
    $reached = season_tier((int) $p['season']['xp']);
    $premium = pass_premium($me['id'], (int) $season['id']);
    $rewards = pass_rewards();
    $todo = [];
    foreach ($track === 'all' ? ['free', 'premium'] : [$track] as $tr) {
        if (!in_array($tr, ['free', 'premium'], true)) fail('errors.invalidRequest');
        if ($tr === 'premium' && !$premium) {
            if ($track !== 'all') fail('pass.errors.premium');
            continue;
        }
        foreach ($tier > 0 ? [$tier] : range(1, PASS_TIERS) as $t) {
            if ($t < 1 || $t > PASS_TIERS || empty($rewards[$tr][$t])) {
                if ($tier > 0) fail('errors.invalidRequest');
                continue;
            }
            if ($t > $reached) {
                if ($tier > 0) fail('pass.errors.locked');
                continue;
            }
            if (in_array($t, $p['season']['pass'][$tr], true)) {
                if ($tier > 0) fail('pass.errors.claimed');
                continue;
            }
            $todo[] = [$tr, $t];
        }
    }
    if (!$todo) fail('pass.errors.nothing');
    $total = ['AC' => 0, 'AG' => 0, 'LXP' => 0, 'items' => [], 'memberships' => []];
    $grants = [];
    foreach ($todo as [$tr, $t]) {
        $p['season']['pass'][$tr][] = $t;
        foreach ($rewards[$tr][$t] as $r) {
            if ($r['kind'] === 'item') {
                q("INSERT INTO shop_inventory (user_id, item_id, qty, source) VALUES (?, ?, 1, 'season') ON CONFLICT (user_id, item_id) DO UPDATE SET qty = shop_inventory.qty + 1", [$me['id'], $r['id']]);
                $total['items'][] = $r['id'];
            } elseif ($r['kind'] === 'membership') {
                $grants[] = $r;
            } else {
                $total[$r['kind']] += $r['amount'];
            }
        }
    }
    $key = "pass:{$season['id']}:" . substr(hash('sha256', jenc($todo)), 0, 12);
    if ($total['AC'] > 0) wallet_post($me['id'], 'AC', $total['AC'], 'reward', 'season', 'battle_pass', "Season {$season['id']} pass rewards", null, "$key:AC");
    if ($total['AG'] > 0) wallet_post($me['id'], 'AG', $total['AG'], 'reward', 'season', 'battle_pass', "Season {$season['id']} pass rewards", null, "$key:AG");
    save_docs($me['id'], $p, $meta);
    // After the pass doc is saved: Loyalty XP and memberships load/write their own rows.
    if ($total['LXP'] > 0) add_loyalty_xp($me['id'], (int) $total['LXP'], 'season', "pass:{$season['id']}");
    foreach ($grants as $g) $total['memberships'][] = membership_grant($me['id'], $g['tier'], (int) $g['days'], "Season {$season['id']} battle pass");
    return ['claimed' => count($todo), 'ac' => num($total['AC']), 'ag' => num($total['AG']), 'lxp' => $total['LXP'], 'items' => $total['items'], 'memberships' => $total['memberships']];
}

// ───────────────────────────── Global Crash ─────────────────────────────

const CRASH_BET_MS = 7000;   // betting window before the rocket leaves
const CRASH_PAUSE_MS = 3000; // pause after a crash before the next betting window

function crash_round_point(string $seed, int $id): float
{
    $h = hash_hmac('sha256', "crash:$id", $seed);
    $f = hexdec(substr($h, 0, 13)) / 4503599627370496; // 16^13
    return crash_point_cfg($f);
}

/** Current round; finishes and settles the previous one and opens the next when it's time. */
function crash_current(int $now): array
{
    $r = q1('SELECT * FROM crash_rounds ORDER BY id DESC LIMIT 1');
    if ($r && $now < iso_to_ms($r['crash_at']) + CRASH_PAUSE_MS) return $r;
    q('SELECT pg_advisory_xact_lock(424242)');
    $r = q1('SELECT * FROM crash_rounds ORDER BY id DESC LIMIT 1');
    if ($r && $now < iso_to_ms($r['crash_at']) + CRASH_PAUSE_MS) return $r;
    if ($r && !$r['settled']) crash_settle((int) $r['id']);
    $seed = rand_hex(32);
    $id = (int) qv("SELECT nextval(pg_get_serial_sequence('crash_rounds', 'id'))");
    $point = crash_round_point($seed, $id);
    // Event round set by the Owner (Admin → Settings → Crash): fixed point, flagged as forced.
    $sched = kv_get('crash_sched');
    $forced = isset($sched['rounds'][(string) $id]);
    if ($forced) {
        $point = max(1.0, min(crash_cfg()['maxMult'], (float) $sched['rounds'][(string) $id]));
        unset($sched['rounds'][(string) $id]);
        kv_set('crash_sched', $sched);
    }
    $start = $now + CRASH_BET_MS;
    $crashAt = $start + (int) ceil(crash_time_of($point));
    q('INSERT INTO crash_rounds (id, server_seed, seed_hash, point, start_at, crash_at, forced) VALUES (?, ?, ?, ?, to_timestamp(? / 1000.0), to_timestamp(? / 1000.0), ?)',
        [$id, $seed, hash('sha256', $seed), (string) $point, $start, $crashAt, $forced ? 't' : 'f']);
    return q1('SELECT * FROM crash_rounds WHERE id = ?', [$id]);
}

/** Settle every bet still open in a finished round (auto cash-outs win, the rest lose). */
function crash_settle(int $roundId): void
{
    foreach (q("SELECT b.* FROM crash_bets b JOIN game_sessions s ON s.id = b.session_id WHERE b.round_id = ? AND s.status = 'OPEN'", [$roundId])->fetchAll() as $b) {
        $u = q1('SELECT * FROM users WHERE id = ?', [$b['user_id']]);
        [$p, $meta] = load_docs($b['user_id']);
        $c = new Ctx($u, $p, $meta, now_ms());
        crash_tick($c, ['id' => $b['session_id']]);
        save_docs($b['user_id'], $c->p, $c->meta);
    }
    q('UPDATE crash_rounds SET settled = TRUE WHERE id = ?', [$roundId]);
}

/** Record a cash-out / result of a global round bet (called from crash_tick / crash_cashout). */
function crash_mark(array $round, ?float $cashedAt, float $payout): void
{
    if (empty($round['globalRound'])) return;
    q('UPDATE crash_bets SET cashed_at = ?, payout = ? WHERE session_id = ?', [$cashedAt === null ? null : (string) $cashedAt, (string) $payout, $round['id']]);
}

function crash_bet(Ctx $c, array $a): array
{
    $r = crash_current($c->now);
    $start = iso_to_ms($r['start_at']);
    $auto = !empty($a['autoCashout']) ? floor(((float) $a['autoCashout']) * 100) / 100 : null;
    if ($auto !== null && !($auto >= CRASH_MIN_CASHOUT && $auto <= 10000)) fail('play.crash.minCashout', ['min' => number_format(CRASH_MIN_CASHOUT, 2)]);
    if ($c->now >= $start) fail('play.crash.betClosed');
    if (qv('SELECT 1 FROM crash_bets WHERE round_id = ? AND user_id = ?', [$r['id'], $c->user['id']])) fail('play.crash.alreadyIn');
    $round = begin($c, 'crash', $a['bet'] ?? null, 1, ['autoCashout' => $auto]);
    $round['startedAt'] = $start;
    $round['point'] = (float) $r['point'];
    $round['globalRound'] = (int) $r['id'];
    $round['proof']['serverSeedHash'] = $r['seed_hash'];
    save_open($round);
    q('INSERT INTO crash_bets (round_id, user_id, session_id, bet, currency, auto) VALUES (?, ?, ?, ?, ?::currency_code, ?)',
        [$r['id'], $c->user['id'], $round['id'], (string) $round['bet'], $round['currency'], $auto === null ? null : (string) $auto]);
    return ['id' => $round['id'], 'roundId' => (int) $r['id'], 'startedAt' => $start, 'autoCashout' => $auto, 'currency' => $round['currency'], 'bet' => $round['bet']];
}

/** Public state of the current round. The crash point and seed are only revealed after the crash. */
function crash_state(?array $me): array
{
    $now = now_ms();
    $r = crash_current($now);
    $start = iso_to_ms($r['start_at']);
    $crashAt = iso_to_ms($r['crash_at']);
    $crashed = $now >= $crashAt;
    $phase = $now < $start ? 'betting' : ($crashed ? 'crashed' : 'flying');
    $bets = array_map(fn($b) => [
        'userId' => $b['user_id'], 'username' => $b['username'], 'bet' => num($b['bet']), 'currency' => $b['currency'],
        'cashedAt' => $b['cashed_at'] === null ? null : num($b['cashed_at']), 'payout' => $b['payout'] === null ? null : num($b['payout']),
        // Auto cash-out targets of others stay hidden until they trigger.
        'auto' => $me && $b['user_id'] === $me['id'] && $b['auto'] !== null ? num($b['auto']) : null,
    ], q('SELECT b.*, u.username FROM crash_bets b JOIN users u ON u.id = b.user_id WHERE b.round_id = ? ORDER BY b.bet DESC LIMIT 60', [$r['id']])->fetchAll());
    // Others' auto cash-outs that have already passed are shown as cashed.
    if (!$crashed && $now >= $start) {
        $m = crash_multiplier_at($now - $start);
        foreach (q('SELECT b.user_id, b.auto, b.bet FROM crash_bets b WHERE b.round_id = ? AND b.auto IS NOT NULL AND b.cashed_at IS NULL AND b.auto <= ?', [$r['id'], (string) $m])->fetchAll() as $x) {
            foreach ($bets as &$v) if ($v['userId'] === $x['user_id'] && $v['cashedAt'] === null) { $v['cashedAt'] = num($x['auto']); $v['payout'] = num(round2((float) $x['bet'] * (float) $x['auto'])); }
            unset($v);
        }
    }
    $history = array_map(fn($h) => ['id' => (int) $h['id'], 'point' => num($h['point']), 'seed' => $h['server_seed'], 'hash' => $h['seed_hash'], 'event' => $h['forced'] === true || $h['forced'] === 't'],
        q('SELECT id, point, server_seed, seed_hash, forced FROM crash_rounds WHERE crash_at <= now() ORDER BY id DESC LIMIT 20')->fetchAll());
    $mine = $me ? q1("SELECT b.session_id FROM crash_bets b JOIN game_sessions s ON s.id = b.session_id WHERE b.round_id = ? AND b.user_id = ? AND s.status = 'OPEN'", [$r['id'], $me['id']]) : null;
    return [
        'round' => [
            'id' => (int) $r['id'], 'phase' => $phase, 'startAt' => $start, 'seedHash' => $r['seed_hash'],
            'point' => $crashed ? num($r['point']) : null, 'crashAt' => $crashed ? $crashAt : null, 'seed' => $crashed ? $r['server_seed'] : null,
            'nextAt' => $crashed ? $crashAt + CRASH_PAUSE_MS : null,
        ],
        'bets' => $bets,
        'history' => $history,
        'mySession' => $mine['session_id'] ?? null,
        'serverTime' => $now,
    ];
}

// ───────────────────────────── Live results & stats ─────────────────────────────

/** Latest finished rounds of every player (public): the "live bets" feed on game pages. */
function live_results(int $limit = 40): array
{
    return array_map(fn($s) => [
        'id' => $s['id'], 'game' => $s['game'], 'userId' => $s['user_id'], 'username' => $s['username'],
        'bet' => num($s['bet']), 'currency' => $s['currency'] ?? 'AC', 'multiplier' => num($s['multiplier']), 'payout' => num($s['payout']),
        'result' => $s['status'] === 'WON' ? 'win' : ($s['status'] === 'LOST' ? 'loss' : 'push'), 'at' => iso_to_ms($s['finished_at']),
    ], q("SELECT s.id, s.game, s.user_id, s.bet, s.currency, s.multiplier, s.payout, s.status, s.finished_at, u.username
          FROM game_sessions s JOIN users u ON u.id = s.user_id
          WHERE s.status IN ('WON', 'LOST', 'DRAW') AND NOT s.is_test AND s.finished_at > now() - interval '2 days'
          ORDER BY s.finished_at DESC LIMIT $limit")->fetchAll());
}

/** Daily profit/loss per currency. History length: 7 days, VIP 30, VVIP 90. */
function pnl_stats(array $me, int $days): array
{
    $allowed = (int) member_perk($me['id'], 'statsDays', 7);
    $days = max(1, min($days, $allowed));
    $rows = q("SELECT to_char(date_trunc('day', finished_at AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS d, currency,
                      count(*) AS rounds, count(*) FILTER (WHERE status = 'WON') AS wins,
                      sum(bet) AS wagered, sum(payout) AS paid
               FROM game_sessions WHERE user_id = ? AND status IN ('WON', 'LOST', 'DRAW') AND NOT is_test
                 AND finished_at > now() - make_interval(days => ?)
               GROUP BY 1, 2 ORDER BY 1", [$me['id'], $days])->fetchAll();
    return [
        'days' => $days, 'maxDays' => $allowed,
        'rows' => array_map(fn($r) => ['day' => $r['d'], 'currency' => $r['currency'], 'rounds' => (int) $r['rounds'], 'wins' => (int) $r['wins'],
            'wagered' => num($r['wagered']), 'net' => num((float) $r['paid'] - (float) $r['wagered'])], $rows),
    ];
}
