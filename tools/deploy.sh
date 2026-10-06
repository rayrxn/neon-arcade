#!/usr/bin/env bash
# Siapkan branch `deploy` (isi: index.html, api/, .htaccess) dari build standalone, lalu push.
# Cron di hosting (~/bin/neon-sync.sh) menarik branch ini ke public_html dalam ±2 menit.
#
# Pemakaian:
#   bash tools/deploy.sh                  # build + push branch deploy
#   bash tools/deploy.sh --out DIR        # hanya susun isi deploy ke DIR (untuk tes lokal), tanpa git
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/dist/neon-arcade-standalone.html"
OUT_ONLY=""
[ "${1:-}" = "--out" ] && OUT_ONLY="${2:?--out butuh folder}"

if [ -n "${TAILWIND_BIN:-}" ] || [ ! -f "$SRC" ]; then
  node "$ROOT/tools/standalone/build.mjs" "$SRC" >/dev/null
fi
[ -f "$SRC" ] || { echo "Build gagal: $SRC tidak ada"; exit 1; }
MAIN_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"

assemble() {
  local dir=$1
  # Build standalone dibuat untuk artifact (tanpa kerangka dokumen) → tambahkan doctype, charset,
  # viewport, dan flag mode server (window.NEON_API) sebelum bundle dimuat.
  {
    printf '<!doctype html>\n<html lang="id">\n<head>\n<meta charset="utf-8">\n'
    printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    printf '<meta name="build" content="%s">\n' "$MAIN_SHA"
    printf '<script>window.NEON_API = "/api";</script>\n'
    cat "$SRC"
    printf '\n</html>\n'
  } > "$dir/index.html"

  rm -rf "$dir/api"
  mkdir -p "$dir/api"
  cp -r "$ROOT/api/index.php" "$ROOT/api/.htaccess" "$ROOT/api/lib" "$dir/api/"

  cat > "$dir/.htaccess" <<'EOF'
DirectoryIndex index.html
Options -Indexes
AddDefaultCharset UTF-8

# Jangan tampilkan folder/file git, log, dan konfigurasi PHP
RedirectMatch 404 /\.git
<FilesMatch "^(error_log|php\.ini|\.user\.ini)$">
  Require all denied
</FilesMatch>

# index.html selalu dicek ulang supaya update langsung terlihat
<FilesMatch "^(index\.html)?$">
  Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
</IfModule>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json
</IfModule>
EOF
}

if [ -n "$OUT_ONLY" ]; then
  mkdir -p "$OUT_ONLY"
  assemble "$OUT_ONLY"
  echo "Isi deploy disusun di $OUT_ONLY (build ${MAIN_SHA})"
  exit 0
fi

WORK="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WORK" 2>/dev/null || true' EXIT
git -C "$ROOT" fetch -q origin deploy || true
if git -C "$ROOT" rev-parse -q --verify origin/deploy >/dev/null; then
  git -C "$ROOT" worktree add -q -B deploy "$WORK" origin/deploy
else
  git -C "$ROOT" worktree add -q --orphan -b deploy "$WORK"
fi
assemble "$WORK"

cd "$WORK"
git add -A
if git diff --cached --quiet; then
  echo "Tidak ada perubahan untuk dideploy."
  exit 0
fi
git commit -q -m "Deploy: build ${MAIN_SHA}${DEPLOY_COMMIT_TRAILER:+

$DEPLOY_COMMIT_TRAILER}"
git push -q origin deploy
echo "Branch deploy dipush (build ${MAIN_SHA}). Hosting menarik otomatis dalam ±2 menit."
