//! WASM plugin host — sandboxed, can be written in Rust, Python, Go, or AssemblyScript.
//!
//! Plugin ABI (host functions exposed to WASM):
//!   - `limen_emit(event_json_ptr, len)` — emit an event to the bus
//!   - `limen_log(msg_ptr, len)` — log a message
//!   - `limen_get_config(key_ptr, len) -> (ptr, len)` — read plugin config
//!
//! Plugins export:
//!   - `limen_init() -> i32` — initialize plugin, return 0 on success
//!   - `limen_on_event(event_json_ptr, len)` — receive bus events
//!   - `limen_command(cmd_json_ptr, len) -> (ptr, len)` — handle IPC commands

pub mod host;
pub mod registry;
