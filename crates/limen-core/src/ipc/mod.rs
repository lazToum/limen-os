//! IPC subsystem — D-Bus + Unix socket server.
//!
//! The IPC bus allows:
//! - Tauri shell frontend ↔ limen-core daemon
//! - TUI ↔ limen-core daemon
//! - Mobile bridge ↔ limen-core daemon
//! - WASM plugins ↔ limen-core daemon

pub mod server;

use serde::{Deserialize, Serialize};

/// Messages sent from clients to the core daemon.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "cmd", rename_all = "snake_case")]
pub enum IpcRequest {
    GetSession,
    LockSession,
    UnlockSession {
        pin: Option<String>,
    },
    LaunchApp {
        name: String,
        args: Vec<String>,
    },
    SetScene {
        name: String,
    },
    VoiceCommand {
        transcript: String,
    },
    AiQuery {
        prompt: String,
        model: Option<String>,
    },
    Subscribe {
        events: Vec<String>,
    },
    Custom {
        name: String,
        payload: serde_json::Value,
    },
    /// Push a notification to all connected clients (shell, TUI, mobile).
    Notify {
        title: String,
        body: String,
        kind: Option<String>,
    },
    /// Camera lifecycle — emitted by the shell when the webcam state changes.
    CameraStarted {
        device_id: String,
        label: String,
    },
    CameraStopped {
        device_id: String,
    },
    CameraSwitched {
        from_device_id: String,
        to_device_id: String,
        label: String,
    },
    /// Presence state change — only sent on transitions, not every frame.
    PresenceEvent {
        present: bool,
        motion_score: f32,
    },
    /// Browser network state change (online/offline / connection API).
    NetworkStateEvent {
        online: bool,
        connection_type: String,
        downlink_mbps: f32,
        rtt_ms: u32,
    },
    /// Request a local network scan — returns discovered devices.
    ScanNetwork,
}

/// Responses from the core daemon.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum IpcResponse {
    Ok { payload: serde_json::Value },
    Event { event: super::LimenEvent },
    Error { code: u32, message: String },
}
