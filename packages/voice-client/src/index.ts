/**
 * @limen-os/voice-client
 *
 * Browser-side voice pipeline:
 *   - WebSpeech API wrapper with interim results
 *   - Web Audio API spectrum analyser
 *   - WebRTC DataChannel bridge (mobile mic relay)
 *   - Whisper WASM loader (Phase 2)
 */

export { VoiceClient } from "./client";
export type { VoiceClientOptions, TranscriptEvent } from "./client";
