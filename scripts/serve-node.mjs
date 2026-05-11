#!/usr/bin/env node
/**
 * LIMEN OS — SPA server (Node.js, zero external deps)
 * Feature parity with serve.ts for armv7l / non-Bun platforms.
 *
 * Requires: Node.js 18+ (fetch, crypto.randomUUID, AbortSignal.timeout built-in)
 *
 * Run:
 *   node scripts/serve-node.mjs
 *
 * Env: same as serve.ts — PORT, HOST, LIMEN_DIST, LIMEN_AUTH_USER,
 *      LIMEN_AUTH_PASS, HA_PORT, HA_ORIGIN, TTYD_PORT, etc.
 */

import { createServer } from "node:http";
import { createConnection } from "node:net";
import { createHash, randomUUID } from "node:crypto";
import { join, extname, normalize } from "node:path";
import {
  existsSync,
  readdirSync,
  statSync,
  readFileSync,
  createReadStream,
} from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const DIST =
  process.env.LIMEN_DIST ?? join(__dirname, "..", "apps", "shell", "dist");
const PORT = Number(process.env.PORT ?? 1420);
const HOST = process.env.HOST ?? "0.0.0.0";
const AUTH_USER = process.env.LIMEN_AUTH_USER ?? "limen";
const AUTH_PASS = process.env.LIMEN_AUTH_PASS || "limen";
const HA_PORT = process.env.HA_PORT ?? "8123";
const HA_ORIGIN = process.env.HA_ORIGIN ?? `http://localhost:${HA_PORT}`;
const TTYD_PORT = process.env.TTYD_PORT ?? "7681";
const TTYD_ORIGIN = `http://127.0.0.1:${TTYD_PORT}`;

if (!existsSync(DIST)) {
  console.error(`✗ dist/ not found: ${DIST}`);
  console.error(`  Run: cd apps/shell && bun run build`);
  process.exit(1);
}

if (!process.env.LIMEN_AUTH_PASS) {
  console.warn("[auth] ⚠  LIMEN_AUTH_PASS not set — using default 'limen'");
}

// ── MIME ──────────────────────────────────────────────────────────────────────

const MIME = {
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

const IMMUTABLE = "public, max-age=31536000, immutable";
const NO_CACHE = "no-cache, no-store, must-revalidate";

const BLOCK_HEADERS = new Set([
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
]);
const HOP_BY_HOP = new Set([
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

// ── Session auth ──────────────────────────────────────────────────────────────

const sessions = new Map(); // token → expiry ms

function parseCookieToken(cookieHeader) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [k, v] = part.trim().split("=", 2);
    if (k?.trim() === "limen_auth") return v?.trim() ?? null;
  }
  return null;
}

function isValidSession(req) {
  const token = parseCookieToken(req.headers["cookie"] ?? null);
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) {
    if (exp) sessions.delete(token);
    return false;
  }
  return true;
}

// ── Response helpers ──────────────────────────────────────────────────────────

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body ?? ""));
  res.writeHead(status, { "Content-Length": buf.length, ...headers });
  res.end(buf);
}

function sendJSON(res, status, obj, extraHeaders = {}) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": buf.length,
    ...extraHeaders,
  });
  res.end(buf);
}

async function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// ── Static file serving ───────────────────────────────────────────────────────

function serveStatic(req, res, pathname) {
  const rel = normalize(pathname).replace(/^\/+/, "");
  let filePath = join(DIST, rel);

  if (!filePath.startsWith(DIST)) {
    send(res, 403, "Forbidden");
    return;
  }

  // SPA fallback: missing or directory → index.html
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(DIST, "index.html");
  }

  const ext = extname(filePath).toLowerCase();
  const mime = MIME[ext] ?? "application/octet-stream";
  const isAsset = pathname.startsWith("/assets/");

  try {
    const stat = statSync(filePath);
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": isAsset ? IMMUTABLE : NO_CACHE,
      "Content-Length": stat.size,
    });
    createReadStream(filePath).pipe(res);
  } catch (e) {
    send(res, 500, `File error: ${e.message}`);
  }
}

// ── Sysinfo ───────────────────────────────────────────────────────────────────

function handleSysinfo(res) {
  try {
    const parseStat = () => {
      const line = readFileSync("/proc/stat", "utf8").split("\n")[0];
      const n = line.split(/\s+/).slice(1).map(Number);
      const idle = n[3] + (n[4] ?? 0);
      const total = n.reduce((a, b) => a + b, 0);
      return { idle, total };
    };
    const s1 = parseStat();
    const t0 = Date.now();
    while (Date.now() - t0 < 200) { /* spin 200ms for CPU delta */ }
    const s2 = parseStat();
    const totalDelta = s2.total - s1.total;
    const idleDelta = s2.idle - s1.idle;
    const cpu = totalDelta > 0 ? ((totalDelta - idleDelta) / totalDelta) * 100 : 0;

    const mem = readFileSync("/proc/meminfo", "utf8");
    const getKB = (label) => {
      const m = mem.match(new RegExp(`^${label}:\\s+(\\d+)`, "m"));
      return m ? Number(m[1]) : 0;
    };
    const total = getKB("MemTotal");
    const avail = getKB("MemAvailable");
    sendJSON(res, 200, {
      cpu,
      mem_used: (total - avail) / 1024 / 1024,
      mem_total: total / 1024 / 1024,
    });
  } catch {
    sendJSON(res, 200, { cpu: 0, mem_used: 0, mem_total: 0 });
  }
}

// ── Filesystem API ────────────────────────────────────────────────────────────

function safePath(raw) {
  if (!raw) return null;
  const p = normalize(raw);
  if (!p.startsWith("/") || p.includes("..")) return null;
  return p;
}

function handleFsList(res, searchParams) {
  const p = safePath(searchParams.get("path"));
  if (!p) { sendJSON(res, 400, { error: "bad path" }); return; }
  try {
    const dirents = readdirSync(p, { withFileTypes: true });
    const entries = [];
    for (const d of dirents) {
      if (d.name.startsWith(".")) continue;
      const full = join(p, d.name);
      const isDir = d.isDirectory();
      let size, modified;
      try {
        const st = statSync(full);
        size = isDir ? undefined : st.size;
        modified = Math.floor(st.mtimeMs / 1000);
      } catch { /* permission error */ }
      const ext = isDir ? "" : (d.name.includes(".") ? d.name.split(".").pop().toLowerCase() : "");
      entries.push({ name: d.name, path: full, kind: isDir ? "dir" : "file", ext, size, modified });
    }
    entries.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    sendJSON(res, 200, entries);
  } catch (e) {
    sendJSON(res, 500, { error: String(e) });
  }
}

function handleFsRead(res, searchParams) {
  const p = safePath(searchParams.get("path"));
  if (!p) { sendJSON(res, 400, { error: "bad path" }); return; }
  try {
    const buf = readFileSync(p);
    if (buf.length > 256 * 1024) { sendJSON(res, 200, { text: "[File too large to preview]" }); return; }
    sendJSON(res, 200, { text: buf.toString("utf8") });
  } catch (e) {
    sendJSON(res, 500, { error: String(e) });
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

function faviconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
  catch { return ""; }
}

function parseDDG(html) {
  const results = [];
  const linkRe = /<a[^>]+class="result__a"[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippets = [];
  let sm;
  while ((sm = snippetRe.exec(html)) !== null)
    snippets.push((sm[1] ?? "").replace(/<[^>]+>/g, "").trim());
  let i = 0, m;
  while ((m = linkRe.exec(html)) !== null) {
    try {
      const u = new URL("https:" + m[1]);
      const uddg = u.searchParams.get("uddg");
      const title = (m[2] ?? "").replace(/<[^>]+>/g, "").trim();
      if (uddg && title) {
        results.push({ title, url: decodeURIComponent(uddg), description: snippets[i++] ?? "", favicon: faviconUrl(decodeURIComponent(uddg)) });
      }
    } catch { /* skip */ }
    if (results.length >= 10) break;
  }
  return results;
}

async function handleSearch(res, searchParams) {
  const q = searchParams.get("q")?.trim();
  if (!q) { sendJSON(res, 400, { error: "Missing q" }); return; }

  const ok = (results) => sendJSON(res, 200, { results });

  // Tavily
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (tavilyKey) {
    try {
      const r = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: tavilyKey, query: q, num_results: 10 }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const data = await r.json();
        if (data.results?.length) {
          return ok(data.results.map((r) => ({ title: r.title, url: r.url, description: r.content, favicon: faviconUrl(r.url) })));
        }
      }
    } catch { /* fall through */ }
  }

  // DuckDuckGo fallback (no key)
  try {
    const r = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (X11; Linux armv7l) Gecko/20100101 Firefox/120.0", Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const html = await r.text();
      const results = parseDDG(html);
      if (results.length) return ok(results);
    }
  } catch { /* fall through */ }

  ok([]);
}

// ── Frame proxy ───────────────────────────────────────────────────────────────

async function handleFrameProxy(res, searchParams) {
  const target = searchParams.get("url");
  if (!target) { send(res, 400, "Missing ?url="); return; }
  let parsed;
  try { parsed = new URL(target); } catch { send(res, 400, "Invalid URL"); return; }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    send(res, 400, "Only http/https allowed");
    return;
  }
  try {
    const upstream = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (LimenOS Shell/1.0) AppleWebKit/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    const headers = {};
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (!BLOCK_HEADERS.has(lk) && !HOP_BY_HOP.has(lk)) headers[k] = v;
    });
    headers["access-control-allow-origin"] = "*";
    headers["x-proxied-by"] = "limen-os";
    delete headers["content-length"];
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, headers);
    res.end(buf);
  } catch (e) {
    send(res, 502, `Proxy fetch failed: ${e.message}`);
  }
}

// ── Generic reverse proxy ─────────────────────────────────────────────────────

async function handleReverseProxy(req, res, upstreamOrigin, stripPrefix) {
  const url = new URL(req.url, "http://localhost");
  const path = stripPrefix
    ? (url.pathname.slice(stripPrefix.length) || "/")
    : url.pathname;
  const target = `${upstreamOrigin}${path}${url.search}`;

  const fwdHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) fwdHeaders[k] = v;
  }
  fwdHeaders["host"] = new URL(upstreamOrigin).host;

  try {
    const body = req.method !== "GET" && req.method !== "HEAD" ? await readBody(req) : undefined;
    const upstream = await fetch(target, { method: req.method, headers: fwdHeaders, body, redirect: "manual" });
    const STRIP = new Set([...HOP_BY_HOP, ...BLOCK_HEADERS]);
    const headers = {};
    upstream.headers.forEach((v, k) => { if (!STRIP.has(k.toLowerCase())) headers[k] = v; });
    headers["access-control-allow-origin"] = "*";
    delete headers["content-length"];
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, headers);
    res.end(buf);
  } catch (e) {
    send(res, 502, `Proxy error: ${e.message}`);
  }
}

// ── HA reverse proxy ──────────────────────────────────────────────────────────

async function handleHaProxy(req, res, pathname) {
  const haPath = pathname === "/ha" || pathname === "/ha/" ? "/" : pathname.slice(3);
  const url = new URL(req.url, "http://localhost");
  const target = `${HA_ORIGIN}${haPath}${url.search}`;

  const fwdHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) fwdHeaders[k] = v;
  }
  fwdHeaders["host"] = new URL(HA_ORIGIN).host;
  fwdHeaders["origin"] = HA_ORIGIN;
  delete fwdHeaders["x-forwarded-for"];
  delete fwdHeaders["x-forwarded-proto"];
  delete fwdHeaders["x-forwarded-host"];
  delete fwdHeaders["x-real-ip"];

  try {
    const body = req.method !== "GET" && req.method !== "HEAD" ? await readBody(req) : undefined;
    const upstream = await fetch(target, { method: req.method, headers: fwdHeaders, body, redirect: "manual" });
    const STRIP = new Set([...HOP_BY_HOP, ...BLOCK_HEADERS]);
    const headers = {};
    upstream.headers.forEach((v, k) => {
      const lk = k.toLowerCase();
      if (STRIP.has(lk)) return;
      if (lk === "location") {
        let loc = v;
        if (loc.startsWith(HA_ORIGIN)) loc = "/ha" + loc.slice(HA_ORIGIN.length);
        else if (loc.startsWith("/") && !loc.startsWith("/ha")) loc = "/ha" + loc;
        headers["location"] = loc;
        return;
      }
      headers[k] = v;
    });
    headers["access-control-allow-origin"] = "*";
    delete headers["content-length"];

    const noBody = upstream.status === 204 || upstream.status === 304;
    const ct = headers["content-type"] ?? "";
    if (ct.includes("text/html") && !noBody) {
      const html = await upstream.text();
      // Inject script to clear stale HA auth tokens from a different origin
      const fix = `<script>
(async function(){
  var keys=['hassUrl','access_token','refresh_token','token_type','expires_in','expires','clientId'];
  var stored=localStorage.getItem('hassUrl');
  if(stored && !stored.startsWith(location.origin)){keys.forEach(function(k){localStorage.removeItem(k);});return;}
  var token=localStorage.getItem('access_token');
  if(token&&stored){try{var r=await fetch(location.origin+'/api/config',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(3000)});if(r.status===401)keys.forEach(function(k){localStorage.removeItem(k);});}catch(e){}}
})();
</script>`;
      const patched = html.replace(/<head[^>]*>/i, (m) => m + fix);
      const buf = Buffer.from(patched);
      headers["content-length"] = buf.length;
      res.writeHead(upstream.status, headers);
      res.end(buf);
      return;
    }

    const buf = noBody ? Buffer.alloc(0) : Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, headers);
    res.end(buf);
  } catch (e) {
    send(res, 502, `HA proxy error: ${e.message}`);
  }
}

// ── WebSocket proxy (raw TCP pipe, no external deps) ─────────────────────────

function wsAccept(key) {
  return createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function proxyWebSocket(req, socket, head, upstreamUrl) {
  const parsed = new URL(upstreamUrl);
  const defaultPort = parsed.protocol === "wss:" ? 443 : 80;
  const upConn = createConnection({
    host: parsed.hostname,
    port: Number(parsed.port || defaultPort),
  });

  const upLines = [
    `GET ${parsed.pathname}${parsed.search} HTTP/1.1`,
    `Host: ${parsed.host}`,
    `Upgrade: websocket`,
    `Connection: Upgrade`,
    `Sec-WebSocket-Key: ${req.headers["sec-websocket-key"]}`,
    `Sec-WebSocket-Version: ${req.headers["sec-websocket-version"] ?? "13"}`,
  ];
  if (req.headers["sec-websocket-protocol"])
    upLines.push(`Sec-WebSocket-Protocol: ${req.headers["sec-websocket-protocol"]}`);

  upConn.write(upLines.join("\r\n") + "\r\n\r\n");
  if (head?.length) upConn.write(head);

  // Read upstream's 101 response then pipe bidirectionally
  let headerDone = false;
  const buf = [];
  upConn.on("data", (chunk) => {
    if (headerDone) { socket.write(chunk); return; }
    buf.push(chunk);
    const combined = Buffer.concat(buf).toString();
    const idx = combined.indexOf("\r\n\r\n");
    if (idx === -1) return;
    headerDone = true;
    // Forward 101 to client
    const [upHeader, ...rest] = combined.split("\r\n\r\n");
    const clientReply = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${wsAccept(req.headers["sec-websocket-key"])}`,
    ];
    if (req.headers["sec-websocket-protocol"]) {
      clientReply.push(`Sec-WebSocket-Protocol: ${req.headers["sec-websocket-protocol"]}`);
    }
    socket.write(clientReply.join("\r\n") + "\r\n\r\n");
    const remaining = rest.join("\r\n\r\n");
    if (remaining) socket.write(remaining);
    // Pipe: client → upstream
    socket.on("data", (d) => upConn.write(d));
  });

  upConn.on("error", () => socket.destroy());
  upConn.on("close", () => socket.destroy());
  socket.on("error", () => upConn.destroy());
  socket.on("close", () => upConn.destroy());
}

// ── HTTP request router ───────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const { pathname, searchParams } = url;

  try {
    // Auth check
    if (pathname === "/limen/auth/check") {
      return isValidSession(req)
        ? send(res, 200, "ok")
        : send(res, 401, "unauthorized");
    }

    // Login
    if (pathname === "/limen/auth/login" && req.method === "POST") {
      let body = {};
      try { body = JSON.parse(await readBody(req)); } catch { /* ignore */ }
      if (body.user === AUTH_USER && body.pass === AUTH_PASS) {
        const token = randomUUID();
        sessions.set(token, Date.now() + 86400_000);
        return sendJSON(res, 200, { ok: true }, {
          "Set-Cookie": `limen_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400`,
        });
      }
      return sendJSON(res, 401, { ok: false });
    }

    // Logout
    if (pathname === "/limen/auth/logout" && req.method === "POST") {
      const token = parseCookieToken(req.headers["cookie"] ?? null);
      if (token) sessions.delete(token);
      return sendJSON(res, 200, { ok: true }, {
        "Set-Cookie": "limen_auth=; Path=/; Max-Age=0",
      });
    }

    // Sysinfo
    if (pathname === "/api/shell/sysinfo") return handleSysinfo(res);

    // Filesystem
    if (pathname === "/api/fs/list") return handleFsList(res, searchParams);
    if (pathname === "/api/fs/read") return handleFsRead(res, searchParams);

    // Search
    if (pathname === "/api/search") return handleSearch(res, searchParams);

    // Health
    if (pathname === "/health") {
      return sendJSON(res, 200, { ok: true, server: "node" });
    }

    // Frame proxy
    if (pathname === "/frame-proxy") return handleFrameProxy(res, searchParams);

    // HA service worker stubs
    if (pathname === "/sw-registrar.js") {
      return send(res, 200,
        "/* Limen OS: HA SW registration disabled */",
        { "Content-Type": "application/javascript", "Cache-Control": NO_CACHE }
      );
    }
    if (pathname === "/sw-modern.js") {
      return send(res, 200,
        `/* Limen OS: self-unregistering SW */
self.addEventListener('install',function(){self.skipWaiting();});
self.addEventListener('activate',function(){
  self.registration.unregister().then(function(){
    return self.clients.matchAll({includeUncontrolled:true,type:'window'});
  }).then(function(clients){clients.forEach(function(c){try{c.navigate(c.url);}catch(e){}});});
});`,
        { "Content-Type": "application/javascript", "Cache-Control": NO_CACHE, "Service-Worker-Allowed": "/" }
      );
    }

    // HA proxy — /ha/ and HA resource paths
    if (pathname.startsWith("/ha/") || pathname === "/ha") {
      return handleHaProxy(req, res, pathname);
    }
    if (
      pathname.startsWith("/frontend_latest/") ||
      pathname.startsWith("/static/") ||
      pathname.startsWith("/auth/") ||
      pathname.startsWith("/hacsfiles/") ||
      pathname === "/manifest.json" ||
      pathname.startsWith("/api/")
    ) {
      return handleHaProxy(req, res, "/ha" + pathname);
    }

    // TUI (ttyd) proxy
    if (pathname.startsWith("/tui/") || pathname === "/tui") {
      const tuiPath = pathname === "/tui" ? "/" : "/" + pathname.slice("/tui/".length);
      return handleReverseProxy(req, res, TTYD_ORIGIN, pathname.startsWith("/tui/") ? "/tui" : undefined);
    }

    // Limen SPA + assets
    return serveStatic(req, res, pathname);

  } catch (e) {
    console.error("[serve-node] unhandled:", e);
    send(res, 500, "Internal server error");
  }
});

// ── WebSocket upgrade handler ─────────────────────────────────────────────────

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname;

  // HA WebSocket
  if (
    pathname.startsWith("/ha/") ||
    pathname === "/ha" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/")
  ) {
    const haPath = pathname.startsWith("/ha") ? (pathname.slice(3) || "/") : pathname;
    const wsUrl = `${HA_ORIGIN.replace(/^http/, "ws")}${haPath}${url.search}`;
    return proxyWebSocket(req, socket, head, wsUrl);
  }

  // TUI WebSocket
  if (pathname.startsWith("/tui/") || pathname === "/tui") {
    const tuiPath = pathname === "/tui" ? "/" : "/" + pathname.slice("/tui/".length);
    const wsUrl = `ws://127.0.0.1:${TTYD_PORT}${tuiPath}${url.search}`;
    return proxyWebSocket(req, socket, head, wsUrl);
  }

  // Unknown — reject
  socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
  socket.destroy();
});

// ── Start ─────────────────────────────────────────────────────────────────────

server.listen(PORT, HOST, () => {
  console.log(`\n  Limen OS — Node.js server`);
  console.log(`  Listening on  http://${HOST}:${PORT}`);
  console.log(`  Shell SPA     http://localhost:${PORT}/limen/`);
  console.log(`  Dist          ${DIST}\n`);
});

server.on("error", (e) => {
  console.error("[serve-node] server error:", e.message);
  process.exit(1);
});
