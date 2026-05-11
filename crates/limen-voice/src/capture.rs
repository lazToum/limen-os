//! Microphone capture via cpal.
//!
//! Records 16kHz mono F32 PCM into a ring buffer. Designed to be driven by
//! the [`VoicePipeline`]: it opens the default input device, captures chunks,
//! and sends them through a channel for downstream processing.

use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, StreamConfig};
use tokio::sync::mpsc;
use tracing::{error, info, warn};

/// Target sample rate for Whisper (16 kHz mono).
pub const TARGET_SAMPLE_RATE: u32 = 16_000;

/// Audio chunk sent downstream (raw 16kHz mono F32 samples).
pub type AudioChunk = Vec<f32>;

/// Start capturing audio from the default input device.
///
/// Returns a receiver that yields [`AudioChunk`]s as they are captured,
/// and a shutdown handle. Drop the handle to stop capturing.
pub fn start_capture(chunk_ms: u64) -> Result<mpsc::Receiver<AudioChunk>> {
    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .context("no default input device")?;

    info!("mic: {:?}", device.description().ok());

    let supported = device
        .default_input_config()
        .context("no default input config")?;

    let channels = supported.channels();
    let sample_rate = supported.sample_rate();
    let config: StreamConfig = supported.clone().into();

    // Channel capacity: 10 seconds of audio chunks.
    let chunk_samples = (TARGET_SAMPLE_RATE as u64 * chunk_ms / 1000) as usize;
    let (tx, rx) = mpsc::channel::<AudioChunk>(40);

    // Shared buffer that accumulates samples between callbacks.
    let buf = std::sync::Arc::new(std::sync::Mutex::new(Vec::<f32>::new()));
    let buf_c = buf.clone();

    let err_fn = |e| error!("mic stream error: {e}");

    let stream = match supported.sample_format() {
        SampleFormat::F32 => {
            let tx = tx.clone();
            device.build_input_stream(
                &config,
                move |data: &[f32], _| {
                    push_samples(data, channels, sample_rate, &buf_c, chunk_samples, &tx);
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::I16 => {
            let tx = tx.clone();
            device.build_input_stream(
                &config,
                move |data: &[i16], _| {
                    let f: Vec<f32> = data.iter().map(|s| *s as f32 / i16::MAX as f32).collect();
                    push_samples(&f, channels, sample_rate, &buf_c, chunk_samples, &tx);
                },
                err_fn,
                None,
            )?
        }
        SampleFormat::U8 => {
            let tx = tx.clone();
            device.build_input_stream(
                &config,
                move |data: &[u8], _| {
                    let f: Vec<f32> = data.iter().map(|s| (*s as f32 - 128.0) / 128.0).collect();
                    push_samples(&f, channels, sample_rate, &buf_c, chunk_samples, &tx);
                },
                err_fn,
                None,
            )?
        }
        fmt => {
            warn!("unsupported sample format {fmt:?}, trying I16 fallback");
            return Err(anyhow::anyhow!("unsupported sample format {fmt:?}"));
        }
    };

    stream.play()?;

    // Keep the stream alive in a background thread.
    std::thread::spawn(move || {
        let _stream = stream; // dropped when thread exits
        std::thread::park(); // park forever
    });

    Ok(rx)
}

/// Accumulate device samples, down-mix to mono, resample to 16kHz, and emit
/// fixed-size chunks when enough data has accumulated.
fn push_samples(
    data: &[f32],
    channels: u16,
    device_rate: u32,
    buf: &std::sync::Mutex<Vec<f32>>,
    chunk_samples: usize,
    tx: &mpsc::Sender<AudioChunk>,
) {
    let mut guard = buf.lock().expect("mic buf mutex");

    // Down-mix to mono.
    let channels = channels as usize;
    let mono: Vec<f32> = data
        .chunks(channels)
        .map(|frame| frame.iter().sum::<f32>() / channels as f32)
        .collect();

    // Simple linear resample to 16kHz if needed.
    if device_rate != TARGET_SAMPLE_RATE {
        let ratio = TARGET_SAMPLE_RATE as f64 / device_rate as f64;
        let new_len = (mono.len() as f64 * ratio) as usize;
        for i in 0..new_len {
            let src = i as f64 / ratio;
            let idx = src as usize;
            let frac = src - idx as f64;
            let s = if idx + 1 < mono.len() {
                mono[idx] * (1.0 - frac as f32) + mono[idx + 1] * frac as f32
            } else {
                mono[idx.min(mono.len() - 1)]
            };
            guard.push(s);
        }
    } else {
        guard.extend_from_slice(&mono);
    }

    // Emit complete chunks.
    while guard.len() >= chunk_samples {
        let chunk: Vec<f32> = guard.drain(..chunk_samples).collect();
        let _ = tx.try_send(chunk);
    }
}
