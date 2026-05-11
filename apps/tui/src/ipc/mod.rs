//! IPC client for the TUI — connects to limen-core Unix socket.

use anyhow::Result;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::net::UnixStream;
use tokio::net::unix::{OwnedReadHalf, OwnedWriteHalf};
use tokio::sync::mpsc;

use limen_core::LimenEvent;
use limen_core::ipc::{IpcRequest, IpcResponse};

pub struct IpcClient {
    writer: OwnedWriteHalf,
    lines: Lines<BufReader<OwnedReadHalf>>,
}

impl IpcClient {
    pub async fn connect() -> Result<Self> {
        let path =
            std::env::var("LIMEN_SOCKET").unwrap_or_else(|_| "/run/limen/core.sock".into());
        let stream = UnixStream::connect(&path).await?;
        let (reader, writer) = stream.into_split();
        Ok(Self {
            writer,
            lines: BufReader::new(reader).lines(),
        })
    }

    pub async fn send(&mut self, req: IpcRequest) -> Result<IpcResponse> {
        let mut line = serde_json::to_string(&req)?;
        line.push('\n');
        self.writer.write_all(line.as_bytes()).await?;

        if let Some(resp_line) = self.lines.next_line().await? {
            let resp: IpcResponse = serde_json::from_str(&resp_line)?;
            return Ok(resp);
        }
        anyhow::bail!("IPC connection closed")
    }

    /// Subscribe to all events from synapsd and forward them to `tx`.
    ///
    /// This consumes the client. Run in a dedicated background task.
    /// Caller should loop-reconnect: if this returns, the connection dropped.
    pub async fn event_loop(mut self, tx: mpsc::Sender<LimenEvent>) -> Result<()> {
        // Send Subscribe (empty = all event types).
        self.send(IpcRequest::Subscribe { events: vec![] }).await?;

        // Stream events until connection closes.
        while let Some(line) = self.lines.next_line().await? {
            if let Ok(IpcResponse::Event { event }) = serde_json::from_str::<IpcResponse>(&line)
                && tx.send(event).await.is_err()
            {
                break; // TUI shut down
            }
        }
        Ok(())
    }
}
