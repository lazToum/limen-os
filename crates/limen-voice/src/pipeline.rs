//! Full voice pipeline: mic → VAD → wake-word → Whisper → IPC.
//!
//! ```text
//! MicCapture (cpal)
//!   → VAD (energy-based)
//!     → [if in_segment] accumulate PCM
//!       → [on SpeechEnd] Whisper transcription (local or OpenAI)
//!         → wake-word filter (optional)
//!           → IPC VoiceCommand → synapsd → AgentFlow
//! ```
//!
//! Run with [`VoicePipeline::run`] — it loops forever until cancelled.
//!
//! # Configuration (env vars)
//!
//! | Variable             | Default         | Description                              |
//! |----------------------|-----------------|------------------------------------------|
//! | `LIMEN_WAKE_WORD`  | `hey limen`   | Required prefix (empty → accept all)     |
//! | `LIMEN_VAD_THRESH` | `0.01`          | RMS energy threshold                     |
//! | `WHISPER_BASE_URL`   | `localhost:8080`| whisper.cpp server URL                   |
//! | `OPENAI_API_KEY`     | —               | Fallback to OpenAI Whisper API           |
//! | `LIMEN_IPC_SOCK`   | `/run/limen/core.sock` | synapsd IPC socket path       |

use anyhow::Result;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::UnixStream;
use tracing::{debug, info, warn};

use crate::vad::{Vad, VadEvent};

/// Maximum utterance length (seconds). Longer recordings are force-cut.
const MAX_UTTERANCE_SECS: usize = 30;
const SAMPLE_RATE: usize = 16_000;
const MAX_UTTERANCE_SAMPLES: usize = MAX_UTTERANCE_SECS * SAMPLE_RATE;

/// Audio chunk size fed to VAD (100ms).
const CHUNK_MS: u64 = 100;

pub struct VoicePipeline {
    wake_word: String,
    ipc_socket: String,
    vad_threshold: f32,
}

impl VoicePipeline {
    pub fn from_env() -> Self {
        Self {
            wake_word: std::env::var("LIMEN_WAKE_WORD")
                .unwrap_or_else(|_| "hey limen".into())
                .to_lowercase(),
            ipc_socket: std::env::var("LIMEN_IPC_SOCK")
                .unwrap_or_else(|_| "/run/limen/core.sock".into()),
            vad_threshold: std::env::var("LIMEN_VAD_THRESH")
                .ok()
                .and_then(|s| s.parse().ok())
                .unwrap_or(0.01),
        }
    }

    /// Run the voice pipeline loop.
    ///
    /// Blocks until the mic stream closes or an unrecoverable error occurs.
    pub async fn run(&self) -> Result<()> {
        info!("[voice] starting — wake_word={:?}", self.wake_word);

        let mut mic_rx = crate::capture::start_capture(CHUNK_MS)?;
        let mut vad = Vad::new().with_threshold(self.vad_threshold);
        let mut segment: Vec<f32> = Vec::new();

        while let Some(chunk) = mic_rx.recv().await {
            match vad.process(&chunk) {
                VadEvent::SpeechStart => {
                    debug!("[voice] speech start");
                    segment.clear();
                    segment.extend_from_slice(&chunk);
                }
                VadEvent::Speaking => {
                    segment.extend_from_slice(&chunk);
                    // Force-cut if utterance is too long.
                    if segment.len() >= MAX_UTTERANCE_SAMPLES {
                        warn!("[voice] utterance too long, force-cutting");
                        self.process_utterance(&segment).await;
                        segment.clear();
                    }
                }
                VadEvent::SpeechEnd => {
                    if !segment.is_empty() {
                        self.process_utterance(&segment).await;
                        segment.clear();
                    }
                }
                VadEvent::Silence => {}
            }
        }

        warn!("[voice] mic stream ended");
        Ok(())
    }

    async fn process_utterance(&self, pcm: &[f32]) {
        let transcript = match crate::whisper_client::transcribe(pcm).await {
            Ok(t) => t.trim().to_string(),
            Err(e) => {
                warn!("[voice] transcription error: {e}");
                return;
            }
        };

        if transcript.is_empty() {
            return;
        }

        info!("[voice] transcript: {transcript:?}");

        // Check wake-word (if configured).
        let effective = if self.wake_word.is_empty() {
            transcript.clone()
        } else {
            let lower = transcript.to_lowercase();
            if let Some(rest) = lower.strip_prefix(&self.wake_word) {
                rest.trim().to_string()
            } else {
                debug!("[voice] no wake word in: {transcript:?}");
                return;
            }
        };

        if effective.is_empty() {
            return;
        }

        info!("[voice] → synapsd: {effective:?}");
        match self.send_ipc(&effective).await {
            Ok(Some(response)) if !response.is_empty() => {
                info!("[voice] ← synapsd response: {response:?}");
                if let Err(e) = crate::tts::speak_text(&response).await {
                    warn!("[voice] TTS error: {e}");
                }
            }
            Ok(_) => {}
            Err(e) => warn!("[voice] IPC send failed: {e}"),
        }
    }

    /// Send a VoiceCommand to synapsd and return the AI response text if any.
    async fn send_ipc(&self, transcript: &str) -> Result<Option<String>> {
        let stream = UnixStream::connect(&self.ipc_socket).await?;
        let (reader, mut writer) = stream.into_split();
        let mut lines = BufReader::new(reader).lines();

        let req = serde_json::json!({
            "cmd": "voice_command",
            "transcript": transcript,
        });
        let mut line = req.to_string();
        line.push('\n');
        writer.write_all(line.as_bytes()).await?;

        // Read one response — extract payload.response for TTS.
        let timeout_result =
            tokio::time::timeout(std::time::Duration::from_secs(10), lines.next_line()).await;

        let response_text = match timeout_result {
            Ok(Ok(Some(line))) => serde_json::from_str::<serde_json::Value>(&line)
                .ok()
                .and_then(|v| {
                    v.get("payload")?
                        .get("response")?
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .map(String::from)
                }),
            _ => None,
        };

        Ok(response_text)
    }
}
