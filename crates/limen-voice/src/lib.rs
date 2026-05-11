//! # limen-voice
//!
//! Voice processing for LIMEN OS.
//!
//! ## Modules
//! - [`capture`] — microphone input via cpal (16kHz mono)
//! - [`vad`] — energy-based voice activity detection
//! - [`whisper_client`] — HTTP Whisper transcription (local or OpenAI API)
//! - [`pipeline`] — full mic→VAD→Whisper→IPC pipeline, run as a daemon task
//! - [`stt`] — low-level STT stub (replaced by `whisper_client` in the pipeline)
//! - [`tts`] — text-to-speech synthesis stub

pub mod capture;
pub mod pipeline;
pub mod stt;
pub mod tts;
pub mod vad;
pub mod whisper_client;

pub use pipeline::VoicePipeline;
pub use vad::{Vad, VadEvent};

/// Check if a transcript contains the wake word.
pub fn contains_wake_word(text: &str, wake_word: &str) -> bool {
    let lower = text.to_lowercase();
    let trigger = wake_word.to_lowercase();
    lower.contains(&trigger)
}
