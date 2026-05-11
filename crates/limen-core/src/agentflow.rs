//! AgentFlow MQTT bridge — connects synapsd to the AgentFlow actor system.
//!
//! # Flow
//!
//! ```text
//! Tauri shell / TUI  →  IPC (Unix socket)  →  synapsd
//!   VoiceCommand { transcript }
//!     → publish MQTT  io/chat  { "from": "user", "content": transcript }
//!       → AgentFlow MainActor → IOAgent → LLM → OsAgent
//!         → MQTT  os/window/open | os/scene/set | os/notify | …
//!           → synapsd subscribes → emits LimenEvent → Tauri shell reacts
//! ```
//!
//! # MQTT topics synapsd subscribes to
//!
//! | Topic              | Maps to LimenEvent kind              |
//! |--------------------|----------------------------------------|
//! | `os/window/open`   | `AppLaunched { name, pid: 0 }`         |
//! | `os/window/close`  | `AppClosed { name, pid: 0 }`           |
//! | `os/scene/set`     | `SceneChanged { name }`                |
//! | `os/notify`        | `NotificationReceived { title, body }` |
//! | `os/session/lock`  | `SessionLock`                          |
//! | `agents/*/chat`    | `Custom { name: "ai_reply", payload }` |
//!
//! # MQTT topics synapsd publishes to
//!
//! | Topic      | Payload                                     |
//! |------------|---------------------------------------------|
//! | `io/chat`  | `{"from":"user","content":"<transcript>"}` |

use anyhow::Result;
use rumqttc::{AsyncClient, EventLoop, MqttOptions, QoS};
use serde_json::Value;
use std::time::Duration;
use tracing::{error, info, warn};

use crate::AppState;
use crate::events::{EventKind, LimenEvent};

/// MQTT broker address — override via LIMEN_MQTT_HOST / LIMEN_MQTT_PORT / LIMEN_MQTT_USER / LIMEN_MQTT_PASS.
const MQTT_HOST: &str = "127.0.0.1";
const MQTT_PORT: u16 = 1883;
const CLIENT_ID: &str = "synapsd";

/// Topic synapsd publishes user voice/text input to.
const TOPIC_IO_CHAT: &str = "io/chat";

/// Wildcard subscription for OS-control topics from OsAgent.
const SUB_OS: &str = "os/#";
/// Wildcard subscription for AI chat replies from AgentFlow agents.
const SUB_AGENTS_CHAT: &str = "agents/+/chat";

/// Bridge handle — keeps the MQTT client for publishing.
#[derive(Clone)]
pub struct AgentFlowBridge {
    client: AsyncClient,
}

impl AgentFlowBridge {
    /// Send a user transcript (voice or text) into the AgentFlow pipeline.
    pub async fn send_voice_command(&self, transcript: &str) {
        let payload = serde_json::json!({
            "from":    "user",
            "content": transcript,
        });
        let bytes = payload.to_string().into_bytes();
        if let Err(e) = self
            .client
            .publish(TOPIC_IO_CHAT, QoS::AtLeastOnce, false, bytes)
            .await
        {
            error!("[agentflow-bridge] failed to publish voice command: {e}");
        } else {
            info!("[agentflow-bridge] → io/chat: {transcript}");
        }
    }

    /// Send an arbitrary JSON payload to any topic (used by IPC dispatch for `AiQuery`).
    pub async fn send_raw(&self, topic: &str, payload: Value) {
        let bytes = payload.to_string().into_bytes();
        if let Err(e) = self
            .client
            .publish(topic, QoS::AtLeastOnce, false, bytes)
            .await
        {
            error!("[agentflow-bridge] failed to publish to {topic}: {e}");
        }
    }
}

/// Start the AgentFlow MQTT bridge.
///
/// Returns a [`AgentFlowBridge`] handle for publishing, and spawns a background
/// task that relays incoming `os/#` and `agents/*/chat` messages to the
/// `AppState` event bus as [`LimenEvent`]s.
pub async fn start(state: AppState) -> Result<AgentFlowBridge> {
    let host = std::env::var("LIMEN_MQTT_HOST").unwrap_or_else(|_| MQTT_HOST.into());
    let port = std::env::var("LIMEN_MQTT_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(MQTT_PORT);
    let client_id = format!("{}-{}", CLIENT_ID, std::process::id());
    let mut opts = MqttOptions::new(client_id, &host, port);
    opts.set_keep_alive(Duration::from_secs(20));
    opts.set_clean_session(true);
    if let (Ok(user), Ok(pass)) = (
        std::env::var("LIMEN_MQTT_USER"),
        std::env::var("LIMEN_MQTT_PASS"),
    ) {
        opts.set_credentials(user, pass);
    }

    let (client, eventloop) = AsyncClient::new(opts, 256);

    // Subscribe to OS-control topics and agent chat replies.
    client.subscribe(SUB_OS, QoS::AtLeastOnce).await?;
    client.subscribe(SUB_AGENTS_CHAT, QoS::AtLeastOnce).await?;

    info!("[agentflow-bridge] connected to MQTT broker at {host}:{port}");

    let bridge = AgentFlowBridge { client };

    // Spawn the event-loop task.
    tokio::spawn(mqtt_event_loop(eventloop, state));

    Ok(bridge)
}

/// Background task: drive the MQTT event loop and translate incoming messages
/// into `LimenEvent`s on the core event bus.
async fn mqtt_event_loop(mut eventloop: EventLoop, state: AppState) {
    loop {
        match eventloop.poll().await {
            Ok(rumqttc::Event::Incoming(rumqttc::Packet::Publish(publish))) => {
                let topic = &publish.topic;
                let payload_str = String::from_utf8_lossy(&publish.payload);
                let json: Value = serde_json::from_str(&payload_str).unwrap_or(Value::Null);

                if let Some(event_kind) = topic_to_event(topic, &json) {
                    let event = LimenEvent {
                        id: crate::wid(),
                        ts: chrono::Utc::now(),
                        kind: event_kind,
                    };
                    state.emit(event);
                } else {
                    info!("[agentflow-bridge] ← {topic}: {payload_str}");
                }
            }
            Ok(rumqttc::Event::Incoming(rumqttc::Packet::ConnAck(_))) => {
                info!("[agentflow-bridge] MQTT connected / reconnected");
            }
            Ok(_) => {}
            Err(e) => {
                warn!("[agentflow-bridge] MQTT error: {e} — retrying in 5s");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

/// Map an incoming MQTT topic + payload to a [`EventKind`].
fn topic_to_event(topic: &str, payload: &Value) -> Option<EventKind> {
    match topic {
        "os/window/open" => {
            let name = payload.get("app_id")?.as_str()?.to_string();
            Some(EventKind::AppLaunched { name, pid: 0 })
        }
        "os/window/close" => {
            let name = payload
                .get("app_id")
                .or_else(|| payload.get("window_id"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();
            Some(EventKind::AppClosed { name, pid: 0 })
        }
        "os/window/focus" => {
            // Focus doesn't map to a distinct event — emit as Custom.
            let name = payload
                .get("app_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some(EventKind::Custom {
                name: "window_focus".into(),
                payload: serde_json::json!({ "app_id": name }),
            })
        }
        "os/scene/set" => {
            let name = payload.get("scene")?.as_str()?.to_string();
            Some(EventKind::SceneChanged { name })
        }
        "os/paradigm/set" => {
            let paradigm = payload.get("paradigm")?.as_str()?.to_string();
            Some(EventKind::Custom {
                name: "paradigm_changed".into(),
                payload: serde_json::json!({ "paradigm": paradigm }),
            })
        }
        "os/notify" => {
            let title = payload
                .get("title")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let body = payload
                .get("body")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some(EventKind::NotificationReceived { title, body })
        }
        "os/app/launch" => {
            let name = payload
                .get("app")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            Some(EventKind::AppLaunched { name, pid: 0 })
        }
        "os/volume/set" => {
            let level = payload.get("level").and_then(|v| v.as_f64()).unwrap_or(0.5);
            Some(EventKind::Custom {
                name: "volume_set".into(),
                payload: serde_json::json!({ "level": level }),
            })
        }
        "os/session/lock" => Some(EventKind::SessionLock),
        t if t.starts_with("agents/") && t.ends_with("/chat") => {
            // Agent chat reply — surface as a notification or custom event.
            let content = payload
                .get("content")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let agent = t.split('/').nth(1).unwrap_or("ai").to_string();
            Some(EventKind::NotificationReceived {
                title: format!("[{agent}]"),
                body: content,
            })
        }
        _ => None,
    }
}
