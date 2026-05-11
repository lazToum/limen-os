# LIMEN OS — Known Issues

> Tracked here during active development. Move to GitHub Issues when repo goes public.

---

## Open

### [VOICE-01] TTS not speaking AI responses
**Status**: Fixed (2026-03-14) — but needs verification in Tauri mode
**Symptom**: You can see Limen's reply in the notification tray but cannot hear it.
**Root cause**: `window.speechSynthesis.speak()` was only wired as a listener for the Tauri event
`limen://tts/speak`. In browser/web mode (io.what-if.io) Tauri events never fire. In Tauri mode,
`invoke("voice_command")` returns the response text but the `.then()` handler only pushed a
notification — it never called `speechSynthesis.speak()` directly.
**Fix applied**: `App.tsx` — in `voice_command.then()` handler: cancel any queued utterance, build a
`SpeechSynthesisUtterance`, prefer a non-local English voice, and call `speechSynthesis.speak(utt)`
immediately after pushing the notification.
**Remaining risk**: Voices list (`getVoices()`) may be empty on first call (browser async loading).
If still silent, add a `speechSynthesis.onvoiceschanged` retry.

---

### [UI-01] Setup wizard — wrong background during theme selection (StyleStep)
**Status**: Fixed (2026-03-14)
**Symptom**: Clicking a paradigm card during setup changed the live Babylon.js scene / shell
background behind the glass modal, making the wizard look broken.
**Root cause (a)**: `handleSelectParadigm` in `SetupWizard.tsx` called `applyParadigm(p)` on every
card click, live-changing the shell before the wizard was dismissed.
**Root cause (b)**: Mood CSS filters (`filter: sepia / brightness / saturate`) were scoped to
`body`, so they applied to the entire document including the wizard overlay.
**Fix applied**:
  1. `SetupWizard.tsx` — removed `applyParadigm(p)` from `handleSelectParadigm`; deferred the call
     to `handleLaunch` (fires only when user clicks "Launch").
  2. `App.tsx` — moved `<SetupWizard>` outside the `<div className="limen-shell">` wrapper (React
     Fragment) so it is never inside any mood-filtered container.
  3. `global.css` — changed mood filter selectors from `body { filter: … }` to
     `.limen-shell { filter: … }` so the wizard (now a sibling of `.limen-shell`) is unaffected.

---

## Closed / Won't Fix

| ID | Description | Disposition |
|----|-------------|-------------|
| CLIP-01 | `single_match` in `server.rs:323` | Fixed |
| CLIP-02 | `needless_borrow` in `relay.rs:323` | Fixed |
| CLIP-03 | `redundant_closure` in `relay.rs:411` | Fixed |
| CLIP-04 | `manual_strip` in `tui/app.rs:540` | Fixed |
| CLIP-05 | `collapsible_if` in `tui/ipc/mod.rs` and `shell/lib.rs` | Fixed |
| CLIP-06 | `useless_format` in `commands/mod.rs:85` | Fixed |
| FLUTTER-01 | Missing `assets/images/` and `assets/icons/` dirs | Fixed (`.gitkeep`) |
| TS-01 | Zustand v5 subscribe signature (`subscribeWithSelector` not needed) | Fixed |
| TS-02 | `Date.now()` in `useRef` init (hook purity) | Fixed |
| TS-03 | Ref update during render in `useMoodSync` | Fixed |
| TS-04 | `setState` in `useEffect` without guard in `LimenMind` | Fixed |
| TS-05 | Duplicate `border` key in inline style object | Fixed |
| TS-06 | Template literal variables `${date}` shadowing outer scope | Fixed |
| TS-07 | Extra `{` from collapsed-if edit in `lib.rs` | Fixed |
