#!/bin/bash
# Dipasang di hosting sebagai ~/bin/neon-sync.sh, dijalankan cron tiap 2 menit.
# 1) public_html  ← branch `deploy` (website)
# 2) ~/neon-src   ← branch `main`   (kode + SQL, di luar web root)
# 3) jalankan ~/neon-src/tools/hosting/after-sync.sh (migrasi DB) kalau main berubah
set -u
REPO=https://github.com/rayrxn/neon-arcade.git
LOG="$HOME/logs/neon-sync.log"
mkdir -p "$HOME/logs"
log() { echo "$(date '+%F %T') $*" >> "$LOG"; }

exec 9>"$HOME/.neon-sync-v2.lock"
if ! flock -n 9; then
  # Putaran sebelumnya masih jalan. Catat sesekali saja supaya log tidak penuh.
  [ "$(date +%M)" = "00" ] && log "lewati: putaran sebelumnya masih berjalan"
  exit 0
fi
# Jangan pernah menggantung: git di cron tanpa prompt & dengan batas waktu.
export GIT_TERMINAL_PROMPT=0
G() { timeout 120 git "$@"; }

sync_dir() {
  local dir=$1 br=$2 old new
  mkdir -p "$dir"
  [ -d "$dir/.git" ] || G init -q "$dir"
  old=$(G -C "$dir" rev-parse -q --verify HEAD 2>/dev/null || true)
  if ! G -C "$dir" fetch -q --depth=1 "$REPO" "$br" 2>>"$LOG"; then log "fetch $br gagal"; return 2; fi
  new=$(G -C "$dir" rev-parse FETCH_HEAD)
  [ "$old" = "$new" ] && return 1
  if G -C "$dir" checkout -q -f FETCH_HEAD 2>>"$LOG"; then
    log "$br → ${new:0:7} di $dir"
    return 0
  fi
  log "checkout $br gagal di $dir"
  return 2
}

sync_dir "$HOME/public_html" deploy || true
rc=0
sync_dir "$HOME/neon-src" main || rc=$?
if [ $rc -eq 0 ] || [ ! -f "$HOME/.neon-db-ready" ]; then
  [ -x "$HOME/neon-src/tools/hosting/after-sync.sh" ] && timeout 300 bash "$HOME/neon-src/tools/hosting/after-sync.sh" >> "$LOG" 2>&1
fi
