import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface Props {
  onLaunch: () => void;
  onLaunchWithTutorial?: () => void;
}

const SPARKS = Array.from({ length: 24 }, (_, i) => ({
  angle: (i / 24) * 360,
  length: 40 + Math.random() * 60,
  delay: Math.random() * 0.4,
  color: ["#7c3aed", "#0891b2", "#8b5cf6", "#06b6d4", "#f43f5e"][i % 5],
}));

export function LaunchStep({ onLaunch, onLaunchWithTutorial }: Props) {
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBurst(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full px-8 text-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* Starburst */}
      <div className="relative mb-10">
        {/* Sparks */}
        {burst &&
          SPARKS.map((spark, i) => (
            <motion.div
              key={i}
              className="absolute left-1/2 top-1/2 origin-left"
              style={{
                width: spark.length,
                height: 2,
                borderRadius: 1,
                background: spark.color,
                rotate: spark.angle,
                translateX: "-50%",
                translateY: "-50%",
              }}
              initial={{ scaleX: 0, opacity: 1 }}
              animate={{
                scaleX: [0, 1, 0],
                opacity: [0, 1, 0],
                x: [0, spark.length * 0.5],
              }}
              transition={{
                duration: 0.8,
                delay: spark.delay,
                ease: "easeOut",
              }}
            />
          ))}

        {/* Check circle */}
        <motion.div
          className="relative w-28 h-28 rounded-full flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #0891b2 100%)",
            boxShadow: "0 0 60px #7c3aed66, 0 0 120px #0891b244",
          }}
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            delay: 0.15,
            duration: 0.6,
            type: "spring",
            stiffness: 260,
            damping: 20,
          }}
        >
          <motion.svg
            width="52"
            height="52"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            <motion.path
              d="M20 6L9 17l-5-5"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ delay: 0.5, duration: 0.5, ease: "easeInOut" }}
            />
          </motion.svg>
        </motion.div>
      </div>

      {/* Text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        <h2
          className="text-5xl font-black mb-4 tracking-tight"
          style={{
            background:
              "linear-gradient(135deg, #fff 30%, #c4b5fd 60%, #67e8f9 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.02em",
          }}
        >
          You're ready.
        </h2>
        <p className="text-white/50 text-lg leading-relaxed max-w-xs">
          Say <span className="text-violet-400 font-medium">"Hey Limen"</span>{" "}
          anytime to wake your OS.
          <br />
          Everything adapts to you.
        </p>
      </motion.div>

      {/* Quick tips */}
      <motion.div
        className="flex gap-3 mt-8 mb-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85, duration: 0.5 }}
      >
        {[
          { icon: "🎙️", tip: "Voice control" },
          { icon: "🤖", tip: "AI-native" },
          { icon: "✨", tip: "3D scenes" },
        ].map((item) => (
          <div
            key={item.tip}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/60"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <span>{item.icon}</span>
            {item.tip}
          </div>
        ))}
      </motion.div>

      {/* Launch button */}
      <motion.button
        onClick={onLaunch}
        className="relative px-14 py-4 rounded-2xl text-white font-bold text-xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #0891b2 100%)",
          boxShadow: "0 0 60px #7c3aed55, 0 20px 60px rgba(0,0,0,0.4)",
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          delay: 1.1,
          duration: 0.5,
          type: "spring",
          stiffness: 200,
          damping: 18,
        }}
        whileHover={{
          scale: 1.05,
          boxShadow: "0 0 80px #7c3aed88, 0 20px 60px rgba(0,0,0,0.4)",
        }}
        whileTap={{ scale: 0.96 }}
      >
        <span className="relative z-10 flex items-center gap-3">
          Launch LIMEN OS
          <motion.svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            animate={{ x: [0, 4, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </motion.svg>
        </span>
      </motion.button>

      {/* Tutorial shortcut */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
        className="flex flex-col items-center gap-2 mt-4"
      >
        {onLaunchWithTutorial && (
          <button
            onClick={onLaunchWithTutorial}
            className="text-sm text-violet-400/70 hover:text-violet-300 transition-colors underline underline-offset-2 cursor-pointer bg-transparent border-none"
          >
            🧠 or start with the Limen Mind tutorial
          </button>
        )}
        <span className="text-xs text-white/20">
          you can always open it later from the launcher
        </span>
      </motion.div>
    </motion.div>
  );
}
