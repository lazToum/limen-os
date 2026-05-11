# LIMEN OS — Developer Guide
<!-- cspell: disable -->

> **"WALDIEZ OS"** — A voice-first, AI-native, beautiful desktop shell for humans.
> Grade A++ UDX (User + Developer Experience). Built on top of GNOME/Wayland.

---

## What Is LIMEN OS?

LIMEN OS is a supercharged display shell — think GNOME on steroids — designed around three principles:

1. **Voice-first**: Camera + microphone are primary. Keyboard/mouse are fallback.
2. **AI-native**: Every surface is LLM-augmented. Multi-model routing (Claude, GPT-4, Gemini, Deepseek, Groq, Mistral).
3. **Beautiful & lightweight**: Babylon.js WebGL/WebGPU rendering. Fluid animations. No visual debt.

It runs **on top of or instead of** a traditional GNOME session inside this HAOS Ubuntu container,
and also runs as a **web app** (browser kiosk), a **TUI** (SSH terminal), and a **Flutter mobile companion**.

---

## Repository Layout

```text
limen-os/
├── apps/
│   ├── shell/        # Main desktop shell — Tauri v2 (Rust + Babylon.js/React)
│   ├── tui/          # Terminal UI — Ratatui (Rust) — SSH-accessible, full feature parity
│   └── mobile/       # Flutter companion app — voice relay, remote control, second screen
│
├── crates/           # Rust library crates (Cargo workspace members)
│   ├── limen-core/    # Core daemon: IPC, session, WID integration, WASM plugins
│   ├── limen-ai/      # AI orchestration: multi-model router, intent, context
│   ├── limen-voice/   # Voice: Whisper ONNX STT, Kokoro/Piper TTS, wake-word
│   └── limen-display/ # Display: Wayland/X11 bridge, window management
│
├── packages/         # TypeScript/JS packages (Bun workspaces)
│   ├── ui/              # @limen/ui — Babylon.js component library, shaders, widgets
│   ├── voice-client/    # @limen/voice-client — WebSpeech + WebRTC + visualizer
│   └── ai-client/       # @limen/ai-client — multi-model client router
│
└── docs/             # Architecture, API reference, guides
```

---

## Tech Stack

| Layer | Technology | Why |
| ----- | --------- | --- |
| Desktop shell runtime | Tauri v2 | Rust backend + WebView, tiny binary, native perf |
| 3D rendering | Babylon.js 7.x | WebGL2/WebGPU, proven, excellent docs |
| UI framework | React 19 + Tailwind v4 | Familiar, fast, component ecosystem |
| UI state | Zustand + Jotai | Simple, atomic, composable |
| Animation (2D) | Framer Motion | Complements Babylon for DOM-layer effects |
| TUI | Ratatui + Crossterm | Rust, beautiful, SSH-accessible |
| Mobile | Flutter 3.41.4 | Cross-platform, already installed |
| Rust services | Tokio + Axum | Async runtime, HTTP/WebSocket |
| IPC | zbus (D-Bus) + Unix socket | System integration |
| STT | Whisper ONNX (local) → WebSpeech API | Privacy-first, offline capable |
| TTS | Kokoro TTS (local) / browser SpeechSynthesis | Low latency |
| AI routing | Anthropic Claude (primary) → GPT-4 → Gemini → Deepseek → Groq | Fallback chain |
| Vision | MediaPipe WASM (gestures, face) | In-browser, no server needed |
| Identity | WID (existing `../wid` project) | Reuse, every event/session gets a WID |
| Plugins | Wasmtime (WASM) | Safe sandbox, any language |
| Package manager | Bun (JS) + Cargo (Rust) | Fast, already installed |
| Build tool | Vite (shell frontend) + tsup (packages) | Standard, fast |

---

## Architecture

### High-Level Layers

```text
┌─────────────────────────────────────────────────────────┐
│  INPUT LAYER  (voice > gesture > touch > keyboard/mouse) │
│  Camera │ Mic │ MediaPipe │ WebSpeech │ WebRTC mobile    │
└────────────────────────┬────────────────────────────────┘
                         │ Intent Events
┌────────────────────────▼────────────────────────────────┐
│  AI LAYER  (limen-ai crate + @limen/ai-client)       │
│  Wake-word → STT → Intent → LLM Router → Action         │
│  Claude(primary) │ GPT-4 │ Gemini │ Deepseek │ Groq     │
└────────────────────────┬────────────────────────────────┘
                         │ Actions / Commands
┌────────────────────────▼────────────────────────────────┐
│  SHELL LAYER  (apps/shell — Tauri v2)                    │
│  Babylon.js Scenes │ React Components │ Window Manager   │
│  Greeter │ Home │ Launcher │ Ambient │ Focus │ Widgets   │
└────────────────────────┬────────────────────────────────┘
                         │ System Calls (Tauri commands)
┌────────────────────────▼────────────────────────────────┐
│  CORE LAYER  (limen-core crate, runs as daemon)        │
│  Session Manager │ IPC Bus │ WID Events │ WASM Plugins   │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│  SYSTEM LAYER  (limen-display + GNOME/Wayland/X11)     │
│  Window stacking │ Display config │ Input routing        │
└─────────────────────────────────────────────────────────┘
```

### Shell Scenes (Babylon.js)

Each mode is a full Babylon.js **Scene** with its own camera, lights, and meshes:

| Scene | Description |
| ----- | ----------- |
| `GreeterScene` | Pre-login screen — particle aurora, voice login |
| `HomeScene` | Main desktop — orbital widget dock, live wallpaper |
| `LaunchScene` | App launcher — 3D card grid, voice search |
| `FocusScene` | Single app maximized — minimal chrome |
| `AmbientScene` | Screensaver — generative art, clock, weather |
| `VoiceScene` | Overlay during voice interaction — waveform visualization |
| `NotifScene` | Notification tray — spatial notifications |

Scene transitions use Babylon.js `SceneOptimizerOptions` and custom GLSL post-processing.

### Voice Pipeline

```text
Microphone → Web Audio API
  → WebSpeech API (continuous recognition) [online fallback]
  → OR Whisper ONNX via WASM [offline primary]
    → Wake-word filter ("Hey Limen")
      → Intent detection (LLM call with structured output)
        → Action dispatch (Tauri command / IPC message)
          → Voice feedback (Kokoro TTS / SpeechSynthesis)
            → Visual feedback (VoiceScene overlay)
```

### Mobile Companion Bridge

```text
Flutter app ←→ WebRTC DataChannel ←→ limen-core daemon
  - Voice relay (mobile mic → desktop STT)
  - Remote control events (touch → desktop actions)
  - Second screen (desktop state → mobile display)
  - Camera stream (mobile cam → face recognition)
```

### WID Integration

Every session, event, and plugin action gets stamped with a WID from `../wid`:

```rust
// Every significant event:
let wid = WID::next_hlc(node_id);
event.id = wid.to_string();
```

Session IDs, plugin IDs, notification IDs, and log entries are all WIDs.

---

## Common Commands

```bash
# Full dev setup (first time)
make setup

# Start everything in dev mode
make dev

# Individual apps
make shell-dev      # Tauri shell with hot-reload (Vite + cargo watch)
make tui-dev        # TUI with cargo watch
make mobile-dev     # Flutter run

# Build
make build          # All release builds
make shell-build    # Tauri app build
make tui-build      # TUI binary
make mobile-build   # Flutter APK + web

# Lint & typecheck
make check          # All linters + type checks
make rust-check     # cargo clippy --all
make ts-check       # tsc + eslint on all packages/apps
make flutter-check  # flutter analyze

# Test
make test           # All test suites
make rust-test      # cargo nextest run --all
make ts-test        # bun test (all packages)
make flutter-test   # flutter test

# Docs
make docs           # typedoc + rustdoc + flutter doc
```

---

## Developer Experience (DX) Commitments

1. **`make dev` → everything running in <10s** — Tauri shell, TUI watcher, mobile emulator.
2. **Hot reload everywhere** — Vite HMR for shell frontend, `cargo-watch` for Rust, Flutter hot reload.
3. **Type-safe IPC** — All Tauri commands have TypeScript types auto-generated from Rust types via `specta`.
4. **Storybook for Babylon.js scenes** — Each scene/widget can be developed in isolation.
5. **Plugin SDK** — WASM plugin template + docs, can be written in Rust, Python, Go, or AssemblyScript.
6. **`make precommit`** — single command checks: `cargo fmt`, `clippy`, `eslint`, `prettier`, `flutter format`, `flutter analyze`.

---

## Environment Variables

Copy `.env.example` to `.env`. Key vars:

```env
# AI Models (inherits from parent /opt/limen/.env)
ANTHROPIC_API_KEY=...      # Claude — primary AI
OPENAI_API_KEY=...         # GPT-4 — fallback
GOOGLE_GEMINI_API_KEY=...  # Gemini — fallback
DEEPSEEK_API_KEY=...       # Deepseek — local/cheap fallback
GROQ_API_KEY=...           # Groq — ultra-fast fallback

# Voice
LIMEN_WAKE_WORD=hey_limen
LIMEN_STT_MODE=whisper    # whisper | webspeech | hybrid
LIMEN_TTS_MODE=kokoro     # kokoro | piper | browser

# Shell
LIMEN_DEFAULT_SCENE=home  # home | greeter | ambient
LIMEN_GPU_MODE=webgpu     # webgpu | webgl2

# Mobile Bridge
LIMEN_MOBILE_PORT=8766
LIMEN_WEBRTC_STUN=stun:stun.l.google.com:19302
```

---

## Phases

| Phase | Focus | Deliverable |
| ----- | ----- | ----------- |
| 0 — Foundation | Monorepo, CI, DX | `make dev` works end-to-end (even if blank scenes) |
| 1 — Shell MVP | Babylon.js home scene, basic launcher | Beautiful home screen, app launch via click |
| 2 — Voice | STT pipeline, wake-word, intent | "Hey Limen, open terminal" works |
| 3 — AI | Multi-model router, context, Claude agent | Conversational OS control |
| 4 — TUI | Ratatui shell, SSH access | Full TUI with voice + AI via terminal |
| 5 — Mobile | Flutter companion | Remote control + voice relay from phone |
| 6 — Plugins | WASM plugin SDK | Third-party widgets and commands |
| 7 — Polish | Greeter, ambient, theme engine | A++ visual quality across all scenes |

---

## Related Projects (in this monorepo)

- **`../wef`** — Fall detection: reuse MQTT alerts → Limen notification widget
- **`../wid`** — WID identifier: used for all event/session IDs throughout Limen OS

---

## Notes on HAOS Environment

- We run in a **Debian 13 (Trixie) container** inside **HAOS (Alpine)** on the host.
- `LIMEN_ROOT=/opt/limen` (symlinked from `/config/limen/limen` and `/limen`)
- Runtimes at:
  - Rust: `~/.local/deb/cargo/bin/` (rustc 1.94)
  - Bun: `~/.local/deb/.bun/bin/bun` (1.3.10)
  - Node: `~/.local/deb/nvm/versions/node/v24.14.0/bin/` (v24.14)
  - Flutter: `~/.local/deb/flutter/bin/` (3.41.4)
  - Go: `~/.local/deb/go/bin/` (1.25.8)
- For Tauri, we need `webkit2gtk-4.1` and `libappindicator3-dev` on Debian.
- Android SDK lives at `ANDROID_HOME=/opt/limen/android`.
