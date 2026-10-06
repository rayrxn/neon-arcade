<?php
// Neon Arcade API — fondasi: konfigurasi, database, JSON, error, waktu.
declare(strict_types=1);

const NEON_TZ = 'Asia/Jakarta';
date_default_timezone_set(NEON_TZ);

/** Error yang dikirim ke frontend: kode = kunci i18n (mis. errors.insufficient). */
final class ApiError extends Exception
{
    public array $vars;
    public int $status;
    public function __construct(string $code, array $vars = [], int $status = 400)
    {
        parent::__construct($code);
        $this->vars = $vars;
        $this->status = $status;
    }
}

function fail(string $code, array $vars = [], int $status = 400): never
{
    throw new ApiError($code, $vars, $status);
}

/** Konfigurasi dibaca dari file di LUAR web root (default: ~/neon-config.php). */
function config(): array
{
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $candidates = array_filter([
        getenv('NEON_CONFIG') ?: null,
        dirname(__DIR__, 3) . '/neon-config.php',   // public_html/api/lib → ~/neon-config.php
    ]);
    foreach ($candidates as $file) {
        if (is_file($file)) {
            $cfg = require $file;
            return $cfg;
        }
    }
    throw new RuntimeException('neon-config.php not found');
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo) return $pdo;
    $c = config()['db'];
    $pdo = new PDO(
        sprintf('pgsql:host=%s;port=%d;dbname=%s', $c['host'] ?? 'localhost', $c['port'] ?? 5432, $c['name']),
        $c['user'],
        $c['pass'],
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false]
    );
    $pdo->exec("SET TIME ZONE '" . NEON_TZ . "'");
    return $pdo;
}

/** Jalankan $fn dalam satu transaksi; error SQL dari api_error() diubah jadi ApiError. */
function tx(callable $fn)
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $out = $fn($pdo);
        $pdo->commit();
        return $out;
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        persist_pending_flags();
        throw map_db_error($e);
    }
}

/**
 * Flag anti-cheat yang dicatat sebelum request ditolak (replay, spam) tidak boleh ikut
 * hilang saat transaksi dibatalkan → disimpan ulang di transaksi terpisah.
 */
function queue_flag(string $userId, string $type, string $risk, ?string $sessionId, string $expected, string $submitted): void
{
    $GLOBALS['NEON_PENDING_FLAGS'][] = [$userId, $type, $risk, $sessionId, $expected, $submitted];
}

function persist_pending_flags(): void
{
    $flags = $GLOBALS['NEON_PENDING_FLAGS'] ?? [];
    $GLOBALS['NEON_PENDING_FLAGS'] = [];
    foreach ($flags as [$userId, $type, $risk, $sessionId, $expected, $submitted]) {
        try {
            q('SELECT raise_flag(?::uuid, ?, ?::flag_risk, ?::uuid, ?, ?)', [$userId, $type, $risk, $sessionId, $expected, $submitted]);
        } catch (Throwable $ignored) {
        }
    }
}

function map_db_error(Throwable $e): Throwable
{
    if ($e instanceof PDOException && ($e->errorInfo[0] ?? '') === 'P0001') {
        // Pesan dari api_error(): "ERROR:  errors.insufficient\nCONTEXT: ..."
        $msg = $e->errorInfo[2] ?? $e->getMessage();
        if (preg_match('/ERROR:\s+([a-zA-Z0-9_.]+)/', $msg, $m)) return new ApiError($m[1]);
    }
    return $e;
}

function q(string $sql, array $params = []): PDOStatement
{
    $st = db()->prepare($sql);
    foreach (array_values($params) as $i => $v) {
        $type = is_bool($v) ? PDO::PARAM_BOOL : (is_int($v) ? PDO::PARAM_INT : (is_null($v) ? PDO::PARAM_NULL : PDO::PARAM_STR));
        $st->bindValue($i + 1, $v, $type);
    }
    $st->execute();
    return $st;
}

function q1(string $sql, array $params = []): ?array
{
    $row = q($sql, $params)->fetch();
    return $row === false ? null : $row;
}

function qv(string $sql, array $params = [])
{
    return q($sql, $params)->fetchColumn();
}

function jdec(?string $json, $default = [])
{
    if ($json === null || $json === '') return $default;
    $v = json_decode($json, true);
    return $v ?? $default;
}

function jenc($v): string
{
    return json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
}

/** Waktu dalam milidetik (sama dengan Date.now()). Bisa dipalsukan untuk tes. */
function now_ms(): int
{
    $fake = $GLOBALS['NEON_NOW'] ?? null;
    return $fake !== null ? (int) $fake : (int) floor(microtime(true) * 1000);
}

function iso_to_ms(?string $ts): ?int
{
    if ($ts === null) return null;
    return (int) round((float) (new DateTimeImmutable($ts))->format('U.u') * 1000);
}

function ms_to_iso(int $ms): string
{
    return (new DateTimeImmutable('@' . intdiv($ms, 1000)))->setTimezone(new DateTimeZone(NEON_TZ))->format('Y-m-d H:i:s') . sprintf('.%03d', $ms % 1000);
}

function local_dt(int $ms): DateTimeImmutable
{
    return (new DateTimeImmutable('@' . intdiv($ms, 1000)))->setTimezone(new DateTimeZone(NEON_TZ));
}

/** Sama dengan utils/format.js dayKey: "YYYY-<bulan 0-based>-<tanggal>" (waktu lokal). */
function day_key(int $ms): string
{
    $d = local_dt($ms);
    return $d->format('Y') . '-' . ((int) $d->format('n') - 1) . '-' . (int) $d->format('j');
}

function round2($v): float
{
    // Math.round(x * 100) / 100 seperti utils/format.js
    return floor(((float) $v) * 100 + 0.5) / 100;
}

function rand_hex(int $bytes): string
{
    return bin2hex(random_bytes($bytes));
}

function body(): array
{
    if (isset($GLOBALS['NEON_BODY_PARSED'])) return $GLOBALS['NEON_BODY_PARSED'];
    $raw = $GLOBALS['NEON_BODY'] ?? file_get_contents('php://input');
    $b = is_array($raw) ? $raw : jdec($raw ?: '{}', []);
    return $GLOBALS['NEON_BODY_PARSED'] = is_array($b) ? $b : [];
}

function arg(string $key, $default = null)
{
    $b = body();
    return array_key_exists($key, $b) ? $b[$key] : ($_GET[$key] ?? $default);
}

function log_event(string $type, ?string $userId, array $data = []): void
{
    q('INSERT INTO events (type, user_id, data) VALUES (?, ?, ?::jsonb)', [$type, $userId, jenc((object) $data)]);
}
