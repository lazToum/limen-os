# Limen OS

[![GitHub](https://img.shields.io/badge/GitHub-lazToum%2Flimen--os-181717?logo=github)](https://github.com/lazToum/limen-os)
[![GitLab](https://img.shields.io/badge/GitLab-lazToum%2Flimen--os-FC6D26?logo=gitlab)](https://gitlab.com/lazToum/limen-os)
[![Site](https://img.shields.io/badge/limen--os.io-online-2b3a8f)](https://limen-os.io)

A design and codebase for a voice-first, AI-native desktop shell. Early-stage. Built on Tauri v2, Babylon.js, and multi-model AI routing.

---

## What Is Limen OS?

An opinionated bet on what a desktop shell could look like if voice and AI were designed in from the start — not bolted on. The three design principles it's being built around:

1. **Voice-first** — camera and microphone as primary inputs; keyboard and mouse as fallback
2. **AI-native** — multi-model routing (Claude → GPT-4 → Gemini → Deepseek → Groq) throughout, not as a feature
3. **Beautiful & lightweight** — Babylon.js WebGL/WebGPU rendering; no visual debt allowed

The target runtime is Tauri v2 on Linux/Wayland, plus a browser kiosk mode, a Ratatui TUI over SSH, and a Flutter mobile companion. Most of this is still being built.

---

## Repository Layout

```
apps/
  shell/       Tauri v2 desktop shell — Babylon.js scenes + React 19
  tui/         Ratatui TUI — SSH-accessible, full feature parity
  mobile/      Flutter companion — voice relay, remote control, second screen
  player/      @waldiez/player — media player with DJ mixer + cross-attentional modes

crates/
  limen-core/  Core daemon: IPC, session, WID integration, WASM plugins
  limen-ai/    AI orchestration: multi-model router, intent, context
  limen-voice/ Voice: Whisper ONNX STT, Kokoro/Piper TTS, wake-word
  limen-display/ Display: Wayland/X11 bridge, window management

packages/
  ui/          @limen/ui — Babylon.js component library, shaders, widgets
  voice-client/ @limen/voice-client — WebSpeech + WebRTC + visualizer
  ai-client/   @limen/ai-client — multi-model client router

docker/        Caddy + Docker Compose for limen-os.io
docs/          Architecture, API reference, guides
services/      smartcities, sinergym AI environments
```

---

## Quick Start

```bash
make setup      # Install all deps (Rust, Bun, Flutter)
make dev        # Start Tauri shell + TUI watcher + mobile emulator
```

See [DEVELOPER.md](DEVELOPER.md) for the full developer guide.

---

## Documentation

- [Philosophy](docs/PHILOSOPHY.md) — The Grandmother Test and design principles
- [Getting Started](docs/guides/GETTING_STARTED.md) — Developer setup
- [Architecture](docs/architecture/ARCHITECTURE.md) — System design deep dive
- [API Overview](docs/api/OVERVIEW.md) — IPC and plugin API reference

---

## Related Projects

- **[hitl-ml](https://github.com/lazToum/hitl-ml)** — The HITL Machine Learning handbook that contextualizes this project
- **[waldiez/wid](https://github.com/waldiez/wid)** — Hybrid logical clock identifiers; every session, event, and plugin action is stamped with a WID
- **[waldiez/player](https://github.com/waldiez/player)** — Media player that lives in `apps/player/`; upstream for that subtree

---

## License

MIT OR Apache-2.0 — © 2026 Lazaros Toumanidis
