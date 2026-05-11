//! HTTP Whisper transcription client.
//!
//! Fallback chain (tried in order):
//! 1. **whisper.cpp** — `WHISPER_BASE_URL/inference` (default `http://localhost:8083`)
//! 2. **OpenAI-compat local** — `WHISPER_BASE_URL/v1/audio/transcriptions` (faster-whisper-server, no key)
//! 3. **OpenAI API** — `OPENAI_API_KEY` + `WHISPER_MODEL` (default `whisper-1`)
//!
//! Returns an empty string on total failure (silent degradation).

use anyhow::Result;
use hound::{SampleFormat, WavSpec, WavWriter};
use std::io::Cursor;
use tracing::{debug, warn};

/// Transcribe a 16kHz mono F32 PCM buffer using the best available backend.
pub async fn transcribe(pcm: &[f32]) -> Result<String> {
    if pcm.is_empty() {
        return Ok(String::new());
    }

    let wav_bytes = encode_wav(pcm)?;

    // Try local whisper.cpp first (zero cost, privacy-preserving).
    let base_url =
        std::env::var("WHISPER_BASE_URL").unwrap_or_else(|_| "http://localhost:8083".into());

    // 1. whisper.cpp native server (POST /inference)
    match transcribe_local(&wav_bytes, &base_url).await {
        Ok(text) if !text.is_empty() => return Ok(text),
        Ok(_) => debug!("local whisper.cpp returned empty"),
        Err(e) => debug!("local whisper.cpp unavailable: {e}"),
    }

    // 2. OpenAI-compatible local server (e.g. faster-whisper-server) — no API key needed.
    match transcribe_local_openai(&wav_bytes, &base_url).await {
        Ok(text) if !text.is_empty() => return Ok(text),
        Ok(_) => debug!("local openai-compat whisper returned empty"),
        Err(e) => debug!("local openai-compat whisper unavailable: {e}"),
    }

    // 3. Fall back to OpenAI Whisper API.
    if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
        let model = std::env::var("WHISPER_MODEL").unwrap_or_else(|_| "whisper-1".into());
        match transcribe_openai(&wav_bytes, &api_key, &model).await {
            Ok(text) => return Ok(text),
            Err(e) => warn!("OpenAI Whisper failed: {e}"),
        }
    }

    Ok(String::new())
}

/// Encode raw PCM as an in-memory WAV file.
fn encode_wav(pcm: &[f32]) -> Result<Vec<u8>> {
    let spec = WavSpec {
        channels: 1,
        sample_rate: 16_000,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    let mut buf = Vec::new();
    {
        let cursor = Cursor::new(&mut buf);
        let mut writer = WavWriter::new(cursor, spec)?;
        for &sample in pcm {
            let s = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
            writer.write_sample(s)?;
        }
        writer.finalize()?;
    }
    Ok(buf)
}

/// Call a local OpenAI-compatible server (e.g. faster-whisper-server).
/// No auth header needed for local deployments.
async fn transcribe_local_openai(wav: &[u8], base_url: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let part = reqwest::multipart::Part::bytes(wav.to_vec())
        .file_name("audio.wav")
        .mime_str("audio/wav")?;
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", "tiny.en")
        .text("response_format", "json");

    let url = format!("{base_url}/v1/audio/transcriptions");
    let resp = client.post(&url).multipart(form).send().await?;

    if !resp.status().is_success() {
        anyhow::bail!(
            "openai-compat whisper {}: {}",
            resp.status(),
            resp.text().await.unwrap_or_default()
        );
    }

    let json: serde_json::Value = resp.json().await?;
    Ok(json["text"].as_str().unwrap_or("").trim().to_string())
}

/// Call a local whisper.cpp HTTP server.
///
/// whisper.cpp server endpoint: `POST /inference`
/// `multipart/form-data`: field `file` (WAV), optional `temperature`, `language`.
async fn transcribe_local(wav: &[u8], base_url: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()?;

    let part = reqwest::multipart::Part::bytes(wav.to_vec())
        .file_name("audio.wav")
        .mime_str("audio/wav")?;
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("temperature", "0")
        .text("response_format", "json");

    let url = format!("{base_url}/inference");
    let resp = client.post(&url).multipart(form).send().await?;

    if !resp.status().is_success() {
        anyhow::bail!(
            "whisper.cpp {}: {}",
            resp.status(),
            resp.text().await.unwrap_or_default()
        );
    }

    let json: serde_json::Value = resp.json().await?;
    Ok(json["text"].as_str().unwrap_or("").trim().to_string())
}

/// Call the OpenAI Whisper API (`POST /audio/transcriptions`).
async fn transcribe_openai(wav: &[u8], api_key: &str, model: &str) -> Result<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()?;

    let part = reqwest::multipart::Part::bytes(wav.to_vec())
        .file_name("audio.wav")
        .mime_str("audio/wav")?;
    let form = reqwest::multipart::Form::new()
        .part("file", part)
        .text("model", model.to_string())
        .text("response_format", "json");

    let resp = client
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(api_key)
        .multipart(form)
        .send()
        .await?;

    if !resp.status().is_success() {
        anyhow::bail!(
            "OpenAI Whisper {}: {}",
            resp.status(),
            resp.text().await.unwrap_or_default()
        );
    }

    let json: serde_json::Value = resp.json().await?;
    Ok(json["text"].as_str().unwrap_or("").trim().to_string())
}
