# LIMEN OS — API Reference Overview

Welcome to the **LIMEN OS API Reference**. This guide provides a high-level overview of how different parts of the system "talk" to each other.

---

## 🗺️ The Map of Communication

Think of LIMEN OS as a group of specialized agents working together:

1.  **`limen-voice`**: The "Ears." It listens and turns audio into words.
2.  **`limen-ai`**: The "Brain." It figures out what those words mean (Intent).
3.  **`limen-core`**: The "Coordinator." It receives intents and tells the system what to do next.
4.  **`apps/shell`**: The "Face." This is what you see (the screen).

---

## 🚦 Interaction Flows

### 🎙️ Voice Flow
When a user says something:
- `limen-voice` → (transcript) → `limen-ai`
- `limen-ai` → (intent JSON) → `limen-core`
- `limen-core` → (action/UI update) → `apps/shell`
- **Related Spec:** [VOICE.md](VOICE.md)

### 🧩 Plugin Flow
When a plugin wants to show something:
- `Plugin` → (command) → `limen-core`
- `limen-core` → (permission check) → `apps/shell`
- **Related Spec:** [PLUGINS.md](PLUGINS.md)

### 🆔 Tracking Everything (WID)
Every event above is tagged with a **WID (Waldiez ID)**. This is like a timestamped "passport" that follows an event everywhere it goes.
- **Related Spec:** [WID.md](WID.md)

---

## 🧪 Quick Test Examples

- **See if the system is listening:**
  `cat /run/limen/core.sock` (This listens to the stream of events).

- **Simulate a "Home" button press via Voice Intent:**
  ```json
  { "intent": "set_scene", "target": "home", "confidence": 1.0 }
  ```

- **Check Plugin Permissions:**
  Look for `limen-plugin.toml` in your plugin folder.

---

## 📖 Further Reading
- [Detailed IPC Protocol](IPC.md)
- [WID Integration Specifics](WID.md)
- [Voice Intent Schemas](VOICE.md)
