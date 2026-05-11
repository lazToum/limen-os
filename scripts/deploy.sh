#!/usr/bin/env bash
# LIMEN OS — deploy.sh
#
# Build → (scp to host) → git commit → push → (reload remote service)
#
# Usage:
#   ./scripts/deploy.sh                          # build + git push only
#   ./scripts/deploy.sh --host tam@limen.local # + scp + service reload
#   LIMEN_HOST=tam@limen.local make deploy   # same via Make
#
# Env vars:
#   LIMEN_HOST     user@host for scp + ssh (optional)
#   LIMEN_REMOTE   remote path (default /opt/limen/www)
#   LIMEN_SERVICE  systemd service to reload (default limen-static)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO_ROOT/apps/shell/dist"
REMOTE_HOST="${LIMEN_HOST:-}"
REMOTE_PATH="${LIMEN_REMOTE:-/opt/limen/www}"
REMOTE_SVC="${LIMEN_SERVICE:-limen-static}"

# ── parse args ────────────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --host=*) REMOTE_HOST="${arg#--host=}" ;;
    --host)   shift; REMOTE_HOST="${1:-}" ;;
    --help|-h)
      grep '^#' "$0" | sed 's/^# *//'
      exit 0
      ;;
  esac
done

ts() { date '+%Y-%m-%dT%H:%M:%S'; }
step() { echo ""; echo "▶ $*"; }
ok()   { echo "  ✓ $*"; }

# ── 1. build frontend ─────────────────────────────────────────────────────────
step "Building shell frontend..."
cd "$REPO_ROOT/apps/shell"
bun run build
ok "dist/ ready at $DIST"

# ── 2. scp to remote host (optional) ─────────────────────────────────────────
if [[ -n "$REMOTE_HOST" ]]; then
  step "Deploying to $REMOTE_HOST:$REMOTE_PATH ..."
  # shellcheck disable=SC2029
  ssh "$REMOTE_HOST" "mkdir -p $REMOTE_PATH"
  rsync -az --delete \
    --exclude='.git' \
    "$DIST/" "$REMOTE_HOST:$REMOTE_PATH/"
  ok "Files synced"

  step "Reloading $REMOTE_SVC on $REMOTE_HOST ..."
  # shellcheck disable=SC2029
  ssh "$REMOTE_HOST" "systemctl reload $REMOTE_SVC 2>/dev/null || systemctl restart $REMOTE_SVC" || true
  ok "Service reloaded"
else
  echo ""
  echo "  (no LIMEN_HOST set — skipping remote deploy)"
  echo "  To deploy remotely: LIMEN_HOST=user@host make deploy"
fi

# ── 3. git commit + push ──────────────────────────────────────────────────────
step "Committing and pushing..."
cd "$REPO_ROOT"
git add -A
if ! git diff --cached --quiet; then
  MSG="deploy: $(ts)"
  git commit -m "$MSG"
  git push origin main
  ok "Pushed: $MSG"
else
  ok "Nothing to commit — already up to date"
  git push origin main 2>/dev/null || true
fi

echo ""
echo "✓ Deploy complete at $(ts)"
