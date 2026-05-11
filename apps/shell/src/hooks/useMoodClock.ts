/**
 * useMoodClock — wires wall-clock time into the MoodEngine.
 *
 * Runs every 60 s, determines the current TimeBand from the hour,
 * and calls setTimeBand so the MoodEngine can recompute activeMood.
 * Also drives scene auto-transitions for rest/ghost moods
 * when no windows are open and no manual override is set.
 *
 * Call once in App.tsx.
 */
import { useEffect, useRef } from "react";
import { getTimeBand, useMoodStore } from "../store/mood";
import { useShellStore } from "../store/shell";

const TICK_MS = 60_000; // every 1 minute

/** Time in ms after which no presence triggers ghost mode. */
const GHOST_AFTER_MS = 5 * 60_000;

/** Time in ms of no new windows / keyboard events to increment flow. */
const FLOW_TICK_MS = 60_000;

export function useMoodClock() {
  const lastActivityRef = useRef<number>(0);
  const presenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flowIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Time band ticker ────────────────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      const hour = new Date().getHours();
      const band = getTimeBand(hour);
      useMoodStore.getState().setTimeBand(band);

      // Auto scene transitions — only when mood is not manually overridden
      // and no windows are open (user is not actively doing something)
      const { manualOverride } = useMoodStore.getState();
      const { windows, setScene } = useShellStore.getState();
      if (!manualOverride && windows.length === 0) {
        const mood = useMoodStore.getState().activeMood;
        if (mood.scene !== useShellStore.getState().activeScene) {
          setScene(mood.scene as Parameters<typeof setScene>[0]);
        }
      }
    }

    tick(); // immediate
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // ── Presence → ghost mode ───────────────────────────────────────────────────
  useEffect(() => {
    const unsubPresence = useShellStore.subscribe((s, prev) => {
      const present = s.presenceDetected;
      if (present === prev.presenceDetected) return;
      if (present) {
        // Someone appeared — cancel ghost timer, clear ghost mode
        if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current);
        presenceTimerRef.current = null;
        const mood = useMoodStore.getState();
        if (mood.ghostMode) {
          mood.setGhostMode(false);
          // Brief "presence" flash
          mood.setManualMood("presence");
          setTimeout(() => {
            if (useMoodStore.getState().manualOverride === "presence") {
              useMoodStore.getState().setManualMood(null);
            }
          }, 4000);
        }
      } else {
        // No presence — start ghost countdown
        presenceTimerRef.current = setTimeout(() => {
          useMoodStore.getState().setGhostMode(true);
        }, GHOST_AFTER_MS);
      }
    });

    return () => {
      unsubPresence();
      if (presenceTimerRef.current) clearTimeout(presenceTimerRef.current);
    };
  }, []);

  // ── Flow depth tracking ─────────────────────────────────────────────────────
  // Increment flowDepth every minute while no new windows were opened
  // and keyboard activity was detected. Reset on new window / voice command.
  useEffect(() => {
    // Track user activity (keyboard = focus work)
    function onKey() {
      lastActivityRef.current = Date.now();
    }
    window.addEventListener("keydown", onKey, { passive: true });

    // Unsubscribe flow reset triggers: new window open, voice activation
    const unsubWindows = useShellStore.subscribe((s, prev) => {
      if (s.windows.length !== prev.windows.length)
        useMoodStore.getState().resetFlowDepth();
    });
    const unsubVoice = useShellStore.subscribe((s, prev) => {
      if (s.voiceActive && !prev.voiceActive)
        useMoodStore.getState().resetFlowDepth();
    });

    // Every minute: if keyboard was active in last 2 min → increment flow
    flowIntervalRef.current = setInterval(() => {
      const idle = Date.now() - lastActivityRef.current;
      if (idle < 2 * 60_000) {
        useMoodStore.getState().incrementFlowDepth(1);
      } else {
        useMoodStore.getState().resetFlowDepth();
      }
    }, FLOW_TICK_MS);

    return () => {
      window.removeEventListener("keydown", onKey);
      unsubWindows();
      unsubVoice();
      if (flowIntervalRef.current) clearInterval(flowIntervalRef.current);
    };
  }, []);
}
