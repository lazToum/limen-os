//! LIMEN OS — Terminal UI
//!
//! A beautiful, full-featured TUI built with Ratatui.
//!
//! Layout (default):
//! ┌─────────────────────────────────────────────────────┐
//! │ LIMEN OS  [home] [apps] [voice] [ai] [system]     │ ← Tab bar
//! ├─────────────────────────────────────────────────────┤
//! │                                                     │
//! │           Main content area (tab-specific)          │
//! │                                                     │
//! ├─────────────────────────────────────────────────────┤
//! │ [mic] Listening…  "Hey Limen, open terminal"      │ ← Voice bar
//! ├─────────────────────────────────────────────────────┤
//! │ Session: waldiez@limen  │  Model: Claude Sonnet   │ ← Status bar
//! └─────────────────────────────────────────────────────┘
//!
//! Keyboard shortcuts:
//!   Tab/Shift+Tab  — switch tabs
//!   / or Ctrl+K    — voice command input
//!   Ctrl+Q         — quit
//!   ?              — help

mod app;
mod ipc;
mod sysinfo;
mod ui;

use anyhow::Result;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(std::env::var("LIMEN_LOG").unwrap_or_else(|_| "warn".into()))
        .with_writer(std::io::stderr)
        .init();

    app::run().await
}
