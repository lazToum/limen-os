//! Voice relay assembler.
//!
//! Subscribes to the global event bus and watches for the mobile companion's
//! voice relay sequence:
//!
//! ```text
//! VoiceRelayStarted → VoiceChunk* → VoiceRelayEnded
//!                                          ↓
//!                               assemble PCM (sort by seq)
//!                                          ↓
//!                               encode as WAV (in-memory)
//!                                          ↓
//!                               POST to whisper.cpp OR OpenAI
//!                                          ↓
//!                               emit VoiceCommandReceived
//! ```
//!
//! Configuration (env vars):
//!   `WHISPER_BASE_URL` — local whisper.cpp server, default `http://127.0.0.1:8080`
//!   `OPENAI_API_KEY`   — fallback to OpenAI whisper-1 if local fails

use anyhow::Result;
use chrono::Utc;
use tokio::sync::broadcast::error::RecvError;
use tracing::{debug, info, warn};

use crate::{AppState, EventKind, LimenEvent, wid};

/// Run the voice relay assembler. Runs forever until the event bus closes.
pub async fn run(state: AppState) {
    let mut rx = state.subscribe();
    let mut buffer: Vec<(u32, Vec<u8>)> = Vec::new();
    let mut relaying = false;

    loop {
        match rx.recv().await {
            Ok(event) => match event.kind {
                EventKind::VoiceRelayStarted => {
                    buffer.clear();
                    relaying = true;
                    debug!("voice relay: started accumulating chunks");
                }

                EventKind::VoiceChunk { pcm, seq } if relaying => {
                    buffer.push((seq, pcm));
                }

                EventKind::VoiceRelayEnded if relaying => {
                    relaying = false;
                    let pcm = assemble_chunks(std::mem::take(&mut buffer));
                    let app = state.clone();
                    tokio::spawn(async move {
                        match transcribe(&pcm).await {
                            Ok(transcript) if !transcript.trim().is_empty() => {
                                info!("voice relay transcript: \"{transcript}\"");
                                // Forward to AgentFlow if available, else emit locally.
                                let bridge = app.agentflow.read().await;
                                if let Some(ref b) = *bridge {
                                    b.send_voice_command(&transcript).await;
                                }
                                drop(bridge);
                                app.emit(LimenEvent {
                                    id: wid(),
                                    ts: Utc::now(),
                                    kind: EventKind::VoiceCommandReceived { transcript },
                                });
                            }
                            Ok(_) => debug!("voice relay: transcription returned empty"),
                            Err(e) => warn!("voice relay: transcription failed: {e}"),
                        }
                    });
                }

                _ => {}
            },

            Err(RecvError::Lagged(n)) => {
                warn!("voice relay: event bus lagged, dropped {n} events");
            }
            Err(RecvError::Closed) => break,
        }
    }
}

// ─── PCM assembly ─────────────────────────────────────────────────────────────

fn assemble_chunks(mut chunks: Vec<(u32, Vec<u8>)>) -> Vec<u8> {
    chunks.sort_by_key(|(seq, _)| *seq);
    chunks.into_iter().flat_map(|(_, pcm)| pcm).collect()
}

// ─── WAV encoding (inline — 16-bit LE mono 16 kHz) ────────────────────────────

fn encode_wav(pcm: &[u8]) -> Vec<u8> {
    const SAMPLE_RATE: u32 = 16_000;
    const CHANNELS: u16 = 1;
    const BITS: u16 = 16;
    let byte_rate = SAMPLE_RATE * CHANNELS as u32 * BITS as u32 / 8;
    let block_align = CHANNELS * BITS / 8;
    let data_len = pcm.len() as u32;

    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // chunk size
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM format
    wav.extend_from_slice(&CHANNELS.to_le_bytes());
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&byte_rate.to_le_bytes());
    wav.extend_from_slice(&block_align.to_le_bytes());
    wav.extend_from_slice(&BITS.to_le_bytes());
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(pcm);
    wav
}

// ─── Whisper transcription ────────────────────────────────────────────────────

async fn transcribe(pcm: &[u8]) -> Result<String> {
    if pcm.is_empty() {
        return Ok(String::new());
    }

    let wav = encode_wav(pcm);
    let client = reqwest::Client::new();

    // 1. Try local whisper.cpp (/inference endpoint).
    let base_url =
        std::env::var("WHISPER_BASE_URL").unwrap_or_else(|_| "http://127.0.0.1:8080".into());

    let form = reqwest::multipart::Form::new()
        .part(
            "file",
            reqwest::multipart::Part::bytes(wav.clone())
                .file_name("audio.wav")
                .mime_str("audio/wav")?,
        )
        .text("response_format", "json");

    if let Ok(resp) = client
        .post(format!("{base_url}/inference"))
        .multipart(form)
        .timeout(std::time::Duration::from_secs(30))
        .send()
        .await
        && resp.status().is_success()
    {
        let json: serde_json::Value = resp.json().await?;
        let text = json["text"].as_str().unwrap_or("").trim().to_string();
        if !text.is_empty() {
            return Ok(text);
        }
    }

    // 2. Fallback: OpenAI whisper-1.
    if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
        let form = reqwest::multipart::Form::new()
            .part(
                "file",
                reqwest::multipart::Part::bytes(wav)
                    .file_name("audio.wav")
                    .mime_str("audio/wav")?,
            )
            .text("model", "whisper-1")
            .text("response_format", "json");

        let resp = client
            .post("https://api.openai.com/v1/audio/transcriptions")
            .bearer_auth(api_key)
            .multipart(form)
            .timeout(std::time::Duration::from_secs(30))
            .send()
            .await?;

        let json: serde_json::Value = resp.json().await?;
        let text = json["text"].as_str().unwrap_or("").trim().to_string();
        return Ok(text);
    }

    anyhow::bail!("no Whisper endpoint reachable (set WHISPER_BASE_URL or OPENAI_API_KEY)")
}
