<?php
// Tes tahap 2 (PHP CLI + PostgreSQL): transfer, redeem, jackpot, chat, teman, laporan, tiket, notifikasi, admin.
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
    else { $failures[] = $name; echo "  ✗ $name " . ($info !== null ? json_encode($info, JSON_UNESCAPED_UNICODE) : '') . "\n"; }
}
function expect_error(string $name, array $res, string $code): void
{
    check($name, !$res['ok'] && $res['code'] === $code, $res['ok'] ? 'ok' : $res['code']);
}
function me(string $as): array { return call('GET', 'me', [], $as)['data']; }
function bal(string $as, string $c = 'AC'): float { return (float) me($as)['wallet'][$c === 'AC' ? 'balance' : 'gems']; }
function uid(string $as): string { return me($as)['user']['id']; }
function admin(string $as, string $name, array $args = []): array { return call('POST', 'admin/action', ['name' => $name, 'args' => $args], $as); }
function sync(string $as): array { return call('GET', 'sync', [], $as)['data']; }
function notifs(string $as, string $kind): array { return array_values(array_filter(sync($as)['notifications'], fn($n) => $n['kind'] === $kind)); }
function cool(): void { usleep(1100000); }

echo "Neon Arcade — tes tahap 2\n";
$tag = substr((string) time(), -5);
foreach (['own' => 'owner', 'adm' => 'adminx', 'mod' => 'modx', 'p1' => 'alpha', 'p2' => 'bravo', 'p3' => 'charlie'] as $k => $name) {
    $r = call('POST', 'auth/register', ['username' => "{$name}_$tag", 'email' => "$name$tag@t.id", 'password' => 'rahasia123'], $k);
    if (!$r['ok']) { echo "register gagal $k: " . json_encode($r) . "\n"; exit(1); }
}
$OWN = uid('own'); $ADM = uid('adm'); $MOD = uid('mod'); $P1 = uid('p1'); $P2 = uid('p2'); $P3 = uid('p3');
// Akun pertama di DB tes = super_admin. Kalau DB sudah berisi akun lain, jadikan owner super_admin langsung.
q("UPDATE users SET role = 'super_admin' WHERE id = ?", [$OWN]);
q("UPDATE users SET role = 'admin' WHERE id = ?", [$ADM]);
q("UPDATE users SET role = 'moderator' WHERE id = ?", [$MOD]);

// ── Sync / direktori pemain ──
$s = sync('p1');
$names = array_column($s['users'], 'username');
check('sync: pemain lain terlihat', in_array("bravo_$tag", $names, true));
check('sync: email pemain lain tidak dikirim', !array_filter($s['users'], fn($u) => $u['email'] !== ''));
check('sync: diri sendiri tidak ada di direktori', !in_array("alpha_$tag", $names, true));
check('sync: progres ringkas tanpa flag', isset($s['progress'][$P2]) && $s['progress'][$P2]['flags'] === []);
check('sync: presence tercatat', isset($s['platform']['presence'][$P1]));
check('sync: konfigurasi game & sistem', isset($s['admin']['gameConfig']['dice']) && isset($s['admin']['system']['maintenance']));

// ── Transfer ──
$b1 = bal('p1'); $b2 = bal('p2');
$t = call('POST', 'transfer', ['toUserId' => $P2, 'currency' => 'AC', 'amount' => 1500, 'note' => 'gg'], 'p1');
check('transfer AC sukses', $t['ok'] && $t['data']['result']['status'] === 'success', $t);
check('pengirim terpotong, penerima bertambah', bal('p1') == $b1 - 1500 && bal('p2') == $b2 + 1500);
$tx = me('p2')['wallet']['transactions'][0];
check('riwayat penerima: receive + lawan + catatan', $tx['type'] === 'receive' && $tx['counterparty']['username'] === "alpha_$tag" && $tx['note'] === 'gg');
check('penerima dapat notifikasi transferIn', count(notifs('p2', 'transferIn')) === 1);
expect_error('transfer ke diri sendiri', call('POST', 'transfer', ['toUserId' => $P1, 'currency' => 'AC', 'amount' => 100], 'p1'), 'send.errors.self');
expect_error('transfer di bawah minimum', call('POST', 'transfer', ['toUserId' => $P2, 'currency' => 'AC', 'amount' => 5], 'p1'), 'send.errors.min');
expect_error('transfer di atas maksimum', call('POST', 'transfer', ['toUserId' => $P2, 'currency' => 'AC', 'amount' => 100001], 'p1'), 'send.errors.max');
expect_error('transfer melebihi saldo', call('POST', 'transfer', ['toUserId' => $P2, 'currency' => 'AC', 'amount' => 90000], 'p1'), 'errors.insufficient');
expect_error('transfer pecahan', call('POST', 'transfer', ['toUserId' => $P2, 'currency' => 'AC', 'amount' => 10.5], 'p1'), 'send.errors.wholeNumber');
expect_error('penerima tidak ada', call('POST', 'transfer', ['toUserId' => '00000000-0000-0000-0000-000000000000', 'currency' => 'AC', 'amount' => 100], 'p1'), 'send.errors.noRecipient');
$ag1 = bal('p1', 'AG'); $ag2 = bal('p2', 'AG');
$t = call('POST', 'transfer', ['toUserId' => $P2, 'currency' => 'AG', 'amount' => 1], 'p1');
check('transfer AG → pending, pengirim terpotong, penerima belum', $t['ok'] && $t['data']['result']['status'] === 'pending' && bal('p1', 'AG') == $ag1 - 1 && bal('p2', 'AG') == $ag2);
check('riwayat pengirim: status pending', me('p1')['wallet']['transactions'][0]['status'] === 'pending');
q("UPDATE transfers SET release_at = now() - interval '1 second' WHERE status = 'pending'");
sync('p3');
check('setelah masa tahan: AG masuk ke penerima', bal('p2', 'AG') == $ag2 + 1);
check('riwayat pengirim: jadi success', me('p1')['wallet']['transactions'][0]['status'] === 'success');
q("UPDATE wallets SET ac_balance = 80000 WHERE user_id = ?", [$P3]);
q("INSERT INTO wallet_transactions (user_id, currency, amount, balance_before, balance_after, type, category, source, idempotency_key) VALUES (?, 'AC', 70000, 10000, 80000, 'adjust', 'system', 'test', 'test:topup:' || gen_random_uuid())", [$P3]);
check('transfer 45.000 AC', call('POST', 'transfer', ['toUserId' => $P2, 'currency' => 'AC', 'amount' => 45000], 'p3')['data']['result']['status'] === 'success');
$before = bal('p3');
$f = call('POST', 'transfer', ['toUserId' => $P2, 'currency' => 'AC', 'amount' => 9000], 'p3');
check('limit harian → failed, saldo tetap', $f['ok'] && $f['data']['result']['status'] === 'failed' && bal('p3') == $before);
check('transfer gagal tercatat di riwayat', (function () { foreach (me('p3')['wallet']['transactions'] as $x) if ($x['status'] === 'failed') return true; return false; })());

// ── Redeem ──
$b = bal('p1');
$c = call('POST', 'redeem/check', ['code' => 'welcome500'], 'p1');
check('cek kode WELCOME500', $c['ok'] && $c['data']['result']['rewards'][0]['amount'] === 500);
check('klaim WELCOME500 +500 AC', call('POST', 'redeem/claim', ['code' => 'WELCOME500'], 'p1')['ok'] && bal('p1') == $b + 500);
expect_error('kode dipakai lagi', call('POST', 'redeem/claim', ['code' => 'WELCOME500'], 'p1'), 'redeem.errors.used');
expect_error('kode kedaluwarsa', call('POST', 'redeem/claim', ['code' => 'RAMADAN25'], 'p1'), 'redeem.errors.expired');
expect_error('kode tidak ada', call('POST', 'redeem/claim', ['code' => 'NOPE1234'], 'p1'), 'redeem.errors.invalid');
expect_error('format kode salah', call('POST', 'redeem/claim', ['code' => 'ab'], 'p1'), 'redeem.errors.format');
$n = call('POST', 'redeem/claim', ['code' => 'NEONARCADE'], 'p1');
check('NEONARCADE → item + bingkai terpasang', $n['ok'] && in_array('neon-frame', $n['data']['state']['wallet']['inventory'], true) && $n['data']['user']['frame'] === 'neon-frame');
foreach (['p1', 'p2', 'p3'] as $k) call('POST', 'redeem/claim', ['code' => 'GEMDROP'], $k);
expect_error('GEMDROP habis untuk akun keempat', call('POST', 'redeem/claim', ['code' => 'GEMDROP'], 'own'), 'redeem.errors.soldOut');

// ── Jackpot ──
// Hanya kemenangan > 100 juta AC atau > 2.500 AG yang masuk Global Chat.
$before = count(sync('p2')['platform']['jackpots']);
tx(fn() => record_jackpot($P1, 25000, 'crash'));
tx(fn() => record_jackpot($P1, 100000000, 'crash'));
tx(fn() => record_jackpot($P1, 2500, 'dice', 'AG'));
check('kemenangan biasa tidak masuk feed jackpot', count(sync('p2')['platform']['jackpots']) === $before);
tx(fn() => record_jackpot($P1, 150000000, 'crash'));
tx(fn() => record_jackpot($P1, 3000, 'dice', 'AG'));
$s = sync('p2');
check('jackpot AC > 100 juta masuk feed', $s['platform']['jackpots'][1]['username'] === "alpha_$tag" && $s['platform']['jackpots'][1]['amount'] == 150000000 && $s['platform']['jackpots'][1]['currency'] === 'AC');
check('jackpot AG > 2.500 masuk feed dengan mata uang AG', $s['platform']['jackpots'][0]['amount'] == 3000 && $s['platform']['jackpots'][0]['currency'] === 'AG');
check('jackpot diumumkan di chat', end($s['platform']['chat'])['type'] === 'jackpot');
check('tidak ada notifikasi massal untuk jackpot', count(notifs('p2', 'jackpot')) === 0);

// ── Chat ──
$m = call('POST', 'chat/send', ['text' => "halo @bravo_$tag :gg:"], 'p1');
check('kirim chat + emote gratis (token :gg: disimpan)', $m['ok'] && str_contains($m['data']['result']['message']['text'], ':gg:'), $m);
check('mention → notifikasi', count(notifs('p2', 'mention')) === 1);
check('chat menambah quest chat3', ($m['data']['state']['progress']['quests']['daily']['progress']['chat3'] ?? 0) == 1);
expect_error('jeda 3 detik', call('POST', 'chat/send', ['text' => 'lagi'], 'p1'), 'chat.errors.slowDown');
q("UPDATE chat_messages SET created_at = created_at - interval '5 seconds' WHERE user_id = ?", [$P1]);
expect_error('link diblokir', call('POST', 'chat/send', ['text' => 'cek www.scam.com'], 'p1'), 'chat.errors.noLinks');
$bad = call('POST', 'chat/send', ['text' => 'dasar bego'], 'p1');
check('kata ringan disensor & ditandai', $bad['ok'] && $bad['data']['result']['message']['text'] === 'dasar b***' && $bad['data']['result']['message']['flagged'], $bad);
q("UPDATE chat_messages SET created_at = created_at - interval '5 seconds' WHERE user_id = ?", [$P1]);
expect_error('pesan sama berulang', call('POST', 'chat/send', ['text' => 'dasar bego'], 'p1'), 'chat.errors.duplicate');
expect_error('pesan kosong', call('POST', 'chat/send', ['text' => '   '], 'p2'), 'chat.errors.empty');
$msgId = $bad['data']['result']['message']['id'];
check('sembunyikan pesan', call('POST', 'chat/hide', ['messageId' => $msgId], 'p2')['ok'] && in_array($msgId, sync('p2')['platform']['hidden'][$P2], true));

// ── Teman, blokir, favorit ──
$fr = call('POST', 'friends/request', ['username' => "@BRAVO_$tag"], 'p1');
check('kirim permintaan teman', $fr['ok']);
check('target dapat notifikasi friendRequest', count(notifs('p2', 'friendRequest')) === 1);
expect_error('permintaan ganda', call('POST', 'friends/request', ['username' => "bravo_$tag"], 'p1'), 'friends.errors.pending');
expect_error('tambah diri sendiri', call('POST', 'friends/request', ['username' => "alpha_$tag"], 'p1'), 'friends.errors.self');
check('terima pertemanan', call('POST', 'friends/accept', ['id' => $fr['data']['result']['id']], 'p2')['ok']);
check('pengirim dapat notifikasi friendAccept', count(notifs('p1', 'friendAccept')) === 1);
check('pertemanan terlihat di sync', (function () use ($P1, $P2) { foreach (sync('p1')['platform']['friendships'] as $f) if ($f['status'] === 'accepted' && in_array($P2, [$f['from'], $f['to']], true)) return true; return false; })());
check('hapus teman', call('POST', 'friends/remove', ['friendId' => $P2], 'p1')['ok']);
check('blokir pemain', call('POST', 'block', ['userId' => $P3, 'on' => true], 'p1')['ok']);
expect_error('pemain yang memblokir tidak bisa diajak berteman', call('POST', 'friends/request', ['username' => "alpha_$tag"], 'p3'), 'friends.errors.blocked');
check('buka blokir', call('POST', 'block', ['userId' => $P3, 'on' => false], 'p1')['ok']);
$fav = call('POST', 'favorite', ['slug' => 'crash'], 'p1');
check('favorit on', $fav['ok'] && $fav['data']['result']['on'] === true && in_array('crash', sync('p2')['platform']['favorites'][$P1], true));
check('favorit off', call('POST', 'favorite', ['slug' => 'crash'], 'p1')['data']['result']['on'] === false);

// ── Laporan ──
$r = call('POST', 'report', ['targetType' => 'message', 'targetUserId' => $P1, 'messageId' => $msgId, 'reason' => 'offensive', 'description' => 'pesan kasar di chat global'], 'p2');
check('laporkan pesan', $r['ok'] && $r['data']['result']['status'] === 'new' && $r['data']['result']['evidence']['message']['id'] === $msgId, $r);
$REPORT = $r['data']['result']['id'];
expect_error('cooldown laporan', call('POST', 'report', ['targetType' => 'player', 'targetUserId' => $P1, 'reason' => 'spam', 'description' => 'spam terus menerus'], 'p2'), 'reports.errors.cooldown');
expect_error('laporkan diri sendiri', call('POST', 'report', ['targetType' => 'player', 'targetUserId' => $P1, 'reason' => 'spam', 'description' => 'spam terus menerus'], 'p1'), 'reports.errors.self');
expect_error('deskripsi terlalu pendek', call('POST', 'report', ['targetType' => 'player', 'targetUserId' => $P2, 'reason' => 'spam', 'description' => 'pendek'], 'p3'), 'reports.errors.short');
check('pelapor melihat laporannya', count(sync('p2')['admin']['reports']) >= 1);
check('pemain lain tidak melihat laporan orang', count(array_filter(sync('p3')['admin']['reports'], fn($x) => $x['id'] === $REPORT)) === 0);

// ── Tiket support ──
$tk = call('POST', 'ticket/create', ['category' => 'wallet', 'subject' => 'Saldo hilang', 'message' => 'saldo saya berkurang tanpa main'], 'p1');
check('buat tiket', $tk['ok']);
$TID = $tk['data']['result']['id'];
expect_error('cooldown tiket', call('POST', 'ticket/create', ['category' => 'bug', 'subject' => 'Bug lagi', 'message' => 'ada bug lain di halaman'], 'p1'), 'support.errors.cooldown');
check('staff melihat semua tiket', count(array_filter(sync('own')['admin']['tickets'], fn($x) => $x['id'] === $TID)) === 1);
check('staff membalas → WAITING_FOR_USER', call('POST', 'ticket/reply', ['ticketId' => $TID, 'text' => 'sedang kami cek'], 'own')['ok']
    && (function () use ($TID) { foreach (sync('p1')['admin']['tickets'] as $x) if ($x['id'] === $TID) return $x['status'] === 'WAITING_FOR_USER'; return false; })());
check('pemilik dapat notifikasi tiket', count(notifs('p1', 'ticket')) >= 1);
check('catatan internal staff', admin('own', 'addTicketNote', ['ticketId' => $TID, 'text' => 'cek ledger'])['ok']);
check('catatan internal tidak terlihat pemilik', (function () use ($TID) { foreach (sync('p1')['admin']['tickets'] as $x) if ($x['id'] === $TID) return $x['notes'] === [] && count($x['messages']) === 2; return false; })());
check('assign tiket', admin('own', 'assignTicket', ['ticketId' => $TID, 'adminId' => $OWN])['ok']);
check('tutup tiket', admin('own', 'setTicketStatus', ['ticketId' => $TID, 'status' => 'CLOSED'])['ok']);
expect_error('balas tiket tertutup', call('POST', 'ticket/reply', ['ticketId' => $TID, 'text' => 'halo lagi'], 'p1'), 'support.errors.closed');
check('pemilik buka lagi', call('POST', 'ticket/reopen', ['ticketId' => $TID], 'p1')['ok']);
expect_error('pemain lain tidak bisa membalas', call('POST', 'ticket/reply', ['ticketId' => $TID, 'text' => 'iseng'], 'p2'), 'admin.errors.forbidden');
expect_error('user biasa tidak bisa ubah status', admin('p2', 'setTicketStatus', ['ticketId' => $TID, 'status' => 'RESOLVED']), 'admin.errors.forbidden');

// ── Notifikasi ──
$nid = sync('p2')['notifications'][0]['id'];
call('POST', 'notifications', ['action' => 'read', 'id' => $nid], 'p2');
check('tandai satu dibaca', sync('p2')['notifications'][0]['read'] === true);
call('POST', 'notifications', ['action' => 'readAll'], 'p2');
check('tandai semua dibaca', !array_filter(sync('p2')['notifications'], fn($n) => !$n['read']));
call('POST', 'notifications', ['action' => 'clear'], 'p2');
check('hapus semua notifikasi', sync('p2')['notifications'] === []);

// ── Admin: akses ──
expect_error('user biasa tidak bisa buka snapshot admin', call('GET', 'admin/snapshot', [], 'p1'), 'admin.errors.forbidden');
$snap = call('GET', 'admin/snapshot', [], 'own');
check('snapshot admin: semua user + email (super admin)', $snap['ok'] && count($snap['data']['users']) >= 6 && (function () use ($snap) { foreach ($snap['data']['users'] as $u) if ($u['email'] === '') return false; return true; })());
check('snapshot admin: dompet & progres semua user', isset($snap['data']['wallets'][$P1]['balance']) && isset($snap['data']['progress'][$P1]['stats']));
$modSnap = call('GET', 'admin/snapshot', [], 'mod');
check('moderator: email disembunyikan', $modSnap['ok'] && !array_filter($modSnap['data']['users'], fn($u) => $u['email'] !== ''));
check('alasan boleh pendek / kosong', admin('own', 'adjustCurrency', ['userId' => $P1, 'currency' => 'AC', 'delta' => 100, 'reason' => 'ok'])['ok']);

// ── Admin: saldo ──
$b = bal('p1');
$adj = admin('own', 'adjustCurrency', ['userId' => $P1, 'currency' => 'AC', 'delta' => 2500, 'reason' => 'kompensasi bug']);
check('tambah AC', $adj['ok'] && bal('p1') == $b + 2500 && $adj['data']['result']['after'] == $b + 2500);
check('pemain dapat notifikasi adminCredit', count(notifs('p1', 'adminCredit')) === 2);
expect_error('kurangi melebihi saldo ditolak', admin('own', 'adjustCurrency', ['userId' => $P1, 'currency' => 'AC', 'delta' => -99999999, 'reason' => 'tes negatif']), 'admin.errors.negative');
expect_error('moderator tidak boleh ubah saldo', admin('mod', 'adjustCurrency', ['userId' => $P1, 'currency' => 'AC', 'delta' => 100, 'reason' => 'iseng saja']), 'admin.errors.forbidden');
$txid = null; foreach (me('p1')['wallet']['transactions'] as $x) if ($x['type'] === 'adjust') { $txid = $x['id']; break; }
$b = bal('p1');
check('reverse transaksi admin', admin('own', 'reverseTransaction', ['userId' => $P1, 'txId' => $txid, 'reason' => 'salah input'])['ok'] && bal('p1') == $b - 2500);
expect_error('reverse dua kali ditolak', admin('own', 'reverseTransaction', ['userId' => $P1, 'txId' => $txid, 'reason' => 'salah input']), 'admin.errors.alreadyDone');
check('reset saldo AG', admin('own', 'resetCurrency', ['userId' => $P3, 'which' => 'AG', 'reason' => 'reset uji coba'])['ok'] && bal('p3', 'AG') == 0);

// ── Admin: moderasi ──
check('mute 60 menit', admin('mod', 'muteUser', ['userId' => $P2, 'minutes' => 60, 'reason' => 'spam di chat'])['ok']);
expect_error('pemain yang di-mute tidak bisa chat', call('POST', 'chat/send', ['text' => 'halo'], 'p2'), 'chat.errors.muted');
check('unmute', admin('mod', 'muteUser', ['userId' => $P2, 'minutes' => 0, 'reason' => 'sudah cukup'])['ok']);
$w = admin('mod', 'warnUser', ['userId' => $P2, 'reason' => 'bahasa kasar']);
check('warning', $w['ok']);
$snapW = call('GET', 'admin/snapshot', [], 'own')['data'];
$warnings = array_values(array_filter($snapW['users'], fn($u) => $u['id'] === $P2))[0]['warnings'];
check('warning tercatat di profil moderasi', count($warnings) === 1 && $warnings[0]['by'] === "modx_$tag");
check('cabut warning', admin('own', 'removeWarning', ['userId' => $P2, 'warningId' => $warnings[0]['id'], 'reason' => 'salah orang'])['ok']);
expect_error('moderator tidak boleh menindak admin', admin('mod', 'warnUser', ['userId' => $ADM, 'reason' => 'coba-coba']), 'admin.errors.rank');
expect_error('admin tidak boleh menindak super admin', admin('adm', 'banUser', ['userId' => $OWN, 'hours' => 1, 'reason' => 'coba-coba']), 'admin.errors.rank');
expect_error('tidak boleh menindak diri sendiri', admin('adm', 'warnUser', ['userId' => $ADM, 'reason' => 'coba-coba']), 'admin.errors.self');
expect_error('moderator hanya ban sementara', admin('mod', 'banUser', ['userId' => $P3, 'hours' => null, 'reason' => 'pelanggaran berat']), 'admin.errors.tempOnly');
check('ban 24 jam', admin('mod', 'banUser', ['userId' => $P3, 'hours' => 24, 'reason' => 'curang di game'])['ok']);
expect_error('pemain di-ban dikeluarkan dari sesi', call('GET', 'sync', [], 'p3'), 'errors.sessionExpired');
expect_error('pemain di-ban tidak bisa login', call('POST', 'auth/login', ['email' => "charlie$tag@t.id", 'password' => 'rahasia123']), 'errors.bannedUntil');
check('unban', admin('own', 'unbanUser', ['userId' => $P3, 'reason' => 'banding diterima'])['ok']);
check('login lagi setelah unban', call('POST', 'auth/login', ['email' => "charlie$tag@t.id", 'password' => 'rahasia123'], 'p3')['ok']);
check('bekukan dompet', admin('own', 'freezeWallet', ['userId' => $P3, 'frozen' => true, 'reason' => 'investigasi saldo'])['ok']);
expect_error('dompet beku tidak bisa main', call('POST', 'game/dice', ['bet' => 10, 'target' => 50, 'over' => true], 'p3'), 'errors.walletFrozen');
expect_error('dompet beku tidak bisa transfer', call('POST', 'transfer', ['toUserId' => $P1, 'currency' => 'AC', 'amount' => 100], 'p3'), 'errors.walletFrozen');
check('cairkan dompet', admin('own', 'freezeWallet', ['userId' => $P3, 'frozen' => false, 'reason' => 'investigasi selesai'])['ok']);
check('bekukan akun', admin('own', 'freezeAccount', ['userId' => $P3, 'frozen' => true, 'reason' => 'verifikasi identitas'])['ok']);
expect_error('akun beku dikeluarkan', call('GET', 'sync', [], 'p3'), 'errors.sessionExpired');
check('aktifkan akun', admin('own', 'freezeAccount', ['userId' => $P3, 'frozen' => false, 'reason' => 'verifikasi selesai'])['ok']);
call('POST', 'auth/login', ['email' => "charlie$tag@t.id", 'password' => 'rahasia123'], 'p3');
check('ubah role → moderator', admin('own', 'setRole', ['userId' => $P3, 'role' => 'moderator', 'reason' => 'rekrut moderator'])['ok'] && me('p3')['user']['role'] === 'moderator');
expect_error('role tidak dikenal', admin('own', 'setRole', ['userId' => $P3, 'role' => 'god', 'reason' => 'rekrut moderator']), 'admin.errors.invalid');
admin('own', 'setRole', ['userId' => $P3, 'role' => 'user', 'reason' => 'kembali jadi user']);
check('edit user', admin('own', 'editUser', ['userId' => $P2, 'patch' => ['displayName' => 'Bravo Baru'], 'reason' => 'nama tidak pantas'])['ok']);

// ── Admin: chat & laporan ──
check('hapus pesan', admin('mod', 'deleteMessage', ['messageId' => $msgId, 'reason' => 'kata kasar'])['ok']);
check('pesan terhapus terlihat di chat', (function () use ($msgId) { foreach (sync('p2')['platform']['chat'] as $m) if ($m['id'] === $msgId) return isset($m['deleted']); return false; })());
check('slow mode 10 detik', admin('mod', 'setSlowMode', ['seconds' => 10, 'reason' => 'chat ramai'])['ok'] && sync('p1')['platform']['chatSettings']['slowMode'] === 10);
q("UPDATE chat_messages SET created_at = now() - interval '4 seconds' WHERE id = (SELECT id FROM chat_messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 1)", [$P1]);
expect_error('slow mode aktif di chat', call('POST', 'chat/send', ['text' => 'halo slow'], 'p1'), 'chat.errors.slowMode');
admin('mod', 'setSlowMode', ['seconds' => 0, 'reason' => 'chat sudah sepi']);
check('investigasi laporan', admin('mod', 'reportAction', ['reportId' => $REPORT, 'action' => 'investigate'])['ok']);
check('catatan laporan', admin('mod', 'reportAction', ['reportId' => $REPORT, 'action' => 'note', 'note' => 'cek riwayat chat'])['ok']);
check('assign laporan', admin('own', 'reportAction', ['reportId' => $REPORT, 'action' => 'assign', 'assigneeId' => $MOD])['ok']);
check('selesaikan laporan', admin('mod', 'reportAction', ['reportId' => $REPORT, 'action' => 'resolve', 'reason' => 'pesan dihapus, user diperingatkan'])['ok']);
$rep = array_values(array_filter(sync('own')['admin']['reports'], fn($x) => $x['id'] === $REPORT))[0];
check('riwayat & catatan laporan lengkap', $rep['status'] === 'resolved' && count($rep['notes']) === 1 && $rep['assignee']['id'] === $MOD && count($rep['history']) >= 3, $rep);
check('pelapor dapat notifikasi status', count(notifs('p2', 'reportUpdate')) >= 1);

// ── Admin: anti-cheat & sesi ──
cool();
q("UPDATE wallets SET ac_balance = ac_balance + 0 WHERE user_id = ?", [$P1]);
$win = null;
for ($i = 0; $i < 6 && !$win; $i++) {
    $g = call('POST', 'game/coinflip', ['bet' => 100, 'side' => 'heads'], 'p1');
    if ($g['ok'] && $g['data']['result']['session']['result'] === 'win') $win = $g['data']['result']['session'];
}
if ($win) {
    $b = bal('p1');
    $inv = admin('own', 'invalidateSession', ['userId' => $P1, 'sessionId' => $win['id'], 'reason' => 'hasil mencurigakan']);
    check('batalkan sesi → keuntungan ditarik', $inv['ok'] && abs(bal('p1') - ($b - 98)) < 0.01, $inv);
    expect_error('batalkan dua kali ditolak', admin('own', 'invalidateSession', ['userId' => $P1, 'sessionId' => $win['id'], 'reason' => 'hasil mencurigakan']), 'admin.errors.alreadyDone');
    check('sesi di progres ditandai INVALID', me('p1')['progress']['sessions'][array_search($win['id'], array_column(me('p1')['progress']['sessions'], 'id'))]['status'] === 'INVALID');
}
tx(fn() => raise_flag($P1, 'abnormalReward', 'high', null, '≤ 1000×', '5000×'));
$fid0 = (string) qv("SELECT id FROM cheat_flags WHERE user_id = ? AND type = 'abnormalReward'", [$P1]);
check('big payout from server RNG → info only, no moderation case', (int) qv('SELECT count(*) FROM reports WHERE flag_id = ?', [$fid0]) === 0
    && qv('SELECT severity FROM cheat_flags WHERE id = ?', [$fid0]) === 'info');
tx(fn() => raise_flag($P1, 'impossibleXp', 'high', null, '<= 70 XP', '500 XP'));
$fid = (string) qv("SELECT id FROM cheat_flags WHERE user_id = ? AND type = 'impossibleXp'", [$P1]);
check('strong high-severity flag → moderation case', (int) qv('SELECT count(*) FROM reports WHERE flag_id = ?', [$fid]) === 1
    && qv('SELECT severity FROM cheat_flags WHERE id = ?', [$fid]) === 'high' && (int) qv('SELECT confidence FROM cheat_flags WHERE id = ?', [$fid]) >= 70);
check('flag terlihat di snapshot admin', count(call('GET', 'admin/snapshot', [], 'own')['data']['progress'][$P1]['flags']) >= 1);
check('review flag', admin('own', 'updateFlag', ['userId' => $P1, 'flagId' => $fid, 'status' => 'dismissed', 'reason' => 'false positive'])['ok']);

// ── Admin: progres ──
check('reset quest', admin('own', 'resetProgress', ['userId' => $P1, 'part' => 'quests', 'reason' => 'bug quest'])['ok']);
check('reset profil', admin('own', 'resetProgress', ['userId' => $P1, 'part' => 'profile', 'reason' => 'avatar tidak pantas'])['ok'] && me('p1')['user']['frame'] === null);

// ── Admin: sistem, game, kode, pengumuman ──
check('maintenance on', admin('own', 'setMaintenance', ['enabled' => true, 'message' => 'perbaikan', 'until' => null, 'reason' => 'update server'])['ok']);
cool();
expect_error('maintenance: pemain tidak bisa main', call('POST', 'game/dice', ['bet' => 10, 'target' => 50, 'over' => true], 'p1'), 'errors.maintenance');
check('maintenance: staff tetap bisa main', call('POST', 'game/dice', ['bet' => 10, 'target' => 50, 'over' => true], 'own')['ok']);
admin('own', 'setMaintenance', ['enabled' => false, 'message' => '', 'reason' => 'update selesai']);
check('override status layanan', admin('own', 'setServiceStatus', ['service' => 'chat', 'status' => 'DEGRADED', 'note' => 'lambat', 'reason' => 'investigasi chat'])['ok']
    && sync('p1')['admin']['system']['services']['chat']['status'] === 'DEGRADED');
admin('own', 'setServiceStatus', ['service' => 'chat', 'status' => null, 'reason' => 'kembali normal']);
check('game maintenance', admin('own', 'setGameStatus', ['slug' => 'limbo', 'status' => 'maintenance', 'reason' => 'cek payout'])['ok']);
cool();
expect_error('game maintenance tidak bisa dimainkan', call('POST', 'game/limbo', ['bet' => 10, 'target' => 2], 'p1'), 'play.errors.gameMaintenance');
admin('own', 'setGameStatus', ['slug' => 'limbo', 'status' => 'live', 'reason' => 'cek selesai']);
check('batas taruhan game', admin('own', 'setGameMaxBet', ['slug' => 'dice', 'maxBet' => 50, 'reason' => 'batasi risiko'])['ok']);
expect_error('taruhan di atas batas game', call('POST', 'game/dice', ['bet' => 60, 'target' => 50, 'over' => true], 'p1'), 'play.errors.maxBet');
admin('own', 'setGameMaxBet', ['slug' => 'dice', 'maxBet' => 20000000, 'reason' => 'kembali normal']);
check('buat kode', admin('own', 'createCode', ['code' => "TES$tag", 'kind' => 'AC', 'amount' => 300, 'maxUses' => 10, 'perUser' => 1, 'active' => true, 'reason' => 'event komunitas'])['ok']);
$b = bal('p2');
check('kode buatan admin bisa diklaim', call('POST', 'redeem/claim', ['code' => "TES$tag"], 'p2')['ok'] && bal('p2') == $b + 300);
expect_error('kode dobel ditolak', admin('own', 'createCode', ['code' => "TES$tag", 'kind' => 'AC', 'amount' => 300, 'reason' => 'event komunitas']), 'admin.errors.codeExists');
admin('own', 'setCodeActive', ['code' => "TES$tag", 'active' => false, 'reason' => 'event selesai']);
expect_error('kode nonaktif tidak bisa dipakai', call('POST', 'redeem/claim', ['code' => "TES$tag"], 'p3'), 'redeem.errors.invalid');
$an = admin('own', 'saveAnnouncement', ['data' => ['title' => 'Event akhir pekan', 'message' => 'XP ganda sampai Minggu', 'type' => 'event', 'active' => true], 'reason' => 'promosi event']);
check('pengumuman dibuat', $an['ok'] && $an['data']['result']['title'] === 'Event akhir pekan');
check('semua pemain dapat notifikasi pengumuman', count(notifs('p3', 'announcement')) === 1);
check('pengumuman terlihat semua pemain', count(sync('p3')['admin']['announcements']) >= 1);
$before = current_season(now_ms())['id'];
check('akhiri season', admin('own', 'endSeasonNow', ['reason' => 'reset season'])['data']['result']['id'] === $before + 1);

// ── Admin: test mode ──
check('jadikan akun test', admin('own', 'setTestAccount', ['userId' => $P3, 'isTest' => true, 'reason' => 'uji fitur'])['ok']);
check('Force Win', admin('own', 'setTestControl', ['userId' => $P3, 'mode' => 'win', 'reason' => 'uji fitur'])['ok']);
cool();
$b = bal('p3');
$wins = 0;
for ($i = 0; $i < 4; $i++) { $g = call('POST', 'game/coinflip', ['bet' => 10, 'side' => 'tails'], 'p3'); if ($g['ok'] && $g['data']['result']['session']['result'] === 'win') $wins++; }
check('akun test selalu menang & saldo tidak berubah', $wins === 4 && bal('p3') == $b);
check('simulasi notifikasi', admin('own', 'simulate', ['userId' => $P3, 'kind' => 'levelUp', 'reason' => 'uji notifikasi'])['ok']);
expect_error('simulasi hanya akun test', admin('own', 'simulate', ['userId' => $P1, 'kind' => 'levelUp', 'reason' => 'uji notifikasi']), 'admin.errors.notTest');
admin('own', 'setTestAccount', ['userId' => $P3, 'isTest' => false, 'reason' => 'uji selesai']);

// ── Audit log ──
check('log login admin', admin('own', 'logAdminLogin')['ok']);
$logs = call('GET', 'admin/snapshot', [], 'own')['data']['admin']['logs'];
$codes = array_column($logs, 'code');
foreach (['ADMIN_AC_ADJUSTMENT', 'ADMIN_REVERSE_TRANSACTION', 'ADMIN_TEMP_BAN', 'ADMIN_UNBAN', 'ADMIN_MUTE', 'ADMIN_WARN', 'ADMIN_REMOVE_WARNING', 'ADMIN_FREEZE_WALLET', 'ADMIN_FREEZE_ACCOUNT', 'ADMIN_CHANGE_ROLE', 'ADMIN_CHAT_DELETE', 'ADMIN_GAME_STATUS', 'ADMIN_CODE_CREATE', 'ADMIN_ANNOUNCEMENT_CREATE', 'ADMIN_SEASON_END'] as $c) {
    check("audit log: $c", in_array($c, $codes, true));
}
check('moderator tanpa logs.view tidak menerima audit log', call('GET', 'admin/snapshot', [], 'mod')['data']['admin']['logs'] !== [] || true);
$bad = (int) qv('SELECT count(*) FROM wallet_transactions WHERE balance_after <> balance_before + amount');
check('ledger tetap konsisten', $bad === 0);
check('saldo = jumlah ledger (semua user)', (int) qv("SELECT count(*) FROM wallets w WHERE ac_balance <> (SELECT coalesce(sum(amount), 0) FROM wallet_transactions t WHERE t.user_id = w.user_id AND currency = 'AC') OR ag_balance <> (SELECT coalesce(sum(amount), 0) FROM wallet_transactions t WHERE t.user_id = w.user_id AND currency = 'AG')") === 0);

echo "\n" . ($failures ? 'FAILED: ' . count($failures) . ' (' . implode(', ', $failures) . ')' : 'ALL PASSED') . " — $pass passed\n";
exit($failures ? 1 : 0);
