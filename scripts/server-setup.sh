#!/usr/bin/env bash
# server-setup.sh — Install LIMEN OS on a server/VM
#
# Modes:
#   --full     Everything: SPA + Xvfb + Kiosk + synapsd + x11vnc + noVNC  ← recommended
#   --phase1   Static SPA server only (browser access, no display needed)
#   --phase2   + Xvfb + Chromium kiosk  (full-screen desktop on VM display)
#   --phase3   + Tauri native binary    (full Tauri shell, needs shell-build first)
#   --status   Show status of all services
#
# Usage (run as any user with sudo access, or as root):
#   bash /opt/limen/scripts/server-setup.sh --full
#
# Or from dev machine via SSH:
#   ssh user@vm-host "bash -s" < ./scripts/server-setup.sh -- --full
#
# After --full:
#   SPA:    http://<vm>:1420             (nginx: location / { proxy_pass http://localhost:1420; })
#   noVNC:  http://<vm>:6080/vnc.html   (nginx: location /vnc/ { proxy_pass http://localhost:6080/; })
#   synapsd ws://<vm>:8766/companion    (nginx: location /companion { proxy_pass http://localhost:8766; upgrade; })
#   VNC raw :5900 — firewall this port, access only via noVNC
#
# Optional env:
#   LIMEN_ROOT=/opt/limen   install path
#   LIMEN_USER=limen        service account
#   SKIP_KIOSK=1                skip Xvfb + Chromium (no desktop needed)
#   SKIP_DAEMON=1               skip synapsd

set -euo pipefail

LIMEN_ROOT="${LIMEN_ROOT:-/opt/limen}"
LIMEN_USER="${LIMEN_USER:-limen}"
SKIP_KIOSK="${SKIP_KIOSK:-0}"
SKIP_DAEMON="${SKIP_DAEMON:-0}"
BUN_BIN="${BUN_BIN:-}"
PHASE="${1:---phase1}"

# ── Colors ─────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}→${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
die()   { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
step()  { echo; echo -e "${CYAN}━━ $* ━━${NC}"; }

# Privilege helper — use sudo when not already root
if [[ "$(id -u)" == "0" ]]; then SUDO=""; else SUDO="sudo"; fi

detect_bun() {
  [[ -n "$BUN_BIN" ]] && return
  # Check PATH first so a locally-sourced bun is found without needing root
  if command -v bun &>/dev/null; then BUN_BIN="$(command -v bun)"; return; fi
  for p in /usr/local/bin/bun \
            ~/.local/deb/.bun/bin/bun \
            /opt/limen/.local/deb/.bun/bin/bun \
            /home/"$LIMEN_USER"/.local/deb/.bun/bin/bun \
            /home/"$LIMEN_USER"/.bun/bin/bun \
            /root/.local/deb/.bun/bin/bun \
            /root/.bun/bin/bun; do
    [[ -x "$p" ]] && { BUN_BIN="$p"; return; }
  done
  die "Bun not found. Run: curl -fsSL https://bun.sh/install | bash"
}

install_svc() {
  local name="$1"
  local src="$LIMEN_ROOT/scripts/systemd/${name}.service"
  [[ -f "$src" ]] || die "Service file missing: $src"
  sed \
    -e "s|/opt/limen|${LIMEN_ROOT}|g" \
    -e "s|User=limen|User=${LIMEN_USER}|g" \
    -e "s|Group=limen|Group=${LIMEN_USER}|g" \
    "$src" | $SUDO tee "/etc/systemd/system/${name}.service" > /dev/null
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable "$name"
  $SUDO systemctl restart "$name"
  ok "$name enabled + started"
}

# ── Setup: user + dirs ─────────────────────────────────────────────────────────

setup_user() {
  step "System user"
  if id "$LIMEN_USER" &>/dev/null; then
    warn "User $LIMEN_USER already exists"
  else
    $SUDO useradd --system --create-home --shell /bin/bash "$LIMEN_USER"
    ok "Created user: $LIMEN_USER"
  fi
  $SUDO mkdir -p "$LIMEN_ROOT"
  $SUDO chown -R "$LIMEN_USER:$LIMEN_USER" "$LIMEN_ROOT" 2>/dev/null || true
  ok "Dirs owned by $LIMEN_USER"
}

setup_bun() {
  detect_bun
  [[ -x /usr/local/bin/bun ]] || $SUDO ln -sf "$BUN_BIN" /usr/local/bin/bun
  ok "bun → /usr/local/bin/bun (${BUN_BIN})"
}

# ── Service installers ─────────────────────────────────────────────────────────

install_docker() {
  step "Docker + Docker Compose"
  if command -v docker &>/dev/null; then
    ok "Docker already installed: $(docker --version)"
  else
    info "Installing Docker (official script)..."
    curl -fsSL https://get.docker.com | $SUDO sh
    $SUDO usermod -aG docker "$LIMEN_USER" || true
    $SUDO systemctl enable --now docker
    ok "Docker installed"
  fi
}

install_stack() {
  step "Docker Compose stack  (HA + Jupyter + VS Code + Studio + MQTT + Whisper)"
  [[ -f "$LIMEN_ROOT/docker/stack.yml" ]] || die "stack.yml missing: $LIMEN_ROOT/docker/stack.yml"
  local data_dir="${LIMEN_DATA_DIR:-/opt/limen/data}"
  mkdir -p "$data_dir/ha-config" "$LIMEN_ROOT/workspace" "$LIMEN_ROOT/notebooks" \
           "$data_dir/studio-workspace" "$LIMEN_ROOT/extensions" "$LIMEN_ROOT/player/dist"
  chown -R "$LIMEN_USER:$LIMEN_USER" "$data_dir" "$LIMEN_ROOT/workspace" \
            "$LIMEN_ROOT/notebooks" "$LIMEN_ROOT/extensions" 2>/dev/null || true
  # Placeholder VSIX so the Docker volume mount doesn't error on first boot
  [[ -f "$LIMEN_ROOT/extensions/waldiez-vscode.vsix" ]] || \
    touch "$LIMEN_ROOT/extensions/waldiez-vscode.vsix"
  # Build agentflow image if source is present; enable profile so Workers starts
  local compose_profiles=()
  if [[ -f "$LIMEN_ROOT/docker/tools/agentflow/Dockerfile" ]]; then
    cd "$LIMEN_ROOT"
    docker compose -f docker/stack.yml build agentflow 2>&1 | tail -5 || warn "agentflow build failed"
    compose_profiles=(--profile agentflow)
  fi
  cd "$LIMEN_ROOT"
  docker compose -f docker/stack.yml "${compose_profiles[@]}" up -d --remove-orphans
  ok "Docker stack running${compose_profiles:+ (Workers enabled)}"
  # Install limen-stack.service
  if [[ -f "$LIMEN_ROOT/scripts/systemd/limen-stack.service" ]]; then
    sed -e "s|/opt/limen|${LIMEN_ROOT}|g" \
        "$LIMEN_ROOT/scripts/systemd/limen-stack.service" \
        | $SUDO tee /etc/systemd/system/limen-stack.service > /dev/null
    $SUDO systemctl daemon-reload
    $SUDO systemctl enable limen-stack
    ok "limen-stack.service enabled"
  fi
}

install_serve() {
  step "limen-serve  (SPA + proxy → :1420)"
  [[ -f "$LIMEN_ROOT/apps/shell/dist/index.html" ]] || {
    warn "dist/ not built — building now..."
    cd "$LIMEN_ROOT"
    $SUDO -u "$LIMEN_USER" bash -c "cd '$LIMEN_ROOT' && make packages-build server-build" \
      || die "Build failed. Run: make packages-build server-build"
  }
  $SUDO mkdir -p /etc/limen
  if [[ ! -f /etc/limen/serve.env ]]; then
    $SUDO tee /etc/limen/serve.env > /dev/null << 'SVCENV'
# LIMEN OS — serve.ts secrets + overrides
# Uncomment and set TLS cert paths for HTTPS (mic/camera requires HTTPS).
# Let's Encrypt: certbot --nginx -d io.waldiez.io
#   LIMEN_TLS_CERT=/etc/letsencrypt/live/io.waldiez.io/fullchain.pem
#   LIMEN_TLS_KEY=/etc/letsencrypt/live/io.waldiez.io/privkey.pem
# Self-signed (LAN):
#   LIMEN_TLS_CERT=/etc/limen/certs/cert.pem
#   LIMEN_TLS_KEY=/etc/limen/certs/key.pem
HA_ORIGIN=http://127.0.0.1:8123
SVCENV
    $SUDO chmod 640 /etc/limen/serve.env
    $SUDO chown root:"$LIMEN_USER" /etc/limen/serve.env
    ok "Created /etc/limen/serve.env (edit to add TLS cert paths)"
  else
    ok "/etc/limen/serve.env exists — not overwritten"
  fi
  id ssl-cert &>/dev/null && $SUDO usermod -aG ssl-cert "$LIMEN_USER" || true
  sed \
    -e "s|/opt/limen|${LIMEN_ROOT}|g" \
    -e "s|/usr/local/bin/bun|${BUN_BIN}|g" \
    -e "s|User=limen|User=${LIMEN_USER}|g" \
    -e "s|Group=limen|Group=${LIMEN_USER}|g" \
    "$LIMEN_ROOT/scripts/systemd/limen-serve.service" \
    | $SUDO tee /etc/systemd/system/limen-serve.service > /dev/null
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable limen-serve
  $SUDO systemctl restart limen-serve
  ok "limen-serve on :1420"
}

install_static() {
  # Backward compat alias → install_serve
  install_serve
}

install_xvfb() {
  step "Xvfb  (virtual display :99)"
  command -v Xvfb &>/dev/null || { $SUDO apt-get update -qq; $SUDO apt-get install -y --no-install-recommends xvfb; }
  install_svc limen-xvfb
  sleep 1
  ok "DISPLAY=:99 ready"
}

install_openbox() {
  step "Openbox  (minimal WM on :99)"
  command -v openbox &>/dev/null || {
    $SUDO apt-get update -qq
    $SUDO apt-get install -y --no-install-recommends openbox x11-xserver-utils
  }
  install_svc limen-openbox
  ok "Openbox running on DISPLAY=:99"
}

install_kiosk() {
  step "Chromium kiosk"
  CHROMIUM_BIN=""
  for b in chromium chromium-browser google-chrome; do
    command -v "$b" &>/dev/null && { CHROMIUM_BIN="$(command -v "$b")"; break; }
  done
  [[ -n "$CHROMIUM_BIN" ]] || {
    $SUDO apt-get update -qq
    $SUDO apt-get install -y --no-install-recommends chromium
    CHROMIUM_BIN="$(command -v chromium || command -v chromium-browser)"
  }
  ok "Chromium: $CHROMIUM_BIN"

  sed \
    -e "s|/usr/bin/chromium\b|${CHROMIUM_BIN}|g" \
    -e "s|User=limen|User=${LIMEN_USER}|g" \
    -e "s|Group=limen|Group=${LIMEN_USER}|g" \
    "$LIMEN_ROOT/scripts/systemd/limen-kiosk.service" \
    | $SUDO tee /etc/systemd/system/limen-kiosk.service > /dev/null
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable limen-kiosk
  $SUDO systemctl restart limen-kiosk
  ok "Kiosk running on DISPLAY=:99"
}

install_x11vnc() {
  step "x11vnc  (VNC → :5900)"
  command -v x11vnc &>/dev/null || { $SUDO apt-get update -qq; $SUDO apt-get install -y --no-install-recommends x11vnc; }
  install_svc limen-x11vnc
  ok "VNC server on :5900"
}

install_novnc() {
  step "noVNC  (browser VNC → :6080)"
  WEBSOCKIFY=""
  command -v websockify &>/dev/null && WEBSOCKIFY="$(command -v websockify)"

  if [[ -z "$WEBSOCKIFY" ]]; then
    $SUDO apt-get update -qq
    # Try package first, fall back to pip
    $SUDO apt-get install -y --no-install-recommends novnc websockify 2>/dev/null \
      || $SUDO pip3 install --quiet websockify
    WEBSOCKIFY="$(command -v websockify)"
  fi

  # noVNC web files location
  NOVNC_WEB=""
  for p in /usr/share/novnc /usr/local/share/novnc; do
    [[ -f "$p/vnc.html" ]] && { NOVNC_WEB="$p"; break; }
  done
  [[ -n "$NOVNC_WEB" ]] || die "noVNC web files not found — check your novnc install"

  # Patch websockify and web paths
  sed \
    -e "s|/usr/bin/websockify|${WEBSOCKIFY}|g" \
    -e "s|/usr/share/novnc|${NOVNC_WEB}|g" \
    -e "s|User=limen|User=${LIMEN_USER}|g" \
    -e "s|Group=limen|Group=${LIMEN_USER}|g" \
    "$LIMEN_ROOT/scripts/systemd/limen-novnc.service" \
    | $SUDO tee /etc/systemd/system/limen-novnc.service > /dev/null
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable limen-novnc
  $SUDO systemctl restart limen-novnc
  ok "noVNC on :6080"
}

install_synapsd() {
  step "synapsd  (core daemon + companion WS :8766)"
  SYNAPSD_BIN=""
  for p in "$LIMEN_ROOT/target/release/synapsd" /usr/local/bin/synapsd; do
    [[ -x "$p" ]] && { SYNAPSD_BIN="$p"; break; }
  done
  if [[ -z "$SYNAPSD_BIN" ]]; then
    warn "synapsd binary not found — skipping daemon"
    warn "Build with: cargo build --release -p limen-core --bin synapsd"
    warn "Then re-run this script."
    return
  fi
  sed \
    -e "s|ExecStart=.*|ExecStart=${SYNAPSD_BIN}|" \
    -e "s|User=%i|User=${LIMEN_USER}|g" \
    "$LIMEN_ROOT/scripts/systemd/synapsd.service" \
    | $SUDO tee /etc/systemd/system/synapsd.service > /dev/null
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable synapsd
  $SUDO systemctl restart synapsd
  ok "synapsd running"
}

install_tauri_service() {
  step "limen-tauri.service  (native binary)"
  BINARY="$LIMEN_ROOT/apps/shell/src-tauri/target/release/limen-shell"
  [[ -f "$BINARY" ]] || die "Tauri binary not found: $BINARY\n  Run: make shell-build"
  $SUDO systemctl disable --now limen-kiosk 2>/dev/null || true
  install_svc limen-tauri
  ok "Tauri native shell running"
}

# ── Status ─────────────────────────────────────────────────────────────────────

show_status() {
  local IP
  IP="$(hostname -I | awk '{print $1}')"
  echo
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  LIMEN OS — Services"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  for svc in limen-stack limen-serve limen-xvfb limen-openbox limen-kiosk limen-tauri \
             limen-x11vnc limen-novnc synapsd; do
    if $SUDO systemctl is-active --quiet "$svc" 2>/dev/null; then
      echo -e "  ${GREEN}●${NC} $svc"
    elif $SUDO systemctl is-enabled --quiet "$svc" 2>/dev/null; then
      echo -e "  ${YELLOW}●${NC} $svc  (enabled, not running)"
    else
      echo -e "  ${RED}○${NC} $svc"
    fi
  done
  echo
  echo -e "  SPA:       http://${IP}:1420"
  echo -e "  noVNC:     http://${IP}:6080/vnc.html"
  echo -e "  Companion: ws://${IP}:8766/companion"
  echo
  echo -e "  nginx snippets:"
  echo -e "    ${CYAN}location /          { proxy_pass http://localhost:1420; }${NC}"
  echo -e "    ${CYAN}location /vnc/      { proxy_pass http://localhost:6080/; }${NC}"
  echo -e "    ${CYAN}location /companion { proxy_pass http://localhost:8766; upgrade; }${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ── Dispatch ───────────────────────────────────────────────────────────────────

case "$PHASE" in
  --full)
    # Full Debian/EC2 production setup: Docker stack + Bun proxy + optional kiosk
    setup_user
    setup_bun
    install_docker
    install_stack
    install_serve
    if [[ "$SKIP_KIOSK" != "1" ]]; then
      install_xvfb
      install_openbox
      install_kiosk
      install_x11vnc
      install_novnc
    fi
    [[ "$SKIP_DAEMON" != "1" ]] && install_synapsd || true
    show_status
    ;;

  --services)
    # Install Docker + start the Compose stack only (no Bun server, no kiosk)
    setup_user
    install_docker
    install_stack
    show_status
    ;;

  --phase1)
    # SPA server + Docker stack (recommended minimal Debian setup)
    setup_user
    setup_bun
    install_docker
    install_stack
    install_serve
    show_status
    ;;

  --phase2)
    setup_bun
    install_docker
    install_stack
    install_serve
    install_xvfb
    install_openbox
    install_kiosk
    show_status
    ;;

  --phase3)
    setup_bun
    install_xvfb
    install_tauri_service
    show_status
    ;;

  --install-synapsd)
    install_synapsd
    ;;

  --install-tauri)
    install_tauri_service
    ;;

  --status)
    show_status
    ;;

  --help|-h)
    grep '^#' "$0" | grep -v '#!/' | sed 's/^# \?//'
    ;;

  *)
    die "Unknown option: $PHASE\nUsage: $0 --full | --phase1 | --phase2 | --phase3 | --install-synapsd | --status"
    ;;
esac
