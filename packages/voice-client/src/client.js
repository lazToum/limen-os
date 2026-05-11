export class VoiceClient {
    constructor(opts = {}) {
        this.recognition = null;
        this.audioCtx = null;
        this.analyser = null;
        this.freqBuf = new Uint8Array(new ArrayBuffer(0));
        this.running = false;
        this.opts = {
            wakeWord: opts.wakeWord ?? "hey limen",
            lang: opts.lang ?? "en-US",
            onTranscript: opts.onTranscript ?? (() => undefined),
            onSpectrum: opts.onSpectrum ?? (() => undefined),
            onError: opts.onError ?? ((e) => console.error(e)),
        };
    }
    async start() {
        if (this.running)
            return;
        this.running = true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioCtx = new AudioContext();
            const src = this.audioCtx.createMediaStreamSource(stream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 256;
            this.freqBuf = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
            src.connect(this.analyser);
            this.tickSpectrum();
        }
        catch (e) {
            this.opts.onError(e);
        }
        const w = window;
        const SR = (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]);
        if (!SR) {
            this.opts.onError(new Error("WebSpeech API not available"));
            return;
        }
        this.recognition = new SR();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = this.opts.lang;
        this.recognition.onresult = (event) => {
            const result = event.results[event.resultIndex];
            if (!result)
                return;
            const alt = result[0];
            if (!alt)
                return;
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
    stop() {
        this.running = false;
        this.recognition?.stop();
        void this.audioCtx?.close();
    }
    tickSpectrum() {
        if (!this.running || !this.analyser)
            return;
        this.analyser.getByteFrequencyData(this.freqBuf);
        this.opts.onSpectrum(this.freqBuf);
        requestAnimationFrame(() => this.tickSpectrum());
    }
}
