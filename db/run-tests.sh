#!/usr/bin/env bash
# Uji database: buat DB kosong, pasang schema + fungsi, jalankan semua tes.
# Pakai variabel standar psql (PGHOST, PGPORT, PGUSER). DB `neon_arcade_test` dibuat ulang.
set -euo pipefail
cd "$(dirname "$0")"
DB=${TEST_DB:-neon_arcade_test}
dropdb --if-exists "$DB" && createdb "$DB"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f schema.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f functions.sql
psql -q -d "$DB" -f functions_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //' | tee /tmp/neon-db-tests.log | grep -E 'PASS|FAIL|SUMMARY'
psql -q -d "$DB" -f constraints_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //' | tee -a /tmp/neon-db-tests.log | grep -E 'PASS|FAIL'
! grep -q 'FAIL' /tmp/neon-db-tests.log
