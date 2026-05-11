import { Color3, Color4 } from "@babylonjs/core";

/**
 * Themed Lobby Types
 */
export type LobbyTheme = "celestial" | "gallery" | "islands" | "tree";

/**
 * Child experience within a themed lobby
 */
export interface LobbyExperience {
  id: string;
  name: string;
  description: string;
  icon?: string;
  scriptPath: string;
}

/**
 * Themed Lobby Configuration
 */
export interface ThemedLobbyConfig {
  theme: LobbyTheme;
  name: string;
  tagline: string;
  description: string;

  // Colors & Mood
  backgroundColor: Color4;
  accentColor: Color3;
  secondaryColor: Color3;
  ambientColor: Color3;

  // Experiences within this lobby
  experiences: LobbyExperience[];
}

// ============================================================
// CELESTIAL OBSERVATORY 🌌
// Mood: Cosmic wonder, infinite possibility, serene vastness
// Colors: Deep space blues, purple nebulas, golden starlight
// ============================================================
export const celestialConfig: ThemedLobbyConfig = {
  theme: "celestial",
  name: "Celestial Observatory",
  tagline: "Gaze into infinite possibilities",
  description:
    "A cosmic sanctuary where data streams flow like starlight and insights orbit like celestial bodies.",

  backgroundColor: new Color4(0.02, 0.02, 0.06, 1), // Deep space
  accentColor: new Color3(0.6, 0.5, 1.0), // Soft purple
  secondaryColor: new Color3(1.0, 0.85, 0.4), // Golden starlight
  ambientColor: new Color3(0.15, 0.15, 0.3), // Cool blue ambient

  experiences: [
    {
      id: "sensor-dashboard",
      name: "Sensor Dashboard",
      description: "Real-time monitoring of all connected sensors",
      scriptPath: "./examples/placeholder-sensor-dashboard.tsx",
    },
    {
      id: "data-streams",
      name: "Data Streams",
      description: "Visualize live data flows and patterns",
      scriptPath: "./examples/placeholder-data-streams.tsx",
    },
    {
      id: "analytics",
      name: "Analytics Hub",
      description: "Deep insights and historical analysis",
      scriptPath: "./examples/placeholder-analytics.tsx",
    },
    {
      id: "alerts",
      name: "Alert Center",
      description: "Monitor and manage system alerts",
      scriptPath: "./examples/placeholder-alerts.tsx",
    },
  ],
};

// ============================================================
// GALLERY HALL 🏛️
// Mood: Refined elegance, curated beauty, artistic sophistication
// Colors: Warm marble whites, gold accents, soft rose highlights
// ============================================================
export const galleryConfig: ThemedLobbyConfig = {
  theme: "gallery",
  name: "Gallery Hall",
  tagline: "Where creativity finds its home",
  description:
    "An elegant atrium showcasing your creative works, each piece illuminated with care.",

  backgroundColor: new Color4(0.12, 0.11, 0.1, 1), // Warm dark
  accentColor: new Color3(0.85, 0.75, 0.55), // Warm gold
  secondaryColor: new Color3(0.95, 0.85, 0.85), // Soft rose marble
  ambientColor: new Color3(0.25, 0.22, 0.2), // Warm ambient

  experiences: [
    {
      id: "video-editor",
      name: "Video Studio",
      description: "Edit and compose video narratives",
      scriptPath: "./examples/placeholder-video-editor.tsx",
    },
    {
      id: "image-gallery",
      name: "Image Gallery",
      description: "Curate and present visual collections",
      scriptPath: "./examples/placeholder-image-gallery.tsx",
    },
    {
      id: "audio-mixer",
      name: "Audio Mixer",
      description: "Craft soundscapes and audio compositions",
      scriptPath: "./examples/placeholder-audio-mixer.tsx",
    },
    {
      id: "templates",
      name: "Templates",
      description: "Start from beautifully designed templates",
      scriptPath: "./examples/placeholder-templates.tsx",
    },
  ],
};

// ============================================================
// FLOATING ISLANDS 🏝️
// Mood: Mystical adventure, dreamlike wonder, peaceful exploration
// Colors: Ethereal teals, misty purples, aurora greens
// ============================================================
export const islandsConfig: ThemedLobbyConfig = {
  theme: "islands",
  name: "Floating Islands",
  tagline: "Drift between worlds",
  description:
    "Mystical islands suspended in an endless sky, each holding unique adventures.",

  backgroundColor: new Color4(0.05, 0.08, 0.12, 1), // Misty dark blue
  accentColor: new Color3(0.3, 0.9, 0.8), // Ethereal teal
  secondaryColor: new Color3(0.7, 0.5, 0.9), // Misty purple
  ambientColor: new Color3(0.1, 0.2, 0.25), // Cool misty

  experiences: [
    {
      id: "story-builder",
      name: "Story Builder",
      description: "Craft interactive narrative experiences",
      scriptPath: "./examples/placeholder-story-builder.tsx",
    },
    {
      id: "world-editor",
      name: "World Editor",
      description: "Design immersive 3D environments",
      scriptPath: "./examples/placeholder-world-editor.tsx",
    },
    {
      id: "character-creator",
      name: "Character Creator",
      description: "Bring characters to life",
      scriptPath: "./examples/placeholder-character-creator.tsx",
    },
    {
      id: "quest-designer",
      name: "Quest Designer",
      description: "Design adventures and challenges",
      scriptPath: "./examples/placeholder-quest-designer.tsx",
    },
  ],
};

// ============================================================
// TREE OF EXPERIENCES 🌳
// Mood: Organic growth, natural wisdom, living knowledge
// Colors: Deep forest greens, warm amber, bioluminescent blues
// ============================================================
export const treeConfig: ThemedLobbyConfig = {
  theme: "tree",
  name: "Tree of Experiences",
  tagline: "Knowledge grows from every branch",
  description:
    "An ancient tree of wisdom, its branches reaching into realms of learning and discovery.",

  backgroundColor: new Color4(0.03, 0.05, 0.03, 1), // Deep forest
  accentColor: new Color3(0.4, 0.9, 0.3), // Vibrant leaf green
  secondaryColor: new Color3(1.0, 0.7, 0.3), // Warm amber
  ambientColor: new Color3(0.1, 0.15, 0.1), // Forest ambient

  experiences: [
    {
      id: "tutorials",
      name: "Tutorials",
      description: "Learn at your own pace",
      scriptPath: "./examples/placeholder-tutorials.tsx",
    },
    {
      id: "documentation",
      name: "Documentation",
      description: "Comprehensive guides and references",
      scriptPath: "./examples/placeholder-documentation.tsx",
    },
    {
      id: "examples",
      name: "Examples",
      description: "Learn from working examples",
      scriptPath: "./examples/placeholder-examples.tsx",
    },
    {
      id: "community",
      name: "Community",
      description: "Connect with other creators",
      scriptPath: "./examples/placeholder-community.tsx",
    },
  ],
};

/**
 * Get config by theme
 */
export const getThemedLobbyConfig = (theme: LobbyTheme): ThemedLobbyConfig => {
  switch (theme) {
    case "celestial":
      return celestialConfig;
    case "gallery":
      return galleryConfig;
    case "islands":
      return islandsConfig;
    case "tree":
      return treeConfig;
  }
};

/**
 * Scene-specific configurations
 */
export const themedLobbySceneConfig = {
  celestial: {
    platformRadius: 3,
    orbitRadius: 8,
    orbitSpeed: 0.0003,
    starCount: 500,
    nebulaCount: 3,
  },
  gallery: {
    hallLength: 30,
    hallWidth: 8,
    hallHeight: 6,
    archSpacing: 6,
    walkSpeed: 0.1,
  },
  islands: {
    islandCount: 4,
    islandRadius: 2,
    floatAmplitude: 0.3,
    floatSpeed: 0.5,
    bridgeWidth: 0.5,
    fogDensity: 0.02,
  },
  tree: {
    trunkHeight: 8,
    trunkRadius: 1.5,
    branchCount: 4,
    branchLength: 6,
    leafParticles: 100,
    fireflyCount: 50,
  },
};
