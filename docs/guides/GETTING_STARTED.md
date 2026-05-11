# LIMEN OS — Getting Started Guide

Welcome to **LIMEN OS** development. This guide gets you from zero to a running
local shell in under 10 minutes on a capable machine.

---

## Prerequisites

| Tool | Version | Install |
| ---- | ------- | ------- |
| Rust + Cargo | 1.80+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Bun | 1.3+ | `curl -fsSL https://bun.sh/install \| bash` |
| Flutter | 3.41+ | `git clone https://github.com/flutter/flutter ~/.local/flutter` |
| Tauri CLI | 2.x | `cargo install tauri-cli --version "^2" --locked` |
| Node.js | 20+ (via bun/nvm) | Bundled with Bun for most uses |

**Tauri system deps (Debian/Ubuntu):**

```bash
sudo apt install -y \
  libwebkit2gtk-4.1-dev libappindicator3-dev \
  librsvg2-dev patchelf libgtk-3-dev
```

**Tauri system deps (macOS):**

```bash
xcode-select --install   # Command Line Tools only needed
```

---

## First-Time Setup

```bash
# 1. Clone
git clone https://github.com/lazToum/limen-os
cd limen-os

# 2. Install everything (JS deps + Tauri CLI + Flutter deps + workspace packages)
make setup

# 3. Copy env (fill in API keys for AI features — optional for shell-only dev)
cp .env.example .env
```

---

## Running in Dev Mode

```bash
# Shell + TUI together (recommended)
make dev

# Shell only (Tauri + Vite HMR)
make shell-dev

# TUI only (cargo-watch, SSH to localhost:2222 or run directly)
make tui-dev

# Full stack: shell + TUI + Flutter web companion
make dev-full
```

The shell opens in a Tauri window at `localhost:1420` (Vite dev server).
Hot reload is active — save any `.tsx` or `.ts` file and the UI updates instantly.
Rust backend changes trigger `cargo watch` rebuild.

---

## Project Layout (Quick Reference)

```text
limen-os/
├── apps/
│   ├── shell/            ← Main desktop (Tauri v2 + React + Babylon.js)
│   │   ├── src/          ← React + TypeScript source
│   │   │   ├── components/desktop/   ← Window, Taskbar, StartMenu, icons
│   │   │   ├── constants/apps.ts     ← App registry
│   │   │   ├── store/shell.ts        ← Zustand global state
│   │   │   └── styles/global.css     ← All CSS (paradigm classes, window chrome)
│   │   ├── src-tauri/    ← Rust Tauri backend
│   │   └── public/icons/ ← Self-contained SVG app icons
│   ├── tui/              ← Ratatui TUI (Rust)
│   └── mobile/           ← Flutter companion app
├── crates/
│   ├── limen-core/     ← Core daemon (IPC, session, WID)
│   ├── limen-ai/       ← AI router (Claude → GPT-4 → Gemini → ...)
│   ├── limen-voice/    ← Whisper STT + Kokoro TTS
│   └── limen-display/  ← Wayland/X11 bridge
├── packages/
│   ├── ui/               ← @limen/ui — Babylon.js component library
│   ├── voice-client/     ← @limen/voice-client — WebSpeech + WebRTC
│   └── ai-client/        ← @limen/ai-client — multi-model router
└── docs/                 ← This documentation
```

---

## Key `make` Commands

```bash
make dev             # Start shell + TUI (hot reload)
make dev-full        # + Flutter web companion
make shell-dev       # Shell only (Tauri + Vite)
make tui-dev         # TUI only (cargo-watch)

make build           # Release builds: shell + TUI + mobile
make server-build    # Build shell frontend (Vite) for static serving
make deploy          # Build → scp to $LIMEN_HOST → git push

make check           # All linters + type checks
make test            # All test suites
make precommit       # fmt + clippy + eslint + test (run before commits)

make mock-agents     # Fake MQTT broker on :9001 (AgentFlow dev mode)
make server-status   # Check systemd service status on this machine
```

---

## Your First Change — Shell Component

1. Open `apps/shell/src/components/desktop/Desktop.tsx`.
2. Edit the wallpaper color or add a widget.
3. Save — Vite HMR applies the change instantly (no reload needed).

To add a new app to the taskbar:

```typescript
// apps/shell/src/constants/apps.ts
export const DEFAULT_APPS: AppDef[] = [
  // ... existing apps ...
  {
    id: "my-app",
    title: "My App",
    icon: "🚀",                  // emoji, or "my-svg" for a custom SVG icon
    contentType: "my-app",       // must be added to WindowContentType in shell.ts
    defaultWidth: 800,
    defaultHeight: 600,
    canMinimize: true,
    canMaximize: true,
    canClose: true,
  },
];
```

Then handle the content type in `WindowContent.tsx`:

```tsx
case "my-app":
  return <MyAppComponent />;
```

---

## Sending Commands to the Core Daemon

When `limen-core` is running (via `make tui-dev` or directly), you can send IPC messages:

```bash
# Simulate a voice intent (set scene to launcher)
echo '{"command":"set_scene","target":"launcher"}' \
  | nc -U /run/limen/core.sock

# Launch an app
echo '{"command":"launch_app","app_id":"terminal"}' \
  | nc -U /run/limen/core.sock
```

See [Daemon IPC Reference](../api/IPC.md) for the full protocol.

---

## AgentFlow Dev Mode

AgentFlow connects to a real MQTT broker on `ws://localhost:9001`.
For dev without a real broker, run the mock:

```bash
make mock-agents
# or directly:
node scripts/mock-agents.mjs
```

This simulates 4 agents (main-actor, monitor, ml-agent, data-fetcher) with live heartbeats,
status changes, alerts, and chat messages.

---

## Running Tests

```bash
make test           # all: Rust (nextest) + TS (bun test) + Flutter

make rust-test      # cargo nextest run --all
make ts-test        # bun test
make flutter-test   # flutter test
```

---

## Common Issues

| Problem | Fix |
| ------- | --- |
| `webkit2gtk not found` | Install `libwebkit2gtk-4.1-dev` (Debian) |
| Vite changes not updating | Check for stale `.js` files in `src/` shadowing `.tsx` (delete them) |
| TypeScript errors after adding app | Add content type to `WindowContentType` union in `shell.ts` |
| `cargo tauri dev` crashes | Check `src-tauri/tauri.conf.json` for valid `devUrl` |
| AgentFlow shows demo data | Start `make mock-agents` or connect a real MQTT broker on `:9001` |
| Mobile companion blank | Run `make mobile-web-server` and set mobile URL to `http://<ip>:4174` |

---

## Next Steps

- Read [Architecture Deep Dive](../architecture/ARCHITECTURE.md) for the full system design.
- Read [Paradigm Schema](../design/paradigms.md) to understand behavioral theming.
- Read [Scene Specification](../design/scenes.md) for Babylon.js scene structure.
- Read [Deployment & Ops](../technical/deployment-ops.md) to deploy to HAOS.
- Read [The Grandmother's Guide](GRANDMOTHER_GUIDE.md) to understand the design constraints.
