#!/usr/bin/env bash
# deploy-vm.sh — Install LIMEN OS web services on a remote VM.
#
# Installs and enables exactly two services:
#   limen-static  →  Bun SPA server on :1420  (nginx proxies this)
#   synapsd         →  Core daemon + companion WS on :8766
#
# Usage (run as root on the VM):
#   bash /path/to/limen-os/scripts/deploy-vm.sh
#
# Or from your dev machine:
#   ssh root@vm "bash -s" < ./scripts/deploy-vm.sh
#
# Optional env:
#   LIMEN_ROOT=/opt/limen   install path (default: dir containing this script/..)
#   LIMEN_USER=limen         service user (created if missing)
#   SKIP_STATIC=1                skip limen-static (if nginx serves dist/ directly)
#   SKIP_DAEMON=1                skip synapsd

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIMEN_ROOT="${LIMEN_ROOT:-$(dirname "$SCRIPT_DIR")}"
LIMEN_USER="${LIMEN_USER:-limen}"
SKIP_STATIC="${SKIP_STATIC:-0}"
SKIP_DAEMON="${SKIP_DAEMON:-0}"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}→${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
ok()    { echo -e "${GREEN}✓${NC} $*"; }
step()  { echo; echo -e "${CYAN}━━ $* ━━${NC}"; }
die()   { echo -e "${RED}✗${NC}  $*" >&2; exit 1; }

[[ "$(id -u)" == "0" ]] || die "Run as root: sudo bash $0"

# ── Checks ────────────────────────────────────────────────────────────────────
step "Checking prerequisites"

# Detect bun
BUN_BIN=""
for p in /usr/local/bin/bun /home/"$LIMEN_USER"/.bun/bin/bun ~/.bun/bin/bun \
          /opt/limen/.local/deb/.bun/bin/bun; do
  [[ -x "$p" ]] && { BUN_BIN="$p"; break; }
done
[[ -n "$BUN_BIN" ]] || die "Bun not found. Run: curl -fsSL https://bun.sh/install | bash"
ok "Bun: $BUN_BIN"

# Detect synapsd binary (optional, only for daemon service)
SYNAPSD_BIN=""
for p in "$LIMEN_ROOT/target/release/synapsd" /usr/local/bin/synapsd; do
  [[ -x "$p" ]] && { SYNAPSD_BIN="$p"; break; }
done

# Check dist/ is built
DIST_DIR="$LIMEN_ROOT/apps/shell/dist"
[[ -f "$DIST_DIR/index.html" ]] || {
  warn "dist/ not built. Building now..."
  cd "$LIMEN_ROOT"
  sudo -u "$LIMEN_USER" bash -c "cd '$LIMEN_ROOT' && make server-build" \
    || die "Build failed. Run: make server-build"
}
ok "dist/: $DIST_DIR"

# ── System user ───────────────────────────────────────────────────────────────
step "System user"
if id "$LIMEN_USER" &>/dev/null; then
  warn "User $LIMEN_USER already exists"
else
  useradd --system --create-home --shell /bin/bash "$LIMEN_USER"
  ok "Created user: $LIMEN_USER"
fi

# Give limen user read access to the install dir
chown -R "$LIMEN_USER:$LIMEN_USER" "$LIMEN_ROOT" 2>/dev/null || true

# Symlink bun to /usr/local/bin if not already there
[[ -x /usr/local/bin/bun ]] || ln -sf "$BUN_BIN" /usr/local/bin/bun
ok "bun → /usr/local/bin/bun"

# ── Helper: install one service ───────────────────────────────────────────────
install_service() {
  local name="$1"
  local src="$SCRIPT_DIR/systemd/${name}.service"
  local dst="/etc/systemd/system/${name}.service"

  [[ -f "$src" ]] || die "Service file not found: $src"

  # Patch LIMEN_ROOT and bun path into the service file
  sed \
    -e "s|/opt/limen|${LIMEN_ROOT}|g" \
    -e "s|/usr/local/bin/bun|${BUN_BIN}|g" \
    -e "s|User=limen|User=${LIMEN_USER}|g" \
    -e "s|Group=limen|Group=${LIMEN_USER}|g" \
    "$src" > "$dst"

  systemctl daemon-reload
  systemctl enable "$name"
  systemctl restart "$name"
  ok "$name enabled + started"
}

# ── limen-static ────────────────────────────────────────────────────────────
if [[ "$SKIP_STATIC" != "1" ]]; then
  step "limen-static (SPA server → :1420)"
  install_service limen-static
  sleep 1
  # shellcheck disable=SC2015
  systemctl is-active --quiet limen-static \
    && ok "Listening on port 1420" \
    || warn "Service started but not yet active — check: journalctl -u limen-static -n 20"
fi

# ── synapsd ───────────────────────────────────────────────────────────────────
if [[ "$SKIP_DAEMON" != "1" ]]; then
  step "synapsd (core daemon → companion WS :8766)"
  if [[ -z "$SYNAPSD_BIN" ]]; then
    warn "synapsd binary not found — skipping daemon service"
    warn "Build it with: cargo build --release -p limen-core --bin synapsd"
    warn "Then re-run this script."
  else
    # Patch binary path into service
    sed -i "s|ExecStart=.*|ExecStart=${SYNAPSD_BIN}|" /etc/systemd/system/synapsd.service 2>/dev/null || true
    install_service synapsd
    sleep 1
    # shellcheck disable=SC2015
    systemctl is-active --quiet synapsd \
      && ok "Daemon running, companion WS on :8766/companion" \
      || warn "Check: journalctl -u synapsd -n 20"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  LIMEN OS — VM Services"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
for svc in limen-static synapsd; do
  if systemctl is-active --quiet "$svc" 2>/dev/null; then
    echo -e "  ${GREEN}●${NC} $svc"
  elif systemctl is-enabled --quiet "$svc" 2>/dev/null; then
    echo -e "  ${YELLOW}●${NC} $svc  (enabled, not running)"
  else
    echo -e "  ${RED}○${NC} $svc  (not installed)"
  fi
done
echo
echo -e "  SPA:       http://localhost:1420"
echo -e "  Companion: ws://localhost:8766/companion"
echo
echo -e "  nginx snippet:"
echo -e "    ${CYAN}location / { proxy_pass http://localhost:1420; }${NC}"
echo -e "    ${CYAN}location /companion { proxy_pass http://localhost:8766; upgrade; }${NC}"
echo
echo -e "  Logs: journalctl -u limen-static -f"
echo -e "        journalctl -u synapsd -f"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
