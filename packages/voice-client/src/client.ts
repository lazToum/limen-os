// Minimal WebSpeech API interfaces (not yet fully standardized in all TS lib.dom versions).
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: ISpeechRecognitionEvent) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
interface ISpeechRecognitionEvent {
  readonly resultIndex: number;
  readonly results: {
    length: number;
    [i: number]:
      | {
          isFinal: boolean;
          [j: number]: { transcript: string; confidence: number } | undefined;
        }
      | undefined;
  };
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

export interface VoiceClientOptions {
  wakeWord?: string;
  lang?: string;
  /**
   * URL of a local Whisper HTTP server (whisper.cpp or faster-whisper-server).
   * When set, uses MediaRecorder + energy VAD instead of WebSpeech API.
   * This is the preferred path for Tauri / WebKitGTK where WebSpeech is unreliable.
   * Example: "http://localhost:8083"
   */
  whisperUrl?: string;
  onTranscript?: (e: TranscriptEvent) => void;
  onSpectrum?: (data: Uint8Array<ArrayBuffer>) => void;
  onError?: (e: Error) => void;
}

export interface TranscriptEvent {
  text: string;
  isFinal: boolean;
  confidence: number;
  containsWakeWord: boolean;
}

// VAD constants — mirror crates/limen-voice/src/vad.rs
const VAD_RMS_THRESH = 0.015; // energy threshold (0–1 normalised)
const VAD_SPEECH_DEBOUNCE = 2; // frames of energy before SpeechStart
const VAD_SILENCE_HANGOVER = 8; // frames of silence before SpeechEnd
const VAD_MAX_FRAMES = 300; // force-cut at ~30s (100ms/frame)

export class VoiceClient {
  private opts: Required<VoiceClientOptions>;
  private recognition: ISpeechRecognition | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freqBuf: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
  private running = false;

  constructor(opts: VoiceClientOptions = {}) {
    this.opts = {
      wakeWord: opts.wakeWord ?? "hey limen",
      lang: opts.lang ?? "en-US",
      whisperUrl: opts.whisperUrl ?? "",
      onTranscript: opts.onTranscript ?? (() => undefined),
      onSpectrum: opts.onSpectrum ?? (() => undefined),
      onError: opts.onError ?? ((e) => console.error(e)),
    };
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioCtx = new AudioContext();
      const src = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.freqBuf = new Uint8Array(
        new ArrayBuffer(this.analyser.frequencyBinCount),
      );
      src.connect(this.analyser);
      this.tickSpectrum();
    } catch (e) {
      this.opts.onError(e as Error);
    }

    // Prefer MediaRecorder + Whisper HTTP when whisperUrl is configured.
    // This is reliable in Tauri/WebKitGTK where WebSpeech is not supported.
    if (this.opts.whisperUrl && stream) {
      this.startWhisperMode(stream);
      return;
    }

    // Fallback: WebSpeech API (requires network + browser support).
    const w = window as unknown as Record<string, unknown>;
    const SR = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as
      | SpeechRecognitionCtor
      | undefined;
    if (!SR) {
      this.opts.onError(
        new Error(
          "WebSpeech API unavailable — set VITE_WHISPER_URL to use local Whisper instead",
        ),
      );
      return;
    }

    this.recognition = new SR();
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = this.opts.lang;

    this.recognition.onresult = (event: ISpeechRecognitionEvent) => {
      const result = event.results[event.resultIndex];
      if (!result) return;
      const alt = result[0];
      if (!alt) return;
      const text = alt.transcript.trim();
      this.opts.onTranscript({
        text,
        isFinal: result.isFinal,
        confidence: alt.confidence,
        containsWakeWord: text.toLowerCase().includes(this.opts.wakeWord),
      });
    };

    this.recognition.onerror = (e) => {
      this.opts.onError(new Error(`SpeechRecognition: ${e.error}`));
    };

    this.recognition.start();
  }

  stop(): void {
    this.running = false;
    this.recognition?.stop();
    this.mediaRecorder?.stop();
    void this.audioCtx?.close();
  }

  // ── MediaRecorder + energy VAD ──────────────────────────────────────────────

  /**
   * Drives a continuous MediaRecorder with an energy-based VAD loop.
   * On SpeechEnd: sends accumulated audio to the Whisper HTTP server.
   */
  private startWhisperMode(stream: MediaStream): void {
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/ogg";

    const recorder = new MediaRecorder(stream, { mimeType });
    this.mediaRecorder = recorder;

    let capturing = false;
    let speechChunks: Blob[] = [];
    let speechFrames = 0;
    let silenceFrames = 0;
    let totalFrames = 0;

    recorder.ondataavailable = (e) => {
      if (capturing && e.data.size > 0) speechChunks.push(e.data);
    };
    recorder.start(100); // 100 ms timeslices

    const tick = () => {
      if (!this.running) {
        recorder.stop();
        return;
      }
      if (!this.analyser) {
        requestAnimationFrame(tick);
        return;
      }

      // RMS energy from frequency domain (same normalisation as Rust VAD).
      this.analyser.getByteFrequencyData(this.freqBuf);
      let sum = 0;
      for (let i = 0; i < this.freqBuf.length; i++) {
        const n = this.freqBuf[i] / 255;
        sum += n * n;
      }
      const rms = Math.sqrt(sum / this.freqBuf.length);

      if (!capturing) {
        if (rms > VAD_RMS_THRESH) {
          speechFrames++;
          if (speechFrames >= VAD_SPEECH_DEBOUNCE) {
            capturing = true;
            speechChunks = [];
            silenceFrames = 0;
            totalFrames = 0;
            // Show "listening" indicator immediately.
            this.opts.onTranscript({
              text: "…",
              isFinal: false,
              confidence: 0,
              containsWakeWord: false,
            });
          }
        } else {
          speechFrames = 0;
        }
      } else {
        totalFrames++;
        if (rms < VAD_RMS_THRESH) {
          silenceFrames++;
          if (
            silenceFrames >= VAD_SILENCE_HANGOVER ||
            totalFrames >= VAD_MAX_FRAMES
          ) {
            capturing = false;
            speechFrames = 0;
            const chunks = [...speechChunks];
            speechChunks = [];
            void this.transcribeChunks(chunks, mimeType);
          }
        } else {
          silenceFrames = 0;
        }
      }

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  /** POST audio chunks to the Whisper server and fire onTranscript on result. */
  private async transcribeChunks(
    chunks: Blob[],
    mimeType: string,
  ): Promise<void> {
    if (!chunks.length || !this.opts.whisperUrl) return;
    try {
      const blob = new Blob(chunks, { type: mimeType });
      const form = new FormData();
      form.append("file", blob, "audio.webm");
      form.append("model", "tiny.en");
      form.append("response_format", "json");

      const resp = await fetch(
        `${this.opts.whisperUrl}/v1/audio/transcriptions`,
        {
          method: "POST",
          body: form,
        },
      );
      if (!resp.ok) throw new Error(`Whisper HTTP ${resp.status}`);

      const data = (await resp.json()) as { text?: string };
      const text = (data.text ?? "").trim();
      if (text) {
        this.opts.onTranscript({
          text,
          isFinal: true,
          confidence: 1,
          containsWakeWord: text.toLowerCase().includes(this.opts.wakeWord),
        });
      }
    } catch (e) {
      this.opts.onError(e as Error);
    }
  }

  // ── Spectrum visualizer ─────────────────────────────────────────────────────

  private tickSpectrum(): void {
    if (!this.running || !this.analyser) return;
    this.analyser.getByteFrequencyData(this.freqBuf);
    this.opts.onSpectrum(this.freqBuf);
    requestAnimationFrame(() => this.tickSpectrum());
  }
}
