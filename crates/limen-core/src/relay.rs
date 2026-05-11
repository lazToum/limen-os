//! HTTP relay server — frame proxy + optional web search.
//!
//! Runs on port 1421 (configurable via `LIMEN_RELAY_PORT`).
//!
//! Endpoints:
//!   GET /proxy?url=<url>      Strip X-Frame-Options/CSP, inject <base href>, proxy body.
//!   GET /search?q=<query>     Search the web (Google Custom Search or SearXNG fallback).
//!   GET /health               {"ok":true}
//!
//! The proxy is what makes browser windows actually work: it strips the
//! headers that prevent embedding and rewrites HTML so sub-resources
//! (scripts, stylesheets, images) resolve back to the origin server.

use anyhow::Result;
use axum::{
    Json, Router,
    extract::{Query, State},
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode},
    response::{
        IntoResponse, Response,
        sse::{Event, KeepAlive, Sse},
    },
    routing::{get, post},
};
use futures::stream::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    convert::Infallible,
    str::FromStr,
    sync::{Arc, OnceLock},
    time::{Duration, Instant},
};
use tokio_stream::StreamExt as _;
use tokio_stream::wrappers::BroadcastStream;
use tower_http::cors::CorsLayer;
use tracing::{info, warn};

const DEFAULT_PORT: u16 = 1421;

static CLIENT: OnceLock<Client> = OnceLock::new();
static AI_ROUTER: OnceLock<Arc<limen_ai::router::AiRouter>> = OnceLock::new();

fn ai_router() -> &'static Arc<limen_ai::router::AiRouter> {
    AI_ROUTER.get_or_init(|| Arc::new(limen_ai::router::AiRouter::from_env()))
}

fn client() -> &'static Client {
    CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_secs(20))
            .redirect(reqwest::redirect::Policy::limited(5))
            .user_agent("Mozilla/5.0 (LimenOS/1.0; relay) AppleWebKit/537.36")
            .build()
            .expect("relay HTTP client")
    })
}

// Headers that block embedding — strip these when proxying.
fn block_headers() -> &'static HashSet<&'static str> {
    static S: OnceLock<HashSet<&'static str>> = OnceLock::new();
    S.get_or_init(|| {
        HashSet::from([
            "x-frame-options",
            "content-security-policy",
            "content-security-policy-report-only",
            // hop-by-hop
            "connection",
            "keep-alive",
            "transfer-encoding",
            "te",
            "trailer",
            "upgrade",
            "proxy-authorization",
            "proxy-authenticate",
        ])
    })
}

pub async fn run(state: crate::AppState) -> Result<()> {
    let port: u16 = std::env::var("LIMEN_RELAY_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let app = Router::new()
        .route("/proxy", get(handle_proxy))
        .route("/search", get(handle_search))
        .route("/ai", post(handle_ai))
        .route(
            "/health",
            get(|| async { axum::Json(serde_json::json!({ "ok": true, "relay": true })) }),
        )
        .route("/ipc", post(handle_ipc))
        .route("/events", get(handle_events))
        .route("/yt-search", get(handle_yt_search))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    info!("Relay server listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

// ── IPC bridge ────────────────────────────────────────────────────────────────

async fn handle_ipc(
    State(state): State<crate::AppState>,
    Json(req): Json<crate::ipc::IpcRequest>,
) -> Response {
    let resp = crate::ipc::server::dispatch(req, &state).await;
    Json(resp).into_response()
}

// ── SSE event stream ──────────────────────────────────────────────────────────

async fn handle_events(
    State(state): State<crate::AppState>,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let rx = state.subscribe();
    let stream = BroadcastStream::new(rx).filter_map(|res: Result<crate::LimenEvent, _>| {
        res.ok().map(|event| {
            let data = serde_json::to_string(&event).unwrap_or_default();
            Ok::<Event, Infallible>(Event::default().data(data))
        })
    });
    Sse::new(stream).keep_alive(KeepAlive::default())
}

// ── YouTube search proxy ──────────────────────────────────────────────────────

#[derive(Deserialize)]
struct YtSearchParams {
    q: String,
    #[serde(default = "default_yt_limit")]
    limit: u8,
}

fn default_yt_limit() -> u8 {
    10
}

async fn handle_yt_search(Query(params): Query<YtSearchParams>) -> Response {
    let base =
        std::env::var("PLAYER_SEARCH_URL").unwrap_or_else(|_| "http://localhost:8787".into());
    let url = format!(
        "{}/youtube/search?q={}&limit={}",
        base.trim_end_matches('/'),
        urlencoding::encode(&params.q),
        params.limit,
    );
    match client().get(&url).send().await {
        Ok(resp) => {
            let status = StatusCode::from_u16(resp.status().as_u16()).unwrap_or(StatusCode::OK);
            let body = resp.bytes().await.unwrap_or_default();
            (
                status,
                [
                    ("content-type", "application/json"),
                    ("access-control-allow-origin", "*"),
                ],
                body,
            )
                .into_response()
        }
        Err(e) => {
            warn!("yt-search proxy error: {e}");
            (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": e.to_string() })),
            )
                .into_response()
        }
    }
}

// ── Proxy ─────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct ProxyParams {
    url: String,
}

async fn handle_proxy(Query(params): Query<ProxyParams>) -> Response {
    let target = &params.url;

    // Validate — only http/https allowed.
    let parsed = match url::Url::parse(target) {
        Ok(u) if u.scheme() == "http" || u.scheme() == "https" => u,
        Ok(_) => {
            return (StatusCode::BAD_REQUEST, "Only http/https URLs are allowed").into_response();
        }
        Err(_) => return (StatusCode::BAD_REQUEST, "Invalid URL").into_response(),
    };

    let upstream = match client()
        .get(target)
        .header("Accept", "text/html,application/xhtml+xml,*/*;q=0.9")
        .header("Accept-Language", "en-US,en;q=0.9")
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            warn!("Proxy fetch failed for {target}: {e}");
            return (StatusCode::BAD_GATEWAY, format!("Fetch failed: {e}")).into_response();
        }
    };

    let status = upstream.status();
    let upstream_headers = upstream.headers().clone();

    // Build clean response headers.
    let mut headers = HeaderMap::new();
    let blocked = block_headers();
    for (key, val) in &upstream_headers {
        if !blocked.contains(key.as_str()) {
            headers.insert(key.clone(), val.clone());
        }
    }
    headers.insert(
        HeaderName::from_str("access-control-allow-origin").unwrap(),
        HeaderValue::from_static("*"),
    );
    headers.insert(
        HeaderName::from_str("x-proxied-by").unwrap(),
        HeaderValue::from_static("limen-relay"),
    );

    let mut ct = upstream_headers
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    // Fix MIME type for TypeScript/JavaScript files served as text/plain.
    // JupyterLab 4.x / Vite dev servers often do this — browsers block module
    // loads with wrong MIME types, so we patch it here.
    let url_path = parsed.path();
    if ct.is_empty() || ct.starts_with("text/plain") {
        let fixed = if url_path.ends_with(".ts")
            || url_path.ends_with(".tsx")
            || url_path.ends_with(".mts")
            || url_path.ends_with(".js")
            || url_path.ends_with(".mjs")
            || url_path.ends_with(".cjs")
        {
            Some("application/javascript; charset=utf-8")
        } else if url_path.ends_with(".css") {
            Some("text/css; charset=utf-8")
        } else if url_path.ends_with(".json") {
            Some("application/json; charset=utf-8")
        } else {
            None
        };
        if let Some(mime) = fixed {
            ct = mime.to_string();
            headers.insert(
                HeaderName::from_str("content-type").unwrap(),
                HeaderValue::from_str(mime).unwrap(),
            );
        }
    }

    if ct.contains("text/html") {
        // Inject <base href> so regular resources (CSS, images, non-module scripts)
        // load directly from the upstream origin.
        let origin = format!("{}://{}", parsed.scheme(), parsed.host_str().unwrap_or(""));
        let path_dir = parsed.path().rsplit_once('/').map(|(d, _)| d).unwrap_or("");
        let base_href = format!("{origin}{path_dir}/");

        let port: u16 = std::env::var("LIMEN_RELAY_PORT")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(DEFAULT_PORT);
        let proxy_base = format!("http://localhost:{port}");

        let body = match upstream.text().await {
            Ok(b) => b,
            Err(e) => {
                return (StatusCode::BAD_GATEWAY, format!("Body read error: {e}")).into_response();
            }
        };

        // Step 1: inject <base href> plus navigation patch so relative links/forms
        // stay inside the proxy instead of escaping to the shell origin.
        let with_base = if let Some(idx) = body.to_lowercase().find("<head") {
            let after = &body[idx..];
            if let Some(end) = after.find('>') {
                let at = idx + end + 1;
                let nav_patch = build_navigation_patch(&format!("{proxy_base}/proxy?url="));
                format!(
                    r#"{}<base href="{}">{}{}"#,
                    &body[..at],
                    base_href,
                    nav_patch,
                    &body[at..]
                )
            } else {
                body
            }
        } else {
            body
        };

        // Step 2: rewrite <script type="module" src="..."> to go through our proxy
        // so we can fix MIME types for TypeScript files that would otherwise be
        // blocked by the browser (JupyterLab 4.x / Vite quirk).
        let patched = rewrite_module_scripts(&with_base, &origin, path_dir, &proxy_base);

        headers.remove("content-length");
        let http_status = StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK);
        return (http_status, headers, patched).into_response();
    }

    // Script/style/binary — stream body with (possibly fixed) content-type.
    let body_bytes = match upstream.bytes().await {
        Ok(b) => b,
        Err(e) => {
            return (StatusCode::BAD_GATEWAY, format!("Body read error: {e}")).into_response();
        }
    };
    let http_status = StatusCode::from_u16(status.as_u16()).unwrap_or(StatusCode::OK);
    (http_status, headers, body_bytes).into_response()
}

/// Rewrite `<script type="module" src="...">` attributes in HTML so module
/// scripts load through our proxy. This lets us fix MIME types (e.g. `.ts`
/// served as `text/plain` by JupyterLab/Vite) before the browser sees them.
fn rewrite_module_scripts(html: &str, origin: &str, path_dir: &str, proxy_base: &str) -> String {
    let mut out = String::with_capacity(html.len() + 512);
    let lower = html.to_lowercase();
    let mut cursor = 0usize;

    while cursor < html.len() {
        // Find next <script
        let Some(tag_start) = lower[cursor..].find("<script") else {
            out.push_str(&html[cursor..]);
            break;
        };
        let abs_tag = cursor + tag_start;

        // Find end of this opening tag.
        let Some(tag_end_rel) = lower[abs_tag..].find('>') else {
            out.push_str(&html[cursor..]);
            break;
        };
        let abs_tag_end = abs_tag + tag_end_rel + 1;
        let tag_html = &html[abs_tag..abs_tag_end];
        let tag_lower = tag_html.to_lowercase();

        // Only rewrite if type="module" or type='module'.
        if tag_lower.contains("type=\"module\"") || tag_lower.contains("type='module'") {
            // Extract src="..." or src='...'.
            if let Some(src) = extract_attr(tag_html, "src") {
                // Resolve to absolute URL.
                let abs_src = if src.starts_with("http://") || src.starts_with("https://") {
                    src.to_string()
                } else if src.starts_with('/') {
                    format!("{origin}{src}")
                } else {
                    format!("{origin}{path_dir}/{src}")
                };
                // Rewrite to proxy URL.
                let proxy_src = format!("{proxy_base}/proxy?url={}", urlencoding::encode(&abs_src));
                let rewritten_tag = replace_attr(tag_html, "src", src, &proxy_src);
                out.push_str(&html[cursor..abs_tag]);
                out.push_str(&rewritten_tag);
                cursor = abs_tag_end;
                continue;
            }
        }

        // Not a module script — keep as-is.
        out.push_str(&html[cursor..abs_tag_end]);
        cursor = abs_tag_end;
    }
    out
}

fn build_navigation_patch(proxy_base: &str) -> String {
    format!(
        r##"<script>
(() => {{
  const proxyBase = "{proxy_base}";
  const proxied = (value) => {{
    if (!value) return "";
    const resolved = new URL(value, document.baseURI);
    if (!/^https?:$/i.test(resolved.protocol)) return resolved.toString();
    return proxyBase + encodeURIComponent(resolved.toString());
  }};
  document.addEventListener("click", (event) => {{
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (!href || href.startsWith("#") || /^(javascript:|mailto:|tel:)/i.test(href)) return;
    if (anchor.hasAttribute("download") || anchor.target === "_blank") return;
    event.preventDefault();
    window.location.assign(proxied(href));
  }}, true);
  document.addEventListener("submit", (event) => {{
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const method = (form.method || "get").toLowerCase();
    if (method !== "get") return;
    event.preventDefault();
    const action = form.getAttribute("action") || window.location.href;
    const target = new URL(action, document.baseURI);
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {{
      target.searchParams.append(key, typeof value === "string" ? value : value.name);
    }}
    window.location.assign(proxied(target.toString()));
  }}, true);
}})();
</script>"##
    )
}

/// Extract the value of an attribute from an HTML tag string.
fn extract_attr<'a>(tag: &'a str, attr: &str) -> Option<&'a str> {
    let lower = tag.to_lowercase();
    let needle_dq = format!("{attr}=\"");
    let needle_sq = format!("{attr}='");
    if let Some(start) = lower.find(&needle_dq) {
        let after = start + needle_dq.len();
        tag[after..].find('"').map(|end| &tag[after..after + end])
    } else if let Some(start) = lower.find(&needle_sq) {
        let after = start + needle_sq.len();
        tag[after..].find('\'').map(|end| &tag[after..after + end])
    } else {
        None
    }
}

/// Replace the value of an attribute in an HTML tag string.
fn replace_attr(tag: &str, attr: &str, old_val: &str, new_val: &str) -> String {
    // Try double-quote form first.
    let dq = format!(r#"{attr}="{old_val}""#);
    let sq = format!("{attr}='{old_val}'");
    if tag.contains(&dq) {
        tag.replacen(&dq, &format!(r#"{attr}="{new_val}""#), 1)
    } else {
        tag.replacen(&sq, &format!("{attr}='{new_val}'"), 1)
    }
}

// ── AI ────────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct AiBody {
    prompt: String,
    #[serde(default)]
    system: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    history: Vec<AiHistoryMsg>,
    #[serde(default = "default_max_tokens")]
    max_tokens: u32,
}

fn default_max_tokens() -> u32 {
    4096
}

#[derive(Deserialize)]
struct AiHistoryMsg {
    role: String,
    content: String,
}

#[derive(Serialize)]
struct AiResponse {
    content: String,
    model: String,
    input_tokens: u32,
    output_tokens: u32,
    latency_ms: u64,
}

async fn handle_ai(Json(body): Json<AiBody>) -> Response {
    use limen_ai::router::{AiRequest, ChatMessage};

    let history: Vec<ChatMessage> = body
        .history
        .into_iter()
        .map(|m| ChatMessage {
            role: m.role,
            content: m.content,
        })
        .collect();

    let req = AiRequest {
        prompt: body.prompt,
        system: body.system.or_else(|| {
            Some("You are LIMEN OS, an AI-native desktop assistant. Be concise and helpful.".into())
        }),
        model_hint: body.model.as_deref().and_then(parse_relay_model_id),
        max_tokens: Some(body.max_tokens),
        temperature: Some(0.7),
        tools: vec![],
        history,
        skip_context: false,
    };

    let t0 = Instant::now();
    match ai_router().complete(req).await {
        Ok(resp) => Json(AiResponse {
            content: resp.content,
            model: resp.model_used.display_name().to_string(),
            input_tokens: resp.input_tokens,
            output_tokens: resp.output_tokens,
            latency_ms: t0.elapsed().as_millis() as u64,
        })
        .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response(),
    }
}

fn parse_relay_model_id(s: &str) -> Option<limen_ai::router::ModelId> {
    use limen_ai::router::ModelId;
    match s.to_lowercase().as_str() {
        "claude" | "claude-sonnet" | "sonnet" => Some(ModelId::ClaudeSonnet46),
        "claude-opus" | "opus" => Some(ModelId::ClaudeOpus46),
        "claude-haiku" | "haiku" => Some(ModelId::ClaudeHaiku45),
        "gpt4o" | "gpt-4o" | "openai" | "gpt" => Some(ModelId::Gpt4o),
        "gpt4o-mini" | "gpt-4o-mini" => Some(ModelId::Gpt4oMini),
        "gemini" | "gemini-flash" => Some(ModelId::Gemini20Flash),
        "deepseek" => Some(ModelId::DeepseekV3),
        "deepseek-r1" | "r1" => Some(ModelId::DeepseekR1),
        "groq" | "llama" => Some(ModelId::GroqLlama33_70b),
        _ => None,
    }
}

// ── Search ────────────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct SearchParams {
    q: String,
    /// Number of results (default 10, max 10 for Google CSE free tier).
    #[serde(default = "default_n")]
    n: u8,
}

fn default_n() -> u8 {
    10
}

#[derive(serde::Serialize)]
struct SearchResult {
    title: String,
    url: String,
    snippet: String,
}

async fn handle_search(Query(params): Query<SearchParams>) -> Response {
    let results = if let Ok(key) = std::env::var("GOOGLE_CSE_KEY") {
        let cx = std::env::var("GOOGLE_CSE_CX").unwrap_or_default();
        google_search(&params.q, &key, &cx, params.n).await
    } else if let Ok(base) = std::env::var("SEARXNG_URL") {
        searxng_search(&params.q, &base, params.n).await
    } else {
        // No search backend configured — return a helpful error.
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            axum::Json(serde_json::json!({
                "error": "No search backend configured. Set GOOGLE_CSE_KEY+GOOGLE_CSE_CX or SEARXNG_URL.",
                "results": []
            })),
        ).into_response();
    };

    axum::Json(serde_json::json!({ "results": results })).into_response()
}

async fn google_search(q: &str, key: &str, cx: &str, n: u8) -> Vec<SearchResult> {
    let url = format!(
        "https://www.googleapis.com/customsearch/v1?key={key}&cx={cx}&q={q}&num={n}",
        q = urlencoding::encode(q),
        n = n.min(10),
    );
    let Ok(resp) = client().get(&url).send().await else {
        return vec![];
    };
    let Ok(json) = resp.json::<serde_json::Value>().await else {
        return vec![];
    };
    json["items"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .map(|item| SearchResult {
                    title: item["title"].as_str().unwrap_or("").to_string(),
                    url: item["link"].as_str().unwrap_or("").to_string(),
                    snippet: item["snippet"].as_str().unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}

async fn searxng_search(q: &str, base: &str, n: u8) -> Vec<SearchResult> {
    let url = format!(
        "{}/search?q={}&format=json&categories=general&pageno=1",
        base.trim_end_matches('/'),
        urlencoding::encode(q),
    );
    let Ok(resp) = client().get(&url).send().await else {
        return vec![];
    };
    let Ok(json) = resp.json::<serde_json::Value>().await else {
        return vec![];
    };
    json["results"]
        .as_array()
        .map(|items| {
            items
                .iter()
                .take(n as usize)
                .map(|item| SearchResult {
                    title: item["title"].as_str().unwrap_or("").to_string(),
                    url: item["url"].as_str().unwrap_or("").to_string(),
                    snippet: item["content"].as_str().unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default()
}
