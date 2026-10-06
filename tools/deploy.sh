#!/usr/bin/env bash
# Siapkan branch `deploy` (isi: index.html + .htaccess) dari build standalone, lalu push.
# Domainesia Git Deploy menarik branch ini ke public_html/arcadebet.my.id.
# Pemakaian: bash tools/deploy.sh   (jalankan dari root repo, setelah commit di main)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/neon-arcade-standalone.html"
WORK="$(mktemp -d)"
trap 'git -C "$ROOT" worktree remove --force "$WORK" 2>/dev/null || true' EXIT

[ -f "$SRC" ] || { echo "Tidak ada $SRC — jalankan npm run build:standalone dulu"; exit 1; }
MAIN_SHA="$(git -C "$ROOT" rev-parse --short HEAD)"

git -C "$ROOT" fetch -q origin deploy || true
if git -C "$ROOT" rev-parse -q --verify origin/deploy >/dev/null; then
  git -C "$ROOT" worktree add -q -B deploy "$WORK" origin/deploy
else
  git -C "$ROOT" worktree add -q --orphan -b deploy "$WORK"
fi

# Build standalone dibuat untuk artifact (tanpa kerangka dokumen) → tambahkan doctype, charset, viewport.
{
  printf '<!doctype html>\n<html lang="id">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
  printf '<meta name="build" content="%s">\n' "$MAIN_SHA"
  cat "$SRC"
  printf '\n</html>\n'
} > "$WORK/index.html"

cat > "$WORK/.htaccess" <<'EOF'
DirectoryIndex index.html
Options -Indexes
AddDefaultCharset UTF-8

# Jangan tampilkan folder/file git
RedirectMatch 404 /\.git

# index.html selalu dicek ulang supaya update langsung terlihat
<FilesMatch "^(index\.html)?$">
  Header set Cache-Control "no-cache, must-revalidate"
</FilesMatch>

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript
</IfModule>
EOF

cd "$WORK"
git add -A
if git diff --cached --quiet; then
  echo "Tidak ada perubahan untuk dideploy."
  exit 0
fi
git commit -q -m "Deploy: standalone build ${MAIN_SHA}${DEPLOY_COMMIT_TRAILER:+

$DEPLOY_COMMIT_TRAILER}"
git push -q origin deploy
echo "Branch deploy dipush (build ${MAIN_SHA}). Picu Git Deploy di Domainesia (id 2539cab6)."
