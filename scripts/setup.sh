#!/usr/bin/env sh
# LIMEN OS — one-shot bootstrap for a fresh VM / EC2 instance
#
# Usage (stream from git):
#   DOMAIN_NAME=io.waldiez.io sh -c "$(curl -fsSL https://raw.githubusercontent.com/waldiez/limen-os/refs/heads/main/scripts/setup.sh)"
#
# Or clone first and run:
#   bash /path/to/limen-os/scripts/setup.sh --domain-name io.waldiez.io
#
# Options:
#   --domain-name   Domain to serve on (required, or set DOMAIN_NAME env)
#   --email         Certbot email for Let's Encrypt (optional but recommended)
#   --repo          Git repo URL (default: waldiez/limen-os on GitHub)
#   --branch        Branch to clone (default: main)
#   --install-dir   Where to install (default: /opt/limen)
#   --skip-certbot  Skip SSL cert issuance (use for testing / internal VMs)
#   --skip-daemon   Skip synapsd build/install
#   --no-build      Skip npm/cargo build (use when dist/ is pre-built)
#   --help          Show this help
#
# Non-interactive mode (all env vars):
#   DOMAIN_NAME=io.waldiez.io CERTBOT_EMAIL=you@email.com SKIP_CERTBOT=0 bash setup.sh
#
# AWS EC2 userdata example:
#   #!/bin/bash
#   export DOMAIN_NAME=io.waldiez.io CERTBOT_EMAIL=ops@waldiez.io
#   export ANTHROPIC_API_KEY=sk-ant-... OPENAI_API_KEY=sk-...
#   sh -c "$(curl -fsSL https://raw.githubusercontent.com/waldiez/limen-os/refs/heads/main/scripts/setup.sh)"
#

# shellcheck disable=SC2059,SC2034,SC3037

set -e

# ── Reload self if piped/streamed ────────────────────────────────────────────
SCRIPT_URL="https://raw.githubusercontent.com/waldiez/limen-os/refs/heads/main/scripts/setup.sh"
if [ -z "$_LIMEN_SETUP_RELOADED" ]; then
    if ! [ -f "$0" ] || ! [ -s "$0" ]; then
        _SAFE_DIR="${HOME:-$(pwd -P)}"
        [ -w "$_SAFE_DIR" ] || _SAFE_DIR="$(pwd -P)"
        [ -w "$_SAFE_DIR" ] || _SAFE_DIR="/tmp"
        _TMP="$_SAFE_DIR/limen-setup.sh"
        echo "Script is piped — downloading to $_TMP ..."
        curl -fsSL "${SCRIPT_URL}" -o "$_TMP"
        chmod +x "$_TMP"
        export _LIMEN_SETUP_RELOADED=1
        exec sh "$_TMP" "$@"
    fi
fi

# ── Colors ───────────────────────────────────────────────────────────────────
_r='\033[0;31m' _g='\033[0;32m' _y='\033[1;33m' _c='\033[0;36m' _n='\033[0m'
info() { printf "${_g}→${_n} %s\n" "$*"; }
warn() { printf "${_y}⚠${_n}  %s\n" "$*"; }
step() { printf "\n${_c}━━ %s ━━${_n}\n" "$*"; }
ok()   { printf "${_g}✓${_n} %s\n" "$*"; }
die()  { printf "${_r}✗${_n}  %s\n" "$*" >&2; exit 1; }

# ── Defaults (override via env or CLI) ───────────────────────────────────────
DOMAIN_NAME="${DOMAIN_NAME:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
SKIP_CERTBOT="${SKIP_CERTBOT:-0}"
SKIP_DAEMON="${SKIP_DAEMON:-0}"
SKIP_DISPLAY="${SKIP_DISPLAY:-0}"   # set 1 for pure web-only (no Xvfb/kiosk/VNC)
NO_BUILD="${NO_BUILD:-0}"
REPO_URL="${REPO_URL:-https://github.com/waldiez/limen-os.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/opt/limen}"
LIMEN_USER="${LIMEN_USER:-limen}"

# AI + service keys (can be pre-set in env or .env on the server)
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
GOOGLE_GEMINI_API_KEY="${GOOGLE_GEMINI_API_KEY:-}"
DEEPSEEK_API_KEY="${DEEPSEEK_API_KEY:-}"
GROQ_API_KEY="${GROQ_API_KEY:-}"

# ── Parse CLI ────────────────────────────────────────────────────────────────
while [ $# -gt 0 ]; do
    case "$1" in
        --domain-name)   DOMAIN_NAME="$2";    shift 2 ;;
        --email)         CERTBOT_EMAIL="$2";  shift 2 ;;
        --repo)          REPO_URL="$2";       shift 2 ;;
        --branch)        REPO_BRANCH="$2";    shift 2 ;;
        --install-dir)   INSTALL_DIR="$2";    shift 2 ;;
        --skip-certbot)  SKIP_CERTBOT=1;      shift ;;
        --skip-daemon)   SKIP_DAEMON=1;       shift ;;
        --skip-display)  SKIP_DISPLAY=1;      shift ;;
        --no-build)      NO_BUILD=1;          shift ;;
        --nginx-only)    NGINX_ONLY=1;        shift ;;
        --help|-h)
            grep '^#' "$0" | grep -v '^#!/' | sed 's/^# \?//'
            exit 0
            ;;
        *) die "Unknown argument: $1" ;;
    esac
done

# ── Interactive questions (only if not pre-set) ───────────────────────────────
# We ask at most 2 questions; everything else has safe defaults.
if [ -t 0 ]; then
    # Running interactively
    if [ -z "$DOMAIN_NAME" ]; then
        printf "${_c}Domain name${_n} (e.g. io.waldiez.io): "
        read -r DOMAIN_NAME
    fi
    if [ -z "$CERTBOT_EMAIL" ] && [ "$SKIP_CERTBOT" != "1" ]; then
        printf "${_c}Certbot email${_n} (Let's Encrypt, press Enter to skip): "
        read -r CERTBOT_EMAIL
    fi
fi

[ -n "$DOMAIN_NAME" ] || die "DOMAIN_NAME is required. Pass --domain-name or set DOMAIN_NAME env."

# ── Privilege check ──────────────────────────────────────────────────────────
# Must be root, or have passwordless sudo (typical EC2 ubuntu/debian/ec2-user).
# If neither, re-exec under sudo and let the OS prompt for a password.
if [ "$(id -u)" -ne 0 ]; then
    if ! sudo -n true 2>/dev/null; then
        # Not root, no passwordless sudo — try interactive sudo
        warn "Not root. Attempting sudo..."
        sudo -v 2>/dev/null || die "This script needs root or sudo access. Re-run as root or grant sudo to $(whoami)."
    fi
    # Re-exec entire script as root so all subsequent commands are privileged
    exec sudo -E env \
        DOMAIN_NAME="$DOMAIN_NAME" \
        CERTBOT_EMAIL="$CERTBOT_EMAIL" \
        SKIP_CERTBOT="$SKIP_CERTBOT" \
        SKIP_DISPLAY="$SKIP_DISPLAY" \
        SKIP_DAEMON="$SKIP_DAEMON" \
        NO_BUILD="$NO_BUILD" \
        INSTALL_DIR="$INSTALL_DIR" \
        LIMEN_USER="$LIMEN_USER" \
        ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
        OPENAI_API_KEY="$OPENAI_API_KEY" \
        _LIMEN_SETUP_RELOADED="$_LIMEN_SETUP_RELOADED" \
        sh "$0" "$@"
fi
info "Running as root (uid=0) — privilege check passed"

# ── OS detection ─────────────────────────────────────────────────────────────
detect_os() {
    if [ -f /etc/os-release ]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        OS_ID="$(printf '%s' "$ID" | tr '[:upper:]' '[:lower:]')"
    else
        die "Cannot detect OS — /etc/os-release missing."
    fi
    info "OS: $PRETTY_NAME ($OS_ID)"
}

do_install() {
    case "$OS_ID" in
        ubuntu|debian)
            DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$@" ;;
        amzn|centos|rhel|rocky|fedora)
            dnf install -y "$@" 2>/dev/null || yum install -y "$@" ;;
        *) die "Unsupported OS: $OS_ID" ;;
    esac
}

do_update() {
    case "$OS_ID" in
        ubuntu|debian) apt-get update -qq ;;
        amzn|centos|rhel|rocky|fedora) dnf check-update -q 2>/dev/null || true ;;
    esac
}

detect_os

NGINX_ONLY="${NGINX_ONLY:-0}"

# ── nginx-only mode: just regenerate nginx config and exit ────────────────────
if [ "$NGINX_ONLY" = "1" ]; then
    [ -n "$DOMAIN_NAME" ] || die "DOMAIN_NAME required for --nginx-only"
    # jump straight to nginx section below
else

# ── Base packages ─────────────────────────────────────────────────────────────
step "System packages"
do_update
do_install git curl ca-certificates make nginx unzip \
    build-essential pkg-config libssl-dev   # needed for Rust/cargo builds

# Display stack (Xvfb + Chromium kiosk + VNC) — skip only for pure headless web
if [ "$SKIP_DISPLAY" != "1" ]; then
    do_install xvfb x11vnc chromium 2>/dev/null || \
    do_install xvfb x11vnc chromium-browser 2>/dev/null || \
    do_install xvfb x11vnc chromium-bsu 2>/dev/null || \
    warn "Could not install chromium — kiosk will be skipped"

    # noVNC: try apt first, fall back to pip
    do_install novnc websockify 2>/dev/null || \
        { do_install python3-pip 2>/dev/null; pip3 install --quiet websockify; }

fi

ok "System packages ready"

# ── Clone / update repo ───────────────────────────────────────────────────────
step "Repository → $INSTALL_DIR"
if [ "${NO_BUILD:-0}" = "1" ]; then
    info "NO_BUILD=1 — code already rsynced, skipping clone/pull"
elif [ -d "$INSTALL_DIR/.git" ]; then
    info "Already cloned — pulling latest $REPO_BRANCH ..."
    git -C "$INSTALL_DIR" fetch origin
    git -C "$INSTALL_DIR" reset --hard "origin/$REPO_BRANCH"
else
    if [ -d "$INSTALL_DIR" ] && [ -n "$(ls -A "$INSTALL_DIR" 2>/dev/null)" ]; then
        warn "$INSTALL_DIR exists but has no .git — wiping and cloning fresh"
        cd / || true   # leave the directory before deleting it; git needs a valid CWD
        rm -rf "$INSTALL_DIR"
    fi
    mkdir -p "$(dirname "$INSTALL_DIR")"
    git clone --depth=1 --branch "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR"
fi
ok "Repo at $INSTALL_DIR"

# ── System user ───────────────────────────────────────────────────────────────
step "Service user ($LIMEN_USER)"
if ! id "$LIMEN_USER" >/dev/null 2>&1; then
    adduser --system --create-home --shell /bin/bash "$LIMEN_USER" 2>/dev/null || \
    useradd --system --create-home --shell /bin/bash "$LIMEN_USER"
    ok "Created user: $LIMEN_USER"
else
    warn "User $LIMEN_USER already exists"
fi
chown -R "$LIMEN_USER:$LIMEN_USER" "$INSTALL_DIR"

# All runtimes live under $INSTALL_DIR/.local/deb/ — mirrors CLAUDE.md convention
LOCAL_DEB="$INSTALL_DIR/.local/deb"
sudo -u "$LIMEN_USER" mkdir -p "$LOCAL_DEB"

# ── Bun (JS runtime) ──────────────────────────────────────────────────────────
step "Bun (JS runtime)"
BUN_BIN=""
for p in /usr/local/bin/bun "$LOCAL_DEB/.bun/bin/bun" "/home/$LIMEN_USER/.bun/bin/bun"; do
    [ -x "$p" ] && { BUN_BIN="$p"; break; }
done
if [ -z "$BUN_BIN" ]; then
    sudo -u "$LIMEN_USER" bash -c \
        "BUN_INSTALL='$LOCAL_DEB/.bun' curl -fsSL https://bun.sh/install | bash"
    BUN_BIN="$LOCAL_DEB/.bun/bin/bun"
fi
[ -x "$BUN_BIN" ] || die "Bun installation failed — install manually and retry."
[ -x /usr/local/bin/bun ] || ln -sf "$BUN_BIN" /usr/local/bin/bun
ok "bun → $BUN_BIN"

# ── nvm + Node.js ─────────────────────────────────────────────────────────────
step "nvm + Node.js"
NVM_VERSION="${NVM_VERSION:-v0.40.4}"
NODE_VERSION="${NODE_VERSION:-v24.14.0}"
NVM_DIR="$LOCAL_DEB/nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    sudo -u "$LIMEN_USER" bash -c \
        "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/$NVM_VERSION/install.sh | NVM_DIR='$NVM_DIR' bash"
fi
# Install the pinned Node version if not already present
NODE_BIN="$NVM_DIR/versions/node/$NODE_VERSION/bin/node"
if [ ! -x "$NODE_BIN" ]; then
    sudo -u "$LIMEN_USER" bash -c \
        "export NVM_DIR='$NVM_DIR' && . '$NVM_DIR/nvm.sh' && nvm install $NODE_VERSION && nvm alias default $NODE_VERSION"
fi
[ -x /usr/local/bin/node ] || ln -sf "$NODE_BIN" /usr/local/bin/node
[ -x /usr/local/bin/npm  ] || ln -sf "$NVM_DIR/versions/node/$NODE_VERSION/bin/npm" /usr/local/bin/npm
ok "node → $NODE_VERSION"

# ── Flutter ───────────────────────────────────────────────────────────────────
step "Flutter"
FLUTTER_VERSION="${FLUTTER_VERSION:-3.41.4}"
FLUTTER_DIR="$LOCAL_DEB/flutter"
FLUTTER_BIN="$FLUTTER_DIR/bin/flutter"
if [ ! -x "$FLUTTER_BIN" ]; then
    FLUTTER_TAR="flutter_linux_${FLUTTER_VERSION}-stable.tar.xz"
    FLUTTER_URL="https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/$FLUTTER_TAR"
    info "Downloading Flutter $FLUTTER_VERSION..."
    sudo -u "$LIMEN_USER" bash -c \
        "cd '$LOCAL_DEB' && curl -fsSL '$FLUTTER_URL' -o '$FLUTTER_TAR' && tar -xf '$FLUTTER_TAR' && rm '$FLUTTER_TAR'"
fi
[ -x /usr/local/bin/flutter ] || ln -sf "$FLUTTER_BIN" /usr/local/bin/flutter
ok "flutter → $FLUTTER_VERSION"

# ── Go ────────────────────────────────────────────────────────────────────────
step "Go"
GO_VERSION="${GO_VERSION:-1.24.4}"
GO_DIR="$LOCAL_DEB/go"
if [ ! -x "$GO_DIR/bin/go" ]; then
    GO_TAR="go${GO_VERSION}.linux-amd64.tar.gz"
    info "Downloading Go $GO_VERSION..."
    sudo -u "$LIMEN_USER" bash -c \
        "cd '$LOCAL_DEB' && curl -fsSL 'https://go.dev/dl/$GO_TAR' -o '$GO_TAR' && tar -xf '$GO_TAR' && rm '$GO_TAR'"
fi
[ -x /usr/local/bin/go ] || ln -sf "$GO_DIR/bin/go" /usr/local/bin/go
ok "go → $GO_VERSION"

# ── uv (Python package manager) ───────────────────────────────────────────────
step "uv"
UV_BIN=""
for p in "$LOCAL_DEB/bin/uv" "/home/$LIMEN_USER/.local/bin/uv" "$LOCAL_DEB/.cargo/bin/uv" /usr/local/bin/uv; do
    [ -x "$p" ] && { UV_BIN="$p"; break; }
done
if [ -z "$UV_BIN" ]; then
    sudo -u "$LIMEN_USER" bash -c \
        "curl -LsSf https://astral.sh/uv/install.sh | sh"
    # uv defaults to ~/.local/bin
    for p in "/home/$LIMEN_USER/.local/bin/uv" "$LOCAL_DEB/bin/uv" "$LOCAL_DEB/.cargo/bin/uv"; do
        [ -x "$p" ] && { UV_BIN="$p"; break; }
    done
fi
if [ -n "$UV_BIN" ]; then
    [ -x /usr/local/bin/uv ] || ln -sf "$UV_BIN" /usr/local/bin/uv
    ok "uv → $(sudo -u "$LIMEN_USER" "$UV_BIN" --version 2>/dev/null || echo installed)"
else
    warn "uv not found after install — check manually"
fi

# ── yarn (via corepack) ───────────────────────────────────────────────────────
step "yarn"
YARN_VERSION="${YARN_VERSION:-4.13.0}"
if ! sudo -u "$LIMEN_USER" bash -c \
        "export NVM_DIR='$LOCAL_DEB/nvm' && . '$LOCAL_DEB/nvm/nvm.sh' && command -v yarn" >/dev/null 2>&1; then
    # corepack enable writes to /usr/bin — needs sudo; prepare runs as the user
    corepack enable
    sudo -u "$LIMEN_USER" bash -c \
        "export NVM_DIR='$LOCAL_DEB/nvm' && . '$LOCAL_DEB/nvm/nvm.sh' && \
         corepack prepare yarn@$YARN_VERSION --activate"
fi
ok "yarn → $YARN_VERSION"

# ── Claude Code ───────────────────────────────────────────────────────────────
step "Claude Code"
if ! command -v claude >/dev/null 2>&1; then
    sudo -u "$LIMEN_USER" bash -c \
        "export NVM_DIR='$LOCAL_DEB/nvm' && . '$LOCAL_DEB/nvm/nvm.sh' && \
         npm install -g @anthropic-ai/claude-code"
fi
ok "claude → $(claude --version 2>/dev/null | head -1 || echo installed)"

# ── Rust toolchain ────────────────────────────────────────────────────────────
# Needed whenever we build on the server (NO_BUILD=0).
# When NO_BUILD=1 (rsynced pre-built binaries) Rust is not needed at runtime.
if [ "$NO_BUILD" != "1" ]; then
    step "Rust toolchain"
    CARGO_BIN="$LOCAL_DEB/cargo/bin/cargo"
    if [ ! -x "$CARGO_BIN" ] && ! command -v cargo >/dev/null 2>&1; then
        sudo -u "$LIMEN_USER" bash -c \
            "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
             CARGO_HOME='$LOCAL_DEB/cargo' RUSTUP_HOME='$LOCAL_DEB/rustup' \
             sh -s -- -y --no-modify-path"
    fi
    CARGO_BIN="$LOCAL_DEB/cargo/bin/cargo"
    [ -x /usr/local/bin/cargo ] || ln -sf "$CARGO_BIN" /usr/local/bin/cargo
    export PATH="$LOCAL_DEB/cargo/bin:$PATH"
    ok "Rust: $($CARGO_BIN --version 2>/dev/null || echo 'installed')"
else
    info "Rust skipped (NO_BUILD=1 — binaries are pre-built and rsynced)"
fi

# ── Write .env ────────────────────────────────────────────────────────────────
step ".env"
ENV_FILE="$INSTALL_DIR/.env"
cat > "$ENV_FILE" <<EOF
# Generated by setup.sh — edit as needed
DOMAIN_NAME=${DOMAIN_NAME}
LIMEN_RELAY_PORT=1421
LIMEN_COMPANION_PORT=8766

# AI keys — fill in at least one
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
OPENAI_API_KEY=${OPENAI_API_KEY}
GOOGLE_GEMINI_API_KEY=${GOOGLE_GEMINI_API_KEY}
DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY}
GROQ_API_KEY=${GROQ_API_KEY}

# Voice
LIMEN_WAKE_WORD=hey_limen
LIMEN_STT_MODE=whisper
LIMEN_TTS_MODE=kokoro

# Shell
LIMEN_DEFAULT_SCENE=home
LIMEN_GPU_MODE=webgpu

# Player search service (optional)
PLAYER_SEARCH_URL=http://localhost:8787
EOF
chmod 600 "$ENV_FILE"
chown "$LIMEN_USER:$LIMEN_USER" "$ENV_FILE"
ok ".env written (edit $ENV_FILE to add API keys)"

# ── Build frontend ─────────────────────────────────────────────────────────────
if [ "$NO_BUILD" != "1" ]; then
    step "Build — JS packages + shell frontend"
    cd "$INSTALL_DIR"
    sudo -u "$LIMEN_USER" bash -c "
        cd '$INSTALL_DIR'
        export PATH='/usr/local/bin:$PATH'
        bun install --frozen-lockfile 2>/dev/null || bun install
        make packages-build
        make shell-build
    "
    ok "Frontend built → apps/shell/dist/"

    if [ "$SKIP_DAEMON" != "1" ]; then
        step "Build — synapsd (Rust)"
        sudo -u "$LIMEN_USER" bash -c "
            export RUSTUP_HOME='$LOCAL_DEB/rustup'
            export CARGO_HOME='$LOCAL_DEB/cargo'
            export PATH='$LOCAL_DEB/cargo/bin:\$PATH'
            rustup default stable 2>/dev/null || true
            cd '$INSTALL_DIR'
            cargo build --release -p limen-core --bin synapsd
        "
        ok "synapsd built"
    fi
fi

# ── Install services ───────────────────────────────────────────────────────────
step "Systemd services"
cd "$INSTALL_DIR"
if [ "$SKIP_DISPLAY" = "1" ]; then
    # Web-only mode: SPA server + synapsd, no display stack
    LIMEN_ROOT="$INSTALL_DIR" LIMEN_USER="$LIMEN_USER" \
        bash scripts/deploy-vm.sh
else
    # Full desktop mode: SPA + Xvfb + Chromium kiosk + x11vnc + noVNC + synapsd
    LIMEN_ROOT="$INSTALL_DIR" LIMEN_USER="$LIMEN_USER" \
        bash scripts/server-setup.sh --full
fi
ok "Services installed"

fi  # end non-nginx-only block

# ── nginx ─────────────────────────────────────────────────────────────────────
step "nginx config"

# Inject __LIMEN_RELAY__ and __LIMEN_SERVICES__ values into the SPA at
# request time via nginx sub_filter. This lets the built SPA know its relay URL.
NGINX_CONF_DIR=""
for d in /etc/nginx/sites-available /etc/nginx/conf.d; do
    [ -d "$d" ] && { NGINX_CONF_DIR="$d"; break; }
done
[ -n "$NGINX_CONF_DIR" ] || die "nginx config dir not found"

NGINX_ENABLED_DIR=""
[ -d /etc/nginx/sites-enabled ] && NGINX_ENABLED_DIR=/etc/nginx/sites-enabled

PROTO="https"; [ "${SKIP_CERTBOT:-0}" = "1" ] && PROTO="http"

WS_PROTO="wss";  [ "${SKIP_CERTBOT:-0}" = "1" ] && WS_PROTO="ws"

NGINX_SITE_CONF="$NGINX_CONF_DIR/${DOMAIN_NAME}.conf"

# Detect existing certs so --nginx-only preserves SSL on live servers
SSL_CERT_LINE=""
SSL_KEY_LINE=""
SSL_INCLUDE_LINE=""
SSL_DHPARAM_LINE=""
CERT_PATH="/etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem"
KEY_PATH="/etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem"
if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
    SSL_CERT_LINE="    ssl_certificate     ${CERT_PATH};"
    SSL_KEY_LINE="    ssl_certificate_key ${KEY_PATH};"
    [ -f /etc/letsencrypt/options-ssl-nginx.conf ] && \
        SSL_INCLUDE_LINE="    include             /etc/letsencrypt/options-ssl-nginx.conf;"
    [ -f /etc/letsencrypt/ssl-dhparams.pem ] && \
        SSL_DHPARAM_LINE="    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;"
fi

HA_URL="/ha/"
[ -n "${HA_DOMAIN:-}" ] && HA_URL="https://${HA_DOMAIN}/"

cat > "$NGINX_SITE_CONF" <<NGINXCONF
# LIMEN OS — generated by setup.sh
# Domain: ${DOMAIN_NAME}

# ── HTTP → HTTPS redirect ───────────────────────────────────────────────────
server {
    listen 80;
    server_name ${DOMAIN_NAME};
    return 301 https://\$host\$request_uri;
}

# ── Main HTTPS server ───────────────────────────────────────────────────────
server {
    listen 443 ssl;
    server_name ${DOMAIN_NAME};

    # SSL — filled in by Certbot on first install; preserved by --nginx-only regens
    ${SSL_CERT_LINE}
    ${SSL_KEY_LINE}
    ${SSL_INCLUDE_LINE}
    ${SSL_DHPARAM_LINE}

    # ── Custom session auth (replaces auth_basic browser dialog) ─────────────
    auth_request      /limen/auth/check;
    error_page 401  = @limen_login;
    location @limen_login { return 302 /limen/login.html?next=\$request_uri; }

    # Public: auth check internal endpoint
    location = /limen/auth/check {
        internal;
        proxy_pass              http://127.0.0.1:1420/limen/auth/check;
        proxy_pass_request_body off;
        proxy_set_header        Content-Length "";
        proxy_set_header        Cookie \$http_cookie;
        proxy_set_header        X-Original-URI \$request_uri;
    }
    # Limen login / logout — public
    location ~ ^/limen/auth/(login|logout)$ {
        auth_request off;
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   Cookie \$http_cookie;
    }
    # HA auth flow — /auth/* is unambiguously HA (Limen uses /limen/auth/*)
    location /auth/ {
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   Cookie \$http_cookie;
    }

    # Favicon — serve from shell dist (no auth, no default nginx root)
    location = /favicon.ico {
        auth_request off;
        alias ${INSTALL_DIR}/apps/shell/dist/favicon.svg;
        add_header Content-Type "image/svg+xml";
        expires 7d;
    }

    # ── Limen shell static assets with absolute paths ──────────────────────
    # Vite base=/limen/ doesn't rewrite src="/icons/..." string literals,
    # so icons are requested at /icons/ (not /limen/icons/).
    location ~* ^/icons/(.+)$ {
        auth_request off;
        alias ${INSTALL_DIR}/apps/shell/dist/icons/\$1;
    }

    # ── Limen shell SPA — served at /limen/ ───────────────────────────────
    # Login page — public (exact match, before the prefix location)
    location = /limen/login.html {
        auth_request off;
        alias ${INSTALL_DIR}/apps/shell/dist/login.html;
    }
    # Hashed assets — long cache, public (capture group alias avoids mime-type issues)
    location ~* ^/limen/assets/(.+)$ {
        auth_request off;
        alias ${INSTALL_DIR}/apps/shell/dist/assets/\$1;
        expires max;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
    # Icons — public
    location ~* ^/limen/icons/(.+)$ {
        auth_request off;
        alias ${INSTALL_DIR}/apps/shell/dist/icons/\$1;
    }
    # SPA root (auth protected)
    location /limen/ {
        alias ${INSTALL_DIR}/apps/shell/dist/;
        try_files \$uri \$uri/ /limen/index.html;
    }

    # Inject runtime service paths into the SPA.
    # Use root-relative paths (no protocol/domain) so they work over any scheme.
    sub_filter_once on;
    sub_filter '<head>' '<head>
<script>
window.__LIMEN_RELAY__ = true;
window.__LIMEN_SERVICES__ = {
  ha:          "${HA_URL}",
  ha_local:    "/ha-local/",
  code:        "/code/",
  jupyter:     "/jupyter/",
  studio:      "/studio/",
  portainer:   "/portainer/",
  grafana:     "/grafana/",
  nodered:     "/nodered/",
  sinergym:    "/sinergym/",
  smartcities: "/smartcities/"
};
</script>';

    # HA connectivity diagnostic — public, no auth, served by serve.ts (1420)
    location = /health/ha {
        auth_request off;
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
    }

    # frame-proxy -- served by serve.ts (1420), needs WebSocket-capable headers
    location ^~ /frame-proxy {
        auth_request off;
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_buffering    off;
        proxy_cache        off;
    }

    # Local HA — served by serve.ts which routes via Bun agent or SSH tunnel fallback
    location /ha-local/ {
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 86400s;
    }

    # HA agent WebSocket — local ha-agent.ts connects here (outbound, bypasses NAT)
    location /ha-agent {
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 86400s;
        auth_request       off;
    }

    # ── Relay (synapsd) ──────────────────────────────────────────────────────
    location ~ ^/(proxy|search|ai|health|ipc|events|yt-search) {
        proxy_pass         http://127.0.0.1:1421;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_buffering    off;
        proxy_cache        off;
    }

    # ── noVNC (virtual display) ──────────────────────────────────────────────
    location /vnc/ {
        proxy_pass         http://127.0.0.1:6080/;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
    }

    # ── Mobile companion WebSocket ───────────────────────────────────────────
    location /companion {
        proxy_pass         http://127.0.0.1:8766;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host \$host;
    }

    # ── Home Assistant ───────────────────────────────────────────────────────
    # All HA traffic goes through serve.ts (port 1420) which handles:
    #   - /ha/          → HA with Location rewriting + localStorage fix
    #   - /frontend_latest/ /static/ /hacsfiles/ → HA static assets
    #   - /api/         → HA REST + WebSocket
    #   - /auth/        → HA auth flow (authorize/token/callback) — already covered below
    location /ha/ {
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 86400s;
    }

    # HA root-level asset paths — HA frontend JS uses absolute paths
    location ~ ^/(frontend_latest|static|local|hacsfiles)/ {
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    # HA API + WebSocket (called by HA frontend JS with absolute paths)
    location /api/ {
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 86400s;
    }

    # HA manifest + service workers
    location ~ ^/(manifest\.json|sw-modern\.js|sw-registrar\.js)$ {
        proxy_pass         http://127.0.0.1:1420;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Forwarded-Proto \$scheme;
    }

    # Waldiez Studio
    location /studio/ {
        proxy_pass         http://127.0.0.1:8001/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_hide_header  X-Frame-Options;
        proxy_hide_header  Content-Security-Policy;
    }

    # Sinergym — Building Energy Simulation dashboard
    location /sinergym/ {
        proxy_pass         http://127.0.0.1:8090/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        # Required for Server-Sent Events (SSE) — simulation live output
        proxy_buffering    off;
        proxy_cache        off;
        proxy_set_header   X-Accel-Buffering no;
        proxy_hide_header  X-Frame-Options;
        proxy_hide_header  Content-Security-Policy;
    }

    # Smart Cities — Babylon.js building energy visualization
    location /smartcities/ {
        proxy_pass         http://127.0.0.1:8091/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_buffering    off;
        proxy_cache        off;
        proxy_hide_header  X-Frame-Options;
        proxy_hide_header  Content-Security-Policy;
    }

    location /nodered/ {
        proxy_pass         http://127.0.0.1:1880/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
    }

    location /grafana/ {
        proxy_pass         http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
    }

    location /portainer/ {
        proxy_pass         http://127.0.0.1:9000/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
    }

    location /code/ {
        proxy_pass         http://127.0.0.1:8080/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
    }

    # no trailing slash — preserves /jupyter/ prefix so JupyterLab base_url=/jupyter/ is honoured
    location /jupyter/ {
        proxy_pass         http://127.0.0.1:8888;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
    }

    # ── AgentFlow / Workers ───────────────────────────────────────────────────
    # /af/api/ → actor REST API (full agent system) on 8890
    location /af/api/ {
        proxy_pass         http://127.0.0.1:8890/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
    }
    # /af/ → monitor server (WS dashboard + MQTT state) on 8889
    location /af/ {
        proxy_pass         http://127.0.0.1:8889/;
        proxy_http_version 1.1;
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection "upgrade";
    }

    # ── Waldiez Player (static SPA, served from player/dist/) ────────────────
    location /player/ {
        alias ${INSTALL_DIR}/player/dist/;
        try_files \$uri \$uri/ /player/index.html;
        # Cache hashed assets for 1 year, HTML never
        location ~* \.(js|css|woff2?|png|svg|ico|webmanifest|wid)\$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # ── Root — redirect to Limen shell ─────────────────────────────────────
    location = / {
        return 302 /limen/;
    }
}

NGINXCONF

# ── Home Assistant subdomain — ha.DOMAIN (optional) ─────────────────────────
# If HA_DOMAIN is set (e.g. ha.waldiez.io), generate a dedicated server block:
#   - Standard HTTPS 443, no extra firewall rules
#   - Proxies straight to SSH tunnel (127.0.0.1:8124) — HA handles auth + WS
#   - Strips X-Frame-Options so Limen shell can embed HA in an iframe
#   - Adds frame-ancestors CSP allowing only io.waldiez.io
# Set in HA configuration.yaml:
#   homeassistant:
#     external_url: https://ha.waldiez.io
#     internal_url: http://homeassistant.local:8123
install_certbot() {
    command -v certbot >/dev/null 2>&1 && return
    do_install certbot python3-certbot-nginx 2>/dev/null || {
        # Fallback: snap
        do_install snapd 2>/dev/null || true
        snap install --classic certbot 2>/dev/null || true
        ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true
    }
}

HA_DOMAIN="${HA_DOMAIN:-}"
if [ -n "$HA_DOMAIN" ]; then
    step "HA subdomain (${HA_DOMAIN})"
    HA_CERT_PATH="/etc/letsencrypt/live/${HA_DOMAIN}/fullchain.pem"
    HA_CONF_FILE="${NGINX_CONF_DIR}/${HA_DOMAIN}.conf"

    # Write conf - HTTPS if cert exists, HTTP-only otherwise (certbot upgrades later)
    if [ -f "$HA_CERT_PATH" ]; then
        cat > "$HA_CONF_FILE" <<HACONF_HTTPS
# Home Assistant - ${HA_DOMAIN} (generated by setup.sh)
server {
    listen 80;
    server_name ${HA_DOMAIN};
    return 301 https://\$host\$request_uri;
}
server {
    listen 443 ssl;
    server_name ${HA_DOMAIN};
    ssl_certificate     /etc/letsencrypt/live/${HA_DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${HA_DOMAIN}/privkey.pem;

    location / {
        proxy_pass         http://127.0.0.1:8123;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 86400s;
        proxy_hide_header  X-Frame-Options;
        proxy_hide_header  Content-Security-Policy;
        add_header         Content-Security-Policy "frame-ancestors 'self' https://${DOMAIN_NAME};" always;
    }
}
HACONF_HTTPS
    else
        cat > "$HA_CONF_FILE" <<HACONF_HTTP
# Home Assistant - ${HA_DOMAIN} (generated by setup.sh)
server {
    listen 80;
    server_name ${HA_DOMAIN};

    location / {
        proxy_pass         http://127.0.0.1:8123;
        proxy_http_version 1.1;
        proxy_set_header   Host              \$host;
        proxy_set_header   X-Real-IP         \$remote_addr;
        proxy_set_header   X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Upgrade           \$http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 86400s;
        proxy_hide_header  X-Frame-Options;
        proxy_hide_header  Content-Security-Policy;
        add_header         Content-Security-Policy "frame-ancestors 'self' https://${DOMAIN_NAME};" always;
    }
}
HACONF_HTTP
    fi
    [ -n "$NGINX_ENABLED_DIR" ] && ln -sf "$HA_CONF_FILE" "$NGINX_ENABLED_DIR/${HA_DOMAIN}.conf"
    # Use restart if nginx is stopped, reload if running
    nginx -t && { systemctl is-active nginx >/dev/null 2>&1 && systemctl reload nginx || systemctl restart nginx; } \
        && ok "HA nginx active for ${HA_DOMAIN}" \
        || warn "nginx config error for ${HA_DOMAIN} -- check manually"

    # Issue cert if not present and certbot allowed
    if [ ! -f "$HA_CERT_PATH" ] && [ "$SKIP_CERTBOT" != "1" ]; then
        if curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://${HA_DOMAIN}/" \
                | grep -qE '^[23][0-9]{2}$'; then
            install_certbot
            if [ -n "$CERTBOT_EMAIL" ]; then
                certbot --nginx -d "$HA_DOMAIN" \
                    --agree-tos --redirect --hsts \
                    --non-interactive --quiet --no-eff-email \
                    -m "$CERTBOT_EMAIL"
            else
                certbot --nginx -d "$HA_DOMAIN" \
                    --agree-tos --redirect --hsts \
                    --non-interactive --quiet --no-eff-email \
                    --register-unsafely-without-email
            fi
            nginx -t && systemctl reload nginx
            ok "SSL cert issued -- https://${HA_DOMAIN} is live"
        else
            warn "${HA_DOMAIN} not reachable yet -- run again once DNS propagates"
        fi
    fi
fi

# Disable default site if present
if [ -n "$NGINX_ENABLED_DIR" ]; then
    rm -f "$NGINX_ENABLED_DIR/default"
    ln -sf "$NGINX_SITE_CONF" "$NGINX_ENABLED_DIR/${DOMAIN_NAME}.conf"
fi

nginx -t && { systemctl is-active nginx >/dev/null 2>&1 && systemctl reload nginx || systemctl restart nginx; }
ok "nginx configured for $DOMAIN_NAME"

# ── SSL / Certbot ─────────────────────────────────────────────────────────────

if [ "$SKIP_CERTBOT" = "1" ]; then
    warn "Skipping SSL cert (--skip-certbot). Access via http://$DOMAIN_NAME"
else
    step "SSL cert (Let's Encrypt)"
    # Verify domain is reachable first
    if ! curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://${DOMAIN_NAME}/" \
            | grep -qE '^[23][0-9]{2}$'; then
        warn "$DOMAIN_NAME not reachable yet — check DNS / firewall."
        warn "Re-run with SKIP_CERTBOT=0 once DNS propagates."
    else
        install_certbot
        if [ -n "$CERTBOT_EMAIL" ]; then
            certbot --nginx -d "$DOMAIN_NAME" \
                --agree-tos --redirect --hsts --staple-ocsp \
                --non-interactive --quiet --no-eff-email \
                -m "$CERTBOT_EMAIL"
        else
            certbot --nginx -d "$DOMAIN_NAME" \
                --agree-tos --redirect --hsts --staple-ocsp \
                --non-interactive --quiet --no-eff-email \
                --register-unsafely-without-email
        fi
        nginx -t && systemctl reload nginx
        ok "SSL cert issued — https://$DOMAIN_NAME is live"
    fi
fi

# ── Re-deploy helper (idempotent, call on every push) ─────────────────────────
REDEPLOY="$INSTALL_DIR/scripts/redeploy.sh"
cat > "$REDEPLOY" <<'RDEOF'
#!/usr/bin/env bash
# redeploy.sh — Pull latest code and rebuild. Run after every push.
# Usage: bash /opt/limen/scripts/redeploy.sh
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR"
git pull origin main
make packages-build
make shell-build
systemctl restart limen-static 2>/dev/null || true
[ -x "$INSTALL_DIR/target/release/synapsd" ] && systemctl restart synapsd 2>/dev/null || true
echo "✓ Redeployed at $(date '+%Y-%m-%dT%H:%M:%S')"
RDEOF
chmod +x "$REDEPLOY"
chown "$LIMEN_USER:$LIMEN_USER" "$REDEPLOY"

# ── GitHub Actions / auto-deploy webhook (optional) ──────────────────────────
HOOK="$INSTALL_DIR/scripts/webhook-redeploy.sh"
cat > "$HOOK" <<HOOKEOF
#!/usr/bin/env sh
# Minimal deploy webhook — call from CI or a GitHub Actions "ssh" step:
#   ssh deploy@${DOMAIN_NAME} /opt/limen/scripts/webhook-redeploy.sh
exec sudo -u $LIMEN_USER bash $REDEPLOY
HOOKEOF
chmod +x "$HOOK"

# ── Final summary ─────────────────────────────────────────────────────────────
echo
echo -e "${_c}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_n}"
echo    "  LIMEN OS setup complete"
echo -e "${_c}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_n}"
PROTO="http"; [ "$SKIP_CERTBOT" != "1" ] && PROTO="https"
echo
echo "  🖥️   Desktop:    ${PROTO}://${DOMAIN_NAME}/vnc/  ← LIMEN OS live"
echo "  🌐  Shell SPA:  ${PROTO}://${DOMAIN_NAME}/"
echo "  🔌  Relay/AI:   ${PROTO}://${DOMAIN_NAME}/ai  (POST)"
echo "  📡  Events SSE: ${PROTO}://${DOMAIN_NAME}/events"
echo "  📱  Companion:  wss://${DOMAIN_NAME}/companion"
if [ "$SKIP_DISPLAY" != "1" ]; then
echo "  🎮  VNC raw:    :5900  (firewalled — use /vnc/ instead)"
fi
echo
echo "  Edit API keys:  $ENV_FILE"
echo "  Re-deploy:      bash $REDEPLOY"
echo "  Status:         bash ${INSTALL_DIR}/scripts/server-setup.sh --status"
echo
echo -e "${_c}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_n}"
