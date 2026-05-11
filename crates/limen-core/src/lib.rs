//! # limen-core
//!
//! Core daemon for LIMEN OS.
//!
//! Responsibilities:
//! - Session lifecycle (login, lock, logout)
//! - IPC bus (D-Bus + Unix socket) for shell ↔ AI ↔ plugins
//! - WID-stamped event log (every action gets a WID)
//! - WASM plugin host (wasmtime sandbox)

pub mod agentflow;
pub mod companion;
pub mod daemon;
pub mod events;
pub mod ipc;
pub mod plugins;
pub mod relay;
pub mod session;
pub mod voice_relay;

use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::{RwLock, broadcast};

pub use agentflow::AgentFlowBridge;
pub use events::{EventKind, LimenEvent};

/// Global application state shared across all subsystems.
#[derive(Clone)]
pub struct AppState {
    pub session: Arc<session::SessionManager>,
    pub event_tx: broadcast::Sender<LimenEvent>,
    /// Alias for ergonomic use in subsystems.
    pub events: broadcast::Sender<LimenEvent>,
    /// AgentFlow MQTT bridge — `None` until the broker is reachable.
    pub agentflow: Arc<RwLock<Option<AgentFlowBridge>>>,
    /// Direct AI router — used when AgentFlow is unavailable (intent + chat fallback).
    pub ai: Arc<limen_ai::router::AiRouter>,
}

impl AppState {
    pub fn new() -> Self {
        let (event_tx, _) = broadcast::channel(1024);
        Self {
            session: Arc::new(session::SessionManager::new()),
            events: event_tx.clone(),
            event_tx,
            agentflow: Arc::new(RwLock::new(None)),
            ai: Arc::new(limen_ai::router::AiRouter::from_env()),
        }
    }

    /// Subscribe to the global event bus.
    pub fn subscribe(&self) -> broadcast::Receiver<LimenEvent> {
        self.event_tx.subscribe()
    }

    /// Emit an event to all subscribers.
    pub fn emit(&self, event: LimenEvent) {
        let _ = self.event_tx.send(event);
    }
}

fn build_wid_generator() -> wid::HLCWidGen {
    wid::HLCWidGen::new("core".to_string(), 4, 6).expect("valid HLC-WID generator parameters")
}

static WID_GEN: OnceLock<Mutex<wid::HLCWidGen>> = OnceLock::new();

/// Generate a WID identifier via `github.com/waldiez/wid`.
pub fn wid() -> String {
    let generator = WID_GEN.get_or_init(|| Mutex::new(build_wid_generator()));
    let mut guard = generator.lock().expect("WID generator mutex poisoned");
    guard.next_hlc_wid()
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
