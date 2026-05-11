//! WID-stamped event types for the LIMEN OS event bus.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Every event in LIMEN OS is stamped with a WID string.
/// WID format: `20260307T143052.0000Z-a3f91c` (see `../../../wid`)
pub type Wid = String;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LimenEvent {
    /// Unique WID for this event instance.
    pub id: Wid,
    /// Wall-clock time.
    pub ts: DateTime<Utc>,
    /// Event payload.
    pub kind: EventKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum EventKind {
    // Session
    SessionStart {
        user: String,
    },
    SessionEnd {
        user: String,
    },
    SessionLock,
    SessionUnlock,

    // Voice
    WakeWordDetected,
    VoiceCommandReceived {
        transcript: String,
    },
    VoiceCommandExecuted {
        intent: String,
        action: String,
    },

    // AI
    AiRequest {
        model: String,
        prompt_tokens: u32,
    },
    AiResponse {
        model: String,
        latency_ms: u64,
    },

    // Shell
    SceneChanged {
        name: String,
    },
    AppLaunched {
        name: String,
        pid: u32,
    },
    AppClosed {
        name: String,
        pid: u32,
    },
    NotificationReceived {
        title: String,
        body: String,
    },

    // Mobile companion
    MobileConnected {
        device_id: String,
    },
    MobileDisconnected {
        device_id: String,
    },
    VoiceRelayStarted,
    VoiceRelayEnded,
    VoiceChunk {
        pcm: Vec<u8>,
        seq: u32,
    },
    MouseDelta {
        dx: f32,
        dy: f32,
    },
    MouseClick {
        button: String,
    },
    MouseScroll {
        dy: f32,
    },
    KeyEvent {
        key: String,
        modifiers: Vec<String>,
    },

    // Plugins
    PluginLoaded {
        name: String,
        version: String,
    },
    PluginError {
        name: String,
        error: String,
    },

    // Camera / vision
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
    /// Emitted only on state transitions (absent→present or present→absent).
    PresenceChanged {
        present: bool,
        motion_score: f32,
    },

    // Network
    /// Emitted on online/offline transitions and connection type changes.
    NetworkStateChanged {
        online: bool,
        connection_type: String, // "wifi" | "ethernet" | "cellular" | "unknown"
        downlink_mbps: f32,
        rtt_ms: u32,
    },
    /// A device found during a local network scan (nmcli / ip neigh).
    NetworkDeviceFound {
        ip: String,
        mac: Option<String>,
        hostname: Option<String>,
        signal_dbm: Option<i32>, // Wi-Fi only
    },

    // System
    DisplayConfigChanged {
        resolution: String,
    },
    Custom {
        name: String,
        payload: serde_json::Value,
    },
}
