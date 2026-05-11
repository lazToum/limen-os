import { useState, useRef, useMemo } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ReadMode = "book" | "screenplay" | "subtitles";

interface SrtEntry {
  index: number;
  start: string;
  end: string;
  text: string;
}
interface Chapter {
  title: string;
  lineIndex: number;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseSrt(raw: string): SrtEntry[] {
  const entries: SrtEntry[] = [];
  const blocks = raw.trim().split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length < 3) continue;
    const idx = parseInt(lines[0] ?? "0", 10);
    const time = lines[1] ?? "";
    const arrow = time.indexOf(" --> ");
    if (arrow < 0) continue;
    const start = time.slice(0, arrow).trim();
    const end = time.slice(arrow + 5).trim();
    const text = lines
      .slice(2)
      .join("\n")
      .replace(/<[^>]+>/g, "");
    entries.push({ index: idx, start, end, text });
  }
  return entries;
}

function detectMode(name: string, raw: string): ReadMode {
  const lower = name.toLowerCase();
  if (lower.endsWith(".srt") || lower.endsWith(".vtt")) return "subtitles";
  if (lower.endsWith(".fountain") || /^(INT\.|EXT\.)/m.test(raw))
    return "screenplay";
  return "book";
}

function buildChapters(
  mode: ReadMode,
  lines: string[],
  srtEntries: SrtEntry[],
): Chapter[] {
  if (mode === "subtitles") {
    return srtEntries.map((e, i) => ({ title: `${e.start}`, lineIndex: i }));
  }
  if (mode === "screenplay") {
    return lines
      .map((line, i) => ({ line: line.trim(), i }))
      .filter(({ line }) =>
        /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.)/.test(line),
      )
      .map(({ line, i }) => ({ title: line.slice(0, 48), lineIndex: i }));
  }
  // book
  return lines
    .map((line, i) => ({ line: line.trim(), i }))
    .filter(({ line }) => line.startsWith("# ") || line.startsWith("## "))
    .map(({ line, i }) => ({
      title: line.replace(/^#+\s*/, "").slice(0, 48),
      lineIndex: i,
    }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WaldiezReaderContent() {
  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [mode, setMode] = useState<ReadMode>("book");
  const [fontSize, setFontSize] = useState(16);
  const [activeChapter, setActiveChapter] = useState(0);
  const [over, setOver] = useState(false);
  const [syncPlayer, setSyncPlayer] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chapterElsRef = useRef<Map<number, HTMLElement>>(new Map());
  const contentAreaRef = useRef<HTMLDivElement>(null);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const lines = useMemo(() => content.split("\n"), [content]);
  const srtEntries = useMemo(
    () => (mode === "subtitles" ? parseSrt(content) : []),
    [content, mode],
  );
  const chapters = useMemo(
    () => buildChapters(mode, lines, srtEntries),
    [mode, lines, srtEntries],
  );

  // ── File loading ─────────────────────────────────────────────────────────────
  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result !== "string") return;
      const detected = detectMode(file.name, result);
      setContent(result);
      setFileName(file.name);
      setMode(detected);
      setActiveChapter(0);
      chapterElsRef.current.clear();
    };
    reader.readAsText(file);
  };

  // ── Chapter navigation ───────────────────────────────────────────────────────
  const scrollToChapter = (chIdx: number) => {
    setActiveChapter(chIdx);
    const el = chapterElsRef.current.get(chIdx);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const setChapterRef = (chIdx: number, el: HTMLElement | null) => {
    if (el) chapterElsRef.current.set(chIdx, el);
  };

  // ── Content rendering ─────────────────────────────────────────────────────────
  const renderSubtitles = () =>
    srtEntries.map((entry, i) => (
      <div
        key={i}
        className="wreader-sub-card"
        ref={(el) => {
          setChapterRef(i, el);
        }}
      >
        <div className="wreader-sub-time">
          {entry.start} → {entry.end}
        </div>
        <div className="wreader-sub-text" style={{ fontSize }}>
          {entry.text}
        </div>
      </div>
    ));

  const renderScreenplay = () =>
    lines.map((line, i) => {
      const t = line.trim();
      if (!t) return <div key={i} className="wreader-spacer" />;

      const chIdx = chapters.findIndex((c) => c.lineIndex === i);
      const isSceneHeading = /^(INT\.|EXT\.|INT\.\/EXT\.|EXT\.\/INT\.)/.test(t);

      if (isSceneHeading) {
        return (
          <div
            key={i}
            className="wreader-scene-heading"
            style={{ fontSize }}
            ref={(el) => {
              if (chIdx >= 0) setChapterRef(chIdx, el);
            }}
          >
            {t}
          </div>
        );
      }
      // Character name: short ALL-CAPS line not ending in a period
      if (
        t === t.toUpperCase() &&
        t.length > 0 &&
        t.length < 40 &&
        !t.endsWith(".")
      ) {
        return (
          <div key={i} className="wreader-character" style={{ fontSize }}>
            {t}
          </div>
        );
      }
      if (/^\(.*\)$/.test(t)) {
        return (
          <div key={i} className="wreader-parenthetical" style={{ fontSize }}>
            {t}
          </div>
        );
      }
      if (line.startsWith("    ") || line.startsWith("\t")) {
        return (
          <div key={i} className="wreader-dialogue" style={{ fontSize }}>
            {t}
          </div>
        );
      }
      return (
        <div key={i} className="wreader-action" style={{ fontSize }}>
          {t}
        </div>
      );
    });

  const renderBook = () =>
    lines.map((line, i) => {
      const t = line.trim();
      const chIdx = chapters.findIndex((c) => c.lineIndex === i);

      if (t.startsWith("# ")) {
        return (
          <h1
            key={i}
            className="wreader-h1"
            style={{ fontSize: fontSize + 10 }}
            ref={(el) => {
              if (chIdx >= 0) setChapterRef(chIdx, el);
            }}
          >
            {t.slice(2)}
          </h1>
        );
      }
      if (t.startsWith("## ")) {
        return (
          <h2
            key={i}
            className="wreader-h2"
            style={{ fontSize: fontSize + 5 }}
            ref={(el) => {
              if (chIdx >= 0) setChapterRef(chIdx, el);
            }}
          >
            {t.slice(3)}
          </h2>
        );
      }
      if (t.startsWith("### ")) {
        return (
          <h3 key={i} className="wreader-h3" style={{ fontSize: fontSize + 2 }}>
            {t.slice(4)}
          </h3>
        );
      }
      if (!t) return <div key={i} className="wreader-spacer" />;

      // Bold **text** and italic *text* — simple inline transforms
      const html = t
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>");

      return (
        <p
          key={i}
          className="wreader-p"
          style={{ fontSize }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    });

  const renderContent = (): React.ReactNode[] => {
    if (mode === "subtitles") return renderSubtitles();
    if (mode === "screenplay") return renderScreenplay();
    return renderBook();
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="wreader">
      {!content ? (
        /* Drop zone */
        <div
          className={`wreader-drop${over ? " over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => {
            setOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) loadFile(f);
          }}
          onClick={() => {
            fileInputRef.current?.click();
          }}
        >
          <div className="wreader-drop-icon">📖</div>
          <div className="wreader-drop-label">Drop a story file here</div>
          <div className="wreader-drop-sub">.txt · .md · .srt · .fountain</div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.srt,.vtt,.fountain,.screenplay"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
            }}
          />
        </div>
      ) : (
        <>
          {/* Sidebar */}
          <aside className="wreader-sidebar">
            {/* Mode tabs */}
            <div className="wreader-modes">
              {(["book", "screenplay", "subtitles"] as ReadMode[]).map((m) => (
                <button
                  key={m}
                  className={`wreader-mode-btn${mode === m ? " active" : ""}`}
                  onClick={() => {
                    setMode(m);
                    chapterElsRef.current.clear();
                  }}
                >
                  {m === "book" ? "📚" : m === "screenplay" ? "🎬" : "💬"} {m}
                </button>
              ))}
            </div>

            {/* Font size */}
            <div className="wreader-font-ctrl">
              <span className="wreader-font-a-small">A</span>
              <input
                type="range"
                min={12}
                max={22}
                step={1}
                value={fontSize}
                className="wreader-font-slider"
                onChange={(e) => {
                  setFontSize(parseInt(e.target.value, 10));
                }}
              />
              <span className="wreader-font-a-large">A</span>
            </div>

            {/* Sync with player toggle */}
            <button
              className={`wreader-sync-btn${syncPlayer ? " active" : ""}`}
              onClick={() => {
                setSyncPlayer((v) => !v);
              }}
              title="Sync scroll with Waldiez Player (subtitle mode)"
            >
              {syncPlayer ? "🔗" : "🔗"} Sync with Player
            </button>

            {/* Chapter list */}
            {chapters.length > 0 && (
              <div className="wreader-chapters">
                <div className="wreader-chapters-label">Contents</div>
                <div className="wreader-chapters-list">
                  {chapters.map((ch, i) => (
                    <button
                      key={i}
                      className={`wreader-chapter-btn${activeChapter === i ? " active" : ""}`}
                      onClick={() => {
                        scrollToChapter(i);
                      }}
                      title={ch.title}
                    >
                      {ch.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Current file / change */}
            <button
              className="wreader-change-file"
              onClick={() => {
                setContent("");
                setFileName("");
              }}
              title="Load another file"
            >
              <span className="wreader-change-file-name">{fileName}</span>
              <span className="wreader-change-file-hint">change</span>
            </button>
          </aside>

          {/* Content area */}
          <div className="wreader-content" ref={contentAreaRef}>
            {renderContent()}
          </div>
        </>
      )}
    </div>
  );
}
