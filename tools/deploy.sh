#!/usr/bin/env bash
# Siapkan branch `deploy` (isi: index.html, api/, .htaccess) dari build standalone, lalu push.
# Cron di hosting (~/bin/neon-sync.sh) menarik branch ini ke public_html dalam ±7 menit.
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
BUILD_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Latest update-log entry (src/config/changelog.js): shown in the footer and pushed to open tabs via version.json.
LATEST_JSON="$(node -e "const s=require('fs').readFileSync('$ROOT/src/config/changelog.js','utf8').replace(/^[\\s\\S]*?export default/,''); process.stdout.write(JSON.stringify(eval('('+s+')')[0]))")"
APP_VERSION="$(node -e "process.stdout.write(JSON.parse(process.argv[1]).version)" "$LATEST_JSON")"

assemble() {
  local dir=$1
  # Build standalone dibuat untuk artifact (tanpa kerangka dokumen) → tambahkan doctype, charset,
  # viewport, dan flag mode server (window.NEON_API) sebelum bundle dimuat.
  {
    printf '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    printf '<meta name="build" content="%s">\n' "$MAIN_SHA"
    printf '<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="icon" href="/favicon.ico" sizes="any">\n'
    printf '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n'
    printf '<script>window.NEON_API = "/api"; window.NEON_BUILD = {"sha": "%s", "at": "%s", "version": "%s"};</script>\n' "$MAIN_SHA" "$BUILD_AT" "$APP_VERSION"
    cat "$SRC"
    printf '\n</html>\n'
  } > "$dir/index.html"

  cp "$ROOT"/public/* "$dir/"
  # Open tabs poll this file; a new sha means an update was released.
  printf '{"sha": "%s", "at": "%s", "version": "%s", "entry": %s}\n' "$MAIN_SHA" "$BUILD_AT" "$APP_VERSION" "$LATEST_JSON" > "$dir/version.json"
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
<FilesMatch "^(index\.html|version\.json)?$">
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
  # Mirror mode: add the cPanel files that live only on the host, so the copy equals public_html 1:1.
  cp "$ROOT"/tools/hosting/public_html-extra/* "$OUT_ONLY/"
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
echo "Branch deploy dipush (build ${MAIN_SHA}). Hosting menarik otomatis dalam ±7 menit."
