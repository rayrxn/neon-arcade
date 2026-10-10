<?php
// Monte Carlo RTP for Sweet: php api/tests/sweet_rtp.php [spins] [scale]
declare(strict_types=1);
require __DIR__ . '/../lib/core.php';
require __DIR__ . '/../lib/rng.php';
require __DIR__ . '/../lib/games2.php';
$n = (int) ($argv[1] ?? 100000); $scale = (float) ($argv[2] ?? SWEET_PAY_SCALE);
mt_srand((int) ($argv[3] ?? 7)); $sum = 0; $hits = 0; $max = 0;
for ($i = 0; $i < $n; $i++) {
    $f = []; for ($j = 0; $j < SWEET_FLOATS; $j++) $f[] = mt_rand() / (mt_getrandmax() + 1);
    $m = sweet_spin($f, $scale)['mult']; $sum += $m; if ($m > 0) $hits++; $max = max($max, $m);
}
printf("spins %d scale %.4f RTP %.4f hit %.3f max %.2f\n", $n, $scale, $sum / $n, $hits / $n, $max);
