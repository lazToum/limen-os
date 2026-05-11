//! Main daemon entry point — orchestrates all subsystems.

use anyhow::Result;
use tracing::{info, warn};

use crate::AppState;

/// Start the limen-core daemon.
///
/// Spawns:
/// - IPC Unix socket server
/// - Mobile companion WebSocket server
/// - AgentFlow MQTT bridge (non-fatal if broker not available)
pub async fn run() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("LIMEN_LOG").unwrap_or_else(|_| "limen_core=debug".into()))
        .init();

    info!("limen-core daemon starting...");

    let state = AppState::new();

    // Spawn IPC server (Unix socket).
    let ipc_state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::ipc::server::run(ipc_state).await {
            tracing::error!("IPC server error: {e}");
        }
    });

    // Spawn mobile companion WebSocket server.
    let comp_state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::companion::run(comp_state).await {
            tracing::error!("companion server error: {e}");
        }
    });

    // Spawn relay HTTP server (frame proxy + search + IPC bridge + SSE).
    let relay_state = state.clone();
    tokio::spawn(async move {
        if let Err(e) = crate::relay::run(relay_state).await {
            tracing::error!("relay server error: {e}");
        }
    });

    // Spawn voice relay assembler (companion PCM → Whisper → VoiceCommandReceived).
    let relay_state = state.clone();
    tokio::spawn(async move {
        crate::voice_relay::run(relay_state).await;
    });

    // Connect AgentFlow MQTT bridge (optional — synapsd works without AgentFlow).
    match crate::agentflow::start(state.clone()).await {
        Ok(bridge) => {
            *state.agentflow.write().await = Some(bridge);
            info!("AgentFlow MQTT bridge connected");
        }
        Err(e) => {
            warn!("AgentFlow MQTT bridge unavailable (start AgentFlow first): {e}");
        }
    }

    info!("limen-core daemon running. PID={}", std::process::id());

    // Park forever (signals handled externally).
    tokio::signal::ctrl_c().await?;
    info!("limen-core daemon shutting down.");
    Ok(())
}
