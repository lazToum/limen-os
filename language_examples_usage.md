# LIMEN OS — Language Examples & Usage Patterns

> Quick reference for language idioms, API usage, and "how do I do X" patterns
> used across the Limen OS codebase. Helps Claude and humans stay consistent.

---

## TypeScript / React

### Zustand v5 — subscribe to state changes

```ts
// ✅ Correct (Zustand v5 default, no middleware needed)
useShellStore.subscribe((state, prevState) => {
  if (state.activeMood !== prevState.activeMood) {
    doSomething(state.activeMood);
  }
});

// ❌ Wrong — requires subscribeWithSelector middleware
useShellStore.subscribe((s) => s.activeMood, callback);
```

### React — avoid ref mutation during render

```ts
// ✅ Correct
const myRef = useRef<Thing | null>(null);
useEffect(() => {
  myRef.current = thing;
}, [thing]);

// ❌ Wrong — mutates ref during render
function MyComponent({ thing }: Props) {
  myRef.current = thing; // linter error
  ...
}
```

### React — avoid setState inside useEffect without guard

```ts
// ✅ Correct — reset step when lesson changes via callback
const handleLesson = useCallback((i: number) => {
  setLesson(i);
  setStep(0);
}, []);

// ❌ Wrong — causes double render, linter warning
useEffect(() => {
  setStep(0);
}, [lesson]);
```

### React — avoid Date.now() in useRef initializer

```ts
// ✅ Correct
const lastActivityRef = useRef<number>(0);
useEffect(() => {
  lastActivityRef.current = Date.now();
}, []);

// ❌ Wrong — side effect during render
const lastActivityRef = useRef<number>(Date.now());
```

### Template literals — variable names matching outer scope

```ts
// ✅ Correct — use explicit string if not interpolating
const anatomy = "YYYYMMDD T HHMMSS . 0001 Z - a3f9c2";

// ❌ Wrong — ${date} resolves to an outer variable named `date`
const anatomy = `${date}T${time}.${seq}Z-${otp}`;
//                ^^^^ JS expression, not literal text
```

---

## WID (Waldiez ID)

### Format

```
YYYYMMDDTHHMMSS.0001Z-a3f9c2
│              │    │ │
│              │    │ └─ OTP suffix: 3 bytes → 6 hex chars (crypto.getRandomValues)
│              │    └─── Z = UTC marker (always present, always literal)
│              └──────── sequence: 4-digit zero-padded counter (zeroPad / printf %04d)
└─────────────────────── ISO-8601 compact date+time (no separators)
```

### TypeScript generation

```ts
function generateWID(): string {
  const now = new Date();
  const date = now.toISOString().replace(/[-:T]/g, "").slice(0, 15); // YYYYMMDDTHHmmss (keep T)
  // Actually: ISO compact = no separators except literal T
  const compact = now.toISOString()
    .replace(/-/g, "")
    .replace(/:/g, "")
    .split(".")[0]; // "20260314T082503"
  const seq = String(++counter % 10000).padStart(4, "0");
  const otp = Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${compact}.${seq}Z-${otp}`;
}
```

### Rust generation (via wid crate)

```rust
use wid::HLCWidGen;
let wid = HLCWidGen::next(node_id);
event.id = wid.to_string(); // "20260314T082503.0001Z-a3f9c2"
```

### .tic / .toc — self-healing pattern

```bash
# Mark session start
echo $(wid) > .tic

# Mark session end (paired)
echo $(wid) > .toc

# If .tic exists but .toc does not → session was interrupted → auto-resume or alert
[ -f .tic ] && [ ! -f .toc ] && echo "Unclean shutdown detected"
```

---

## Rust

### Clippy — prefer `if` over single-arm `match`

```rust
// ✅ Correct
if intent.target.as_str() == "lock" {
    lock_session();
}

// ❌ Clippy: single_match
match intent.target.as_str() {
    "lock" => lock_session(),
    _ => {}
}
```

### Clippy — avoid needless borrows

```rust
// ✅ Correct
let id = src.clone();

// ❌ Clippy: needless_borrow
let id = (&src).clone();
```

### Clippy — avoid redundant closures

```rust
// ✅ Correct
models.iter().filter_map(parse_relay_model_id).collect()

// ❌ Clippy: redundant_closure
models.iter().filter_map(|m| parse_relay_model_id(m)).collect()
```

### Clippy — prefer strip_prefix over manual slicing

```rust
// ✅ Correct
line.strip_prefix("Categories=").map(str::to_string)

// ❌ Clippy: manual_strip
if line.starts_with("Categories=") { Some(line[11..].to_string()) } else { None }
```

---

## Browser TTS (SpeechSynthesis)

```ts
// Speak a string in both Tauri and browser/web mode
function speak(text: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel(); // clear queue
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.05;
  utt.pitch = 1.0;
  // Prefer a non-local English voice (sounds more natural)
  const voices = window.speechSynthesis.getVoices();
  const preferred =
    voices.find((v) => v.lang.startsWith("en") && !v.localService) ??
    voices.find((v) => v.lang.startsWith("en")) ??
    voices[0];
  if (preferred) utt.voice = preferred;
  window.speechSynthesis.speak(utt);
}

// NOTE: getVoices() may be empty on first call.
// If so, retry on voiceschanged:
if (window.speechSynthesis.getVoices().length === 0) {
  window.speechSynthesis.onvoiceschanged = () => speak(text);
} else {
  speak(text);
}
```

---

## CSS — Scoping filters to avoid bleed-through

```css
/* ✅ Scope to shell container — does not affect sibling overlays */
:root[data-mood="ghost"] .limen-shell { filter: brightness(0.65) grayscale(0.6); }

/* ❌ Applies to everything including fixed overlays */
:root[data-mood="ghost"] body { filter: brightness(0.65) grayscale(0.6); }
```

> **Rule**: Any CSS that would apply to `body` or `:root` and could affect full-screen overlays
> (setup wizard, modals, dialogs) should instead target `.limen-shell` or a more specific selector.
> Move full-screen overlays **outside** `.limen-shell` in the React tree when possible.

---

## Tauri v2 — Dynamic import pattern

```ts
// Always import Tauri APIs dynamically so the app degrades gracefully in browser mode
import("@tauri-apps/api/core")
  .then(({ invoke }) => invoke<ReturnType>("command_name", { arg }))
  .then((result) => handleResult(result))
  .catch(() => handleFallback());
```

---

## Bun workspaces — adding a new package

```json
// package.json (root)
{
  "workspaces": [
    "packages/*",
    "apps/shell",
    "apps/player"   // ← add here
  ]
}
```

Then: `bun install` from repo root to link.
