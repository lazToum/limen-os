# NOTICE

Limen OS
Copyright © 2026 Lazaros Toumanidis

---

## Authorship

This project was developed with substantial AI assistance (Claude, Anthropic).
Lazaros Toumanidis is the author of record and is responsible for architecture,
design decisions, and final implementation choices.

## Third-party components

This software is built on open-source frameworks and libraries, each governed
by their own licenses. Major dependencies include:

**Desktop shell (Tauri + Babylon.js)**
- Tauri (Apache-2.0/MIT) — https://tauri.app
- Babylon.js (Apache-2.0) — https://www.babylonjs.com
- React (MIT) — https://react.dev
- Vite (MIT) — https://vitejs.dev

**Rust crates**
- Tokio (MIT) — https://tokio.rs
- Axum (MIT) — https://github.com/tokio-rs/axum
- zbus (MIT) — https://github.com/dbus2/zbus
- wasmtime (Apache-2.0) — https://wasmtime.dev
- async-openai (MIT) — https://github.com/64bit/async-openai
- Ratatui (MIT) — https://ratatui.rs
- serde (MIT/Apache-2.0) — https://serde.rs
- tracing (MIT) — https://github.com/tokio-rs/tracing

**Mobile companion**
- Flutter (BSD-3-Clause) — https://flutter.dev

**Voice & AI**
- Whisper ONNX — derived from OpenAI Whisper (MIT)
- Kokoro/Piper TTS — respective upstream licenses apply

**Upstream subtrees**
- @waldiez/wid (MIT) — https://github.com/waldiez/wid
- @waldiez/player (MIT/Apache-2.0) — https://github.com/waldiez/player

Full dependency lists: `Cargo.toml`, `package.json`, `apps/mobile/pubspec.yaml`.

---

See LICENSE for the terms governing this project.
