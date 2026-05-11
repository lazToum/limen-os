# LIMEN-VOICE — The System Ears

`limen-voice` (`voiced`) is the voice input/output engine. It handles everything from the initial microphone capture to the final text-to-speech response.

---

## 1. The Voice Pipeline

A single voice command follows this lifecycle:

```text
Audio Capture (Microphone) 
  ↓ 
VAD (Voice Activity Detection) 
  ↓ 
Whisper STT (Speech-to-Text) 
  ↓ 
(Transcript sent to limen-ai)
```

---

## 2. Audio Capture & VAD

`limen-voice` continuously monitors the system's primary audio input.

- **VAD (Silero)**: Instead of constant transcription, it uses a lightweight VAD model to detect when a human is actually speaking. 
- **Wake Word**: Only when the system detects its name ("Hey Limen") does it begin sending audio to the high-power STT engine.

---

## 3. Transcription (Whisper ONNX)

We use the OpenAI Whisper model, but optimized for local performance.

- **Engine**: ONNX Runtime (CPU or GPU accelerated).
- **Quantization**: INT8 for speed and low memory footprint.
- **Latency Target**: Transcription of a 5-second clip must finish in under 500ms.

---

## 4. Text-to-Speech (TTS)

When the AI has a response, `voiced` handles the playback.

- **Engines**:
    - **Piper**: Our default, high-speed local neural TTS.
    - **Sherpa-ONNX**: Alternative engine for specific language models.
- **Queueing**: If multiple apps try to speak at once, the core event bus prioritizes them based on urgency (e.g., an alarm over a weather update).

---

## 5. Privacy & Security

`limen-voice` is a **local-first** engine.

- **Offline Mode**: No audio data is sent to the cloud by default.
- **Mute Guarantee**: A physical hardware switch or systemd override can forcibly disable microphone access at the driver level.
