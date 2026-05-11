import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useRef } from "react";

interface Props {
  onNext: () => void;
  onBack: () => void;
}

type MicState = "idle" | "requesting" | "granted" | "denied";

export function VoiceStep({ onNext, onBack }: Props) {
  const [micState, setMicState] = useState<MicState>("idle");
  const [waveform, setWaveform] = useState<number[]>(Array(32).fill(4));
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);

  const requestMic = async () => {
    setMicState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      src.connect(analyser);
      analyserRef.current = analyser;

      setMicState("granted");

      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteFrequencyData(buf);
        const bars = Array.from({ length: 32 }, (_, i) => {
          const raw = buf[i] ?? 0;
          return Math.max(4, (raw / 255) * 56);
        });
        setWaveform(bars);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      setMicState("denied");
    }
  };

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <motion.div
      className="flex flex-col items-center h-full px-8 pt-4 pb-8"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">
          Set up voice control
        </h2>
        <p className="text-white/50">
          Say "Hey Limen" to wake your OS. Fully local — nothing leaves your
          device.
        </p>
      </div>

      {/* Mic visual */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6">
        <AnimatePresence mode="wait">
          {micState === "granted" ? (
            /* Waveform */
            <motion.div
              key="waveform"
              className="flex items-center gap-0.5 h-20"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
            >
              {waveform.map((h, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all"
                  style={{
                    width: 5,
                    height: h,
                    background: `linear-gradient(to top, #7c3aed, #06b6d4)`,
                    opacity: 0.7 + (h / 56) * 0.3,
                  }}
                />
              ))}
            </motion.div>
          ) : (
            /* Mic button */
            <motion.button
              key="mic-btn"
              onClick={
                micState === "idle" || micState === "denied"
                  ? requestMic
                  : undefined
              }
              className="relative w-28 h-28 rounded-full flex items-center justify-center cursor-pointer"
              style={{
                background:
                  micState === "denied"
                    ? "linear-gradient(135deg, #be185d 0%, #9f1239 100%)"
                    : micState === "requesting"
                      ? "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)"
                      : "linear-gradient(135deg, #7c3aed 0%, #0891b2 100%)",
                boxShadow:
                  micState === "denied"
                    ? "0 0 40px #be185d44"
                    : "0 0 40px #7c3aed44",
              }}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={micState !== "requesting" ? { scale: 1.06 } : {}}
              whileTap={micState !== "requesting" ? { scale: 0.94 } : {}}
            >
              {/* Pulse rings (idle/requesting) */}
              {(micState === "idle" || micState === "requesting") && (
                <>
                  {[1, 2].map((ring) => (
                    <motion.div
                      key={ring}
                      className="absolute inset-0 rounded-full border"
                      style={{ borderColor: "#7c3aed66" }}
                      animate={{
                        scale: [1, 1.5 + ring * 0.25],
                        opacity: [0.5, 0],
                      }}
                      transition={{
                        duration: 1.8,
                        delay: ring * 0.4,
                        repeat: Infinity,
                        ease: "easeOut",
                      }}
                    />
                  ))}
                </>
              )}

              {/* Icon */}
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {micState === "denied" ? (
                  <>
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23M12 20v4M8 20h8" />
                  </>
                ) : (
                  <>
                    <rect x="9" y="2" width="6" height="12" rx="3" />
                    <path d="M19 12a7 7 0 0 1-14 0M12 19v3M8 22h8" />
                  </>
                )}
              </svg>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Status text */}
        <AnimatePresence mode="wait">
          <motion.div
            key={micState}
            className="text-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
          >
            {micState === "idle" && (
              <>
                <p className="text-white font-medium mb-1">
                  Allow microphone access
                </p>
                <p className="text-white/40 text-sm">
                  Click the button above to enable voice control
                </p>
              </>
            )}
            {micState === "requesting" && (
              <p className="text-white/60">Waiting for permission…</p>
            )}
            {micState === "granted" && (
              <>
                <p className="text-green-400 font-medium mb-1">
                  Microphone active
                </p>
                <p className="text-white/40 text-sm">
                  Say "Hey Limen" to get started
                </p>
              </>
            )}
            {micState === "denied" && (
              <>
                <p className="text-rose-400 font-medium mb-1">
                  Permission denied
                </p>
                <p className="text-white/40 text-sm">
                  You can enable it later in settings
                </p>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Nav */}
      <div className="flex gap-3 w-full">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-xl text-white/60 hover:text-white transition-colors text-sm font-medium"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Back
        </button>
        <motion.button
          onClick={onNext}
          className="flex-1 py-3 rounded-xl text-white font-semibold text-sm"
          style={{
            background:
              micState === "granted"
                ? "linear-gradient(135deg, #059669 0%, #0891b2 100%)"
                : "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
            boxShadow: "0 0 24px #7c3aed33",
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {micState === "granted" ? "Voice Ready — Continue" : "Skip for now"}
        </motion.button>
      </div>
    </motion.div>
  );
}
