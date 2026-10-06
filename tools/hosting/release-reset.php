<?php
// Reset rilis dari server (dipanggil after-sync.sh untuk file db/resets/*, atau manual lewat SSH).
//   php tools/hosting/release-reset.php testers "Rilis v1.2"
//   php tools/hosting/release-reset.php global  "Rilis v2.0"
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
$api = dirname(__DIR__, 2) . '/api/lib';
foreach (['core', 'rng', 'progression', 'state', 'auth', 'games', 'platform', 'admin'] as $f) require "$api/$f.php";
$scope = (string) ($argv[1] ?? '');
$reason = trim((string) ($argv[2] ?? '')) ?: 'Rilis update';
if (!in_array($scope, ['testers', 'global'], true)) {
    fwrite(STDERR, "scope harus testers atau global\n");
    exit(2);
}
$r = tx(fn() => release_reset($scope, mb_substr($reason, 0, 300)));
echo json_encode($r), "\n";
