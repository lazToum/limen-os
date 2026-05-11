/**
 * useGlobalKeys — global keyboard shortcut layer.
 *
 * All shortcuts use Ctrl (or Cmd on Mac) as modifier to avoid clashing
 * with the host window manager that captures Super/Meta.
 * Tauri-level global shortcuts (registered in Rust) can complement these later.
 *
 * Shortcut map:
 *   Ctrl+Space        → toggle voice
 *   Ctrl+K            → command palette  (future — dispatches open:palette event)
 *   Ctrl+M            → cycle mood (time-band default → focus → flow → rest → …)
 *   Ctrl+1 … Ctrl+8   → switch paradigm
 *   Ctrl+Alt+T        → open terminal window
 *   Ctrl+Alt+L        → lock session
 *   Escape            → close voice / palette / overlays / go home
 *
 * Call once in App.tsx.
 */
import { useEffect } from "react";
import { useShellStore, type Paradigm } from "../store/shell";
import { useMoodStore, MOOD_NAMES, type MoodName } from "../store/mood";

const PARADIGM_BY_KEY: Record<string, Paradigm> = {
  "1": "win11",
  "2": "nebula",
  "3": "minimal",
  "4": "unix",
  "5": "dos",
  "6": "macos7",
  "7": "calm",
  "8": "mobile",
};

// Cycle order for Ctrl+M
const MOOD_CYCLE: MoodName[] = ["morning", "focus", "flow", "evening", "rest"];

export function useGlobalKeys() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const alt = e.altKey;
      const key = e.key;
      const store = useShellStore.getState();
      const mood = useMoodStore.getState();

      // ── Escape — dismiss overlays, go home ──────────────────────────────
      if (key === "Escape") {
        if (store.voiceActive) {
          store.setVoiceActive(false);
          e.preventDefault();
          return;
        }
        // Dispatch palette close event for future command palette
        window.dispatchEvent(new CustomEvent("limen:palette:close"));
        // If on non-home scene with no windows, go home
        if (store.activeScene !== "home" && store.windows.length === 0) {
          store.setScene("home");
          e.preventDefault();
        }
        return;
      }

      if (!ctrl) return;

      // ── Ctrl+Space — toggle voice ────────────────────────────────────────
      if (key === " ") {
        e.preventDefault();
        store.setVoiceActive(!store.voiceActive);
        return;
      }

      // ── Ctrl+K — command palette ─────────────────────────────────────────
      if (key === "k" || key === "K") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("limen:palette:open"));
        return;
      }

      // ── Ctrl+M — cycle mood ──────────────────────────────────────────────
      if (key === "m" || key === "M") {
        e.preventDefault();
        const current = mood.manualOverride ?? mood.activeMood.name;
        const idx = MOOD_CYCLE.indexOf(current as MoodName);
        const next = MOOD_CYCLE[(idx + 1) % MOOD_CYCLE.length];
        mood.setManualMood(next ?? null);
        store.addNotification({
          title: "Limen",
          body: `Mood → ${next}`,
          kind: "info",
        });
        return;
      }

      // ── Ctrl+Alt+T — terminal ────────────────────────────────────────────
      if (alt && (key === "t" || key === "T")) {
        e.preventDefault();
        import("../constants/apps").then(({ getApp }) => {
          const app = getApp("terminal");
          if (app) store.openWindow(app);
        });
        return;
      }

      // ── Ctrl+Alt+L — lock ────────────────────────────────────────────────
      if (alt && (key === "l" || key === "L")) {
        e.preventDefault();
        store.setSession(store.sessionUser, true);
        store.setScene("greeter");
        return;
      }

      // ── Ctrl+1–8 — switch paradigm ───────────────────────────────────────
      if (PARADIGM_BY_KEY[key]) {
        e.preventDefault();
        store.setParadigm(PARADIGM_BY_KEY[key]!);
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** Hook: returns current mood cycle index (for UI indicators). */
export { MOOD_CYCLE, PARADIGM_BY_KEY, MOOD_NAMES };
