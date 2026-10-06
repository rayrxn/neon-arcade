#!/usr/bin/env bash
# Tes mode server end-to-end: DB baru (tanpa extension, seperti hosting) + semua migrasi,
# bundle deploy disusun, server PHP lokal dijalankan, lalu tests/server-mode.cjs.
# Butuh: PostgreSQL lokal (sudo -u postgres / user saat ini), php, node, dist/neon-arcade-standalone.html.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=${E2E_DB:-neon_e2e}
PORT=${E2E_PORT:-8099}
WORK=$(mktemp -d)
run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run "dropdb --if-exists $DB && createdb $DB"
FILES="-f '$PWD/db/compat.sql' -f '$PWD/db/schema.sql' -f '$PWD/db/functions.sql'"
for f in db/migrations/*.sql; do FILES="$FILES -f '$PWD/$f'"; done
run "psql -X -q -v ON_ERROR_STOP=1 -d $DB -c \"SET neon.no_ext = 'on'\" $FILES"
run "psql -X -q -d $DB -c \"DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_test') THEN CREATE ROLE neon_test LOGIN PASSWORD 'neon_test'; END IF; END \\\$\\\$\" -c 'GRANT ALL ON ALL TABLES IN SCHEMA public TO neon_test' -c 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO neon_test' -c 'GRANT ALL ON SCHEMA public TO neon_test' -c 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO neon_test'"
bash tools/deploy.sh --out "$WORK/site" >/dev/null
cat > "$WORK/config.php" <<PHP
<?php return ['db' => ['host' => 'localhost', 'port' => 5432, 'name' => '$DB', 'user' => 'neon_test', 'pass' => 'neon_test']];
PHP
cat > "$WORK/router.php" <<'PHP'
<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api')) { require __DIR__ . '/site/api/index.php'; return true; }
$file = __DIR__ . '/site' . $path;
if ($path !== '/' && is_file($file)) return false;
header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/site/index.html');
PHP
NEON_CONFIG="$WORK/config.php" php -S 127.0.0.1:$PORT -t "$WORK/site" "$WORK/router.php" >"$WORK/server.log" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null; rm -rf "$WORK"' EXIT
for i in $(seq 1 30); do curl -s -m 1 "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.2; done
NEON_E2E_API="http://127.0.0.1:$PORT/api" node tests/server-mode.cjs
