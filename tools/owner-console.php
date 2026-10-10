<?php
// Neon Arcade — Owner Console (CLI launcher). Runs on the host over SSH or the cPanel Terminal.
//
//   php ~/neon-src/tools/owner-console.php --hash        create a console key hash for ~/neon-config.php
//   php ~/neon-src/tools/owner-console.php               interactive console (asks for the console key)
//   php ~/neon-src/tools/owner-console.php status        run one command and exit
//
// Same command registry, confirmations and audit trail as the web console at /#/system-console.
// There is no shell access from inside the console: only the listed commands exist.
declare(strict_types=1);
if (isset($_SERVER['REQUEST_METHOD']) || isset($_SERVER['HTTP_HOST'])) exit(1);
$api = dirname(__DIR__) . '/api/lib';
foreach (['core', 'rng', 'progression', 'state', 'auth', 'games', 'platform', 'admin', 'platform2', 'admin2', 'platform3', 'mail', 'account', 'v2core', 'console'] as $f) require "$api/$f.php";

$args = array_slice($argv ?? [], 1);
$ask = function (string $prompt, bool $hidden = false): string {
    if ($hidden && DIRECTORY_SEPARATOR === '/' && posix_isatty(STDIN)) {
        echo $prompt;
        system('stty -echo');
        $v = (string) fgets(STDIN);
        system('stty echo');
        echo "\n";
        return trim($v);
    }
    return function_exists('readline') ? trim((string) readline($prompt)) : (function () use ($prompt) { echo $prompt; return trim((string) fgets(STDIN)); })();
};

if (($args[0] ?? '') === '--hash') {
    $k = $ask('New console key (min 16 chars): ', true);
    if (strlen($k) < 16) { fwrite(STDERR, "too short\n"); exit(2); }
    if ($ask('Repeat: ', true) !== $k) { fwrite(STDERR, "keys do not match\n"); exit(2); }
    echo "\nAdd this to the array returned by ~/neon-config.php (keep the key itself somewhere safe):\n\n";
    echo "    'console' => ['key_hash' => '" . password_hash($k, PASSWORD_ARGON2ID) . "'],\n\n";
    exit(0);
}

$hash = (string) (console_cfg()['key_hash'] ?? '');
if ($hash === '') { fwrite(STDERR, "The console is disabled: no 'console' => ['key_hash' => …] in neon-config.php. Run with --hash first.\n"); exit(2); }
if (!password_verify($ask('Console key: ', true), $hash)) {
    console_audit('cli', 'unlock', false, 'wrong key (cli)');
    fwrite(STDERR, "wrong key\n");
    exit(3);
}
$GLOBALS['NEON_CONSOLE_CLI'] = true;
console_audit('cli', 'unlock', true, 'cli session');

$run = function (string $line) use ($ask): void {
    $r = console_exec($line);
    if (!empty($r['confirm'])) {
        echo $r['output'], "\n";
        $again = $ask('confirm> ');
        $r = $again === trim(preg_replace('/\s+/u', ' ', $line)) ? console_exec($line, $again) : ['ok' => false, 'output' => 'cancelled'];
    }
    echo $r['output'], "\n";
};

if ($args) { $run(implode(' ', array_map(fn($a) => str_contains($a, ' ') ? '"' . $a . '"' : $a, $args))); exit(0); }

echo "Neon Arcade Owner Console — type `help`, `exit` to leave.\n";
while (true) {
    $line = $ask('neon# ');
    if ($line === 'exit' || $line === 'quit') break;
    if ($line === '') continue;
    if (function_exists('readline_add_history')) readline_add_history($line);
    try { $run($line); } catch (Throwable $e) { echo 'error: ', $e->getMessage(), "\n"; }
}
