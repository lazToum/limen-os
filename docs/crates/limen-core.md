# LIMEN-CORE — The System Heart

`limen-core` is the central daemon (`synapsd`) of LIMEN OS. It acts as the primary coordinator between voice input, AI processing, the frontend shell, and plugins.

---

## 1. The Event Bus

At its core, `synapsd` is a high-performance event bus built on top of `tokio` channels.

### Message Routing
1. **Ingress**: Messages arrive via the Unix socket (`/run/limen/core.sock`), D-Bus, or internal crate calls.
2. **Tagging**: Each message is tagged with a **WID** (Waldiez ID) if it doesn't already have one.
3. **Dispatch**: The bus identifies the target (Broadcast, Specific App, or Plugin) and routes the message.
4. **Audit**: Every routed message is appended to the system event log.

---

## 2. Session Management

`limen-core` maintains the active state of the operating system.

- **Current Scene**: Tracks which Babylon.js scene is active (e.g., `home`).
- **Active Apps**: A registry of currently running PIDs and their resource usage.
- **User Context**: Short-term memory of recent interactions, fed to `limen-ai` for better intent resolution.
- **Persistence**: The session state is periodically snapshotted to `/var/lib/limen/session.json`.

---

## 3. Plugin Registry

The core manages the lifecycle of WASM-based plugins.

- **Isolation**: Each plugin runs in its own `wasmtime` instance.
- **Capabilities**: Plugins must be granted explicit permissions in their manifest (e.g., `network`, `display`).
- **Discovery**: On startup, the core scans `/usr/share/limen/plugins` and `~/.local/share/limen/plugins`.

---

## 4. Systemd Integration

`synapsd` is designed to run as a system-level service.

- **Socket Activation**: Can be started automatically when a client connects to the Unix socket.
- **Watchdog**: Notifies systemd of its health status using `sd_notify`.
- **Resource Control**: Leverages cgroups (via systemd) to limit the CPU/Memory impact of background plugins.

---

## 5. Security & IPC

Access to the core socket is restricted by filesystem permissions.

- **Default Group**: `limen-api`
- **Encryption**: While local UDS is plain JSON, remote companion connections are encrypted using the Waldiez Security Layer (WSL).
