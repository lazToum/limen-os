import Anthropic from "@anthropic-ai/sdk";
const RELAY_URL = "http://localhost:1421/ai";
function isTauri() {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
function hasRelay() {
    return typeof window !== "undefined" &&
        window.__LIMEN_RELAY__ === true;
}
/**
 * AI client for LIMEN OS.
 *
 * Priority chain:
 *   1. Tauri IPC (limen-ai Rust router) — full model chain, works offline
 *   2. synapsd relay POST /ai (web mode, daemon running on :1421)
 *   3. Direct Anthropic SDK (mobile / pure browser, needs API key in env)
 */
export class AiClient {
    constructor(opts = {}) {
        this.opts = {
            tauriBackend: true,
            relayBackend: true,
            defaultModel: "claude-sonnet-4-6",
            systemPrompt: "You are LIMEN OS, an AI-native desktop assistant. Be concise and helpful.",
            ...opts,
        };
        if (opts.anthropicApiKey) {
            this.anthropic = new Anthropic({
                apiKey: opts.anthropicApiKey,
                dangerouslyAllowBrowser: true,
            });
        }
    }
    async complete(prompt, history = []) {
        // 1 — Tauri IPC (Rust limen-ai router — full fallback chain)
        if (this.opts.tauriBackend && isTauri()) {
            try {
                // isTauri() already confirmed __TAURI_INTERNALS__ exists — use it directly
                // so we have zero compile-time dependency on @tauri-apps/api.
                const invoke = window.__TAURI_INTERNALS__.invoke;
                const t0 = performance.now();
                const result = await invoke("ai_query", { prompt, model: this.opts.defaultModel, history });
                // Async (queued) response has no content — shouldn't happen with our fixed fallback,
                // but guard anyway.
                if (!result.content)
                    throw new Error("queued");
                return {
                    content: result.content,
                    model: result.model ?? "unknown",
                    inputTokens: result.input_tokens ?? 0,
                    outputTokens: result.output_tokens ?? 0,
                    latencyMs: result.latency_ms ?? (performance.now() - t0),
                };
            }
            catch {
                // Fall through to next backend.
            }
        }
        // 2 — synapsd relay (web mode, daemon running)
        if (this.opts.relayBackend && hasRelay()) {
            try {
                const t0 = performance.now();
                const resp = await fetch(RELAY_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt,
                        model: this.opts.defaultModel,
                        system: this.opts.systemPrompt,
                        history,
                    }),
                });
                if (!resp.ok)
                    throw new Error(`relay ${resp.status}`);
                const data = await resp.json();
                return {
                    content: data.content,
                    model: data.model,
                    inputTokens: data.input_tokens,
                    outputTokens: data.output_tokens,
                    latencyMs: data.latency_ms ?? (performance.now() - t0),
                };
            }
            catch {
                // Fall through to direct SDK.
            }
        }
        // 3 — Direct Anthropic SDK (browser / mobile with API key)
        if (!this.anthropic) {
            throw new Error("No AI backend available. Run synapsd or provide an Anthropic API key.");
        }
        const t0 = performance.now();
        const messages = [
            ...history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: prompt },
        ];
        const resp = await this.anthropic.messages.create({
            model: this.opts.defaultModel ?? "claude-sonnet-4-6",
            max_tokens: 4096,
            ...(this.opts.systemPrompt ? { system: this.opts.systemPrompt } : {}),
            messages,
        });
        const content = resp.content[0].type === "text" ? resp.content[0].text : "";
        return {
            content,
            model: resp.model,
            inputTokens: resp.usage.input_tokens,
            outputTokens: resp.usage.output_tokens,
            latencyMs: performance.now() - t0,
        };
    }
}
