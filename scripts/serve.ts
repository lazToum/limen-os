#!/usr/bin/env bun
/// <reference types="bun" />
/**
 * LIMEN OS — Static SPA server (Bun)
 *
 * Serves apps/shell/dist/ as a Single Page Application:
 *   - /assets/**  → long-lived immutable cache
 *   - known files → exact match + correct MIME type
 *   - everything else → index.html  (SPA client-side routing)
 *
 * Run:
 *   bun scripts/serve.ts
 *
 * Env:
 *   LIMEN_DIST  path to built dist dir  (default: ../apps/shell/dist)
 *   PORT          HTTP port               (default: 1420)
 *   HOST          bind address            (default: 0.0.0.0)
 */

// @ts-nocheck
import { join, extname, normalize } from "path";
import { existsSync, readdirSync, statSync, readFileSync } from "fs";
import type { ServerWebSocket } from "bun";

const SCRIPT_DIR = new URL(".", import.meta.url).pathname;
const DIST =
  process.env.LIMEN_DIST ?? join(SCRIPT_DIR, "..", "apps", "shell", "dist");
const WALDIEZ_STAGING =
  process.env.WALDIEZ_STAGING ?? join(SCRIPT_DIR, "..", "waldiez-staging");
const PLAYER_DIST =
  process.env.PLAYER_DIST ?? join(DIST, "player");
const PORT = Number(process.env.PORT ?? 1420);
const HOST = process.env.HOST ?? "0.0.0.0";

if (!existsSync(DIST)) {
  console.error(`✗ dist/ not found: ${DIST}`);
  console.error(`  Run: cd apps/shell && bun run build`);
  process.exit(1);
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json",
};

function getMime(path: string): string {
  return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}

// Rewrite root-relative asset paths in player index.html to /player/… so the
// SPA works whether it was built with VITE_BASE_PATH=/player/ or base="/".
function patchPlayerHtml(html: string): string {
  return (
    html
      // <script src="/...">  →  <script src="/player/...">
      .replace(/(<script\b[^>]*\ssrc=")\/(?!player\/)/g, "$1/player/")
      // <link href="/...">  →  <link href="/player/...">
      .replace(/(<link\b[^>]*\shref=")\/(?!player\/)/g, "$1/player/")
      // <meta content="/...webmanifest"> and similar
      .replace(
        /(<meta\b[^>]*\scontent=")\/(?!player\/)([^"]*\.(?:webmanifest|json)")/g,
        "$1/player/$2",
      )
      // SW inline registration: registerSW('/registerSW.js') → registerSW('/player/registerSW.js')
      .replace(/'\/registerSW\.js'/g, "'/player/registerSW.js'")
  );
}

const INDEX_PATH = join(DIST, "index.html");
const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache, no-store, must-revalidate";

// Headers that prevent framing — we strip these when proxying so the shell
// can embed any URL in its browser windows.
const BLOCK_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
]);

function buildNavigationPatch(proxyBase: string): string {
  return `
<script>
(() => {
  const proxyBase = ${JSON.stringify(proxyBase)};
  const proxied = (value) => {
    if (!value) return "";
    const resolved = new URL(value, document.baseURI);
    if (!/^https?:$/i.test(resolved.protocol)) return resolved.toString();
    return proxyBase + encodeURIComponent(resolved.toString());
  };
  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!href || href.startsWith("#") || /^(javascript:|mailto:|tel:)/i.test(href)) return;
    if (anchor.hasAttribute("download") || anchor.target === "_blank") return;
    event.preventDefault();
    window.location.assign(proxied(href));
  }, true);
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const method = (form.method || "get").toLowerCase();
    if (method !== "get") return;
    event.preventDefault();
    const action = form.getAttribute("action") || window.location.href;
    const target = new URL(action, document.baseURI);
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      target.searchParams.append(key, typeof value === "string" ? value : value.name);
    }
    window.location.assign(proxied(target.toString()));
  }, true);
})();
</script>`;
}

async function handleFrameProxy(reqUrl: URL): Promise<Response> {
  const target = reqUrl.searchParams.get("url");
  if (!target) {
    return new Response("Missing ?url= parameter", { status: 400 });
  }
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }
  // Only proxy http(s)
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new Response("Only http/https URLs allowed", { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (LimenOS Shell/1.0) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Proxy fetch failed: ${msg}`, { status: 502 });
  }

  // Forward all headers except the blocking ones + hop-by-hop headers.
  // Also strip content-encoding: Bun's fetch() already decompresses the body,
  // so forwarding the encoding header causes the browser to double-decompress.
  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "proxy-authorization",
    "proxy-authenticate",
    "upgrade",
    "content-encoding",
  ]);
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    const lkey = key.toLowerCase();
    if (BLOCK_HEADERS.has(lkey)) return;
    if (hopByHop.has(lkey)) return;
    headers.set(key, value);
  });
  headers.set("X-Proxied-By", "limen-os");
  headers.set("Access-Control-Allow-Origin", "*");

  // Fix MIME type for TypeScript/JS served as text/plain (JupyterLab 4.x / Vite quirk).
  // Browsers block <script type="module"> with wrong MIME types.
  let ct = headers.get("content-type") ?? "";
  if (!ct || ct.startsWith("text/plain")) {
    const path = parsed.pathname;
    if (/\.(ts|tsx|mts|js|mjs|cjs)$/.test(path)) {
      headers.set("content-type", "application/javascript; charset=utf-8");
      ct = "application/javascript; charset=utf-8";
    } else if (path.endsWith(".css")) {
      headers.set("content-type", "text/css; charset=utf-8");
      ct = "text/css; charset=utf-8";
    }
  }

  // For HTML responses: inject <base href> so regular resources load from
  // the original server, AND rewrite <script type="module" src="..."> to
  // route through this proxy — fixing MIME types for TypeScript modules.
  if (ct.includes("text/html")) {
    const origin = `${parsed.protocol}//${parsed.host}`;
    const baseDir = `${origin}${parsed.pathname.replace(/[^/]*$/, "")}`;
    const html = await upstream.text();
    const proxyOrigin = `${parsed.protocol === "https:" ? "https:" : "http:"}//localhost:${PORT}`;

    // Step 1: inject <base href>
    const withBase = html.replace(
      /(<head[^>]*>)/i,
      `$1<base href="${baseDir}">${buildNavigationPatch(`${proxyOrigin}/frame-proxy?url=`)}`,
    );

    // Step 2: rewrite <script type="module" src="..."> through this proxy
    const patched = withBase.replace(
      /<script([^>]*type=["']module["'][^>]*)>/gi,
      (match: string, attrs: string) => {
        const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
        if (!srcMatch) return match;
        const src = srcMatch[1];
        const abs =
          src.startsWith("http://") || src.startsWith("https://")
            ? src
            : src.startsWith("/")
              ? `${origin}${src}`
              : `${baseDir}${src}`;
        const proxied = `${proxyOrigin}/frame-proxy?url=${encodeURIComponent(abs)}`;
        return match.replace(srcMatch[0], `src="${proxied}"`);
      },
    );

    headers.delete("content-length");
    return new Response(patched, { status: upstream.status, headers });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
}

const SYNAPSD_AI_URL = `http://localhost:1421/ai`;
const SYNAPSD_HEALTH_URL = `http://localhost:1421/health`;

async function handleAiProxy(req: Request): Promise<Response> {
  try {
    const upstream = await fetch(SYNAPSD_AI_URL, {
      method: req.method,
      headers: { "Content-Type": "application/json" },
      body: req.body,
    });
    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleHealthProxy(): Promise<Response> {
  try {
    const upstream = await fetch(SYNAPSD_HEALTH_URL);
    const data = await upstream.text();
    return new Response(data, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handleHaHealth(): Promise<Response> {
  const result: Record<string, unknown> = { ha_origin: HA_ORIGIN };
  try {
    const res = await fetch(`${HA_ORIGIN}/api/config`, {
      signal: AbortSignal.timeout(5000),
    });
    result.http_status = res.status;
    result.http_ok = res.ok || res.status === 401; // 401 = HA is up, just no token
    if (res.ok) {
      const json = await res.json().catch(() => null);
      if (json && typeof json === "object") {
        result.ha_version = (json as Record<string, unknown>).version;
        result.ha_name = (json as Record<string, unknown>).location_name;
      }
    }
  } catch (e) {
    result.http_ok = false;
    result.http_error = String(e);
  }
  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

// ── Filesystem API ────────────────────────────────────────────────────────────

interface FsEntry {
  name: string;
  path: string;
  kind: "dir" | "file";
  ext: string;
  size?: number;
  modified?: number;
}

/** Normalise and validate a path — must be absolute, no traversal. */
function safePath(raw: string | null): string | null {
  if (!raw) return null;
  const p = normalize(raw);
  if (!p.startsWith("/") || p.includes("..")) return null;
  return p;
}

function handleFsList(url: URL): Response {
  const p = safePath(url.searchParams.get("path"));
  if (!p)
    return new Response(JSON.stringify({ error: "bad path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  try {
    const dirents = readdirSync(p, { withFileTypes: true });
    const entries: FsEntry[] = [];
    for (const d of dirents) {
      if (d.name.startsWith(".")) continue; // hide dotfiles
      const full = join(p, d.name);
      const isDir = d.isDirectory();
      let size: number | undefined;
      let modified: number | undefined;
      try {
        const st = statSync(full);
        size = isDir ? undefined : st.size;
        modified = Math.floor(st.mtimeMs / 1000);
      } catch {
        /* permission error — skip metadata */
      }
      const ext = isDir
        ? ""
        : d.name.includes(".")
          ? d.name.split(".").pop()!.toLowerCase()
          : "";
      entries.push({
        name: d.name,
        path: full,
        kind: isDir ? "dir" : "file",
        ext,
        size,
        modified,
      });
    }
    // dirs first, then alphabetical
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return new Response(JSON.stringify(entries), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function handleFsRead(url: URL): Response {
  const p = safePath(url.searchParams.get("path"));
  if (!p)
    return new Response(JSON.stringify({ error: "bad path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  try {
    const buf = readFileSync(p);
    if (buf.length > 256 * 1024)
      return new Response(
        JSON.stringify({ text: "[File too large to preview]" }),
        { headers: { "Content-Type": "application/json" } },
      );
    const text = buf.toString("utf8");
    return new Response(JSON.stringify({ text }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ── Web search API ────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  description: string;
  favicon: string;
}

function faviconUrl(url: string): string {
  try {
    const h = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${h}&sz=32`;
  } catch {
    return "";
  }
}

/** Parse DuckDuckGo HTML results page → SearchResult[]. */
function parseDDG(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  // Each result block: <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=URL&rut=...">TITLE</a>
  const linkRe =
    /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = snippetRe.exec(html)) !== null) {
    snippets.push((sm[1] ?? "").replace(/<[^>]+>/g, "").trim());
  }
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1] ?? "";
    const title = (m[2] ?? "").replace(/<[^>]+>/g, "").trim();
    // href is like //duckduckgo.com/l/?uddg=ENCODED_URL&rut=...
    try {
      const u = new URL("https:" + href);
      const uddg = u.searchParams.get("uddg");
      if (uddg && title) {
        const targetUrl = decodeURIComponent(uddg);
        results.push({
          title,
          url: targetUrl,
          description: snippets[i] ?? "",
          favicon: faviconUrl(targetUrl),
        });
        i++;
      }
    } catch {
      // skip
    }
    if (results.length >= 10) break;
  }
  return results;
}

async function handleSearch(reqUrl: URL): Promise<Response> {
  const q = reqUrl.searchParams.get("q")?.trim();
  if (!q) {
    return new Response(JSON.stringify({ error: "Missing q" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const json = (results: SearchResult[]) =>
    new Response(JSON.stringify({ results }), {
      headers: { "Content-Type": "application/json" },
    });

  // ── 1. Tavily ──────────────────────────────────────────────────────────────
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query: q, num_results: 10 }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ title: string; url: string; content: string }>;
        };
        if (data.results?.length) {
          return json(
            data.results.map((r) => ({
              title: r.title,
              url: r.url,
              description: r.content,
              favicon: faviconUrl(r.url),
            })),
          );
        }
      }
    } catch {
      // fall through
    }
  }

  // ── 2. Google Custom Search ────────────────────────────────────────────────
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_CX;
  if (googleKey && googleCx) {
    try {
      const gUrl = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(q)}&num=10`;
      const res = await fetch(gUrl, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = (await res.json()) as {
          items?: Array<{ title: string; link: string; snippet: string }>;
        };
        if (data.items?.length) {
          return json(
            data.items.map((item) => ({
              title: item.title,
              url: item.link,
              description: item.snippet,
              favicon: faviconUrl(item.link),
            })),
          );
        }
      }
    } catch {
      // fall through
    }
  }

  // ── 3. Brave Search API ────────────────────────────────────────────────────
  const braveKey = process.env.BRAVE_SEARCH_API_KEY;
  if (braveKey) {
    try {
      const res = await fetch(
        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10`,
        {
          headers: {
            "X-Subscription-Token": braveKey,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (res.ok) {
        const data = (await res.json()) as {
          web?: {
            results?: Array<{
              title: string;
              url: string;
              description: string;
            }>;
          };
        };
        if (data.web?.results?.length) {
          return json(
            data.web.results.map((r) => ({
              title: r.title,
              url: r.url,
              description: r.description ?? "",
              favicon: faviconUrl(r.url),
            })),
          );
        }
      }
    } catch {
      // fall through
    }
  }

  // ── 4. DuckDuckGo HTML scrape (no key required) ────────────────────────────
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (res.ok) {
      const html = await res.text();
      const results = parseDDG(html);
      if (results.length) return json(results);
    }
  } catch {
    // fall through
  }

  return new Response(
    JSON.stringify({
      results: [],
      error:
        "No search providers available. Set TAVILY_API_KEY, GOOGLE_SEARCH_API_KEY+GOOGLE_SEARCH_CX, or BRAVE_SEARCH_API_KEY in your .env.",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function handleSysinfo(): Response {
  try {
    let cpuPct = 0;
    let memUsedGB = 0;
    let memTotalGB = 0;

    // CPU: read /proc/stat twice 200ms apart for accurate idle delta
    const parseStat = () => {
      const line = readFileSync("/proc/stat", "utf8").split("\n")[0];
      const n = line.split(/\s+/).slice(1).map(Number);
      const idle = n[3] + (n[4] ?? 0); // idle + iowait
      const total = n.reduce((a, b) => a + b, 0);
      return { idle, total };
    };
    const s1 = parseStat();
    // synchronous 200ms wait via spin — acceptable for a lightweight status endpoint
    const t0 = Date.now();
    while (Date.now() - t0 < 200) {
      /* spin */
    }
    const s2 = parseStat();
    const totalDelta = s2.total - s1.total;
    const idleDelta = s2.idle - s1.idle;
    cpuPct = totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;

    // Memory: /proc/meminfo
    const mem = readFileSync("/proc/meminfo", "utf8");
    const getKB = (label: string) => {
      const m = mem.match(new RegExp(`^${label}:\\s+(\\d+)`, "m"));
      return m ? Number(m[1]) : 0;
    };
    const total = getKB("MemTotal");
    const avail = getKB("MemAvailable");
    memTotalGB = total / 1024 / 1024;
    memUsedGB = (total - avail) / 1024 / 1024;

    return new Response(
      JSON.stringify({
        cpu: cpuPct,
        mem_used: memUsedGB,
        mem_total: memTotalGB,
      }),
      {
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch {
    return new Response(JSON.stringify({ cpu: 0, mem_used: 0, mem_total: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }
}

// ── Session auth ──────────────────────────────────────────────────────────────
// Replace nginx basic auth with cookie-based sessions. Credentials come from
// LIMEN_AUTH_USER / LIMEN_AUTH_PASS env vars (set in .env on the server).
// Sessions are in-memory; they reset on server restart (acceptable for home use).
const AUTH_USER = process.env.LIMEN_AUTH_USER ?? "limen";
const AUTH_PASS = process.env.LIMEN_AUTH_PASS || "limen";
if (!process.env.LIMEN_AUTH_PASS) {
  console.warn(
    "[auth] ⚠  LIMEN_AUTH_PASS not set — using default password 'limen'. Set it in .env!",
  );
}
const sessions = new Map<string, number>(); // token → expiry ms

function parseCookieToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.trim().split("=", 2);
    if (k?.trim() === "limen_auth") return v?.trim() ?? null;
  }
  return null;
}

function isValidSession(req: Request): boolean {
  const token = parseCookieToken(req.headers.get("cookie"));
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) {
    if (exp) sessions.delete(token);
    return false;
  }
  return true;
}

// Optional TLS — set LIMEN_TLS_CERT + LIMEN_TLS_KEY env vars to enable HTTPS.
// Needed for camera/mic access in Firefox on non-localhost origins.
const TLS_CERT = process.env.LIMEN_TLS_CERT;
const TLS_KEY = process.env.LIMEN_TLS_KEY;
const tlsConfig =
  TLS_CERT && TLS_KEY
    ? { tls: { cert: Bun.file(TLS_CERT), key: Bun.file(TLS_KEY) } }
    : {};

// ── Generic HTTP reverse proxy ────────────────────────────────────────────────
// Used for JupyterLab (/jupyter/) and code-server (/code/) so their ws:// traffic
// goes through our wss:// endpoint, fixing Mixed Content from HTTPS pages.

const JUPYTER_PORT = process.env.JUPYTER_PORT ?? "8888";
const CODE_SERVER_PORT = process.env.CODE_SERVER_PORT ?? "8080";
const HA_PORT = process.env.HA_PORT ?? "8123";
// AgentFlow: monitor server (WS + dashboard) on 8889; REST actor API on 8890.
// 8889 avoids conflict with JupyterLab on 8888.
const AF_PORT = process.env.AF_PORT ?? "8889";
const AF_API_PORT = process.env.AF_API_PORT ?? "8890";
const STUDIO_PORT = process.env.STUDIO_PORT ?? "8001";
const NODERED_PORT = process.env.NODERED_PORT ?? "1880";
const TTYD_PORT = process.env.TTYD_PORT ?? "7681";

const JUPYTER_ORIGIN = `http://127.0.0.1:${JUPYTER_PORT}`;
const CODE_SERVER_ORIGIN = `http://127.0.0.1:${CODE_SERVER_PORT}`;
const HA_ORIGIN = process.env.HA_ORIGIN ?? `http://localhost:${HA_PORT}`;
const AF_ORIGIN = `http://127.0.0.1:${AF_PORT}`;
const AF_API_ORIGIN = `http://127.0.0.1:${AF_API_PORT}`;
const STUDIO_ORIGIN = `http://127.0.0.1:${STUDIO_PORT}`;
const NODERED_ORIGIN = `http://127.0.0.1:${NODERED_PORT}`;
const TTYD_ORIGIN = `http://127.0.0.1:${TTYD_PORT}`;

async function handleReverseProxy(
  req: Request,
  pathname: string,
  upstream: string,
): Promise<Response> {
  const reqUrl = new URL(req.url);
  const target = `${upstream}${pathname}${reqUrl.search}`;
  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "proxy-authorization",
    "proxy-authenticate",
    "upgrade",
    "content-encoding",
  ]);
  const stripResponse = new Set([
    ...hopByHop,
    "x-frame-options",
    "content-security-policy",
    "content-security-policy-report-only",
  ]);

  let upRes: Response;
  try {
    const fwdHeaders = new Headers();
    req.headers.forEach((v, k) => {
      if (!hopByHop.has(k.toLowerCase())) fwdHeaders.set(k, v);
    });
    fwdHeaders.set("host", new URL(upstream).host);
    upRes = await fetch(target, {
      method: req.method,
      headers: fwdHeaders,
      body:
        req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      redirect: "manual", // let browser follow redirects so relative Location URLs work
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`Proxy error: ${msg}`, { status: 502 });
  }

  const headers = new Headers();
  upRes.headers.forEach((v, k) => {
    if (!stripResponse.has(k.toLowerCase())) headers.set(k, v);
  });
  headers.set("access-control-allow-origin", "*");
  headers.delete("content-length"); // body may be re-encoded

  return new Response(upRes.body, { status: upRes.status, headers });
}

// ── Home Assistant reverse proxy ──────────────────────────────────────────────
// Strips the /ha prefix, rewrites Location redirects to stay under /ha/, and
// proxies HA's resource paths (/frontend_latest/, /static/, /auth/, /api/)
// so HA's frontend JS loads over HTTPS without Mixed Content.
async function handleHaProxy(
  req: Request,
  pathname: string,
): Promise<Response> {
  // Strip /ha prefix so HA sees its own root paths
  const haPath =
    pathname === "/ha" || pathname === "/ha/" ? "/" : pathname.slice(3);
  const reqUrl = new URL(req.url);
  const target = `${HA_ORIGIN}${haPath}${reqUrl.search}`;

  const hopByHop = new Set([
    "connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "proxy-authorization",
    "proxy-authenticate",
    "upgrade",
    "content-encoding",
  ]);
  const stripResponse = new Set([
    ...hopByHop,
    "x-frame-options",
    "content-security-policy",
    "content-security-policy-report-only",
  ]);

  let upRes: Response;
  try {
    const fwdHeaders = new Headers();
    req.headers.forEach((v, k) => {
      if (!hopByHop.has(k.toLowerCase())) fwdHeaders.set(k, v);
    });
    fwdHeaders.set("host", new URL(HA_ORIGIN).host);
    // Rewrite Origin + Referer so HA's CSRF check passes.
    // HA rejects auth requests whose Origin doesn't match its own origin.
    fwdHeaders.set("origin", HA_ORIGIN);
    const referer = fwdHeaders.get("referer");
    if (referer) {
      // Replace https://io.waldiez.io/ha with HA_ORIGIN
      fwdHeaders.set(
        "referer",
        referer.replace(/^https?:\/\/[^/]+\/ha/, HA_ORIGIN),
      );
    }
    // Do NOT send X-Forwarded-* to HA — HA rejects requests with these headers
    // from untrusted proxies (returns 400) unless trusted_proxies is configured.
    fwdHeaders.delete("x-forwarded-for");
    fwdHeaders.delete("x-forwarded-proto");
    fwdHeaders.delete("x-forwarded-host");
    fwdHeaders.delete("x-real-ip");
    upRes = await fetch(target, {
      method: req.method,
      headers: fwdHeaders,
      body:
        req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      redirect: "manual", // rewrite Location instead of following
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(`HA proxy error: ${msg}`, { status: 502 });
  }

  const headers = new Headers();
  upRes.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (stripResponse.has(lk)) return;
    if (lk === "location") {
      // Rewrite absolute HA URLs to stay under /ha/ so the browser stays proxied
      let loc = v;
      if (loc.startsWith(HA_ORIGIN)) loc = "/ha" + loc.slice(HA_ORIGIN.length);
      else if (loc.startsWith("/") && !loc.startsWith("/ha")) loc = "/ha" + loc;
      headers.set("location", loc);
      return;
    }
    headers.set(k, v);
  });
  headers.set("access-control-allow-origin", "*");
  headers.delete("content-length");

  const noBody = upRes.status === 204 || upRes.status === 304;
  const ct = headers.get("content-type") ?? "";

  // For HTML responses: inject a script that clears any stale hassUrl from localStorage.
  // When HA was accessed directly at http://homeassistant:8123, it stored hassUrl pointing
  // there. Now that HA is proxied through /ha/, HA's JS must use the proxy origin for WS.
  if (ct.includes("text/html") && !noBody) {
    const html = await upRes.text();
    // Clear stale HA tokens: (1) if hassUrl has wrong origin, (2) if token fails /api/config (401 = invalid)
    const fix = `<script>
(async function(){
  var keys=['hassUrl','access_token','refresh_token','token_type','expires_in','expires','clientId'];
  var stored=localStorage.getItem('hassUrl');
  if(stored && !stored.startsWith(location.origin)){
    keys.forEach(function(k){localStorage.removeItem(k);});
    return;
  }
  var token=localStorage.getItem('access_token');
  if(token && stored){
    try{
      var r=await fetch(location.origin+'/api/config',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(3000)});
      if(r.status===401) keys.forEach(function(k){localStorage.removeItem(k);});
    }catch(e){}
  }
})();
</script>`;
    const patched = html.replace(/<head[^>]*>/i, (m) => m + fix);
    headers.delete("content-length");
    return new Response(patched, { status: upRes.status, headers });
  }

  return new Response(noBody ? null : upRes.body, {
    status: upRes.status,
    headers,
  });
}

// Per-connection WebSocket proxy state
type WsProxyData = {
  type:
    | "mqtt"
    | "jupyter"
    | "code"
    | "ha"
    | "ttyd"
    | "companion"
    | "shell-relay"
    | "ha-agent"
    | "ha-local-ws";
  upstream: WebSocket | null;
  queue: (string | Buffer | ArrayBuffer)[];
  upstreamUrl?: string;
  channelId?: string;
};

// Native WebSocket client sets (not proxied)
// companion = Flutter mobile app connections
// shellRelay = shell browser connections listening for companion events
const companionClients = new Set<ServerWebSocket<WsProxyData>>();
const shellRelayClients = new Set<ServerWebSocket<WsProxyData>>();

// ── HA Agent (local Bun proxy → EC2 WebSocket tunnel) ────────────────────────
// ha-agent.ts runs locally, connects here outbound (bypasses NAT).
// serve.ts routes /ha-local/ through this connection; falls back to SSH tunnel (port 8124).
const HA_AGENT_SECRET = process.env.HA_AGENT_SECRET ?? "";
const HA_LOCAL_TUNNEL_PORT = Number(process.env.HA_LOCAL_TUNNEL_PORT ?? 8124);

let haAgentSocket: ServerWebSocket<WsProxyData> | null = null;

type HaAgentPending = {
  resolve: (r: Response) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};
const haAgentPending = new Map<string, HaAgentPending>();
// browser WS channels tunnelled through the agent: channelId → browser ws
const haAgentWsChannels = new Map<string, ServerWebSocket<WsProxyData>>();

function haAgentSend(msg: object) {
  if (haAgentSocket?.readyState === WebSocket.OPEN) {
    haAgentSocket.send(JSON.stringify(msg));
  }
}

async function handleHaLocal(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.slice("/ha-local".length) || "/";

  // Agent connected — route through Bun tunnel
  if (haAgentSocket?.readyState === WebSocket.OPEN) {
    const id = crypto.randomUUID();
    const hopByHop = new Set([
      "connection",
      "keep-alive",
      "transfer-encoding",
      "te",
      "trailer",
      "proxy-authorization",
      "upgrade",
      "content-encoding",
      "host",
    ]);
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => {
      if (!hopByHop.has(k.toLowerCase())) headers[k] = v;
    });
    const body =
      req.method !== "GET" && req.method !== "HEAD"
        ? Buffer.from(await req.arrayBuffer()).toString("base64")
        : null;
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => {
        haAgentPending.delete(id);
        reject(new Error("HA agent timeout"));
      }, 30_000);
      haAgentPending.set(id, { resolve, reject, timer });
      haAgentSend({
        id,
        type: "http",
        method: req.method,
        path: path + url.search,
        headers,
        body,
      });
    }).catch((e) => new Response(String(e), { status: 503 }));
  }

  // Fallback — SSH tunnel on port 8124
  const origin = `http://127.0.0.1:${HA_LOCAL_TUNNEL_PORT}`;
  const r = await handleReverseProxy(req, path + url.search, origin);
  // handleReverseProxy returns 502 when port is not listening — remap to 503 so
  // the shell's reachability probe shows "Service not available" instead of "bad gateway"
  if (r.status === 502) {
    return new Response(
      JSON.stringify({
        error: "Local HA not available",
        hint: "Run: make ha-agent  (or: make ha-tunnel)",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  return r;
}

// MQTT credentials injected server-side so they never appear in the browser bundle.
const MQTT_USER = process.env.LIMEN_MQTT_USER ?? "";
const MQTT_PASS = process.env.LIMEN_MQTT_PASS ?? "";

/**
 * Rewrite an MQTT CONNECT packet to inject username + password.
 * Called by the proxy when the browser sends a bare (no-auth) CONNECT.
 */
function injectMqttCredentials(data: Buffer | ArrayBuffer): Buffer {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (buf.length < 2 || buf[0] !== 0x10) return buf; // not a CONNECT
  if (!MQTT_USER) return buf; // no creds configured

  // Parse existing variable header to extract keep-alive offset
  let pos = 2; // skip fixed header (type + remaining length, assume 1-byte)
  // protocol name len
  const protoLen = (buf[pos] << 8) | buf[pos + 1];
  pos += 2 + protoLen;
  // protocol level (1 byte)
  pos += 1;
  // connect flags — set username (0x80) + password (0x40) bits
  buf[pos] = buf[pos] | 0xc0;
  pos += 1;
  // keep-alive (2 bytes)
  pos += 2;
  // client-id
  const cidLen = (buf[pos] << 8) | buf[pos + 1];
  pos += 2 + cidLen;
  // Insert username + password after client-id
  const userBytes = Buffer.from(MQTT_USER, "utf8");
  const passBytes = Buffer.from(MQTT_PASS, "utf8");
  const extra = Buffer.allocUnsafe(4 + userBytes.length + passBytes.length);
  extra.writeUInt16BE(userBytes.length, 0);
  userBytes.copy(extra, 2);
  extra.writeUInt16BE(passBytes.length, 2 + userBytes.length);
  passBytes.copy(extra, 4 + userBytes.length);

  const newPayload = Buffer.concat([buf.slice(2), extra]);
  // Rewrite remaining-length (assume fits in 1 byte for typical MQTT CONNECT)
  const out = Buffer.allocUnsafe(2 + newPayload.length);
  out[0] = 0x10;
  out[1] = newPayload.length;
  newPayload.copy(out, 2);
  return out;
}

// MQTT over WebSocket proxy — wss://host:1420/mqtt → ws://127.0.0.1:1884/mqtt
// Use 127.0.0.1 explicitly — localhost may resolve to ::1 (IPv6) which Mosquitto rejects.
const MQTT_WS_URL = `ws://127.0.0.1:${process.env.VITE_MQTT_WS_PORT ?? "1884"}/mqtt`;

Bun.serve({
  port: PORT,
  hostname: HOST,
  ...tlsConfig,

  async fetch(
    req: Request,
    server: ReturnType<typeof Bun.serve>,
  ): Promise<Response> {
    const { pathname } = new URL(req.url);

    // ── Auth endpoints ────────────────────────────────────────────────────────
    // GET /limen/auth/check  — used by nginx auth_request; returns 200 or 401
    if (pathname === "/limen/auth/check") {
      return isValidSession(req)
        ? new Response("ok", { status: 200 })
        : new Response("unauthorized", { status: 401 });
    }

    // POST /limen/auth/login  — JSON {user, pass} → sets limen_auth cookie
    if (pathname === "/limen/auth/login" && req.method === "POST") {
      let body: { user?: string; pass?: string } = {};
      try {
        body = (await req.json()) as typeof body;
      } catch {
        /* ignore */
      }
      if (body.user === AUTH_USER && body.pass === AUTH_PASS) {
        const token = crypto.randomUUID();
        sessions.set(token, Date.now() + 24 * 60 * 60 * 1000);
        return new Response(JSON.stringify({ ok: true }), {
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `limen_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
          },
        });
      }
      return new Response(JSON.stringify({ ok: false }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // POST /limen/auth/logout  — clears session cookie
    if (pathname === "/limen/auth/logout" && req.method === "POST") {
      const token = parseCookieToken(req.headers.get("cookie"));
      if (token) sessions.delete(token);
      return new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie": "limen_auth=; Path=/; Max-Age=0",
        },
      });
    }

    // MQTT WebSocket proxy
    if (pathname === "/mqtt-ws" || pathname === "/mqtt") {
      const ok = server.upgrade(req, {
        data: { type: "mqtt", upstream: null, queue: [] } as WsProxyData,
      });
      if (ok) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // JupyterLab reverse proxy — HTTP + WebSocket at /jupyter/
    // JupyterLab must be started with --base-url=/jupyter/
    if (pathname.startsWith("/jupyter/") || pathname === "/jupyter") {
      const isUpgrade =
        req.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (isUpgrade) {
        const wsUrl = `ws://127.0.0.1:${JUPYTER_PORT}${pathname}${new URL(req.url).search}`;
        const ok = server.upgrade(req, {
          data: {
            type: "jupyter",
            upstream: null,
            queue: [],
            upstreamUrl: wsUrl,
          } as WsProxyData,
        });
        if (ok) return undefined as unknown as Response;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return handleReverseProxy(req, pathname, JUPYTER_ORIGIN);
    }

    // code-server reverse proxy — HTTP + WebSocket at /code/
    // Strip /code prefix before forwarding; code-server serves at / with relative links.
    if (pathname.startsWith("/code/") || pathname === "/code") {
      const codePath = pathname.slice(5) || "/";
      const isUpgrade =
        req.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (isUpgrade) {
        const wsUrl = `ws://127.0.0.1:${CODE_SERVER_PORT}${codePath}${new URL(req.url).search}`;
        const ok = server.upgrade(req, {
          data: {
            type: "code",
            upstream: null,
            queue: [],
            upstreamUrl: wsUrl,
          } as WsProxyData,
        });
        if (ok) return undefined as unknown as Response;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return handleReverseProxy(req, codePath, CODE_SERVER_ORIGIN);
    }

    // AgentFlow backend proxy:
    //   /af/api/  → 127.0.0.1:8890  (full actor REST API)
    //   /af/ws    → 127.0.0.1:8889  (monitor server WebSocket)
    //   /af/      → 127.0.0.1:8889  (monitor server dashboard + HTTP)
    if (pathname.startsWith("/af/api/")) {
      return handleReverseProxy(req, pathname.slice(7), AF_API_ORIGIN);
    }
    if (pathname === "/af/ws" || pathname.startsWith("/af/ws/")) {
      const wsUrl = `ws://127.0.0.1:${AF_PORT}/ws${new URL(req.url).search}`;
      const ok = server.upgrade(req, {
        data: {
          type: "code",
          upstream: null,
          queue: [],
          upstreamUrl: wsUrl,
        } as WsProxyData,
      });
      if (ok) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }
    if (pathname.startsWith("/af/")) {
      return handleReverseProxy(req, pathname.slice(3), AF_ORIGIN);
    }

    // Waldiez Studio proxy — /studio/ → http://127.0.0.1:STUDIO_PORT/
    // config.js is intercepted to inject baseUrl="/studio" so the studio JS
    // prefixes all its /api/ and /ws/ calls with /studio/, keeping them out of
    // HA's root-level API catch-all below.
    if (pathname.startsWith("/studio/") || pathname === "/studio") {
      const isUpgrade =
        req.headers.get("upgrade")?.toLowerCase() === "websocket";
      const studioPath =
        pathname === "/studio" ? "/" : "/" + pathname.slice("/studio/".length);
      // Intercept config.js — inject baseUrl so studio API/WS calls stay under /studio/
      if (studioPath === "/config.js") {
        return new Response(
          'window.__WALDIEZ_STUDIO_CONFIG__ = {"baseUrl":"/studio","apiPrefix":"/api","wsPrefix":"/ws","vsPrefix":"/vs"};',
          {
            headers: {
              "Content-Type": "application/javascript; charset=utf-8",
              "Cache-Control": NO_CACHE,
            },
          },
        );
      }
      if (isUpgrade) {
        const wsUrl = `ws://127.0.0.1:${STUDIO_PORT}${studioPath}${new URL(req.url).search}`;
        const ok = server.upgrade(req, {
          data: {
            type: "code",
            upstream: null,
            queue: [],
            upstreamUrl: wsUrl,
          } as WsProxyData,
        });
        if (ok) return undefined as unknown as Response;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return handleReverseProxy(req, studioPath, STUDIO_ORIGIN);
    }

    // Node-RED proxy — /nodered/ → http://127.0.0.1:1880/
    // Node-RED must be started with httpAdminRoot=/nodered and httpNodeRoot=/nodered
    if (pathname.startsWith("/nodered/") || pathname === "/nodered") {
      const isUpgrade =
        req.headers.get("upgrade")?.toLowerCase() === "websocket";
      const nrPath =
        pathname === "/nodered"
          ? "/"
          : "/" + pathname.slice("/nodered/".length);
      if (isUpgrade) {
        const wsUrl = `ws://127.0.0.1:${NODERED_PORT}${nrPath}${new URL(req.url).search}`;
        const ok = server.upgrade(req, {
          data: {
            type: "code",
            upstream: null,
            queue: [],
            upstreamUrl: wsUrl,
          } as WsProxyData,
        });
        if (ok) return undefined as unknown as Response;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return handleReverseProxy(req, nrPath, NODERED_ORIGIN);
    }

    // Limen TUI — ttyd terminal at /tui/
    // ttyd must be running: ttyd --port 7681 --base-path /tui --writable /opt/limen/bin/limen-tui
    if (pathname.startsWith("/tui/") || pathname === "/tui") {
      const isUpgrade =
        req.headers.get("upgrade")?.toLowerCase() === "websocket";
      const tuiPath =
        pathname === "/tui" ? "/" : "/" + pathname.slice("/tui/".length);
      if (isUpgrade) {
        const wsUrl = `ws://127.0.0.1:${TTYD_PORT}${tuiPath}${new URL(req.url).search}`;
        const ok = server.upgrade(req, {
          data: {
            type: "ttyd",
            upstream: null,
            queue: [],
            upstreamUrl: wsUrl,
          } as WsProxyData,
        });
        if (ok) return undefined as unknown as Response;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return handleReverseProxy(req, tuiPath, TTYD_ORIGIN);
    }

    // Mobile companion WebSocket — Flutter app connects here
    // Protocol: newline-delimited JSON; ping→pong; other events forwarded to shell-relay clients
    if (pathname === "/companion") {
      const ok = server.upgrade(req, {
        data: { type: "companion", upstream: null, queue: [] } as WsProxyData,
      });
      if (ok) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Shell relay WebSocket — shell browser connects here to receive companion events
    if (pathname === "/shell-relay") {
      const ok = server.upgrade(req, {
        data: { type: "shell-relay", upstream: null, queue: [] } as WsProxyData,
      });
      if (ok) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // HA agent WebSocket — ha-agent.ts (local) connects here (outbound, bypasses NAT)
    if (pathname === "/ha-agent") {
      const secret = new URL(req.url).searchParams.get("secret") ?? "";
      if (HA_AGENT_SECRET && secret !== HA_AGENT_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }
      const ok = server.upgrade(req, {
        data: { type: "ha-agent", upstream: null, queue: [] } as WsProxyData,
      });
      if (ok) return undefined as unknown as Response;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Local HA — via Bun agent (preferred) or SSH tunnel fallback (port 8124)
    if (pathname.startsWith("/ha-local/") || pathname === "/ha-local") {
      const isUpgrade =
        req.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (isUpgrade) {
        // If agent is connected, open a tunnelled WS channel; otherwise fail
        if (haAgentSocket?.readyState === WebSocket.OPEN) {
          const localPath = pathname.startsWith("/ha-local/")
            ? pathname.slice("/ha-local".length)
            : "/";
          const channelId = crypto.randomUUID();
          const ok = server.upgrade(req, {
            data: {
              type: "ha-local-ws",
              upstream: null,
              queue: [],
              upstreamUrl: localPath + new URL(req.url).search,
              channelId,
            } as WsProxyData,
          });
          if (ok) return undefined as unknown as Response;
        }
        return new Response("Local HA agent not connected", { status: 503 });
      }
      return handleHaLocal(req);
    }

    // Home Assistant reverse proxy — /ha/ (with prefix stripping + Location rewrite)
    // HA's frontend JS also loads resources from root-level paths (/frontend_latest/,
    // /static/, /auth/, /api/) — proxy those too so everything stays over HTTPS.
    if (pathname.startsWith("/ha/") || pathname === "/ha") {
      const isUpgrade =
        req.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (isUpgrade) {
        const haPath = pathname.startsWith("/ha/") ? pathname.slice(3) : "/";
        const wsUrl = `${HA_ORIGIN.replace(/^http/, "ws")}${haPath}${new URL(req.url).search}`;
        const ok = server.upgrade(req, {
          data: {
            type: "ha",
            upstream: null,
            queue: [],
            upstreamUrl: wsUrl,
          } as WsProxyData,
        });
        if (ok) return undefined as unknown as Response;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return handleHaProxy(req, pathname);
    }
    // HA service worker — return patched version that scopes to /ha/ only.
    // HA service worker scripts.
    // The old HA SW registered at scope / intercepts ALL shell requests.
    // Fix: sw-modern.js → self-unregistering stub (kills existing / registration
    //      on the SW's own background update cycle, no manual intervention needed).
    //      sw-registrar.js → empty (prevents re-registration).
    // HA works fine without offline SW support; it only needs the WebSocket API.
    if (pathname === "/sw-registrar.js") {
      return new Response(
        `/* Limen OS: HA SW registration disabled — prevents scope-/ interception */`,
        {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": NO_CACHE,
          },
        },
      );
    }
    if (pathname === "/sw-modern.js") {
      // Self-unregistering service worker.
      // When Chromium does its background SW byte-diff check it will install this,
      // skipWaiting so it activates immediately, then unregister itself and reload
      // all controlled clients so they load fresh without any SW interception.
      return new Response(
        `/* Limen OS: self-unregistering SW — clears stale HA scope-/ registration */
self.addEventListener('install', function() { self.skipWaiting(); });
self.addEventListener('activate', function() {
  self.registration.unregister().then(function() {
    return self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  }).then(function(clients) {
    clients.forEach(function(c) { try { c.navigate(c.url); } catch(e) {} });
  });
});`,
        {
          headers: {
            "Content-Type": "application/javascript; charset=utf-8",
            "Cache-Control": NO_CACHE,
            // Allow the SW to operate at scope / so it can unregister the old / registration
            "Service-Worker-Allowed": "/",
          },
        },
      );
    }
    // Proxy synapsd AI relay
    if (pathname === "/ai") return handleAiProxy(req);
    if (pathname === "/health") return handleHealthProxy();
    if (pathname === "/health/ha") return handleHaHealth();

    // ── Filesystem / shell API (Limen-own endpoints — must come before HA /api/ catch-all) ──
    if (pathname === "/api/fs/list") return handleFsList(new URL(req.url));
    if (pathname === "/api/fs/read") return handleFsRead(new URL(req.url));
    if (pathname === "/api/shell/sysinfo") return handleSysinfo();
    if (pathname === "/api/search") return handleSearch(new URL(req.url));

    // HA resource paths used by HA's frontend JS (absolute root paths).
    // Now that Limen auth lives at /limen/auth/*, /auth/* and /api/* are unambiguously HA.
    if (
      pathname.startsWith("/frontend_latest/") ||
      pathname.startsWith("/static/") ||
      pathname.startsWith("/auth/") ||
      pathname.startsWith("/hacsfiles/") ||
      pathname === "/manifest.json" ||
      pathname.startsWith("/api/")
    ) {
      const isUpgrade =
        req.headers.get("upgrade")?.toLowerCase() === "websocket";
      if (isUpgrade) {
        const wsUrl = `${HA_ORIGIN.replace(/^http/, "ws")}${pathname}${new URL(req.url).search}`;
        const ok = server.upgrade(req, {
          data: {
            type: "ha",
            upstream: null,
            queue: [],
            upstreamUrl: wsUrl,
          } as WsProxyData,
        });
        if (ok) return undefined as unknown as Response;
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      // handleHaProxy applies HA-specific header fixes (origin rewrite, X-Forwarded-* removal).
      // Prepend /ha so the function strips it back off — path arrives at HA unchanged.
      return handleHaProxy(req, "/ha" + pathname);
    }

    // Frame proxy — used by shell browser windows to embed any URL
    if (pathname === "/frame-proxy") {
      return handleFrameProxy(new URL(req.url));
    }

    // Waldiez Player — static files from player/dist/
    // Supports both VITE_BASE_PATH=/player/ builds and root builds (path-rewrites HTML on the fly)
    if (pathname.startsWith("/player/") || pathname === "/player") {
      const rel =
        pathname === "/player"
          ? "index.html"
          : pathname.slice("/player/".length) || "index.html";
      const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
      const fp = join(PLAYER_DIST, safe);
      if (existsSync(fp) && extname(fp) !== "") {
        const mime = getMime(fp);
        // Rewrite HTML to prefix root-relative asset paths with /player/
        // (handles builds made without VITE_BASE_PATH=/player/)
        if (mime.includes("text/html")) {
          const html = await Bun.file(fp).text();
          const patched = patchPlayerHtml(html);
          return new Response(patched, {
            headers: { "Content-Type": mime, "Cache-Control": NO_CACHE },
          });
        }
        return new Response(Bun.file(fp), {
          headers: {
            "Content-Type": mime,
            "Cache-Control": pathname.startsWith("/player/assets/")
              ? IMMUTABLE
              : NO_CACHE,
          },
        });
      }
      const idx = join(PLAYER_DIST, "index.html");
      if (existsSync(idx)) {
        const html = await Bun.file(idx).text();
        return new Response(patchPlayerHtml(html), {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": NO_CACHE,
          },
        });
      }
      return new Response("Not found", { status: 404 });
    }

    // Waldiez Revived — static files from waldiez-staging/
    if (pathname.startsWith("/waldiez/") || pathname === "/waldiez") {
      const rel =
        pathname === "/waldiez"
          ? "index.html"
          : pathname.slice("/waldiez/".length) || "index.html";
      const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
      const fp = join(WALDIEZ_STAGING, safe);
      if (existsSync(fp) && extname(fp) !== "") {
        const mime = getMime(fp);
        // For HTML, rewrite absolute root paths (/assets/, /icons/) to /waldiez/ prefixed
        if (mime.includes("text/html")) {
          const html = await Bun.file(fp).text();
          const patched = html
            .replace(/src="\/assets\//g, 'src="/waldiez/assets/')
            .replace(/href="\/assets\//g, 'href="/waldiez/assets/')
            .replace(/src="\/icons\//g, 'src="/waldiez/icons/')
            .replace(/href="\/icons\//g, 'href="/waldiez/icons/');
          return new Response(patched, {
            headers: { "Content-Type": mime, "Cache-Control": NO_CACHE },
          });
        }
        return new Response(Bun.file(fp), {
          headers: { "Content-Type": mime, "Cache-Control": NO_CACHE },
        });
      }
      const idx = join(WALDIEZ_STAGING, "index.html");
      if (existsSync(idx)) {
        const html = await Bun.file(idx).text();
        const patched = html.replace(
          /(src|href)="\/(?!waldiez\/)/g,
          '$1="/waldiez/',
        );
        return new Response(patched, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": NO_CACHE,
          },
        });
      }
      return new Response("Not found", { status: 404 });
    }
    const resolved = pathname === "/" ? "/index.html" : pathname;
    const safeResolved = normalize(resolved).replace(/^(\.\.[/\\])+/, "");
    const filePath = join(DIST, safeResolved);
    const indexFilePath = join(DIST, safeResolved, "index.html");

    // Serve exact file match first.
    if (
      existsSync(filePath) &&
      !filePath.endsWith("/") &&
      extname(filePath) !== ""
    ) {
      const isAsset =
        pathname.startsWith("/assets/") ||
        pathname.startsWith("/mobile/assets/");
      return new Response(Bun.file(filePath), {
        headers: {
          "Content-Type": getMime(filePath),
          "Cache-Control": isAsset ? IMMUTABLE : NO_CACHE,
        },
      });
    }

    // Serve nested app roots like /mobile/ from their own index.html
    if (existsSync(indexFilePath)) {
      return new Response(Bun.file(indexFilePath), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": NO_CACHE,
        },
      });
    }

    // SPA fallback — client-side router handles the path
    // Inject __LIMEN_SERVICES__ so the shell uses proxy-friendly URLs:
    //   code: /code/ proxy path (code-server runs with --base-path=/code)
    //   jupyter: /jupyter/ proxy path (avoids mixed-content on HTTPS)
    const spaHtml = await Bun.file(INDEX_PATH).text();
    // SW cleanup: unregister any service worker NOT scoped to /ha/.
    // HA's sw-modern.js registers at scope / and intercepts all shell requests
    // (code, studio, jupyter, etc.).  Reloads once after unregistering so the
    // current page load isn't already tainted by the stale SW.
    const swCleanup = `<script>(function(){if(!navigator.serviceWorker)return;if(sessionStorage.getItem('sw_cleaned'))return;navigator.serviceWorker.getRegistrations().then(function(regs){var dirty=regs.filter(function(r){return r.scope&&!r.scope.endsWith('/ha/');});if(!dirty.length)return;Promise.all(dirty.map(function(r){return r.unregister();})).then(function(){sessionStorage.setItem('sw_cleaned','1');location.reload();});});})();</script>`;
    const svcInject = `${swCleanup}<script>window.__LIMEN_SERVICES__=Object.assign({code:"/code/",jupyter:"/jupyter/"},window.__LIMEN_SERVICES__||{});</script>`;
    const spaPatched = spaHtml.replace(/(<head[^>]*>)/i, `$1${svcInject}`);
    return new Response(spaPatched, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": NO_CACHE,
      },
    });
  },

  websocket: {
    message(ws, msg) {
      const d = ws.data as WsProxyData;

      // HA agent — message from local ha-agent.ts (HTTP response or WS relay)
      if (d.type === "ha-agent") {
        try {
          const m = JSON.parse(
            typeof msg === "string"
              ? msg
              : Buffer.from(msg as ArrayBuffer).toString(),
          ) as Record<string, unknown>;
          if (m.type === "http") {
            const pending = haAgentPending.get(m.id as string);
            if (pending) {
              clearTimeout(pending.timer);
              haAgentPending.delete(m.id as string);
              const body = m.body
                ? Buffer.from(m.body as string, "base64")
                : null;
              const respHeaders = new Headers(
                (m.headers as Record<string, string>) ?? {},
              );
              respHeaders.delete("x-frame-options");
              respHeaders.delete("content-security-policy");
              pending.resolve(
                new Response(body, {
                  status: m.status as number,
                  headers: respHeaders,
                }),
              );
            }
          } else if (m.type === "ws_msg") {
            const ch = haAgentWsChannels.get(m.id as string);
            if (ch?.readyState === WebSocket.OPEN) {
              ch.send(
                m.binary
                  ? Buffer.from(m.data as string, "base64")
                  : (m.data as string),
              );
            }
          } else if (m.type === "ws_close") {
            const ch = haAgentWsChannels.get(m.id as string);
            ch?.close();
            haAgentWsChannels.delete(m.id as string);
          }
        } catch {
          /* ignore malformed */
        }
        return;
      }

      // ha-local-ws — message from browser, relay to agent
      if (d.type === "ha-local-ws") {
        const isBinary = typeof msg !== "string";
        haAgentSend({
          id: d.channelId,
          type: "ws_msg",
          data: isBinary
            ? Buffer.from(msg as ArrayBuffer).toString("base64")
            : msg,
          binary: isBinary,
        });
        return;
      }

      // Native companion handler — no upstream proxy
      if (d.type === "companion") {
        const text =
          typeof msg === "string"
            ? msg
            : Buffer.from(msg as ArrayBuffer).toString("utf8");
        let parsed: Record<string, unknown> = {};
        try {
          parsed = JSON.parse(text);
        } catch {
          /* ignore malformed */
        }
        if (parsed.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        } else {
          // Forward all other events to shell relay clients
          for (const relay of shellRelayClients) {
            if (relay.readyState === WebSocket.OPEN) relay.send(text);
          }
        }
        return;
      }

      // Native shell-relay handler — messages from shell forwarded to companions
      if (d.type === "shell-relay") {
        const text =
          typeof msg === "string"
            ? msg
            : Buffer.from(msg as ArrayBuffer).toString("utf8");
        for (const companion of companionClients) {
          if (companion.readyState === WebSocket.OPEN) companion.send(text);
        }
        return;
      }

      const buf = Buffer.isBuffer(msg) ? msg : Buffer.from(msg as ArrayBuffer);
      const patched =
        d.type === "mqtt" && buf[0] === 0x10 ? injectMqttCredentials(buf) : buf;
      if (d.upstream?.readyState === WebSocket.OPEN) {
        d.upstream.send(patched);
      } else {
        d.queue.push(patched);
      }
    },
    open(ws) {
      const d = ws.data as WsProxyData;
      // Native connections — no upstream needed
      if (d.type === "companion") {
        companionClients.add(ws as ServerWebSocket<WsProxyData>);
        return;
      }
      if (d.type === "shell-relay") {
        shellRelayClients.add(ws as ServerWebSocket<WsProxyData>);
        return;
      }
      if (d.type === "ha-agent") {
        haAgentSocket = ws as ServerWebSocket<WsProxyData>;
        console.log("[ha-agent] Local HA agent connected");
        return;
      }
      if (d.type === "ha-local-ws") {
        haAgentWsChannels.set(d.channelId!, ws as ServerWebSocket<WsProxyData>);
        haAgentSend({ id: d.channelId, type: "ws_open", path: d.upstreamUrl });
        return;
      }
      const url = d.type === "mqtt" ? MQTT_WS_URL : d.upstreamUrl!;
      const protocols = d.type === "mqtt" ? ["mqttv3.1"] : [];
      // For HA WebSocket: set Origin to HA_ORIGIN so HA's CSRF check passes.
      // Bun's WebSocket constructor accepts { headers } as a Bun-specific extension.
      const upstream =
        d.type === "ha"
          ? new WebSocket(url, {
              headers: { origin: new URL(HA_ORIGIN).origin },
            } as never)
          : new WebSocket(url, protocols);
      upstream.binaryType = "arraybuffer";
      d.upstream = upstream;
      upstream.onopen = () => {
        for (const m of d.queue) upstream.send(m);
        d.queue = [];
      };
      upstream.onmessage = (ev) => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(ev.data as string | Buffer);
      };
      upstream.onerror = (e) => {
        console.error(
          `[ws] upstream error (${d.type}) → ${url}:`,
          e instanceof ErrorEvent ? e.message : String(e),
        );
        ws.close(1011, "upstream error");
      };
      upstream.onclose = (e) => {
        if (e.code !== 1000)
          console.error(
            `[ws] upstream closed (${d.type}) code=${e.code} reason=${e.reason}`,
          );
        ws.close();
      };
    },
    close(ws) {
      const d = ws.data as WsProxyData;
      if (d.type === "companion") {
        companionClients.delete(ws as ServerWebSocket<WsProxyData>);
        return;
      }
      if (d.type === "shell-relay") {
        shellRelayClients.delete(ws as ServerWebSocket<WsProxyData>);
        return;
      }
      if (d.type === "ha-agent") {
        if (haAgentSocket === (ws as ServerWebSocket<WsProxyData>))
          haAgentSocket = null;
        console.log("[ha-agent] Local HA agent disconnected");
        for (const [id, p] of haAgentPending) {
          clearTimeout(p.timer);
          p.reject(new Error("Agent disconnected"));
          haAgentPending.delete(id);
        }
        for (const [id, ch] of haAgentWsChannels) {
          ch.close(1001, "Agent disconnected");
          haAgentWsChannels.delete(id);
        }
        return;
      }
      if (d.type === "ha-local-ws") {
        haAgentWsChannels.delete(d.channelId!);
        haAgentSend({ id: d.channelId, type: "ws_close" });
        return;
      }
      d.upstream?.close();
    },
  },

  error(err: Error): Response {
    console.error("[serve]", err.message);
    return new Response("Internal Server Error", { status: 500 });
  },
});

const display = HOST === "0.0.0.0" ? "localhost" : HOST;
const protocol = TLS_CERT && TLS_KEY ? "https" : "http";
console.log(`LIMEN OS  →  ${protocol}://${display}:${PORT}`);
if (TLS_CERT) console.log(`  TLS cert: ${TLS_CERT}`);
console.log(`  dist: ${DIST}`);

// ── code-server HTTPS wrapper ─────────────────────────────────────────────────
// code-server can't serve TLS on HAOS overlayfs (EISDIR). Instead we spin up
// a second Bun server on CODE_SERVER_HTTPS_PORT that transparently proxies all
// HTTP + WebSocket traffic to code-server's HTTP port. The browser loads HTTPS
// so there's no Mixed Content, and code-server's JS sees window.location.host
// = <host>:CODE_SERVER_HTTPS_PORT for correct WebSocket connections.
const CODE_SERVER_HTTPS_PORT = Number(
  process.env.CODE_SERVER_HTTPS_PORT ?? 8081,
);
if (TLS_CERT && TLS_KEY) {
  const csHopByHop = new Set([
    "connection",
    "keep-alive",
    "transfer-encoding",
    "te",
    "trailer",
    "proxy-authorization",
    "proxy-authenticate",
    "upgrade",
    "content-encoding",
  ]);

  type CsWsData = {
    upstream: WebSocket | null;
    queue: (string | Buffer | ArrayBuffer)[];
    wsUrl: string;
  };

  Bun.serve({
    port: CODE_SERVER_HTTPS_PORT,
    hostname: HOST,
    tls: { cert: Bun.file(TLS_CERT), key: Bun.file(TLS_KEY!) },

    fetch(
      req: Request,
      csServer: ReturnType<typeof Bun.serve>,
    ): Response | Promise<Response> {
      const url = new URL(req.url);
      const target = `http://127.0.0.1:${CODE_SERVER_PORT}${url.pathname}${url.search}`;
      if (req.headers.get("upgrade")?.toLowerCase() === "websocket") {
        const wsUrl = `ws://127.0.0.1:${CODE_SERVER_PORT}${url.pathname}${url.search}`;
        const ok = csServer.upgrade(req, {
          data: { upstream: null, queue: [], wsUrl } as CsWsData,
        });
        if (ok) return undefined as unknown as Response;
        return new Response("WS upgrade failed", { status: 400 });
      }
      const fwdHeaders = new Headers();
      req.headers.forEach((v, k) => {
        if (!csHopByHop.has(k.toLowerCase())) fwdHeaders.set(k, v);
      });
      fwdHeaders.set("host", `127.0.0.1:${CODE_SERVER_PORT}`);
      return fetch(target, {
        method: req.method,
        headers: fwdHeaders,
        body:
          req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
        redirect: "follow",
      })
        .then((up) => {
          const headers = new Headers();
          up.headers.forEach((v, k) => {
            const lk = k.toLowerCase();
            if (
              csHopByHop.has(lk) ||
              lk === "x-frame-options" ||
              lk === "content-security-policy" ||
              lk === "content-security-policy-report-only"
            )
              return;
            headers.set(k, v);
          });
          headers.delete("content-length");
          return new Response(up.body, { status: up.status, headers });
        })
        .catch((e: unknown) => new Response(String(e), { status: 502 }));
    },

    websocket: {
      message(ws, msg) {
        const d = ws.data as CsWsData;
        if (d.upstream?.readyState === WebSocket.OPEN)
          d.upstream.send(msg as string | Buffer);
        else d.queue.push(msg as string | Buffer);
      },
      open(ws) {
        const d = ws.data as CsWsData;
        const up = new WebSocket(d.wsUrl);
        up.binaryType = "arraybuffer";
        d.upstream = up;
        up.onopen = () => {
          for (const m of d.queue) up.send(m);
          d.queue = [];
        };
        up.onmessage = (ev) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(ev.data as string);
        };
        up.onerror = () => ws.close(1011, "upstream error");
        up.onclose = () => ws.close();
      },
      close(ws) {
        (ws.data as CsWsData).upstream?.close();
      },
    },

    error(err: Error) {
      return new Response(err.message, { status: 500 });
    },
  });
  console.log(
    `  code-server HTTPS proxy → https://${display}:${CODE_SERVER_HTTPS_PORT}`,
  );
}
