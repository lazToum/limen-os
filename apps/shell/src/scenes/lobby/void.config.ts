import { Vector3, Color3 } from "@babylonjs/core";
import type { LobbyTheme } from "./themes/themes.config";

/**
 * Portal shape types - each represents a different kind of experience
 */
export type PortalShape =
  | "icosahedron"
  | "torus"
  | "octahedron"
  | "dodecahedron";

/**
 * Experience definition
 */
export interface Experience {
  id: string;
  name: string;
  description: string;
  portalShape: PortalShape;
  color: Color3;
  emissiveColor: Color3;
  position: Vector3;
  lobbyTheme?: LobbyTheme; // If set, opens themed lobby instead of direct script
  scriptPath?: string; // Direct script path (used if no lobbyTheme)
}

/**
 * Available experiences in the Void
 * Each portal leads to either a themed lobby or a direct experience
 */
export const experiences: Experience[] = [
  {
    id: "celestial",
    name: "Celestial Observatory",
    description:
      "Gaze into infinite possibilities. Data streams flow like starlight.",
    portalShape: "octahedron",
    color: new Color3(0.6, 0.5, 1.0), // Soft purple
    emissiveColor: new Color3(0.4, 0.35, 0.7),
    position: new Vector3(0, 2.5, 0), // Top center
    lobbyTheme: "celestial",
  },
  {
    id: "gallery",
    name: "Gallery Hall",
    description: "Where creativity finds its home. Curated beauty awaits.",
    portalShape: "dodecahedron",
    color: new Color3(0.85, 0.75, 0.55), // Warm gold
    emissiveColor: new Color3(0.6, 0.5, 0.35),
    position: new Vector3(-3, 0, 0), // Left
    lobbyTheme: "gallery",
  },
  {
    id: "islands",
    name: "Floating Islands",
    description: "Drift between worlds. Mystical adventures await.",
    portalShape: "icosahedron",
    color: new Color3(0.3, 0.9, 0.8), // Ethereal teal
    emissiveColor: new Color3(0.2, 0.6, 0.55),
    position: new Vector3(3, 0, 0), // Right
    lobbyTheme: "islands",
  },
  {
    id: "tree",
    name: "Tree of Experiences",
    description: "Knowledge grows from every branch. Wisdom awaits.",
    portalShape: "torus",
    color: new Color3(0.4, 0.9, 0.3), // Vibrant green
    emissiveColor: new Color3(0.25, 0.6, 0.2),
    position: new Vector3(0, -2, 0), // Bottom center
    lobbyTheme: "tree",
  },
];

/**
 * Void configuration
 */
export const voidConfig = {
  // Camera
  camera: {
    initialPosition: new Vector3(0, 0, -10),
    target: Vector3.Zero(),
    defaultRadius: 10,
    focusRadius: 4.5,
    speed: 0.3,
    inertia: 0.92,
  },

  // Grid
  grid: {
    size: 40,
    divisions: 40,
    majorColor: new Color3(0.08, 0.08, 0.12),
    minorColor: new Color3(0.04, 0.04, 0.06),
    yPosition: -4,
  },

  // Particles
  particles: {
    count: 150,
    size: { min: 0.015, max: 0.04 },
    speed: { min: 0.0005, max: 0.002 },
    spread: 20,
    color: new Color3(0.4, 0.4, 0.5),
  },

  // Portal animations
  portal: {
    rotationSpeed: 0.15,
    hoverScale: 1.35,
    pulseSpeed: 1.5,
    pulseAmount: 0.03,
    floatAmount: 0.08,
    floatSpeed: 0.4,
    dimmedAlpha: 0.25,
  },

  // Transitions
  transitions: {
    cameraFocusDuration: 600,
    cameraResetDuration: 500,
    portalDimDuration: 300,
  },

  // Hover behavior
  hover: {
    unhoverDelay: 250,
    hitboxScale: 1.8,
  },
};

/**
 * Hint messages for the Void
 */
export const voidHints = [
  {
    title: "The Void",
    text: "Each shape is a gateway to a unique world. <strong>Hover</strong> to preview.",
  },
  {
    title: "Navigation",
    text: "<strong>Drag</strong> to orbit. <strong>Scroll</strong> to zoom. <strong>Click</strong> to enter.",
  },
  {
    title: "Portals",
    text: "Purple leads to <strong>stars</strong>. Gold to <strong>galleries</strong>. Teal to <strong>islands</strong>. Green to <strong>wisdom</strong>.",
  },
];
