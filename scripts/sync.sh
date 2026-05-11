#!/usr/bin/env bash
# LIMEN OS — auto-sync to private GitHub repo.
# Pulls remote changes (rebase), stages local edits, commits if needed, pushes.

set -euo pipefail

REPO="${LIMEN_REPO:-$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null || pwd)}"
LOG="$REPO/.sync.log"
MAX_LINES=200

cd "$REPO"

# Rotate log
if [[ -f "$LOG" ]] && [[ $(wc -l < "$LOG") -gt $MAX_LINES ]]; then
  tail -n $MAX_LINES "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

ts() { date '+%Y-%m-%dT%H:%M:%S'; }

# Pull remote changes first (rebase keeps history clean).
if ! git pull --rebase --autostash origin main >> "$LOG" 2>&1; then
  echo "$(ts) [sync] pull failed — skipping push" >> "$LOG"
  exit 0
fi

# Stage everything except secrets (already handled by .gitignore).
git add -A

# Only commit and push if there are staged changes.
if ! git diff --cached --quiet; then
  MSG="auto-sync: $(ts)"
  git commit -m "$MSG" >> "$LOG" 2>&1
  git push origin main >> "$LOG" 2>&1
  echo "$(ts) [sync] pushed: $MSG" >> "$LOG"
else
  echo "$(ts) [sync] nothing to push" >> "$LOG"
fi
