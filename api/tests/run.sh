#!/usr/bin/env bash
# Tes API: DB kosong (tanpa extension, seperti hosting) + schema + fungsi + migrasi, lalu tes PHP & RNG.
# Butuh PostgreSQL lokal yang bisa diakses user saat ini (PGHOST/PGUSER) atau lewat sudo -u postgres.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${TEST_DB:-neon_api_test}
PSQL="psql -X -q -v ON_ERROR_STOP=1"
run() { if [ "$(id -u)" = 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
run "dropdb --if-exists $DB && createdb $DB"
run "$PSQL -d $DB -c \"SET neon.no_ext = 'on'\" -f '$PWD/db/compat.sql' -f '$PWD/db/schema.sql' -f '$PWD/db/functions.sql'"
for f in db/migrations/*.sql; do run "$PSQL -d $DB -f '$PWD/$f'"; done
run "$PSQL -d $DB -c \"DO \\\$\\\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_test') THEN CREATE ROLE neon_test LOGIN PASSWORD 'neon_test'; END IF; END \\\$\\\$\" -c 'GRANT ALL ON ALL TABLES IN SCHEMA public TO neon_test' -c 'GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO neon_test' -c 'GRANT ALL ON SCHEMA public TO neon_test' -c 'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO neon_test'"
CFG=$(mktemp --suffix=.php)
cat > "$CFG" <<PHP
<?php return ['db' => ['host' => 'localhost', 'port' => 5432, 'name' => '$DB', 'user' => 'neon_test', 'pass' => 'neon_test']];
PHP
node api/tests/rng_compare.mjs
NEON_CONFIG="$CFG" php api/tests/api_test.php
NEON_CONFIG="$CFG" php api/tests/stage2_test.php
NEON_CONFIG="$CFG" php api/tests/stage3_test.php
NEON_CONFIG="$CFG" php api/tests/stage5_test.php
NEON_CONFIG="$CFG" php api/tests/stage4_test.php
NEON_CONFIG="$CFG" NEON_MAIL_LOG="$(mktemp)" php api/tests/stage6_test.php
rm -f "$CFG"
