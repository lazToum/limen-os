import { motion, type Variants } from "framer-motion";
import type { Paradigm } from "../../../store/shell";

interface Props {
  selected: Paradigm;
  onSelect: (p: Paradigm) => void;
  onNext: () => void;
  onBack: () => void;
}

const STYLES: {
  id: Paradigm;
  name: string;
  description: string;
  gradient: string;
  glow: string;
  preview: React.ReactNode;
}[] = [
  {
    id: "win11",
    name: "Modern",
    description: "Taskbar, windows, familiar — but beautiful",
    gradient: "linear-gradient(135deg, #0078d4 0%, #106ebe 100%)",
    glow: "#0078d440",
    preview: (
      <div className="flex flex-col gap-1 w-full">
        <div className="h-1 rounded-full bg-white/30 w-3/4" />
        <div className="h-1 rounded-full bg-white/20 w-1/2" />
        <div className="mt-1 h-3 rounded bg-white/15 w-full" />
        <div className="h-1.5 rounded bg-white/10 w-full mt-1" />
      </div>
    ),
  },
  {
    id: "nebula",
    name: "Nebula",
    description: "Immersive 3D — floating widgets in deep space",
    gradient: "linear-gradient(135deg, #7c3aed 0%, #0891b2 100%)",
    glow: "#7c3aed40",
    preview: (
      <div className="relative w-full h-full">
        {[
          { size: 24, x: "20%", y: "30%" },
          { size: 16, x: "65%", y: "20%" },
          { size: 20, x: "50%", y: "65%" },
        ].map((orb, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: orb.size,
              height: orb.size,
              left: orb.x,
              top: orb.y,
              background:
                "radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 70%)",
              transform: "translate(-50%,-50%)",
            }}
          />
        ))}
      </div>
    ),
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean, keyboard-first, distraction-free",
    gradient: "linear-gradient(135deg, #374151 0%, #1f2937 100%)",
    glow: "#37415140",
    preview: (
      <div className="flex flex-col gap-2 w-full">
        <div className="flex gap-1.5">
          <div className="h-1.5 rounded-full bg-white/50 w-6" />
          <div className="h-1.5 rounded-full bg-white/20 w-10" />
        </div>
        <div className="h-px bg-white/15 w-full" />
        <div className="h-1 rounded-full bg-white/20 w-2/3" />
        <div className="h-1 rounded-full bg-white/10 w-1/2" />
      </div>
    ),
  },
  {
    id: "unix",
    name: "Unix",
    description: "Terminal aesthetic — retro green-on-black",
    gradient: "linear-gradient(135deg, #065f46 0%, #064e3b 100%)",
    glow: "#065f4640",
    preview: (
      <div className="font-mono text-[9px] text-green-400/80 leading-tight">
        <div>$ limen --start</div>
        <div className="text-green-400/50">{">"} init voice pipeline</div>
        <div className="text-green-400/50">{">"} loading ai router</div>
        <div>
          $ <span className="animate-pulse">_</span>
        </div>
      </div>
    ),
  },
];

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
};

export function StyleStep({ selected, onSelect, onNext, onBack }: Props) {
  return (
    <motion.div
      className="flex flex-col h-full px-8 pt-4 pb-8"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">
          Choose your shell style
        </h2>
        <p className="text-white/50">
          How do you like to work? You can switch anytime.
        </p>
      </div>

      <motion.div
        className="grid grid-cols-2 gap-4 flex-1"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {STYLES.map((style) => {
          const isSelected = selected === style.id;
          return (
            <motion.button
              key={style.id}
              variants={cardVariants}
              onClick={() => onSelect(style.id)}
              className="relative p-5 rounded-2xl text-left flex flex-col overflow-hidden transition-all duration-200"
              style={{
                background: isSelected
                  ? `linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 100%)`
                  : "rgba(255,255,255,0.04)",
                border: isSelected
                  ? `1.5px solid rgba(255,255,255,0.25)`
                  : "1.5px solid rgba(255,255,255,0.07)",
                boxShadow: isSelected
                  ? `0 0 30px ${style.glow}, 0 8px 32px rgba(0,0,0,0.3)`
                  : "0 4px 16px rgba(0,0,0,0.2)",
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {/* Color strip */}
              <div
                className="w-full h-16 rounded-xl mb-4 flex items-center justify-center overflow-hidden"
                style={{ background: style.gradient }}
              >
                <div className="w-full px-4 py-2">{style.preview}</div>
              </div>

              {/* Text */}
              <div className="font-semibold text-white text-sm mb-1">
                {style.name}
              </div>
              <div className="text-white/50 text-xs leading-snug">
                {style.description}
              </div>

              {/* Selected check */}
              {isSelected && (
                <motion.div
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.9)" }}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 25 }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </motion.div>

      {/* Nav */}
      <div className="flex gap-3 mt-6">
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
            background: "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
            boxShadow: "0 0 24px #7c3aed33",
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Continue
        </motion.button>
      </div>
    </motion.div>
  );
}
