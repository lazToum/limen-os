#!/usr/bin/env bash
# LIMEN OS — Vagrant VM provisioner
# Runs once on `vagrant up` (re-run: vagrant provision)
set -euo pipefail

MODE="${LIMEN_VM_MODE:-kiosk}"
KIOSK_URL="${LIMEN_KIOSK_URL:-https://io.limen-os.io/}"
HA_HOST="${HA_HOST:-}"

GREEN='\033[0;32m'; BOLD='\033[1m'; RESET='\033[0m'
step() { echo -e "\n${BOLD}▶ $*${RESET}"; }

# ── Base packages ──────────────────────────────────────────────────────────────
step "System update + base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q \
  curl wget git unzip build-essential pkg-config \
  ca-certificates gnupg lsb-release \
  xvfb x11vnc novnc websockify \
  fonts-liberation \
  openssl libssl-dev

# Openbox (minimal WM) + display utils
# Note: chromium is a snap stub on Ubuntu 24.04 — we use Firefox (installed below via Mozilla apt)
apt-get install -y -q jq x11-xserver-utils openbox

# ── Firefox from Mozilla apt (not the Ubuntu snap stub) ───────────────────────
step "Installing Firefox from Mozilla apt"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  GECKO_ARCH="linux64" ;;
  aarch64) GECKO_ARCH="linux-aarch64" ;;
  *) echo "Unsupported architecture: $ARCH" && exit 1 ;;
esac

# Add Mozilla apt repo
curl -fsSL https://packages.mozilla.org/apt/repo-signing-key.gpg \
  | gpg --dearmor -o /etc/apt/trusted.gpg.d/mozilla.gpg
echo "deb https://packages.mozilla.org/apt mozilla main" \
  > /etc/apt/sources.list.d/mozilla.list

# Pin Mozilla packages above Ubuntu's snap redirect (priority 1001 > 1000)
cat > /etc/apt/preferences.d/mozilla-firefox << 'EOF'
Package: firefox*
Pin: origin packages.mozilla.org
Pin-Priority: 1001
EOF

apt-get update -q
apt-get install -y -q firefox

# GeckoDriver (for any selenium/testing use)
for i in 1 2 3; do
  GECKO_VERSION=$(curl -sL -o /dev/null -w '%{url_effective}' \
    https://github.com/mozilla/geckodriver/releases/latest | awk -F/ '{print $NF}')
  [ -n "$GECKO_VERSION" ] && [ "$GECKO_VERSION" != "null" ] && break
  echo "Retrying geckodriver version fetch ($i)..."
  sleep 3
done
if [ -n "$GECKO_VERSION" ] && [ "$GECKO_VERSION" != "null" ]; then
  curl -Lo /tmp/geckodriver.tar.gz \
    "https://github.com/mozilla/geckodriver/releases/download/${GECKO_VERSION}/geckodriver-${GECKO_VERSION}-${GECKO_ARCH}.tar.gz"
  tar -xzf /tmp/geckodriver.tar.gz -C /usr/local/bin
  chmod +x /usr/local/bin/geckodriver
  rm /tmp/geckodriver.tar.gz
  echo "GeckoDriver ${GECKO_VERSION} installed"
else
  echo "⚠ Could not fetch geckodriver — skipping"
fi

# ── Bun ───────────────────────────────────────────────────────────────────────
step "Installing Bun"
if ! command -v bun &>/dev/null; then
  su - vagrant -c 'curl -fsSL https://bun.sh/install | bash'
fi
BUN_BIN="/home/vagrant/.bun/bin"
echo "export PATH=\$PATH:$BUN_BIN" >> /home/vagrant/.bashrc

# ── Rust ──────────────────────────────────────────────────────────────────────
step "Installing Rust"
if ! su - vagrant -c 'command -v cargo' &>/dev/null; then
  su - vagrant -c 'curl --proto =https --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable'
fi
CARGO_BIN="/home/vagrant/.cargo/bin"
echo "export PATH=\$PATH:$CARGO_BIN" >> /home/vagrant/.bashrc

# ── Node / NVM (for any node-based scripts) ───────────────────────────────────
step "Installing Node via nvm"
if ! su - vagrant -c 'command -v node' &>/dev/null; then
  su - vagrant -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/latest/install.sh | bash'
  su - vagrant -c 'source ~/.nvm/nvm.sh && nvm install --lts'
fi

# ── JS deps (from repo) ───────────────────────────────────────────────────────
step "Installing JS workspace dependencies"
if [[ ! -f /opt/limen-os/package.json ]]; then
  echo "ERROR: /opt/limen-os is empty — rsync may not have run. Try: vagrant rsync && vagrant provision"
  exit 1
fi
# Ensure vagrant user owns the synced tree (sudo rsync may leave files as root)
chown -R vagrant:vagrant /opt/limen-os
su - vagrant -c "cd /opt/limen-os && $BUN_BIN/bun install --frozen-lockfile 2>/dev/null || $BUN_BIN/bun install"

# ── Build shell app + limen-serve service (kiosk + dev) ───────────────────────
if [[ "$MODE" != "haos" ]]; then
  step "Building workspace packages then apps/shell"
  su - vagrant -c "
    set -e
    cd /opt/limen-os
    for pkg in packages/voice-client packages/ai-client packages/ui packages/smart-cities-client; do
      echo \"  → \$pkg\"
      cd /opt/limen-os/\$pkg && $BUN_BIN/bun run build
    done
    echo '  → apps/shell'
    cd /opt/limen-os/apps/shell && $BUN_BIN/bun run build
  " || echo "⚠ Shell build failed — kiosk will show a blank page until built manually"

  step "Installing limen-serve systemd service"
  cat > /etc/systemd/system/limen-serve.service <<EOF
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

  systemctl daemon-reload
  systemctl enable limen-serve
  systemctl start limen-serve || true
fi

# ── KIOSK mode: Xvfb + x11vnc + noVNC + Chromium ─────────────────────────────
if [[ "$MODE" == "kiosk" ]]; then
  step "Setting up kiosk mode (Xvfb + Chromium + noVNC)"

  # Xvfb display
  cat > /etc/systemd/system/xvfb.service <<EOF
[Unit]
Description=Virtual X11 display
After=network.target

[Service]
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset
Restart=always
User=vagrant

[Install]
WantedBy=multi-user.target
EOF

  # openbox — minimal WM: handles window placement, gives Chromium a proper root
  cat > /etc/systemd/system/openbox.service <<EOF
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

  # Chromium kiosk — /usr/bin/chromium from Debian packages (arm64 + x86_64)
  cat > /etc/systemd/system/chromium-kiosk.service <<EOF
[Unit]
Description=Chromium kiosk — Limen OS
After=openbox.service
Requires=xvfb.service openbox.service

[Service]
Environment=DISPLAY=:99
ExecStart=/usr/bin/chromium \
  --no-sandbox \
  --kiosk \
  --disable-gpu \
  --disable-dev-shm-usage \
  --disable-software-rasterizer \
  --no-first-run \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-restore-session-state \
  --autoplay-policy=no-user-gesture-required \
  --disable-features=TranslateUI \
  ${KIOSK_URL}
Restart=on-failure
RestartSec=5s
User=vagrant

[Install]
WantedBy=multi-user.target
EOF

  # x11vnc (VNC over the virtual display)
  cat > /etc/systemd/system/x11vnc.service <<EOF
[Unit]
Description=x11vnc — virtual display mirror
After=xvfb.service
Requires=xvfb.service

[Service]
ExecStart=/usr/bin/x11vnc -display :99 -nopw -listen 127.0.0.1 -xkb -forever -shared
Restart=on-failure
User=vagrant

[Install]
WantedBy=multi-user.target
EOF

  # noVNC (browser-accessible VNC)
  cat > /etc/systemd/system/novnc.service <<EOF
[Unit]
Description=noVNC — browser VNC client
After=x11vnc.service
Requires=x11vnc.service

[Service]
ExecStart=/usr/bin/websockify --web /usr/share/novnc/ 6080 127.0.0.1:5900
Restart=on-failure
User=vagrant

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable xvfb openbox chromium-kiosk x11vnc novnc
  systemctl start xvfb || true
  sleep 2
  systemctl start openbox x11vnc novnc || true
  sleep 1
  systemctl start chromium-kiosk || true
fi

# ── DEV mode: GNOME desktop ───────────────────────────────────────────────────
if [[ "$MODE" == "dev" ]]; then
  step "Installing GNOME desktop"
  apt-get install -y -q ubuntu-desktop-minimal gdm3 || true
  systemctl set-default graphical.target
  # Auto-login as vagrant
  mkdir -p /etc/gdm3
  cat > /etc/gdm3/custom.conf <<EOF
[daemon]
AutomaticLoginEnable=True
AutomaticLogin=vagrant
EOF
fi

# ── HA reverse tunnel helper ──────────────────────────────────────────────────
if [[ -n "$HA_HOST" ]]; then
  step "Configuring HA_ORIGIN → http://$HA_HOST"
  mkdir -p /etc/limen
  echo "HA_ORIGIN=http://$HA_HOST" > /etc/limen/serve.env
  echo "HA_PORT=${HA_HOST##*:}" >> /etc/limen/serve.env
  chown -R vagrant:vagrant /etc/limen
fi

# ── /etc/hosts convenience entries ───────────────────────────────────────────
echo "127.0.0.1  limen.local" >> /etc/hosts

echo -e "\n${GREEN}✓ Limen OS VM provisioned (mode: $MODE)${RESET}"
echo -e "  Kiosk URL : $KIOSK_URL"
[[ -n "$HA_HOST" ]] && echo -e "  HA host   : $HA_HOST"
[[ "$MODE" == "kiosk" ]] && echo -e "  noVNC     : http://localhost:6080/vnc.html"
