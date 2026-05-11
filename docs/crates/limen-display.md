# LIMEN-DISPLAY — The Window Manager

`limen-display` manages the underlying windowing system and input routing.

---

## 1. Wayland Integration

LIMEN OS targets Wayland as its primary display protocol.
- **Compositor**: We interact with `wlroots` based compositors (like Sway/Hyprland) or GNOME's Mutter via D-Bus.
- **Layer Shell**: The primary UI (`apps/shell`) uses the `layer-shell` protocol to stay anchored to the background or top-level.

---

## 2. Input Routing

The display layer routes input from all [Interaction Modalities](../architecture/ARCHITECTURE.md):
- **Gestures**: Mediapipe coordinates are mapped to virtual mouse/touch events.
- **Focus**: `limen-display` determines which app or scene has input focus.
