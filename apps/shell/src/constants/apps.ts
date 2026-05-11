import type { AppDef } from "../store/shell";

// ── Runtime-configurable service URLs ────────────────────────────────────────
// Inject window.__LIMEN_SERVICES__ from nginx or a <script> tag to override
// the defaults without rebuilding (e.g. when services are on a different host).
//
// Example nginx snippet:
//   sub_filter '</head>' '<script>window.__LIMEN_SERVICES__={
//     ha:"http://homeassistant.local:8123",
//     code:"http://localhost:8080",
//     jupyter:"http://localhost:8888/?token=yourtoken"
//   }</script></head>';
//   sub_filter_once on;

type ServiceMap = {
  ha?: string;
  ha_local?: string;
  code?: string;
  zed?: string;
  studio?: string;
  sinergym?: string;
};
const SVC: ServiceMap =
  (typeof window !== "undefined"
    ? (window as unknown as { __LIMEN_SERVICES__?: ServiceMap })
        .__LIMEN_SERVICES__
    : undefined) ?? {};

// Absolute URLs so the frame proxy can strip X-Frame-Options headers.
// Override via window.__LIMEN_SERVICES__ (nginx injection) or VITE_*_URL env vars.
const env = import.meta.env as Record<string, string | undefined>;
export const HA_URL = SVC.ha ?? env["VITE_HA_URL"] ?? "/ha/";
export const HA_LOCAL_URL =
  SVC.ha_local ?? env["VITE_HA_LOCAL_URL"] ?? "/ha-local/";
// const CODE_URL = SVC.code ?? env["VITE_CODE_URL"] ?? "http://localhost:8080";
const ZED_URL = SVC.zed ?? env["VITE_ZED_URL"] ?? "http://localhost:8081";
// const STUDIO_URL = SVC.studio ?? env["VITE_STUDIO_URL"] ?? "/studio/";
// const SINERGYM_URL = SVC.sinergym ?? env["VITE_SINERGYM_URL"] ?? "http://localhost:8090/";
// const PORTAINER_URL = SVC.portainer ?? env["VITE_PORTAINER_URL"] ?? "http://localhost:9000";
// const GRAFANA_URL   = SVC.grafana   ?? env["VITE_GRAFANA_URL"]   ?? "http://localhost:3000";
// const NODERED_URL   = SVC.nodered   ?? env["VITE_NODERED_URL"]   ?? "http://localhost:1880";

export const DEFAULT_APPS: AppDef[] = [
  // ── Core / System ──────────────────────────────────────────────────────────
  {
    id: "home-assistant",
    title: "Home Assistant",
    icon: "ha-svg",
    contentType: "home-assistant",
    contentUrl: HA_URL,
    defaultWidth: 1280,
    defaultHeight: 820,
  },
  {
    id: "files",
    title: "Files",
    icon: "📁",
    contentType: "files",
    defaultWidth: 900,
    defaultHeight: 600,
  },
  {
    id: "browser",
    title: "Web Browser",
    icon: "🌐",
    contentType: "browser",
    contentUrl: "",
    defaultWidth: 1200,
    defaultHeight: 750,
  },
  {
    id: "terminal",
    title: "Terminal",
    icon: "⬛",
    contentType: "terminal",
    defaultWidth: 800,
    defaultHeight: 500,
  },
  {
    id: "limen-tui",
    title: "Limen TUI",
    icon: "🖥️",
    contentType: "iframe",
    contentUrl: "/tui/",
    defaultWidth: 1000,
    defaultHeight: 680,
  },
  {
    id: "settings",
    title: "Settings",
    icon: "⚙️",
    contentType: "settings",
    defaultWidth: 900,
    defaultHeight: 650,
  },
  {
    id: "ai-chat",
    title: "AI Chat",
    icon: "ai-chat-svg",
    contentType: "ai-chat",
    defaultWidth: 720,
    defaultHeight: 620,
  },
  // ── Developer tools ────────────────────────────────────────────────────────
  // { id: "code-server", title: "VS Code", icon: "code-server-svg", contentType: "browser", contentUrl: CODE_URL, defaultWidth: 1400, defaultHeight: 880 },
  {
    id: "zed",
    title: "Zed",
    icon: "zed-svg",
    contentType: "browser",
    contentUrl: ZED_URL,
    defaultWidth: 1400,
    defaultHeight: 880,
  },
  // { id: "portainer", title: "Portainer", icon: "portainer-svg", contentType: "browser", contentUrl: PORTAINER_URL, defaultWidth: 1300, defaultHeight: 860 },
  // { id: "grafana",   title: "Grafana",   icon: "grafana-svg",   contentType: "browser", contentUrl: GRAFANA_URL,   defaultWidth: 1300, defaultHeight: 820 },
  // { id: "nodered",   title: "Node-RED",  icon: "nodered-svg",   contentType: "browser", contentUrl: NODERED_URL,   defaultWidth: 1300, defaultHeight: 820 },
  // ── Waldiez apps ───────────────────────────────────────────────────────────
  {
    id: "waldiez",
    title: "Waldiez",
    icon: "waldiez-svg",
    contentType: "waldiez-native",
    defaultWidth: 1380,
    defaultHeight: 900,
  },
  // { id: "waldiez-studio", title: "Waldiez Studio", icon: "waldiez-studio-svg", contentType: "browser", contentUrl: STUDIO_URL, defaultWidth: 1300, defaultHeight: 860 },
  // { id: "sinergym", title: "Sinergym", icon: "sinergym-svg", contentType: "browser", contentUrl: SINERGYM_URL, defaultWidth: 1100, defaultHeight: 760 },
  // ── Productivity ───────────────────────────────────────────────────────────
  {
    id: "text-editor",
    title: "Text Editor",
    icon: "📝",
    contentType: "text-editor",
    defaultWidth: 800,
    defaultHeight: 600,
  },
  {
    id: "calculator",
    title: "Calculator",
    icon: "🧮",
    contentType: "calculator",
    defaultWidth: 340,
    defaultHeight: 520,
  },
  {
    id: "calendar",
    title: "Calendar",
    icon: "📅",
    contentType: "calendar",
    defaultWidth: 800,
    defaultHeight: 600,
  },
  {
    id: "mail",
    title: "Mail",
    icon: "📧",
    contentType: "mail",
    defaultWidth: 1100,
    defaultHeight: 720,
  },
  {
    id: "photos",
    title: "Photos",
    icon: "🖼️",
    contentType: "photos",
    defaultWidth: 1000,
    defaultHeight: 680,
  },
  {
    id: "music",
    title: "Music",
    icon: "🎵",
    contentType: "music",
    defaultWidth: 900,
    defaultHeight: 620,
  },
  {
    id: "maps",
    title: "Maps",
    icon: "🗺️",
    contentType: "maps",
    defaultWidth: 900,
    defaultHeight: 650,
  },
  // ── Games ──────────────────────────────────────────────────────────────────
  {
    id: "snake",
    title: "Snake",
    icon: "🐍",
    contentType: "snake",
    defaultWidth: 600,
    defaultHeight: 500,
  },
  {
    id: "minesweeper",
    title: "Minesweeper",
    icon: "💣",
    contentType: "minesweeper",
    defaultWidth: 400,
    defaultHeight: 500,
  },
  {
    id: "solitaire",
    title: "Solitaire",
    icon: "🃏",
    contentType: "solitaire",
    defaultWidth: 980,
    defaultHeight: 720,
  },
  {
    id: "pong",
    title: "Pong",
    icon: "🏓",
    contentType: "pong",
    defaultWidth: 640,
    defaultHeight: 520,
  },
  {
    id: "chess",
    title: "Chess",
    icon: "♟️",
    contentType: "chess",
    defaultWidth: 980,
    defaultHeight: 760,
  },
  {
    id: "bowling",
    title: "Bowling",
    icon: "🎳",
    contentType: "bowling",
    defaultWidth: 700,
    defaultHeight: 520,
  },
  {
    id: "bubble-shooter",
    title: "Bubble Shooter",
    icon: "🫧",
    contentType: "bubble-shooter",
    defaultWidth: 500,
    defaultHeight: 640,
  },
  {
    id: "pool",
    title: "Pool",
    icon: "🎱",
    contentType: "pool",
    defaultWidth: 760,
    defaultHeight: 540,
  },
  {
    id: "pacman",
    title: "Pac-Man",
    icon: "🟡",
    contentType: "pacman",
    defaultWidth: 560,
    defaultHeight: 600,
  },
  {
    id: "crossword",
    title: "Crossword",
    icon: "📝",
    contentType: "crossword",
    defaultWidth: 860,
    defaultHeight: 640,
  },
  {
    id: "hangman",
    title: "Hangman",
    icon: "🪢",
    contentType: "hangman",
    defaultWidth: 560,
    defaultHeight: 540,
  },
  // ── Onboarding & Docs ──────────────────────────────────────────────────────
  {
    id: "tutorial",
    title: "Get Started",
    icon: "✨",
    contentType: "tutorial",
    defaultWidth: 600,
    defaultHeight: 450,
  },
  {
    id: "docs",
    title: "Documentation",
    icon: "📚",
    contentType: "iframe",
    contentUrl: "/reader/",
    defaultWidth: 1000,
    defaultHeight: 700,
  },
  {
    id: "limen-mind",
    title: "Limen Mind",
    icon: "🧠",
    contentType: "limen-mind",
    defaultWidth: 860,
    defaultHeight: 600,
  },
  {
    id: "limen-fin",
    title: "Limen Fin",
    icon: "💰",
    contentType: "limen-fin",
    defaultWidth: 860,
    defaultHeight: 600,
  },
  // ── Ammelie ────────────────────────────────────────────────────────────────
  {
    id: "ammelie-reader",
    title: "Ammelie Reader",
    icon: "ammelie-svg",
    contentType: "ammelie",
    defaultWidth: 1100,
    defaultHeight: 740,
  },
  // ── Players ────────────────────────────────────────────────────────────────
  {
    id: "waldiez-player",
    title: "Waldiez Player",
    icon: "waldiez-player-svg",
    contentType: "iframe",
    contentUrl: "/player/",
    defaultWidth: 1280,
    defaultHeight: 820,
  },
  {
    id: "limen-player",
    title: "Limen Player",
    icon: "limen-player-svg",
    contentType: "limen-player",
    defaultWidth: 1200,
    defaultHeight: 780,
  },
  {
    id: "waldiez-reader",
    title: "HITL Reader",
    icon: "📖",
    contentType: "iframe",
    contentUrl: "/reader/",
    defaultWidth: 1000,
    defaultHeight: 720,
  },
  {
    id: "agents-comic",
    title: "AGENTS",
    icon: "agents-comic-svg",
    contentType: "iframe",
    contentUrl: "https://what-if.io/comic/",
    defaultWidth: 1280,
    defaultHeight: 820,
  },
];

/** App IDs pinned to the taskbar by default. */
export const DEFAULT_TASKBAR_PINNED = [
  "files",
  "browser",
  "terminal",
  "settings",
  "ai-chat",
  "agents-comic",
  "ammelie-reader",
  "waldiez-player",
  "limen-player",
  "bubble-shooter",
  "pool",
  "maps",
];

export function getApp(id: string): AppDef | undefined {
  return DEFAULT_APPS.find((a) => a.id === id);
}
