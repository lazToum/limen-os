/**
 * useMoodSync — applies the active OsMood to the DOM as CSS custom properties
 * and drives the Babylon.js scene intensity in real-time.
 *
 * CSS vars written to :root (instant, no re-render cost):
 *   --mood-accent          hex color
 *   --mood-accent-rgb      "r, g, b" for rgba()
 *   --mood-accent-glow     rgba with 0.35 alpha
 *   --mood-warmth          –1..+1
 *   --mood-saturation      0..2
 *   --mood-intensity       0..1 (scene glow / particle brightness)
 *   --mood-animation-speed CSS multiplier (used in animation-duration calc)
 *   --mood-particle-density 0..1
 *   --mood-name            mood name string (e.g. "focus") for attr selectors
 *
 * Babylon integration: if a SceneManager ref is passed, updates the active
 * scene's glow intensity and accent color each time the mood changes.
 *
 * Call once in App.tsx after the SceneManager is ready.
 */
import { useEffect, useRef } from "react";
import { useMoodStore, type OsMood } from "../store/mood";
import type { SceneManager } from "../scenes/SceneManager";

function applyMoodVars(mood: OsMood) {
  const root = document.documentElement;
  root.style.setProperty("--mood-accent", mood.accent);
  root.style.setProperty("--mood-accent-rgb", mood.accentRgb);
  root.style.setProperty("--mood-accent-glow", `rgba(${mood.accentRgb}, 0.35)`);
  root.style.setProperty("--mood-warmth", String(mood.warmth));
  root.style.setProperty("--mood-saturation", String(mood.saturation));
  root.style.setProperty("--mood-intensity", String(mood.sceneIntensity));
  root.style.setProperty("--mood-animation-speed", String(mood.animationSpeed));
  root.style.setProperty(
    "--mood-particle-density",
    String(mood.particleDensity),
  );
  root.setAttribute("data-mood", mood.name);
  root.setAttribute("data-notif-style", mood.notifStyle);
  root.setAttribute("data-ui-density", mood.uiDensity);
  root.setAttribute("data-clock", mood.clockBehavior);
}

export function useMoodSync(sceneManager?: SceneManager | null) {
  const sceneManagerRef = useRef<SceneManager | null | undefined>(null);

  useEffect(() => {
    sceneManagerRef.current = sceneManager;
  }, [sceneManager]);

  useEffect(() => {
    // Apply immediately on mount
    applyMoodVars(useMoodStore.getState().activeMood);

    // Subscribe to future changes — useMoodStore.subscribe is synchronous
    const unsub = useMoodStore.subscribe((s, prev) => {
      if (s.activeMood === prev.activeMood) return;
      applyMoodVars(s.activeMood);
      sceneManagerRef.current?.setMoodHint?.(
        s.activeMood.accent,
        s.activeMood.sceneIntensity,
        s.activeMood.animationSpeed,
      );
    });

    return unsub;
  }, []); // deliberately empty — sceneManagerRef handles the ref update
}
