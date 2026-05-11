# TOS — True OS Specification
## aka TOOS — The OuroS Operating System

> *"An OS that knows it's an OS."*
> `waldiez/patato5` — proud member of the patato# group

---

## What is a True OS?

A **True OS** (TOOS) is not a shell. It is not a window manager. It is not a theme.

A True OS is an **intentional, living operating environment** — a system that:

1. **Knows time** — not just wall-clock time, but *experiential* time (TimeBand, OsMood, flow depth).
2. **Heals itself** — `.tic`/`.toc` self-repairing sessions; no lost state; every event is WID-stamped.
3. **Hears you** — voice is the primary interface; keyboard/mouse are fallback.
4. **Thinks with you** — not a chatbot overlay, but an AI-native shell where every surface is LLM-augmented.
5. **Is beautiful by default** — A+++ UDX (User Developer eXperience) is non-negotiable.
6. **Eats its own tail** — OuroS: it observes itself, heals itself, evolves itself.

---

## TOOS vs Traditional OS

| Property | Traditional OS | TOOS / OuroS |
|----------|----------------|--------------|
| Primary input | Keyboard + mouse | Voice → gesture → touch → keyboard |
| Time awareness | System clock only | TimeBand + OsMood + flow depth |
| AI | App you launch | Woven into every surface |
| Identity | Username/UID | WID (every event, session, transaction) |
| Recovery | Reboot | `.tic`/`.toc` self-healing, always |
| Aesthetics | Theme you apply | Mood you live in |
| Plugins | Root-or-nothing | WASM sandbox, any language |
| State | Files + registry | WID-stamped event log (append-only) |
| Rendering | Compositor | Babylon.js WebGL/WebGPU scenes |
| Multi-surface | Desktop only | Desktop + TUI + Mobile + Voice |

---

## TOOS Axioms

### Axiom 1 — The Ouroboros Principle
> *The OS must be able to describe and repair itself.*

Every process is observable. Every session has a `.tic` (start) and `.toc` (end). If `.toc` is missing, the OS auto-heals. No silent failures. No orphaned state.

### Axiom 2 — WID Primacy
> *If it happened, it has a WID.*

Events, sessions, windows, notifications, transactions, AI interactions, plugin calls — all carry a `WID` (`YYYYMMDDTHHMMSS.0001Z-a3f9c2`). The WID is the source of truth. No secondary `created_at` columns. No UUID v4 without history.

### Axiom 3 — Time Is Experience
> *The OS should feel different at 07:00 than at 22:00.*

`TimeBand` → `OsMood` → CSS vars + Babylon scene + audio EQ + notification style. Dawn is amber and slow. Morning is cyan and sharp. Night is dim and silent. The OS breathes with you.

### Axiom 4 — Voice Is Primary
> *The most natural interface is speaking. Everything else is a fallback.*

`"Hey Limen, open the terminal"` is the canonical way. Click and type are accommodated, never privileged. STT is local-first (Whisper ONNX → WebSpeech fallback). TTS is always on.

### Axiom 5 — AI Is Native
> *AI is not a feature. It is the shell's nervous system.*

Intent routing, mood inference, content summarization, voice parsing, code completion, error explanation — all run through the multi-model router (Claude → GPT-4o → Gemini → Deepseek → Groq → local). The OS never presents a raw error without an interpreted explanation.

### Axiom 6 — Beauty Is Correctness
> *A broken interface is a bug. An ugly interface is a bug.*

UDX (User Developer eXperience) is a first-class deliverable. `make check` enforces code quality. The design system (mood CSS vars, Babylon scenes, motion choreography) enforces visual quality. Grade: A+++.

### Axiom 7 — The Ecosystem Is the OS
> *A TOOS does not run in isolation.*

Limen OS is one node in the waldiez ecosystem:
- `waldiez/wid` — identity layer (WID generator, HLC clock)
- `waldiez/bank` — financial ledger (WID-stamped transactions)
- `waldiez/player` — media playback layer
- `waldiez/wef` — fall detection / MQTT alerting
- `patato#` — the iteration series; each `patato<N>` is a full OS generation

---

## OuroS — The Name

**OuroS** = Ouroboros + OS

The **Ouroboros** (ουροβόρος — "tail-devourer") is the ancient symbol of a snake eating its own tail:
- Infinity and continuity (no start, no end)
- Self-reference (the OS that knows itself)
- Self-healing (`.tic`/`.toc` — it always recovers from where it left off)
- The S-curve of the snake's body = the **S** of Limen

The ouroboros gradient — **purple (tail/past) → cyan (head/future)** — matches the Limen OS mood system: the past is a warm purple glow, the future is a cool cyan spark, and the system continuously eats its own history to move forward.

---

## patato# — The Iteration Series

```
patato1 — concept / proof of concept
patato2 — voice pipeline prototype
patato3 — Tauri shell v1
patato4 — Babylon.js integration
patato5 — CURRENT: MoodEngine + LimenMind + OuroS brand + True OS spec ← you are here
patato6 — next: full WID ledger + waldiez/bank + LimenFin live
patato7 — mobile companion + wid-playground public
...
patato∞ — OuroS fully self-describes, self-heals, self-deploys
```

Each iteration is a full working OS, not a branch. `patato5` does not deprecate `patato4` — it transcends it.

---

## waldiez Ecosystem Membership

Limen OS / OuroS is a **proud member of the waldiez ecosystem**.

Membership means:
- All IDs are WIDs (no UUID squatting)
- All time is Limen Time (WID timestamps + TimeBand)
- All events are observable (WID log, `.tic`/`.toc`)
- The `waldiez/` GitHub org is the upstream authority
- `limen@io.limen-os.io` is the canonical deploy target (never `admin@`)

---

## The TOOS Promise

> If you boot OuroS, you get:
> - A beautiful, voice-first desktop that breathes with the time of day
> - An AI that speaks back, not just types back
> - An identity system where every action is traceable but private
> - A self-healing shell that knows when it crashed and fixes it
> - A platform where you can teach it new tricks in any language (WASM plugins)
> - A window into the waldiez ecosystem — WID, Bank, Player, wef, and beyond

*This is what "True OS" means.*

---

*Version: patato5 · 2026-03-14 · WID: `20260314T000000.0001Z-ouros5`*
