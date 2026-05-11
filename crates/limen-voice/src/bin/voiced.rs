//! limen-voiced — LIMEN OS voice daemon.
//!
//! Runs the full mic → VAD → Whisper → IPC pipeline continuously.
//! Designed to run as a systemd service alongside `synapsd`.
//!
//! # Usage
//!
//! ```bash
//! limen-voiced                  # uses env vars
//! LIMEN_WAKE_WORD="hey limen" limen-voiced
//! ```
//!
//! # Environment variables
//!
//! | Variable             | Default                   | Description                        |
//! |----------------------|---------------------------|------------------------------------|
//! | `LIMEN_WAKE_WORD`  | `hey limen`             | Trigger phrase (empty = all audio) |
//! | `LIMEN_VAD_THRESH` | `0.01`                    | RMS energy threshold               |
//! | `LIMEN_IPC_SOCK`   | `/run/limen/core.sock`  | synapsd Unix socket                |
//! | `WHISPER_BASE_URL`   | `http://localhost:8080`   | whisper.cpp server                 |
//! | `OPENAI_API_KEY`     | —                         | Fallback OpenAI Whisper API key    |
//! | `LIMEN_LOG`        | `limen_voice=info`      | Log filter                         |
//! | `LIMEN_RETRY_SECS` | `5`                       | Seconds between pipeline restarts  |

use std::time::Duration;
use tracing::{error, info, warn};

#[tokio::main]
async fn main() {
    // Initialise logging.
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("LIMEN_LOG")
                .unwrap_or_else(|_| "limen_voiced=info,limen_voice=info".into()),
        )
        .init();

    info!("limen-voiced starting (PID {})", std::process::id());

    let ipc_sock =
        std::env::var("LIMEN_IPC_SOCK").unwrap_or_else(|_| "/run/limen/core.sock".into());

    let retry_secs: u64 = std::env::var("LIMEN_RETRY_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(5);

    // Wait for synapsd to be ready before starting the pipeline.
    wait_for_synapsd(&ipc_sock, retry_secs).await;

    // Main restart loop.
    loop {
        let pipeline = limen_voice::VoicePipeline::from_env();
        info!("limen-voiced: pipeline starting");

        match pipeline.run().await {
            Ok(()) => {
                warn!("limen-voiced: pipeline exited cleanly — restarting in {retry_secs}s");
            }
            Err(e) => {
                error!("limen-voiced: pipeline error: {e} — restarting in {retry_secs}s");
            }
        }

        tokio::time::sleep(Duration::from_secs(retry_secs)).await;

        // Re-check synapsd is still up before restarting.
        wait_for_synapsd(&ipc_sock, retry_secs).await;
    }
}

/// Block until the synapsd socket exists and is connectable.
async fn wait_for_synapsd(sock: &str, retry_secs: u64) {
    loop {
        match tokio::net::UnixStream::connect(sock).await {
            Ok(_) => {
                info!("limen-voiced: synapsd is up at {sock}");
                return;
            }
            Err(_) => {
                info!("limen-voiced: waiting for synapsd at {sock} (retry in {retry_secs}s)");
                tokio::time::sleep(Duration::from_secs(retry_secs)).await;
            }
        }
    }
}
