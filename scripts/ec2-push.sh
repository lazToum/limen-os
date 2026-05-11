#!/usr/bin/env bash
# ec2-push.sh — Build locally, smoke-test, then rsync to EC2.
#
# First push  → creates 'limen' user with sudo + runs setup.sh on remote.
# Subsequent  → rsync + service reload only.
#
# Usage:
#   bash scripts/ec2-push.sh                          # uses env vars below
#   EC2_HOST=ubuntu@1.2.3.4 bash scripts/ec2-push.sh
#   make smoke                                         # local smoke-test only
#   make push                                          # full build + rsync
#
# Key env vars (put in .ec2.env or export in your shell):
#   EC2_HOST        user@ip-or-hostname   (required)
#   EC2_KEY         path to .pem key      (optional, if not in ssh-agent)
#   DOMAIN_NAME     io.waldiez.io         (required for first-time setup)
#   CERTBOT_EMAIL   you@waldiez.io        (optional)
#   SKIP_CERTBOT    0|1                   (default 0)
#   REMOTE_DIR      /opt/limen          (default)
#   LIMEN_USER    limen               (service user created on remote)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── Load local .ec2.env if present ───────────────────────────────────────────
# shellcheck disable=SC1091
[[ -f "$REPO_ROOT/.ec2.env" ]] && source "$REPO_ROOT/.ec2.env"

# ── Config ────────────────────────────────────────────────────────────────────
EC2_HOST="${EC2_HOST:-limen@io.waldiez.io}"
EC2_KEY="${EC2_KEY:-}"
DOMAIN_NAME="${DOMAIN_NAME:-io.waldiez.io}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
SKIP_CERTBOT="${SKIP_CERTBOT:-0}"
REMOTE_DIR="${REMOTE_DIR:-/opt/limen}"
LIMEN_USER="${LIMEN_USER:-limen}"
# Path to agentflow source (sibling project — copied to tools/agentflow/ on remote)
AGENTFLOW_DIR="${AGENTFLOW_DIR:-$(cd "$REPO_ROOT/../agentflow" 2>/dev/null && pwd || true)}"
# Path to waldiez/player dist (built with VITE_BASE_PATH=/player/)
PLAYER_DIR="${PLAYER_DIR:-$(cd "$REPO_ROOT/../../player" 2>/dev/null && pwd || true)}"
MODE="${1:-push}"   # smoke | push

# ── Helpers ───────────────────────────────────────────────────────────────────
RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' CYAN='\033[0;36m' NC='\033[0m'
step()  { echo; echo -e "${CYAN}━━ $* ━━${NC}"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
die()   { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }

ssh_opts() {
    local opts=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes)
    [[ -n "$EC2_KEY" ]] && opts+=(-i "$EC2_KEY")
    echo "${opts[@]}"
}

remote() {
    # shellcheck disable=SC2046,SC2029
    ssh $(ssh_opts) "$EC2_HOST" "$@"
}

# ── SMOKE TEST ────────────────────────────────────────────────────────────────
smoke_test() {
    step "Smoke test"

    cd "$REPO_ROOT"

    # 1. TS type-check (shell frontend + packages)
    echo "  TypeScript..."
    bun run check
    ok "TS clean"

    # 2. Cargo check (core crates — fast, no linking)
    echo "  Cargo check..."
    cargo check -p limen-core -p limen-ai -p limen-voice 2>&1 \
        | grep -E "^error" && die "Cargo errors" || true
    ok "Rust clean"

    # 3. Verify dist/ exists and is non-empty
    DIST="$REPO_ROOT/apps/shell/dist/index.html"
    if [[ ! -f "$DIST" ]]; then
        warn "dist/ not built yet — building now..."
        make packages-build
        make server-build
    fi
    ok "dist/index.html present"

    echo
    ok "All smoke checks passed — safe to push."
}

# ── RESOLVE SSH TARGET ────────────────────────────────────────────────────────
# Prefer connecting as the limen user (owns REMOTE_DIR, no sudo needed).
# Fall back to whatever EC2_HOST says if limen SSH doesn't work.
resolve_ssh_target() {
    local host="${EC2_HOST#*@}"   # strip user, keep host/ip
    local limen_target="${LIMEN_USER}@${host}"
    # shellcheck disable=SC2046
    if ssh $(ssh_opts) -o ConnectTimeout=5 "$limen_target" true 2>/dev/null; then
        RSYNC_TARGET="$limen_target"
        RSYNC_SUDO=""
        ok "SSH as ${LIMEN_USER} works"
        # Ensure limen owns REMOTE_DIR (may have been created as root on first boot)
        # shellcheck disable=SC2046,SC2029
        ssh $(ssh_opts) "$EC2_HOST" \
            "sudo chown -R ${LIMEN_USER}:${LIMEN_USER} ${REMOTE_DIR}" 2>/dev/null || true
    else
        RSYNC_TARGET="$EC2_HOST"
        RSYNC_SUDO="--rsync-path=sudo rsync"
        warn "SSH as ${LIMEN_USER} failed — using $EC2_HOST with sudo rsync"
    fi
}

# ── RSYNC ─────────────────────────────────────────────────────────────────────
do_rsync() {
    resolve_ssh_target
    step "rsync → $RSYNC_TARGET:$REMOTE_DIR"

    SSH_CMD="ssh $(ssh_opts)"

    rsync -az --progress \
        --delete --force \
        ${RSYNC_SUDO:+"$RSYNC_SUDO"} \
        -e "$SSH_CMD" \
        --exclude='.git' \
        --exclude='node_modules' \
        --exclude='.bun' \
        --exclude='target' \
        --exclude='apps/shell/src-tauri/target' \
        --exclude='apps/mobile/.dart_tool' \
        --exclude='apps/mobile/build' \
        --exclude='.ec2.env' \
        --exclude='.env' \
        --exclude='.local/' \
        --exclude='.claude/' \
        --exclude='.github/' \
        --exclude='.mypy_cache/' \
        --exclude='staging.zip' \
        --exclude='*.zip' \
        --filter='protect bin/' \
        --filter='protect dist/' \
        --filter='protect apps/shell/dist/' \
        --filter='protect apps/mobile/build/' \
        "$REPO_ROOT/" \
        "$RSYNC_TARGET:$REMOTE_DIR/"

    ok "Code synced"

    # ── waldiez/player dist ────────────────────────────────────────────────────
    if [[ -n "$PLAYER_DIR" && -f "$PLAYER_DIR/dist/index.html" ]]; then
        # shellcheck disable=SC2046
        rsync -az --delete -e "ssh $(ssh_opts)" \
            "$PLAYER_DIR/dist/" "$RSYNC_TARGET:$REMOTE_DIR/player/dist/"
        ok "player/dist synced"
    elif [[ -n "$PLAYER_DIR" && -d "$PLAYER_DIR" ]]; then
        warn "player/dist not built — run: cd $PLAYER_DIR && VITE_BASE_PATH=/player/ bun run build"
    fi

    # ── agentflow source → tools/agentflow/ (for Docker build) ───────────────
    if [[ -n "$AGENTFLOW_DIR" && -d "$AGENTFLOW_DIR" ]]; then
        # shellcheck disable=SC2046
        rsync -az --delete -e "ssh $(ssh_opts)" \
            --exclude='.git' --exclude='__pycache__' --exclude='*.pyc' \
            --exclude='.venv' --exclude='venv' --exclude='dist' --exclude='*.egg-info' \
            --exclude='.mypy_cache' \
            "$AGENTFLOW_DIR/" "$RSYNC_TARGET:$REMOTE_DIR/docker/tools/agentflow/"
        ok "agentflow source synced → docker/tools/agentflow/"
    else
        warn "agentflow dir not found at $AGENTFLOW_DIR — Workers won't be built"
    fi

    # Push .env separately (never rsync'd — stays out of git too)
    if [[ -f "$REPO_ROOT/.env" ]]; then
        # shellcheck disable=SC2046
        scp $(ssh_opts) "$REPO_ROOT/.env" "$RSYNC_TARGET:$REMOTE_DIR/.env"
        ok ".env pushed"
    else
        warn "No local .env — remote will use its own or defaults"
    fi
}

# ── REMOTE RELOAD (subsequent pushes) ────────────────────────────────────────
do_reload() {
    step "Remote: reload services"
    remote sudo bash -s <<RELOAD
set -e
INSTALL_DIR="${REMOTE_DIR}"
LIMEN_USER="${LIMEN_USER}"
SKIP_TAURI="${SKIP_TAURI:-1}"

# ── Docker stack: pull latest images + restart changed containers ─────────────
if command -v docker >/dev/null 2>&1 && [ -f "\$INSTALL_DIR/docker/stack.yml" ]; then
    cd "\$INSTALL_DIR"
    # Source .env so shell vars (AF_LLM, AF_API_KEY, etc.) are available for
    # docker compose variable substitution in the environment: block.
    # API keys (ANTHROPIC_API_KEY etc.) come from env_file in stack.yml — they
    # must NOT be in the environment: block to avoid empty-expansion override.
    if [ -f "\$INSTALL_DIR/.env" ]; then
        set -a; . "\$INSTALL_DIR/.env"; set +a
    fi
    # Auto-detect which opt-in profiles are already running so --remove-orphans
    # doesn't stop containers that were previously started manually or by setup.sh.
    _running() { docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^\$1\$"; }
    COMPOSE_PROFILES=""

    # agentflow — rebuild if source is present
    if [ -d "\$INSTALL_DIR/docker/tools/agentflow" ]; then
        docker compose -f docker/stack.yml build agentflow 2>&1 | tail -5 || true
        COMPOSE_PROFILES="\$COMPOSE_PROFILES --profile agentflow"
    fi

    # ha — keep running if already up, or opt-in via DEPLOY_HA=1
    if _running limen-homeassistant || [ "\${DEPLOY_HA:-0}" = "1" ]; then
        COMPOSE_PROFILES="\$COMPOSE_PROFILES --profile ha"
    fi

    # sinergym — keep running if already up, or opt-in via DEPLOY_SINERGYM=1
    if _running limen-sinergym || [ "\${DEPLOY_SINERGYM:-0}" = "1" ]; then
        COMPOSE_PROFILES="\$COMPOSE_PROFILES --profile sinergym"
    fi

    # smartcities — keep running if already up, or opt-in via DEPLOY_SMARTCITIES=1
    if _running limen-smartcities || [ "\${DEPLOY_SMARTCITIES:-0}" = "1" ]; then
        COMPOSE_PROFILES="\$COMPOSE_PROFILES --profile smartcities"
    fi

    # portainer / grafana — preserve if running
    _running limen-portainer && COMPOSE_PROFILES="\$COMPOSE_PROFILES --profile portainer"
    _running limen-grafana   && COMPOSE_PROFILES="\$COMPOSE_PROFILES --profile grafana"

    # EC2: bind to localhost only — nginx proxies all services externally
    export BIND_HOST=127.0.0.1
    # shellcheck disable=SC2086
    docker compose -f docker/stack.yml \$COMPOSE_PROFILES up -d --remove-orphans 2>&1 | tail -10
    echo "✓ Docker stack updated  profiles:\${COMPOSE_PROFILES:- (core only)}"
fi

# ── nginx config update ────────────────────────────────────────────────────────
# Use DOMAIN_NAME from .ec2.env (interpolated at heredoc creation time) as primary.
# Fall back to nginx detection only if not set (e.g. first manual run without env).
DOMAIN="${DOMAIN_NAME}"
if [ -z "\$DOMAIN" ]; then
    DOMAIN=\$(grep -rh 'server_name' /etc/nginx/sites-enabled/ 2>/dev/null \
        | awk '{print \$2}' | tr -d ';' \
        | grep -v '^_$\|^localhost\|^127\.' \
        | grep '\.' | head -1 || true)
fi
if [ -n "\$DOMAIN" ]; then
    # Remove any stale HA-subdomain conf that got incorrectly written as main domain conf
    HA_D="${HA_DOMAIN:-}"
    if [ -n "\$HA_D" ] && [ "\$HA_D" != "\$DOMAIN" ]; then
        for _dir in /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d; do
            [ -f "\$_dir/\${HA_D}.conf" ] && \
                grep -q "limen OS\|LIMEN OS\|limen-serve\|1420\|1421" "\$_dir/\${HA_D}.conf" 2>/dev/null && \
                rm -f "\$_dir/\${HA_D}.conf" && echo "✓ Removed stale \${HA_D}.conf (was main-domain template)"
        done
    fi
    SKIP_CERTBOT=1 DOMAIN_NAME="\$DOMAIN" INSTALL_DIR="\$INSTALL_DIR" \
        HA_DOMAIN="${HA_DOMAIN:-}" \
        bash "\$INSTALL_DIR/scripts/setup.sh" --nginx-only
    # certbot preserves/adds SSL block
    certbot install --nginx -d "\$DOMAIN" --reinstall --non-interactive 2>/dev/null || true
    nginx -t && systemctl reload nginx && echo "✓ nginx updated" || echo "⚠ nginx reload failed"
else
    echo "⚠ nginx domain not detected — run manually: DOMAIN_NAME=<domain> bash scripts/setup.sh --nginx-only"
fi

# ── Sync HA_AGENT_SECRET to serve.env ─────────────────────────────────────────
HA_S="${HA_AGENT_SECRET:-}"
if [ -n "\$HA_S" ]; then
    mkdir -p /etc/limen
    if grep -q '^HA_AGENT_SECRET=' /etc/limen/serve.env 2>/dev/null; then
        sed -i "s|^HA_AGENT_SECRET=.*|HA_AGENT_SECRET=\${HA_S}|" /etc/limen/serve.env
    else
        echo "HA_AGENT_SECRET=\${HA_S}" >> /etc/limen/serve.env
    fi
fi

# ── Restart SPA server ─────────────────────────────────────────────────────────
# Try limen-serve first (production), fall back to limen-static (legacy)
if systemctl is-enabled limen-serve >/dev/null 2>&1; then
    systemctl restart limen-serve && echo "✓ limen-serve restarted"
elif systemctl is-enabled limen-static >/dev/null 2>&1; then
    systemctl restart limen-static && echo "✓ limen-static restarted"
else
    echo "⚠ limen-serve not installed — run: bash \$INSTALL_DIR/scripts/server-setup.sh --full"
fi

# Resolve cargo — try custom HAOS path first, then fall back to standard ~/.cargo
find_cargo() {
    local haos_cargo="\${INSTALL_DIR}/.local/deb/cargo/bin/cargo"
    if [ -x "\$haos_cargo" ]; then
        echo "\$haos_cargo"
    else
        # Standard cargo install (EC2 / Debian): use user's own environment
        su - "\$LIMEN_USER" -c 'command -v cargo 2>/dev/null' || echo ""
    fi
}
CARGO=\$(find_cargo)

# Env vars to prepend to build commands — only set for HAOS non-standard paths
if [ -d "\${INSTALL_DIR}/.local/deb/rustup" ]; then
    RUST_ENV="export RUSTUP_HOME='\${INSTALL_DIR}/.local/deb/rustup'; export CARGO_HOME='\${INSTALL_DIR}/.local/deb/cargo';"
else
    RUST_ENV=""
fi

# ── synapsd ────────────────────────────────────────────────────────────────────
if ! systemctl is-enabled synapsd >/dev/null 2>&1; then
    echo "  synapsd not installed — building and installing..."
    if [ -n "\$CARGO" ]; then
        # Ensure a default toolchain is set (needed on fresh EC2 installs where rustup was installed but 'rustup default stable' was never run)
        su - "\$LIMEN_USER" -c "\$RUST_ENV rustup default stable 2>/dev/null || true"
        su - "\$LIMEN_USER" -c \
            "\$RUST_ENV cd \$INSTALL_DIR && \$CARGO build --release -p limen-core --bin synapsd"
        install -m 755 "\$INSTALL_DIR/target/release/synapsd" /usr/local/bin/synapsd
        bash "\$INSTALL_DIR/scripts/server-setup.sh" --install-synapsd
        echo "✓ synapsd built and installed"
    else
        echo "⚠ cargo not found — cannot build synapsd"
    fi
else
    _synapsd_bin="\$(systemctl show synapsd -p ExecStart 2>/dev/null | grep -o 'path=[^ ;]*' | cut -d= -f2 || true)"
    if [ -x "\${_synapsd_bin:-/usr/local/bin/synapsd}" ]; then
        systemctl restart synapsd \
            && echo "✓ synapsd restarted" \
            || echo "⚠ synapsd failed to restart"
    else
        echo "  synapsd enabled but binary missing — skipping restart (run make push again after building)"
        systemctl disable synapsd 2>/dev/null || true
    fi
fi

# ── limen-tauri (background build — takes ~20 min) ──────────────────────────
# Skipped if:  (a) SKIP_TAURI=1, (b) lock file exists (build already in progress),
#              (c) binary already built (service just needs install), or (d) no cargo/Xvfb.
TAURI_BIN="\${INSTALL_DIR}/apps/shell/src-tauri/target/release/limen-shell"
TAURI_LOCK="\${INSTALL_DIR}/.tauri-build.pid"
if systemctl is-enabled limen-tauri >/dev/null 2>&1; then
    [ -f "\$TAURI_BIN" ] && systemctl restart limen-tauri \
        && echo "✓ limen-tauri restarted" \
        || echo "⚠ limen-tauri restart failed"
elif [ "\${SKIP_TAURI:-0}" = "1" ]; then
    echo "  limen-tauri skipped (SKIP_TAURI=1)"
elif [ -f "\$TAURI_LOCK" ] && kill -0 "\$(cat \$TAURI_LOCK)" 2>/dev/null; then
    echo "  limen-tauri build already running (PID \$(cat \$TAURI_LOCK)) — skipping"
elif [ -f "\$TAURI_BIN" ]; then
    echo "  limen-tauri binary exists but service not installed — run: bash \$INSTALL_DIR/scripts/server-setup.sh --install-tauri"
elif [ -n "\$CARGO" ] && systemctl is-active --quiet limen-xvfb 2>/dev/null; then
    echo "  limen-tauri not installed — starting background build (tail \${INSTALL_DIR}/.tauri-build.log)"
    nohup su - "\$LIMEN_USER" -c \
        "echo \$\$ > '\${TAURI_LOCK}'; \
         export RUSTUP_HOME='\${INSTALL_DIR}/.local/deb/rustup'; \
         export CARGO_HOME='\${INSTALL_DIR}/.local/deb/cargo'; \
         cd \$INSTALL_DIR && DISPLAY=:99 GDK_BACKEND=x11 \$CARGO build --release -p limen-shell \
         && sudo bash \$INSTALL_DIR/scripts/server-setup.sh --install-tauri; \
         rm -f '\${TAURI_LOCK}'" \
        > "\${INSTALL_DIR}/.tauri-build.log" 2>&1 &
    echo "\$!" > "\$TAURI_LOCK"
    echo "  build PID \$! — check log: tail -f \${INSTALL_DIR}/.tauri-build.log"
else
    echo "  limen-tauri skipped (no cargo or Xvfb not running — EC2/server mode)"
fi
RELOAD
}

# ── REMOTE FIRST-TIME SETUP ───────────────────────────────────────────────────
do_first_setup() {
    step "Remote: first-time setup"
    [[ -n "$DOMAIN_NAME" ]] || die "DOMAIN_NAME is required for first-time setup. Set it in .ec2.env or export it."

    # shellcheck disable=SC2046,SC2029
    ssh $(ssh_opts) "$EC2_HOST" \
        "DOMAIN_NAME='$DOMAIN_NAME' \
         CERTBOT_EMAIL='$CERTBOT_EMAIL' \
         SKIP_CERTBOT='$SKIP_CERTBOT' \
         LIMEN_USER='$LIMEN_USER' \
         INSTALL_DIR='$REMOTE_DIR' \
         NO_BUILD=1 \
         SKIP_DISPLAY='${SKIP_DISPLAY:-0}' \
         HA_DOMAIN='${HA_DOMAIN:-}' \
         sudo -E bash '$REMOTE_DIR/scripts/setup.sh'"
}

# ── DETECT FIRST VS SUBSEQUENT RUN ───────────────────────────────────────────
is_first_run() {
    # First run = setup.sh hasn't been run yet (neither limen-serve nor limen-static)
    ! remote sudo systemctl is-enabled limen-serve >/dev/null 2>&1 && \
    ! remote sudo systemctl is-enabled limen-static >/dev/null 2>&1
}

# ── ENTRY POINTS ─────────────────────────────────────────────────────────────

case "$MODE" in
    smoke)
        smoke_test
        ;;

    push)
        [[ -n "$EC2_HOST" ]] || die "EC2_HOST not set. Export it or add to .ec2.env"

        smoke_test

        step "Build"
        cd "$REPO_ROOT"
        make packages-build
        make server-build

        do_rsync

        if is_first_run; then
            do_first_setup
        else
            do_reload
        fi

        echo
        PROTO="https"; [[ "$SKIP_CERTBOT" == "1" ]] && PROTO="http"
        if [[ -n "$DOMAIN_NAME" ]]; then
            echo -e "${GREEN}✓ Deployed → ${PROTO}://${DOMAIN_NAME}/${NC}"
        else
            echo -e "${GREEN}✓ Synced and reloaded${NC}"
        fi
        ;;

    *)
        die "Unknown mode: $MODE. Use: smoke | push"
        ;;
esac
