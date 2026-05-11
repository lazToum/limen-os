# SHELL-FRONTEND — The Visual Interface

The LIMEN OS Shell (`apps/shell`) is a hybrid 3D/2D interface built with Tauri and Babylon.js.

---

## 1. 3D Engine (Babylon.js)

The "Desktop" is a 3D scene where apps and widgets exist as physical objects.
- **Rendering**: WebGL2/WebGPU.
- **Scenes**: Managed by the [Scene Transition System](../architecture/ARCHITECTURE.md).
- **Paradigms**: Applied as post-process shaders and lighting changes.

---

## 2. React & State (Zustand)

While the rendering is 3D, the state and UI overlays are managed with React.
- **Zustand**: Used for the global system store (Active Apps, User Profile, System Settings).
- **Tauri IPC**: The frontend uses `invoke()` to call Rust commands in the backend and `listen()` for global system events.
