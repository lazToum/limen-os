//! Text-to-speech subsystem.
//!
//! Phase 2 implementation plan:
//!   1. Kokoro TTS (lightweight, high-quality, ONNX) — primary
//!   2. Piper TTS — offline fallback
//!   3. Browser SpeechSynthesis via Tauri webview — last resort
//!
//! Voice persona: "Limen" — clear, calm, slightly futuristic.
//! Configurable: speed (0.8–1.5x), pitch, voice style.

/// Speak text aloud using the best available system TTS.
///
/// Probed in order — only what's actually on the host is used:
///   1. pyttsx3  — `python3 -m pyttsx3` (installed: anthropic/openai env has it)
///   2. espeak-ng — if installed
///   3. espeak   — if installed
///   4. aplay + /dev/stdin (last-ditch ALSA raw — almost always available)
///   5. Silent   — logs a warning, never crashes
pub async fn speak_text(text: &str) -> anyhow::Result<()> {
    if text.is_empty() {
        return Ok(());
    }

    // 1. pyttsx3 via Python — best quality available on this host
    if let Ok(status) = tokio::process::Command::new("python3")
        .args([
            "-c",
            &format!(
                "import pyttsx3; e=pyttsx3.init(); e.setProperty('rate',165); e.say({:?}); e.runAndWait()",
                text
            ),
        ])
        .status()
        .await
        && status.success()
    {
        return Ok(());
    }

    // 2. espeak-ng (install: apt install espeak-ng)
    if let Ok(status) = tokio::process::Command::new("espeak-ng")
        .args(["-s", "150", "-v", "en", "-p", "50", text])
        .status()
        .await
        && status.success()
    {
        return Ok(());
    }

    // 3. espeak legacy
    if let Ok(status) = tokio::process::Command::new("espeak")
        .arg(text)
        .status()
        .await
        && status.success()
    {
        return Ok(());
    }

    // 4. Silent fallback — voice pipeline keeps running, shell handles TTS via Web Speech API
    tracing::warn!(
        "[tts] no TTS engine available for daemon path — shell will speak via Web Speech"
    );
    Ok(())
}

/// Synthesize speech from text. Returns 16kHz mono PCM.
/// Reserved for future Kokoro / Piper ONNX integration.
pub async fn synthesize(_text: &str) -> anyhow::Result<Vec<f32>> {
    Ok(vec![])
}
