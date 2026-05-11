# LIMEN OS — Architecture Deep Dive

## The Five Interaction Modalities

LIMEN OS is designed to be used without a keyboard or mouse.
Priority order for interaction:

```text
1. VOICE       — "Hey Limen, open terminal"
2. GESTURE     — Hand wave, pinch, point (MediaPipe)
3. GAZE        — Eye tracking (future — Tobii/WebGazer)
4. MOBILE      — Phone as remote/mic/camera
5. TOUCH       — Multi-touch (tablet/touchscreen)
6. MOUSE       — Traditional pointer (fallback)
7. KEYBOARD    — Hotkeys / command input (fallback)
8. TUI         — SSH terminal access
```

---

## Component Communication

```text
┌──────────────────────────────────────────────────────────────┐
│  FRONTEND (Tauri WebView)                                    │
│  Babylon.js scenes ←→ React store ←→ Tauri invoke()          │
│         ↕                                   ↕                │
│  VoicePipeline              @limen/ai-client               │
└────────────────────────┬─────────────────────────────────────┘
                         │ Tauri IPC (invoke / listen)
┌────────────────────────▼─────────────────────────────────────┐
│  TAURI RUST BACKEND (apps/shell/src-tauri)                   │
│  Commands: voice_command, set_scene, launch_app, ai_query    │
│         ↕                                                    │
│  Unix socket client → limen-core daemon                    │
└────────────────────────┬─────────────────────────────────────┘
                         │ Unix socket /run/limen/core.sock
┌────────────────────────▼─────────────────────────────────────┐
│  LIMEN-CORE DAEMON (crates/limen-core)                   │
│  Session │ IPC server │ Event bus │ Plugin registry          │
│         ↕                    ↕                               │
│  limen-ai            limen-voice                         │
│  (LLM router)          (Whisper STT / TTS)                   │
└──────────────────────────────────────────────────────────────┘
         ↕ D-Bus / Wayland protocols
┌────────────────────────────────────────────────────────────┐
│  SYSTEM (GNOME/Wayland/X11)                                │
│  Window management │ Input routing │ Display config        │
└────────────────────────────────────────────────────────────┘
```

---

## Scene Transition System

Each scene transition is a timed compositor operation:

```text
SceneManager.transitionTo("launcher")
  ↓
1. Start post-process fade-out on current scene (200ms)
2. Pause non-essential animations on current scene
3. Activate new scene (begins render, resumes animations)
4. Start post-process fade-in on new scene (400ms)
5. Dispose old scene if memory pressure detected
```

Scene memory budget:

- Keep last 2 scenes loaded ("home" + "greeter" always resident)
- Lazy-load "launcher", "ambient", "voice" on first access
- Dispose after 5 minutes of inactivity

---

## Voice Intent Schema

The voice pipeline sends transcripts to the AI router with a structured schema:

```json
{
  "system": "You are LIMEN OS. Parse the user's voice command and return a JSON intent.",
  "schema": {
    "intent": "string (open_app|close_app|set_scene|search|ai_query|system|unknown)",
    "target": "string (app name, scene name, or query text)",
    "confidence": "number 0-1"
  }
}
```

Example mappings:

| Utterance | Intent | Target |
| --------- | ------ | ------ |
| "open terminal" | open_app | terminal |
| "go home" | set_scene | home |
| "lock the screen" | system | lock |
| "what's the weather?" | ai_query | "what's the weather?" |
| "show my apps" | set_scene | launcher |

---

## Plugin Architecture

Plugins are WASM modules loaded by `limen-core`. They can be written in any language
that compiles to WASM (Rust, Python via py2wasm, Go via tinygo, AssemblyScript, etc.).

Plugin manifest (`limen-plugin.toml`):

```toml
[plugin]
name = "weather-widget"
version = "0.1.0"
author = "waldiez"
wasm = "weather_widget.wasm"
permissions = ["network", "display"]

[commands]
get_weather = "GetWeather"
```

Plugin SDK (Rust):

```rust
use limen_plugin_sdk::prelude::*;

#[plugin_init]
fn init(ctx: &PluginContext) -> Result<()> {
    ctx.register_command("get_weather", handle_weather)?;
    Ok(())
}

#[command_handler]
async fn handle_weather(req: CommandRequest) -> CommandResponse {
    // Fetch weather and return a widget update event.
    CommandResponse::widget_update("weather", json!({ "temp": 22, "icon": "sunny" }))
}
```

---

## WID Integration

Every significant operation in LIMEN OS is timestamped with a WID:

```text
Session start:  20260307T143052.0000Z-node01-a3f91c  (HLC, node = hostname)
Voice command:  20260307T143115.1234Z-a3b2c1
AI response:    20260307T143116.0042Z-d4e5f6
App launched:   20260307T143120.0000Z-c7d8e9
```

This gives us:

- Causality ordering across distributed components
- Human-readable audit log
- Collision-resistant IDs for all events
- Correlation IDs for debugging (voice_cmd.id → ai_response.caused_by)

---

## Performance Targets

| Metric | Target |
| ------ | ------ |
| Shell startup (Tauri cold start) | < 1.5s |
| Scene transition | < 600ms (incl. animation) |
| Voice wake-word latency | < 100ms |
| STT transcription (Whisper ONNX) | < 500ms for 5s clip |
| AI intent classification | < 200ms (Groq fallback) |
| TUI startup | < 50ms |
| Mobile companion connect | < 2s |
| App launch command to process | < 300ms |

---

## Accessibility

LIMEN OS prioritizes accessibility as a core feature, not an afterthought:

- **Voice-only mode**: 100% of functionality accessible by voice
- **High contrast themes**: All scenes have a high-contrast variant
- **Screen reader**: Babylon.js GUI elements have ARIA labels
- **Reduced motion**: All animations respect `prefers-reduced-motion`
- **Font scaling**: All text scales with system font size
- **TUI parity**: Every GUI feature available in TUI (SSH accessible)
- **Color blind**: Palette tested for deuteranopia/protanopia/tritanopia
