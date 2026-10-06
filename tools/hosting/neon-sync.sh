#!/bin/bash
# Dipasang di hosting sebagai ~/bin/neon-sync.sh, dijalankan cron tiap 2 menit.
# 1) public_html  ← branch `deploy` (website)
# 2) ~/neon-src   ← branch `main`   (kode + SQL, di luar web root)
# 3) jalankan ~/neon-src/tools/hosting/after-sync.sh (migrasi DB) kalau main berubah
set -u
REPO=https://github.com/rayrxn/neon-arcade.git
LOG="$HOME/logs/neon-sync.log"
mkdir -p "$HOME/logs"
exec 9>"$HOME/.neon-sync.lock"
flock -n 9 || exit 0

log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

sync_dir() {
  local dir=$1 br=$2 old new
  mkdir -p "$dir"
  [ -d "$dir/.git" ] || git init -q "$dir"
  old=$(git -C "$dir" rev-parse -q --verify HEAD 2>/dev/null || true)
  if ! git -C "$dir" fetch -q --depth=1 "$REPO" "$br" 2>>"$LOG"; then log "fetch $br gagal"; return 2; fi
  new=$(git -C "$dir" rev-parse FETCH_HEAD)
  [ "$old" = "$new" ] && return 1
  git -C "$dir" checkout -q -f FETCH_HEAD && log "$br → ${new:0:7} di $dir"
  return 0
}

sync_dir "$HOME/public_html" deploy
sync_dir "$HOME/neon-src" main
rc=$?
if [ $rc -eq 0 ] || [ ! -f "$HOME/.neon-db-ready" ]; then
  [ -x "$HOME/neon-src/tools/hosting/after-sync.sh" ] && bash "$HOME/neon-src/tools/hosting/after-sync.sh" >> "$LOG" 2>&1
fi
