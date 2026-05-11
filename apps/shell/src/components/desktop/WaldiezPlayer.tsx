import { useState, useRef, useEffect, useCallback } from "react";

// ── Mood definitions (mirrors waldiez/player mood palette) ────────────────────
const MOODS = [
  { id: "standard", label: "Standard", color: "#0078d4", bg: "#080e18" },
  { id: "storyteller", label: "Story", color: "#e8902a", bg: "#120900" },
  { id: "cinema", label: "Cinema", color: "#e94560", bg: "#0d0a14" },
  { id: "dock", label: "Dock", color: "#8b5cf6", bg: "#0d0818" },
  { id: "storm", label: "Storm", color: "#06b6d4", bg: "#001118" },
  { id: "fest", label: "Fest", color: "#f59e0b", bg: "#110800" },
  { id: "pop", label: "Pop", color: "#ec4899", bg: "#150010" },
] as const;

type MoodId = (typeof MOODS)[number]["id"];

interface EqValues {
  bass: number;
  mid: number;
  treble: number;
}

const EQ_PRESETS: [string, EqValues][] = [
  ["Flat", { bass: 0, mid: 0, treble: 0 }],
  ["Warm", { bass: 6, mid: -2, treble: -4 }],
  ["Bright", { bass: -2, mid: 2, treble: 6 }],
  ["Bass+", { bass: 8, mid: 0, treble: -2 }],
  ["Vocal", { bass: -4, mid: 4, treble: 2 }],
  ["Vinyl", { bass: 4, mid: -3, treble: -6 }],
];

function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] ?? null;
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
  } catch {
    // not a URL
  }
  return null;
}

function fmtTime(s: number): string {
  if (!isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WaldiezPlayerContent() {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaName, setMediaName] = useState("");
  const [isVideo, setIsVideo] = useState(false);
  const [ytId, setYtId] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [mood, setMood] = useState<MoodId>("standard");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [loop, setLoop] = useState(false);
  const [eq, setEq] = useState<EqValues>({ bass: 0, mid: 0, treble: 0 });
  const [showEq, setShowEq] = useState(false);
  const [over, setOver] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio chain refs (set up lazily on first play)
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bassRef = useRef<BiquadFilterNode | null>(null);
  const midRef = useRef<BiquadFilterNode | null>(null);
  const trebleRef = useRef<BiquadFilterNode | null>(null);
  const chainReady = useRef(false);
  const isVideoRef = useRef(false);
  const urlRef = useRef<string | null>(null);
  const rafRef = useRef(0);

  // ── Canvas draw loop — restarts when mood changes ───────────────────────────
  useEffect(() => {
    const moodObj = MOODS.find((m) => m.id === mood) ?? MOODS[0];
    const color = moodObj.color;
    const bg = moodObj.bg;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width;
      const H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      const analyser = analyserRef.current;
      if (!analyser) {
        ctx.strokeStyle = color + "44";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, H * 0.5);
        ctx.lineTo(W, H * 0.5);
        ctx.stroke();
        return;
      }

      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(data);
      const barW = Math.ceil(W / (bufLen / 2));
      for (let i = 0; i < bufLen / 2; i++) {
        const val = data[i] ?? 0;
        const bh = (val / 255) * H * 0.9;
        const alpha = Math.round((0.35 + (val / 255) * 0.65) * 255)
          .toString(16)
          .padStart(2, "0");
        ctx.fillStyle = color + alpha;
        ctx.fillRect(i * barW, H - bh, Math.max(barW - 1, 1), bh);
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [mood]);

  // ── Sync EQ gains when sliders change ───────────────────────────────────────
  useEffect(() => {
    if (bassRef.current) bassRef.current.gain.value = eq.bass;
    if (midRef.current) midRef.current.gain.value = eq.mid;
    if (trebleRef.current) trebleRef.current.gain.value = eq.treble;
  }, [eq]);

  // ── Volume sync ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = (videoRef.current ??
      audioRef.current) as HTMLMediaElement | null;
    if (el) el.volume = volume;
  }, [volume]);

  // ── Cleanup on unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      ctxRef.current?.close().catch(() => {});
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  // ── Audio chain initialisation (called once on first play) ──────────────────
  const initChain = () => {
    if (chainReady.current) return;
    const el = (
      isVideoRef.current ? videoRef.current : audioRef.current
    ) as HTMLMediaElement | null;
    if (!el) return;

    const ac = new AudioContext();
    ctxRef.current = ac;

    const src = ac.createMediaElementSource(el);
    const bass = ac.createBiquadFilter();
    const mid = ac.createBiquadFilter();
    const treble = ac.createBiquadFilter();
    const analyser = ac.createAnalyser();

    bass.type = "lowshelf";
    bass.frequency.value = 200;
    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 1;
    treble.type = "highshelf";
    treble.frequency.value = 3000;

    // Apply current EQ immediately
    bass.gain.value = bassRef.current ? bassRef.current.gain.value : 0;
    mid.gain.value = midRef.current ? midRef.current.gain.value : 0;
    treble.gain.value = trebleRef.current ? trebleRef.current.gain.value : 0;

    analyser.fftSize = 256;

    src.connect(bass);
    bass.connect(mid);
    mid.connect(treble);
    treble.connect(analyser);
    analyser.connect(ac.destination);

    bassRef.current = bass;
    midRef.current = mid;
    trebleRef.current = treble;
    analyserRef.current = analyser;
    chainReady.current = true;
  };

  // ── URL loader ───────────────────────────────────────────────────────────────
  const loadUrl = useCallback((raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const yt = youtubeId(trimmed);
    if (yt) {
      setYtId(yt);
      setMediaUrl(null);
      setMediaName(`YouTube: ${yt}`);
      return;
    }
    // Direct media URL
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    bassRef.current = null;
    midRef.current = null;
    trebleRef.current = null;
    chainReady.current = false;
    if (urlRef.current?.startsWith("blob:")) URL.revokeObjectURL(urlRef.current);
    urlRef.current = trimmed;
    const lower = trimmed.toLowerCase().split("?")[0] ?? "";
    const isVid = ["mp4", "webm", "ogv", "mov", "mkv"].some(e => lower.endsWith(`.${e}`));
    isVideoRef.current = isVid;
    setYtId(null);
    setMediaUrl(trimmed);
    setMediaName(trimmed.split("/").pop() ?? trimmed);
    setIsVideo(isVid);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  // ── File loader ──────────────────────────────────────────────────────────────
  const loadFile = (file: File) => {
    ctxRef.current?.close().catch(() => {});
    ctxRef.current = null;
    analyserRef.current = null;
    bassRef.current = null;
    midRef.current = null;
    trebleRef.current = null;
    chainReady.current = false;

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(file);
    urlRef.current = url;
    isVideoRef.current = file.type.startsWith("video/");

    setYtId(null);
    setMediaUrl(url);
    setMediaName(file.name);
    setIsVideo(file.type.startsWith("video/"));
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  };

  // ── Transport ────────────────────────────────────────────────────────────────
  const togglePlay = () => {
    const el = (
      isVideo ? videoRef.current : audioRef.current
    ) as HTMLMediaElement | null;
    if (!el) return;
    if (ctxRef.current?.state === "suspended") {
      void ctxRef.current.resume();
    }
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      initChain();
      void el
        .play()
        .then(() => {
          setPlaying(true);
        })
        .catch(() => {});
    }
  };

  const handleTimeUpdate = () => {
    const el = (
      isVideo ? videoRef.current : audioRef.current
    ) as HTMLMediaElement | null;
    if (el) setCurrentTime(el.currentTime);
  };

  const handleLoadedMetadata = () => {
    const el = (
      isVideo ? videoRef.current : audioRef.current
    ) as HTMLMediaElement | null;
    if (el) {
      setDuration(el.duration);
      el.volume = volume;
    }
  };

  const handleEnded = () => {
    setPlaying(false);
  };

  const seek = (v: number) => {
    const el = (
      isVideo ? videoRef.current : audioRef.current
    ) as HTMLMediaElement | null;
    if (el) {
      el.currentTime = v;
      setCurrentTime(v);
    }
  };

  const moodObj = MOODS.find((m) => m.id === mood) ?? MOODS[0];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="wplayer" style={{ background: moodObj.bg }}>
      {/* URL input bar */}
      <form
        className="wplayer-urlbar"
        onSubmit={(e) => { e.preventDefault(); loadUrl(urlInput); setUrlInput(""); }}
      >
        <input
          className="wplayer-urlinput"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="Paste YouTube or media URL…"
          spellCheck={false}
        />
        <button type="submit" className="wplayer-urlbtn" style={{ background: moodObj.color }}>
          ▶
        </button>
      </form>

      {/* Mood strip */}
      <div className="wplayer-moods">
        {MOODS.map((m) => (
          <button
            key={m.id}
            className={`wplayer-mood-btn${mood === m.id ? " active" : ""}`}
            style={
              mood === m.id ? { borderColor: m.color, color: m.color } : {}
            }
            onClick={() => {
              setMood(m.id);
            }}
            title={m.label}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Main media area */}
      <div
        className={`wplayer-main${over ? " over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => {
          setOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) loadFile(f);
        }}
      >
        {/* YouTube embed */}
        {ytId && (
          <iframe
            key={ytId}
            src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
            className="wplayer-yt"
            allow="autoplay; encrypted-media; fullscreen"
            allowFullScreen
            title="YouTube"
          />
        )}

        {!ytId && !mediaUrl && (
          <div className="wplayer-drop">
            <div className="wplayer-drop-icon">🎵</div>
            <div className="wplayer-drop-label">Drop audio or video here</div>
            <div className="wplayer-drop-sub">or</div>
            <button
              className="wplayer-drop-btn"
              style={{ borderColor: moodObj.color, color: moodObj.color }}
              onClick={() => {
                fileInputRef.current?.click();
              }}
            >
              Browse files
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
              }}
            />
          </div>
        )}

        {!ytId && mediaUrl && isVideo && (
          <video
            ref={videoRef}
            src={mediaUrl}
            className="wplayer-video"
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            loop={loop}
          />
        )}

        {!ytId && mediaUrl && !isVideo && (
          <audio
            ref={audioRef}
            src={mediaUrl}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            loop={loop}
          />
        )}

        {/* Visualizer canvas — full area for audio, overlay strip for video */}
        {!ytId && mediaUrl && (
          <canvas
            ref={canvasRef}
            className={`wplayer-canvas${isVideo ? " video-overlay" : ""}`}
            width={800}
            height={180}
          />
        )}
      </div>

      {/* Transport bar */}
      {!ytId && mediaUrl && (
        <div className="wplayer-transport">
          <div className="wplayer-title">{mediaName}</div>
          <div className="wplayer-controls">
            <button
              className="wplayer-btn-play"
              style={{ background: moodObj.color }}
              onClick={togglePlay}
              title={playing ? "Pause" : "Play"}
            >
              {playing ? "⏸" : "▶"}
            </button>
            <span className="wplayer-time">{fmtTime(currentTime)}</span>
            <input
              type="range"
              className="wplayer-seek"
              min={0}
              max={duration || 1}
              step={0.1}
              value={currentTime}
              onChange={(e) => {
                seek(parseFloat(e.target.value));
              }}
              style={{ accentColor: moodObj.color }}
            />
            <span className="wplayer-time">{fmtTime(duration)}</span>
            <button
              className={`wplayer-btn-sm${loop ? " active" : ""}`}
              style={loop ? { color: moodObj.color } : {}}
              onClick={() => {
                setLoop((v) => !v);
              }}
              title="Loop"
            >
              🔁
            </button>
            <span className="wplayer-vol-icon">🔊</span>
            <input
              type="range"
              className="wplayer-vol"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
              }}
              style={{ accentColor: moodObj.color }}
            />
            <button
              className={`wplayer-btn-sm${showEq ? " active" : ""}`}
              style={showEq ? { color: moodObj.color } : {}}
              onClick={() => {
                setShowEq((v) => !v);
              }}
              title="Equalizer"
            >
              EQ
            </button>
          </div>

          {showEq && (
            <div className="wplayer-eq">
              <div className="wplayer-eq-presets">
                {EQ_PRESETS.map(([name, values]) => (
                  <button
                    key={name}
                    className="wplayer-eq-preset"
                    onClick={() => {
                      setEq(values);
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
              {(["bass", "mid", "treble"] as const).map((band) => (
                <div key={band} className="wplayer-eq-row">
                  <span className="wplayer-eq-label">{band}</span>
                  <input
                    type="range"
                    className="wplayer-eq-slider"
                    min={-12}
                    max={12}
                    step={1}
                    value={eq[band]}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setEq((prev) => ({ ...prev, [band]: val }));
                    }}
                    style={{ accentColor: moodObj.color }}
                  />
                  <span className="wplayer-eq-val">
                    {eq[band] > 0 ? "+" : ""}
                    {eq[band]}dB
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
