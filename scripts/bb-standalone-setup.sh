#!/usr/bin/env bash
# bb-standalone-setup.sh — Provision a BeagleBone (or any Armbian aarch64/armhf SBC)
# as a standalone Limen OS node.  No Home Assistant required.
#
# What this installs:
#   - Bun runtime (JS/TS server)
#   - Pre-built shell dist from apps/shell/dist/
#   - serve.ts copied to /opt/limen/scripts/
#   - systemd: limen-serve (port 1420, auto-start on boot)
#   - systemd: limen-kiosk (Chromium full-screen → localhost:1420/limen/)
#   - GNOME auto-login for the limen user (if GNOME is installed)
#   - Optional: limen-tui binary + ttyd (if BB_TUI=1)
#
# Usage:
#   BB_HOST=192.168.1.xx bash scripts/bb-standalone-setup.sh
#   BB_HOST=bb.local BB_USER=debian BB_KEY=~/.ssh/id_rsa bash scripts/bb-standalone-setup.sh
#   BB_HOST=192.168.1.xx BB_TUI=1 bash scripts/bb-standalone-setup.sh
#
# Pre-requisites on the BeagleBone:
#   - Armbian Bookworm (Debian 12) — desktop or CLI image
#   - SSH access (root or sudo user)
#   - Internet connection
#
# For GNOME kiosk auto-start add GNOME to the image first:
#   apt-get install -y gnome-core gdm3
# or use a pre-built Armbian Desktop image.

set -euo pipefail

BB_HOST="${BB_HOST:-}"
BB_USER="${BB_USER:-root}"
BB_KEY="${BB_KEY:-}"
BB_TUI="${BB_TUI:-0}"
SKIP_DISPLAY="${SKIP_DISPLAY:-0}"
# LIMEN_USER="${LIMEN_USER:-limen}"
LIMEN_USER="${LIMEN_USER:-debian}"
INSTALL_DIR="${INSTALL_DIR:-/opt/limen}"
KIOSK_URL="${KIOSK_URL:-http://localhost:1420/limen/}"

if [[ -z "$BB_HOST" ]]; then
  echo "Usage: BB_HOST=<ip-or-hostname> bash scripts/bb-standalone-setup.sh"
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

SSH_OPTS=(-o "StrictHostKeyChecking=no" -o "ConnectTimeout=15" -o "ServerAliveInterval=30")
[[ -n "$BB_KEY" ]] && SSH_OPTS+=(-i "$BB_KEY")

bb()  { ssh  "${SSH_OPTS[@]}" "${BB_USER}@${BB_HOST}" "$@"; }
bbs() { ssh  "${SSH_OPTS[@]}" "${BB_USER}@${BB_HOST}" "bash -s"; }
put() { scp  "${SSH_OPTS[@]}" -r "$1" "${BB_USER}@${BB_HOST}:$2"; }
syn() { rsync -az --progress "${SSH_OPTS[@]/#-o/--rsh=ssh -o}" \
        -e "ssh ${SSH_OPTS[*]}" "$1" "${BB_USER}@${BB_HOST}:$2"; }

BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
step() { echo -e "\n${BOLD}${CYAN}━━ $* ━━${RESET}"; }
ok()   { echo -e "  ${GREEN}✓ $*${RESET}"; }
warn() { echo -e "  ${YELLOW}⚠ $*${RESET}"; }

# ── 0. Connectivity ───────────────────────────────────────────────────────────
step "Connecting to ${BB_HOST}"
bb "uname -a && cat /etc/os-release | grep -E '^(NAME|VERSION)='"
ok "SSH OK"

# ── 1. System packages ────────────────────────────────────────────────────────
step "System packages"
if [[ "$SKIP_DISPLAY" == "1" ]]; then
  bb "apt-get update -qq && apt-get install -y -qq --no-install-recommends \
      curl ca-certificates unzip git \
      2>/dev/null || true"
else
  bb "apt-get update -qq && apt-get install -y -qq --no-install-recommends \
      curl ca-certificates unzip git \
      chromium-browser xvfb x11vnc openbox \
      ttyd \
      2>/dev/null || \
      apt-get install -y -qq --no-install-recommends \
      curl ca-certificates unzip git \
      chromium xvfb x11vnc openbox \
      2>/dev/null || true"
fi
ok "Packages installed"

# ── 2. Limen system user ────────────────────────────────────────────────────
step "Limen user"
bb "id $LIMEN_USER >/dev/null 2>&1 || useradd -r -m -s /bin/bash -d /home/$LIMEN_USER $LIMEN_USER"
bb "mkdir -p $INSTALL_DIR && chown $LIMEN_USER:$LIMEN_USER $INSTALL_DIR"
ok "User $LIMEN_USER ready"

# ── 3. Bun runtime ────────────────────────────────────────────────────────────
step "Bun runtime"
# Force correct arch — bun.sh/install may pick x86-64 on ARM boards
bb "
  BB_ARCH=\$(uname -m)
  BUN_HOME=/home/$LIMEN_USER/.bun
  BUN_BIN=\$BUN_HOME/bin/bun
  if [ -f \"\$BUN_BIN\" ] && \"\$BUN_BIN\" --version >/dev/null 2>&1; then
    echo 'Bun already installed'
  else
    rm -rf \"\$BUN_HOME\"
    mkdir -p \"\$BUN_HOME/bin\"
    if [ \"\$BB_ARCH\" = 'aarch64' ] || [ \"\$BB_ARCH\" = 'arm64' ]; then
      BUN_ZIP=bun-linux-aarch64.zip
    elif [ \"\$BB_ARCH\" = 'armv7l' ] || [ \"\$BB_ARCH\" = 'armhf' ]; then
      echo 'armv7 not supported by Bun — installing Node.js instead'
      apt-get install -y -qq nodejs 2>/dev/null || true
      ln -sf \$(command -v node) /usr/local/bin/bun 2>/dev/null || true
      touch /tmp/limen_use_node
      exit 0
    else
      BUN_ZIP=bun-linux-x64.zip
    fi
    curl -fsSL \"https://github.com/oven-sh/bun/releases/latest/download/\$BUN_ZIP\" -o /tmp/bun.zip
    unzip -q /tmp/bun.zip -d /tmp/bun-extract
    mv /tmp/bun-extract/*/bun \"\$BUN_BIN\"
    chmod +x \"\$BUN_BIN\"
    chown -R $LIMEN_USER:$LIMEN_USER \"\$BUN_HOME\"
    rm -rf /tmp/bun.zip /tmp/bun-extract
  fi
  ln -sf \"\$BUN_BIN\" /usr/local/bin/bun 2>/dev/null || true
"
BUN_VER=$(bb "/usr/local/bin/bun --version 2>/dev/null || echo unknown")
ok "Bun $BUN_VER"

# ── 4. Sync limen files ─────────────────────────────────────────────────────
step "Syncing Limen OS files"

# Build shell dist if not present
if [[ ! -d "$REPO_ROOT/apps/shell/dist" ]]; then
  warn "apps/shell/dist/ not found — building locally first..."
  cd "$REPO_ROOT" && VITE_BASE_PATH=/limen/ bun run --filter '@limen-os/shell' build
fi

# Sync serve scripts and shell dist
bb "mkdir -p $INSTALL_DIR/scripts $INSTALL_DIR/apps/shell"
put "$REPO_ROOT/scripts/serve.ts"            "$INSTALL_DIR/scripts/serve.ts"
put "$REPO_ROOT/scripts/serve-node.mjs"      "$INSTALL_DIR/scripts/serve-node.mjs"
put "$REPO_ROOT/scripts/ha-agent.ts"         "$INSTALL_DIR/scripts/ha-agent.ts"
put "$REPO_ROOT/apps/shell/dist"             "$INSTALL_DIR/apps/shell/"
ok "Files synced"

# ── 5. Environment file ───────────────────────────────────────────────────────
step "Environment config"
bb "mkdir -p /etc/limen && [ -f /etc/limen/serve.env ] || cat > /etc/limen/serve.env" <<ENVEOF
PORT=1420
HOST=0.0.0.0
LIMEN_DIST=${INSTALL_DIR}/apps/shell/dist
LIMEN_AUTH_USER=limen
LIMEN_AUTH_PASS=limen
ENVEOF
ok "/etc/limen/serve.env written (edit to set passwords / API keys)"

# ── 6. systemd: limen-serve ─────────────────────────────────────────────────
step "systemd: limen-serve"
# Detect runtime: armv7l → Node.js + serve-node.mjs; else Bun + serve.ts
USE_NODE=$(bb "[ -f /tmp/limen_use_node ] && echo 1 || uname -m | grep -q armv7 && echo 1 || echo 0")
if [[ "$USE_NODE" == "1" ]]; then
  EXEC_START="/usr/bin/node ${INSTALL_DIR}/scripts/serve-node.mjs"
  SVC_DESC="Limen OS — SPA server + proxy (Node.js)"
else
  EXEC_START="/home/${LIMEN_USER}/.bun/bin/bun ${INSTALL_DIR}/scripts/serve.ts"
  SVC_DESC="Limen OS — SPA server + proxy (Bun)"
fi
bb "cat > /etc/systemd/system/limen-serve.service" <<SVC
[Unit]
Description=${SVC_DESC}
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${LIMEN_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${EXEC_START}
EnvironmentFile=-/etc/limen/serve.env
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVC
bb "systemctl daemon-reload && systemctl enable limen-serve && systemctl restart limen-serve"
ok "limen-serve enabled + running on port 1420"

# ── 7. systemd: limen-kiosk (Xvfb + Chromium or native X11) ────────────────
if [[ "$SKIP_DISPLAY" == "1" ]]; then
  step "Display services skipped (SKIP_DISPLAY=1)"
  ok "Headless mode — open http://${BB_HOST}:1420/limen/ from any browser on the LAN"
else
step "systemd: limen-kiosk"
bb "cat > /etc/systemd/system/limen-xvfb.service" <<XFB
[Unit]
Description=Limen OS — Xvfb virtual framebuffer :99
Before=limen-kiosk.service

[Service]
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac +extension RANDR
Restart=always
RestartSec=3s

[Install]
WantedBy=multi-user.target
XFB

bb "cat > /etc/systemd/system/limen-kiosk.service" <<KIOSK
[Unit]
Description=Limen OS — Chromium kiosk
After=limen-serve.service limen-xvfb.service network-online.target
Wants=limen-serve.service limen-xvfb.service

[Service]
Environment=DISPLAY=:99
ExecStartPre=/bin/sleep 3
ExecStart=/usr/bin/chromium-browser \
  --no-sandbox --kiosk --disable-infobars \
  --disable-translate --disable-features=TranslateUI \
  --disable-session-crashed-bubble --noerrdialogs \
  --check-for-update-interval=604800 \
  --app=${KIOSK_URL}
Restart=on-failure
RestartSec=10s
User=${LIMEN_USER}

[Install]
WantedBy=multi-user.target
KIOSK
# Some Armbian images ship chromium (not chromium-browser) — symlink
bb "command -v chromium-browser >/dev/null 2>&1 || \
    (command -v chromium >/dev/null 2>&1 && \
     ln -sf \$(command -v chromium) /usr/local/bin/chromium-browser) || \
    (apt-get install -y -qq chromium 2>/dev/null && \
     ln -sf /usr/bin/chromium /usr/local/bin/chromium-browser) || \
    warn 'chromium not found — kiosk will not start'"
bb "systemctl daemon-reload && systemctl enable limen-xvfb limen-kiosk"
ok "limen-kiosk enabled (Xvfb :99 + Chromium)"

# ── 8. VNC mirror (optional, for remote access) ───────────────────────────────
step "VNC mirror"
bb "cat > /etc/systemd/system/limen-x11vnc.service" <<VNC
[Unit]
Description=Limen OS — x11vnc mirror of :99
After=limen-xvfb.service
Wants=limen-xvfb.service

[Service]
ExecStart=/usr/bin/x11vnc -display :99 -forever -nopw -rfbport 5900 -quiet
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
VNC
bb "systemctl daemon-reload && systemctl enable limen-x11vnc"
ok "x11vnc on :5900"

# ── 9. GNOME auto-login (if GNOME/gdm is present) ────────────────────────────
step "GNOME auto-login"
bb "if command -v gdm3 >/dev/null 2>&1 || command -v gdm >/dev/null 2>&1; then \
    GDM_CONF=\$([ -f /etc/gdm3/custom.conf ] && echo /etc/gdm3/custom.conf || echo /etc/gdm/custom.conf); \
    grep -q 'AutomaticLoginEnable' \"\$GDM_CONF\" 2>/dev/null || \
    sed -i '/\[daemon\]/a AutomaticLoginEnable=true\nAutomaticLogin=${LIMEN_USER}' \"\$GDM_CONF\"; \
    echo 'gdm auto-login configured'; \
  else echo 'GNOME/gdm not present — kiosk runs headlessly via Xvfb'; fi"
ok "auto-login configured"

fi  # SKIP_DISPLAY

# ── 10. Optional: TUI ────────────────────────────────────────────────────────
if [[ "$BB_TUI" == "1" ]]; then
  step "TUI (cross-compile + deploy)"
  if command -v cargo-zigbuild &>/dev/null || cargo zigbuild --version &>/dev/null 2>&1; then
    cd "$REPO_ROOT"
    cargo zigbuild --release -p limen-tui --target aarch64-unknown-linux-gnu
    BIN="target/aarch64-unknown-linux-gnu/release/limen-tui"
    if [[ -f "$BIN" ]]; then
      bb "mkdir -p $INSTALL_DIR/bin"
      put "$BIN" "$INSTALL_DIR/bin/limen-tui"
      bb "chmod +x $INSTALL_DIR/bin/limen-tui"
      bb "command -v ttyd >/dev/null 2>&1 || \
          apt-get install -y ttyd 2>/dev/null || \
          (ARCH=\$(uname -m) && \
           curl -fsSL https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.\$ARCH \
               -o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd)"
      bb "cat > /etc/systemd/system/limen-tui.service" <<TUI
[Unit]
Description=Limen TUI (ttyd web terminal)
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ttyd --port 7681 --interface 0.0.0.0 --writable ${INSTALL_DIR}/bin/limen-tui
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
TUI
      bb "systemctl daemon-reload && systemctl enable limen-tui && systemctl start limen-tui"
      ok "limen-tui @ http://$BB_HOST:7681"
    else
      warn "TUI build failed — skipping"
    fi
  else
    warn "cargo-zigbuild not found — skipping TUI. Install: cargo install cargo-zigbuild"
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║         Limen OS 0.0.1 — BeagleBone Standalone         ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Shell SPA${RESET}   →  http://${BB_HOST}:1420/limen/"
if [[ "$SKIP_DISPLAY" != "1" ]]; then
  echo -e "  ${BOLD}VNC viewer${RESET}  →  ${BB_HOST}:5900  (password-free, LAN only)"
fi
[[ "$BB_TUI" == "1" ]] && echo -e "  ${BOLD}TUI web${RESET}     →  http://${BB_HOST}:7681"
echo ""
echo -e "  ${BOLD}Next steps:${RESET}"
echo -e "    1. Edit /etc/limen/serve.env on the BeagleBone (set passwords, API keys)"
echo -e "    2. systemctl restart limen-serve"
echo -e "    3. Connect a display — the kiosk session starts automatically"
echo ""
