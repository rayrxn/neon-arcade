#!/bin/bash
# Dijalankan neon-sync.sh setelah ~/neon-src berubah. Memasang/migrasi database.
# Kredensial: ~/.pgpass (localhost:5432:arcadebe_neon:arcadebe_app:<password>), chmod 600.
set -euo pipefail
SRC="$HOME/neon-src/db"
DB=arcadebe_neon
PGU=arcadebe_app
PSQL=$(command -v psql || ls /usr/pgsql-*/bin/psql 2>/dev/null | tail -1 || true)
[ -n "$PSQL" ] || { echo "$(date '+%F %T') psql tidak ditemukan"; exit 1; }
q() { "$PSQL" -h localhost -U "$PGU" -d "$DB" -X -q -v ON_ERROR_STOP=1 "$@"; }

if [ "$(q -tAc "select to_regclass('public.neon_migrations') is not null")" != "t" ]; then
  echo "$(date '+%F %T') pasang database awal…"
  q -1 -f "$SRC/compat.sql" -f "$SRC/schema.sql" -f "$SRC/functions.sql" \
    -c "CREATE TABLE neon_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  # Database baru: reset rilis lama tidak perlu dijalankan.
  for f in "$SRC"/resets/*.testers "$SRC"/resets/*.global; do
    [ -e "$f" ] && q -c "INSERT INTO neon_migrations(name) VALUES ('reset:$(basename "$f")') ON CONFLICT DO NOTHING"
  done
  echo "$(date '+%F %T') database awal terpasang"
fi

for f in "$SRC"/migrations/*.sql; do
  [ -e "$f" ] || continue
  n=$(basename "$f")
  if [ "$(q -tAc "select count(*) from neon_migrations where name = '$n'")" = "0" ]; then
    q -1 -f "$f" -c "INSERT INTO neon_migrations(name) VALUES ('$n')"
    echo "$(date '+%F %T') migrasi $n selesai"
  fi
done
# Reset rilis (db/resets/<tanggal>-<label>.<testers|global>), masing-masing sekali.
PHP=$(command -v php || ls /opt/alt/php81/usr/bin/php /usr/local/bin/php 2>/dev/null | head -1 || true)
for f in "$SRC"/resets/*.testers "$SRC"/resets/*.global; do
  [ -e "$f" ] || continue
  n="reset:$(basename "$f")"
  if [ "$(q -tAc "select count(*) from neon_migrations where name = '$n'")" = "0" ]; then
    [ -n "$PHP" ] || { echo "$(date '+%F %T') php tidak ditemukan, reset $n dilewati"; break; }
    scope="${f##*.}"
    "$PHP" "$HOME/neon-src/tools/hosting/release-reset.php" "$scope" "$(head -c 300 "$f")"
    q -c "INSERT INTO neon_migrations(name) VALUES ('$n')"
    echo "$(date '+%F %T') $n selesai"
  fi
done
touch "$HOME/.neon-db-ready"
