import { motion } from "framer-motion";

interface Props {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: Props) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center h-full text-center px-8"
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -32 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Floating orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[
          { size: 420, x: "15%", y: "20%", color: "#7c3aed", delay: 0, dur: 8 },
          {
            size: 300,
            x: "75%",
            y: "60%",
            color: "#0891b2",
            delay: 2,
            dur: 10,
          },
          { size: 200, x: "60%", y: "15%", color: "#be185d", delay: 4, dur: 7 },
          { size: 160, x: "25%", y: "70%", color: "#4f46e5", delay: 1, dur: 9 },
        ].map((orb, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: orb.size,
              height: orb.size,
              left: orb.x,
              top: orb.y,
              background: `radial-gradient(circle, ${orb.color}44 0%, transparent 70%)`,
              filter: "blur(60px)",
              transform: "translate(-50%, -50%)",
            }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{
              duration: orb.dur,
              delay: orb.delay,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>

      {/* Logo */}
      <motion.div
        className="relative mb-10"
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Glow ring */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, #7c3aed66 0%, transparent 70%)",
            filter: "blur(24px)",
          }}
          animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
        <div
          className="relative w-28 h-28 rounded-3xl flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #0891b2 100%)",
            boxShadow:
              "0 0 60px #7c3aed66, 0 0 120px #0891b244, inset 0 1px 0 rgba(255,255,255,0.2)",
          }}
        >
          {/* S glyph */}
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
            <path
              d="M36 14c-2.5-2.5-6-4-10-4-8.3 0-14 5.5-14 12 0 5.5 3.5 9.5 10 11.5L28 35c4.5 1.3 7 3.5 7 7.5 0 4.5-3.5 7.5-9 7.5-4 0-7.5-1.5-10-4.5"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </div>
      </motion.div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.6 }}
      >
        <h1
          className="text-6xl font-black tracking-tight mb-3"
          style={{
            background:
              "linear-gradient(135deg, #fff 30%, #c4b5fd 60%, #67e8f9 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.03em",
          }}
        >
          LIMEN OS
        </h1>
        <p className="text-xl text-white/50 font-light tracking-wide">
          Voice-first · AI-native · Beautiful
        </p>
      </motion.div>

      {/* Divider */}
      <motion.div
        className="mt-10 mb-8 w-px h-12"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(255,255,255,0.2), transparent)",
        }}
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ delay: 0.55, duration: 0.5 }}
      />

      {/* Subtitle */}
      <motion.p
        className="text-white/60 text-lg max-w-sm leading-relaxed mb-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7, duration: 0.6 }}
      >
        Let's get you set up in under two minutes.
        <br />
        You can change everything later.
      </motion.p>

      {/* CTA */}
      <motion.button
        onClick={onNext}
        className="relative px-10 py-4 rounded-2xl text-white font-semibold text-lg overflow-hidden group"
        style={{
          background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
          boxShadow: "0 0 40px #7c3aed44",
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85, duration: 0.4 }}
        whileHover={{ scale: 1.04, boxShadow: "0 0 60px #7c3aed88" }}
        whileTap={{ scale: 0.97 }}
      >
        <span className="relative z-10 flex items-center gap-2">
          Begin Setup
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </span>
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
          }}
        />
      </motion.button>
    </motion.div>
  );
}
