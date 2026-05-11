//! Unix socket IPC server — JSON-framed messages.

use anyhow::Result;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{UnixListener, UnixStream};
use tracing::{error, info, warn};

use super::{IpcRequest, IpcResponse};
use crate::AppState;
use limen_ai::intent::IntentKind;
use limen_ai::router::{AiRequest, ModelId};

pub const SOCKET_PATH: &str = "/run/limen/core.sock";

pub async fn run(state: AppState) -> Result<()> {
    // Ensure socket dir exists.
    tokio::fs::create_dir_all("/run/limen").await?;
    let _ = tokio::fs::remove_file(SOCKET_PATH).await;

    let listener = UnixListener::bind(SOCKET_PATH)?;
    info!("IPC server listening on {}", SOCKET_PATH);

    loop {
        match listener.accept().await {
            Ok((stream, _)) => {
                let state = state.clone();
                tokio::spawn(async move {
                    if let Err(e) = handle_client(stream, state).await {
                        error!("IPC client error: {e}");
                    }
                });
            }
            Err(e) => error!("IPC accept error: {e}"),
        }
    }
}

async fn handle_client(stream: UnixStream, state: AppState) -> Result<()> {
    let (reader, mut writer) = stream.into_split();
    let mut lines = BufReader::new(reader).lines();
    let mut event_rx = state.subscribe();

    loop {
        tokio::select! {
            line = lines.next_line() => {
                match line? {
                    None => break,
                    Some(line) => {
                        let req: IpcRequest = serde_json::from_str(&line)?;
                        let resp = dispatch(req, &state).await;
                        let mut out = serde_json::to_string(&resp)?;
                        out.push('\n');
                        writer.write_all(out.as_bytes()).await?;
                    }
                }
            }
            Ok(event) = event_rx.recv() => {
                let resp = IpcResponse::Event { event };
                let mut out = serde_json::to_string(&resp)?;
                out.push('\n');
                writer.write_all(out.as_bytes()).await?;
            }
        }
    }
    Ok(())
}

async fn spawn_native(name: &str, args: &[String]) -> u32 {
    use std::process::Stdio;
    use tokio::process::Command;
    match Command::new(name)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => child.id().unwrap_or(0),
        Err(e) => {
            tracing::warn!("spawn {name}: {e}");
            0
        }
    }
}

pub(crate) async fn dispatch(req: IpcRequest, state: &AppState) -> IpcResponse {
    match req {
        IpcRequest::GetSession => {
            let session = state.session.get();
            IpcResponse::Ok {
                payload: serde_json::json!({ "session": session }),
            }
        }
        IpcRequest::LockSession => {
            state.session.lock();
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::SessionLock,
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "locked": true }),
            }
        }
        IpcRequest::UnlockSession { .. } => {
            state.session.unlock();
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::SessionUnlock,
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "locked": false }),
            }
        }
        IpcRequest::VoiceCommand { transcript } => {
            // Emit event immediately so UI can show "processing…"
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::VoiceCommandReceived {
                    transcript: transcript.clone(),
                },
            });
            // Forward to AgentFlow if up; fall back to direct intent recognition.
            let bridge = state.agentflow.read().await;
            if let Some(ref b) = *bridge {
                b.send_voice_command(&transcript).await;
                IpcResponse::Ok {
                    payload: serde_json::json!({ "queued": true }),
                }
            } else {
                drop(bridge);
                warn!("AgentFlow not up — recognizing intent directly");
                match limen_ai::intent::recognize(&transcript, &state.ai).await {
                    Ok(intent) => {
                        // For AI/unknown intents, do a real conversational completion.
                        let ai_response = match &intent.kind {
                            IntentKind::AiQuery | IntentKind::Unknown => {
                                let req = AiRequest {
                                    prompt: transcript.clone(),
                                    system: Some("You are LIMEN OS, an AI-native desktop assistant. Be concise and conversational — your response will be spoken aloud via TTS.".into()),
                                    model_hint: None,
                                    max_tokens: Some(300),
                                    temperature: Some(0.7),
                                    tools: vec![],
                                    history: vec![],
                                    skip_context: false,
                                };
                                match state.ai.complete(req).await {
                                    Ok(resp) => Some(resp.content),
                                    Err(e) => {
                                        warn!("AI completion failed: {e}");
                                        None
                                    }
                                }
                            }
                            _ => None,
                        };
                        let action = dispatch_os_intent(&intent, state);
                        state.emit(crate::LimenEvent {
                            id: crate::wid(),
                            ts: chrono::Utc::now(),
                            kind: crate::EventKind::VoiceCommandExecuted {
                                intent: format!("{:?}", intent.kind),
                                action: action.clone(),
                            },
                        });
                        IpcResponse::Ok {
                            payload: serde_json::json!({
                                "intent": intent.kind,
                                "target": intent.target,
                                "action": action,
                                "confidence": intent.confidence,
                                "response": ai_response,
                            }),
                        }
                    }
                    Err(e) => {
                        warn!("Intent recognition failed: {e}");
                        IpcResponse::Ok {
                            payload: serde_json::json!({ "intent": "unknown" }),
                        }
                    }
                }
            }
        }
        IpcRequest::AiQuery { prompt, model } => {
            // Route through AgentFlow if available; fall back to direct AI router.
            let bridge = state.agentflow.read().await;
            if let Some(ref b) = *bridge {
                let payload = serde_json::json!({
                    "from":    "user",
                    "content": prompt,
                    "model":   model,
                });
                b.send_raw("io/chat", payload).await;
                IpcResponse::Ok {
                    payload: serde_json::json!({ "queued": true }),
                }
            } else {
                drop(bridge);
                let req = AiRequest {
                    prompt,
                    system: Some(
                        "You are LIMEN OS, an AI-native desktop assistant. Be concise and helpful."
                            .into(),
                    ),
                    model_hint: model.as_deref().and_then(parse_model_id),
                    max_tokens: Some(2048),
                    temperature: Some(0.7),
                    tools: vec![],
                    history: vec![],
                    skip_context: false,
                };
                match state.ai.complete(req).await {
                    Ok(resp) => {
                        state.emit(crate::LimenEvent {
                            id: crate::wid(),
                            ts: chrono::Utc::now(),
                            kind: crate::EventKind::AiResponse {
                                model: resp.model_used.display_name().into(),
                                latency_ms: resp.latency_ms,
                            },
                        });
                        IpcResponse::Ok {
                            payload: serde_json::json!({
                                "content":      resp.content,
                                "model":        resp.model_used.display_name(),
                                "input_tokens": resp.input_tokens,
                                "output_tokens":resp.output_tokens,
                                "latency_ms":   resp.latency_ms,
                            }),
                        }
                    }
                    Err(e) => IpcResponse::Error {
                        code: 500,
                        message: e.to_string(),
                    },
                }
            }
        }
        IpcRequest::SetScene { name } => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::SceneChanged { name },
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "ok": true }),
            }
        }
        IpcRequest::LaunchApp { name, args } => {
            // Spawn a native app and emit AppLaunched so the shell can update.
            let pid = spawn_native(&name, &args).await;
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::AppLaunched { name, pid },
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "ok": true }),
            }
        }
        IpcRequest::Subscribe { .. } => {
            // Events are streamed unconditionally on every persistent connection
            // via the select! loop in handle_client. Acknowledge the subscription.
            IpcResponse::Ok {
                payload: serde_json::json!({ "subscribed": true }),
            }
        }
        IpcRequest::Notify { title, body, kind } => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::NotificationReceived {
                    title: title.clone(),
                    body: body.clone(),
                },
            });
            // Also emit a Custom event carrying the kind field if specified.
            if let Some(k) = kind {
                state.emit(crate::LimenEvent {
                    id: crate::wid(),
                    ts: chrono::Utc::now(),
                    kind: crate::EventKind::Custom {
                        name: format!("notify:{k}"),
                        payload: serde_json::json!({ "title": title, "body": body }),
                    },
                });
            }
            IpcResponse::Ok {
                payload: serde_json::json!({ "ok": true }),
            }
        }
        IpcRequest::Custom { name, payload } => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::Custom { name, payload },
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "ok": true }),
            }
        }

        // ── Camera events ─────────────────────────────────────────────────────
        IpcRequest::CameraStarted { device_id, label } => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::CameraStarted { device_id, label },
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "ok": true }),
            }
        }
        IpcRequest::CameraStopped { device_id } => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::CameraStopped { device_id },
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "ok": true }),
            }
        }
        IpcRequest::CameraSwitched {
            from_device_id,
            to_device_id,
            label,
        } => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::CameraSwitched {
                    from_device_id,
                    to_device_id,
                    label,
                },
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "ok": true }),
            }
        }
        IpcRequest::PresenceEvent {
            present,
            motion_score,
        } => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::PresenceChanged {
                    present,
                    motion_score,
                },
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "ok": true }),
            }
        }
        IpcRequest::NetworkStateEvent {
            online,
            connection_type,
            downlink_mbps,
            rtt_ms,
        } => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::NetworkStateChanged {
                    online,
                    connection_type,
                    downlink_mbps,
                    rtt_ms,
                },
            });
            IpcResponse::Ok {
                payload: serde_json::json!({ "ok": true }),
            }
        }
        IpcRequest::ScanNetwork => {
            // Scan is performed by the Tauri command layer; here we just ack.
            IpcResponse::Ok {
                payload: serde_json::json!({ "queued": true }),
            }
        }
    }
}

/// Dispatch an OS-level intent — emit events so Tauri + TUI pick them up.
fn dispatch_os_intent(intent: &limen_ai::intent::Intent, state: &AppState) -> String {
    match &intent.kind {
        IntentKind::SetScene => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::SceneChanged {
                    name: intent.target.clone(),
                },
            });
            format!("scene:{}", intent.target)
        }
        IntentKind::OpenApp => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::AppLaunched {
                    name: intent.target.clone(),
                    pid: 0,
                },
            });
            format!("app:{}", intent.target)
        }
        IntentKind::CloseApp => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::AppClosed {
                    name: intent.target.clone(),
                    pid: 0,
                },
            });
            format!("close:{}", intent.target)
        }
        IntentKind::SystemCommand => {
            if intent.target.as_str() == "lock" {
                state.emit(crate::LimenEvent {
                    id: crate::wid(),
                    ts: chrono::Utc::now(),
                    kind: crate::EventKind::SessionLock,
                })
            }
            format!("system:{}", intent.target)
        }
        IntentKind::Search => {
            let query = intent.target.clone();
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::Custom {
                    name: "os/search".into(),
                    payload: serde_json::json!({ "query": query }),
                },
            });
            format!("search:{query}")
        }
        IntentKind::AiQuery => format!("ai:{}", intent.target),
        IntentKind::MediaControl => {
            state.emit(crate::LimenEvent {
                id: crate::wid(),
                ts: chrono::Utc::now(),
                kind: crate::EventKind::Custom {
                    name: "player:control".into(),
                    payload: serde_json::json!({ "command": intent.target }),
                },
            });
            format!("media:{}", intent.target)
        }
        _ => "none".into(),
    }
}

/// Map a model name string to a ModelId.
fn parse_model_id(s: &str) -> Option<ModelId> {
    match s.to_lowercase().as_str() {
        "claude" | "claude-sonnet" | "sonnet" => Some(ModelId::ClaudeSonnet46),
        "claude-opus" | "opus" => Some(ModelId::ClaudeOpus46),
        "claude-haiku" | "haiku" => Some(ModelId::ClaudeHaiku45),
        "gpt4o" | "gpt-4o" | "openai" | "gpt" => Some(ModelId::Gpt4o),
        "gpt4o-mini" | "gpt-4o-mini" => Some(ModelId::Gpt4oMini),
        "gemini" | "gemini-flash" => Some(ModelId::Gemini20Flash),
        "deepseek" => Some(ModelId::DeepseekV3),
        "deepseek-r1" | "r1" => Some(ModelId::DeepseekR1),
        "groq" | "llama" => Some(ModelId::GroqLlama33_70b),
        _ => None,
    }
}
