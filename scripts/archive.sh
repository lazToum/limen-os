#!/usr/bin/env bash
# archive.sh — Create a source-only snapshot of LIMEN OS.
#
# Usage:
#   ./scripts/archive.sh                  # → /tmp/limen-os-YYYYMMDD-HHMMSS.tar.gz
#   ./scripts/archive.sh my-snapshot      # → /tmp/my-snapshot.tar.gz
#   ./scripts/archive.sh --dist           # include apps/shell/dist/ in archive
#   ARCHIVE_DIR=~/backups ./scripts/archive.sh
#
# Excludes all build artifacts (target/, node_modules/, dist/, etc.)

set -euo pipefail
trap '' PIPE   # suppress SIGPIPE from head closing pipes early

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCHIVE_DIR="${ARCHIVE_DIR:-/tmp}"
INCLUDE_DIST=false
NAME=""

for arg in "$@"; do
  case "$arg" in
    --dist) INCLUDE_DIST=true ;;
    --*)    echo "Unknown flag: $arg" >&2; exit 1 ;;
    *)      NAME="$arg" ;;
  esac
done

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
NAME="${NAME:-limen-os-${TIMESTAMP}}"
OUT="${ARCHIVE_DIR}/${NAME}.tar.gz"

# ── Core exclusions (always applied) ─────────────────────────────────────────
EXCL=(
  # Rust — by far the largest (10 GB+)
  --exclude="./target"
  # JS
  --exclude="./apps/shell/node_modules"
  --exclude="./packages/*/node_modules"
  --exclude="./node_modules"
  # Flutter
  --exclude="./apps/mobile/build"
  --exclude="./apps/mobile/.dart_tool"
  --exclude="./apps/mobile/android"
  --exclude="./apps/mobile/ios"
  --exclude="./apps/mobile/linux"
  --exclude="./apps/mobile/windows"
  --exclude="./apps/mobile/macos"
  # Editors / OS noise
  --exclude="./.git"
  --exclude="./.vscode"
  --exclude="./.idea"
  --exclude="./.DS_Store"
  # Secrets
  --exclude="./.env"
  --exclude="./.env.local"
  --exclude="./*.pem"
  --exclude="./*.key"
)

# Built frontend: excluded by default, included with --dist
if ! $INCLUDE_DIST; then
  EXCL+=(
    --exclude="./apps/shell/dist"
    --exclude="./packages/*/dist"
  )
fi

echo "→ Archiving $(basename "$REPO_ROOT") → ${OUT}"
echo "  (dist/ $(${INCLUDE_DIST} && echo included || echo excluded))"

# -C into the repo root so exclude paths (./target etc.) resolve correctly.
# --transform renames the root dir in the archive from '.' to $NAME.
tar -czf "$OUT" \
  "${EXCL[@]}" \
  -C "$REPO_ROOT" \
  --transform "s|^\./|${NAME}/|" \
  .

SIZE="$(du -sh "$OUT" | cut -f1)"
echo "✓ Done: ${OUT}  (${SIZE})"
echo ""
echo ""
echo "Contents (first 25 files):"
tar -tzf "$OUT" | grep -v '/$' 2>/dev/null | head -25 || true
echo "  ..."
# shellcheck disable=SC2126
TOTAL="$(tar -tzf "$OUT" | grep -v '/$' | wc -l)"
echo "  ${TOTAL} total files"
