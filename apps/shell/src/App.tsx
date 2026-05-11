import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_APPS, getApp } from "./constants/apps";
import { AnimatePresence } from "framer-motion";
import { SceneManager } from "./scenes/SceneManager";
import { VoiceOverlay } from "./components/VoiceOverlay";
import { NotificationTray } from "./components/NotificationTray";
import { Desktop } from "./components/desktop/Desktop";
import { MobileCompanion } from "./components/MobileCompanion";
import { SetupWizard } from "./components/setup/SetupWizard";
import { useShellStore } from "./store/shell";
import { useMoodStore, type MoodName } from "./store/mood";
import { useMoodClock } from "./hooks/useMoodClock";
import { useMoodSync } from "./hooks/useMoodSync";
import { useGlobalKeys } from "./hooks/useGlobalKeys";
import { VoiceClient } from "@limen-os/voice-client";
import { cameraManager } from "./video/camera";
import { networkManager } from "./network/network";

// ── TTS helper ───────────────────────────────────────────────────────────────
// Tauri: pyttsx3 via native command (WebKit doesn't support SpeechSynthesis on Linux).
// Browser: Web Speech API with voiceschanged wait.
function speakText(text: string) {
  if (!text) return;
  if ("__TAURI_INTERNALS__" in window) {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("tts_speak", { text }))
      .catch(() => {});
    return;
  }
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.05;
  utt.pitch = 1.0;
  const doSpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const v =
      voices.find((v) => v.lang.startsWith("en") && !v.localService) ??
      voices.find((v) => v.lang.startsWith("en")) ??
      voices[0];
    if (v) utt.voice = v;
    window.speechSynthesis.speak(utt);
  };
  if (window.speechSynthesis.getVoices().length > 0) {
    doSpeak();
  } else {
    window.speechSynthesis.addEventListener("voiceschanged", doSpeak, {
      once: true,
    });
  }
}

// ── Frustration / TRANSPORT helpers ──────────────────────────────────────────

const FRUSTRATION_PHRASES = [
  "fuck",
  "shit",
  "damn",
  "don't understand",
  "you don't",
  "not working",
  "forget it",
  "never mind",
  "forget this",
  "useless",
  "idiot",
  "stupid",
  "wrong",
  "no no no",
  "stop",
  "ugh",
];

const TRANSPORT_TRIGGERS: Record<string, () => void> = {
  "give me the tui": () => useShellStore.getState().setTransport("tui"),
  "open terminal": () => useShellStore.getState().setTransport("tui"),
  "bring me the terminal": () => useShellStore.getState().setTransport("tui"),
  "give me a keyboard": () => useShellStore.getState().setTransport("keyboard"),
  "bring me a keyboard": () =>
    useShellStore.getState().setTransport("keyboard"),
  "keyboard mode": () => useShellStore.getState().setTransport("keyboard"),
  "manual mode": () => useShellStore.getState().setTransport("keyboard"),
  "i'll do it manually": () =>
    useShellStore.getState().setTransport("keyboard"),
};

const PARADIGM_TRIGGERS: Record<string, string> = {
  "terminal mode": "unix",
  "unix mode": "unix",
  "old school": "unix",
  "retro mode": "dos",
  "dos mode": "dos",
  "windows mode": "win11",
  "classic mode": "win11",
  "win11 mode": "win11",
  "calm down": "calm",
  "calm mode": "calm",
  "simple mode": "minimal",
  "minimal mode": "minimal",
  "space mode": "nebula",
  "normal mode": "nebula",
  "nebula mode": "nebula",
  "mobile mode": "mobile",
  "phone mode": "mobile",
  "compact mode": "mobile",
};

// Quick-launch via voice — opens a window by appId
const LAUNCH_TRIGGERS: Record<string, string> = {
  "open limen mind": "limen-mind",
  "teach me": "limen-mind",
  "open mind": "limen-mind",
  "learn wid": "limen-mind",
  "open player": "waldiez-player",
  "open docs": "docs",
  "open lobby": "lobby",
  "go to lobby": "lobby",
  "show portals": "lobby",
};

const MOOD_TRIGGERS: Record<string, MoodName | null> = {
  // Focus
  "focus mode": "focus",
  "focus time": "focus",
  "help me focus": "focus",
  concentrate: "focus",
  "do not disturb": "focus",
  // Flow / creative
  "flow mode": "flow",
  "creative mode": "flow",
  "in the zone": "flow",
  "let it flow": "flow",
  // Rest / night
  "chill mode": "rest",
  "chill out": "rest",
  "rest mode": "rest",
  relax: "rest",
  "wind down": "rest",
  "night mode": "rest",
  "sleep mode": "rest",
  // Dawn / morning
  "morning mode": "dawn",
  "good morning": "dawn",
  "wake up": "dawn",
  // Evening
  "evening mode": "evening",
  "good evening": "evening",
  // Alert
  "alert mode": "alert",
  emergency: "alert",
  // Celebration
  celebrate: "celebration",
  "party mode": "celebration",
  "good job": "celebration",
  "nice work": "celebration",
  // Clear override — back to time-based auto
  "auto mood": null,
  "clear mood": null,
  "back to normal": null,
  "reset mood": null,
};

function isFrustrated(text: string): boolean {
  const lower = text.toLowerCase();
  return FRUSTRATION_PHRASES.some((p) => lower.includes(p));
}

function isTransportCommand(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    Object.keys(TRANSPORT_TRIGGERS).some((k) => lower.includes(k)) ||
    Object.keys(PARADIGM_TRIGGERS).some((k) => lower.includes(k)) ||
    Object.keys(MOOD_TRIGGERS).some((k) => lower.includes(k)) ||
    Object.keys(LAUNCH_TRIGGERS).some((k) => lower.includes(k))
  );
}

function handleTransportCommand(text: string): void {
  const lower = text.toLowerCase();
  for (const [phrase, fn] of Object.entries(TRANSPORT_TRIGGERS)) {
    if (lower.includes(phrase)) {
      fn();
      return;
    }
  }
  for (const [phrase, paradigm] of Object.entries(PARADIGM_TRIGGERS)) {
    if (lower.includes(phrase)) {
      useShellStore
        .getState()
        .setParadigm(paradigm as import("./store/shell").Paradigm);
      return;
    }
  }
  for (const [phrase, mood] of Object.entries(MOOD_TRIGGERS)) {
    if (lower.includes(phrase)) {
      useMoodStore.getState().setManualMood(mood);
      if (mood) {
        useShellStore.getState().addNotification({
          title: "Limen",
          body: `Mood → ${mood}`,
          kind: "info",
        });
      }
      return;
    }
  }
  for (const [phrase, appId] of Object.entries(LAUNCH_TRIGGERS)) {
    if (lower.includes(phrase)) {
      if (appId === "lobby") {
        useShellStore.getState().setScene("lobby");
        useShellStore.getState().setParadigm("lobby");
        return;
      }
      import("./constants/apps").then(({ getApp }) => {
        const app = getApp(appId);
        if (app) useShellStore.getState().openWindow(app);
      });
      return;
    }
  }
}

/**
 * Root shell component.
 *
 * Layer stack (bottom → top):
 *   1. Babylon.js canvas  — full-screen WebGL/WebGPU (wallpaper / active scene)
 *   2. Desktop chrome     — Win11 taskbar, windows, start menu (paradigm = win11)
 *      OR  Babylon UI     — voice overlay, notifications only (other paradigms)
 *   3. Voice overlay      — always on top regardless of paradigm
 *   4. Notification tray  — top-right toasts
 */
/** Returns true if setup has already been completed (localStorage fast-path). */
function isSetupDone(): boolean {
  // In web/browser deployment (not Tauri), skip the setup wizard entirely.
  if (!("__TAURI_INTERNALS__" in window)) return true;
  try {
    return localStorage.getItem("limen:setup-complete") === "1";
  } catch {
    return false;
  }
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const voiceClientRef = useRef<VoiceClient | null>(null);
  const {
    activeScene,
    voiceActive,
    paradigm,
    showCanvas,
    setVoiceTranscript,
    setVoiceActive,
    setAiThinking,
    escalateFrustration,
    resetFrustration,
  } = useShellStore();
  const [sceneManager, setSceneManager] = useState<SceneManager | null>(null);

  // ── Mood system ─────────────────────────────────────────────────────────────
  useMoodClock();
  useMoodSync(sceneManager);
  useGlobalKeys();

  // ── First-run setup ──────────────────────────────────────────────────────────
  const [setupDone, setSetupDone] = useState<boolean>(isSetupDone);

  // Double-check via Tauri on mount (in case user cleared localStorage).
  useEffect(() => {
    if (setupDone) return;
    if (!("__TAURI_INTERNALS__" in window)) return;
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<boolean>("check_setup_complete"))
      .then((done) => {
        if (done) setSetupDone(true);
      })
      .catch(() => {
        /* invoke failed — stay on localStorage result */
      });
  }, [setupDone]);

  // Probe synapsd relay — set window.__LIMEN_RELAY__ so proxyUrl() picks it up.
  useEffect(() => {
    fetch("/health")
      .then(
        (r) =>
          r.ok &&
          ((window as unknown as Record<string, unknown>).__LIMEN_RELAY__ =
            true),
      )
      .catch(() => {});
  }, []);

  const handleSetupComplete = useCallback(() => setSetupDone(true), []);

  // ── Babylon.js init ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    const mgr = new SceneManager(canvasRef.current);
    void mgr.init().then(() => {
      if (!cancelled) setSceneManager(mgr);
    });
    return () => {
      cancelled = true;
      mgr.dispose();
    };
  }, []);

  // Sync active scene to Babylon.js
  useEffect(() => {
    sceneManager?.transitionTo(activeScene);
  }, [activeScene, sceneManager]);

  // ── Camera / presence ────────────────────────────────────────────────────────
  // Start the camera after the scene manager is ready so VideoTexture has a scene.
  useEffect(() => {
    if (!sceneManager) return;
    void cameraManager.start();
    return () => cameraManager.stop();
  }, [sceneManager]);

  // Network monitoring — start once on mount.
  useEffect(() => {
    networkManager.start();
    return () => networkManager.stop();
  }, []);

  // ── synapsd event bridge ────────────────────────────────────────────────────
  // Listens for events forwarded by the Rust ipc_client from synapsd.
  // These arrive when AgentFlow's OsAgent publishes os/* MQTT topics.
  useEffect(() => {
    let unlisten: (() => void)[] = [];
    // Only available inside Tauri — skip entirely in browser/web context.
    if (!("__TAURI_INTERNALS__" in window)) return;
    import("@tauri-apps/api/event")
      .then(({ listen }) => {
        const store = useShellStore.getState();

        const reg = <T,>(event: string, handler: (payload: T) => void) => {
          listen<T>(event, (e) => handler(e.payload)).then((fn) =>
            unlisten.push(fn),
          );
        };

        reg<string>("limen://scene", (name) => {
          store.setScene(name as import("./store/shell").SceneName);
        });

        reg<string>("limen://window/open", (appId) => {
          // Check if it's a shell-managed app first.
          const app =
            getApp(appId) ??
            DEFAULT_APPS.find(
              (a) => a.title.toLowerCase() === appId.toLowerCase(),
            );
          if (app && app.contentType !== "native") {
            store.openWindow(app);
            return;
          }
          // Native app or unknown id → hand off to the Tauri backend.
          import("@tauri-apps/api/core")
            .then(({ invoke }) => invoke("open_app", { appId }))
            .catch((e) => console.warn("[shell] open_app failed:", e));
        });

        reg<string>("limen://window/close", (appId) => {
          const win = store.windows.find(
            (w) => w.appId === appId || w.id === appId,
          );
          if (win) store.closeWindow(win.id);
        });

        reg<{ title: string; body: string }>(
          "limen://notify",
          ({ title, body }) => {
            store.addNotification?.({ title, body, kind: "info" });
          },
        );

        reg<string>("limen://paradigm_changed", (paradigm) => {
          store.setParadigm(paradigm as import("./store/shell").Paradigm);
        });

        reg<string>("limen://voice/transcript", (text) => {
          store.setVoiceTranscript(text);
        });

        // TTS — speak any text emitted by voice_command or tts_speak command.
        reg<string>("limen://tts/speak", (text) => {
          speakText(text);
        });

        // Search intent — open browser with the query.
        reg<{ query: string }>("limen://os/search", ({ query }) => {
          if (!query) return;
          const app = getApp("browser");
          if (app) {
            store.openWindow({
              ...app,
              contentUrl: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
            });
          }
        });

        // Network events from synapsd (originate from other clients or backend scans).
        reg<{
          online: boolean;
          connection_type: string;
          downlink_mbps: number;
          rtt_ms: number;
        }>(
          "limen://network/state",
          ({ online, connection_type, downlink_mbps, rtt_ms }) => {
            store.setNetworkState(
              online,
              connection_type,
              downlink_mbps,
              rtt_ms,
            );
          },
        );
      })
      .catch(() => {
        /* not in Tauri — silently ignore */
      });

    return () => {
      unlisten.forEach((fn) => fn());
    };
  }, []);

  // ── Voice pipeline ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!voiceActive) {
      voiceClientRef.current?.stop();
      voiceClientRef.current = null;
      return;
    }

    const client = new VoiceClient({
      wakeWord: import.meta.env.LIMEN_WAKE_WORD ?? "hey limen",
      lang: import.meta.env.LIMEN_VOICE_LANG ?? "en-US",

      onTranscript: ({
        text,
        isFinal,
        containsWakeWord,
      }: {
        text: string;
        isFinal: boolean;
        containsWakeWord?: boolean;
      }) => {
        setVoiceTranscript(text);
        if (containsWakeWord) {
          window.dispatchEvent(new CustomEvent("limen:wake"));
        }
        if (isFrustrated(text)) escalateFrustration();

        if (isFinal && isTransportCommand(text)) {
          handleTransportCommand(text);
          setVoiceActive(false);
          return;
        }
        if (!isFinal) return;

        setAiThinking(true);
        import("@tauri-apps/api/core")
          .then(({ invoke }) =>
            invoke<{ intent: string; action: string; response: string }>(
              "voice_command",
              { transcript: text },
            ),
          )
          .then((result) => {
            resetFrustration();
            useShellStore.getState().addNotification?.({
              title: "Limen",
              body: result.response,
              kind: "info",
            });
            speakText(result.response);
          })
          .catch(() => escalateFrustration())
          .finally(() => {
            setAiThinking(false);
            setTimeout(() => setVoiceActive(false), 2200);
          });
      },

      onError: (err) => {
        console.warn("[Voice]", err.message);
        escalateFrustration();
        setVoiceActive(false);
      },
    });

    voiceClientRef.current = client;
    void client.start();
    return () => {
      client.stop();
      voiceClientRef.current = null;
    };
  }, [
    voiceActive,
    setVoiceTranscript,
    escalateFrustration,
    setVoiceActive,
    setAiThinking,
    resetFrustration,
  ]);

  const isMobileView = paradigm === "mobile";
  // Desktop chrome is shown for all non-mobile paradigms
  const showDesktop = !isMobileView;

  return (
    <>
      {/* First-run setup wizard — outside .limen-shell so mood filters don't bleed in */}
      <AnimatePresence>
        {!setupDone && (
          <SetupWizard key="setup" onComplete={handleSetupComplete} />
        )}
      </AnimatePresence>

      <div className="limen-shell">
        {/* Layer 1: Babylon.js canvas — animated wallpaper (optional) */}
        <canvas
          ref={canvasRef}
          id="limen-canvas"
          className="fixed inset-0 w-full h-full"
          style={{ display: showCanvas ? "block" : "none" }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({ "touch-action": "none" } as any)}
        />
        {/* Dark background when canvas is hidden */}
        {!showCanvas && (
          <div
            className="fixed inset-0"
            style={{
              background: "linear-gradient(135deg, #0d1117 0%, #161b22 100%)",
            }}
          />
        )}

        {/* Layer 2a: Mobile companion (full-screen Flutter web) */}
        {isMobileView && <MobileCompanion />}

        {/* Layer 2b: Desktop chrome — always visible for non-mobile */}
        {showDesktop && <Desktop />}

        {/* Layer 3+: Voice overlay + notifications — always on top */}
        <div
          className="fixed inset-0 pointer-events-none select-none"
          style={{ zIndex: 20000, bottom: showDesktop ? 48 : 0 }}
        >
          <AnimatePresence>
            {voiceActive && <VoiceOverlay key="voice" />}
          </AnimatePresence>
          <NotificationTray />
        </div>
      </div>
    </>
  );
}
