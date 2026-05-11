#!/usr/bin/env bash
# LIMEN OS — Home Assistant Add-on entrypoint
# ──────────────────────────────────────────────────────────────────────────────
# Runs as PID 1 inside the HA Supervisor container.
# Start order:
#   1. Setup symlinks / config dir
#   2. Parse /data/options.json → /etc/limen/serve.env
#   3. Xvfb   :99  (virtual framebuffer)
#   4. x11vnc       (VNC mirror of :99)
#   5. websockify   (noVNC WS bridge :6080 → VNC :5900)
#   6. Chromium     (kiosk pointing at http://localhost:1420/limen/)
#   7. ttyd :7681   (web terminal wrapping limen-tui)
#   8. exec bun serve.ts (foreground — becomes the monitored process)
#
# Signals: SIGTERM → gracefully stops all background children, then exits.
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
BOLD='\033[1m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; RESET='\033[0m'
step()  { echo -e "${BOLD}▶ $*${RESET}"; }
ok()    { echo -e "${GREEN}✓ $*${RESET}"; }
warn()  { echo -e "${YELLOW}⚠ $*${RESET}"; }
fatal() { echo -e "${RED}✗ $*${RESET}" >&2; exit 1; }

# ── Background PIDs (for graceful shutdown) ───────────────────────────────────
declare -a BG_PIDS=()

cleanup() {
  echo ""
  step "Received shutdown signal — stopping background services..."
  for pid in "${BG_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done
  # Give them a moment to exit cleanly
  sleep 2
  for pid in "${BG_PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
  ok "Shutdown complete"
  exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

# ── 1. Persistent config directory ───────────────────────────────────────────
# HA mounts /config (the HA data partition) and /data (add-on specific).
# We keep Limen OS user data under /config/limen/ and symlink it to
# /opt/limen/userdata for easy access from serve.ts.
step "Setting up persistent config directory"

CONFIG_DIR="/config/limen"
if [[ ! -d "$CONFIG_DIR" ]]; then
  mkdir -p "$CONFIG_DIR"
  ok "Created $CONFIG_DIR"
fi

# Symlink /config/limen → /opt/limen/userdata for serve.ts
if [[ ! -L "/opt/limen/userdata" ]]; then
  ln -sf "$CONFIG_DIR" "/opt/limen/userdata"
  ok "Linked /opt/limen/userdata → $CONFIG_DIR"
fi

# ── 2. Parse add-on options → serve.env ──────────────────────────────────────
# The HA Supervisor writes add-on config to /data/options.json.
# We translate it into /etc/limen/serve.env (shell env-file format).
step "Loading add-on options"

OPTIONS_FILE="/data/options.json"
SERVE_ENV="/etc/limen/serve.env"
mkdir -p /etc/limen

if [[ -f "$OPTIONS_FILE" ]]; then
  # If jq is available, parse options properly; else do a simple passthrough
  if command -v jq &>/dev/null; then
    jq -r 'to_entries[] | "\(.key)=\(.value)"' "$OPTIONS_FILE" > "$SERVE_ENV" 2>/dev/null || true
    ok "Parsed options.json → $SERVE_ENV"
  else
    warn "jq not found — options.json not parsed; using defaults"
    touch "$SERVE_ENV"
  fi
else
  warn "No options.json found at $OPTIONS_FILE — using defaults"
  touch "$SERVE_ENV"
fi

# Merge in any user-provided env from /config/limen/serve.env (takes precedence)
USER_ENV="$CONFIG_DIR/serve.env"
if [[ -f "$USER_ENV" ]]; then
  cat "$USER_ENV" >> "$SERVE_ENV"
  ok "Merged user env from $USER_ENV"
fi

# ── 3. Xvfb — virtual framebuffer ────────────────────────────────────────────
# Chromium needs a display; we give it a virtual one at :99.
step "Starting Xvfb on display :99"

Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset &
BG_PIDS+=($!)
XVFB_PID=$!

# Wait up to 5 s for Xvfb to be ready
for i in $(seq 1 10); do
  if xdpyinfo -display :99 &>/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

export DISPLAY=:99
ok "Xvfb started (PID $XVFB_PID)"

# ── 4. x11vnc — VNC mirror of :99 ────────────────────────────────────────────
step "Starting x11vnc on :5900"

x11vnc \
  -display :99 \
  -nopw \
  -listen 127.0.0.1 \
  -xkb \
  -forever \
  -shared \
  -bg \
  -o /var/log/limen/x11vnc.log 2>/dev/null || \
x11vnc \
  -display :99 \
  -nopw \
  -listen 127.0.0.1 \
  -xkb \
  -forever \
  -shared &
BG_PIDS+=($!)
ok "x11vnc started"

# ── 5. websockify — noVNC WS bridge ──────────────────────────────────────────
# Bridges WebSocket :6080 → raw VNC TCP :5900.
# --web serves the noVNC HTML/JS client from the system novnc path.
step "Starting websockify (noVNC) on :6080"

NOVNC_PATH=""
for p in /usr/share/novnc /usr/share/novnc/utils /usr/lib/novnc; do
  if [[ -d "$p" ]]; then
    NOVNC_PATH="$p"
    break
  fi
done

if [[ -n "$NOVNC_PATH" ]]; then
  websockify --web "$NOVNC_PATH" 6080 127.0.0.1:5900 &
else
  # No novnc assets — still useful as a raw WS proxy
  warn "noVNC web assets not found — starting websockify without --web"
  websockify 6080 127.0.0.1:5900 &
fi
BG_PIDS+=($!)
ok "websockify started on :6080"

# ── 6. Chromium kiosk ─────────────────────────────────────────────────────────
# Points at the local serve.ts instance.  We wait for serve.ts to bind before
# launching Chromium, so do a brief sleep — serve.ts starts last (exec).
# We launch Chromium now and it will retry connections automatically.
step "Starting Chromium kiosk (display :99)"

CHROMIUM_BIN=""
for b in chromium chromium-browser /usr/bin/chromium /usr/bin/chromium-browser; do
  if command -v "$b" &>/dev/null; then
    CHROMIUM_BIN="$b"
    break
  fi
done

if [[ -n "$CHROMIUM_BIN" ]]; then
  DISPLAY=:99 "$CHROMIUM_BIN" \
    --no-sandbox \
    --disable-dev-shm-usage \
    --disable-gpu-sandbox \
    --disable-software-rasterizer \
    --kiosk \
    --disable-infobars \
    --disable-session-crashed-bubble \
    --disable-restore-session-state \
    --autoplay-policy=no-user-gesture-required \
    --disable-features=TranslateUI \
    --app="http://localhost:1420/limen/" \
    &>/var/log/limen/chromium.log 2>&1 &
  BG_PIDS+=($!)
  ok "Chromium kiosk started (PID $!)"
else
  warn "Chromium not found — kiosk display disabled (VNC will show empty :99)"
fi

# ── 7. ttyd — web terminal ────────────────────────────────────────────────────
# Wraps limen-tui (or falls back to bash) in a browser-accessible terminal.
step "Starting ttyd web terminal on :7681"

TUI_BIN="/opt/limen/bin/limen-tui"
TTYD_BIN=""
for b in ttyd /usr/local/bin/ttyd /usr/bin/ttyd; do
  if command -v "$b" &>/dev/null; then
    TTYD_BIN="$b"
    break
  fi
done

if [[ -n "$TTYD_BIN" ]]; then
  if [[ -x "$TUI_BIN" ]]; then
    "$TTYD_BIN" --port 7681 --interface 0.0.0.0 --writable "$TUI_BIN" &
    ok "ttyd started wrapping limen-tui"
  else
    warn "limen-tui not found at $TUI_BIN — wrapping bash"
    "$TTYD_BIN" --port 7681 --interface 0.0.0.0 --writable bash &
    ok "ttyd started wrapping bash"
  fi
  BG_PIDS+=($!)
else
  warn "ttyd not found — TUI web terminal disabled (port 7681 will be closed)"
fi

# ── Ensure log dir exists ─────────────────────────────────────────────────────
mkdir -p /var/log/limen

# ── 8. serve.ts — foreground process (PID 1 target) ──────────────────────────
step "Starting Limen OS serve.ts on :1420"
echo ""
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${GREEN}${BOLD}  LIMEN OS add-on ready${RESET}"
echo -e "${GREEN}  SPA+proxy  →  http://localhost:1420/limen/${RESET}"
echo -e "${GREEN}  noVNC      →  http://localhost:6080/vnc.html${RESET}"
echo -e "${GREEN}  TUI        →  http://localhost:7681${RESET}"
echo -e "${GREEN}${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# exec replaces this shell — signals will go directly to bun.
# The cleanup trap above handles SIGTERM before exec; after exec bun handles it.
exec /root/.bun/bin/bun /opt/limen/scripts/serve.ts
