/**
 * Ammelie — Universal File Loader for Limen OS
 * Warm celluloid aesthetic. Drop zone → detect → view.
 * Self-contained: no imports from other shell files, no external deps beyond React.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  film: "#0A0806",
  deep: "#130F09",
  surface: "#1C1510",
  surface2: "#26201A",
  surface3: "#332A20",
  amber: "#C8873A",
  amberLt: "#E0A555",
  amberDk: "#8A5A20",
  gold: "#D4A040",
  cream: "#E8D5B0",
  creamDk: "#BFA882",
  muted: "#6B5533",
  mutedLt: "#8A7050",
  border: "#2E2318",
  borderLt: "#4A3828",
  parchment: "#1A1208",
} as const;
type Palette = Record<keyof typeof C, string>;

// ── Themes ────────────────────────────────────────────────────────────────────

type AmmThemeId = "amber" | "void" | "lotus";

const THEME_PALETTES: Record<AmmThemeId, Palette> = {
  amber: C,
  void: {
    film: "#020507",
    deep: "#040b12",
    surface: "#081220",
    surface2: "#0c1a2e",
    surface3: "#102438",
    amber: "#38bdf8",
    amberLt: "#7dd3fc",
    amberDk: "#0ea5e9",
    gold: "#67e8f9",
    cream: "#cbd5e1",
    creamDk: "#94a3b8",
    muted: "#334155",
    mutedLt: "#475569",
    border: "#0f2030",
    borderLt: "#1e3a4e",
    parchment: "#020b14",
  },
  lotus: {
    film: "#08020c",
    deep: "#100518",
    surface: "#1a0a28",
    surface2: "#25103a",
    surface3: "#32174d",
    amber: "#e879f9",
    amberLt: "#f0abfc",
    amberDk: "#a21caf",
    gold: "#c084fc",
    cream: "#f3e8ff",
    creamDk: "#d8b4fe",
    muted: "#6b21a8",
    mutedLt: "#7e22ce",
    border: "#2d0a4a",
    borderLt: "#4a1170",
    parchment: "#060010",
  },
};

const THEME_LABELS: Record<AmmThemeId, string> = {
  amber: "Celluloid",
  void: "Void",
  lotus: "Lotus",
};

// ── Theme context ─────────────────────────────────────────────────────────────

interface AmmThemeCtxValue {
  theme: AmmThemeId;
  setTheme: (t: AmmThemeId) => void;
  P: Palette; // active palette
  focusMode: boolean;
  setFocusMode: (v: boolean) => void;
}

const AmmThemeCtx = React.createContext<AmmThemeCtxValue>({
  theme: "amber",
  setTheme: () => {},
  P: C,
  focusMode: false,
  setFocusMode: () => {},
});

function useAmmTheme() {
  return React.useContext(AmmThemeCtx);
}

const FONT_DISPLAY = '"Cormorant Garamond", Georgia, serif';
const FONT_BODY = '"Spectral", Georgia, serif';
const FONT_MONO = '"Courier Prime", "Courier New", monospace';

// ── Static style injection (once) ─────────────────────────────────────────────
const STYLE_ID = "ammelie-styles";
const AMMELIE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Spectral:ital,wght@0,300;0,400;1,300&family=Courier+Prime&display=swap');

.amm-root { box-sizing: border-box; }
.amm-root *, .amm-root *::before, .amm-root *::after { box-sizing: border-box; }

.amm-root ::-webkit-scrollbar        { width: 5px; height: 5px; }
.amm-root ::-webkit-scrollbar-track  { background: var(--amm-deep); }
.amm-root ::-webkit-scrollbar-thumb  { background: var(--amm-amberDk); border-radius: 3px; }
.amm-root ::-webkit-scrollbar-thumb:hover { background: var(--amm-amber); }

@keyframes amm-grain-shift {
    0%   { background-position: 0 0; }
    14%  { background-position: -22px -18px; }
    28%  { background-position: 17px -9px; }
    42%  { background-position: -11px 24px; }
    57%  { background-position: 28px 7px; }
    71%  { background-position: -5px -27px; }
    85%  { background-position: 14px 19px; }
    100% { background-position: 0 0; }
}

@keyframes amm-fade-up {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
}

.amm-fade-up { animation: amm-fade-up 0.45s cubic-bezier(0.25,0.46,0.45,0.94) both; }

@keyframes amm-glow-pulse {
    0%,100% { box-shadow: 0 0 0 1.5px var(--amm-amber-66), 0 0 24px var(--amm-amber-22); }
    50%      { box-shadow: 0 0 0 2px   var(--amm-amber-99), 0 0 40px var(--amm-amber-44); }
}
.amm-drop-active { animation: amm-glow-pulse 1.4s ease-in-out infinite !important; }

.amm-range {
    -webkit-appearance: none;
    appearance: none;
    outline: none;
    height: 3px;
    border-radius: 2px;
    cursor: pointer;
}
.amm-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 13px; height: 13px;
    border-radius: 50%;
    background: var(--amm-amber);
    cursor: pointer;
    margin-top: -5px;
    box-shadow: 0 0 6px var(--amm-amber-99);
    transition: transform 0.1s;
}
.amm-range::-webkit-slider-thumb:hover { transform: scale(1.3); }
.amm-range::-moz-range-thumb {
    width: 13px; height: 13px;
    border-radius: 50%;
    background: var(--amm-amber);
    border: none;
    cursor: pointer;
    box-shadow: 0 0 6px var(--amm-amber-99);
}

.amm-btn {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 5px 12px;
    font-family: ${FONT_DISPLAY};
    font-size: 0.78rem; letter-spacing: 0.09em; text-transform: uppercase;
    border-radius: 2px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.16s cubic-bezier(0.25,0.46,0.45,0.94);
    user-select: none;
}
.amm-btn:disabled { opacity: 0.35; pointer-events: none; }
.amm-btn-amber {
    background: var(--amm-amber); color: var(--amm-film); border-color: var(--amm-amberLt);
}
.amm-btn-amber:hover { background: var(--amm-amberLt); }
.amm-btn-ghost {
    background: transparent; color: var(--amm-creamDk); border-color: var(--amm-borderLt);
}
.amm-btn-ghost:hover { border-color: var(--amm-amberDk); color: var(--amm-amberLt); }

.amm-video-controls {
    position: absolute; bottom: 0; left: 0; right: 0;
    padding: 10px 16px;
    background: linear-gradient(transparent, var(--amm-film));
    transition: opacity 0.25s;
    display: flex; flex-direction: column; gap: 6px;
}

.amm-node-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--amm-border);
    transition: background 0.14s;
}
.amm-node-item:hover { background: var(--amm-surface2); }

.amm-wid-field {
    display: flex; gap: 8px; padding: 4px 0;
    border-bottom: 1px solid var(--amm-border-22);
}

.amm-reader-md { color: var(--amm-cream); }
.amm-reader-md h1 {
    font-family: ${FONT_DISPLAY};
    font-size: 2rem;
    font-style: italic;
    font-weight: 400;
    color: var(--amm-amberLt);
    margin: 0 0 1.2rem;
    border-bottom: 1px solid var(--amm-amberDk);
    padding-bottom: 0.45rem;
}
.amm-reader-md h2 {
    font-family: ${FONT_DISPLAY};
    font-size: 1.45rem;
    font-weight: 400;
    color: var(--amm-gold);
    margin: 1.8rem 0 0.8rem;
}
.amm-reader-md h3, .amm-reader-md h4 {
    font-family: ${FONT_DISPLAY};
    color: var(--amm-cream);
    margin: 1.3rem 0 0.55rem;
}
.amm-reader-md p { margin: 0.8rem 0; }
.amm-reader-md strong { color: var(--amm-amberLt); }
.amm-reader-md em { color: var(--amm-creamDk); }
.amm-reader-md code {
    font-family: ${FONT_MONO};
    font-size: 0.9em;
    color: var(--amm-gold);
    background: var(--amm-surface);
    border: 1px solid var(--amm-borderLt);
    border-radius: 4px;
    padding: 0.08em 0.36em;
}
.amm-reader-md pre {
    overflow-x: auto;
    padding: 0.95rem 1.1rem;
    border-radius: 8px;
    background: var(--amm-surface);
    border: 1px solid var(--amm-borderLt);
    border-left: 3px solid var(--amm-amberDk);
    margin: 1rem 0 1.2rem;
}
.amm-reader-md pre code {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--amm-cream);
}
.amm-reader-md blockquote {
    margin: 1rem 0;
    padding: 0.75rem 1rem;
    border-left: 3px solid var(--amm-amber);
    background: var(--amm-surface);
    color: var(--amm-creamDk);
}
.amm-reader-md ul, .amm-reader-md ol { padding-left: 1.4rem; }
.amm-reader-md li { margin: 0.28rem 0; }
.amm-reader-md hr { border: 0; border-top: 1px solid var(--amm-borderLt); margin: 1.8rem 0; }
.amm-reader-md table { width: 100%; border-collapse: collapse; margin: 1rem 0 1.4rem; }
.amm-reader-md th, .amm-reader-md td {
    border: 1px solid var(--amm-borderLt);
    padding: 0.55rem 0.7rem;
    text-align: left;
}
.amm-reader-md th {
    color: var(--amm-amberLt);
    background: var(--amm-surface);
    font-family: ${FONT_DISPLAY};
    letter-spacing: 0.04em;
}
`;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = AMMELIE_CSS;
  document.head.appendChild(el);
}

// ── Types ──────────────────────────────────────────────────────────────────────
type AppScreen = "drop" | "loading" | "view";

type FileKind =
  | "waldiez-flow"
  | "waldiez-ammelie"
  | "wid"
  | "audio"
  | "video"
  | "image"
  | "reader"
  | "unknown";

interface LoadedFile {
  file: File;
  kind: FileKind;
  objectUrl: string;
  textContent?: string;
  jsonData?: unknown;
}

type ReaderMode = "source" | "rendered";
type WorkspaceMode = "reader" | "player" | "studio" | "editor";

interface ReaderHeading {
  level: 1 | 2 | 3 | 4;
  title: string;
  id: string;
}

interface WorkspaceMeta {
  id: WorkspaceMode;
  label: string;
  blurb: string;
}

interface DocumentCue {
  id: string;
  label: string;
  detail: string;
}

interface DocumentSummary {
  title: string;
  subtitle: string;
  scenes: DocumentCue[];
  assets: DocumentCue[];
  structure: DocumentCue[];
}

interface StructuredDraft {
  title: string;
  subtitle: string;
  scenes: DocumentCue[];
}

const WORKSPACE_META: Record<WorkspaceMode, WorkspaceMeta> = {
  reader: {
    id: "reader",
    label: "Reader",
    blurb:
      "Reading-first parchment view for notes, tours, scripts, and calm document flow.",
  },
  player: {
    id: "player",
    label: "Player",
    blurb:
      "Playback-oriented stage for audio, video, timed scenes, and ambient transport control.",
  },
  studio: {
    id: "studio",
    label: "Studio",
    blurb:
      "Arrangement workspace for scenes, assets, sequence notes, and lightweight production prep.",
  },
  editor: {
    id: "editor",
    label: "Editor",
    blurb:
      "Authoring surface for structural changes, export intent, and deeper project work.",
  },
};

function workspaceModesFor(kind: FileKind): WorkspaceMode[] {
  switch (kind) {
    case "audio":
    case "video":
    case "image":
      return ["player", "studio"];
    case "wid":
    case "waldiez-flow":
    case "waldiez-ammelie":
      return ["reader", "player", "studio", "editor"];
    case "reader":
      return ["reader", "studio", "editor"];
    default:
      return ["reader"];
  }
}

function defaultWorkspaceFor(kind: FileKind): WorkspaceMode {
  switch (kind) {
    case "audio":
    case "video":
    case "image":
      return "player";
    case "wid":
      return "player";
    case "waldiez-flow":
    case "waldiez-ammelie":
      return "studio";
    default:
      return "reader";
  }
}

function safeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function summarizeLoadedDocument(loaded: LoadedFile): DocumentSummary {
  const title = loaded.file.name.replace(/\.[^.]+$/, "");
  const text = loaded.textContent ?? "";
  const json = loaded.jsonData as Record<string, unknown> | null;
  const headings = text ? extractReaderHeadings(text).slice(0, 8) : [];
  const summaryScenes: DocumentCue[] = [];
  const summaryAssets: DocumentCue[] = [];
  const summaryStructure: DocumentCue[] = [];

  if (Array.isArray((json as { scenes?: unknown[] } | null)?.scenes)) {
    ((json as { scenes?: unknown[] }).scenes ?? [])
      .slice(0, 8)
      .forEach((scene, index) => {
        const item = scene as Record<string, unknown>;
        summaryScenes.push({
          id: safeString(item.id) || `scene-${index + 1}`,
          label:
            safeString(item.title) ||
            safeString(item.name) ||
            `Scene ${index + 1}`,
          detail:
            safeString(item.text) ||
            safeString(item.captionText) ||
            safeString(item.mediaKind) ||
            "Scene entry",
        });
      });
  }

  if (loaded.kind === "waldiez-flow") {
    const flow = json as FlowData | null;
    (flow?.nodes ?? []).slice(0, 8).forEach((node, index) => {
      summaryScenes.push({
        id: node.id ?? `node-${index + 1}`,
        label: node.name ?? node.label ?? `Node ${index + 1}`,
        detail: node.agent_type ?? node.type ?? "flow node",
      });
    });
    summaryStructure.push({
      id: "edges",
      label: "Edges",
      detail: `${flow?.edges?.length ?? 0} links`,
    });
  }

  if (loaded.kind === "wid") {
    const widJson = loaded.jsonData;
    if (Array.isArray(widJson)) {
      (widJson as WIDEvent[]).slice(0, 8).forEach((event, index) => {
        summaryScenes.push({
          id: safeString(event.id) || `event-${index + 1}`,
          label: safeString(event.id) || `Event ${index + 1}`,
          detail:
            Object.keys(event)
              .filter((key) => key !== "id")
              .slice(0, 3)
              .join(", ") || "wid event",
        });
      });
    } else if (widJson && typeof widJson === "object") {
      Object.entries(widJson as Record<string, unknown>)
        .slice(0, 8)
        .forEach(([key, value], index) => {
          summaryStructure.push({
            id: `${key}-${index}`,
            label: key,
            detail: String(value),
          });
        });
    }
  }

  headings.forEach((heading, index) => {
    summaryStructure.push({
      id: heading.id,
      label: heading.title,
      detail: `Heading level ${heading.level}`,
    });
    if (index < 4) {
      summaryScenes.push({
        id: heading.id,
        label: heading.title,
        detail: `Section ${index + 1}`,
      });
    }
  });

  if (json && typeof json === "object") {
    Object.entries(json)
      .slice(0, 8)
      .forEach(([key, value], index) => {
        if (key === "nodes" || key === "edges" || key === "scenes") return;
        summaryAssets.push({
          id: `${key}-${index}`,
          label: key,
          detail: Array.isArray(value)
            ? `${value.length} items`
            : typeof value === "object"
              ? "object"
              : String(value),
        });
      });
  }

  if (summaryStructure.length === 0) {
    summaryStructure.push({
      id: "format",
      label: KIND_LABELS[loaded.kind],
      detail: `${Math.max(1, Math.round(loaded.file.size / 1024))} KB`,
    });
  }

  if (summaryScenes.length === 0 && text) {
    splitPages(text, 420)
      .slice(0, 6)
      .forEach((page, index) => {
        summaryScenes.push({
          id: `page-${index + 1}`,
          label: `Passage ${index + 1}`,
          detail: page.slice(0, 92).replace(/\s+/g, " "),
        });
      });
  }

  return {
    title,
    subtitle:
      safeString((json as { description?: unknown } | null)?.description) ||
      KIND_LABELS[loaded.kind],
    scenes: summaryScenes.slice(0, 8),
    assets: summaryAssets.slice(0, 8),
    structure: summaryStructure.slice(0, 8),
  };
}

// ── File detection ─────────────────────────────────────────────────────────────
async function detectFileKind(
  file: File,
): Promise<{ kind: FileKind; textContent?: string; jsonData?: unknown }> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = file.type ?? "";

  if (ext === "waldiez") {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as Record<string, unknown>;
      const kind: FileKind =
        json.type === "flow" ? "waldiez-flow" : "waldiez-ammelie";
      return { kind, textContent: text, jsonData: json };
    } catch {
      return { kind: "waldiez-ammelie" };
    }
  }

  if (ext === "wid") {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as unknown;
      return { kind: "wid", textContent: text, jsonData: json };
    } catch {
      const text = await file.text();
      return { kind: "wid", textContent: text };
    }
  }

  if (mime.startsWith("audio/")) return { kind: "audio" };
  if (mime.startsWith("video/")) return { kind: "video" };
  if (mime.startsWith("image/")) return { kind: "image" };

  if (mime.startsWith("text/") || ["md", "txt", "rst", "org"].includes(ext)) {
    const text = await file.text();
    return { kind: "reader", textContent: text };
  }

  return { kind: "unknown" };
}

// ── Film grain canvas ──────────────────────────────────────────────────────────
function FilmGrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const SIZE = 256;
    canvas.width = SIZE;
    canvas.height = SIZE;

    const draw = () => {
      const img = ctx.createImageData(SIZE, SIZE);
      const data = img.data;
      for (let i = 0; i < data.length; i += 4) {
        const v = 155 + Math.random() * 30; // ≈ 155–185, slightly warm
        data[i] = v;
        data[i + 1] = v - 8;
        data[i + 2] = v - 16;
        data[i + 3] = Math.random() * 22; // alpha ≈ 0–22 → avg ~0.04 opacity layer
      }
      ctx.putImageData(img, 0, 0);
    };

    draw();
    timerRef.current = setInterval(draw, 150);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        backgroundSize: "256px 256px",
        imageRendering: "pixelated",
        opacity: 0.55,
        mixBlendMode: "screen",
        zIndex: 9,
      }}
    />
  );
}

// ── Sprocket strip (vertical) ──────────────────────────────────────────────────
function SprocketStrip({ count = 8 }: { count?: number }) {
  const { P, focusMode } = useAmmTheme();
  if (focusMode) return null;
  return (
    <div
      aria-hidden
      style={{
        width: 20,
        flexShrink: 0,
        background: P.deep,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-evenly",
        paddingTop: 12,
        paddingBottom: 12,
        borderRight: `1px solid ${P.border}`,
        transition: "background 0.4s, border-color 0.4s",
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          style={{
            width: 10,
            height: 7,
            borderRadius: 2,
            background: P.film,
            border: `1px solid ${P.borderLt}`,
            boxShadow: "inset 0 1px 2px rgba(0,0,0,0.85)",
          }}
        />
      ))}
    </div>
  );
}

// ── Frame corner decorations ───────────────────────────────────────────────────
function FrameCorner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const isTop = pos === "tl" || pos === "tr";
  const isLeft = pos === "tl" || pos === "bl";
  const size = 18;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        top: isTop ? 0 : undefined,
        bottom: !isTop ? 0 : undefined,
        left: isLeft ? 0 : undefined,
        right: !isLeft ? 0 : undefined,
        width: size,
        height: size,
        borderTop: isTop ? `2px solid var(--amm-amber)` : undefined,
        borderBottom: !isTop ? `2px solid var(--amm-amber)` : undefined,
        borderLeft: isLeft ? `2px solid var(--amm-amber)` : undefined,
        borderRight: !isLeft ? `2px solid var(--amm-amber)` : undefined,
        opacity: 0.7,
        pointerEvents: "none",
      }}
    />
  );
}

// ── KIND badge ─────────────────────────────────────────────────────────────────
const KIND_LABELS: Record<FileKind, string> = {
  "waldiez-flow": "waldiez flow",
  "waldiez-ammelie": "waldiez",
  wid: "wid",
  audio: "audio",
  video: "video",
  image: "image",
  reader: "text",
  unknown: "unknown",
};

function KindBadge({ kind }: { kind: FileKind }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        background: `var(--amm-amber-22)`,
        border: `1px solid var(--amm-amberDk)`,
        borderRadius: 2,
        fontSize: "0.7rem",
        fontFamily: FONT_DISPLAY,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--amm-amberLt)",
      }}
    >
      {KIND_LABELS[kind]}
    </span>
  );
}

// ── View header ────────────────────────────────────────────────────────────────
function ViewHeader({
  file,
  kind,
  onBack,
  workspace,
  workspaces,
  onWorkspaceChange,
}: {
  file: File;
  kind: FileKind;
  onBack: () => void;
  workspace: WorkspaceMode;
  workspaces: WorkspaceMode[];
  onWorkspaceChange: (mode: WorkspaceMode) => void;
}) {
  const { P, theme, setTheme, focusMode, setFocusMode } = useAmmTheme();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
        background: P.surface,
        borderBottom: `1px solid ${P.border}`,
        flexShrink: 0,
        flexWrap: "wrap",
        transition: "background 0.4s, border-color 0.4s",
      }}
    >
      <button
        onClick={onBack}
        className="amm-btn amm-btn-ghost"
        title="Back to drop"
        style={{ padding: "4px 8px", fontSize: "1rem" }}
      >
        ←
      </button>
      <span
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: "0.95rem",
          color: P.cream,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {file.name}
      </span>
      {/* Workspace tabs */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: 3,
          border: `1px solid ${P.borderLt}`,
          borderRadius: 999,
          background: `${P.deep}cc`,
        }}
      >
        {workspaces.map((mode) => {
          const active = workspace === mode;
          return (
            <button
              key={mode}
              className="amm-btn"
              onClick={() => onWorkspaceChange(mode)}
              style={{
                padding: "5px 12px",
                borderRadius: 999,
                background: active ? P.amber : "transparent",
                color: active ? P.film : P.creamDk,
                borderColor: "transparent",
              }}
            >
              {WORKSPACE_META[mode].label}
            </button>
          );
        })}
      </div>
      <KindBadge kind={kind} />
      {/* Focus mode toggle */}
      <button
        title={focusMode ? "Show frame" : "Focus mode"}
        onClick={() => setFocusMode(!focusMode)}
        style={{
          background: focusMode ? P.amber : "transparent",
          border: `1px solid ${focusMode ? P.amber : P.borderLt}`,
          color: focusMode ? P.film : P.creamDk,
          borderRadius: 6,
          padding: "4px 8px",
          fontSize: 11,
          cursor: "pointer",
          fontFamily: FONT_DISPLAY,
          transition: "all 0.2s",
        }}
      >
        {focusMode ? "⊞" : "⊟"}
      </button>
      {/* Theme switcher */}
      <div style={{ display: "flex", gap: 3 }}>
        {(["amber", "void", "lotus"] as AmmThemeId[]).map((t) => (
          <button
            key={t}
            title={THEME_LABELS[t]}
            onClick={() => setTheme(t)}
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: `2px solid ${theme === t ? THEME_PALETTES[t].amberLt : "transparent"}`,
              background: THEME_PALETTES[t].amber,
              cursor: "pointer",
              padding: 0,
              transition: "border-color 0.2s, transform 0.15s",
              transform: theme === t ? "scale(1.3)" : "scale(1)",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function AmmelieWorkspaceShell({
  loaded,
  workspace,
  onWorkspaceChange,
  children,
}: {
  loaded: LoadedFile;
  workspace: WorkspaceMode;
  onWorkspaceChange: (mode: WorkspaceMode) => void;
  children: React.ReactNode;
}) {
  const modes = workspaceModesFor(loaded.kind);
  const meta = WORKSPACE_META[workspace];
  const readerLength = loaded.textContent?.length ?? 0;
  const sceneCount = Array.isArray(
    (loaded.jsonData as { scenes?: unknown[] } | undefined)?.scenes,
  )
    ? ((loaded.jsonData as { scenes?: unknown[] }).scenes?.length ?? 0)
    : 0;
  const facts = [
    { label: "Format", value: KIND_LABELS[loaded.kind] },
    {
      label: "Size",
      value: `${Math.max(1, Math.round(loaded.file.size / 1024))} KB`,
    },
    { label: "Scenes", value: sceneCount > 0 ? String(sceneCount) : "—" },
    { label: "Text", value: readerLength > 0 ? `${readerLength} chars` : "—" },
  ];

  return (
    <div
      className="amm-fade-up"
      style={{
        display: "grid",
        gridTemplateColumns: "220px minmax(0, 1fr)",
        height: "100%",
        minHeight: 0,
        background: `linear-gradient(180deg, var(--amm-deep), var(--amm-film))`,
      }}
    >
      <aside
        style={{
          borderRight: `1px solid var(--amm-border)`,
          background: `linear-gradient(180deg, var(--amm-surface), var(--amm-deep))`,
          padding: "18px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          minHeight: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: "1.18rem",
              color: "var(--amm-amberLt)",
              fontStyle: "italic",
            }}
          >
            Ammelie
          </span>
          <span
            style={{
              fontSize: "0.74rem",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--amm-creamDk)",
            }}
          >
            {meta.label} Workspace
          </span>
          <span
            style={{
              fontSize: "0.8rem",
              lineHeight: 1.6,
              color: "var(--amm-creamDk)",
            }}
          >
            {meta.blurb}
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {modes.map((mode) => {
            const active = mode === workspace;
            return (
              <button
                key={mode}
                className={`amm-btn ${active ? "amm-btn-amber" : "amm-btn-ghost"}`}
                onClick={() => onWorkspaceChange(mode)}
                style={{
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "8px 10px",
                  textTransform: "none",
                  letterSpacing: "0.04em",
                  fontSize: "0.84rem",
                }}
              >
                <span>{WORKSPACE_META[mode].label}</span>
                <span style={{ opacity: active ? 1 : 0.45 }}>•</span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            borderTop: `1px solid var(--amm-border)`,
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              color: "var(--amm-gold)",
              letterSpacing: "0.08em",
              fontSize: "0.78rem",
            }}
          >
            Document Ledger
          </div>
          {facts.map((fact) => (
            <div
              key={fact.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                fontSize: "0.76rem",
                color: "var(--amm-creamDk)",
              }}
            >
              <span>{fact.label}</span>
              <span style={{ color: "var(--amm-amberLt)" }}>{fact.value}</span>
            </div>
          ))}
        </div>
      </aside>

      <div
        style={{
          display: "grid",
          gridTemplateRows: "1fr auto",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div style={{ minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          {children}
        </div>
        <div
          style={{
            borderTop: `1px solid var(--amm-border)`,
            background: `var(--amm-surface-dd)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: "8px 16px",
            color: "var(--amm-creamDk)",
            fontSize: "0.77rem",
          }}
        >
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              letterSpacing: "0.08em",
              color: "var(--amm-amberLt)",
            }}
          >
            {meta.label}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {workspace === "reader" && "Calm reading surface active."}
            {workspace === "player" &&
              "Playback workspace framing is ready for richer transport later."}
            {workspace === "studio" &&
              "Studio rail is ready for scenes, assets, and arrangement controls."}
            {workspace === "editor" &&
              "Editor rail is prepared as the future authoring home inside Ammelie."}
          </span>
          <span style={{ fontFamily: FONT_MONO, color: "var(--amm-muted)" }}>
            {loaded.file.name}
          </span>
        </div>
      </div>
    </div>
  );
}

function WorkspaceSection({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: `1px solid var(--amm-borderLt)`,
        background: `var(--amm-surface-d9)`,
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
        }}
      >
        <span
          style={{
            fontFamily: FONT_DISPLAY,
            color: "var(--amm-amberLt)",
            fontSize: "1rem",
            letterSpacing: "0.05em",
          }}
        >
          {title}
        </span>
        {caption && (
          <span style={{ fontSize: "0.72rem", color: "var(--amm-muted)" }}>
            {caption}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function CueList({
  cues,
  selectedId,
  onSelect,
}: {
  cues: DocumentCue[];
  selectedId?: string | null;
  onSelect?: (cueId: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {cues.map((cue) => (
        <div
          key={cue.id}
          onClick={onSelect ? () => onSelect(cue.id) : undefined}
          style={{
            padding: "9px 10px",
            borderRadius: 8,
            background:
              cue.id === selectedId
                ? `var(--amm-amber-22)`
                : `var(--amm-deep-99)`,
            border: `1px solid ${cue.id === selectedId ? "var(--amm-amberDk)" : "var(--amm-border)"}`,
            display: "flex",
            flexDirection: "column",
            gap: 4,
            cursor: onSelect ? "pointer" : "default",
            transition: "background 0.14s, border-color 0.14s",
          }}
        >
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              color:
                cue.id === selectedId
                  ? "var(--amm-amberLt)"
                  : "var(--amm-cream)",
              fontSize: "0.92rem",
            }}
          >
            {cue.label}
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--amm-creamDk)",
              lineHeight: 1.5,
            }}
          >
            {cue.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProjectPlayerView({
  summary,
  selectedCueId,
  onSelectCue,
  playing,
  onPlayingChange,
}: {
  summary: DocumentSummary;
  selectedCueId: string | null;
  onSelectCue: (cueId: string) => void;
  playing: boolean;
  onPlayingChange: (next: boolean) => void;
}) {
  const cues = summary.scenes.length > 0 ? summary.scenes : summary.structure;
  const cueIndex = Math.max(
    0,
    cues.findIndex((cue) => cue.id === selectedCueId),
  );
  const activeCue = cues[cueIndex] ?? null;
  const cueProgress =
    cues.length > 1 ? (cueIndex / (cues.length - 1)) * 100 : 0;

  useEffect(() => {
    if (!playing || cues.length <= 1) return;
    const id = window.setInterval(() => {
      const nextIndex = cueIndex >= cues.length - 1 ? 0 : cueIndex + 1;
      onSelectCue(cues[nextIndex]?.id ?? cues[0]?.id ?? "");
    }, 2200);
    return () => window.clearInterval(id);
  }, [cueIndex, cues, onSelectCue, playing]);

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        overflow: "auto",
        padding: 22,
        display: "grid",
        gap: 18,
      }}
    >
      <WorkspaceSection title="Stage" caption={summary.subtitle}>
        <div
          style={{
            minHeight: 220,
            borderRadius: 18,
            border: `1px solid var(--amm-borderLt)`,
            background: `radial-gradient(circle at top, var(--amm-amberDk-22), transparent 55%), linear-gradient(180deg, var(--amm-deep), var(--amm-film))`,
            display: "grid",
            placeItems: "center",
            padding: 24,
            textAlign: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 14,
              border: `1px solid var(--amm-border-99)`,
              borderRadius: 14,
            }}
          />
          <div style={{ position: "relative", zIndex: 1, maxWidth: 620 }}>
            <div
              style={{
                fontFamily: FONT_DISPLAY,
                fontSize: "2rem",
                color: "var(--amm-amberLt)",
                fontStyle: "italic",
              }}
            >
              {summary.title}
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: "0.9rem",
                lineHeight: 1.7,
                color: "var(--amm-creamDk)",
              }}
            >
              {activeCue?.detail ?? "No staged cues yet."}
            </div>
            <div style={{ marginTop: 18, display: "inline-flex", gap: 8 }}>
              <button
                className="amm-btn amm-btn-ghost"
                onClick={() =>
                  onSelectCue(
                    cues[Math.max(0, cueIndex - 1)]?.id ?? activeCue?.id ?? "",
                  )
                }
              >
                ← Prev Cue
              </button>
              <button
                className={`amm-btn ${playing ? "amm-btn-ghost" : "amm-btn-amber"}`}
                onClick={() => onPlayingChange(!playing)}
              >
                {playing ? "Pause" : "Play"}
              </button>
              <button
                className="amm-btn amm-btn-amber"
                onClick={() =>
                  onSelectCue(
                    cues[Math.min(cues.length - 1, cueIndex + 1)]?.id ??
                      activeCue?.id ??
                      "",
                  )
                }
              >
                Next Cue →
              </button>
            </div>
          </div>
        </div>
      </WorkspaceSection>

      <WorkspaceSection
        title="Transport"
        caption={`${cueIndex + 1} / ${Math.max(1, cues.length)} cues`}
      >
        <input
          type="range"
          className="amm-range"
          min={0}
          max={Math.max(1, cues.length - 1)}
          step={1}
          value={Math.min(cueIndex, Math.max(0, cues.length - 1))}
          onChange={(e) =>
            onSelectCue(cues[Number(e.target.value)]?.id ?? activeCue?.id ?? "")
          }
          style={{
            width: "100%",
            background: `linear-gradient(to right, var(--amm-amber) ${cueProgress}%, var(--amm-surface3) ${cueProgress}%)`,
          }}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 10,
          }}
        >
          {cues.map((cue, index) => (
            <button
              key={cue.id}
              className={`amm-btn ${index === cueIndex ? "amm-btn-amber" : "amm-btn-ghost"}`}
              onClick={() => onSelectCue(cue.id)}
              style={{
                justifyContent: "flex-start",
                textTransform: "none",
                letterSpacing: "0.02em",
              }}
            >
              {cue.label}
            </button>
          ))}
        </div>
      </WorkspaceSection>
    </div>
  );
}

function StudioBoardView({
  summary,
  selectedCueId,
  onSelectCue,
  onMoveCue,
  onRemoveCue,
  onAddCue,
}: {
  summary: DocumentSummary;
  selectedCueId: string | null;
  onSelectCue: (cueId: string) => void;
  onMoveCue: (cueId: string, direction: -1 | 1) => void;
  onRemoveCue: (cueId: string) => void;
  onAddCue: () => void;
}) {
  const activeCue =
    summary.scenes.find((cue) => cue.id === selectedCueId) ??
    summary.structure.find((cue) => cue.id === selectedCueId) ??
    summary.scenes[0] ??
    summary.structure[0] ??
    null;
  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        overflow: "auto",
        padding: 22,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 18,
        alignItems: "start",
      }}
    >
      <WorkspaceSection
        title="Preview"
        caption={activeCue?.label ?? "No active cue"}
      >
        <div
          style={{
            minHeight: 160,
            borderRadius: 12,
            padding: 16,
            background: `linear-gradient(180deg, var(--amm-deep), var(--amm-parchment))`,
            border: `1px solid var(--amm-border)`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div
            style={{
              fontFamily: FONT_DISPLAY,
              color: "var(--amm-amberLt)",
              fontSize: "1.2rem",
            }}
          >
            {activeCue?.label ?? summary.title}
          </div>
          <div
            style={{
              fontSize: "0.82rem",
              lineHeight: 1.7,
              color: "var(--amm-creamDk)",
            }}
          >
            {activeCue?.detail ?? summary.subtitle}
          </div>
        </div>
      </WorkspaceSection>
      <WorkspaceSection
        title="Scenes"
        caption={`${summary.scenes.length} visible`}
      >
        <CueList
          cues={summary.scenes.length > 0 ? summary.scenes : summary.structure}
          selectedId={selectedCueId}
          onSelect={onSelectCue}
        />
        {summary.scenes.length > 0 && activeCue && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              className="amm-btn amm-btn-ghost"
              onClick={() => onMoveCue(activeCue.id, -1)}
            >
              Move Up
            </button>
            <button
              className="amm-btn amm-btn-ghost"
              onClick={() => onMoveCue(activeCue.id, 1)}
            >
              Move Down
            </button>
            <button
              className="amm-btn amm-btn-ghost"
              onClick={() => onRemoveCue(activeCue.id)}
            >
              Remove
            </button>
            <button className="amm-btn amm-btn-amber" onClick={onAddCue}>
              Add Scene
            </button>
          </div>
        )}
      </WorkspaceSection>
      <WorkspaceSection
        title="Assets"
        caption={`${summary.assets.length} referenced`}
      >
        <CueList
          cues={
            summary.assets.length > 0
              ? summary.assets
              : [
                  {
                    id: "none",
                    label: "No mapped assets yet",
                    detail:
                      "This document is currently light on explicit asset metadata.",
                  },
                ]
          }
        />
      </WorkspaceSection>
      <WorkspaceSection title="Structure" caption="Outline and internals">
        <CueList
          cues={summary.structure}
          selectedId={selectedCueId}
          onSelect={onSelectCue}
        />
      </WorkspaceSection>
    </div>
  );
}

function makeStructuredDraft(
  loaded: LoadedFile,
  summary: DocumentSummary,
): StructuredDraft {
  if (
    Array.isArray(
      (loaded.jsonData as { scenes?: unknown[] } | undefined)?.scenes,
    )
  ) {
    const scenes = (
      (loaded.jsonData as { scenes?: unknown[] }).scenes ?? []
    ).map((scene, index) => {
      const item = scene as Record<string, unknown>;
      return {
        id: safeString(item.id) || `scene-${index + 1}`,
        label:
          safeString(item.title) ||
          safeString(item.name) ||
          `Scene ${index + 1}`,
        detail: safeString(item.text) || safeString(item.captionText) || "",
      };
    });
    return { title: summary.title, subtitle: summary.subtitle, scenes };
  }
  return {
    title: summary.title,
    subtitle: summary.subtitle,
    scenes: summary.scenes.length > 0 ? summary.scenes : summary.structure,
  };
}

function buildDraftTextFromStructured(structured: StructuredDraft) {
  return [
    `# ${structured.title}`,
    "",
    structured.subtitle,
    "",
    ...structured.scenes.flatMap((scene) => [
      `## ${scene.label}`,
      "",
      scene.detail,
      "",
    ]),
  ]
    .join("\n")
    .trim();
}

function applyStructuredToLoaded(
  prev: LoadedFile,
  structured: StructuredDraft,
): LoadedFile {
  if (prev.jsonData && typeof prev.jsonData === "object") {
    const base = prev.jsonData as Record<string, unknown>;
    const next = {
      ...base,
      title: structured.title,
      description: structured.subtitle,
      scenes: structured.scenes.map((scene, index) => ({
        id: scene.id || `scene-${index + 1}`,
        title: scene.label,
        text: scene.detail,
      })),
    };
    return {
      ...prev,
      textContent: JSON.stringify(next, null, 2),
      jsonData: next,
    };
  }

  return {
    ...prev,
    kind: prev.kind === "unknown" ? "reader" : prev.kind,
    textContent: buildDraftTextFromStructured(structured),
    jsonData: undefined,
  };
}

function EditorDraftView({
  loaded,
  summary,
  onApply,
  onSelectCue,
  selectedCueId,
}: {
  loaded: LoadedFile;
  summary: DocumentSummary;
  onApply: (draft: string) => void;
  onSelectCue: (cueId: string) => void;
  selectedCueId: string | null;
}) {
  const initialDraft =
    loaded.textContent ??
    (loaded.jsonData ? JSON.stringify(loaded.jsonData, null, 2) : "");
  const initialStructured = makeStructuredDraft(loaded, summary);
  const [draft, setDraft] = useState(initialDraft);
  const [structured, setStructured] =
    useState<StructuredDraft>(initialStructured);
  const [message, setMessage] = useState(
    "Ammelie editor keeps changes in-memory for now.",
  );

  const tryApply = () => {
    try {
      onApply(draft);
      setMessage("Draft applied to the current Ammelie document.");
    } catch {
      setMessage("Draft could not be applied.");
    }
  };

  const applyStructured = () => {
    const nextLoaded = applyStructuredToLoaded(loaded, structured);
    onApply(nextLoaded.textContent ?? "");
    setDraft(nextLoaded.textContent ?? draft);
    setMessage(
      loaded.jsonData && typeof loaded.jsonData === "object"
        ? "Structured fields applied to project JSON."
        : "Structured fields applied to document text.",
    );
  };

  return (
    <div
      style={{
        height: "100%",
        minHeight: 0,
        padding: 22,
        display: "grid",
        gridTemplateRows: "auto 1fr",
        gap: 16,
      }}
    >
      <WorkspaceSection title="Draft Surface" caption="In-memory editing">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="amm-btn amm-btn-amber" onClick={tryApply}>
            Apply Draft
          </button>
          <button className="amm-btn amm-btn-ghost" onClick={applyStructured}>
            Apply Structured
          </button>
          <button
            className="amm-btn amm-btn-ghost"
            onClick={() => setDraft(initialDraft)}
          >
            Reset Draft
          </button>
          <span style={{ fontSize: "0.75rem", color: "var(--amm-creamDk)" }}>
            {message}
          </span>
        </div>
      </WorkspaceSection>
      <div
        style={{
          minHeight: 0,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: 16,
        }}
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          className="selectable"
          style={{
            width: "100%",
            height: "100%",
            minHeight: 0,
            resize: "none",
            borderRadius: 12,
            border: `1px solid var(--amm-borderLt)`,
            background: `var(--amm-parchment)`,
            color: "var(--amm-cream)",
            padding: "16px 18px",
            fontFamily: FONT_MONO,
            fontSize: "0.84rem",
            lineHeight: 1.7,
            outline: "none",
          }}
        />
        <div
          style={{
            minHeight: 0,
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <WorkspaceSection title="Structured Fields" caption="Document model">
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: "0.74rem",
                color: "var(--amm-creamDk)",
              }}
            >
              Title
              <input
                value={structured.title}
                onChange={(e) =>
                  setStructured((prev) => ({ ...prev, title: e.target.value }))
                }
                className="selectable"
                style={{
                  background: "var(--amm-parchment)",
                  color: "var(--amm-cream)",
                  border: `1px solid var(--amm-borderLt)`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontFamily: FONT_BODY,
                }}
              />
            </label>
            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 4,
                fontSize: "0.74rem",
                color: "var(--amm-creamDk)",
              }}
            >
              Subtitle
              <textarea
                value={structured.subtitle}
                onChange={(e) =>
                  setStructured((prev) => ({
                    ...prev,
                    subtitle: e.target.value,
                  }))
                }
                className="selectable"
                style={{
                  minHeight: 74,
                  resize: "vertical",
                  background: "var(--amm-parchment)",
                  color: "var(--amm-cream)",
                  border: `1px solid var(--amm-borderLt)`,
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontFamily: FONT_BODY,
                }}
              />
            </label>
          </WorkspaceSection>
          <WorkspaceSection
            title="Scenes"
            caption={`${structured.scenes.length} editable`}
          >
            <CueList
              cues={structured.scenes}
              selectedId={selectedCueId}
              onSelect={onSelectCue}
            />
            {structured.scenes.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input
                  value={
                    (
                      structured.scenes.find(
                        (scene) => scene.id === selectedCueId,
                      ) ?? structured.scenes[0]
                    ).label
                  }
                  onChange={(e) => {
                    const targetId = selectedCueId ?? structured.scenes[0]?.id;
                    setStructured((prev) => ({
                      ...prev,
                      scenes: prev.scenes.map((scene) =>
                        scene.id === targetId
                          ? { ...scene, label: e.target.value }
                          : scene,
                      ),
                    }));
                  }}
                  className="selectable"
                  style={{
                    background: "var(--amm-parchment)",
                    color: "var(--amm-cream)",
                    border: `1px solid var(--amm-borderLt)`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontFamily: FONT_BODY,
                  }}
                />
                <textarea
                  value={
                    (
                      structured.scenes.find(
                        (scene) => scene.id === selectedCueId,
                      ) ?? structured.scenes[0]
                    ).detail
                  }
                  onChange={(e) => {
                    const targetId = selectedCueId ?? structured.scenes[0]?.id;
                    setStructured((prev) => ({
                      ...prev,
                      scenes: prev.scenes.map((scene) =>
                        scene.id === targetId
                          ? { ...scene, detail: e.target.value }
                          : scene,
                      ),
                    }));
                  }}
                  className="selectable"
                  style={{
                    minHeight: 120,
                    resize: "vertical",
                    background: "var(--amm-parchment)",
                    color: "var(--amm-cream)",
                    border: `1px solid var(--amm-borderLt)`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    fontFamily: FONT_BODY,
                  }}
                />
              </div>
            )}
          </WorkspaceSection>
        </div>
      </div>
    </div>
  );
}

// ── Sub-view: AudioView ────────────────────────────────────────────────────────
type EQPreset = "flat" | "warm" | "vinyl" | "bass+";

const EQ_PRESETS: Record<
  EQPreset,
  { bass: number; mid: number; treble: number; label: string }
> = {
  flat: { bass: 0, mid: 0, treble: 0, label: "Flat" },
  warm: { bass: 4, mid: -2, treble: -4, label: "Warm" },
  vinyl: { bass: 3, mid: 1, treble: -6, label: "Vinyl" },
  "bass+": { bass: 8, mid: -1, treble: -3, label: "Bass+" },
};

function AudioView({ loaded }: { loaded: LoadedFile }) {
  const { P } = useAmmTheme();
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const bassRef = useRef<BiquadFilterNode | null>(null);
  const midRef = useRef<BiquadFilterNode | null>(null);
  const trebleRef = useRef<BiquadFilterNode | null>(null);
  const rafRef = useRef<number>(0);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const paletteRef = useRef(P);
  useEffect(() => {
    paletteRef.current = P;
  }, [P]);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [looping, setLooping] = useState(false);
  const [preset, setPreset] = useState<EQPreset>("flat");

  // Initialize Web Audio chain
  const initAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || ctxRef.current) return;

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyserRef.current = analyser;

    const bass = ctx.createBiquadFilter();
    bass.type = "lowshelf";
    bass.frequency.value = 200;

    const mid = ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 1;

    const treble = ctx.createBiquadFilter();
    treble.type = "highshelf";
    treble.frequency.value = 4000;

    bassRef.current = bass;
    midRef.current = mid;
    trebleRef.current = treble;

    const source = ctx.createMediaElementSource(audio);
    sourceRef.current = source;

    source.connect(bass);
    bass.connect(mid);
    mid.connect(treble);
    treble.connect(analyser);
    analyser.connect(ctx.destination);
  }, []);

  // Apply EQ preset
  useEffect(() => {
    const p = EQ_PRESETS[preset];
    if (bassRef.current) bassRef.current.gain.value = p.bass;
    if (midRef.current) midRef.current.gain.value = p.mid;
    if (trebleRef.current) trebleRef.current.gain.value = p.treble;
  }, [preset]);

  // Canvas visualizer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const BAR_COUNT = 60;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const W = canvas.width;
      const H = canvas.height;
      ctx2d.clearRect(0, 0, W, H);
      ctx2d.fillStyle = paletteRef.current.surface;
      ctx2d.fillRect(0, 0, W, H);

      const analyser = analyserRef.current;
      if (!analyser) {
        // idle bars
        const barW = Math.floor((W - BAR_COUNT) / BAR_COUNT);
        for (let i = 0; i < BAR_COUNT; i++) {
          const h = 4 + Math.random() * 3;
          ctx2d.fillStyle = `${paletteRef.current.amberDk}44`;
          ctx2d.fillRect(i * (barW + 1), H - h, barW, h);
        }
        return;
      }

      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(data);

      const step = Math.floor(bufLen / BAR_COUNT);
      const barW = Math.floor((W - BAR_COUNT) / BAR_COUNT);

      for (let i = 0; i < BAR_COUNT; i++) {
        const val = data[i * step] / 255;
        const h = Math.max(3, val * (H - 4));
        const ratio = i / BAR_COUNT;
        // gradient: dark amber → bright amber → gold at top
        const r = Math.round(140 + ratio * 60 + val * 40);
        const g = Math.round(80 + ratio * 40 + val * 30);
        const b = Math.round(20 + val * 15);
        ctx2d.fillStyle = `rgb(${r},${g},${b})`;
        ctx2d.fillRect(i * (barW + 1), H - h, barW, h);
      }
    };
    draw();

    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!ctxRef.current) initAudio();
    if (ctxRef.current?.state === "suspended") await ctxRef.current.resume();
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      await audio.play();
      setPlaying(true);
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const onVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="amm-fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--amm-film)",
        padding: 16,
        gap: 12,
      }}
    >
      {/* Filename */}
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: "1.1rem",
          color: "var(--amm-amberLt)",
          letterSpacing: "0.04em",
          textAlign: "center",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {loaded.file.name}
      </div>

      {/* Visualizer canvas */}
      <canvas
        ref={canvasRef}
        width={580}
        height={110}
        style={{
          width: "100%",
          height: 110,
          borderRadius: 3,
          border: `1px solid var(--amm-border)`,
          display: "block",
        }}
      />

      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        src={loaded.objectUrl}
        loop={looping}
        onTimeUpdate={(e) =>
          setCurrentTime((e.target as HTMLAudioElement).currentTime)
        }
        onLoadedMetadata={(e) =>
          setDuration((e.target as HTMLAudioElement).duration)
        }
        onEnded={() => setPlaying(false)}
        style={{ display: "none" }}
      />

      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: "0.72rem",
            color: "var(--amm-muted)",
            width: 34,
            textAlign: "right",
          }}
        >
          {fmtTime(currentTime)}
        </span>
        <input
          type="range"
          className="amm-range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={seek}
          style={{
            flex: 1,
            background: `linear-gradient(to right, var(--amm-amber) ${progressPct}%, var(--amm-surface3) ${progressPct}%)`,
          }}
        />
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: "0.72rem",
            color: "var(--amm-muted)",
            width: 34,
          }}
        >
          {fmtTime(duration)}
        </span>
      </div>

      {/* Controls row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: "center",
        }}
      >
        <button
          className="amm-btn amm-btn-amber"
          onClick={togglePlay}
          style={{ fontSize: "1rem", padding: "6px 18px", minWidth: 52 }}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          className={`amm-btn ${looping ? "amm-btn-amber" : "amm-btn-ghost"}`}
          onClick={() => setLooping((l) => !l)}
          title="Loop"
          style={{ fontSize: "0.85rem" }}
        >
          ↺
        </button>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: "0.7rem",
            color: "var(--amm-muted)",
          }}
        >
          vol
        </span>
        <input
          type="range"
          className="amm-range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={onVolumeChange}
          style={{
            width: 72,
            background: `linear-gradient(to right, var(--amm-amberDk) ${volume * 100}%, var(--amm-surface3) ${volume * 100}%)`,
          }}
        />
      </div>

      {/* EQ presets */}
      <div
        style={{
          display: "flex",
          gap: 6,
          justifyContent: "center",
          flexWrap: "wrap",
        }}
      >
        {(
          Object.entries(EQ_PRESETS) as [
            EQPreset,
            (typeof EQ_PRESETS)[EQPreset],
          ][]
        ).map(([key, val]) => (
          <button
            key={key}
            className={`amm-btn ${preset === key ? "amm-btn-amber" : "amm-btn-ghost"}`}
            onClick={() => setPreset(key)}
            style={{ fontSize: "0.7rem" }}
          >
            {val.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Sub-view: VideoView ────────────────────────────────────────────────────────
function VideoView({ loaded }: { loaded: LoadedFile }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [controlsVisible, setControlsVisible] = useState(true);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setControlsVisible(false), 2500);
  }, []);

  useEffect(
    () => () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    },
    [],
  );

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) {
      v.pause();
      setPlaying(false);
    } else {
      await v.play();
      setPlaying(true);
    }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  const onVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (videoRef.current) videoRef.current.volume = v;
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen();
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const volPct = volume * 100;

  return (
    <div
      ref={containerRef}
      onMouseMove={showControls}
      onClick={showControls}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#000",
        cursor: controlsVisible ? "default" : "none",
      }}
    >
      <video
        ref={videoRef}
        src={loaded.objectUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: "block",
        }}
        onTimeUpdate={(e) =>
          setCurrentTime((e.target as HTMLVideoElement).currentTime)
        }
        onLoadedMetadata={(e) =>
          setDuration((e.target as HTMLVideoElement).duration)
        }
        onEnded={() => setPlaying(false)}
        onClick={togglePlay}
      />
      <div
        className="amm-video-controls"
        style={{
          opacity: controlsVisible ? 1 : 0,
          pointerEvents: controlsVisible ? "auto" : "none",
        }}
      >
        {/* Progress bar */}
        <input
          type="range"
          className="amm-range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={seek}
          style={{
            width: "100%",
            background: `linear-gradient(to right, var(--amm-amber) ${progressPct}%, rgba(255,255,255,0.2) ${progressPct}%)`,
          }}
        />
        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            className="amm-btn amm-btn-ghost"
            onClick={togglePlay}
            style={{ padding: "3px 10px" }}
          >
            {playing ? "⏸" : "▶"}
          </button>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: "0.72rem",
              color: "var(--amm-creamDk)",
              marginRight: 4,
            }}
          >
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              marginLeft: "auto",
            }}
          >
            <span
              style={{
                fontFamily: FONT_MONO,
                fontSize: "0.68rem",
                color: "var(--amm-muted)",
              }}
            >
              🔊
            </span>
            <input
              type="range"
              className="amm-range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={onVolumeChange}
              style={{
                width: 60,
                background: `linear-gradient(to right, var(--amm-amberDk) ${volPct}%, rgba(255,255,255,0.2) ${volPct}%)`,
              }}
            />
            <button
              className="amm-btn amm-btn-ghost"
              onClick={toggleFullscreen}
              style={{ padding: "3px 8px", fontSize: "0.8rem" }}
            >
              ⛶
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-view: ReaderView ───────────────────────────────────────────────────────
function splitPages(text: string, charsPerPage = 800): string[] {
  const pages: string[] = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    if (remaining.length <= charsPerPage) {
      pages.push(remaining);
      break;
    }
    let cut = charsPerPage;
    while (cut > 0 && remaining[cut] !== " " && remaining[cut] !== "\n") cut--;
    if (cut === 0) cut = charsPerPage;
    pages.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  return pages;
}

function ReaderView({ loaded }: { loaded: LoadedFile }) {
  const text = loaded.textContent ?? "";
  const pages = splitPages(text);
  const [page, setPage] = useState(0);
  const ext = loaded.file.name.split(".").pop()?.toLowerCase() ?? "";
  const canRenderMarkdown = ["md", "markdown", "rst", "org", "txt"].includes(
    ext,
  );
  const [mode, setMode] = useState<ReaderMode>(
    ext === "md" || ext === "markdown" ? "rendered" : "source",
  );
  const rendered = canRenderMarkdown ? renderReaderMarkdown(text) : "";
  const headings = canRenderMarkdown ? extractReaderHeadings(text) : [];
  const renderedRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className="amm-fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--amm-parchment)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "14px 18px 10px",
          borderBottom: `1px solid var(--amm-border)`,
          background: "var(--amm-surface)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: "0.95rem",
              color: "var(--amm-amberLt)",
              letterSpacing: "0.06em",
            }}
          >
            Reader
          </span>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: "0.68rem",
              color: "var(--amm-muted)",
              letterSpacing: "0.05em",
            }}
          >
            {loaded.file.name}
          </span>
        </div>

        {canRenderMarkdown && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: 3,
              border: `1px solid var(--amm-borderLt)`,
              borderRadius: 999,
              background: `var(--amm-deep-cc)`,
            }}
          >
            {(["source", "rendered"] as ReaderMode[]).map((candidate) => {
              const active = mode === candidate;
              return (
                <button
                  key={candidate}
                  className="amm-btn"
                  onClick={() => setMode(candidate)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 999,
                    background: active ? "var(--amm-amber)" : "transparent",
                    color: active ? "var(--amm-film)" : "var(--amm-creamDk)",
                    borderColor: "transparent",
                  }}
                >
                  {candidate === "source" ? "Source" : "Rendered"}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Page content */}
      <div
        style={{
          flex: 1,
          overflow: "hidden auto",
          padding: "28px 48px",
          display: "flex",
          justifyContent: "center",
        }}
      >
        {mode === "rendered" && canRenderMarkdown ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                headings.length > 0
                  ? "220px minmax(0, 720px)"
                  : "minmax(0, 720px)",
              gap: 28,
              width: "100%",
              justifyContent: "center",
              alignItems: "start",
            }}
          >
            {headings.length > 0 && (
              <aside
                style={{
                  position: "sticky",
                  top: 0,
                  alignSelf: "start",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: "14px 12px",
                  background: `var(--amm-surface-cc)`,
                  border: `1px solid var(--amm-borderLt)`,
                  borderRadius: 10,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    color: "var(--amm-amberLt)",
                    letterSpacing: "0.08em",
                    fontSize: "0.8rem",
                  }}
                >
                  Sections
                </div>
                {headings.map((heading) => (
                  <button
                    key={heading.id}
                    className="amm-btn amm-btn-ghost"
                    onClick={() => {
                      const el =
                        renderedRef.current?.querySelector<HTMLElement>(
                          `#${heading.id}`,
                        );
                      el?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }}
                    style={{
                      justifyContent: "flex-start",
                      padding: "4px 6px",
                      border: "none",
                      fontSize: "0.72rem",
                      textTransform: "none",
                      letterSpacing: "0.03em",
                      marginLeft:
                        heading.level > 1 ? (heading.level - 1) * 10 : 0,
                    }}
                  >
                    {heading.title}
                  </button>
                ))}
              </aside>
            )}

            <div
              ref={renderedRef}
              className="amm-reader-md"
              style={{
                fontFamily: FONT_BODY,
                fontSize: 18,
                lineHeight: 1.8,
                maxWidth: 720,
                color: "#E8D5B0",
                width: "100%",
              }}
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          </div>
        ) : (
          <p
            style={{
              fontFamily: FONT_BODY,
              fontSize: 18,
              lineHeight: 1.8,
              maxWidth: 620,
              color: "#E8D5B0",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {pages[page] ?? ""}
          </p>
        )}
      </div>

      {/* Navigation */}
      {mode === "source" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: "10px 0 14px",
            borderTop: `1px solid var(--amm-border)`,
            background: "var(--amm-surface)",
            flexShrink: 0,
          }}
        >
          <button
            className="amm-btn amm-btn-ghost"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Prev
          </button>
          <span
            style={{
              fontFamily: FONT_DISPLAY,
              fontSize: "0.8rem",
              color: "var(--amm-muted)",
              letterSpacing: "0.06em",
            }}
          >
            {page + 1} of {pages.length || 1}
          </span>
          <button
            className="amm-btn amm-btn-ghost"
            disabled={page >= pages.length - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function readerSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function extractReaderHeadings(md: string): ReaderHeading[] {
  const seen = new Map<string, number>();
  return md
    .split("\n")
    .map((line) => line.match(/^(#{1,4})\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const level = match[1].length as 1 | 2 | 3 | 4;
      const title = match[2].trim();
      const base = readerSlug(title) || `section-${level}`;
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count + 1}`;
      return { level, title, id };
    });
}

function renderReaderMarkdown(md: string): string {
  const seen = new Map<string, number>();
  const withHeadingIds = (level: string, title: string) => {
    const clean = title.trim();
    const base = readerSlug(clean) || "section";
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    return `<h${level} id="${id}">${clean}</h${level}>`;
  };

  return md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_m, lang, code) =>
        `<pre><code class="lang-${lang}">${code.trimEnd()}</code></pre>`,
    )
    .replace(/^#### (.+)$/gm, (_m, title) => withHeadingIds("4", title))
    .replace(/^### (.+)$/gm, (_m, title) => withHeadingIds("3", title))
    .replace(/^## (.+)$/gm, (_m, title) => withHeadingIds("2", title))
    .replace(/^# (.+)$/gm, (_m, title) => withHeadingIds("1", title))
    .replace(/^---+$/gm, "<hr>")
    .replace(/^&gt; (.+)$/gm, "<blockquote><p>$1</p></blockquote>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/((?:^\|.+\|\n)+)/gm, (table) => {
      const rows = table.trim().split("\n");
      const isHeader = rows[1]?.match(/^\|[-| :]+\|$/);
      let out = "<table>";
      rows.forEach((row, i) => {
        if (i === 1 && isHeader) return;
        const split = row.split("|");
        const cells = split.filter((_, ci) => ci > 0 && ci < split.length - 1);
        const tag = i === 0 && isHeader ? "th" : "td";
        out += `<tr>${cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("")}</tr>`;
      });
      out += "</table>";
      return out;
    })
    .replace(/((?:^[-*] .+\n?)+)/gm, (block) => {
      const items = block
        .trim()
        .split("\n")
        .map((l) => `<li>${l.replace(/^[-*] /, "")}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    })
    .replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
      const items = block
        .trim()
        .split("\n")
        .map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`)
        .join("");
      return `<ol>${items}</ol>`;
    })
    .replace(/\n\n([^<\n].+?)(?=\n\n|$)/gs, "\n<p>$1</p>")
    .replace(/([^>])\n([^<\n])/g, "$1<br>$2");
}

// ── Sub-view: FlowView ─────────────────────────────────────────────────────────
interface FlowNode {
  id: string;
  name?: string;
  type?: string;
  agent_type?: string;
  label?: string;
}

interface FlowData {
  name?: string;
  description?: string;
  nodes?: FlowNode[];
  edges?: unknown[];
}

const NODE_TYPE_ICON: Record<string, string> = {
  user_proxy: "👤",
  assistant: "🤖",
  group_manager: "👥",
  tool: "🔧",
};

function nodeIcon(node: FlowNode): string {
  const t = node.agent_type ?? node.type ?? "";
  return NODE_TYPE_ICON[t] ?? "◈";
}

function FlowView({ loaded }: { loaded: LoadedFile }) {
  const data = loaded.jsonData as FlowData | null;
  const nodes = data?.nodes ?? [];
  const edges = data?.edges ?? [];

  const openInStudio = () => {
    // Emits limen:// intent for future window manager integration
    if (typeof window !== "undefined") {
      const ev = new CustomEvent("limen:open", {
        detail: { url: "limen://window/open?app=waldiez-studio" },
        bubbles: true,
      });
      window.dispatchEvent(ev);
    }
  };

  return (
    <div
      className="amm-fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--amm-film)",
      }}
    >
      {/* Metadata header */}
      <div
        style={{
          padding: "14px 18px 10px",
          background: "var(--amm-surface)",
          borderBottom: `1px solid var(--amm-border)`,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: "1.1rem",
            color: "var(--amm-amberLt)",
            letterSpacing: "0.04em",
            marginBottom: 4,
          }}
        >
          {data?.name ?? loaded.file.name}
        </div>
        {data?.description && (
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: "0.82rem",
              color: "var(--amm-creamDk)",
              marginBottom: 8,
            }}
          >
            {data.description}
          </div>
        )}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span
            style={{
              fontFamily: FONT_MONO,
              fontSize: "0.72rem",
              color: "var(--amm-muted)",
            }}
          >
            {nodes.length} nodes · {edges.length} edges
          </span>
          <button
            className="amm-btn amm-btn-ghost"
            onClick={openInStudio}
            style={{ fontSize: "0.7rem", marginLeft: "auto" }}
          >
            Open in Studio ↗
          </button>
        </div>
      </div>

      {/* Node list */}
      <div style={{ flex: 1, overflow: "hidden auto" }}>
        {nodes.length === 0 ? (
          <div
            style={{
              padding: 24,
              color: "var(--amm-muted)",
              fontFamily: FONT_BODY,
              fontSize: "0.85rem",
              textAlign: "center",
            }}
          >
            No nodes found in this flow.
          </div>
        ) : (
          nodes.map((node, idx) => (
            <div key={node.id ?? idx} className="amm-node-item">
              <span
                style={{ fontSize: "1.1rem", width: 22, textAlign: "center" }}
              >
                {nodeIcon(node)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: "0.88rem",
                    color: "var(--amm-cream)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {node.name ?? node.label ?? "Unnamed"}
                </div>
                <div
                  style={{
                    fontFamily: FONT_MONO,
                    fontSize: "0.68rem",
                    color: "var(--amm-muted)",
                  }}
                >
                  {node.agent_type ?? node.type ?? "node"}
                </div>
              </div>
              <span
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: "0.65rem",
                  color: "var(--amm-borderLt)",
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {node.id}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Sub-view: WidView ──────────────────────────────────────────────────────────
interface WIDEvent {
  id?: string;
  [key: string]: unknown;
}

/** Parse a HLC-based WID string. Expected format: <nodeId>-<logicalHex>-<wallClockHex> */
function parseWID(
  wid: string,
): { nodeId: string; wallClock: string; logical: string; iso: string } | null {
  try {
    const parts = wid.split("-");
    if (parts.length < 3) return null;
    const nodeId = parts[0];
    const logicalHex = parts[parts.length - 2];
    const wallHex = parts[parts.length - 1];
    const wallMs = parseInt(wallHex, 16);
    const logical = parseInt(logicalHex, 16).toString();
    const iso = isNaN(wallMs) ? wid : new Date(wallMs).toISOString();
    return { nodeId, wallClock: wallHex, logical, iso };
  } catch {
    return null;
  }
}

function WIDRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="amm-wid-field">
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: "0.72rem",
          color: "var(--amm-muted)",
          width: 110,
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: FONT_MONO,
          fontSize: "0.72rem",
          color: highlight ? "var(--amm-amberLt)" : "var(--amm-cream)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function WidView({ loaded }: { loaded: LoadedFile }) {
  const json = loaded.jsonData;
  const isArray = Array.isArray(json);
  const events: WIDEvent[] = isArray
    ? (json as WIDEvent[])
    : json
      ? [json as WIDEvent]
      : [];
  const plainText = loaded.textContent ?? "";

  // Try to treat the text as a bare WID string if JSON had no id field
  const bareWID =
    !json && plainText.trim().length > 4 ? plainText.trim() : null;

  return (
    <div
      className="amm-fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--amm-film)",
        overflow: "hidden auto",
      }}
    >
      <div
        style={{
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {bareWID &&
          (() => {
            const parsed = parseWID(bareWID);
            return (
              <div
                style={{
                  background: "var(--amm-surface)",
                  border: `1px solid var(--amm-border)`,
                  borderRadius: 3,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: "0.85rem",
                    color: "var(--amm-amberLt)",
                    letterSpacing: "0.06em",
                    marginBottom: 10,
                  }}
                >
                  WID
                </div>
                <WIDRow label="raw" value={bareWID} />
                {parsed && (
                  <>
                    <WIDRow label="node_id" value={parsed.nodeId} highlight />
                    <WIDRow label="wall_clock" value={parsed.wallClock} />
                    <WIDRow label="logical" value={parsed.logical} />
                    <WIDRow label="datetime" value={parsed.iso} highlight />
                  </>
                )}
              </div>
            );
          })()}

        {events.length > 0 &&
          events.map((ev, idx) => {
            const wid = (ev.id as string) ?? null;
            const parsed = wid ? parseWID(wid) : null;
            return (
              <div
                key={idx}
                style={{
                  background: "var(--amm-surface)",
                  border: `1px solid var(--amm-border)`,
                  borderRadius: 3,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontFamily: FONT_DISPLAY,
                    fontSize: "0.8rem",
                    color: "var(--amm-amberLt)",
                    letterSpacing: "0.06em",
                    marginBottom: 8,
                  }}
                >
                  Event #{idx + 1}
                </div>
                {wid && <WIDRow label="id (WID)" value={wid} highlight />}
                {parsed && (
                  <>
                    <WIDRow label="node_id" value={parsed.nodeId} />
                    <WIDRow label="datetime" value={parsed.iso} highlight />
                    <WIDRow label="logical" value={parsed.logical} />
                  </>
                )}
                {Object.entries(ev)
                  .filter(([k]) => k !== "id")
                  .map(([k, v]) => (
                    <WIDRow key={k} label={k} value={String(v)} />
                  ))}
              </div>
            );
          })}

        {!bareWID && events.length === 0 && (
          <div
            style={{
              color: "var(--amm-muted)",
              fontFamily: FONT_BODY,
              fontSize: "0.85rem",
              padding: 16,
              textAlign: "center",
            }}
          >
            Could not parse WID data.
            <pre
              style={{
                marginTop: 12,
                fontFamily: FONT_MONO,
                fontSize: "0.7rem",
                color: "var(--amm-borderLt)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {plainText.slice(0, 400)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-view: ImageView ────────────────────────────────────────────────────────
function ImageView({ loaded }: { loaded: LoadedFile }) {
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  return (
    <div
      className="amm-fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        background: "var(--amm-film)",
        padding: 16,
        gap: 12,
      }}
    >
      <div
        style={{
          position: "relative",
          border: `2px solid var(--amm-border)`,
          boxShadow: `0 0 0 1px var(--amm-amberDk-44), 0 8px 32px rgba(0,0,0,0.8)`,
          maxWidth: "100%",
          maxHeight: "calc(100% - 50px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--amm-deep)",
        }}
      >
        <FrameCorner pos="tl" />
        <FrameCorner pos="tr" />
        <FrameCorner pos="bl" />
        <FrameCorner pos="br" />
        <img
          src={loaded.objectUrl}
          alt={loaded.file.name}
          onLoad={(e) => {
            const img = e.target as HTMLImageElement;
            setDims({ w: img.naturalWidth, h: img.naturalHeight });
          }}
          style={{
            maxWidth: "100%",
            maxHeight: "calc(100vh - 120px)",
            objectFit: "contain",
            display: "block",
            filter: "sepia(0.1) contrast(1.03) brightness(0.98)",
          }}
        />
      </div>
      <div
        style={{
          fontFamily: FONT_MONO,
          fontSize: "0.72rem",
          color: "var(--amm-muted)",
          textAlign: "center",
        }}
      >
        {loaded.file.name}
        {dims && ` · ${dims.w} × ${dims.h}px`}
      </div>
    </div>
  );
}

// ── Sub-view: UnknownView ──────────────────────────────────────────────────────
function UnknownView({
  loaded,
  onOpenAsText,
}: {
  loaded: LoadedFile;
  onOpenAsText: () => void;
}) {
  const sizeFmt = (b: number) => {
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1048576).toFixed(2)} MB`;
  };

  return (
    <div
      className="amm-fade-up"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        background: "var(--amm-film)",
        gap: 12,
        padding: 24,
      }}
    >
      <div style={{ fontSize: 40, opacity: 0.5 }}>◈</div>
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: "1rem",
          color: "var(--amm-amberLt)",
          letterSpacing: "0.04em",
        }}
      >
        {loaded.file.name}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: "0.72rem",
            color: "var(--amm-muted)",
          }}
        >
          Size: {sizeFmt(loaded.file.size)}
        </span>
        <span
          style={{
            fontFamily: FONT_MONO,
            fontSize: "0.72rem",
            color: "var(--amm-muted)",
          }}
        >
          Type: {loaded.file.type || "unknown"}
        </span>
      </div>
      <button
        className="amm-btn amm-btn-ghost"
        onClick={onOpenAsText}
        style={{ marginTop: 8 }}
      >
        Open as text reader
      </button>
    </div>
  );
}

// ── Drop screen ────────────────────────────────────────────────────────────────
const ACCEPTED_CHIPS = [".waldiez", ".wid", "audio", "video", "image", "text"];

function DropScreen({
  onFile,
  onLoadDemo,
}: {
  onFile: (f: File) => void;
  onLoadDemo?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = "";
  };

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="*"
        style={{ display: "none" }}
        onChange={handleChange}
      />

      {/* Drop zone box */}
      <div
        className={dragOver ? "amm-drop-active" : ""}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 460,
          minHeight: 240,
          border: `1.5px dashed ${dragOver ? "var(--amm-amber)" : "var(--amm-amberDk)"}`,
          borderRadius: 4,
          background: dragOver ? `var(--amm-amber-08)` : "transparent",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
          cursor: "pointer",
          transition: "border-color 0.2s, background 0.2s",
          userSelect: "none",
          padding: "32px 24px",
        }}
      >
        <FrameCorner pos="tl" />
        <FrameCorner pos="tr" />
        <FrameCorner pos="bl" />
        <FrameCorner pos="br" />

        {/* Glyph */}
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 64,
            lineHeight: 1,
            color: "var(--amm-amber)",
            opacity: dragOver ? 1 : 0.8,
            transition: "opacity 0.2s",
          }}
        >
          ✦
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily: FONT_DISPLAY,
            fontSize: 32,
            fontWeight: 300,
            fontStyle: "italic",
            color: "var(--amm-amber)",
            letterSpacing: "0.04em",
          }}
        >
          Ammelie
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: "0.88rem",
            color: "var(--amm-creamDk)",
            opacity: 0.7,
          }}
        >
          {dragOver ? "Release to open" : "Drop any file or click to browse"}
        </div>

        {/* Accepted chips */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            justifyContent: "center",
            marginTop: 6,
          }}
        >
          {ACCEPTED_CHIPS.map((chip) => (
            <span
              key={chip}
              style={{
                fontFamily: FONT_MONO,
                fontSize: "0.65rem",
                padding: "2px 7px",
                border: `1px solid var(--amm-amberDk)`,
                borderRadius: 2,
                color: "var(--amm-amberDk)",
                letterSpacing: "0.05em",
              }}
            >
              {chip}
            </span>
          ))}
        </div>

        {/* Load Demo button */}
        {onLoadDemo && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onLoadDemo();
            }}
            style={{
              marginTop: 18,
              padding: "6px 18px",
              fontFamily: FONT_MONO,
              fontSize: "0.72rem",
              letterSpacing: "0.08em",
              color: "var(--amm-amber)",
              background: "transparent",
              border: `1px solid var(--amm-amber-55)`,
              borderRadius: 2,
              cursor: "pointer",
              transition: "border-color 0.2s, color 0.2s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "var(--amm-amber)";
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--amm-amberLt)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                `var(--amm-amber-55)`;
              (e.currentTarget as HTMLButtonElement).style.color =
                "var(--amm-amber)";
            }}
          >
            ✦ Load LIMEN OS Tour
          </button>
        )}
      </div>
    </div>
  );
}

// ── Loading screen ─────────────────────────────────────────────────────────────
function LoadingScreen({ filename }: { filename: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        background: "var(--amm-film)",
      }}
    >
      <div
        style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 32,
          color: "var(--amm-amber)",
          opacity: 0.6,
        }}
      >
        ✦
      </div>
      <div
        style={{
          fontFamily: FONT_BODY,
          fontSize: "0.85rem",
          color: "var(--amm-muted)",
        }}
      >
        Reading <span style={{ color: "var(--amm-creamDk)" }}>{filename}</span>…
      </div>
    </div>
  );
}

// ── Root: AmmelieContent ───────────────────────────────────────────────────────
export function AmmelieContent() {
  // Inject styles once
  useEffect(() => {
    injectStyles();
  }, []);

  const [screen, setScreen] = useState<AppScreen>("drop");
  const [loaded, setLoaded] = useState<LoadedFile | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceMode>("reader");
  const [selectedCueId, setSelectedCueId] = useState<string | null>(null);
  const [playerRunning, setPlayerRunning] = useState(false);
  const [theme, setTheme] = useState<AmmThemeId>(() => {
    const saved = localStorage.getItem("ammelie-theme");
    return (
      saved === "void" || saved === "lotus" ? saved : "amber"
    ) as AmmThemeId;
  });
  const [focusMode, setFocusMode] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const P = THEME_PALETTES[theme];

  // Persist theme + notify window titlebar
  useEffect(() => {
    localStorage.setItem("ammelie-theme", theme);
    window.dispatchEvent(
      new CustomEvent("limen:ammelie:theme", {
        detail: {
          theme,
          film: P.film,
          amber: P.amber,
          amberLt: P.amberLt,
          border: P.border,
        },
      }),
    );
  }, [theme, P]);

  // Revoke previous object URL on unmount / new file
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const handleFile = useCallback(async (file: File) => {
    // Revoke previous
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setScreen("loading");

    const detected = await detectFileKind(file);
    const objectUrl = URL.createObjectURL(file);
    objectUrlRef.current = objectUrl;

    const loaded: LoadedFile = { file, kind: detected.kind, objectUrl };
    if (detected.textContent !== undefined)
      loaded.textContent = detected.textContent;
    if (detected.jsonData !== undefined) loaded.jsonData = detected.jsonData;
    const summary = summarizeLoadedDocument(loaded);
    setLoaded(loaded);
    setSelectedCueId(summary.scenes[0]?.id ?? summary.structure[0]?.id ?? null);
    setPlayerRunning(false);
    setWorkspace(defaultWorkspaceFor(detected.kind));
    setScreen("view");
  }, []);

  const handleBack = useCallback(() => {
    setLoaded(null);
    setWorkspace("reader");
    setSelectedCueId(null);
    setPlayerRunning(false);
    setScreen("drop");
  }, []);

  const handleLoadDemo = useCallback(async () => {
    // Try the public/demo/ file first (works in dev + web deployment).
    // On Tauri the fetch may go to tauri://localhost which resolves correctly
    // via Vite's static asset handling. If it fails for any reason we fall
    // back to the inline copy so the demo always works.
    const FALLBACK_DEMO = `# LIMEN OS — Interactive Tour

> *A voice-first, AI-native desktop. Open this in Ammelie to explore the tour.*

---

## Welcome to LIMEN OS

You're looking at a new kind of operating system — not a skin on top of GNOME, but a
complete rethinking of how humans and computers interact.

## Voice First

Say *"Hey Limen, open terminal"* and it opens. Say *"summarise my last three emails"*
and the AI does it. The keyboard is a fallback, not the primary input.

## AI Native

Every surface is LLM-augmented. Multi-model routing: Claude → GPT-4o → Gemini → Deepseek
→ Groq → local. The best model for each task, automatic.

## Scenes

| Scene | Purpose |
|---|---|
| Greeter | Voice login, particle aurora |
| Home | Orbital dock, live wallpaper |
| Launch | 3D app grid, voice search |
| Focus | Single-app, minimal chrome |
| Ambient | Generative screensaver |

## Try It

1. Open the **Terminal** app
2. Say *"Hey Limen, show me the weather"*
3. Drop any file onto **Ammelie** to view, edit, or play it
`;
    try {
      const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      const res = await fetch(`${base}/demo/limen-tour.md`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: "text/markdown" });
      const file = new File([blob], "limen-tour.md", {
        type: "text/markdown",
      });
      await handleFile(file);
    } catch {
      // Fetch failed (Tauri production, offline, etc.) — use inline copy
      const blob = new Blob([FALLBACK_DEMO], { type: "text/markdown" });
      const file = new File([blob], "limen-tour.md", {
        type: "text/markdown",
      });
      await handleFile(file);
    }
  }, [handleFile]);

  // "Open as text reader" for unknown files
  const openAsText = useCallback(async () => {
    if (!loaded) return;
    try {
      const text = await loaded.file.text();
      setLoaded((prev) =>
        prev ? { ...prev, kind: "reader", textContent: text } : prev,
      );
    } catch {
      setLoaded((prev) =>
        prev
          ? {
              ...prev,
              kind: "reader",
              textContent: "[Could not read file as text]",
            }
          : prev,
      );
    }
  }, [loaded]);

  const applyEditorDraft = useCallback((draft: string) => {
    setLoaded((prev) => {
      if (!prev) return prev;
      const trimmed = draft.trim();
      if (
        prev.kind === "reader" ||
        (!trimmed.startsWith("{") && !trimmed.startsWith("["))
      ) {
        return {
          ...prev,
          textContent: draft,
          jsonData: undefined,
          kind: prev.kind === "unknown" ? "reader" : prev.kind,
        };
      }

      try {
        const parsed = JSON.parse(draft) as unknown;
        return { ...prev, textContent: draft, jsonData: parsed };
      } catch {
        return { ...prev, textContent: draft };
      }
    });
    setPlayerRunning(false);
  }, []);

  const applyStructuredDocument = useCallback(
    (updater: (current: StructuredDraft) => StructuredDraft) => {
      setLoaded((prev) => {
        if (!prev) return prev;
        const current = makeStructuredDraft(
          prev,
          summarizeLoadedDocument(prev),
        );
        return applyStructuredToLoaded(prev, updater(current));
      });
      setPlayerRunning(false);
    },
    [],
  );

  const moveScene = useCallback(
    (cueId: string, direction: -1 | 1) => {
      applyStructuredDocument((current) => {
        const index = current.scenes.findIndex((scene) => scene.id === cueId);
        if (index < 0) return current;
        const nextIndex = Math.max(
          0,
          Math.min(current.scenes.length - 1, index + direction),
        );
        if (nextIndex === index) return current;
        const scenes = [...current.scenes];
        const [item] = scenes.splice(index, 1);
        scenes.splice(nextIndex, 0, item);
        return { ...current, scenes };
      });
    },
    [applyStructuredDocument],
  );

  const removeScene = useCallback(
    (cueId: string) => {
      applyStructuredDocument((current) => {
        const scenes = current.scenes.filter((scene) => scene.id !== cueId);
        return {
          ...current,
          scenes: scenes.length > 0 ? scenes : current.scenes,
        };
      });
      setSelectedCueId((current) => (current === cueId ? null : current));
    },
    [applyStructuredDocument],
  );

  const addScene = useCallback(() => {
    const newId = `scene-${Date.now()}`;
    applyStructuredDocument((current) => ({
      ...current,
      scenes: [
        ...current.scenes,
        {
          id: newId,
          label: `Scene ${current.scenes.length + 1}`,
          detail: "New scene notes.",
        },
      ],
    }));
    setSelectedCueId(newId);
  }, [applyStructuredDocument]);

  const renderSubView = () => {
    if (!loaded) return null;
    switch (loaded.kind) {
      case "audio":
        return <AudioView loaded={loaded} />;
      case "video":
        return <VideoView loaded={loaded} />;
      case "image":
        return <ImageView loaded={loaded} />;
      case "reader":
        return <ReaderView key={loaded.file.name} loaded={loaded} />;
      case "waldiez-flow":
        return <FlowView loaded={loaded} />;
      case "waldiez-ammelie":
        return <FlowView loaded={loaded} />;
      case "wid":
        return <WidView loaded={loaded} />;
      case "unknown":
        return <UnknownView loaded={loaded} onOpenAsText={openAsText} />;
      default:
        return <UnknownView loaded={loaded} onOpenAsText={openAsText} />;
    }
  };

  const renderWorkspaceView = () => {
    if (!loaded) return null;
    const summary = summarizeLoadedDocument(loaded);
    const effectiveCueId =
      selectedCueId ??
      summary.scenes[0]?.id ??
      summary.structure[0]?.id ??
      null;
    if (workspace === "reader") {
      return renderSubView();
    }
    if (workspace === "player") {
      if (loaded.kind === "audio") return <AudioView loaded={loaded} />;
      if (loaded.kind === "video") return <VideoView loaded={loaded} />;
      if (loaded.kind === "image") return <ImageView loaded={loaded} />;
      return (
        <ProjectPlayerView
          summary={summary}
          selectedCueId={effectiveCueId}
          onSelectCue={setSelectedCueId}
          playing={playerRunning}
          onPlayingChange={setPlayerRunning}
        />
      );
    }
    if (workspace === "studio") {
      return (
        <StudioBoardView
          summary={summary}
          selectedCueId={effectiveCueId}
          onSelectCue={setSelectedCueId}
          onMoveCue={moveScene}
          onRemoveCue={removeScene}
          onAddCue={addScene}
        />
      );
    }
    return (
      <EditorDraftView
        key={`${loaded.file.name}:${loaded.textContent?.length ?? 0}:${loaded.kind}`}
        loaded={loaded}
        summary={summary}
        onApply={applyEditorDraft}
        onSelectCue={setSelectedCueId}
        selectedCueId={effectiveCueId}
      />
    );
  };

  return (
    <AmmThemeCtx.Provider
      value={{ theme, setTheme, P, focusMode, setFocusMode }}
    >
      <div
        className="amm-root"
        data-theme={theme}
        style={{
          // ── CSS custom properties — all palette values cascade to children ──
          ["--amm-film" as string]: P.film,
          ["--amm-deep" as string]: P.deep,
          ["--amm-surface" as string]: P.surface,
          ["--amm-surface2" as string]: P.surface2,
          ["--amm-surface3" as string]: P.surface3,
          ["--amm-amber" as string]: P.amber,
          ["--amm-amberLt" as string]: P.amberLt,
          ["--amm-amberDk" as string]: P.amberDk,
          ["--amm-gold" as string]: P.gold,
          ["--amm-cream" as string]: P.cream,
          ["--amm-creamDk" as string]: P.creamDk,
          ["--amm-muted" as string]: P.muted,
          ["--amm-mutedLt" as string]: P.mutedLt,
          ["--amm-border" as string]: P.border,
          ["--amm-borderLt" as string]: P.borderLt,
          ["--amm-parchment" as string]: P.parchment,
          // Pre-computed alpha variants
          ["--amm-amber-08" as string]: `${P.amber}08`,
          ["--amm-amber-22" as string]: `${P.amber}22`,
          ["--amm-amber-44" as string]: `${P.amber}44`,
          ["--amm-amber-55" as string]: `${P.amber}55`,
          ["--amm-amber-66" as string]: `${P.amber}66`,
          ["--amm-amber-99" as string]: `${P.amber}99`,
          ["--amm-amberDk-22" as string]: `${P.amberDk}22`,
          ["--amm-amberDk-44" as string]: `${P.amberDk}44`,
          ["--amm-border-22" as string]: `${P.border}22`,
          ["--amm-border-99" as string]: `${P.border}99`,
          ["--amm-surface-cc" as string]: `${P.surface}cc`,
          ["--amm-surface-d9" as string]: `${P.surface}d9`,
          ["--amm-surface-dd" as string]: `${P.surface}dd`,
          ["--amm-deep-cc" as string]: `${P.deep}cc`,
          ["--amm-deep-99" as string]: `${P.deep}99`,
          // Layout
          position: "relative",
          width: "100%",
          height: "100%",
          background: P.film,
          color: P.cream,
          fontFamily: FONT_BODY,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: "background 0.4s, color 0.4s",
        }}
      >
        {/* Film grain overlay */}
        <FilmGrain />

        {/* Theme switcher on drop screen — floating bottom-right */}
        {screen === "drop" && (
          <div
            style={{
              position: "absolute",
              bottom: 16,
              right: 16,
              display: "flex",
              gap: 6,
              zIndex: 20,
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: 10,
                color: P.muted,
                fontFamily: FONT_DISPLAY,
                marginRight: 2,
              }}
            >
              mood
            </span>
            {(["amber", "void", "lotus"] as AmmThemeId[]).map((t) => (
              <button
                key={t}
                title={THEME_LABELS[t]}
                onClick={() => setTheme(t)}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: `2.5px solid ${theme === t ? THEME_PALETTES[t].amberLt : THEME_PALETTES[t].borderLt}`,
                  background: `radial-gradient(circle at 35% 35%, ${THEME_PALETTES[t].amberLt}, ${THEME_PALETTES[t].amber})`,
                  cursor: "pointer",
                  padding: 0,
                  transition: "all 0.2s",
                  transform: theme === t ? "scale(1.35)" : "scale(1)",
                  boxShadow:
                    theme === t
                      ? `0 0 8px ${THEME_PALETTES[t].amberLt}88`
                      : "none",
                }}
              />
            ))}
          </div>
        )}

        {/* Main layout: sprocket strip + content */}
        <div
          style={{
            display: "flex",
            flex: 1,
            overflow: "hidden",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Left sprocket strip */}
          <SprocketStrip count={8} />

          {/* Content area */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              padding: focusMode ? "0 10%" : 0,
              transition: "padding 0.4s ease",
            }}
          >
            {/* Header (view mode only) */}
            {screen === "view" && loaded && (
              <ViewHeader
                file={loaded.file}
                kind={loaded.kind}
                onBack={handleBack}
                workspace={workspace}
                workspaces={workspaceModesFor(loaded.kind)}
                onWorkspaceChange={setWorkspace}
              />
            )}

            {/* Screen content */}
            {screen === "drop" && (
              <DropScreen onFile={handleFile} onLoadDemo={handleLoadDemo} />
            )}
            {screen === "loading" && (
              <LoadingScreen filename={loaded?.file.name ?? "file"} />
            )}
            {screen === "view" && loaded && (
              <AmmelieWorkspaceShell
                loaded={loaded}
                workspace={workspace}
                onWorkspaceChange={setWorkspace}
              >
                {renderWorkspaceView()}
              </AmmelieWorkspaceShell>
            )}
          </div>

          {/* Right sprocket strip */}
          <SprocketStrip count={8} />
        </div>
      </div>
    </AmmThemeCtx.Provider>
  );
}

export default AmmelieContent;
