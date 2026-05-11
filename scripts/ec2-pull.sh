#!/usr/bin/env bash
# ec2-pull.sh — rsync FROM Limen OS server → this machine, then git commit.
#
# Run this on your laptop (or any dev machine) to pull the latest code from
# the Limen OS server into the current directory.
#
# Usage (on your laptop):
#   bash scripts/ec2-pull.sh            # uses .ec2.env / env vars
#   EC2_HOST=limen@1.2.3.4 bash scripts/ec2-pull.sh
#   make ec2-pull                       # if you have the Makefile locally
#
# Key env vars (put in .ec2.env or export):
#   EC2_HOST      user@ip-or-hostname  (required — the Limen OS server)
#   EC2_KEY       path to ssh key      (optional)
#   REMOTE_DIR    /opt/limen         (default — source on server)
#   LOCAL_DIR     .                    (default — destination, current dir)
#   COMMIT        1|0                  (default 1 — git add+commit after sync)
#   COMMIT_MSG    ""                   (auto-generated if empty)
#   GIT_PUSH      0|1                  (default 0 — also push after commit)
#   GIT_REMOTE    origin               (default)
#   POST_CMD      ""                   (optional command to run locally after sync)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .ec2.env from repo root if present
# shellcheck disable=SC1091
[[ -f "$REPO_ROOT/.ec2.env" ]] && source "$REPO_ROOT/.ec2.env"

# ── Config ─────────────────────────────────────────────────────────────────────
EC2_HOST="${EC2_HOST:-}"
EC2_KEY="${EC2_KEY:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/limen}"
LOCAL_DIR="${LOCAL_DIR:-$REPO_ROOT}"
COMMIT="${COMMIT:-1}"
COMMIT_MSG="${COMMIT_MSG:-}"
GIT_PUSH="${GIT_PUSH:-0}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
POST_CMD="${POST_CMD:-}"

# ── Helpers ────────────────────────────────────────────────────────────────────
RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' CYAN='\033[0;36m' NC='\033[0m'
step()  { echo; echo -e "${CYAN}━━ $* ━━${NC}"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
die()   { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }

ssh_opts() {
    local opts=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes -o ConnectTimeout=10)
    [[ -n "$EC2_KEY" ]] && opts+=(-i "$EC2_KEY")
    printf '%s\n' "${opts[@]}"
}

SSH_CMD="ssh $(ssh_opts | tr '\n' ' ')"

# ── RSYNC ──────────────────────────────────────────────────────────────────────
do_rsync() {
    step "rsync ← $EC2_HOST:$REMOTE_DIR → $LOCAL_DIR"

    mkdir -p "$LOCAL_DIR"

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
        "$EC2_HOST:$REMOTE_DIR/" \
        "$LOCAL_DIR/"

    ok "Synced from server"
}

# ── GIT COMMIT (local) ─────────────────────────────────────────────────────────
do_git() {
    step "git commit (local)"
    cd "$LOCAL_DIR"

    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        warn "Not a git repo — initializing..."
        git init -b main
    fi

    git add -A

    if git diff --cached --quiet; then
        ok "Nothing to commit — already up to date."
        return
    fi

    local timestamp
    timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
    local msg="${COMMIT_MSG:-"chore: pull from limen-os @ ${timestamp}"}"

    git commit -m "$msg

Co-Authored-By: LIMEN OS <limen@waldiez.io>
"
    ok "Committed: $msg"

    if [[ "$GIT_PUSH" == "1" ]]; then
        local branch
        branch="$(git symbolic-ref --short HEAD 2>/dev/null || echo "main")"
        # shellcheck disable=SC2015
        git push "$GIT_REMOTE" "$branch" \
            && ok "Pushed to $GIT_REMOTE/$branch" \
            || warn "git push failed (remote not configured?)"
    fi
}

# ── ENTRY ──────────────────────────────────────────────────────────────────────
[[ -n "$EC2_HOST" ]] || die "EC2_HOST not set. Export it or add to .ec2.env:\n  EC2_HOST=limen@<server-ip>"

do_rsync

[[ "$COMMIT" == "1" ]] && do_git

if [[ -n "$POST_CMD" ]]; then
    step "Running: $POST_CMD"
    cd "$LOCAL_DIR" && eval "$POST_CMD"
    ok "Done"
fi

echo
ok "Pull complete — $LOCAL_DIR is up to date with $EC2_HOST:$REMOTE_DIR"
