#!/usr/bin/env bash
# LIMEN OS — Native service setup (no Docker)
# Installs and configures JupyterLab (pip) and Node-RED (npm).
#
# Usage:
#   bash scripts/services-setup.sh [--jupyter] [--nodered] [--all] [--status]
#
# Run as the limen user (sudo for systemctl install steps).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="$SCRIPT_DIR/systemd"

# ── Helpers ───────────────────────────────────────────────────────────────────

info()  { echo ">>> $*"; }
ok()    { echo "✓  $*"; }
fail()  { echo "✗  $*" >&2; exit 1; }

need_root() {
  [ "$(id -u)" -eq 0 ] || fail "Run this step with sudo."
}

install_systemd_service() {
  local name="$1"
  local src="$SYSTEMD_DIR/${name}.service"
  local dst="/etc/systemd/system/${name}.service"
  need_root
  cp "$src" "$dst"
  systemctl daemon-reload
  systemctl enable "$name"
  systemctl restart "$name"
  ok "$name service installed and started."
}

# ── JupyterLab ────────────────────────────────────────────────────────────────

setup_jupyter() {
  info "Installing JupyterLab via pip..."
  python3 -m pip install --user --upgrade jupyterlab notebook

  info "Creating notebook directory..."
  mkdir -p /opt/limen/notebooks

  ok "JupyterLab installed: $(python3 -m jupyter --version 2>/dev/null || echo 'check manually')"
  info "To run manually:  jupyter lab --no-browser --ip=127.0.0.1 --port=8888 --base-url=/jupyter/"
  info "To install as a service:  sudo bash $0 --jupyter-service"
}

install_jupyter_service() {
  # Patch the ExecStart path to the actual jupyter binary on this system.
  local bin
  bin=$(python3 -m jupyter --version >/dev/null 2>&1 && python3 -c "import shutil; print(shutil.which('jupyter') or '')" 2>/dev/null || echo "")
  if [ -z "$bin" ]; then
    fail "JupyterLab not found. Run 'make jupyter-setup' first."
  fi
  install_systemd_service jupyter
}

# ── Node-RED ──────────────────────────────────────────────────────────────────

setup_nodered() {
  info "Installing Node-RED via npm..."
  # Use local npm if available, fall back to system npm.
  NPM=$(command -v npm || echo "")
  [ -z "$NPM" ] && fail "npm not found. Install Node.js first."
  $NPM install -g node-red

  # Create settings.js that sets httpRoot so all paths are under /nodered/
  local cfg_dir="${HOME}/.node-red"
  mkdir -p "$cfg_dir"
  if [ ! -f "$cfg_dir/settings.js" ]; then
    info "Writing Node-RED settings.js..."
    cat > "$cfg_dir/settings.js" << 'EOF'
module.exports = {
    uiPort: 1880,
    // Serve Node-RED under /nodered/ to match the nginx reverse proxy path.
    httpRoot: '/nodered',
    // Disable auth for trusted local+nginx access.
    adminAuth: null,
    httpNodeCors: { origin: '*', methods: 'GET,PUT,POST,DELETE' },
    functionGlobalContext: {},
    exportGlobalContextKeys: false,
    logging: { console: { level: 'info', metrics: false, audit: false } },
}
EOF
  fi

  ok "Node-RED installed: $(node-red --version 2>/dev/null || echo 'check manually')"
  info "To run manually:  node-red --port 1880 --userDir ~/.node-red"
  info "To install as a service:  sudo bash $0 --nodered-service"
}

install_nodered_service() {
  local bin
  bin=$(command -v node-red || echo "")
  [ -z "$bin" ] && fail "Node-RED not found. Run 'make nodered-setup' first."
  install_systemd_service nodered
}

# ── Limen TUI (ttyd) ────────────────────────────────────────────────────────

setup_tui() {
  info "Installing ttyd..."
  if ! command -v ttyd &>/dev/null; then
    # Try apt first, fall back to GitHub release
    apt-get install -y ttyd 2>/dev/null || {
      info "ttyd not in apt, downloading from GitHub..."
      local arch
      arch=$(uname -m)
      local ttyd_bin="ttyd.x86_64"
      [ "$arch" = "aarch64" ] && ttyd_bin="ttyd.aarch64"
      curl -fsSL "https://github.com/tsl0922/ttyd/releases/latest/download/${ttyd_bin}" \
        -o /usr/local/bin/ttyd
      chmod +x /usr/local/bin/ttyd
    }
  fi
  ok "ttyd installed: $(ttyd --version 2>/dev/null || echo 'check manually')"
  info "To install as a service:  sudo bash $0 --tui-service"
}

install_tui_service() {
  command -v ttyd &>/dev/null || fail "ttyd not found. Run 'sudo bash $0 --tui' first."
  [ -x "/opt/limen/bin/limen-tui" ] || fail "/opt/limen/bin/limen-tui not found. Run 'make tui-build' and deploy first."
  install_systemd_service limen-tui
}

# ── Status ────────────────────────────────────────────────────────────────────

show_status() {
  for svc in jupyter nodered limen-tui; do
    if systemctl is-active --quiet "$svc" 2>/dev/null; then
      ok "$svc is RUNNING"
    else
      echo "  $svc is STOPPED"
    fi
  done
}

# ── Main ──────────────────────────────────────────────────────────────────────

case "${1:-}" in
  --jupyter)          setup_jupyter ;;
  --jupyter-service)  install_jupyter_service ;;
  --nodered)          setup_nodered ;;
  --nodered-service)  install_nodered_service ;;
  --tui)              need_root; setup_tui ;;
  --tui-service)      need_root; install_tui_service ;;
  --all)              setup_jupyter; setup_nodered ;;
  --status)           show_status ;;
  *)
    echo "Usage: $0 [--jupyter|--nodered|--tui|--all|--status]"
    echo "       sudo $0 [--jupyter-service|--nodered-service|--tui-service]"
    ;;
esac
