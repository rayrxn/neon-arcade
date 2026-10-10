<?php
// Reset rilis dari server (dipanggil after-sync.sh untuk file db/resets/*, atau manual lewat SSH).
//   php tools/hosting/release-reset.php testers "Rilis v1.2"
//   php tools/hosting/release-reset.php global  "Rilis v2.0"
declare(strict_types=1);
// Bisa jalan lewat php CLI atau php-cgi (cron hosting), tapi tidak pernah lewat web.
if (isset($_SERVER['REQUEST_METHOD']) || isset($_SERVER['HTTP_HOST'])) exit(1);
$api = dirname(__DIR__, 2) . '/api/lib';
foreach (['core', 'rng', 'progression', 'state', 'auth', 'games', 'platform', 'admin', 'platform2', 'admin2', 'platform3', 'mail', 'account', 'v2core'] as $f) require "$api/$f.php";
$argv = $argv ?? [];
$scope = (string) ($argv[1] ?? getenv('NEON_RESET_SCOPE') ?: '');
$reason = trim((string) ($argv[2] ?? getenv('NEON_RESET_REASON') ?: '')) ?: 'Rilis update';
if (!in_array($scope, ['testers', 'global'], true)) {
    fwrite(STDERR, "scope harus testers atau global\n");
    exit(2);
}
$r = tx(fn() => release_reset($scope, mb_substr($reason, 0, 300)));
echo json_encode($r), "\n";
