import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

export interface AIConfig {
  anthropic: string;
  openai: string;
  gemini: string;
}

interface Props {
  config: AIConfig;
  onChange: (cfg: AIConfig) => void;
  onNext: () => void;
  onBack: () => void;
}

interface ProviderDef {
  id: keyof AIConfig;
  name: string;
  placeholder: string;
  prefix: string;
  color: string;
  glow: string;
  isPrimary?: boolean;
}

const PROVIDERS: ProviderDef[] = [
  {
    id: "anthropic",
    name: "Anthropic Claude",
    placeholder: "sk-ant-api03-…",
    prefix: "sk-ant-",
    color: "linear-gradient(135deg, #d97706 0%, #b45309 100%)",
    glow: "#d9770644",
    isPrimary: true,
  },
  {
    id: "openai",
    name: "OpenAI GPT-4o",
    placeholder: "sk-proj-…",
    prefix: "sk-",
    color: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
    glow: "#10b98144",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    placeholder: "AIzaSy…",
    prefix: "AIza",
    color: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
    glow: "#3b82f644",
  },
];

function KeyInput({
  provider,
  value,
  onChange,
}: {
  provider: ProviderDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(provider.isPrimary ?? false);
  const hasValue = value.length > 0;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((o) => !o)}
      >
        {/* Color dot */}
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: provider.color }}
        />
        <span className="text-white/80 text-sm font-medium flex-1">
          {provider.name}
        </span>
        {provider.isPrimary && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: "#d9770622", color: "#fbbf24" }}
          >
            Primary
          </span>
        )}
        {hasValue && <span className="text-green-400 text-xs">✓ Set</span>}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="rgba(255,255,255,0.4)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Input */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-4 pb-3">
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2.5"
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <input
                  type={visible ? "text" : "password"}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={provider.placeholder}
                  className="flex-1 bg-transparent text-white/90 text-sm outline-none placeholder-white/25 font-mono"
                />
                <button
                  onClick={() => setVisible((v) => !v)}
                  className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
                >
                  {visible ? (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AIKeysStep({ config, onChange, onNext, onBack }: Props) {
  const hasAnyKey = Object.values(config).some((v) => v.length > 0);

  return (
    <motion.div
      className="flex flex-col h-full px-8 pt-4 pb-8"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold text-white mb-2">Connect your AI</h2>
        <p className="text-white/50 text-sm">
          Limen routes to the best model available. Keys are stored locally,
          never shared.
        </p>
      </div>

      {/* Providers */}
      <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
        {PROVIDERS.map((p) => (
          <KeyInput
            key={p.id}
            provider={p}
            value={config[p.id]}
            onChange={(v) => onChange({ ...config, [p.id]: v })}
          />
        ))}

        {/* Info note */}
        <div
          className="flex gap-3 items-start rounded-xl px-4 py-3 mt-1"
          style={{
            background: "rgba(124, 58, 237, 0.08)",
            border: "1px solid rgba(124, 58, 237, 0.15)",
          }}
        >
          <svg
            width="15"
            height="15"
            className="mt-0.5 flex-shrink-0 text-violet-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-white/40 text-xs leading-relaxed">
            Limen works without keys using local models. Claude is primary — it
            handles voice intent, context, and agentic tasks best.
          </p>
        </div>
      </div>

      {/* Nav */}
      <div className="flex gap-3 mt-5">
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
            background: hasAnyKey
              ? "linear-gradient(135deg, #059669 0%, #0891b2 100%)"
              : "linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)",
            boxShadow: "0 0 24px #7c3aed33",
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {hasAnyKey ? "Save & Continue" : "Skip for now"}
        </motion.button>
      </div>
    </motion.div>
  );
}
