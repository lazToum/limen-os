#!/usr/bin/env bash
# Run this inside the VM (vagrant ssh) to apply the kiosk stack fixes live.
# Equivalent to a full reprovision for the kiosk display layer only.
set -euo pipefail

BOLD='\033[1m'; GREEN='\033[0;32m'; RESET='\033[0m'
step() { echo -e "\n${BOLD}▶ $*${RESET}"; }

BUN_BIN="/home/vagrant/.bun/bin"
KIOSK_URL="${LIMEN_KIOSK_URL:-http://localhost:1420}"

# ── Packages ──────────────────────────────────────────────────────────────────
# Firefox is installed via Mozilla apt repo in the provision script.
# chromium is a snap stub on Ubuntu 24.04 — avoid it.
step "Installing openbox, x11-xserver-utils"
export DEBIAN_FRONTEND=noninteractive
sudo apt-get install -y -q openbox x11-xserver-utils

# ── Build workspace packages then shell ───────────────────────────────────────
step "Building workspace packages + apps/shell"
(
  set -e
  for pkg in packages/voice-client packages/ai-client packages/ui packages/smart-cities-client; do
    echo "  → $pkg"
    cd /opt/limen-os/$pkg && $BUN_BIN/bun run build
  done
  echo "  → apps/shell"
  cd /opt/limen-os/apps/shell && $BUN_BIN/bun run build
) || echo "⚠ Shell build failed — kiosk will show a blank page until built manually"

# ── limen-serve.service ───────────────────────────────────────────────────────
step "Writing limen-serve.service"
sudo tee /etc/systemd/system/limen-serve.service > /dev/null <<EOF
[Unit]
Description=Limen OS web server (serve.ts → apps/shell/dist)
After=network.target

[Service]
WorkingDirectory=/opt/limen-os
ExecStart=$BUN_BIN/bun run scripts/serve.ts
Restart=on-failure
RestartSec=3s
User=vagrant
EnvironmentFile=-/opt/limen-os/.env

[Install]
WantedBy=multi-user.target
EOF

# ── openbox.service ───────────────────────────────────────────────────────────
step "Writing openbox.service"
sudo tee /etc/systemd/system/openbox.service > /dev/null <<'EOF'
[Unit]
Description=Openbox window manager
After=xvfb.service
Requires=xvfb.service

[Service]
Environment=DISPLAY=:99
ExecStartPre=/usr/bin/xsetroot -solid "#1a1014"
ExecStart=/usr/bin/openbox --config-file /dev/null
Restart=on-failure
RestartSec=2s
User=vagrant

[Install]
WantedBy=multi-user.target
EOF

# ── chromium-kiosk.service ────────────────────────────────────────────────────
step "Writing firefox-kiosk.service"
sudo tee /etc/systemd/system/firefox-kiosk.service > /dev/null <<EOF
[Unit]
Description=Firefox kiosk — Limen OS
After=openbox.service limen-serve.service
Requires=xvfb.service openbox.service

[Service]
Environment=DISPLAY=:99
Environment=MOZ_WEBRENDER=0
Environment=MOZ_ACCELERATED=0
Environment=XDG_RUNTIME_DIR=/tmp/limen-runtime
Environment=DBUS_SESSION_BUS_ADDRESS=/dev/null
ExecStartPre=/bin/mkdir -p /tmp/limen-runtime
ExecStartPre=/bin/sleep 2
ExecStart=/usr/bin/firefox \\
  --kiosk \\
  --no-remote \\
  --new-instance \\
  --profile /tmp/firefox-kiosk \\
  ${KIOSK_URL}
Restart=on-failure
RestartSec=5s
User=vagrant

[Install]
WantedBy=multi-user.target
EOF

# ── Remove stale xsetroot.service (openbox handles it now) ───────────────────
step "Cleaning up stale units"
sudo systemctl disable xsetroot.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/xsetroot.service

# ── Reload + restart stack ────────────────────────────────────────────────────
step "Reloading systemd and restarting kiosk stack"
sudo systemctl daemon-reload
sudo systemctl stop firefox-kiosk 2>/dev/null || true
sudo systemctl enable limen-serve openbox firefox-kiosk
sudo systemctl restart limen-serve
sudo systemctl restart xvfb
sleep 2
sudo systemctl restart openbox
sleep 1
sudo systemctl restart x11vnc novnc
sudo systemctl start firefox-kiosk

# ── Status ────────────────────────────────────────────────────────────────────
step "Status"
sudo systemctl status limen-serve xvfb openbox firefox-kiosk x11vnc novnc \
  --no-pager -l 2>&1 | grep -E 'service|Active|Main PID|ExecStart|code='

echo -e "\n${GREEN}✓ Done${RESET}"
echo -e "  noVNC  : http://localhost:6080/vnc.html"
echo -e "  Direct : ${KIOSK_URL}"
