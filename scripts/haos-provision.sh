#!/usr/bin/env bash
# LIMEN OS — Home Assistant Supervised installer + add-on deployer
# ──────────────────────────────────────────────────────────────────────────────
#
# Installs Home Assistant Supervised on any Debian 12 (Bookworm) or
# Armbian/Ubuntu machine, then deploys the Limen OS local add-on.
#
# Works on:
#   x86_64  — Vagrant VM, bare metal, cloud instance
#   aarch64 — BeagleBone AI-64, RPi 4/5, any Armbian board
#   armv7   — Older ARM SBCs (RPi 2/3, Beagle 32-bit)
#
# Usage:
#   # Full install (HA Supervised + add-on):
#   sudo bash haos-provision.sh
#
#   # Skip HA install, only (re)deploy the add-on:
#   sudo bash haos-provision.sh --addon-only
#
#   # Override machine type (skip auto-detection):
#   sudo MACHINE=generic-aarch64 bash haos-provision.sh
#
# Environment variables:
#   MACHINE         — override HA Supervised machine type
#   LIMEN_ROOT    — path to limen-os repo (default: /opt/limen)
#   ADDON_ONLY      — set to "1" to skip HA install (same as --addon-only)
#
# Re-running this script is safe (idempotent).
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Parse flags ───────────────────────────────────────────────────────────────
ADDON_ONLY="${ADDON_ONLY:-0}"
for arg in "$@"; do
  case "$arg" in
    --addon-only) ADDON_ONLY=1 ;;
    --help|-h)
      sed -n '2,/^set -/p' "$0" | grep '^#' | sed 's/^# \?//'
      exit 0
      ;;
  esac
done

# ── Colours + helpers ─────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'
RED='\033[0;31m'; DIM='\033[2m'; RESET='\033[0m'

step()  { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }
ok()    { echo -e "  ${GREEN}✓ $*${RESET}"; }
warn()  { echo -e "  ${YELLOW}⚠ $*${RESET}"; }
info()  { echo -e "  ${DIM}· $*${RESET}"; }
fatal() { echo -e "\n${RED}${BOLD}✗ FATAL: $*${RESET}\n" >&2; exit 1; }

# ── Root check ────────────────────────────────────────────────────────────────
if [[ "$EUID" -ne 0 ]]; then
  fatal "This script must be run as root (sudo bash $0)"
fi

# ── Configuration ─────────────────────────────────────────────────────────────
LIMEN_ROOT="${LIMEN_ROOT:-/opt/limen}"
ADDON_SRC="${LIMEN_ROOT}/addon"
ADDON_DEST="/addons/local/limen_os"
SUPERVISOR_API="http://localhost:4357"
HA_INSTALLER_URL="https://github.com/home-assistant/supervised-installer/releases/latest/download/homeassistant-supervised.sh"

# ── Architecture detection ────────────────────────────────────────────────────
detect_machine_type() {
  local arch
  arch="$(uname -m)"
  case "$arch" in
    x86_64)           echo "generic-x86-64" ;;
    aarch64|arm64)    echo "generic-aarch64" ;;
    armv7l|armhf)     echo "qemuarm" ;;  # HA uses qemuarm for 32-bit ARM
    *)
      warn "Unknown architecture '$arch' — defaulting to generic-x86-64"
      echo "generic-x86-64"
      ;;
  esac
}

MACHINE="${MACHINE:-$(detect_machine_type)}"

# ── Banner ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${CYAN}║      LIMEN OS — HAOS Provision Script              ║${RESET}"
echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
info "Host arch   : $(uname -m)"
info "HA machine  : $MACHINE"
info "Limen root: $LIMEN_ROOT"
info "Addon src   : $ADDON_SRC"
info "Addon dest  : $ADDON_DEST"
info "Addon only  : $ADDON_ONLY"
echo ""

# ── Prerequisite checks ───────────────────────────────────────────────────────
step "Checking prerequisites"

# Must be Debian-based
if ! command -v apt-get &>/dev/null; then
  fatal "This script requires a Debian-based OS (apt-get not found)"
fi

# Limen repo must exist (unless --addon-only with ADDON_SRC elsewhere)
if [[ ! -d "$ADDON_SRC" ]]; then
  fatal "Limen OS addon directory not found at $ADDON_SRC. " \
        "Clone the repo to $LIMEN_ROOT first."
fi

ok "Prerequisites met"

# ═══════════════════════════════════════════════════════════════════════════════
# PART 1 — Install Home Assistant Supervised
# (skipped when ADDON_ONLY=1)
# ═══════════════════════════════════════════════════════════════════════════════
if [[ "$ADDON_ONLY" != "1" ]]; then

  # ── Step 1: System update ────────────────────────────────────────────────────
  step "Updating package lists"
  apt-get update -q
  ok "Package lists updated"

  # ── Step 2: Core dependencies ────────────────────────────────────────────────
  # Some packages may not exist on all distros — use || true where safe.
  step "Installing HA Supervised dependencies"

  # Packages that MUST be present
  REQUIRED_PKGS=(
    curl wget ca-certificates gnupg lsb-release
    jq                    # parse options.json / Supervisor API responses
    network-manager       # HA Supervised requires NetworkManager
    udisks2               # disk management (used by HA)
    libglib2.0-bin        # gdbus etc.
    dbus                  # D-Bus system bus
    apparmor              # kernel MAC — needed by Supervisor
    apparmor-utils        # aa-status etc.
    systemd               # init system (should already be present)
  )

  # Packages that are nice to have but may not exist on all images
  OPTIONAL_PKGS=(
    systemd-journal-remote  # HA log streaming (not in all repos)
    nfs-common              # NFS share support
  )

  info "Installing required packages..."
  apt-get install -y --no-install-recommends "${REQUIRED_PKGS[@]}"

  info "Installing optional packages (failures are non-fatal)..."
  for pkg in "${OPTIONAL_PKGS[@]}"; do
    apt-get install -y --no-install-recommends "$pkg" 2>/dev/null || \
      warn "$pkg not available in this repo — skipping"
  done

  ok "Dependencies installed"

  # ── Step 3: Docker ───────────────────────────────────────────────────────────
  # HA Supervised needs Docker CE (not docker.io from Debian repos — too old).
  step "Setting up Docker CE"

  if docker info &>/dev/null 2>&1; then
    ok "Docker already running — skipping install"
  else
    info "Installing Docker CE from get.docker.com..."
    curl -fsSL https://get.docker.com | bash
    ok "Docker CE installed"
  fi

  # Ensure docker is enabled + running
  systemctl enable docker 2>/dev/null || true
  systemctl start docker 2>/dev/null || true

  # Wait up to 15 s for Docker daemon to be ready
  for i in $(seq 1 15); do
    docker info &>/dev/null 2>&1 && break
    info "Waiting for Docker daemon... ($i/15)"
    sleep 1
  done
  docker info &>/dev/null 2>&1 || fatal "Docker daemon did not start in time"
  ok "Docker daemon is ready"

  # ── Step 4: NetworkManager ────────────────────────────────────────────────────
  step "Ensuring NetworkManager is active"

  # Some minimal images have networking via systemd-networkd instead.
  # HA Supervised requires NetworkManager — enable and start it.
  systemctl enable NetworkManager 2>/dev/null || true
  systemctl start NetworkManager 2>/dev/null || \
    warn "NetworkManager failed to start — HA Supervised may have issues"

  # Brief wait
  sleep 2
  systemctl is-active NetworkManager &>/dev/null && ok "NetworkManager active" || \
    warn "NetworkManager not active — proceeding anyway"

  # ── Step 5: AppArmor ─────────────────────────────────────────────────────────
  step "Ensuring AppArmor is active"
  systemctl enable apparmor 2>/dev/null || true
  systemctl start apparmor 2>/dev/null || \
    warn "AppArmor failed to start (may not be compiled into kernel — continuing)"
  ok "AppArmor step done"

  # ── Step 6: Download + run HA Supervised installer ───────────────────────────
  step "Downloading Home Assistant Supervised installer"

  INSTALLER_TMP="$(mktemp /tmp/haos-installer-XXXXXX.sh)"
  if ! curl -fsSL --max-time 60 "$HA_INSTALLER_URL" -o "$INSTALLER_TMP"; then
    fatal "Failed to download HA Supervised installer from $HA_INSTALLER_URL"
  fi
  chmod +x "$INSTALLER_TMP"
  ok "Installer downloaded to $INSTALLER_TMP"

  step "Running HA Supervised installer (machine: $MACHINE)"
  info "This installs the HA Supervisor container — may take several minutes..."
  info "Network downloads: ~200-400 MB"

  # The installer is interactive by default but accepts --machine flag.
  # It will reboot the machine if kernel modules need loading — we set
  # BYPASS_OS_CHECK=true to suppress the OS-compatibility gate on Armbian.
  if ! bash "$INSTALLER_TMP" --machine "$MACHINE"; then
    warn "Installer exited with non-zero status — this may be normal if it rebooted"
    warn "If the machine did NOT reboot, check the output above for errors"
  fi

  rm -f "$INSTALLER_TMP"
  ok "HA Supervised installer finished"

  # ── Step 7: Wait for Supervisor API ──────────────────────────────────────────
  step "Waiting for HA Supervisor API to be ready (timeout: 300 s)"
  info "The Supervisor pulls ~1 GB of containers on first boot — be patient."

  SUPERVISOR_READY=0
  TIMEOUT=300
  ELAPSED=0
  INTERVAL=5

  while [[ $ELAPSED -lt $TIMEOUT ]]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
                  --max-time 5 \
                  "${SUPERVISOR_API}/supervisor/info" 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "401" ]]; then
      # 401 = API is up but auth required (normal for unattended)
      SUPERVISOR_READY=1
      break
    fi
    printf "  [%3ds] Supervisor API not yet ready (HTTP %s) — retrying...\n" \
           "$ELAPSED" "$HTTP_CODE"
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
  done

  if [[ "$SUPERVISOR_READY" -eq 0 ]]; then
    warn "Supervisor API did not respond within ${TIMEOUT}s."
    warn "HA may still be starting. Re-run with --addon-only once HA is up:"
    warn "  sudo bash $0 --addon-only"
    warn "Continuing to install add-on anyway..."
  else
    ok "Supervisor API is ready (${ELAPSED}s)"
  fi

fi  # end: ADDON_ONLY check for HA install

# ═══════════════════════════════════════════════════════════════════════════════
# PART 2 — Deploy the Limen OS local add-on
# ═══════════════════════════════════════════════════════════════════════════════

step "Installing Limen OS add-on"

# ── Create /addons/local/ if it doesn't exist ─────────────────────────────────
if [[ ! -d "/addons/local" ]]; then
  info "Creating /addons/local/ directory..."
  mkdir -p /addons/local
  ok "Created /addons/local/"
fi

# ── Remove stale symlink / old copy ──────────────────────────────────────────
if [[ -L "$ADDON_DEST" ]]; then
  info "Removing existing symlink at $ADDON_DEST"
  rm "$ADDON_DEST"
fi
if [[ -d "$ADDON_DEST" && ! -L "$ADDON_DEST" ]]; then
  info "Removing existing add-on directory at $ADDON_DEST"
  rm -rf "$ADDON_DEST"
fi

# ── Copy add-on files ─────────────────────────────────────────────────────────
info "Copying $ADDON_SRC → $ADDON_DEST"
cp -r "$ADDON_SRC" "$ADDON_DEST"
ok "Add-on files copied to $ADDON_DEST"

# ── Ensure LIMEN_ROOT symlinks are in place ─────────────────────────────────
# /opt/limen → $LIMEN_ROOT (if not already a symlink or the same path)
if [[ "$LIMEN_ROOT" != "/opt/limen" && ! -e "/opt/limen" ]]; then
  ln -sf "$LIMEN_ROOT" /opt/limen
  ok "Symlinked /opt/limen → $LIMEN_ROOT"
fi

# ── Reload Supervisor add-on store ───────────────────────────────────────────
step "Reloading Supervisor add-on store"

RELOAD_RESULT=$(curl -s -o /dev/null -w "%{http_code}" \
                  --max-time 15 \
                  -X POST "${SUPERVISOR_API}/addons/reload" 2>/dev/null || echo "000")

case "$RELOAD_RESULT" in
  200|201)
    ok "Supervisor add-on store reloaded (HTTP $RELOAD_RESULT)" ;;
  000)
    warn "Supervisor API not reachable — reload skipped." \
         "Reload manually: curl -X POST http://localhost:4357/addons/reload" ;;
  *)
    warn "Unexpected response from Supervisor reload: HTTP $RELOAD_RESULT" ;;
esac

# ── Summary ───────────────────────────────────────────────────────────────────
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "${BOLD}${GREEN}╔══════════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}${GREEN}║            LIMEN OS — Setup Complete               ║${RESET}"
echo -e "${BOLD}${GREEN}╚══════════════════════════════════════════════════════╝${RESET}"
echo ""
echo -e "  ${BOLD}Home Assistant UI${RESET}  →  ${CYAN}http://${HOST_IP}:8123${RESET}"
echo -e "  ${BOLD}Limen OS add-on${RESET}  →  Install via HA Settings → Add-ons"
echo -e "  ${BOLD}Add-on slug${RESET}        →  ${DIM}limen_os${RESET}"
echo ""
echo -e "  ${DIM}Next steps:${RESET}"
echo -e "  ${DIM}1. Open http://${HOST_IP}:8123 and complete the HA onboarding${RESET}"
echo -e "  ${DIM}2. Go to Settings → Add-ons → Add-on Store${RESET}"
echo -e "  ${DIM}3. Find 'Limen OS' under Local add-ons and install it${RESET}"
echo -e "  ${DIM}4. Optionally put secrets in /config/limen/serve.env${RESET}"
echo ""
