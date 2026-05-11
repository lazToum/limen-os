# LIMEN OS — Interactive Tour

> *A voice-first, AI-native desktop. This document is both a guided tour and a live demo — open it in Ammelie to experience the full walkthrough.*

---

## Welcome to LIMEN OS

You're looking at a new kind of operating system. Not a skin on top of GNOME. Not a launcher. A complete rethinking of how humans and computers talk to each other.

The core idea is simple: **the computer should come to you, not the other way around.**

---

## Chapter 1: The Five Ways to Talk

LIMEN OS implements the **TRANSPORT hierarchy** — five input modalities, ordered by effort:

| Tier | Input | When |
|------|-------|------|
| 🎙️ Voice | Microphone + wake word | Primary — always on |
| 👋 Gesture | Camera + MediaPipe | Hands visible to camera |
| 👆 Touch | Touchscreen | On capable hardware |
| 🖥️ TUI | SSH terminal | Remote / accessibility |
| ⌨️ Keyboard | Traditional | Last resort / power user |

The system monitors frustration signals — repeated retries, raised voice, rapid clicks — and automatically degrades to the next tier. **You never have to pick a mode. The OS reads you.**

### Try it now

Say *"Hey Limen, open terminal"* — if voice is configured, a terminal window slides open.

Or press the microphone button in the bottom-right tray. The waveform visualizer activates and your words become commands.

---

## Chapter 2: The Desktop Paradigms

Click the grid icon in the taskbar to open Settings → Appearance. You'll find **8 built-in paradigms**:

### Windows 11 (default)
Familiar. Frosted glass taskbar at the bottom, Start menu, Notification tray with live popups.

### macOS Classic
Menu bar at the top. Dock at the bottom. App switcher. Feels like 2007 at 60fps.

### Unix Minimal
Panels at top and bottom. Nothing wasted. Keyboard-first. For the terminal people.

### Nebula
Dark ambient shell. Floating dock. Particle effects. The "sci-fi cockpit" paradigm.

### DOS Retro
CGA palette. MS-DOS prompt aesthetic. Fully functional, deliberately vintage.

### Calm
Low-stimulation. Muted colors, no animations, large touch targets. Accessibility-first.

### Mobile
Full-screen app view. Bottom navigation. Designed for 5–7" screens and touchscreens.

---

## Chapter 3: Applications

Every app opens in a floating, resizable window — or maximizes to fill the screen.

### Ammelie — Universal Media Player
You're reading this inside Ammelie right now (or you could be). Drop any file here:
- **Video**: MP4, MKV, WebM — plays with warm celluloid color grading
- **Audio**: MP3, FLAC, OGG, WAV — visualizer + waveform
- **Documents**: PDF, markdown, text — rendered beautifully
- **Subtitles**: SRT, VTT — overlaid on video
- **Waldiez flows**: `.waldiez` — opens your AI agent graphs

The edit button (pencil icon) switches to editing mode — this very document can be edited live.

### AgentFlow — Live AI Agent Monitor
Connect to a MQTT broker on `ws://localhost:9001`. AgentFlow shows:
- Live agent heartbeats (green pulse = alive)
- Status transitions (idle → processing → done)
- Alert bubbles for failures or anomalies
- Chat messages between agents

For local development: `make mock-agents` spins up a fake broker with 4 simulated agents.

### Home Assistant
Your smart home, embedded. Full HA frontend at `http://homeassistant.local:8123`. Control lights, sensors, automations — all from the same shell.

### AI Chat
Direct conversation with the AI routing stack:
1. **Claude** (primary) — complex reasoning, code, analysis
2. **GPT-4** — fallback
3. **Gemini** — fallback
4. **Deepseek / Groq** — fast/cheap fallback

Ask it to do things: *"Open my email and summarize unread messages"* — the AI generates a Tauri IPC command and executes it.

---

## Chapter 4: The Voice Pipeline

```text
Microphone
  → Wake word detector ("Hey Limen")
    → Whisper ONNX (local, offline STT)
      → Intent classifier (LLM, structured JSON output)
        → Action dispatcher (Tauri IPC)
          → Voice response (Kokoro TTS, local)
            → Visual feedback (waveform overlay)
```

**Privacy first**: Whisper runs entirely on-device via WASM. No audio leaves your machine unless you explicitly use a cloud fallback.

Voice intents return structured JSON:

```json
{
  "intent": "open_app",
  "confidence": 0.97,
  "params": { "app_id": "terminal" },
  "utterance": "open terminal please"
}
```

---

## Chapter 5: The WID System

Every event in LIMEN OS gets a **Waldiez ID (WID)** — a hybrid logical clock timestamp that:
- Orders events causally across distributed nodes
- Survives clock drift
- Encodes node identity + sequence + physical time

```
wid:01J9K2M3N4P5Q6R7-0042-1706789012345
    ──────────────── ──── ─────────────
    random base-32   seq  unix-ms
```

Sessions, plugin calls, notifications, voice intents — all tagged. This makes debugging distributed voice+AI+display interactions tractable.

---

## Chapter 6: The Companion App

Open a browser on your phone and navigate to `http://<limen-ip>:4174`.

You get:
- **Remote microphone** — your phone becomes a wireless mic for the desktop
- **Touch remote** — tap to control the desktop
- **Second screen** — desktop state mirrored on your phone
- **Camera relay** — phone camera feeds gesture recognition

The connection uses WebRTC data channels for low-latency bidirectional comms.

---

## Chapter 7: Plugins

LIMEN OS supports WASM plugins — any language that compiles to WebAssembly.

A minimal plugin in Rust:

```rust
use limen_plugin_sdk::*;

#[plugin_main]
fn on_load(ctx: &mut PluginCtx) {
    ctx.register_widget("my-widget", render_widget);
    ctx.subscribe_event("voice_intent", on_intent);
}

fn render_widget(ctx: &RenderCtx) -> Widget {
    Widget::text("Hello from my plugin!")
}

fn on_intent(intent: &VoiceIntent) {
    if intent.intent == "my_command" {
        ctx.notify("My plugin handled it!");
    }
}
```

Plugins run in a Wasmtime sandbox with capability-based permissions. They can't read files or network unless granted explicitly in their manifest.

---

## Chapter 8: Development

Everything you need in one command:

```bash
git clone https://github.com/lazToum/limen-os
cd limen-os
make setup   # one-time: installs Tauri CLI, Flutter deps, JS packages
make dev     # starts Tauri shell + TUI watcher
```

Hot reload is on by default:
- Save a `.tsx` file → Vite HMR updates instantly
- Save a `.rs` file → `cargo-watch` rebuilds and reloads the Tauri backend

For the full stack (shell + TUI + Flutter companion):

```bash
make dev-full
```

---

## What's Next

- **Scene system**: Babylon.js 3D scenes (Greeter, Ambient screensaver, Voice overlay)
- **Semantic widgets**: Calendar, weather, home stats — AI-populated at login
- **Multi-user**: WID-tagged sessions, per-user paradigm preferences
- **GNOME integration**: Replace or co-exist with GNOME Shell via Mutter plugin API

---

*This document was generated as part of the LIMEN OS onboarding experience.*
*Open it in Ammelie to see interactive rendering. Click the pencil icon to edit.*

**LIMEN OS** · waldiez/limen-os · v0.1.0-alpha
