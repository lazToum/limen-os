//! TUI application state and async event loop.

use anyhow::Result;
use crossterm::event::{Event, EventStream, KeyCode, KeyModifiers};
use futures::StreamExt;
use ratatui::DefaultTerminal;
use std::sync::Arc;
use tokio::sync::mpsc;

use crate::sysinfo::{SysCollector, SysSnapshot};
use limen_core::ipc::{IpcRequest, IpcResponse};

use crate::ipc::IpcClient;
use crate::ui;

// ── Tab ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum Tab {
    Home,
    Apps,
    Voice,
    Ai,
    System,
}

impl Tab {
    pub fn all() -> &'static [Tab] {
        &[Tab::Home, Tab::Apps, Tab::Voice, Tab::Ai, Tab::System]
    }

    pub fn label(&self) -> &'static str {
        match self {
            Tab::Home => "home",
            Tab::Apps => "apps",
            Tab::Voice => "voice",
            Tab::Ai => "ai",
            Tab::System => "system",
        }
    }
}

// ── Chat ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub enum ChatRole {
    User,
    Assistant,
    Error,
}

#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: ChatRole,
    pub content: String,
    pub model: Option<String>,
    pub latency_ms: Option<u64>,
    pub tokens_in: Option<u32>,
    pub tokens_out: Option<u32>,
}

impl ChatMessage {
    pub fn user(content: String) -> Self {
        Self {
            role: ChatRole::User,
            content,
            model: None,
            latency_ms: None,
            tokens_in: None,
            tokens_out: None,
        }
    }

    pub fn assistant(
        content: String,
        model: String,
        latency_ms: u64,
        tokens_in: u32,
        tokens_out: u32,
    ) -> Self {
        Self {
            role: ChatRole::Assistant,
            content,
            model: Some(model),
            latency_ms: Some(latency_ms),
            tokens_in: Some(tokens_in),
            tokens_out: Some(tokens_out),
        }
    }

    pub fn error(content: String) -> Self {
        Self {
            role: ChatRole::Error,
            content,
            model: None,
            latency_ms: None,
            tokens_in: None,
            tokens_out: None,
        }
    }
}

// ── App entry ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct AppEntry {
    pub name: String,
    pub exec: String,
    pub categories: String,
}

// ── Internal events ───────────────────────────────────────────────────────────

pub enum TuiEvent {
    Key(crossterm::event::KeyEvent),
    SysSnap(SysSnapshot),
    AiDone {
        content: String,
        model: String,
        latency_ms: u64,
        tokens_in: u32,
        tokens_out: u32,
    },
    AiError(String),
    AppsLoaded(Vec<AppEntry>),
    /// Streaming event received from synapsd via IPC subscription.
    IpcEvent(limen_core::LimenEvent),
}

// ── App state ─────────────────────────────────────────────────────────────────

pub struct AppState {
    pub active_tab: Tab,
    pub voice_text: String,
    pub voice_listening: bool,
    pub ai_thinking: bool,
    pub session_user: String,
    pub ai_model: String,
    /// Shared input line (AI chat input or command bar).
    pub input: String,
    pub input_active: bool,
    pub should_quit: bool,
    /// AI tab.
    pub chat: Vec<ChatMessage>,
    /// System tab.
    pub sys: SysSnapshot,
    /// Apps tab.
    pub apps: Vec<AppEntry>,
    pub app_filter: String,
    pub app_scroll: usize,
    /// Queued IPC request to dispatch after key handling (avoids async in handle_key).
    pub pending_ipc: Option<IpcRequest>,
    /// Last IPC response or status message shown in the voice bar.
    pub ipc_response: Option<String>,
    /// Current shell scene (updated via IPC events).
    pub scene: String,
    /// Recent notifications from synapsd (title, body).
    pub notifications: std::collections::VecDeque<(String, String)>,
    /// Last event description (voice, app launch, etc.).
    pub last_event: Option<String>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            active_tab: Tab::Home,
            voice_text: String::new(),
            voice_listening: false,
            ai_thinking: false,
            session_user: std::env::var("USER")
                .or_else(|_| std::env::var("LOGNAME"))
                .unwrap_or_else(|_| "waldiez".into()),
            ai_model: "Claude Sonnet 4.6".into(),
            input: String::new(),
            input_active: false,
            should_quit: false,
            chat: Vec::new(),
            sys: SysSnapshot::default(),
            apps: Vec::new(),
            app_filter: String::new(),
            app_scroll: 0,
            pending_ipc: None,
            ipc_response: None,
            scene: "home".into(),
            notifications: std::collections::VecDeque::new(),
            last_event: None,
        }
    }
}

// ── Entry point ───────────────────────────────────────────────────────────────

pub async fn run() -> Result<()> {
    let ai = Arc::new(limen_ai::router::AiRouter::from_env());
    let terminal = ratatui::init();
    let result = run_loop(terminal, ai).await;
    ratatui::restore();
    result
}

async fn run_loop(
    mut terminal: DefaultTerminal,
    ai: Arc<limen_ai::router::AiRouter>,
) -> Result<()> {
    let (tx, mut rx) = mpsc::channel::<TuiEvent>(128);
    let mut state = AppState::default();

    // ── Keyboard events via async EventStream ──
    let tx_key = tx.clone();
    tokio::spawn(async move {
        let mut stream = EventStream::new();
        while let Some(Ok(Event::Key(key))) = stream.next().await {
            if tx_key.send(TuiEvent::Key(key)).await.is_err() {
                break;
            }
        }
    });

    // ── System stats — native thread, 1s interval ──
    let tx_sys = tx.clone();
    std::thread::spawn(move || {
        let mut col = SysCollector::new();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let snap = col.collect();
            if tx_sys.blocking_send(TuiEvent::SysSnap(snap)).is_err() {
                break;
            }
        }
    });

    // ── App list — scan .desktop files in background ──
    let tx_apps = tx.clone();
    std::thread::spawn(move || {
        let apps = scan_apps();
        let _ = tx_apps.blocking_send(TuiEvent::AppsLoaded(apps));
    });

    // Try to connect to synapsd; non-fatal if offline.
    let mut ipc = IpcClient::connect().await.ok();
    if ipc.is_none() {
        state.ipc_response = Some("IPC: synapsd offline".into());
    }

    // Background event subscriber — reconnects automatically if synapsd restarts.
    {
        let (ev_tx, mut ev_rx) = tokio::sync::mpsc::channel::<limen_core::LimenEvent>(64);
        let tx_ev = tx.clone();
        // Subscriber loop: connect → subscribe → stream → reconnect on drop.
        tokio::spawn(async move {
            loop {
                if let Ok(client) = IpcClient::connect().await {
                    let _ = client.event_loop(ev_tx.clone()).await;
                }
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        });
        // Forward LimenEvents into the main TuiEvent channel.
        tokio::spawn(async move {
            while let Some(event) = ev_rx.recv().await {
                if tx_ev.send(TuiEvent::IpcEvent(event)).await.is_err() {
                    break;
                }
            }
        });
    }

    // ── Main loop ──
    loop {
        terminal.draw(|frame| ui::render(frame, &state))?;

        let Some(event) = rx.recv().await else { break };

        match event {
            TuiEvent::Key(key) => handle_key(&mut state, key, &tx, &ai).await,
            TuiEvent::SysSnap(snap) => state.sys = snap,
            TuiEvent::AiDone {
                content,
                model,
                latency_ms,
                tokens_in,
                tokens_out,
            } => {
                state.ai_thinking = false;
                state.ai_model = model.clone();
                state.chat.push(ChatMessage::assistant(
                    content, model, latency_ms, tokens_in, tokens_out,
                ));
            }
            TuiEvent::AiError(e) => {
                state.ai_thinking = false;
                state.chat.push(ChatMessage::error(e));
            }
            TuiEvent::AppsLoaded(apps) => state.apps = apps,
            TuiEvent::IpcEvent(event) => handle_ipc_event(&mut state, event),
        }

        // Dispatch any pending IPC command.
        if let Some(req) = state.pending_ipc.take() {
            match ipc {
                Some(ref mut client) => match client.send(req).await {
                    Ok(IpcResponse::Ok { payload }) => {
                        state.ipc_response = Some(format!("ok: {payload}"));
                    }
                    Ok(IpcResponse::Error { code, message }) => {
                        state.ipc_response = Some(format!("err {code}: {message}"));
                    }
                    Ok(IpcResponse::Event { .. }) => {}
                    Err(e) => {
                        state.ipc_response = Some(format!("IPC error: {e}"));
                        ipc = None; // connection lost
                    }
                },
                None => {
                    // Try to reconnect once.
                    ipc = IpcClient::connect().await.ok();
                    state.ipc_response = Some(if ipc.is_some() {
                        "IPC: reconnected".into()
                    } else {
                        "IPC: not connected".into()
                    });
                }
            }
        }

        if state.should_quit {
            break;
        }
    }

    Ok(())
}

// ── Key handler ───────────────────────────────────────────────────────────────

async fn handle_key(
    state: &mut AppState,
    key: crossterm::event::KeyEvent,
    tx: &mpsc::Sender<TuiEvent>,
    ai: &Arc<limen_ai::router::AiRouter>,
) {
    use KeyCode::{BackTab, Backspace, Char, Down, Enter, Esc, Up};

    // ── Input mode (AI chat + command bar) ──
    if state.input_active {
        match (key.modifiers, key.code) {
            (_, Esc) => {
                state.input_active = false;
                state.input.clear();
            }
            (_, Enter) => {
                let text = state.input.trim().to_string();
                state.input.clear();
                if !text.is_empty() {
                    if state.active_tab == Tab::Ai && !text.starts_with('/') {
                        // Pure AI chat on the AI tab.
                        if !state.ai_thinking {
                            state.chat.push(ChatMessage::user(text.clone()));
                            state.ai_thinking = true;
                            let history = state.chat.clone();
                            let tx2 = tx.clone();
                            let ai2 = ai.clone();
                            tokio::spawn(async move {
                                dispatch_ai(text, history, tx2, ai2).await;
                            });
                        }
                    } else {
                        // Slash command (or non-AI tab plain text → VoiceCommand).
                        state.pending_ipc = Some(parse_command(&text));
                    }
                }
                // Stay in input mode on the AI tab
                if state.active_tab != Tab::Ai {
                    state.input_active = false;
                }
            }
            (_, Backspace) => {
                state.input.pop();
            }
            (_, Char(c)) => state.input.push(c),
            _ => {}
        }
        return;
    }

    // ── Normal mode ──
    match (key.modifiers, key.code) {
        (KeyModifiers::CONTROL, Char('q')) | (KeyModifiers::CONTROL, Char('c')) => {
            state.should_quit = true;
        }
        (_, KeyCode::Tab) => {
            let tabs = Tab::all();
            let pos = tabs
                .iter()
                .position(|t| *t == state.active_tab)
                .unwrap_or(0);
            state.active_tab = tabs[(pos + 1) % tabs.len()].clone();
        }
        (KeyModifiers::SHIFT, BackTab) => {
            let tabs = Tab::all();
            let pos = tabs
                .iter()
                .position(|t| *t == state.active_tab)
                .unwrap_or(0);
            state.active_tab = tabs[(pos + tabs.len() - 1) % tabs.len()].clone();
        }

        // AI tab: Enter activates chat input
        (_, Enter) if state.active_tab == Tab::Ai => {
            if !state.ai_thinking {
                state.input_active = true;
            }
        }

        // Apps tab: typing filters, arrows navigate, Enter launches
        (_, Up) if state.active_tab == Tab::Apps => {
            state.app_scroll = state.app_scroll.saturating_sub(1);
        }
        (_, Down) if state.active_tab == Tab::Apps => {
            let max = filtered_apps(state).len().saturating_sub(1);
            if state.app_scroll < max {
                state.app_scroll += 1;
            }
        }
        (_, Enter) if state.active_tab == Tab::Apps => {
            let apps = filtered_apps(state);
            if let Some(app) = apps.get(state.app_scroll) {
                let exec = app.exec.clone();
                tokio::spawn(async move { launch_app(&exec).await });
            }
        }
        (_, Backspace) if state.active_tab == Tab::Apps => {
            state.app_filter.pop();
            state.app_scroll = 0;
        }
        (KeyModifiers::NONE, Char(c)) if state.active_tab == Tab::Apps => {
            state.app_filter.push(c);
            state.app_scroll = 0;
        }

        // Command bar on all other tabs
        (_, Char('/')) | (KeyModifiers::CONTROL, Char('k')) => {
            state.input_active = true;
        }

        _ => {}
    }
}

fn filtered_apps(state: &AppState) -> Vec<&AppEntry> {
    let lower = state.app_filter.to_lowercase();
    state
        .apps
        .iter()
        .filter(|a| lower.is_empty() || a.name.to_lowercase().contains(&lower))
        .collect()
}

// ── AI query dispatch ─────────────────────────────────────────────────────────

async fn dispatch_ai(
    prompt: String,
    history: Vec<ChatMessage>,
    tx: mpsc::Sender<TuiEvent>,
    ai: Arc<limen_ai::router::AiRouter>,
) {
    // Try IPC daemon first.
    let ipc_result = async {
        let mut client = IpcClient::connect().await?;
        let req = IpcRequest::AiQuery {
            prompt: prompt.clone(),
            model: None,
        };
        match client.send(req).await? {
            IpcResponse::Ok { payload } => {
                let content = payload["content"].as_str().unwrap_or("").to_string();
                let model = payload["model"].as_str().unwrap_or("AI").to_string();
                let latency_ms = payload["latency_ms"].as_u64().unwrap_or(0);
                let tokens_in = payload["input_tokens"].as_u64().unwrap_or(0) as u32;
                let tokens_out = payload["output_tokens"].as_u64().unwrap_or(0) as u32;
                anyhow::Ok((content, model, latency_ms, tokens_in, tokens_out))
            }
            IpcResponse::Error { message, .. } => Err(anyhow::anyhow!(message)),
            _ => Err(anyhow::anyhow!("unexpected IPC response")),
        }
    }
    .await;

    let result = match ipc_result {
        Ok(r) => Ok(r),
        Err(_) => {
            // Fallback: call AI router directly.
            let msgs: Vec<limen_ai::router::ChatMessage> = history
                .iter()
                .filter_map(|m| match m.role {
                    ChatRole::User => Some(limen_ai::router::ChatMessage {
                        role: "user".into(),
                        content: m.content.clone(),
                    }),
                    ChatRole::Assistant => Some(limen_ai::router::ChatMessage {
                        role: "assistant".into(),
                        content: m.content.clone(),
                    }),
                    ChatRole::Error => None,
                })
                .collect();

            let req = limen_ai::router::AiRequest {
                prompt,
                system: Some(
                    "You are LIMEN OS, an AI-native terminal assistant. \
                     Be concise and helpful. Markdown is rendered in the TUI."
                        .into(),
                ),
                model_hint: None,
                max_tokens: Some(2048),
                temperature: Some(0.7),
                tools: vec![],
                history: msgs,
                skip_context: false,
            };
            ai.complete(req).await.map(|r| {
                (
                    r.content,
                    r.model_used.display_name().to_string(),
                    r.latency_ms,
                    r.input_tokens,
                    r.output_tokens,
                )
            })
        }
    };

    let event = match result {
        Ok((content, model, latency_ms, tokens_in, tokens_out)) => TuiEvent::AiDone {
            content,
            model,
            latency_ms,
            tokens_in,
            tokens_out,
        },
        Err(e) => TuiEvent::AiError(e.to_string()),
    };
    let _ = tx.send(event).await;
}

// ── App launcher ──────────────────────────────────────────────────────────────

async fn launch_app(exec: &str) {
    // Strip field codes (%u, %f, %F, %U, etc.) from Exec line.
    let cmd: String = exec
        .split_whitespace()
        .filter(|s| !s.starts_with('%'))
        .collect::<Vec<_>>()
        .join(" ");
    let _ = tokio::process::Command::new("sh")
        .args(["-c", &cmd])
        .spawn();
}

// ── .desktop file scanner ─────────────────────────────────────────────────────

fn scan_apps() -> Vec<AppEntry> {
    let dirs = [
        "/usr/share/applications",
        "/usr/local/share/applications",
        &format!(
            "{}/.local/share/applications",
            std::env::var("HOME").unwrap_or_else(|_| "/root".into())
        ),
    ];

    let mut apps: Vec<AppEntry> = Vec::new();

    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("desktop") {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };

            let mut name: Option<String> = None;
            let mut exec: Option<String> = None;
            let mut categories = String::new();
            let mut skip = false;
            let mut in_desktop_entry = false;

            for line in content.lines() {
                if line == "[Desktop Entry]" {
                    in_desktop_entry = true;
                    continue;
                }
                if line.starts_with('[') && line != "[Desktop Entry]" {
                    // Entering another section — stop parsing main entry.
                    if in_desktop_entry {
                        break;
                    }
                }
                if !in_desktop_entry {
                    continue;
                }

                if line == "NoDisplay=true" || line == "Hidden=true" {
                    skip = true;
                    break;
                }
                if line.starts_with("Name=") && name.is_none() {
                    name = Some(line[5..].to_string());
                } else if line.starts_with("Exec=") && exec.is_none() {
                    exec = Some(line[5..].to_string());
                } else if let Some(stripped) = line.strip_prefix("Categories=") {
                    categories = stripped.to_string();
                }
            }

            if skip {
                continue;
            }
            if let (Some(name), Some(exec)) = (name, exec) {
                apps.push(AppEntry {
                    name,
                    exec,
                    categories,
                });
            }
        }
    }

    apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    apps.dedup_by(|a, b| a.name == b.name);
    apps
}

/// Parse a slash-command string into an IPC request.
///
/// Supported commands:
/// - `/lock`                  → LockSession
/// - `/unlock [pin]`          → UnlockSession
/// - `/scene <name>`          → SetScene
/// - `/open <app> [args…]`    → LaunchApp
/// - `/launch <app> [args…]`  → LaunchApp
/// - `/ai <prompt>`           → AiQuery
/// - anything else            → VoiceCommand (transcript)
fn parse_command(cmd: &str) -> IpcRequest {
    let s = cmd.trim();

    if s == "/lock" || s.starts_with("/lock ") {
        return IpcRequest::LockSession;
    }
    if let Some(rest) = s.strip_prefix("/unlock") {
        let pin = rest.trim();
        return IpcRequest::UnlockSession {
            pin: if pin.is_empty() {
                None
            } else {
                Some(pin.into())
            },
        };
    }
    if let Some(rest) = s.strip_prefix("/scene ") {
        return IpcRequest::SetScene {
            name: rest.trim().into(),
        };
    }
    if let Some(rest) = s
        .strip_prefix("/open ")
        .or_else(|| s.strip_prefix("/launch "))
    {
        let mut parts = rest.split_whitespace();
        let name = parts.next().unwrap_or("").to_string();
        let args = parts.map(String::from).collect();
        return IpcRequest::LaunchApp { name, args };
    }
    if let Some(rest) = s.strip_prefix("/ai ") {
        return IpcRequest::AiQuery {
            prompt: rest.trim().into(),
            model: None,
        };
    }

    // Default: treat raw text as a voice/chat command.
    IpcRequest::VoiceCommand {
        transcript: s.trim_start_matches('/').into(),
    }
}

// ── IPC event handler ─────────────────────────────────────────────────────────

fn handle_ipc_event(state: &mut AppState, event: limen_core::LimenEvent) {
    use limen_core::EventKind;
    match event.kind {
        EventKind::SceneChanged { name } => {
            state.scene = name.clone();
            state.last_event = Some(format!("scene → {name}"));
        }
        EventKind::AppLaunched { name, pid } => {
            state.last_event = Some(format!("launched {name} (pid {pid})"));
        }
        EventKind::AppClosed { name, .. } => {
            state.last_event = Some(format!("closed {name}"));
        }
        EventKind::NotificationReceived { title, body } => {
            state
                .notifications
                .push_front((title.clone(), body.clone()));
            state.notifications.truncate(20);
            state.last_event = Some(format!("notify: {title}"));
        }
        EventKind::VoiceCommandReceived { transcript } => {
            state.voice_text = transcript;
        }
        EventKind::VoiceCommandExecuted { intent, action } => {
            state.last_event = Some(format!("voice: {intent} → {action}"));
        }
        EventKind::SessionLock => {
            state.last_event = Some("session locked".into());
        }
        EventKind::SessionUnlock => {
            state.last_event = Some("session unlocked".into());
        }
        EventKind::MobileConnected { device_id } => {
            state.last_event = Some(format!("mobile connected: {device_id}"));
        }
        EventKind::MobileDisconnected { device_id } => {
            state.last_event = Some(format!("mobile disconnected: {device_id}"));
        }
        EventKind::AiResponse { model, latency_ms } => {
            state.last_event = Some(format!("ai: {model} ({latency_ms}ms)"));
        }
        _ => {}
    }
}
