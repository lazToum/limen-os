//! Tauri commands — IPC bridge between WebView frontend and Rust backend.
//!
//! Structs are plain serde — specta::Type added back in Phase 3.

// cspell: disable

use serde::{Deserialize, Serialize};
use tauri::command;

// ─── Types ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct VoiceCommandResult {
    pub intent: String,
    pub action: String,
    pub response: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AiQueryResult {
    pub content: String,
    pub model: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
    pub latency_ms: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionInfo {
    pub user: Option<String>,
    pub locked: bool,
    pub scene: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppEntry {
    /// Unique app identifier (e.g. "org.gnome.Terminal").
    pub id: String,
    /// Display name.
    pub name: String,
    /// Icon name from the icon theme (e.g. "utilities-terminal").
    pub icon: String,
    /// Desktop categories (e.g. ["System", "TerminalEmulator"]).
    pub categories: Vec<String>,
    /// Command to launch (e.g. "gnome-terminal").
    pub exec: String,
}

// ─── Commands ────────────────────────────────────────────────────────────────

/// Process a voice transcript — forwards to synapsd.
///
/// If AgentFlow is up, it's queued there (async response via events).
/// If AgentFlow is down, synapsd recognizes intent directly and returns
/// the result synchronously. Either way, Tauri events are fired for UI updates.
#[command]
pub async fn voice_command(
    app: tauri::AppHandle,
    transcript: String,
) -> Result<VoiceCommandResult, String> {
    use tauri::Emitter;

    let payload = crate::ipc_client::request(limen_core::ipc::IpcRequest::VoiceCommand {
        transcript: transcript.clone(),
    })
    .await
    .map_err(|e| e.to_string())?;

    let intent = payload
        .get("intent")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let action = payload
        .get("action")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let target = payload
        .get("target")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    // AI response text from synapsd (set for ai_query / unknown intents).
    let ai_response = payload
        .get("response")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Forward OS intents to the shell frontend immediately.
    match intent.as_str() {
        "open_app" => {
            let _ = app.emit("limen://window/open", &target);
        }
        "set_scene" => {
            let _ = app.emit("limen://scene", &target);
        }
        "system_command" if target == "lock" => {
            let _ = app.emit("limen://scene", "greeter");
        }
        _ => {}
    }

    // Speak a natural-language acknowledgement via TTS.
    // For ai_query / unknown: use the actual AI response if available.
    let speech = if !ai_response.is_empty() {
        ai_response
    } else {
        match intent.as_str() {
            "open_app" => format!("Opening {target}"),
            "set_scene" => format!("Switching to {target}"),
            "system_command" => target.to_string(),
            "unknown" => "Sorry, I didn't understand that.".into(),
            _ => format!("Done: {action}"),
        }
    };
    let _ = app.emit("limen://tts/speak", &speech);

    Ok(VoiceCommandResult {
        intent,
        action,
        response: speech,
    })
}

/// Speak text via TTS — frontend uses Web Speech Synthesis API.
#[command]
pub async fn tts_speak(text: String) -> Result<(), String> {
    if text.is_empty() {
        return Ok(());
    }
    // pyttsx3 is installed on this host — use it for native audio in Tauri.
    // Fire-and-forget: don't block the IPC thread.
    let _ = tokio::process::Command::new("python3")
        .args([
            "-c",
            &format!(
                "import pyttsx3; e=pyttsx3.init(); e.setProperty('rate',165); e.say({:?}); e.runAndWait()",
                text
            ),
        ])
        .spawn();
    Ok(())
}

/// General AI query — routed through synapsd → AgentFlow.
///
/// The response arrives asynchronously via the `limen://notify` Tauri event
/// (from the `agents/*/chat` MQTT topic).
#[command]
pub async fn ai_query(prompt: String, model: Option<String>) -> Result<AiQueryResult, String> {
    let t0 = std::time::Instant::now();
    crate::ipc_client::request(limen_core::ipc::IpcRequest::AiQuery { prompt, model })
        .await
        .map(|payload| {
            let queued = payload
                .get("queued")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            AiQueryResult {
                content: if queued {
                    String::new() // async via AgentFlow → limen://notify event
                } else {
                    payload
                        .get("content")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string()
                },
                model: payload
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or(if queued { "agentflow" } else { "limen-ai" })
                    .to_string(),
                input_tokens: payload
                    .get("input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                output_tokens: payload
                    .get("output_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32,
                latency_ms: t0.elapsed().as_millis() as u64,
            }
        })
        .map_err(|e| e.to_string())
}

/// Set the active shell scene — forwards to synapsd which broadcasts it to all listeners.
#[command]
pub async fn set_scene(app: tauri::AppHandle, name: String) -> Result<(), String> {
    tracing::info!("set_scene: {name}");
    // Optimistically update the local frontend immediately.
    use tauri::Emitter;
    let _ = app.emit("limen://scene", &name);
    // Then persist through synapsd so TUI / mobile / other clients sync up.
    let _ = crate::ipc_client::request(limen_core::ipc::IpcRequest::SetScene { name }).await;
    Ok(())
}

/// Get current session info.
#[command]
pub async fn get_session() -> Result<SessionInfo, String> {
    Ok(SessionInfo {
        user: Some(
            std::env::var("USER")
                .or_else(|_| std::env::var("LOGNAME"))
                .unwrap_or_else(|_| "waldiez".into()),
        ),
        locked: false,
        scene: "home".into(),
    })
}

/// Open an app by id — routes to shell window OR native process.
///
/// Shell-native apps (terminal, settings, ai-chat, waldiez-*) are surfaced
/// as Tauri events so the frontend opens the appropriate window.
/// Everything else is launched as a native OS process.
#[command]
pub async fn open_app(app: tauri::AppHandle, app_id: String) -> Result<String, String> {
    use tauri::Emitter;

    // Shell-managed content types — just emit the event; frontend handles it.
    const SHELL_APPS: &[&str] = &[
        "terminal",
        "settings",
        "ai-chat",
        "waldiez-player",
        "waldiez-reader",
    ];
    if SHELL_APPS.contains(&app_id.as_str()) {
        let _ = app.emit("limen://window/open", &app_id);
        return Ok(format!("shell:{app_id}"));
    }

    // Native app — resolve a best-guess executable and launch it.
    let exec = resolve_native_app(&app_id);
    tracing::info!("open_app: {app_id} → {exec}");

    let pid = spawn_detached(&exec, &[])
        .await
        .map_err(|e| format!("launch failed: {e}"))?;

    Ok(format!("pid:{pid}"))
}

/// Map common voice/intent app names to real executables.
fn resolve_native_app(id: &str) -> String {
    match id.to_lowercase().as_str() {
        "terminal" | "console" | "shell" => {
            // Try in preference order.
            for bin in &[
                "gnome-terminal",
                "xterm",
                "kitty",
                "alacritty",
                "xfce4-terminal",
            ] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "xterm".into()
        }
        "browser" | "web" | "internet" => {
            for bin in &["firefox", "chromium", "google-chrome", "brave-browser"] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "firefox".into()
        }
        "files" | "file manager" | "explorer" => {
            for bin in &["nautilus", "thunar", "nemo", "dolphin", "pcmanfm"] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "nautilus".into()
        }
        "editor" | "text editor" | "text-editor" | "gedit" => {
            for bin in &["gedit", "kate", "mousepad", "xed", "pluma", "nano"] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "gedit".into()
        }
        "calculator" => {
            for bin in &["gnome-calculator", "kcalc", "galculator", "xcalc"] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "gnome-calculator".into()
        }
        "calendar" => {
            for bin in &["gnome-calendar", "korganizer", "evolution"] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "gnome-calendar".into()
        }
        "music" | "player" | "media" => {
            for bin in &["rhythmbox", "clementine", "vlc", "mpv"] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "vlc".into()
        }
        "mail" | "email" => {
            for bin in &["thunderbird", "evolution", "geary"] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "thunderbird".into()
        }
        "photos" | "images" | "gallery" => {
            for bin in &["eog", "shotwell", "gthumb", "gwenview"] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "eog".into()
        }
        "maps" => {
            for bin in &["gnome-maps", "marble"] {
                if which(bin) {
                    return bin.to_string();
                }
            }
            "gnome-maps".into()
        }
        // Pass unknown ids through directly — may be a real binary name.
        other => other.to_string(),
    }
}

fn which(bin: &str) -> bool {
    std::process::Command::new("which")
        .arg(bin)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

async fn spawn_detached(exec: &str, args: &[&str]) -> anyhow::Result<u32> {
    use std::process::Stdio;
    use tokio::process::Command;
    let child = Command::new(exec)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    Ok(child.id().unwrap_or(0))
}

/// Launch an application.
///
/// Tries in order:
///   1. `gtk-launch <id>` (for .desktop apps — best for XDG integration)
///   2. Direct `exec` command
///   3. `xdg-open` with the name as a fallback
#[command]
pub async fn launch_app(id: String, exec: Option<String>) -> Result<u32, String> {
    use std::process::Stdio;
    use tokio::process::Command;

    tracing::info!("launch_app: id={id} exec={exec:?}");

    // Try gtk-launch first (handles .desktop integration cleanly).
    let gtk_result = Command::new("gtk-launch")
        .arg(&id)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();

    if let Ok(child) = gtk_result {
        let pid = child.id().unwrap_or(0);
        tracing::info!("launched {id} via gtk-launch, pid={pid}");
        return Ok(pid);
    }

    // Fall back to exec string.
    if let Some(exec_str) = exec {
        // Strip desktop-file field codes (%u, %f, %F, etc.).
        let clean: String = exec_str
            .split_whitespace()
            .filter(|s| !s.starts_with('%'))
            .collect::<Vec<_>>()
            .join(" ");

        let mut parts = clean.split_whitespace();
        if let Some(bin) = parts.next() {
            let args: Vec<&str> = parts.collect();
            let child = Command::new(bin)
                .args(&args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("Failed to launch {bin}: {e}"))?;
            let pid = child.id().unwrap_or(0);
            tracing::info!("launched {id} via exec, pid={pid}");
            return Ok(pid);
        }
    }

    Err(format!("Could not launch {id}"))
}

/// Enumerate installed applications from XDG .desktop files.
#[command]
pub async fn list_apps() -> Result<Vec<AppEntry>, String> {
    crate::apps::discover().await.map_err(|e| e.to_string())
}

// ─── Setup ────────────────────────────────────────────────────────────────────

/// Check whether first-run setup has been completed.
/// Returns true if ~/.config/limen/setup.json exists.
#[command]
pub async fn check_setup_complete() -> bool {
    config_dir()
        .map(|d| d.join("setup.json").exists())
        .unwrap_or(false)
}

/// Persist the setup config JSON to ~/.config/limen/setup.json.
#[command]
pub async fn save_setup_config(config: String) -> Result<(), String> {
    let dir = config_dir().ok_or("cannot resolve config dir")?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    std::fs::write(dir.join("setup.json"), config).map_err(|e| e.to_string())
}

fn config_dir() -> Option<std::path::PathBuf> {
    dirs::config_dir().map(|d| d.join("limen"))
}

// ─── System stats ─────────────────────────────────────────────────────────────

/// Live system stats — CPU%, RAM used/total GiB.
/// Used by AmbientScene and HomeScene widgets.
#[derive(Debug, Serialize)]
pub struct SysInfo {
    pub cpu: f32,
    pub mem_used: f64,
    pub mem_total: f64,
    pub disk_used_pct: f64,
    pub disk_total_gib: f64,
    pub net_down_bps: f64,
    pub net_up_bps: f64,
}

#[command]
pub async fn get_sysinfo() -> Result<SysInfo, String> {
    use sysinfo::{Disks, Networks, System};

    // sysinfo requires two samples for CPU — refresh twice with a small delay.
    let mut sys = System::new();
    sys.refresh_cpu_all();
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;
    sys.refresh_cpu_all();
    sys.refresh_memory();

    let cpu = sys.global_cpu_usage();
    let mem_used = sys.used_memory() as f64 / (1u64 << 30) as f64;
    let mem_total = sys.total_memory() as f64 / (1u64 << 30) as f64;

    let disks = Disks::new_with_refreshed_list();
    let (disk_used_pct, disk_total_gib) = disks
        .iter()
        .find(|d| d.mount_point() == std::path::Path::new("/"))
        .map(|d| {
            let total = d.total_space() as f64 / (1u64 << 30) as f64;
            let avail = d.available_space() as f64 / (1u64 << 30) as f64;
            let pct = if total > 0.0 {
                (1.0 - avail / total) * 100.0
            } else {
                0.0
            };
            (pct, total)
        })
        .unwrap_or((0.0, 0.0));

    let nets = Networks::new_with_refreshed_list();
    let (recv, sent): (u64, u64) = nets.iter().fold((0, 0), |(r, s), (_, n)| {
        (r + n.received(), s + n.transmitted())
    });

    Ok(SysInfo {
        cpu,
        mem_used,
        mem_total,
        disk_used_pct,
        disk_total_gib,
        net_down_bps: recv as f64,
        net_up_bps: sent as f64,
    })
}

// ─── Camera IPC events ────────────────────────────────────────────────────────
//
// These are fire-and-forget — silently succeed when synapsd is not running so
// camera UX is never blocked by a missing daemon.

#[command]
pub async fn camera_started(device_id: String, label: String) {
    let _ = crate::ipc_client::request(limen_core::ipc::IpcRequest::CameraStarted {
        device_id,
        label,
    })
    .await;
}

#[command]
pub async fn camera_stopped(device_id: String) {
    let _ = crate::ipc_client::request(limen_core::ipc::IpcRequest::CameraStopped { device_id })
        .await;
}

#[command]
pub async fn camera_switched(from_device_id: String, to_device_id: String, label: String) {
    let _ = crate::ipc_client::request(limen_core::ipc::IpcRequest::CameraSwitched {
        from_device_id,
        to_device_id,
        label,
    })
    .await;
}

#[command]
pub async fn presence_event(present: bool, motion_score: f32) {
    let _ = crate::ipc_client::request(limen_core::ipc::IpcRequest::PresenceEvent {
        present,
        motion_score,
    })
    .await;
}

// ─── Camera enumeration ───────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CameraInfo {
    pub id: String,
    pub label: String,
    pub path: String,
    pub source: String,
}

/// Enumerate v4l2 capture devices from /sys/class/video4linux.
///
/// Only reports nodes where the kernel "index" file == 0, which identifies
/// the primary capture interface of a device (skips metadata/subdev nodes).
#[command]
pub async fn list_cameras() -> Vec<CameraInfo> {
    let mut cameras = vec![];

    let Ok(entries) = std::fs::read_dir("/sys/class/video4linux") else {
        return cameras;
    };

    let mut entries: Vec<_> = entries.flatten().collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let dir_name = entry.file_name().to_string_lossy().to_string();
        if !dir_name.starts_with("video") {
            continue;
        }

        let Ok(index): Result<u32, _> = dir_name[5..].parse() else {
            continue;
        };

        // Skip metadata / sub-device nodes — only take capture index 0 nodes.
        let iface_idx: u32 = std::fs::read_to_string(entry.path().join("index"))
            .ok()
            .and_then(|s| s.trim().parse().ok())
            .unwrap_or(0);
        if iface_idx != 0 {
            continue;
        }

        let label = std::fs::read_to_string(entry.path().join("name"))
            .unwrap_or_else(|_| format!("Camera {index}"))
            .trim()
            .to_string();

        cameras.push(CameraInfo {
            id: format!("native:{index}"),
            label,
            path: format!("/dev/video{index}"),
            source: "native".into(),
        });
    }

    cameras
}

// ─── Network IPC + scan ───────────────────────────────────────────────────────

/// Forward a browser network-state change to synapsd (fire-and-forget).
#[command]
pub async fn network_state_event(
    online: bool,
    connection_type: String,
    downlink_mbps: f32,
    rtt_ms: u32,
) {
    let _ = crate::ipc_client::request(limen_core::ipc::IpcRequest::NetworkStateEvent {
        online,
        connection_type,
        downlink_mbps,
        rtt_ms,
    })
    .await;
}

#[derive(Debug, Serialize)]
pub struct NetworkDevice {
    pub ip: String,
    pub mac: Option<String>,
    pub hostname: Option<String>,
    pub signal_dbm: Option<i32>,
    pub source: String, // "wifi" | "arp" | "neigh"
}

/// Scan the local network.
///
/// 1. `nmcli dev wifi list` — nearby Wi-Fi APs (SSID, BSSID, signal).
/// 2. `ip neigh show` — ARP cache (known LAN hosts).
///
/// Both commands are best-effort; any that are missing are silently skipped.
/// Results are also emitted as `NetworkDeviceFound` WID events to synapsd.
#[command]
pub async fn scan_network() -> Vec<NetworkDevice> {
    let mut devices: Vec<NetworkDevice> = vec![];

    // 1. Wi-Fi scan via nmcli.
    if let Ok(out) = tokio::process::Command::new("nmcli")
        .args(["-t", "-f", "SSID,BSSID,SIGNAL", "dev", "wifi", "list"])
        .output()
        .await
    {
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            let parts: Vec<&str> = line.splitn(3, ':').collect();
            if parts.len() < 3 {
                continue;
            }
            let ssid = parts[0].trim().to_string();
            let bssid = parts[1].trim().to_string();
            let signal: i32 = parts[2].trim().parse().unwrap_or(0);
            if ssid.is_empty() && bssid.is_empty() {
                continue;
            }
            devices.push(NetworkDevice {
                ip: String::new(),
                mac: Some(bssid),
                hostname: if ssid.is_empty() { None } else { Some(ssid) },
                signal_dbm: Some(signal),
                source: "wifi".into(),
            });
        }
    }

    // 2. ARP/neighbour table via `ip neigh show`.
    if let Ok(out) = tokio::process::Command::new("ip")
        .args(["neigh", "show"])
        .output()
        .await
    {
        let text = String::from_utf8_lossy(&out.stdout);
        for line in text.lines() {
            // Format: "192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE"
            let mut words = line.split_whitespace();
            let ip = words.next().unwrap_or("").to_string();
            // skip "dev" and iface name
            let _dev = words.next();
            let _iface = words.next();
            // "lladdr" keyword
            let lladdr_kw = words.next().unwrap_or("");
            let mac = if lladdr_kw == "lladdr" {
                words.next().map(|s| s.to_string())
            } else {
                None
            };
            if ip.is_empty() {
                continue;
            }
            // Don't duplicate IPs already listed from Wi-Fi scan.
            if devices.iter().any(|d| d.ip == ip) {
                continue;
            }
            devices.push(NetworkDevice {
                ip: ip.clone(),
                mac: mac.clone(),
                hostname: None,
                signal_dbm: None,
                source: "neigh".into(),
            });
        }
    }

    // Emit each device as a WID-stamped event to synapsd (best-effort).
    for d in &devices {
        let _ = crate::ipc_client::request(limen_core::ipc::IpcRequest::Custom {
            name: "network_device_found".into(),
            payload: serde_json::json!({
                "ip":         d.ip,
                "mac":        d.mac,
                "hostname":   d.hostname,
                "signal_dbm": d.signal_dbm,
                "source":     d.source,
            }),
        })
        .await;
    }

    devices
}

// ─── Waldiez execution ────────────────────────────────────────────────────────

/// Check if the waldiez Python package is installed and executable.
#[command]
pub async fn waldiez_check() -> bool {
    tokio::process::Command::new("python3")
        .args(["-c", "import waldiez"])
        .status()
        .await
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Run a Waldiez flow JSON via `python3 -m waldiez run`.
/// Streams stdout/stderr back as `limen://waldiez/output` Tauri events.
/// Emits `limen://waldiez/done` when the process exits.
#[command]
pub async fn waldiez_run(app: tauri::AppHandle, flow_json: String) -> Result<(), String> {
    use tauri::Emitter;
    use tokio::io::AsyncBufReadExt;

    let tmp = std::env::temp_dir().join("limen_waldiez_run.waldiez");
    std::fs::write(&tmp, &flow_json).map_err(|e| e.to_string())?;

    let mut child = tokio::process::Command::new("python3")
        .args(["-m", "waldiez", "run", tmp.to_str().unwrap_or_default()])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("waldiez spawn: {e}"))?;

    let emit = |a: &tauri::AppHandle, line: &str, stream: &str| {
        let _ = a.emit(
            "limen://waldiez/output",
            serde_json::json!({ "line": line, "stream": stream }),
        );
    };

    if let Some(stdout) = child.stdout.take() {
        let a = app.clone();
        tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stdout).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                emit(&a, &l, "stdout");
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let a = app.clone();
        tokio::spawn(async move {
            let mut lines = tokio::io::BufReader::new(stderr).lines();
            while let Ok(Some(l)) = lines.next_line().await {
                emit(&a, &l, "stderr");
            }
        });
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let _ = app.emit(
        "limen://waldiez/done",
        serde_json::json!({ "success": status.success() }),
    );
    Ok(())
}

/// Convert a Waldiez flow to Python (.py) or Jupyter notebook (.ipynb).
/// Returns the converted file content as a string.
#[command]
pub async fn waldiez_convert(flow_json: String, to: String) -> Result<String, String> {
    let tmp = std::env::temp_dir().join("limen_waldiez_convert.waldiez");
    let ext = if to == "ipynb" { "ipynb" } else { "py" };
    let out = std::env::temp_dir().join(format!("limen_waldiez_out.{ext}"));

    std::fs::write(&tmp, &flow_json).map_err(|e| e.to_string())?;

    let status = tokio::process::Command::new("python3")
        .args([
            "-m",
            "waldiez",
            "convert",
            "--to",
            &to,
            "--flow",
            tmp.to_str().unwrap_or_default(),
            "--output",
            out.to_str().unwrap_or_default(),
        ])
        .status()
        .await
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("waldiez convert failed — check that waldiez is installed".into());
    }
    std::fs::read_to_string(&out).map_err(|e| e.to_string())
}

/// Stop a running waldiez flow (sends SIGTERM via a sentinel file / future IPC).
/// Currently a best-effort stub — upgrade to process group kill when needed.
#[command]
pub async fn waldiez_stop() -> Result<(), String> {
    // TODO: track child PID in shared state and kill it.
    Ok(())
}

/// Forward a user input response to the running waldiez process (stdin write).
#[command]
pub async fn waldiez_input(_value: String) -> Result<(), String> {
    // TODO: wire to child stdin.
    Ok(())
}

/// Send a step-by-step control message (continue / step / breakpoint).
#[command]
pub async fn waldiez_control(_value: serde_json::Value) -> Result<(), String> {
    // TODO: wire to child IPC channel.
    Ok(())
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

#[allow(dead_code)]
const INTENT_SYSTEM_PROMPT: &str = r#"You are LIMEN OS. Parse the voice command and respond ONLY with JSON (no markdown):
{"intent":"open_app|close_app|set_scene|search|ai_query|system|unknown","target":"string","confidence":0.0}"#;

#[allow(dead_code)]
async fn dispatch_intent(app: &tauri::AppHandle, intent: &str, target: &str) -> String {
    use tauri::Emitter;
    match intent {
        "open_app" => {
            // Fire-and-forget launch.
            let t = target.to_string();
            tokio::spawn(async move {
                let _ = tokio::process::Command::new("gtk-launch").arg(&t).spawn();
            });
            format!("Launching {target}")
        }
        "set_scene" => {
            // Push scene transition to frontend.
            let _ = app.emit("limen://scene", target);
            format!("scene:{target}")
        }
        "system" if target == "lock" => {
            let _ = app.emit("limen://scene", "greeter");
            "lock".into()
        }
        "system" if target == "shutdown" || target == "poweroff" => "poweroff".into(),
        _ => "none".into(),
    }
}

// ─── Filesystem ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsEntry {
    pub name: String,
    pub path: String,
    pub kind: String, // "dir" | "file"
    pub ext: String,  // lowercase extension, e.g. "rs"
    pub size: Option<u64>,
    pub modified: Option<i64>, // unix seconds
}

#[command]
pub async fn list_dir(path: String) -> Result<Vec<FsEntry>, String> {
    let rd = std::fs::read_dir(&path).map_err(|e| e.to_string())?;
    let mut entries: Vec<FsEntry> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            } // skip hidden
            let meta = e.metadata().ok()?;
            let kind = if meta.is_dir() { "dir" } else { "file" };
            let ext = if meta.is_file() {
                std::path::Path::new(&name)
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase()
            } else {
                String::new()
            };
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs() as i64);
            Some(FsEntry {
                name,
                path: e.path().to_string_lossy().into_owned(),
                kind: kind.into(),
                ext,
                size: if meta.is_file() {
                    Some(meta.len())
                } else {
                    None
                },
                modified,
            })
        })
        .collect();
    entries.sort_by(|a, b| match (a.kind.as_str(), b.kind.as_str()) {
        ("dir", "file") => std::cmp::Ordering::Less,
        ("file", "dir") => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });
    Ok(entries)
}

#[command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.len() > 256 * 1024 {
        return Ok(format!(
            "[File too large to preview ({} KB)]",
            bytes.len() / 1024
        ));
    }
    String::from_utf8(bytes).map_err(|_| "Binary file — cannot preview as text".into())
}

// ─── Native browser window ───────────────────────────────────────────────────

/// Open (or focus) a native Tauri WebviewWindow for a given URL.
/// Label should be stable per shell-window so reopening focuses instead of duping.
#[command]
pub async fn open_browser_window(
    app: tauri::AppHandle,
    label: String,
    url: String,
    title: String,
) -> Result<(), String> {
    use tauri::Manager as _;
    // If a window with this label already exists, just focus it.
    if let Some(win) = app.get_webview_window(&label) {
        let _ = win.set_focus();
        return Ok(());
    }
    let parsed = url
        .parse::<tauri::Url>()
        .map_err(|e| format!("invalid url: {e}"))?;
    tauri::WebviewWindowBuilder::new(&app, &label, tauri::WebviewUrl::External(parsed))
        .title(title)
        .inner_size(1280.0, 800.0)
        .decorations(true)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Navigate an existing native browser window to a new URL.
#[command]
pub async fn browser_window_navigate(
    app: tauri::AppHandle,
    label: String,
    url: String,
) -> Result<(), String> {
    use tauri::Manager as _;
    if let Some(win) = app.get_webview_window(&label) {
        // eval is the safest cross-platform navigation method.
        win.eval(format!("window.location.href = {:?}", url))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Close a native browser window opened by open_browser_window.
#[command]
pub async fn close_browser_window(app: tauri::AppHandle, label: String) -> Result<(), String> {
    use tauri::Manager as _;
    if let Some(win) = app.get_webview_window(&label) {
        win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}
