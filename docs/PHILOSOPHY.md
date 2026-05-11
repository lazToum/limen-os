# LIMEN OS — Core Philosophy
<!-- cspell: disable -->

## The Grandmother Test

> *"After #-year of living with this system — fuck it, you don't understand me,
> like my old partner. Give me the TUI, bring me a chair, make me coffee,
> bring me a keyboard and a mouse too. I'll do it manually."*

This is the **success condition** for LIMEN OS.

If a woman born in 1930 — who grew up with washing machines and rotary phones,
not computers — can pick up this device, argue with it in natural language,
get frustrated when it fails her, and still find her way to what she needs
(even if that means "give me the keyboard") — we've built the right thing.

The 1930 → now arc is not a gimmick. It is the **design constraint**:

- A **washing machine** is operable by anyone. One dial. Done.
- A **smartphone** requires 20 years of cultural context to use.
- LIMEN OS must be as approachable as the washing machine,
  as capable as the smartphone, and honest enough to hand you the manual
  controls when it fails.

---

## The Failure Mode Is a Feature

When the AI fails — and it will fail, like any partner fails — the system must:

1. **Detect the failure** (frustration in voice, face, repeated retries)
2. **Acknowledge it** ("I hear you, let me get out of your way")
3. **Gracefully degrade** to the next simpler interface
4. **Never be a dead end**

The grandmother's "fuck it" is not a bug report. It is the system working correctly.
A system that drives you to the keyboard is better than one that drives you to
the window.

---

## TRANSPORT — The Input Hierarchy

**TRANSPORT** is the abstraction for how the user communicates with the system.
It is not a single mode — it is a **priority cascade**, always available, always
degrading gracefully:

```text
TIER 1 — Ambient (always on, no deliberate action needed)
  Face recognition       → who is present, emotional state, attention
  Ambient sound          → activity context, frustration level

TIER 2 — Expressive (intentional but natural)
  Voice                  → primary command surface
  Gesture (MediaPipe)    → point, swipe, wave

TIER 3 — Deliberate (requires physical engagement)
  Touch                  → tap, drag on touchscreen
  TUI                    → SSH terminal, full feature parity

TIER 4 — Manual (explicit fallback)
  Keyboard               → typing, shortcuts
  Mouse                  → point and click
```

The system always knows which tier is active and offers the next one down
when frustration is detected or when the current tier fails three times.

**Frustration signals:**

- Voice: raised pitch, clipping/distortion, profanity, "you don't understand"
- Face: furrowed brow, clenched jaw, gaze aversion
- Behavior: same command retried 3+ times, rapid input changes
- Explicit: "give me the keyboard", "bring me the TUI", "fuck it"

**On frustration detection → system response:**

```text
mild  → "Let me try a different way. Did you mean X?"
medium → "I'm not getting this right. Want me to show you options?"
high  → "I'll get out of your way. [opens TUI / enables keyboard mode]"
```

---

## Paradigms — The Style/Mood/Theme System

LIMEN OS is not locked to one aesthetic. The system can **shift its entire
visual and interaction paradigm** — same underlying power, different skin,
different feel. Paradigms are first-class citizens, changeable by voice,
face emotion, or manually.

| Paradigm  | Visual Reference | When |
| :-------- | ---------------- | ---- |
| `nebula`  | Deep space, Babylon.js 3D, aurora | Default, ambient, creative |
| `minimal` | Pure black + text, no 3D | Focus mode, low-power, frustration recovery |
| `unix`    | Green/amber on black, xterm aesthetic | Developer mode, TUI-forward |
| `dos`     | CGA/EGA palette, chunky font, beeps | Retro fun, nostalgia |
| `win3`    | Gray beveled panels, bitmap fonts | Classic feel, grandmother comfort |
| `macos7`  | Platinum/Chicago, menubar | Alternative classic |
| `calm`    | Soft gradients, no animations | Accessibility, low-stimulation |

**Changing paradigm:**

- Voice: *"switch to terminal mode"*, *"make it look old school"*, *"calm down"*
- Face: detected tired/stressed → auto-suggest `calm`
- Manual: settings UI, keyboard shortcut

**The paradigm is not just cosmetic.** It changes:

- Babylon.js scene style (or disables 3D entirely)
- Font, color palette, animation speed
- Input tier preference (unix/dos defaults to keyboard tier)
- Sound design (or silence)
- AI response style (terse in `unix`, conversational in `nebula`)

---

## The Washing Machine Principle

Every action must have a **clear, recoverable, physical analog**:

- Turn on → wake word / open lid
- Select program → voice intent / dial (scene selector)
- Start → say "go" / press big button
- Pause → say "stop" / press again
- Error → alarm + plain language + one clear next step
- Manual override → always accessible, never hidden

The system must never:

- Require remembering a command
- Fail silently
- Present a blank screen with no affordance
- Make the user feel stupid

---

## The #-Year Relationship

This system is designed to be lived with, not just used.

After #-year of shared context:

- It knows your routines without asking
- It predicts needs from ambient signals
- It has personality — consistent, honest, sometimes wrong
- It earns the right to be scolded, like any long relationship

The grandmother's "like my old partner" is the highest compliment.
It means the system has been present long enough to disappoint her in
familiar ways — and she still comes back to it.

---

## Implementation Priorities (derived from philosophy)

1. **Never be a dead end** — TUI fallback always works, keyboard always works
2. **Frustration detection** before anything else in the voice pipeline
3. **Paradigm switching** is a first-class feature, not a settings page
4. **TRANSPORT tier** is always visible to the system, never assumed
5. **Graceful degradation** > feature completeness
