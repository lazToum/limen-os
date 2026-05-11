//! `synapsd` — LIMEN OS core daemon.
//!
//! Starts the IPC Unix socket server and all core subsystems.
//! Run directly for development, or via systemd/openrc in production.
//!
//! Usage:
//!   synapsd                  # run with defaults
//!   LIMEN_LOG=debug synapsd  # verbose logging
//!   LIMEN_SOCKET=/tmp/limen.sock synapsd  # custom socket path

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    limen_core::daemon::run().await
}
