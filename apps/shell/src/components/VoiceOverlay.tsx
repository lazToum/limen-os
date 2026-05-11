import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { useShellStore } from "../store/shell";

/**
 * VoiceOverlay — shown as a glass panel at the bottom during voice interaction.
 *
 * Shows:
 *   - Live transcript (interim in grey, final in white)
 *   - "Thinking…" spinner while AI processes
 *   - Model badge (which LLM is active)
 *   - Wake-pulse ring when "Hey Limen" is detected
 */
export function VoiceOverlay() {
  const { voiceTranscript, aiThinking, lastAiModel } = useShellStore();
  const [wakePulse, setWakePulse] = useState(false);

  useEffect(() => {
    const handler = () => {
      setWakePulse(true);
      setTimeout(() => setWakePulse(false), 700);
    };
    window.addEventListener("limen:wake", handler);
    return () => window.removeEventListener("limen:wake", handler);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="pointer-events-none fixed bottom-8 left-1/2 -translate-x-1/2 w-[640px] max-w-[90vw]"
      style={{ pointerEvents: "none" }}
    >
      {/* Wake-word pulse ring */}
      <AnimatePresence>
        {wakePulse && (
          <motion.div
            key="wake-ring"
            initial={{ scale: 0.5, opacity: 0.9 }}
            animate={{ scale: 3.5, opacity: 0 }}
            exit={{}}
            transition={{ duration: 0.65, ease: "easeOut" }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid cyan",
              pointerEvents: "none",
              transformOrigin: "center",
            }}
          />
        )}
      </AnimatePresence>
      <div className="glass glow-cyan px-6 py-4 flex items-center gap-4">
        {/* Mic pulse indicator */}
        <div className="relative flex-shrink-0">
          <div
            className="w-3 h-3 rounded-full bg-cyan-400"
            style={{
              animation: aiThinking
                ? "none"
                : "pulse 1.2s ease-in-out infinite",
            }}
          />
          {aiThinking && (
            <div className="absolute inset-0 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
          )}
        </div>

        {/* Transcript */}
        <div className="flex-1 min-w-0">
          {aiThinking ? (
            <span className="text-amber-400 text-sm">
              Thinking…{" "}
              {lastAiModel && (
                <span className="opacity-60">({lastAiModel})</span>
              )}
            </span>
          ) : voiceTranscript ? (
            <span className="text-white text-sm truncate">
              {voiceTranscript}
            </span>
          ) : (
            <span className="text-slate-400 text-sm">Listening…</span>
          )}
        </div>

        {/* Wake word hint */}
        <span className="text-slate-500 text-xs flex-shrink-0">Hey Limen</span>
      </div>
    </motion.div>
  );
}
