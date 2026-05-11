//! Speech-to-text subsystem.
//!
//! Phase 2 implementation plan:
//!   1. Use `ort` (ONNX Runtime) to load whisper-tiny.en.onnx
//!   2. Pre-process audio: 16kHz mono F32 PCM → log-mel spectrogram
//!   3. Run encoder + decoder in a loop (streaming transcription)
//!   4. Post-process: remove filler words, fix punctuation via Claude
//!
//! Models to support (smallest → largest):
//!   - whisper-tiny.en (39M params, ~30ms RTF)  ← default
//!   - whisper-base.en (74M params, ~50ms RTF)
//!   - whisper-small.en (244M params, ~120ms RTF)

/// Transcribe a 16kHz mono PCM audio clip.
/// Returns empty string if audio is silence.
pub async fn transcribe(_pcm: &[f32]) -> anyhow::Result<String> {
    // TODO Phase 2: Integrate ort + Whisper ONNX.
    // For now, return placeholder.
    Ok(String::new())
}
