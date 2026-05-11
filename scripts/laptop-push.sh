#!/usr/bin/env bash
# laptop-push.sh — rsync source code FROM Limen OS → developer laptop, then git-commit.
#
# The inverse of ec2-push.sh: we're already on the server/container and want to
# push the current working tree to a laptop that has git set up.
#
# Usage:
#   bash scripts/laptop-push.sh [push|smoke]
#   make pull                                    # full push to laptop
#   LAPTOP_HOST=tam@192.168.1.50 make pull
#
# Key env vars (put in .laptop.env or export):
#   LAPTOP_HOST     user@ip-or-hostname   (required)
#   LAPTOP_KEY      path to ssh key       (optional, if not in ssh-agent)
#   LAPTOP_DIR      ~/limen             (default — destination on laptop)
#   COMMIT_MSG      ""                    (optional commit message; auto-generated if empty)
#   GIT_PUSH        0|1                   (default 0 — set 1 to also git push on laptop)
#   GIT_REMOTE      origin                (default)
#   GIT_BRANCH      ""                    (default: whatever the laptop repo's current branch)

# shellcheck disable=SC2015,SC2046,SC1091
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[[ -f "$REPO_ROOT/.laptop.env" ]] && source "$REPO_ROOT/.laptop.env"

# ── Config ─────────────────────────────────────────────────────────────────────
LAPTOP_HOST="${LAPTOP_HOST:-}"
LAPTOP_KEY="${LAPTOP_KEY:-}"
LAPTOP_DIR="${LAPTOP_DIR:-~/limen}"
COMMIT_MSG="${COMMIT_MSG:-}"
GIT_PUSH="${GIT_PUSH:-0}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-}"
LAPTOP_CMD="${LAPTOP_CMD:-}"       # optional command to run on laptop after sync (e.g. "make dev")
MODE="${1:-push}"   # smoke | push

# ── Helpers ────────────────────────────────────────────────────────────────────
RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' CYAN='\033[0;36m' NC='\033[0m'
step()  { echo; echo -e "${CYAN}━━ $* ━━${NC}"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
die()   { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }

ssh_opts() {
    local opts=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10)
    [[ -n "$LAPTOP_KEY" ]] && opts+=(-i "$LAPTOP_KEY")
    echo "${opts[@]}"
}

laptop() {
    # shellcheck disable=SC2029
    ssh $(ssh_opts) "$LAPTOP_HOST" "$@"
}

# ── SMOKE ──────────────────────────────────────────────────────────────────────
smoke_test() {
    step "Smoke test (local)"
    cd "$REPO_ROOT"

    echo "  TypeScript..."
    bun run check && ok "TS clean" || warn "TS check had warnings"

    echo "  Cargo check..."
    cargo check -p limen-core -p limen-ai -p limen-voice 2>&1 \
        | grep -E "^error" && die "Cargo errors" || true
    ok "Rust clean"

    [[ -f "$REPO_ROOT/apps/shell/dist/index.html" ]] \
        && ok "dist/ present" \
        || warn "dist/ not built — laptop will get source only"

    ok "Smoke passed."
}

# ── RSYNC ──────────────────────────────────────────────────────────────────────
do_rsync() {
    step "rsync → $LAPTOP_HOST:$LAPTOP_DIR"

    SSH_CMD="ssh $(ssh_opts)"

    # Ensure destination dir exists on laptop
    laptop "mkdir -p $LAPTOP_DIR"

    rsync -az --progress \
        --delete --force \
        -e "$SSH_CMD" \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='.bun' \
        --exclude='target' \
        --exclude='apps/shell/src-tauri/target' \
        --exclude='apps/mobile/.dart_tool' \
        --exclude='apps/mobile/build' \
        --exclude='.ec2.env' \
        --exclude='.laptop.env' \
        --exclude='.env' \
        --exclude='.local/' \
        --exclude='.claude/' \
        --exclude='certs/' \
        --exclude='android/' \
        --exclude='dist/' \
        --exclude='staging.zip' \
        --exclude='*.zip' \
        "$REPO_ROOT/" \
        "$LAPTOP_HOST:$LAPTOP_DIR/"

    ok "Code synced to laptop"
}

# ── GIT COMMIT ON LAPTOP ───────────────────────────────────────────────────────
do_git() {
    step "git commit on laptop"

    local timestamp
    timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
    local msg="${COMMIT_MSG:-"chore: sync from limen-os @ ${timestamp}"}"

    laptop bash -s << GIT
set -e
cd "$LAPTOP_DIR"

if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "  Initialising new git repo..."
    git init -b main
    git remote add origin "" 2>/dev/null || true
fi

git add -A

if git diff --cached --quiet; then
    echo "  Nothing to commit — working tree clean."
else
    git commit -m "$msg

Co-Authored-By: LIMEN OS <limen@waldiez.io>
"
    echo "  Committed: $msg"
fi

if [[ "$GIT_PUSH" == "1" ]]; then
    BRANCH=\$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")
    TARGET_BRANCH="${GIT_BRANCH:-\$BRANCH}"
    git push "$GIT_REMOTE" "\$TARGET_BRANCH" \
        && echo "  Pushed to $GIT_REMOTE/\$TARGET_BRANCH" \
        || echo "⚠  git push failed (no remote configured?)"
fi
GIT

    ok "git done on laptop"
}

# ── ENTRY ──────────────────────────────────────────────────────────────────────
case "$MODE" in
    smoke)
        smoke_test
        ;;
    push)
        [[ -n "$LAPTOP_HOST" ]] || die "LAPTOP_HOST not set. Export it or add it to .laptop.env"

        smoke_test
        do_rsync
        do_git

        if [[ -n "$LAPTOP_CMD" ]]; then
            step "Running on laptop: $LAPTOP_CMD"
            laptop "cd $LAPTOP_DIR && $LAPTOP_CMD"
            ok "Remote command done"
        fi

        echo
        ok "Done — laptop at $LAPTOP_HOST:$LAPTOP_DIR is up to date."
        ;;
    *)
        die "Unknown mode: $MODE. Use: smoke | push"
        ;;
esac
