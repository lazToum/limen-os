# TUI-INTERFACE — The Manual Fallback

The TUI (`apps/tui`) provides full feature parity for LIMEN OS via a text-only terminal interface.

---

## 1. Philosophy

As per the [Grandmother Test](../PHILOSOPHY.md), the TUI is the "Give me the keyboard" escape hatch. It is designed for SSH access and for power users who prefer CLI-driven workflows.

---

## 2. Commands

The TUI implements a custom shell with the following primary commands:
- `open <app>`: Launches an application.
- `scene <name>`: Switches the current visual scene.
- `logs`: Tails the system event log (filtered by WID).
- `ai "<query>"`: Directly queries the AI brain.
