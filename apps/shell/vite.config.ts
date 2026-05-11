// import { defaultAllowedOrigins, defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import type { Plugin } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

// Headers that prevent framing — stripped by the dev frame-proxy so the shell
// can embed any URL (code-server, HA, Grafana, JupyterLab…) in its windows.
// This mirrors the same logic in scripts/serve.ts for production.
const STRIP_FRAME_HEADERS = new Set([
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

/**
 * Dev-mode `/frame-proxy?url=<target>` middleware.
 * Fetches <target>, strips X-Frame-Options/CSP, injects <base href> into HTML
 * so same-origin resource paths (e.g. code-server's /static/…) resolve correctly.
 */
function frameProxyPlugin(): Plugin {
  return {
    name: "limen-frame-proxy",
    configureServer(server) {
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (!req.url?.startsWith("/frame-proxy")) return next();

          const reqUrl = new URL(req.url, "http://localhost");
          const target = reqUrl.searchParams.get("url");
          if (!target) {
            res.writeHead(400).end("Missing ?url=");
            return;
          }

          let upstream: Response;
          try {
            upstream = await fetch(target, {
              headers: {
                "User-Agent": "Mozilla/5.0 (LimenOS Dev/1.0)",
                Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
                "Accept-Language": "en-US,en;q=0.9",
              },
              redirect: "follow",
            });
          } catch (e) {
            res
              .writeHead(502)
              .end(
                `Upstream fetch failed: ${e instanceof Error ? e.message : e}`,
              );
            return;
          }

          const headers: Record<string, string> = {
            "access-control-allow-origin": "*",
          };
          upstream.headers.forEach((v, k) => {
            if (!STRIP_FRAME_HEADERS.has(k.toLowerCase())) headers[k] = v;
          });

          // Fix MIME type for TS/JS modules served as text/plain (JupyterLab quirk).
          let ct = upstream.headers.get("content-type") ?? "";
          if (!ct || ct.startsWith("text/plain")) {
            const p = new URL(target).pathname;
            if (/\.(ts|tsx|mts|js|mjs|cjs)$/.test(p)) {
              ct = "application/javascript; charset=utf-8";
              headers["content-type"] = ct;
            }
          }

          if (ct.includes("text/html")) {
            // Inject <base href> so all relative resource paths in the embedded
            // page (scripts, stylesheets, images) resolve against the upstream
            // origin instead of localhost:1420.
            const targetUrl = new URL(target);
            const baseDir = `${targetUrl.protocol}//${targetUrl.host}${targetUrl.pathname.replace(/[^/]*$/, "")}`;
            const proxyBase = `${targetUrl.protocol === "https:" ? "https:" : "http:"}//localhost:1420/frame-proxy?url=`;
            let html = await upstream.text();
            html = html.replace(
              /(<head[^>]*>)/i,
              `$1<base href="${baseDir}">${buildNavigationPatch(proxyBase)}`,
            );
            delete headers["content-length"];
            res.writeHead(upstream.status, headers).end(html);
          } else {
            const body = await upstream.arrayBuffer();
            res.writeHead(upstream.status, headers).end(Buffer.from(body));
          }
        },
      );
    },
  };
}

// https://vitejs.dev/config/
const get_config = async () => ({
  // In Tauri builds base stays at "/" — only server/web deployments use /limen/.
  base: process.env.VITE_BASE_PATH ?? "/",
  plugins: [react(), tailwindcss(), frameProxyPlugin()],

  // Tauri expects a fixed port in dev.
  server: {
    port: 1420,
    strictPort: true,
    allowedHosts: ["*"],
    watch: {
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
    // Proxy /mobile/* → Flutter web dev server (port 4174).
    // In production, copy flutter build web output to dist/mobile/.
    proxy: {
      "/mobile": {
        target: `http://localhost:${process.env.FLUTTER_WEB_PORT ?? "4174"}`,
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/mobile/, "") || "/",
      },
    },
  },

  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
    // Prefer TypeScript sources over stale compiled .js artifacts.
    extensions: [".mts", ".mjs", ".tsx", ".ts", ".jsx", ".js", ".json"],
  },

  // Env vars starting with VITE_ are exposed to the frontend.
  envPrefix: ["VITE_", "TAURI_ENV_*", "LIMEN_"],

  build: {
    // Tauri supports es2021.
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    // Don't minify for debug builds.
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    outDir: "dist",
  },
});
export default get_config();

// }));
