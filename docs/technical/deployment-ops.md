# DEPLOYMENT & OPS

This guide covers deploying LIMEN OS on its target hardware: a **Debian 13 (Trixie) container**
running inside **Home Assistant OS (Alpine)** on an embedded host, plus browser-kiosk and SSH-TUI
access modes.

---

## 1. Target Environment

| Component | Value |
| --------- | ----- |
| Host OS | HAOS (Alpine Linux) |
| Container OS | Debian 13 Trixie |
| Container manager | HAOS Add-on / LXC |
| Limen root | `/opt/limen` (also `/config/limen/limen`, `/limen`) |
| Display | Xvfb (headless X11) + Chromium kiosk, OR Wayland/GNOME session |
| Rust toolchain | `~/.local/deb/cargo/bin/` (`rustc 1.94+`) |
| Bun | `~/.local/deb/.bun/bin/bun` (`1.3+`) |
| Node | `~/.local/deb/nvm/versions/node/v24/bin/` |
| Flutter | `~/.local/deb/flutter/bin/` (`3.41+`) |
| Android SDK | `/opt/limen/android` |

---

## 2. File Layout

```text
/opt/limen/
├── bin/                # Compiled binaries
│   ├── synapsd         # limen-core daemon
│   ├── limen-tui     # TUI binary
│   └── limen-voice   # Voice pipeline daemon
├── www/                # Built shell frontend (Vite dist/)
│   ├── index.html
│   ├── assets/
│   └── icons/          # App SVG icons
├── plugins/            # WASM plugin bundles
├── config/             # Runtime config (not source)
│   ├── limen.toml    # Core config
│   ├── paradigms/      # Custom paradigm JSON files
│   └── plugins.toml    # Plugin manifest
├── data/               # Persistent state
│   ├── sessions/       # WID-tagged session snapshots
│   └── wid.state       # HLC state for WID generation
└── logs/               # WID-tagged event logs (rotated daily)
    └── limen.log
```

Configuration source of truth: `/etc/limen/limen.toml` (system-wide)
or `~/.config/limen/limen.toml` (user override).

---

## 3. Systemd Units

All units live in `/etc/systemd/system/` (or `~/.config/systemd/user/` for user sessions).

### `limen-core.service`

The central daemon. Must start before all other services.

```ini
[Unit]
Description=Limen OS — Core Daemon
After=network.target
Wants=network.target

[Service]
Type=simple
ExecStart=/opt/limen/bin/synapsd --config /opt/limen/config/limen.toml
Restart=on-failure
RestartSec=3s
Environment=RUST_LOG=info
Environment=LIMEN_ROOT=/opt/limen
WorkingDirectory=/opt/limen

[Install]
WantedBy=multi-user.target
```

### `limen-voice.service`

Voice pipeline (Whisper ONNX + TTS). Depends on core.

```ini
[Unit]
Description=Limen OS — Voice Pipeline
After=limen-core.service
Requires=limen-core.service

[Service]
Type=simple
ExecStart=/opt/limen/bin/limen-voice
Restart=on-failure
RestartSec=5s
Environment=LIMEN_STT_MODE=whisper
Environment=LIMEN_TTS_MODE=kokoro

[Install]
WantedBy=multi-user.target
```

### `limen-static.service`

Bun SPA server — serves the built frontend on port 1420.

```ini
[Unit]
Description=Limen OS — Static Frontend Server
After=network.target

[Service]
Type=simple
ExecStart=/opt/limen/bin/bun run /opt/limen/scripts/serve.ts
WorkingDirectory=/opt/limen
Restart=on-failure
Environment=PORT=1420
Environment=SERVE_DIR=/opt/limen/www

[Install]
WantedBy=multi-user.target
```

### `limen-xvfb.service`

Headless X display (needed for Chromium kiosk on HAOS).

```ini
[Unit]
Description=Limen OS — Xvfb Display
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/Xvfb :99 -screen 0 1920x1080x24
Restart=always

[Install]
WantedBy=multi-user.target
```

### `limen-kiosk.service`

Chromium in kiosk mode, pointing at the static server.

```ini
[Unit]
Description=Limen OS — Chromium Kiosk
After=limen-xvfb.service limen-static.service
Requires=limen-xvfb.service limen-static.service

[Service]
Type=simple
Environment=DISPLAY=:99
ExecStart=/usr/bin/chromium-browser \
  --kiosk \
  --no-sandbox \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-translate \
  --autoplay-policy=no-user-gesture-required \
  http://localhost:1420
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

---

## 4. Quick Deploy

```bash
# First-time install (run as root on the container)
bash /opt/limen/source/scripts/server-setup.sh --phase1   # core services
bash /opt/limen/source/scripts/server-setup.sh --phase2   # kiosk (optional)

# Redeploy after a code change (from dev machine)
LIMEN_HOST=root@limen.local make deploy

# Or manually:
make server-build                              # builds apps/shell/dist/
rsync -az apps/shell/dist/ root@limen.local:/opt/limen/www/
ssh root@limen.local systemctl reload limen-static

# Check service status
make server-status
# or:
ssh root@limen.local systemctl status limen-core limen-voice limen-static
```

---

## 5. Logs & Monitoring

All events are WID-tagged. The log stream is at `/opt/limen/logs/limen.log`.

```bash
# Live tail
journalctl -u limen-core -f

# Filter by intent events
journalctl -u limen-core | grep '"intent"'

# Check voice pipeline
journalctl -u limen-voice -n 50

# WID correlation: trace a voice command end-to-end
grep "20260312T143115" /opt/limen/logs/limen.log
```

Log rotation: `logrotate` daily, 7-day retention, gzip.

---

## 6. Updating Binaries

```bash
# On the container (or via SSH)
cd /opt/limen/source

git pull origin main

# Rebuild Rust binaries
cargo build --release -p limen-core
cargo build --release -p limen-tui
cargo build --release -p limen-voice

# Install
cp target/release/synapsd      /opt/limen/bin/
cp target/release/limen-tui  /opt/limen/bin/
cp target/release/limen-voice /opt/limen/bin/

# Restart services
systemctl restart limen-core limen-voice

# Rebuild and redeploy frontend
make server-build
cp -r apps/shell/dist/. /opt/limen/www/
systemctl reload limen-static
```

---

## 7. Environment Variables

Copy `.env.example` → `.env` in the repo root. Key variables:

```bash
# AI — inherit from /opt/limen/.env if present
ANTHROPIC_API_KEY=sk-ant-...   # Claude — primary AI
OPENAI_API_KEY=sk-...          # GPT-4 — fallback
GOOGLE_GEMINI_API_KEY=...      # Gemini — fallback
DEEPSEEK_API_KEY=...           # Deepseek — cheap fallback
GROQ_API_KEY=...               # Groq — ultra-fast fallback

# Voice
LIMEN_WAKE_WORD=hey_limen
LIMEN_STT_MODE=whisper        # whisper | webspeech | hybrid
LIMEN_TTS_MODE=kokoro         # kokoro | piper | browser

# Shell
LIMEN_DEFAULT_SCENE=home
LIMEN_GPU_MODE=webgpu         # webgpu | webgl2
LIMEN_ROOT=/opt/limen

# Mobile bridge
LIMEN_MOBILE_PORT=8766
LIMEN_WEBRTC_STUN=stun:stun.l.google.com:19302
```

---

## 8. Hardware Targets

| Target | Notes |
| ------ | ----- |
| HAOS container (primary) | Debian 13, Xvfb kiosk, no GPU acceleration |
| Raspberry Pi 4/5 | ARM64, use `--target aarch64-unknown-linux-gnu` for Rust |
| x86_64 Linux desktop | GNOME/Wayland session, GPU WebGPU |
| Browser (any OS) | `make server-build` + serve on LAN; limited to Web APIs only |
| macOS dev machine | `make shell-dev` with `GDK_BACKEND=` unset |

For Raspberry Pi cross-compilation:

```bash
rustup target add aarch64-unknown-linux-gnu
cargo build --release --target aarch64-unknown-linux-gnu -p limen-core
```

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| Blank screen on kiosk | Static server not ready | `systemctl status limen-static` |
| Voice not responding | Wake-word model path wrong | Check `LIMEN_WAKE_WORD_MODEL` env |
| High CPU from Babylon.js | WebGPU unsupported, fell back to WebGL | Set `LIMEN_GPU_MODE=webgl2` |
| IPC socket missing | `limen-core` not started | `systemctl start limen-core` |
| AgentFlow shows no agents | MQTT broker not running | `make mock-agents` (dev) or start real broker |
| Mobile companion not connecting | WebRTC STUN blocked | Try `LIMEN_WEBRTC_STUN=` (empty = direct) |
