import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DeviceSize } from "../hooks/useDeviceSize";
import { wid } from "../utils/wid";
import { DEFAULT_TASKBAR_PINNED as DEFAULT_TASKBAR_PINNED_IDS } from "../constants/apps";

export type SceneName =
  | "home"
  | "greeter"
  | "launcher"
  | "ambient"
  | "voice"
  | "lobby";

/** Visual + interaction paradigm. */
export type Paradigm =
  | "win11"
  | "nebula"
  | "minimal"
  | "unix"
  | "dos"
  | "macos7"
  | "calm"
  | "lobby"
  | "mobile";

/**
 * TRANSPORT tier — which input method is currently primary.
 * The system degrades down this list on frustration / failure.
 */
export type TransportTier = "voice" | "gesture" | "touch" | "tui" | "keyboard";

/** Frustration level inferred from voice tone, face, and retry count. */
export type FrustrationLevel = "none" | "mild" | "medium" | "high";

export type WindowContentType =
  | "native"
  | "iframe"
  | "browser"
  | "terminal"
  | "settings"
  | "ai-chat"
  | "home-assistant"
  | "files"
  | "mail"
  | "calculator"
  | "text-editor"
  | "calendar"
  | "photos"
  | "music"
  | "maps"
  | "snake"
  | "minesweeper"
  | "solitaire"
  | "pong"
  | "chess"
  | "bowling"
  | "bubble-shooter"
  | "pool"
  | "pacman"
  | "crossword"
  | "hangman"
  | "tutorial"
  | "docs"
  | "waldiez-native"
  | "limen-player"
  | "ammelie"
  | "waldiez-reader"
  | "limen-mind"
  | "limen-fin";

export interface Notification {
  id: string;
  title: string;
  body: string;
  ts: number;
  kind: "info" | "warn" | "error" | "alert";
}

export interface WindowInstance {
  id: string;
  appId: string;
  title: string;
  icon: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
  contentType: WindowContentType;
  contentUrl?: string;
}

export interface AppDef {
  id: string;
  title: string;
  icon: string;
  contentType: WindowContentType;
  contentUrl?: string;
  defaultWidth?: number;
  defaultHeight?: number;
}

export interface ShellState {
  activeScene: SceneName;
  paradigm: Paradigm;
  transport: TransportTier;
  frustration: FrustrationLevel;
  voiceRetryCount: number;
  voiceActive: boolean;
  voiceTranscript: string;
  voiceListening: boolean;
  aiThinking: boolean;
  lastAiModel: string | null;
  cameraActive: boolean;
  presenceDetected: boolean;
  cameraDevices: import("../video/camera").CameraDevice[];
  activeCameraId: string;
  cameraMode: "ghost" | "mirror";

  // Network
  networkOnline: boolean;
  networkType: string; // "wifi" | "ethernet" | "cellular" | "unknown"
  networkDownlink: number; // Mbps, 0 if unknown
  networkRtt: number; // ms, 0 if unknown

  sessionUser: string | null;
  sessionLocked: boolean;
  notifications: Notification[];

  // Device size override (null = use auto-detected)
  deviceOverride: DeviceSize | null;

  // Whether the Babylon.js canvas (3D wallpaper) is visible
  showCanvas: boolean;

  // Window management
  windows: WindowInstance[];
  maxZIndex: number;

  // Pinned taskbar apps (persisted)
  pinnedApps: string[];

  // Onboarding
  hasSeenTutorial: boolean;

  // Session-only API config (never persisted — use .env on the server for persistence)
  ytApiKey: string;
  googleSearchApiKey: string;
  googleSearchCxId: string;
  tavilyApiKey: string;
  haUrl: string;
  haToken: string;
  setApiConfig: (
    cfg: Partial<{
      ytApiKey: string;
      googleSearchApiKey: string;
      googleSearchCxId: string;
      tavilyApiKey: string;
      haUrl: string;
      haToken: string;
    }>,
  ) => void;

  // Actions
  setScene: (scene: SceneName) => void;
  setParadigm: (p: Paradigm) => void;
  setDeviceOverride: (size: DeviceSize | null) => void;
  setShowCanvas: (show: boolean) => void;
  setTransport: (t: TransportTier) => void;
  escalateFrustration: () => void;
  resetFrustration: () => void;
  setVoiceActive: (active: boolean) => void;
  setVoiceTranscript: (text: string) => void;
  setAiThinking: (thinking: boolean) => void;
  setCameraActive: (active: boolean) => void;
  setPresenceDetected: (present: boolean) => void;
  setCameraDevices: (devices: import("../video/camera").CameraDevice[]) => void;
  setActiveCameraId: (id: string) => void;
  setCameraMode: (mode: "ghost" | "mirror") => void;
  setNetworkState: (
    online: boolean,
    type: string,
    downlink: number,
    rtt: number,
  ) => void;
  addNotification: (n: Omit<Notification, "id" | "ts">) => void;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;
  setSession: (user: string | null, locked?: boolean) => void;
  setHasSeenTutorial: (seen: boolean) => void;

  // Pin actions
  pinApp: (id: string) => void;
  unpinApp: (id: string) => void;

  // Window actions
  openWindow: (app: AppDef) => void;
  closeWindow: (id: string) => void;
  focusWindow: (id: string) => void;
  minimizeWindow: (id: string) => void;
  maximizeWindow: (id: string) => void;
  moveWindow: (id: string, x: number, y: number) => void;
  resizeWindow: (id: string, width: number, height: number) => void;
}

const FRUSTRATION_CASCADE: FrustrationLevel[] = [
  "none",
  "mild",
  "medium",
  "high",
];
const TRANSPORT_DEGRADATION: TransportTier[] = [
  "voice",
  "gesture",
  "touch",
  "tui",
  "keyboard",
];

export const useShellStore = create<ShellState>()(
  persist(
    immer((set) => ({
      activeScene: (import.meta.env.LIMEN_DEFAULT_SCENE as SceneName) ?? "home",
      paradigm: "win11",
      transport: "voice",
      frustration: "none",
      voiceRetryCount: 0,
      voiceActive: false,
      voiceTranscript: "",
      voiceListening: false,
      aiThinking: false,
      lastAiModel: null,
      cameraActive: false,
      presenceDetected: false,
      cameraDevices: [],
      activeCameraId: "default",
      cameraMode: "ghost",
      networkOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      networkType: "unknown",
      networkDownlink: 0,
      networkRtt: 0,
      sessionUser: null,
      sessionLocked: false,
      notifications: [],
      deviceOverride: null,
      showCanvas: true,
      windows: [],
      maxZIndex: 100,
      pinnedApps: [...DEFAULT_TASKBAR_PINNED_IDS],
      hasSeenTutorial: false,

      ytApiKey: "",
      googleSearchApiKey: "",
      googleSearchCxId: "",
      tavilyApiKey: "",
      haUrl:
        (typeof window !== "undefined"
          ? (window as unknown as { __LIMEN_SERVICES__?: { ha?: string } })
              .__LIMEN_SERVICES__?.ha
          : undefined) ?? "/ha/",
      haToken: "",
      setApiConfig: (cfg) =>
        set((s) => {
          Object.assign(s, cfg);
        }),

      setScene: (scene) =>
        set((s) => {
          s.activeScene = scene;
        }),
      setParadigm: (p) =>
        set((s) => {
          s.paradigm = p;
        }),
      setDeviceOverride: (size) =>
        set((s) => {
          s.deviceOverride = size;
        }),
      setShowCanvas: (show) =>
        set((s) => {
          s.showCanvas = show;
        }),
      setTransport: (t) =>
        set((s) => {
          s.transport = t;
        }),
      setHasSeenTutorial: (seen) =>
        set((s) => {
          s.hasSeenTutorial = seen;
        }),

      pinApp: (id) =>
        set((s) => {
          if (!s.pinnedApps.includes(id)) s.pinnedApps.push(id);
        }),
      unpinApp: (id) =>
        set((s) => {
          s.pinnedApps = s.pinnedApps.filter((p) => p !== id);
        }),

      escalateFrustration: () =>
        set((s) => {
          const idx = FRUSTRATION_CASCADE.indexOf(s.frustration);
          const next =
            FRUSTRATION_CASCADE[
              Math.min(idx + 1, FRUSTRATION_CASCADE.length - 1)
            ];
          s.frustration = next ?? s.frustration;
          s.voiceRetryCount += 1;
          if (s.frustration === "high") {
            const tIdx = TRANSPORT_DEGRADATION.indexOf(s.transport);
            const nextT =
              TRANSPORT_DEGRADATION[
                Math.min(tIdx + 1, TRANSPORT_DEGRADATION.length - 1)
              ];
            if (nextT) s.transport = nextT;
            s.notifications.unshift({
              id: wid(),
              ts: Date.now(),
              title: "Limen",
              body:
                nextT === "tui"
                  ? "I'll open the terminal for you."
                  : nextT === "keyboard"
                    ? "Keyboard and mouse are ready."
                    : "Let me try a different approach.",
              kind: "info",
            });
          }
        }),

      resetFrustration: () =>
        set((s) => {
          s.frustration = "none";
          s.voiceRetryCount = 0;
        }),

      setVoiceActive: (active) =>
        set((s) => {
          s.voiceActive = active;
          if (active) s.voiceTranscript = "";
        }),

      setVoiceTranscript: (text) =>
        set((s) => {
          s.voiceTranscript = text;
        }),
      setAiThinking: (thinking) =>
        set((s) => {
          s.aiThinking = thinking;
        }),
      setCameraActive: (active) =>
        set((s) => {
          s.cameraActive = active;
        }),
      setPresenceDetected: (present) =>
        set((s) => {
          s.presenceDetected = present;
        }),
      setCameraDevices: (devices) =>
        set((s) => {
          s.cameraDevices = devices;
        }),
      setActiveCameraId: (id) =>
        set((s) => {
          s.activeCameraId = id;
        }),
      setCameraMode: (mode) =>
        set((s) => {
          s.cameraMode = mode;
        }),
      setNetworkState: (online, type, downlink, rtt) =>
        set((s) => {
          s.networkOnline = online;
          s.networkType = type;
          s.networkDownlink = downlink;
          s.networkRtt = rtt;
        }),

      addNotification: (n) =>
        set((s) => {
          s.notifications.unshift({ ...n, id: wid(), ts: Date.now() });
          if (s.notifications.length > 50) s.notifications.length = 50;
        }),

      dismissNotification: (id) =>
        set((s) => {
          s.notifications = s.notifications.filter((n) => n.id !== id);
        }),

      clearNotifications: () =>
        set((s) => {
          s.notifications = [];
        }),

      setSession: (user, locked = false) =>
        set((s) => {
          s.sessionUser = user;
          s.sessionLocked = locked;
          s.activeScene = user && !locked ? "home" : "greeter";
        }),

      // ── Window management ────────────────────────────────────────────────────

      openWindow: (app) =>
        set((s) => {
          // Restore if already open but minimized, or focus if visible
          const existing = s.windows.find((w) => w.appId === app.id);
          if (existing) {
            s.maxZIndex += 1;
            existing.zIndex = s.maxZIndex;
            existing.minimized = false;
            return;
          }
          const w = app.defaultWidth ?? 900;
          const h = app.defaultHeight ?? 600;
          const sw = typeof window !== "undefined" ? window.innerWidth : 1920;
          const sh = typeof window !== "undefined" ? window.innerHeight : 1080;
          s.maxZIndex += 1;
          s.windows.push({
            id: wid(),
            appId: app.id,
            title: app.title,
            icon: app.icon,
            x: Math.max(0, (sw - w) / 2),
            y: Math.max(0, (sh - 48 - h) / 2),
            width: w,
            height: h,
            minimized: false,
            maximized: false,
            zIndex: s.maxZIndex,
            contentType: app.contentType,
            contentUrl: app.contentUrl || "",
          });
        }),

      closeWindow: (id) =>
        set((s) => {
          s.windows = s.windows.filter((w) => w.id !== id);
        }),

      focusWindow: (id) =>
        set((s) => {
          const win = s.windows.find((w) => w.id === id);
          if (win) {
            s.maxZIndex += 1;
            win.zIndex = s.maxZIndex;
            win.minimized = false;
          }
        }),

      minimizeWindow: (id) =>
        set((s) => {
          const win = s.windows.find((w) => w.id === id);
          if (win) win.minimized = true;
        }),

      maximizeWindow: (id) =>
        set((s) => {
          const win = s.windows.find((w) => w.id === id);
          if (win) win.maximized = !win.maximized;
        }),

      moveWindow: (id, x, y) =>
        set((s) => {
          const win = s.windows.find((w) => w.id === id);
          if (win) {
            win.x = x;
            win.y = y;
          }
        }),

      resizeWindow: (id, width, height) =>
        set((s) => {
          const win = s.windows.find((w) => w.id === id);
          if (win) {
            win.width = width;
            win.height = height;
          }
        }),
    })),
    {
      name: "limen-shell",
      version: 4,
      // UI preferences go to sessionStorage (per-tab, not cross-session persistent).
      // Keys and sensitive config are never stored here — they come from the backend.
      storage: createJSONStorage(() =>
        typeof sessionStorage !== "undefined" ? sessionStorage : localStorage,
      ),
      // Only persist light UI prefs — never API keys, tokens, or sensitive state.
      partialize: (s) => ({
        hasSeenTutorial: s.hasSeenTutorial,
        paradigm: s.paradigm,
        pinnedApps: s.pinnedApps,
        // sessionUser intentionally excluded — re-auth on new session
      }),
      migrate: (state, fromVersion) => {
        // Any version bump resets pinnedApps to the current defaults so new
        // taskbar entries take effect without the user manually clearing storage.
        if (fromVersion < 4) {
          return { ...(state as object), pinnedApps: [...DEFAULT_TASKBAR_PINNED_IDS] };
        }
        return state;
      },
    },
  ),
);
