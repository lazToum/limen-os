# PARADIGMS — Behavioral Theming

Paradigms in LIMEN OS are more than visual themes — they are **holistic behavioral shifts**.
Every paradigm changes the rendering stack, the AI personality, the input preferences,
the sound design, and the typography simultaneously.

---

## 1. What a Paradigm Is

A paradigm is a first-class citizen: it can be changed by voice, by face emotion, by
manual preference, or triggered automatically by context (time of day, detected frustration,
hardware capabilities).

Each paradigm is a `.json` file that defines five dimensions:

| Dimension | What it controls |
| --------- | ---------------- |
| `visual`  | Babylon.js scene preset, GLSL shaders, color palette, font family, animation speed |
| `sound`   | Notification tones, wake-word chime style, ambient background loops, TTS voice |
| `behavior`| AI response verbosity, input tier preference, frustration threshold |
| `motion`  | Particle density, transition duration, idle animation strength |
| `access`  | Forced high-contrast, font scale override, reduced-motion flag |

---

## 2. Paradigm Schema (JSON)

```json
{
  "$schema": "https://limen-os.waldiez.dev/schemas/paradigm/v1.json",
  "id": "nebula",
  "version": "1.0.0",
  "label": "Nebula",
  "description": "Deep space. 3D aurora. Creative and expansive.",

  "visual": {
    "scene_preset": "nebula",
    "background": "#020510",
    "accent_primary": "#6366f1",
    "accent_secondary": "#8b5cf6",
    "font_ui": "Inter Variable",
    "font_mono": "JetBrains Mono",
    "animation_speed": 1.0,
    "particle_density": 1.0,
    "shader_quality": "ultra"
  },

  "sound": {
    "wake_chime": "nebula_chime.ogg",
    "notify_tone": "soft_ping.ogg",
    "ambient_loop": "deep_space_hum.ogg",
    "tts_voice": "kokoro_en_nova",
    "volume_ui": 0.6
  },

  "behavior": {
    "ai_personality": "conversational",
    "ai_verbosity": "rich",
    "input_tier_default": 2,
    "frustration_threshold": 3,
    "idle_timeout_s": 300,
    "auto_suggest_calm": true
  },

  "motion": {
    "transition_ms": 500,
    "particle_density": 1.0,
    "idle_drift": true
  },

  "access": {
    "high_contrast": false,
    "font_scale": 1.0,
    "reduced_motion": false
  }
}
```

---

## 3. Built-in Paradigms

### `nebula` — Default Creative

> *"You are standing inside a living star cluster."*

- Babylon.js 3D scenes at full quality. Aurora particle systems. Orbital widget dock.
- AI is warm, expressive, uses metaphor. TTS voice: `kokoro_en_nova`.
- Input default: Voice (Tier 2).
- Transition animations: 500ms ease-in-out.
- Triggers: Default; or voice *"go creative"*, *"show the universe"*.

---

### `minimal` — Focus / Recovery

> *"Nothing exists except what you're working on."*

- Pure black background. No 3D. Flat icons only. Single accent color.
- AI is terse. Responds in one or two sentences maximum.
- Font: `JetBrains Mono`. No ambient animations.
- Triggers: Frustration detected at `high` level; voice *"minimal mode"*; `win`+`M` shortcut.
- Auto-reverts to previous paradigm after 30 minutes of calm.

```json
{
  "id": "minimal",
  "visual": { "scene_preset": "flat", "animation_speed": 0.0, "particle_density": 0.0 },
  "behavior": { "ai_verbosity": "terse", "input_tier_default": 4 },
  "sound": { "ambient_loop": null, "volume_ui": 0.3 }
}
```

---

### `unix` — Developer Mode

> *"Amber on black. The terminal is king."*

- Green/amber on `#0a0a0a`. Monospace everything. Scanline shader overlay (subtle).
- Window chrome: minimal title bar only.
- AI defaults to structured output (bullet points, code blocks). No filler phrases.
- Input preference: Keyboard (Tier 4) and TUI.
- Keyboard shortcuts surface in every UI element.
- Triggers: Voice *"developer mode"*, *"give me the terminal"*; automatic when SSH session detected.

```json
{
  "id": "unix",
  "visual": { "scene_preset": "tty", "accent_primary": "#d97706", "font_ui": "JetBrains Mono" },
  "behavior": { "ai_personality": "technical", "ai_verbosity": "structured", "input_tier_default": 4 }
}
```

---

### `dos` — Retro Fun

> *"CGA palette, chunky fonts, glorious beeps."*

- 16-color CGA/EGA palette. `VGA` or `IBM BIOS` bitmap font.
- UI windows use beveled ASCII-box chrome.
- Boot chime on session start. Keypress beeps optional.
- AI speaks in formal 1980s computer-style ("PROCESSING YOUR REQUEST... DONE.").
- Triggers: Voice *"retro mode"*, *"make it old school"*.

---

### `win3` — Classic Comfort

> *"Gray beveled panels. The early web. Familiar and safe."*

- Windows 3.x platinum gray. `Chicago` / `MS Sans Serif` bitmap fonts.
- Taskbar at bottom. Classic start-button feel (≡ menu).
- No 3D. No particles. Simple icon grid.
- AI is friendly, patient, verbose. Good for accessibility training sessions.
- Triggers: Voice *"classic mode"*, *"make it look familiar"*; auto-suggested for new/elderly users.

---

### `macos7` — Platinum Era

> *"Menubar. Chicago font. Everything in a window."*

- Platinum/Charcoal color scheme. Top menubar. Tearoff menus.
- Window chrome with traffic lights. Desktop with a single-click launcher.
- TTS voice: calm `piper_en_gb`.
- Triggers: Voice *"Mac mode"*, *"Apple style"*.

---

### `calm` — Accessibility / Low Stimulation

> *"Soft. Still. Nothing blinks."*

- Pastel gradients. No animations of any kind. Large fonts.
- No particles, no transitions (instant cuts only).
- AI uses simple vocabulary. Short sentences. Confirmation on every action.
- All content passes WCAG 2.2 AA at minimum.
- Triggers: Face emotion `tired` or `stressed` for > 2 minutes; voice *"calm mode"*, *"slow down"*;
  auto-suggested after midnight.

```json
{
  "id": "calm",
  "visual": { "animation_speed": 0.0, "particle_density": 0.0, "shader_quality": "low" },
  "behavior": { "ai_verbosity": "simple", "frustration_threshold": 1 },
  "access": { "high_contrast": true, "font_scale": 1.3, "reduced_motion": true }
}
```

---

## 4. Switching Paradigms

### By Voice

```text
"Hey Limen, switch to minimal mode"
"Make it look like a terminal"
"I want calm mode"
"Go back to nebula"
```

The intent parser maps these to `{ "intent": "set_paradigm", "target": "minimal" }`.

### By Face Emotion

The vision subsystem emits `face_emotion` events. The paradigm engine reacts:

| Detected state | Duration | Action |
| -------------- | -------- | ------ |
| `tired`        | > 2 min  | Suggest `calm` |
| `stressed`     | > 1 min  | Increase `calm` suggestion weight |
| `focused`      | > 5 min  | Auto-apply `minimal` (with confirmation) |
| `happy`/`neutral` | —     | No change |

### Programmatically (IPC)

```json
{ "command": "set_paradigm", "id": "unix", "transition_ms": 400 }
```

---

## 5. Custom Paradigms

Drop a `my-paradigm.json` in `~/.config/limen/paradigms/` — it will be discovered automatically.
Only fields you define override the defaults; the rest inherit from `nebula`.

```json
{
  "$schema": "https://limen-os.waldiez.dev/schemas/paradigm/v1.json",
  "id": "my-ocean",
  "label": "Ocean Depths",
  "extends": "nebula",
  "visual": {
    "accent_primary": "#06b6d4",
    "accent_secondary": "#0891b2",
    "background": "#020c14"
  },
  "sound": { "ambient_loop": "deep_ocean.ogg" }
}
```

---

## 6. Implementation Notes

- Paradigm state lives in the Zustand `shellStore` as `activeParadigm: ParadigmId`.
- Babylon.js scene preset is applied via `SceneManager.applyParadigm(paradigm)`.
- CSS custom properties (`--accent-primary`, `--font-ui`, etc.) are set on `<html>` root —
  all React components inherit automatically.
- Sound is managed by the `AudioEngine` singleton (Web Audio API).
- Transitions between paradigms use a 200ms opacity fade on the root canvas.
