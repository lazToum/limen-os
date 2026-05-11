/**
 * MoodEngine — Limen OS unified mood/experience layer.
 *
 * Everything that affects how the OS FEELS flows through here:
 *   time-of-day → presence → media → manual override → OsMood
 *
 * OsMood then drives: CSS vars, scene intensity, audio EQ, animation speed,
 * notification behaviour, clock prominence, and UI density.
 *
 * Priority chain (highest wins):
 *   manualOverride > ghostMode > flowDepth >= 20 > timeBand
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

// ── Public types ──────────────────────────────────────────────────────────────

export type MoodName =
  | "dawn" // 06-08 — soft, warm, slow start
  | "morning" // 08-12 — bright, energetic, full chrome
  | "focus" // manual / 20-min keyboard streak — cyan, minimal, café
  | "flow" // media playing + deep work — purple, immersive
  | "afternoon" // 12-17 — neutral, productive
  | "evening" // 17-21 — warm, relaxed
  | "rest" // 22-06 / idle 30 min — ambient scene, silent notifs
  | "alert" // high CPU / error / urgent — red, everything urgent
  | "celebration" // milestone / completion — gold, energetic
  | "presence" // camera: someone returned — bright, welcoming
  | "ghost"; // no presence 5+ min — dim, screensaver

export type TimeBand =
  | "night" // 22:00–05:59
  | "dawn" // 06:00–07:59
  | "morning" // 08:00–11:59
  | "afternoon" // 12:00–16:59
  | "evening" // 17:00–21:59
  | "late"; // (alias for night, used for 20:00–21:59 transition)

export type EQPreset = "flat" | "lute" | "vinyl" | "shaman" | "punk" | "violin";

export type AmbientSound =
  | "birds"
  | "rain"
  | "cafe"
  | "fireplace"
  | "forest"
  | "ocean";

export interface OsMood {
  name: MoodName;

  // ── Scene ────────────────────────────────────────────────────────────────
  scene: "home" | "ambient" | "launcher" | "greeter" | "voice";
  sceneIntensity: number; // 0–1: particle density, glow strength

  // ── Color ────────────────────────────────────────────────────────────────
  accent: string; // hex — primary interactive/glow color
  accentRgb: string; // "r, g, b" for rgba() in CSS
  warmth: number; // –1 (cool/blue) → +1 (warm/amber)
  saturation: number; // 0 (grey) → 2 (vibrant)

  // ── Audio ────────────────────────────────────────────────────────────────
  eqPreset: EQPreset;
  ambientSound?: AmbientSound;

  // ── Motion ───────────────────────────────────────────────────────────────
  animationSpeed: number; // 0.2 (meditative) → 1.0 (normal) → 1.5 (energetic)
  particleDensity: number; // 0–1

  // ── Behaviour ────────────────────────────────────────────────────────────
  notifStyle: "urgent" | "gentle" | "queued" | "silent";
  clockBehavior: "prominent" | "subtle" | "hidden";
  uiDensity: "full" | "reduced" | "minimal";
}

// ── Preset catalogue ──────────────────────────────────────────────────────────

function rgb(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

const PRESETS: Record<MoodName, OsMood> = {
  dawn: {
    name: "dawn",
    scene: "home",
    sceneIntensity: 0.35,
    accent: "#f59e0b",
    accentRgb: rgb("#f59e0b"),
    warmth: 0.65,
    saturation: 0.75,
    eqPreset: "lute",
    ambientSound: "birds",
    animationSpeed: 0.55,
    particleDensity: 0.25,
    notifStyle: "gentle",
    clockBehavior: "prominent",
    uiDensity: "full",
  },
  morning: {
    name: "morning",
    scene: "home",
    sceneIntensity: 0.75,
    accent: "#3b82f6",
    accentRgb: rgb("#3b82f6"),
    warmth: 0.1,
    saturation: 1.0,
    eqPreset: "flat",
    animationSpeed: 0.95,
    particleDensity: 0.65,
    notifStyle: "urgent",
    clockBehavior: "subtle",
    uiDensity: "full",
  },
  afternoon: {
    name: "afternoon",
    scene: "home",
    sceneIntensity: 0.65,
    accent: "#3b82f6",
    accentRgb: rgb("#3b82f6"),
    warmth: 0.0,
    saturation: 1.0,
    eqPreset: "flat",
    animationSpeed: 0.9,
    particleDensity: 0.55,
    notifStyle: "urgent",
    clockBehavior: "subtle",
    uiDensity: "full",
  },
  focus: {
    name: "focus",
    scene: "home",
    sceneIntensity: 0.45,
    accent: "#22d3ee",
    accentRgb: rgb("#22d3ee"),
    warmth: -0.15,
    saturation: 0.8,
    eqPreset: "flat",
    ambientSound: "cafe",
    animationSpeed: 0.65,
    particleDensity: 0.28,
    notifStyle: "queued",
    clockBehavior: "subtle",
    uiDensity: "reduced",
  },
  flow: {
    name: "flow",
    scene: "home",
    sceneIntensity: 0.85,
    accent: "#8b5cf6",
    accentRgb: rgb("#8b5cf6"),
    warmth: 0.05,
    saturation: 1.25,
    eqPreset: "vinyl",
    animationSpeed: 1.05,
    particleDensity: 0.85,
    notifStyle: "queued",
    clockBehavior: "hidden",
    uiDensity: "reduced",
  },
  evening: {
    name: "evening",
    scene: "home",
    sceneIntensity: 0.6,
    accent: "#f97316",
    accentRgb: rgb("#f97316"),
    warmth: 0.4,
    saturation: 0.9,
    eqPreset: "vinyl",
    ambientSound: "fireplace",
    animationSpeed: 0.75,
    particleDensity: 0.45,
    notifStyle: "gentle",
    clockBehavior: "subtle",
    uiDensity: "full",
  },
  rest: {
    name: "rest",
    scene: "ambient",
    sceneIntensity: 0.25,
    accent: "#6366f1",
    accentRgb: rgb("#6366f1"),
    warmth: 0.25,
    saturation: 0.5,
    eqPreset: "shaman",
    ambientSound: "rain",
    animationSpeed: 0.38,
    particleDensity: 0.18,
    notifStyle: "silent",
    clockBehavior: "prominent",
    uiDensity: "minimal",
  },
  alert: {
    name: "alert",
    scene: "home",
    sceneIntensity: 1.0,
    accent: "#ef4444",
    accentRgb: rgb("#ef4444"),
    warmth: -0.35,
    saturation: 1.6,
    eqPreset: "flat",
    animationSpeed: 1.35,
    particleDensity: 1.0,
    notifStyle: "urgent",
    clockBehavior: "prominent",
    uiDensity: "full",
  },
  celebration: {
    name: "celebration",
    scene: "home",
    sceneIntensity: 1.0,
    accent: "#fbbf24",
    accentRgb: rgb("#fbbf24"),
    warmth: 0.55,
    saturation: 1.85,
    eqPreset: "violin",
    animationSpeed: 1.5,
    particleDensity: 1.0,
    notifStyle: "gentle",
    clockBehavior: "subtle",
    uiDensity: "full",
  },
  presence: {
    name: "presence",
    scene: "home",
    sceneIntensity: 0.88,
    accent: "#10b981",
    accentRgb: rgb("#10b981"),
    warmth: 0.12,
    saturation: 1.05,
    eqPreset: "flat",
    animationSpeed: 1.0,
    particleDensity: 0.72,
    notifStyle: "gentle",
    clockBehavior: "subtle",
    uiDensity: "full",
  },
  ghost: {
    name: "ghost",
    scene: "ambient",
    sceneIntensity: 0.12,
    accent: "#475569",
    accentRgb: rgb("#475569"),
    warmth: 0.0,
    saturation: 0.15,
    eqPreset: "shaman",
    animationSpeed: 0.28,
    particleDensity: 0.08,
    notifStyle: "silent",
    clockBehavior: "hidden",
    uiDensity: "minimal",
  },
};

const TIME_BAND_MOODS: Record<TimeBand, MoodName> = {
  night: "rest",
  dawn: "dawn",
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
  late: "rest",
};

export function getTimeBand(hour: number): TimeBand {
  if (hour >= 6 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

// ── Store ─────────────────────────────────────────────────────────────────────

export interface MediaHint {
  playing: boolean;
  genre?: string; // "jazz" | "rock" | "classical" | "lo-fi" | ...
  bpm?: number;
  moodTag?: string; // "energetic" | "calm" | "dark" | "happy" ...
}

export interface MoodState {
  // Inputs
  timeBand: TimeBand;
  manualOverride: MoodName | null;
  ghostMode: boolean; // camera-driven: no presence N minutes
  flowDepth: number; // minutes of uninterrupted focused work
  mediaHint: MediaHint | null;

  // Computed (always in sync with inputs)
  activeMood: OsMood;

  // Actions
  setTimeBand: (band: TimeBand) => void;
  setManualMood: (name: MoodName | null) => void;
  setGhostMode: (ghost: boolean) => void;
  incrementFlowDepth: (minutes: number) => void;
  resetFlowDepth: () => void;
  setMediaHint: (hint: MediaHint | null) => void;

  /** Convenience: trigger celebration for N ms, then revert. */
  celebrate: (ms?: number) => void;
  /** Convenience: trigger alert for N ms, then revert. */
  triggerAlert: (ms?: number) => void;
}

function computeMood(
  timeBand: TimeBand,
  manualOverride: MoodName | null,
  ghostMode: boolean,
  flowDepth: number,
  mediaHint: MediaHint | null,
): OsMood {
  // 1. Manual always wins
  if (manualOverride) return PRESETS[manualOverride];

  // 2. Ghost (no presence)
  if (ghostMode) return PRESETS.ghost;

  // 3. Deep flow: 20+ min uninterrupted keyboard work
  if (flowDepth >= 20) return PRESETS.flow;

  // 4. Media-informed: playing + genre hints
  if (mediaHint?.playing) {
    const { genre, bpm } = mediaHint;
    if (genre === "lo-fi" || genre === "ambient") return PRESETS.focus;
    if (bpm && bpm > 120) return PRESETS.flow;
    if (genre === "jazz" || genre === "classical") return PRESETS.evening;
  }

  // 5. Time of day
  return PRESETS[TIME_BAND_MOODS[timeBand]];
}

export const useMoodStore = create<MoodState>()(
  persist(
    immer((set, get) => {
      const initial = computeMood("morning", null, false, 0, null);
      return {
        timeBand: "morning",
        manualOverride: null,
        ghostMode: false,
        flowDepth: 0,
        mediaHint: null,
        activeMood: initial,

        setTimeBand: (band) =>
          set((s) => {
            s.timeBand = band;
            s.activeMood = computeMood(
              band,
              s.manualOverride,
              s.ghostMode,
              s.flowDepth,
              s.mediaHint,
            );
          }),

        setManualMood: (name) =>
          set((s) => {
            s.manualOverride = name;
            s.activeMood = computeMood(
              s.timeBand,
              name,
              s.ghostMode,
              s.flowDepth,
              s.mediaHint,
            );
          }),

        setGhostMode: (ghost) =>
          set((s) => {
            s.ghostMode = ghost;
            s.activeMood = computeMood(
              s.timeBand,
              s.manualOverride,
              ghost,
              s.flowDepth,
              s.mediaHint,
            );
          }),

        incrementFlowDepth: (minutes) =>
          set((s) => {
            s.flowDepth = Math.min(s.flowDepth + minutes, 120);
            s.activeMood = computeMood(
              s.timeBand,
              s.manualOverride,
              s.ghostMode,
              s.flowDepth,
              s.mediaHint,
            );
          }),

        resetFlowDepth: () =>
          set((s) => {
            s.flowDepth = 0;
            s.activeMood = computeMood(
              s.timeBand,
              s.manualOverride,
              s.ghostMode,
              0,
              s.mediaHint,
            );
          }),

        setMediaHint: (hint) =>
          set((s) => {
            s.mediaHint = hint;
            s.activeMood = computeMood(
              s.timeBand,
              s.manualOverride,
              s.ghostMode,
              s.flowDepth,
              hint,
            );
          }),

        celebrate: (ms = 6000) => {
          set((s) => {
            s.manualOverride = "celebration";
            s.activeMood = PRESETS.celebration;
          });
          setTimeout(() => {
            const s = get();
            if (s.manualOverride === "celebration") s.setManualMood(null);
          }, ms);
        },

        triggerAlert: (ms = 8000) => {
          set((s) => {
            s.manualOverride = "alert";
            s.activeMood = PRESETS.alert;
          });
          setTimeout(() => {
            const s = get();
            if (s.manualOverride === "alert") s.setManualMood(null);
          }, ms);
        },
      };
    }),
    {
      name: "limen-mood",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        manualOverride: s.manualOverride,
        timeBand: s.timeBand,
      }),
    },
  ),
);

/** Preset catalogue — for UI mood pickers. */
export const MOOD_PRESETS = PRESETS;

/** All mood names for iteration. */
export const MOOD_NAMES = Object.keys(PRESETS) as MoodName[];
