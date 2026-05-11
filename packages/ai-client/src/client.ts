import Anthropic from "@anthropic-ai/sdk";

export interface AiClientOptions {
  /** Use Tauri IPC backend (recommended in desktop shell). */
  tauriBackend?: boolean;
  /** Use synapsd relay at localhost:1421 (web mode with daemon running). */
  relayBackend?: boolean;
  anthropicApiKey?: string;
  defaultModel?: string;
  systemPrompt?: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface CompletionResult {
  content: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

// Same-origin /ai — proxied by serve.ts to synapsd:1421.
// Works regardless of hostname/IP the user uses to access the shell.
const RELAY_URL = "/ai";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

// Always try the relay — don't require the preflight flag which is a race condition.
// The fetch will fail fast if synapsd isn't running.
function hasRelay(): boolean {
  return typeof window !== "undefined";
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
  private opts: AiClientOptions;
  private anthropic?: Anthropic;

  constructor(opts: AiClientOptions = {}) {
    this.opts = {
      tauriBackend: true,
      relayBackend: true,
      defaultModel: "claude-sonnet-4-6",
      systemPrompt:
        "You are LIMEN OS, an AI-native desktop assistant. Be concise and helpful.",
      ...opts,
    };
    if (opts.anthropicApiKey) {
      this.anthropic = new Anthropic({
        apiKey: opts.anthropicApiKey,
        dangerouslyAllowBrowser: true,
      });
    }
  }

  /**
   * Stream tokens as they arrive. Yields delta strings one by one.
   *
   * - Tauri / relay backends: completes in one shot then yields the full text
   * - Direct Anthropic SDK: true token-level streaming
   *
   * The final yielded value has the form `\0meta:{...}` — the component
   * can detect this sentinel to extract model / token metadata.
   */
  async *stream(
    prompt: string,
    history: Message[] = [],
  ): AsyncGenerator<string> {
    // Tauri IPC — not streaming-capable; complete and yield whole text.
    if (this.opts.tauriBackend && isTauri()) {
      try {
        const result = await this.complete(prompt, history);
        yield result.content;
        yield `\0meta:${JSON.stringify({ model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs })}`;
        return;
      } catch {
        // fall through
      }
    }

    // synapsd relay — same one-shot approach.
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
        if (!resp.ok) throw new Error(`relay ${resp.status}`);
        const data = (await resp.json()) as {
          content: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          latency_ms: number;
        };
        yield data.content;
        yield `\0meta:${JSON.stringify({ model: data.model, inputTokens: data.input_tokens, outputTokens: data.output_tokens, latencyMs: data.latency_ms ?? Math.round(performance.now() - t0) })}`;
        return;
      } catch {
        // fall through
      }
    }

    // Direct Anthropic SDK — true token-level streaming.
    if (!this.anthropic) {
      throw new Error(
        "No AI backend available. Run synapsd or provide an Anthropic API key.",
      );
    }

    const messages = [
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: prompt },
    ];

    const t0 = performance.now();
    const stream = this.anthropic.messages.stream({
      model: this.opts.defaultModel ?? "claude-sonnet-4-6",
      max_tokens: 4096,
      ...(this.opts.systemPrompt ? { system: this.opts.systemPrompt } : {}),
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield event.delta.text;
      }
    }

    const finalMsg = await stream.finalMessage();
    yield `\0meta:${JSON.stringify({
      model: finalMsg.model,
      inputTokens: finalMsg.usage.input_tokens,
      outputTokens: finalMsg.usage.output_tokens,
      latencyMs: Math.round(performance.now() - t0),
    })}`;
  }

  async complete(
    prompt: string,
    history: Message[] = [],
  ): Promise<CompletionResult> {
    // 1 — Tauri IPC (Rust limen-ai router — full fallback chain)
    if (this.opts.tauriBackend && isTauri()) {
      try {
        // isTauri() already confirmed __TAURI_INTERNALS__ exists — use it directly
        // so we have zero compile-time dependency on @tauri-apps/api.
        const invoke = (
          window as unknown as {
            __TAURI_INTERNALS__: {
              invoke: <T>(
                cmd: string,
                args?: Record<string, unknown>,
              ) => Promise<T>;
            };
          }
        ).__TAURI_INTERNALS__.invoke;
        const t0 = performance.now();
        const result = await invoke<{
          content: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          latency_ms?: number;
        }>("ai_query", { prompt, model: this.opts.defaultModel, history });
        // Async (queued) response has no content — shouldn't happen with our fixed fallback,
        // but guard anyway.
        if (!result.content) throw new Error("queued");
        return {
          content: result.content,
          model: result.model ?? "unknown",
          inputTokens: result.input_tokens ?? 0,
          outputTokens: result.output_tokens ?? 0,
          latencyMs: result.latency_ms ?? performance.now() - t0,
        };
      } catch {
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
        if (!resp.ok) throw new Error(`relay ${resp.status}`);
        const data = (await resp.json()) as {
          content: string;
          model: string;
          input_tokens: number;
          output_tokens: number;
          latency_ms: number;
        };
        return {
          content: data.content,
          model: data.model,
          inputTokens: data.input_tokens,
          outputTokens: data.output_tokens,
          latencyMs: data.latency_ms ?? performance.now() - t0,
        };
      } catch {
        // Fall through to direct SDK.
      }
    }

    // 3 — Direct Anthropic SDK (browser / mobile with API key)
    if (!this.anthropic) {
      throw new Error(
        "No AI backend available. Run synapsd or provide an Anthropic API key.",
      );
    }

    const t0 = performance.now();
    const messages = [
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user" as const, content: prompt },
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
