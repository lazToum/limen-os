//! Mobile companion WebSocket server.
//!
//! Listens on TCP port 8731 (configurable via `LIMEN_COMPANION_PORT`).
//! Accepts JSON frames from the Flutter mobile app and translates them
//! into `LimenEvent`s that the rest of the system can act on.
//!
//! Message types (mobile → daemon):
//!   { "type": "mouse_delta",  "dx": f32, "dy": f32 }
//!   { "type": "mouse_click",  "button": "left"|"right"|"middle" }
//!   { "type": "mouse_scroll", "dy": f32 }
//!   { "type": "key",          "key": string, "modifiers": [string] }
//!   { "type": "scene",        "name": string }
//!   { "type": "voice_start" }
//!   { "type": "voice_chunk",  "data": base64, "seq": u32 }
//!   { "type": "voice_end" }
//!   { "type": "ping" }
//!
//! Messages sent (daemon → mobile):
//!   { "type": "pong" }
//!   { "type": "scene_changed", "name": string }
//!   { "type": "notification",  "title": string, "body": string }

use anyhow::Result;
use axum::{
    Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    response::IntoResponse,
    routing::get,
};
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use tokio::sync::broadcast;
use tracing::{debug, info, warn};

use crate::AppState;
use chrono::Utc;

pub const DEFAULT_PORT: u16 = 8731;

// ─── Wire protocol ────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum MobileMsg {
    MouseDelta { dx: f32, dy: f32 },
    MouseClick { button: String },
    MouseScroll { dy: f32 },
    Key { key: String, modifiers: Vec<String> },
    Scene { name: String },
    VoiceStart,
    VoiceChunk { data: String, seq: u32 },
    VoiceEnd,
    Ping,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(dead_code)]
enum DaemonMsg<'a> {
    Pong,
    SceneChanged { name: &'a str },
    Notification { title: &'a str, body: &'a str },
    Error { message: &'a str },
}

// ─── Server ───────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct CompanionState {
    app: AppState,
    /// Channel for pushing scene-change events to all connected clients.
    scene_tx: broadcast::Sender<String>,
}

pub async fn run(app: AppState) -> Result<()> {
    let port: u16 = std::env::var("LIMEN_MOBILE_PORT")
        .or_else(|_| std::env::var("LIMEN_COMPANION_PORT"))
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let (scene_tx, _) = broadcast::channel::<String>(16);
    let state = CompanionState { app, scene_tx };

    let router = Router::new()
        .route("/companion", get(ws_handler))
        .route("/health", get(|| async { "limen-companion ok" }))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("companion WebSocket listening on ws://{addr}/companion");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, router).await?;
    Ok(())
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<CompanionState>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(mut socket: WebSocket, state: CompanionState) {
    let peer = "mobile-client";
    info!("{peer}: connected");

    let mut scene_rx = state.scene_tx.subscribe();

    loop {
        tokio::select! {
            // Inbound from mobile.
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        if let Err(e) = handle_mobile_msg(&text, &mut socket, &state).await {
                            warn!("{peer}: error handling msg: {e}");
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(e)) => { warn!("{peer}: recv error: {e}"); break; }
                    _ => {}
                }
            }
            // Push scene changes to mobile.
            Ok(name) = scene_rx.recv() => {
                let msg = serde_json::to_string(&DaemonMsg::SceneChanged { name: &name })
                    .unwrap_or_default();
                if socket.send(Message::Text(msg.into())).await.is_err() {
                    break;
                }
            }
        }
    }

    info!("{peer}: disconnected");
}

async fn handle_mobile_msg(
    raw: &str,
    socket: &mut WebSocket,
    state: &CompanionState,
) -> Result<()> {
    let msg: MobileMsg = serde_json::from_str(raw)?;
    debug!("companion ← {msg:?}");

    match msg {
        MobileMsg::Ping => {
            let pong = serde_json::to_string(&DaemonMsg::Pong)?;
            socket.send(Message::Text(pong.into())).await?;
        }

        MobileMsg::Scene { name } => {
            info!("scene request: {name}");
            let _ = state.scene_tx.send(name.clone());
            state.app.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: Utc::now(),
                kind: crate::EventKind::SceneChanged { name },
            });
        }

        MobileMsg::VoiceStart => {
            info!("voice relay started");
            state.app.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: Utc::now(),
                kind: crate::EventKind::VoiceRelayStarted,
            });
        }

        MobileMsg::VoiceEnd => {
            info!("voice relay ended");
            state.app.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: Utc::now(),
                kind: crate::EventKind::VoiceRelayEnded,
            });
        }

        MobileMsg::VoiceChunk { data, seq } => {
            let pcm = base64::engine::general_purpose::STANDARD.decode(&data)?;
            state.app.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: Utc::now(),
                kind: crate::EventKind::VoiceChunk { pcm, seq },
            });
        }

        MobileMsg::MouseDelta { dx, dy } => {
            state.app.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: Utc::now(),
                kind: crate::EventKind::MouseDelta { dx, dy },
            });
        }

        MobileMsg::MouseClick { button } => {
            state.app.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: Utc::now(),
                kind: crate::EventKind::MouseClick { button },
            });
        }

        MobileMsg::MouseScroll { dy } => {
            state.app.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: Utc::now(),
                kind: crate::EventKind::MouseScroll { dy },
            });
        }

        MobileMsg::Key { key, modifiers } => {
            state.app.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: Utc::now(),
                kind: crate::EventKind::KeyEvent { key, modifiers },
            });
        }
    }

    Ok(())
}
