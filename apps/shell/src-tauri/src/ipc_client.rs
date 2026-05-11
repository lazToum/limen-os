//! Thin async client for the synapsd Unix-socket IPC.
//!
//! Unix only — synapsd is not available on Windows.
//! On non-Unix platforms all functions are graceful no-ops.

// ── Non-Unix stub (Windows, etc.) ────────────────────────────────────────────
#[cfg(not(unix))]
pub async fn request(_req: limen_core::ipc::IpcRequest) -> anyhow::Result<serde_json::Value> {
    anyhow::bail!("synapsd IPC is only available on Linux/macOS")
}

#[cfg(not(unix))]
pub async fn run_event_listener(_app: tauri::AppHandle) {
    // synapsd does not run on Windows — event bridge is a no-op.
}

// ── Unix implementation ───────────────────────────────────────────────────────
#[cfg(unix)]
mod unix_impl {

    use anyhow::{Result, anyhow};
    use serde_json::Value;
    use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
    use tokio::net::UnixStream;
    use tracing::{info, warn};

    use limen_core::ipc::{IpcRequest, IpcResponse};

    /// Path to the synapsd Unix socket.
    const SOCKET_PATH: &str = "/run/limen/core.sock";

    // ── One-shot request ──────────────────────────────────────────────────────────

    /// Send a single request to synapsd and return the first non-Event response.
    ///
    /// Opens a fresh connection for each call — simple, stateless, and fine for
    /// low-frequency commands.
    pub async fn request(req: IpcRequest) -> Result<Value> {
        let stream = UnixStream::connect(SOCKET_PATH)
            .await
            .map_err(|e| anyhow!("synapsd not reachable ({SOCKET_PATH}): {e}"))?;

        let (reader, mut writer) = stream.into_split();
        let mut lines = BufReader::new(reader).lines();

        // Send request.
        let mut line = serde_json::to_string(&req)?;
        line.push('\n');
        writer.write_all(line.as_bytes()).await?;

        // Read first response (skip any Event lines that arrive first).
        loop {
            match lines.next_line().await? {
                None => return Err(anyhow!("synapsd closed connection")),
                Some(raw) => {
                    let resp: IpcResponse = serde_json::from_str(&raw)?;
                    match resp {
                        IpcResponse::Ok { payload } => return Ok(payload),
                        IpcResponse::Error { code, message } => {
                            return Err(anyhow!("synapsd error {code}: {message}"));
                        }
                        IpcResponse::Event { .. } => {
                            // An event arrived before our response — skip it.
                            continue;
                        }
                    }
                }
            }
        }
    }

    // ── Event listener ────────────────────────────────────────────────────────────

    /// Long-lived task: connect to synapsd and forward every `LimenEvent` as
    /// a Tauri app event so the frontend WebView can react.
    ///
    /// Reconnects automatically if synapsd is restarted.
    pub async fn run_event_listener(app: tauri::AppHandle) {
        loop {
            match listen_once(&app).await {
                Ok(()) => {
                    // synapsd closed cleanly — reconnect after a short pause.
                    info!("[ipc-listener] synapsd disconnected — reconnecting in 3s");
                }
                Err(e) => {
                    warn!("[ipc-listener] {e} — reconnecting in 5s");
                    tokio::time::sleep(std::time::Duration::from_secs(5)).await;
                }
            }
            tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        }
    }

    async fn listen_once(app: &tauri::AppHandle) -> Result<()> {
        let stream = UnixStream::connect(SOCKET_PATH)
            .await
            .map_err(|e| anyhow!("cannot connect to synapsd: {e}"))?;

        info!("[ipc-listener] connected to synapsd");

        // Subscribe to all events — synapsd pushes them automatically on any
        // long-lived connection (the server's `select!` on event_rx).
        let (reader, mut writer) = stream.into_split();
        let mut lines = BufReader::new(reader).lines();

        // Send a Subscribe request so synapsd knows we want events.
        let sub = serde_json::to_string(&IpcRequest::Subscribe {
            events: vec!["*".into()],
        })? + "\n";
        writer.write_all(sub.as_bytes()).await?;

        while let Some(raw) = lines.next_line().await? {
            let resp: IpcResponse = match serde_json::from_str(&raw) {
                Ok(r) => r,
                Err(e) => {
                    warn!("[ipc-listener] parse error: {e}");
                    continue;
                }
            };

            if let IpcResponse::Event { event } = resp {
                emit_event(app, &event);
            }
        }

        Ok(())
    }

    /// Translate a [`limen_core::LimenEvent`] into Tauri frontend events.
    fn emit_event(app: &tauri::AppHandle, event: &limen_core::LimenEvent) {
        use limen_core::EventKind;
        use tauri::Emitter;

        match &event.kind {
            EventKind::SceneChanged { name } => {
                let _ = app.emit("limen://scene", name);
            }
            EventKind::AppLaunched { name, .. } => {
                let _ = app.emit("limen://window/open", name);
            }
            EventKind::AppClosed { name, .. } => {
                let _ = app.emit("limen://window/close", name);
            }
            EventKind::NotificationReceived { title, body } => {
                let _ = app.emit(
                    "limen://notify",
                    serde_json::json!({ "title": title, "body": body }),
                );
            }
            EventKind::SessionLock => {
                let _ = app.emit("limen://scene", "greeter");
            }
            EventKind::SessionUnlock => {
                let _ = app.emit("limen://scene", "home");
            }
            EventKind::VoiceCommandReceived { transcript } => {
                let _ = app.emit("limen://voice/transcript", transcript);
            }
            EventKind::VoiceCommandExecuted { intent, action } => {
                let _ = app.emit(
                    "limen://voice/executed",
                    serde_json::json!({ "intent": intent, "action": action }),
                );
            }
            EventKind::Custom { name, payload } => {
                let _ = app.emit(&format!("limen://{name}"), payload);
            }
            EventKind::CameraStarted { device_id, label } => {
                let _ = app.emit(
                    "limen://camera/started",
                    serde_json::json!({ "device_id": device_id, "label": label }),
                );
            }
            EventKind::CameraStopped { device_id } => {
                let _ = app.emit(
                    "limen://camera/stopped",
                    serde_json::json!({ "device_id": device_id }),
                );
            }
            EventKind::CameraSwitched {
                from_device_id,
                to_device_id,
                label,
            } => {
                let _ = app.emit("limen://camera/switched",
                serde_json::json!({ "from": from_device_id, "to": to_device_id, "label": label }));
            }
            EventKind::PresenceChanged {
                present,
                motion_score,
            } => {
                let _ = app.emit(
                    "limen://presence",
                    serde_json::json!({ "present": present, "motion_score": motion_score }),
                );
            }
            EventKind::NetworkStateChanged {
                online,
                connection_type,
                downlink_mbps,
                rtt_ms,
            } => {
                let _ = app.emit(
                    "limen://network/state",
                    serde_json::json!({
                        "online": online,
                        "connection_type": connection_type,
                        "downlink_mbps": downlink_mbps,
                        "rtt_ms": rtt_ms,
                    }),
                );
            }
            EventKind::NetworkDeviceFound {
                ip,
                mac,
                hostname,
                signal_dbm,
            } => {
                let _ = app.emit(
                    "limen://network/device",
                    serde_json::json!({
                        "ip": ip, "mac": mac,
                        "hostname": hostname, "signal_dbm": signal_dbm,
                    }),
                );
            }
            _ => {
                // Other events (MobileConnected, PluginLoaded, …) forwarded generically.
                let raw = serde_json::to_value(&event.kind).unwrap_or_default();
                let _ = app.emit("limen://event", raw);
            }
        }
    }
} // end mod unix_impl

#[cfg(unix)]
pub use unix_impl::{request, run_event_listener};
