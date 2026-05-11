/**
 * DocsContent — In-shell documentation browser for LIMEN OS.
 *
 * Left sidebar: hierarchical nav tree of all doc sections.
 * Right panel: rendered markdown with syntax-highlighted code blocks.
 * Top bar: breadcrumb + search.
 *
 * Fetches markdown from /demo/ and inline doc strings. No external deps beyond React.
 */
import { useState, useEffect, useRef } from "react";

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = {
  bg: "#0d0f1a",
  bgCard: "#13172a",
  bgCode: "#0a0c17",
  border: "rgba(99,102,241,0.18)",
  accent: "#6366f1",
  accent2: "#8b5cf6",
  accent3: "#ec4899",
  text: "#c9d1e8",
  textDim: "#6b7399",
  textHead: "#e8ecff",
  link: "#818cf8",
  linkHover: "#a5b4fc",
} as const;

// ── Doc tree ───────────────────────────────────────────────────────────────────
interface DocEntry {
  id: string;
  title: string;
  icon: string;
  url?: string; // external html (docs/) — shown in iframe
  demo?: string; // /demo/*.md — fetched and rendered
  children?: DocEntry[];
}

const DOC_TREE: DocEntry[] = [
  {
    id: "foundation",
    title: "Foundation & Vision",
    icon: "🌌",
    children: [
      {
        id: "philosophy",
        title: "Limen Philosophy",
        icon: "🌌",
        url: "/docs/PHILOSOPHY.html",
      },
      {
        id: "grandmother",
        title: "Grandmother's Guide",
        icon: "👵",
        url: "/docs/guides/GRANDMOTHER_GUIDE.html",
      },
      {
        id: "architecture",
        title: "Architecture Deep Dive",
        icon: "🏗️",
        url: "/docs/architecture/ARCHITECTURE.html",
      },
      {
        id: "tour",
        title: "Interactive Tour",
        icon: "✨",
        demo: "/demo/limen-tour.md",
      },
      {
        id: "getting-started",
        title: "Getting Started",
        icon: "🚀",
        url: "/docs/guides/GETTING_STARTED.html",
      },
    ],
  },
  {
    id: "design",
    title: "Visual & Interaction Design",
    icon: "🎨",
    children: [
      {
        id: "paradigms",
        title: "Paradigm Schema",
        icon: "🎨",
        url: "/docs/design/paradigms.html",
      },
      {
        id: "scenes",
        title: "Scene Specification",
        icon: "🎬",
        url: "/docs/design/scenes.html",
      },
    ],
  },
  {
    id: "apps",
    title: "Applications & Interfaces",
    icon: "🖥️",
    children: [
      {
        id: "shell",
        title: "Shell (Babylon.js + React)",
        icon: "🖥️",
        url: "/docs/apps/shell-frontend.html",
      },
      {
        id: "mobile",
        title: "Mobile Companion",
        icon: "📱",
        url: "/docs/apps/mobile-companion.html",
      },
      {
        id: "tui",
        title: "TUI Interface",
        icon: "⌨️",
        url: "/docs/apps/tui-interface.html",
      },
    ],
  },
  {
    id: "crates",
    title: "Core Crates",
    icon: "❤️",
    children: [
      {
        id: "limen-core",
        title: "limen-core",
        icon: "❤️",
        url: "/docs/crates/limen-core.html",
      },
      {
        id: "limen-voice",
        title: "limen-voice",
        icon: "👂",
        url: "/docs/crates/limen-voice.html",
      },
      {
        id: "limen-ai",
        title: "limen-ai",
        icon: "🧠",
        url: "/docs/crates/limen-ai.html",
      },
      {
        id: "limen-display",
        title: "limen-display",
        icon: "🖼️",
        url: "/docs/crates/limen-display.html",
      },
    ],
  },
  {
    id: "api",
    title: "API Reference",
    icon: "🗺️",
    children: [
      {
        id: "api-overview",
        title: "API Overview",
        icon: "🗺️",
        url: "/docs/api/OVERVIEW.html",
      },
      {
        id: "api-ipc",
        title: "Daemon IPC Protocol",
        icon: "🔌",
        url: "/docs/api/IPC.html",
      },
      {
        id: "api-voice",
        title: "Voice Intent Schemas",
        icon: "🔊",
        url: "/docs/api/VOICE.html",
      },
      {
        id: "api-plugins",
        title: "Plugin API",
        icon: "🧩",
        url: "/docs/api/PLUGINS.html",
      },
      {
        id: "api-wid",
        title: "WID Integration",
        icon: "🆔",
        url: "/docs/api/WID.html",
      },
    ],
  },
  {
    id: "technical",
    title: "Technical & Ops",
    icon: "⚙️",
    children: [
      {
        id: "deployment",
        title: "Deployment & Ops",
        icon: "⚙️",
        url: "/docs/technical/deployment-ops.html",
      },
      {
        id: "hlc-wid",
        title: "WID/HLC Specification",
        icon: "🕐",
        url: "/docs/technical/hlc-wid-spec.html",
      },
      {
        id: "security",
        title: "Security Model",
        icon: "🔒",
        url: "/docs/technical/security-permissions.html",
      },
    ],
  },
];

function flatEntries(): DocEntry[] {
  const result: DocEntry[] = [];
  function walk(entries: DocEntry[]) {
    for (const e of entries) {
      if (e.url || e.demo) result.push(e);
      if (e.children) walk(e.children);
    }
  }
  walk(DOC_TREE);
  return result;
}
const FLAT = flatEntries();

// ── Simple markdown → HTML renderer ───────────────────────────────────────────
function renderMarkdown(md: string): string {
  let html = md
    // Escape HTML entities first
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // Fenced code blocks
    .replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (_m, lang, code) =>
        `<pre><code class="lang-${lang}">${code.trimEnd()}</code></pre>`,
    )
    // H1-H4
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Horizontal rule
    .replace(/^---+$/gm, "<hr>")
    // Blockquote
    .replace(/^&gt; (.+)$/gm, "<blockquote><p>$1</p></blockquote>")
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // Tables (basic)
    .replace(/((?:^\|.+\|\n)+)/gm, (table) => {
      const rows = table.trim().split("\n");
      const isHeader = rows[1]?.match(/^\|[-| :]+\|$/);
      let out = "<table>";
      rows.forEach((row, i) => {
        if (i === 1 && isHeader) return;
        const cells = row
          .split("|")
          .filter((_, ci) => ci > 0 && ci < row.split("|").length - 1);
        const tag = i === 0 && isHeader ? "th" : "td";
        out += `<tr>${cells.map((c) => `<${tag}>${c.trim()}</${tag}>`).join("")}</tr>`;
      });
      out += "</table>";
      return out;
    })
    // Unordered lists
    .replace(/((?:^[-*] .+\n?)+)/gm, (block) => {
      const items = block
        .trim()
        .split("\n")
        .map((l) => `<li>${l.replace(/^[-*] /, "")}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    })
    // Ordered lists
    .replace(/((?:^\d+\. .+\n?)+)/gm, (block) => {
      const items = block
        .trim()
        .split("\n")
        .map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`)
        .join("");
      return `<ol>${items}</ol>`;
    })
    // Paragraphs
    .replace(/\n\n([^<\n].+?)(?=\n\n|$)/gs, "\n<p>$1</p>")
    // Line breaks inside paragraphs
    .replace(/([^>])\n([^<\n])/g, "$1<br>$2");

  return html;
}

// ── Sidebar tree item ──────────────────────────────────────────────────────────
function TreeSection({
  section,
  selected,
  onSelect,
}: {
  section: DocEntry;
  selected: string;
  onSelect: (e: DocEntry) => void;
}) {
  const [open, setOpen] = useState(
    section.children?.some((c) => c.id === selected) ?? false,
  );

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 12px",
          background: "none",
          border: "none",
          color: C.textDim,
          fontSize: "0.72rem",
          fontWeight: 700,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ opacity: 0.5, fontSize: "0.6rem" }}>
          {open ? "▼" : "▶"}
        </span>
        {section.icon} {section.title}
      </button>

      {open && section.children && (
        <div style={{ paddingLeft: 8 }}>
          {section.children.map((child) => (
            <button
              key={child.id}
              onClick={() => onSelect(child)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 7,
                padding: "5px 12px",
                background: selected === child.id ? `${C.accent}22` : "none",
                border: "none",
                borderLeft:
                  selected === child.id
                    ? `2px solid ${C.accent}`
                    : "2px solid transparent",
                color: selected === child.id ? C.link : C.text,
                fontSize: "0.83rem",
                cursor: "pointer",
                textAlign: "left",
                borderRadius: "0 4px 4px 0",
                transition: "background 0.15s, color 0.15s",
              }}
            >
              <span>{child.icon}</span>
              <span style={{ flex: 1 }}>{child.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function DocsContent() {
  const [selected, setSelected] = useState<DocEntry>(FLAT[3]); // default: tour
  const [search, setSearch] = useState("");
  const [mdContent, setMdContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Load markdown for demo entries
  useEffect(() => {
    let cancelled = false;
    const demo = selected.demo;
    const title = selected.title;
    if (!demo) {
      Promise.resolve().then(() => {
        if (!cancelled) setMdContent(null);
      });
      return () => {
        cancelled = true;
      };
    }
    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });
    fetch(demo)
      .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
      .then((text) => {
        if (!cancelled) {
          setMdContent(text);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMdContent(
            `# ${title}\n\n*Content not found — run \`make dev\` to serve files.*`,
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Search filter
  const filteredTree: DocEntry[] = search.trim()
    ? DOC_TREE.flatMap((section) => {
        const children = (section.children ?? []).filter((c) =>
          c.title.toLowerCase().includes(search.toLowerCase()),
        );
        if (children.length === 0) return [];
        return [{ ...section, children }] satisfies DocEntry[];
      })
    : DOC_TREE;


  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: C.bg,
        color: C.text,
        fontFamily:
          '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        overflow: "hidden",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px",
          borderBottom: `1px solid ${C.border}`,
          background: C.bgCard,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: "1rem" }}>📚</span>
        <span
          style={{ fontWeight: 600, fontSize: "0.9rem", color: C.textHead }}
        >
          Documentation
        </span>
        <span style={{ color: C.textDim, fontSize: "0.8rem" }}>·</span>
        <span style={{ color: C.textDim, fontSize: "0.8rem" }}>
          {selected.icon} {selected.title}
        </span>
        <div style={{ flex: 1 }} />
        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search docs…"
          style={{
            padding: "4px 10px",
            background: C.bg,
            border: `1px solid ${C.border}`,
            borderRadius: 6,
            color: C.text,
            fontSize: "0.8rem",
            outline: "none",
            width: 180,
          }}
        />
      </div>

      {/* Body: sidebar + content */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <div
          style={{
            width: 230,
            flexShrink: 0,
            borderRight: `1px solid ${C.border}`,
            overflowY: "auto",
            padding: "8px 0",
            background: C.bgCard,
          }}
        >
          {filteredTree.map((section) => (
            <TreeSection
              key={section.id}
              section={section}
              selected={selected.id}
              onSelect={setSelected}
            />
          ))}
        </div>

        {/* Content panel */}
        <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
          {loading && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: C.textDim,
                fontSize: "0.85rem",
              }}
            >
              Loading…
            </div>
          )}

          {/* Markdown render */}
          {!loading && selected.demo && mdContent && (
            <>
              <DocStyles />
              <div
                className="docs-md"
                style={{
                  height: "100%",
                  overflowY: "auto",
                  padding: "24px 32px",
                }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(mdContent) }}
              />
            </>
          )}

          {/* External HTML in iframe */}
          {!loading && selected.url && (
            <iframe
              ref={iframeRef}
              src={selected.url}
              style={{
                width: "100%",
                height: "100%",
                border: "none",
                background: C.bg,
              }}
              title={selected.title}
            />
          )}

          {/* Placeholder when neither */}
          {!loading && !selected.url && !selected.demo && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: C.textDim,
                fontSize: "0.85rem",
              }}
            >
              Select a document from the sidebar
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inline styles for markdown render ─────────────────────────────────────────
const DOC_MD_CSS = `
.docs-md { color: ${C.text}; font-size: 14px; line-height: 1.7; }
.docs-md h1 { font-size: 1.8rem; font-weight: 600; color: ${C.textHead}; border-bottom: 2px solid ${C.accent}; padding-bottom: .4rem; margin: 0 0 1.2rem; background: linear-gradient(90deg, ${C.accent}, ${C.accent2}, ${C.accent3}); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.docs-md h2 { font-size: 1.15rem; color: #a5b4fc; border-bottom: 1px solid ${C.border}; padding-bottom: .25rem; margin: 2rem 0 .8rem; }
.docs-md h3 { font-size: 1rem; color: #c4b5fd; margin: 1.5rem 0 .5rem; }
.docs-md h4 { font-size: .9rem; color: ${C.textDim}; margin: 1.2rem 0 .4rem; }
.docs-md p  { margin: .7rem 0; }
.docs-md a  { color: ${C.link}; text-decoration: none; }
.docs-md a:hover { color: ${C.linkHover}; text-decoration: underline; }
.docs-md code { background: ${C.bgCode}; color: #c4b5fd; padding: .1em .4em; border-radius: 4px; font-size: .87em; border: 1px solid ${C.border}; font-family: "JetBrains Mono","SFMono-Regular",Consolas,monospace; }
.docs-md pre { background: ${C.bgCode}; border: 1px solid ${C.border}; border-left: 3px solid ${C.accent}; padding: 1rem 1.2rem; border-radius: 8px; overflow-x: auto; margin: 1rem 0; }
.docs-md pre code { background: transparent; padding: 0; border: none; color: ${C.text}; font-size: .85em; -webkit-text-fill-color: ${C.text}; }
.docs-md blockquote { border-left: 3px solid ${C.accent2}; margin: 1rem 0; padding: .5rem 1rem; background: ${C.bgCard}; border-radius: 0 6px 6px 0; color: ${C.textDim}; font-style: italic; }
.docs-md blockquote p { margin: 0; }
.docs-md table { border-collapse: collapse; width: 100%; margin: 1.2rem 0; font-size: .9em; }
.docs-md th, .docs-md td { border: 1px solid ${C.border}; padding: .5rem .9rem; text-align: left; }
.docs-md th { background: ${C.bgCard}; color: ${C.textHead}; font-weight: 600; font-size: .8em; letter-spacing: .03em; text-transform: uppercase; }
.docs-md tr:nth-child(even) td { background: rgba(99,102,241,.03); }
.docs-md ul, .docs-md ol { padding-left: 1.4rem; }
.docs-md li { margin: .25rem 0; }
.docs-md hr { border: 0; border-top: 1px solid ${C.border}; margin: 2rem 0; }
.docs-md strong { color: ${C.textHead}; }
`;

function DocStyles() {
  return <style>{DOC_MD_CSS}</style>;
}

export default DocsContent;
