#!/usr/bin/env bash
# beaglebone-setup.sh — Set up BeagleBone (or any ARM SBC) as Limen OS node
#
# Run from your laptop (it SSHes into the BeagleBone and configures it).
# Requires: Armbian installed, SSH access, internet connection on BB.
#
# Modes:
#   haos        (default) — Install Home Assistant Supervised + Limen OS add-on
#   kiosk-only  — Chromium kiosk on HDMI pointing at KIOSK_URL
#   tui-only    — Cross-compile limen-tui for aarch64 and deploy via ttyd
#   both        — kiosk-only + tui-only (legacy, no HA)
#
# Usage:
#   BB_HOST=192.168.1.xx ./scripts/beaglebone-setup.sh              # default: haos
#   BB_HOST=192.168.1.xx ./scripts/beaglebone-setup.sh --haos
#   BB_HOST=192.168.1.xx ./scripts/beaglebone-setup.sh --kiosk-only
#   BB_HOST=192.168.1.xx ./scripts/beaglebone-setup.sh --tui-only
#   BB_HOST=192.168.1.xx ./scripts/beaglebone-setup.sh --both       # legacy
#
# Environment variables:
#   BB_HOST     — required: IP or hostname of the BeagleBone
#   BB_USER     — SSH user (default: root)
#   BB_KEY      — path to SSH identity file (optional)
#   KIOSK_URL   — URL for Chromium kiosk (default: https://io.waldiez.io/limen/)
#   MACHINE     — HA Supervised machine type override (default: auto-detect on BB)
#   LIMEN_ROOT — path to limen-os repo on THIS machine (default: auto-detect)
set -euo pipefail

BB_HOST="${BB_HOST:-}"
BB_USER="${BB_USER:-root}"
BB_KEY="${BB_KEY:-}"
KIOSK_URL="${KIOSK_URL:-https://io.waldiez.io/limen/}"
MACHINE="${MACHINE:-}"   # overrides haos-provision.sh auto-detection on the BB

# Default mode is now haos
MODE="haos"
for arg in "$@"; do
  case "$arg" in
    --haos)        MODE="haos" ;;
    --kiosk-only)  MODE="kiosk-only" ;;
    --tui-only)    MODE="tui-only" ;;
    --both)        MODE="both" ;;
    --help|-h)
      head -30 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

if [[ -z "$BB_HOST" ]]; then
  echo "Usage: BB_HOST=192.168.1.xx ./scripts/beaglebone-setup.sh [--haos | --kiosk-only | --tui-only]"
  exit 1
fi

SSH_OPTS=(-o "StrictHostKeyChecking=no" -o "ConnectTimeout=10")
[[ -n "$BB_KEY" ]] && SSH_OPTS+=(-i "$BB_KEY")

# Helpers
# shellcheck disable=SC2029
bb()     { ssh "${SSH_OPTS[@]}" "${BB_USER}@${BB_HOST}" "$@"; }
bb_put() { scp "${SSH_OPTS[@]}" "$1" "${BB_USER}@${BB_HOST}:$2"; }

BOLD='\033[1m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; RESET='\033[0m'
step() { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }
ok()   { echo -e "  ${GREEN}✓ $*${RESET}"; }

# ── Connectivity check ────────────────────────────────────────────────────────
step "Connecting to BeagleBone at $BB_HOST (mode: $MODE)..."
bb "uname -a"
ok "SSH connection established"

# ─────────────────────────────────────────────────────────────────────────────
# MODE: haos — Install Home Assistant Supervised + Limen OS add-on
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "haos" ]]; then
  step "Deploying Home Assistant Supervised + Limen OS add-on to BeagleBone"

  # Auto-detect repo root (script lives in <root>/scripts/)
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

  # Copy the entire addon/ directory and the haos-provision.sh script to the BB
  step "Uploading limen addon + provision script"
  bb "mkdir -p /opt/limen/addon /opt/limen/scripts"
  bb_put "${REPO_ROOT}/addon/config.yaml"    "/opt/limen/addon/config.yaml"
  bb_put "${REPO_ROOT}/addon/build.yaml"     "/opt/limen/addon/build.yaml"
  bb_put "${REPO_ROOT}/addon/Dockerfile"     "/opt/limen/addon/Dockerfile"
  bb_put "${REPO_ROOT}/addon/run.sh"         "/opt/limen/addon/run.sh"
  bb_put "${REPO_ROOT}/scripts/haos-provision.sh" "/opt/limen/scripts/haos-provision.sh"
  bb "chmod +x /opt/limen/addon/run.sh /opt/limen/scripts/haos-provision.sh"
  ok "Files uploaded"

  # Build the env string for MACHINE override (if set)
  MACHINE_ENV=""
  if [[ -n "$MACHINE" ]]; then
    MACHINE_ENV="MACHINE=${MACHINE}"
  fi

  # Run haos-provision.sh on the BeagleBone
  step "Running haos-provision.sh on BeagleBone (this will take several minutes)"
  echo "  Download: Docker CE + HA Supervisor containers (~200-600 MB)"
  echo ""
  bb "LIMEN_ROOT=/opt/limen ${MACHINE_ENV} bash /opt/limen/scripts/haos-provision.sh"

  echo ""
  echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
  echo -e "${BOLD}${GREEN}║         BeagleBone HAOS Setup Complete               ║${RESET}"
  echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
  echo ""
  echo -e "  ${BOLD}Home Assistant${RESET}  →  http://${BB_HOST}:8123"
  echo -e "  ${BOLD}Limen OS add-on${RESET}: install via HA Settings → Add-ons"
  echo ""
  exit 0
fi

# ─────────────────────────────────────────────────────────────────────────────
# MODE: kiosk-only — Chromium kiosk on HDMI display
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "both" || "$MODE" == "kiosk-only" ]]; then
  step "Installing Chromium kiosk..."
  bb "apt-get update -q && apt-get install -y -q chromium xorg openbox --no-install-recommends"

  bb "cat > /etc/systemd/system/limen-kiosk.service" <<EOF
[Unit]
Description=Limen OS kiosk — Chromium on HDMI
After=network-online.target
Wants=network-online.target

[Service]
Environment=DISPLAY=:0
ExecStartPre=/usr/bin/X :0 -nolisten tcp &
ExecStart=/usr/bin/chromium \
  --no-sandbox \
  --kiosk \
  --disable-infobars \
  --disable-translate \
  --disable-features=TranslateUI \
  --check-for-update-interval=604800 \
  --app=${KIOSK_URL}
Restart=on-failure
RestartSec=10s
User=root

[Install]
WantedBy=multi-user.target
EOF

  bb "systemctl daemon-reload && systemctl enable limen-kiosk"
  ok "Kiosk service installed. Start with: systemctl start limen-kiosk"
fi

# ─────────────────────────────────────────────────────────────────────────────
# MODE: tui-only — cross-compile limen-tui + deploy via ttyd
# ─────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "both" || "$MODE" == "tui-only" ]]; then
  step "Cross-compiling limen-tui for aarch64..."

  # Requires cargo-zigbuild on the dev machine: cargo install cargo-zigbuild
  if ! command -v cargo-zigbuild &>/dev/null && ! cargo zigbuild --version &>/dev/null 2>&1; then
    echo "  Installing cargo-zigbuild..."
    cargo install cargo-zigbuild
  fi

  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  cd "$REPO_ROOT"

  cargo zigbuild --release -p limen-tui --target aarch64-unknown-linux-gnu
  BIN="target/aarch64-unknown-linux-gnu/release/limen-tui"

  if [[ ! -f "$BIN" ]]; then
    echo "✗ Build failed — $BIN not found"
    exit 1
  fi

  step "Deploying limen-tui to BeagleBone..."
  bb "mkdir -p /opt/limen/bin"
  bb_put "$BIN" "/opt/limen/bin/limen-tui"
  bb "chmod +x /opt/limen/bin/limen-tui"

  # Install ttyd for web terminal access
  step "Installing ttyd on BeagleBone..."
  BB_ARCH=$(bb "uname -m")
  TTYD_URL="https://github.com/tsl0922/ttyd/releases/latest/download/ttyd.${BB_ARCH}"
  bb "curl -fsSL $TTYD_URL -o /usr/local/bin/ttyd && chmod +x /usr/local/bin/ttyd" || \
    bb "apt-get install -y ttyd 2>/dev/null || echo 'ttyd not in apt — install manually'"

  cat > /tmp/limen-tui-bb.service <<EOF
[Unit]
Description=Limen TUI — BeagleBone terminal (ttyd)
After=network-online.target

[Service]
ExecStart=/usr/local/bin/ttyd --port 7681 --interface 0.0.0.0 --writable /opt/limen/bin/limen-tui
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
EOF
  bb_put "/tmp/limen-tui-bb.service" "/etc/systemd/system/limen-tui.service"
  bb "systemctl daemon-reload && systemctl enable limen-tui && systemctl start limen-tui"
  ok "limen-tui running at http://$BB_HOST:7681"
fi

echo ""
echo -e "${BOLD}${GREEN}✓ BeagleBone setup complete${RESET}"
echo "  Kiosk URL : $KIOSK_URL"
[[ "$MODE" == "both" || "$MODE" == "tui-only" ]] && echo "  TUI web   : http://$BB_HOST:7681"
