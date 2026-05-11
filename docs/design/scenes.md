# SCENES — Visual State Specification

LIMEN OS organizes its interface into distinct **Babylon.js Scenes**. Each scene is
a full render context with its own camera, lights, meshes, and GUI layer. Only one
scene is "active" at a time, though the previous scene is kept warm in memory for
instant back-navigation.

---

## Scene Inventory

| Scene | ID | Trigger | Resident? |
| ----- | -- | ------- | --------- |
| Home | `home` | Wake from greeter / "go home" | Always |
| Greeter | `greeter` | Session start / lock | Always |
| Launcher | `launcher` | "Show my apps" / Start menu | Lazy |
| Ambient | `ambient` | Idle timeout | Lazy |
| Voice | `voice` | Wake word detected | Lazy overlay |
| Focus | `focus` | App maximized | Lazy |

---

## 1. Home Scene

The **primary resident scene** — the desktop you live in.

### Visual

- **Background**: Slowly drifting particle nebula (density controlled by paradigm).
- **Widget dock**: Orbital ring of app icons, auto-arranged, floats at 20% from bottom.
  Widgets snap to orbit positions; dragging re-orders them.
- **Wallpaper layer**: Static or animated (Babylon.js particle system or GLSL shader),
  configurable per paradigm.
- **Active windows**: Rendered as React DOM overlays on top of the Babylon canvas.
  Windows have translucent glass chrome (backdrop-filter blur).

### Camera

- **Orthographic top-down** in `minimal`/`unix` paradigms.
- **Slight perspective** (FOV 40°, z-tilt 3°) in `nebula`/`calm` for depth.

### State

```typescript
interface HomeSceneState {
  wallpaper: WallpaperConfig;
  widgetPositions: Record<string, Vec2>;
  openWindows: WindowState[];
  activeWindowId: string | null;
}
```

### Transitions In

- From `greeter`: 600ms cross-dissolve + slight camera zoom-out.
- From `launcher`: App icon flies to origin; rest of launcher grid fades.
- From `ambient`: Ambient particles slow, re-configure to home layout (400ms).

---

## 2. Greeter Scene

The **session start / lock screen**.

### Visual

- **Aurora curtain**: GLSL fragment shader — vertical bands of color (paradigm palette)
  that sway slowly.
- **Time display**: Large clock, center stage. Seconds pulse with a soft glow.
- **User avatar**: Detected via MediaPipe face recognition or fallback to icon.
- **Voice indicator**: Subtle pulsing ring around the clock — always listening for the wake word.

### Interactions

- **Face recognition**: Auto-unlock when the registered user is detected with high confidence (≥ 0.92).
- **Voice**: "Hey Limen, unlock" → PIN/passphrase prompt via voice.
- **Touch/click**: PIN pad or passphrase keyboard.
- **TUI**: On SSH connect, session proceeds directly without greeter.

### State

```typescript
interface GreeterSceneState {
  faceRecognitionActive: boolean;
  unlockAttempts: number;
  lastSeenUserId: string | null;
}
```

### Lockout Policy

After 5 failed unlock attempts: 60-second cooldown with escalating backoff.
The system speaks: *"Too many attempts. I'll try again in 60 seconds."*

---

## 3. Launcher Scene

The **application grid** — what you see when you say *"show my apps"*.

### Visual

- **3D card grid**: App icons rendered as Babylon.js GUI planes, arranged in a
  responsive hex-grid (adapts to window count).
- **Category tabs**: Pinned at top — All, System, Games, Media, AI, Settings.
- **Search bar**: Auto-focuses on open; filters cards in real-time (fuzzy match).
- **Voice search**: Spoken while launcher is open → filters immediately.

### Camera

- **Perspective** (FOV 50°), camera positioned slightly above center looking down-forward.
- On hover: card under cursor lifts 4px with a shadow bloom. On click: card zooms to fill
  screen then transitions to Focus scene.

### Interactions

```text
Voice: "Open [app name]"         → launches app, closes launcher
Voice: "Close"                   → closes launcher, returns to Home
Keyboard: type to search         → live filter
Keyboard: Enter                  → opens first result
Keyboard: Escape / Win           → closes launcher
```

### Transitions

- **Open**: Home widgets orbit inward (200ms), launcher grid fans out from center (300ms stagger).
- **Close**: Grid cards collapse inward (200ms), home scene resumes.
- **Launch**: Selected card expands to fullscreen (300ms), then Focus scene cross-fades in.

---

## 4. Ambient Scene

The **screensaver** — activates after idle timeout (default: 5 minutes).

### Visual

Three ambient modes (cycles or stays fixed per preference):

| Mode | Description |
| ---- | ----------- |
| `cosmos` | Slow flythrough of 3D star field. Clock rendered as constellation lines. |
| `generative` | GLSL generative art — flowing noise fields, reaction-diffusion. |
| `clock` | Minimal full-screen clock (paradigm palette). Weather overlay if network available. |

### Wake Conditions

Any of the following returns to Home scene immediately:

- Wake word detected
- Face present (MediaPipe person detection)
- Touch / mouse move / key press
- Mobile companion activity

### State Preservation

Home scene state is fully preserved — ambient is a **non-destructive overlay**.
Windows remain open, audio continues.

---

## 5. Voice Scene

A **non-blocking overlay** that appears during active voice interaction.
It does not replace the current scene — it renders on top.

### Visual

- **Waveform orb**: A glowing sphere that responds to microphone amplitude in real-time.
  Spikes outward on loud input, contracts during silence.
- **Transcript strip**: Rolling text at the bottom showing live partial transcription.
- **Intent chip**: Once intent is classified, a pill appears: `open_app: terminal` or
  `ai_query: "what's the weather?"`.
- **Confidence ring**: Colored arc around the orb — green (high confidence) to amber (uncertain).

### Lifecycle

```text
wake_word_detected
  → VoiceScene.show() [100ms fade-in]
    → waveform animates
    → transcript appears (streaming)
      → intent classified
        → action dispatched
          → VoiceScene.hide() [200ms fade-out]
            → result shown as notification
```

### Error State

If STT fails or confidence < 0.6:
- Orb turns amber
- Text: *"I didn't catch that — try again?"*
- After 2 failures: *"Want to type it instead?"* — keyboard prompt appears in Voice overlay.

---

## 6. Focus Scene

Activated when an app is **maximized**. Provides minimal chrome to reduce distraction.

### Visual

- Window fills the full canvas (minus a thin title bar, 28px).
- **Home widget dock**: Hidden. Single icon in top-right corner to return to Home.
- **Background**: Black or very dark paradigm color — no particles, no wallpaper.
- **Title bar**: App name + icon. Window controls (minimize, restore, close).

### Quick-Return

- `Alt`+`Tab`: Cycle open apps (Focus scene renders the switcher overlay).
- Voice: *"go home"*, *"minimize"*, *"switch to [app]"*.
- Swipe left from edge (touch/gesture).

---

## 7. Scene Memory Budget

```text
Always resident (never disposed):
  greeter, home

Lazy-loaded, kept warm for 2 minutes:
  launcher, ambient, voice, focus

Disposed after 5 minutes inactivity:
  launcher, ambient, focus
  (voice is lightweight and always re-created)
```

Memory pressure eviction order: `ambient` → `launcher` → `focus`.

---

## 8. Scene Transition Matrix

| From → To | Method | Duration |
| --------- | ------ | -------- |
| greeter → home | cross-dissolve + camera zoom | 600ms |
| home → launcher | orbit collapse + card fan | 500ms |
| launcher → home | card collapse | 300ms |
| home → ambient | fade | 400ms |
| ambient → home | instant + fade | 200ms |
| home → focus | app card expand | 300ms |
| focus → home | reverse expand | 300ms |
| any → voice | overlay fade-in | 100ms |
| voice → any | overlay fade-out | 200ms |

All transitions respect `prefers-reduced-motion`: when set, all durations collapse to 0ms
(instant cuts) except the voice overlay which retains 50ms to avoid jarring pops.
