# Limen OS

[![GitHub](https://img.shields.io/badge/GitHub-lazToum%2Flimen--os-181717?logo=github)](https://github.com/lazToum/limen-os)
[![GitLab](https://img.shields.io/badge/GitLab-lazToum%2Flimen--os-FC6D26?logo=gitlab)](https://gitlab.com/lazToum/limen-os)
[![Site](https://img.shields.io/badge/limen--os.io-online-2b3a8f)](https://limen-os.io)

A voice-first, AI-native desktop shell. Built on Tauri v2, Babylon.js, and multi-model AI routing.

---

## What Is Limen OS?

Limen OS is a supercharged display shell — GNOME/Wayland augmented with voice, gesture, and AI — designed around three principles:

1. **Voice-first** — camera and microphone are primary inputs; keyboard and mouse are fallback
2. **AI-native** — every surface is LLM-augmented with multi-model routing (Claude → GPT-4 → Gemini → Deepseek → Groq)
3. **Beautiful & lightweight** — Babylon.js WebGL/WebGPU rendering, fluid animations, no visual debt

It runs as a **Tauri desktop app**, a **browser kiosk**, a **Ratatui TUI** (SSH), and has a **Flutter mobile companion**.

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

See [CLAUDE.md](CLAUDE.md) for the full developer guide.

---

## Documentation

- [Philosophy](docs/PHILOSOPHY.md) — The Grandmother Test and design principles
- [Getting Started](docs/guides/GETTING_STARTED.md) — Developer setup
- [Architecture](docs/architecture/ARCHITECTURE.md) — System design deep dive
- [API Overview](docs/api/OVERVIEW.md) — IPC and plugin API reference

---

## Related Projects

- **[hitl-ml](https://github.com/lazToum/hitl-ml)** — The HITL Machine Learning handbook that contextualizes this project
- **[wid](https://github.com/waldiez/wid)** — WID identifier library (sibling dep at `../wid`)
- **[@waldiez/player](https://github.com/waldiez/player)** — Source of `apps/player/`

---

## License

MIT OR Apache-2.0 — © 2026 Lazaros Toumanidis
