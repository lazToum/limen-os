/**
 * SetupWizard — Full-screen first-run onboarding experience.
 *
 * Shown on first launch (no localStorage "limen:setup-complete" key).
 * Saves config via Tauri command → ~/.config/limen/setup.json.
 * Falls back to localStorage-only when running in browser dev mode.
 *
 * Steps:
 *   0  Welcome
 *   1  Style (paradigm)
 *   2  Voice (mic permission)
 *   3  AI Keys (optional)
 *   4  Launch
 */
import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShellStore, type Paradigm } from "../../store/shell";
import { getApp } from "../../constants/apps";
import { WelcomeStep } from "./steps/WelcomeStep";
import { StyleStep } from "./steps/StyleStep";
import { VoiceStep } from "./steps/VoiceStep";
import { AIKeysStep, type AIConfig } from "./steps/AIKeysStep";
import { LaunchStep } from "./steps/LaunchStep";

const TOTAL_STEPS = 5; // 0..4

/** Minimal dot-progress indicator. */
function StepDots({ current, total }: { current: number; total: number }) {
  if (current === 0) return null; // hide on welcome screen
  return (
    <div className="absolute top-7 left-1/2 -translate-x-1/2 flex gap-2">
      {Array.from({ length: total - 1 }, (_, i) => {
        const step = i + 1;
        const done = current > step;
        const active = current === step;
        return (
          <motion.div
            key={i}
            className="rounded-full"
            style={{
              width: active ? 24 : 8,
              height: 8,
              background: done
                ? "rgba(255,255,255,0.6)"
                : active
                  ? "linear-gradient(90deg, #7c3aed, #0891b2)"
                  : "rgba(255,255,255,0.15)",
            }}
            animate={{ width: active ? 24 : 8 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />
        );
      })}
    </div>
  );
}

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [paradigm, setParadigm] = useState<Paradigm>("win11");
  const [aiConfig, setAiConfig] = useState<AIConfig>({
    anthropic: "",
    openai: "",
    gemini: "",
  });
  const { setParadigm: applyParadigm, openWindow } = useShellStore();

  const next = useCallback(
    () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1)),
    [],
  );
  const back = useCallback(() => setStep((s) => Math.max(s - 1, 0)), []);

  const handleSelectParadigm = useCallback((p: Paradigm) => {
    setParadigm(p);
    // applyParadigm is deferred to handleLaunch to avoid changing
    // the live canvas/mood filters behind the setup wizard modal.
  }, []);

  const handleLaunch = useCallback(async () => {
    // Apply selected paradigm now (deferred from handleSelectParadigm)
    applyParadigm(paradigm);

    // Persist config
    const config = {
      paradigm,
      aiKeys: aiConfig,
      completedAt: new Date().toISOString(),
    };

    // Try Tauri command; fall back to localStorage silently
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_setup_config", { config: JSON.stringify(config) });
    } catch {
      // browser dev or Tauri not available
    }
    localStorage.setItem("limen:setup-complete", "1");
    localStorage.setItem("limen:setup-config", JSON.stringify(config));

    onComplete();
  }, [paradigm, aiConfig, onComplete, applyParadigm]);

  const handleLaunchWithTutorial = useCallback(async () => {
    await handleLaunch();
    const app = getApp("limen-mind");
    if (app) openWindow(app);
  }, [handleLaunch, openWindow]);

  return (
    <motion.div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 99999 }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 40%, #1a0533 0%, #060010 55%, #000000 100%)",
        }}
      />

      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Step dots */}
      <StepDots current={step} total={TOTAL_STEPS} />

      {/* Glass card */}
      <motion.div
        className="relative w-full max-w-lg overflow-hidden"
        style={{
          height: step === 0 ? 560 : step === 4 ? 540 : 580,
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 28,
          boxShadow:
            "0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
        animate={{ height: step === 0 ? 560 : step === 4 ? 540 : 580 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {/* Inner glow top */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)",
          }}
        />

        {/* Step content */}
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="welcome" className="absolute inset-0">
              <WelcomeStep onNext={next} />
            </motion.div>
          )}
          {step === 1 && (
            <motion.div key="style" className="absolute inset-0">
              <StyleStep
                selected={paradigm}
                onSelect={handleSelectParadigm}
                onNext={next}
                onBack={back}
              />
            </motion.div>
          )}
          {step === 2 && (
            <motion.div key="voice" className="absolute inset-0">
              <VoiceStep onNext={next} onBack={back} />
            </motion.div>
          )}
          {step === 3 && (
            <motion.div key="ai" className="absolute inset-0">
              <AIKeysStep
                config={aiConfig}
                onChange={setAiConfig}
                onNext={next}
                onBack={back}
              />
            </motion.div>
          )}
          {step === 4 && (
            <motion.div key="launch" className="absolute inset-0">
              <LaunchStep
                onLaunch={handleLaunch}
                onLaunchWithTutorial={handleLaunchWithTutorial}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
