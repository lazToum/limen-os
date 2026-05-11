/**
 * WaldiezContent — Native Waldiez flow editor inside a Limen OS window.
 *
 * Uses @waldiez/react directly (same component as the VS Code + JupyterLab
 * extensions) wired to Tauri IPC for save / run / convert.
 *
 * Execution requires `pip install waldiez` — gracefully hints if absent.
 * Chat & step-by-step output streams via `limen://waldiez/output` events.
 */
import "@waldiez/react/dist/@waldiez.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  WaldiezChatConfig,
  WaldiezStepByStep,
  WaldiezChatMessage,
  WaldiezChatUserInput,
  WaldiezDebugInputResponse,
} from "@waldiez/react";
import { Waldiez } from "@waldiez/react";
import type { WindowInstance } from "../../store/shell";
import { useShellStore } from "../../store/shell";

interface Props {
  win: WindowInstance;
}

// ── Default state factories ───────────────────────────────────────────────────

function makeChat(
  onUserInput: (input: WaldiezChatUserInput) => void,
  onInterrupt: () => void,
  onClose: () => void,
): WaldiezChatConfig {
  return {
    show: false,
    active: false,
    messages: [],
    userParticipants: [],
    handlers: { onUserInput, onInterrupt, onClose },
  };
}

function makeStepByStep(
  sendControl: (
    v: Pick<WaldiezDebugInputResponse, "request_id" | "data">,
  ) => void,
): WaldiezStepByStep {
  return {
    show: false,
    active: false,
    stepMode: true,
    autoContinue: false,
    breakpoints: [],
    eventHistory: [],
    pendingControlInput: null,
    handlers: { sendControl, respond: () => {} },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isTauri() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WaldiezContent({ win }: Props) {
  const flowId = useRef(`wz-${win.id}`).current;
  const storageId = flowId;

  const [ready, setReady] = useState(false);
  const [canRun, setCanRun] = useState(false); // waldiez Python installed?
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<Array<{ text: string; err: boolean }>>(
    [],
  );

  // ── Chat / step-by-step state ───────────────────────────────────────────────
  const [chat, setChat] = useState<WaldiezChatConfig>(() =>
    makeChat(
      (input) => {
        const text =
          typeof input.data === "string"
            ? input.data
            : JSON.stringify(input.data);
        if (isTauri()) void tauriInvoke("waldiez_input", { value: text });
      },
      () => {
        if (isTauri()) void tauriInvoke("waldiez_stop");
      },
      () =>
        setChat((c) => ({ ...c, show: false, active: false, messages: [] })),
    ),
  );

  const [stepByStep] = useState<WaldiezStepByStep>(() =>
    makeStepByStep((v) => {
      if (isTauri()) void tauriInvoke("waldiez_control", { value: v });
    }),
  );

  // ── Capability check ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isTauri()) {
      setReady(true);
      return;
    }
    tauriInvoke<boolean>("waldiez_check")
      .then((ok) => setCanRun(ok))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  // ── Event listeners (execution output from synapsd) ─────────────────────────
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void)[] = [];
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen<{ line: string; stream: "stdout" | "stderr" }>(
        "limen://waldiez/output",
        ({ payload }) => {
          setOutput((o) => [
            ...o.slice(-499),
            { text: payload.line, err: payload.stream === "stderr" },
          ]);
          // Parse structured chat messages emitted by waldiez CLI
          if (payload.line.startsWith("{")) {
            try {
              const msg = JSON.parse(payload.line) as {
                type?: string;
                content?: string;
                sender?: string;
              };
              if (msg.type === "chat_message" && msg.content) {
                const wMsg: WaldiezChatMessage = {
                  id: `${Date.now()}`,
                  timestamp: Date.now(),
                  type: "text",
                  sender: msg.sender ?? "assistant",
                  content: msg.content,
                };
                setChat((c) => ({
                  ...c,
                  show: true,
                  active: true,
                  messages: [...c.messages, wMsg],
                }));
              }
            } catch {
              /* not JSON — plain output line */
            }
          }
        },
      ).then((fn) => unlisten.push(fn));

      listen<{ success: boolean }>("limen://waldiez/done", ({ payload }) => {
        setRunning(false);
        setChat((c) => ({ ...c, active: false }));
        useShellStore.getState().addNotification({
          title: "Waldiez",
          body: payload.success
            ? "Flow completed."
            : "Flow failed — check output.",
          kind: payload.success ? "info" : "error",
        });
      }).then((fn) => unlisten.push(fn));
    });
    return () => unlisten.forEach((fn) => fn());
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const onSave = useCallback((content: string) => {
    // Blob download works in both Tauri and browser.
    // TODO: use waldiez_save_file IPC when tauri-plugin-dialog is added.
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    a.download = "flow.waldiez";
    a.click();
    if (isTauri()) {
      useShellStore.getState().addNotification({
        title: "Waldiez",
        body: "Flow downloaded.",
        kind: "info",
      });
    }
  }, []);

  const onRun = useCallback(
    (flowJson: string) => {
      if (!canRun) {
        useShellStore.getState().addNotification({
          title: "Waldiez",
          body: "pip install waldiez  to enable execution.",
          kind: "info",
        });
        return;
      }
      setRunning(true);
      setOutput([]);
      setChat((c) => ({ ...c, show: true, active: true, messages: [] }));
      void tauriInvoke("waldiez_run", { flowJson });
    },
    [canRun],
  );

  const onConvert = useCallback(
    async (flowJson: string, to: "py" | "ipynb") => {
      if (!canRun) {
        useShellStore.getState().addNotification({
          title: "Waldiez",
          body: "pip install waldiez  to enable conversion.",
          kind: "info",
        });
        return;
      }
      try {
        const content = await tauriInvoke<string>("waldiez_convert", {
          flowJson,
          to,
        });
        const ext = to === "py" ? "py" : "ipynb";
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([content]));
        a.download = `flow.${ext}`;
        a.click();
        useShellStore.getState().addNotification({
          title: "Waldiez",
          body: `Exported to ${ext}.`,
          kind: "info",
        });
      } catch (e) {
        useShellStore.getState().addNotification({
          title: "Waldiez Error",
          body: String(e),
          kind: "error",
        });
      }
    },
    [canRun],
  );

  const onUpload = useCallback(
    async (_files: File[]): Promise<string[]> => [],
    [],
  );

  const onGetCheckpoints = useCallback(async (_name: string) => null, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "rgba(180,210,255,0.5)",
          fontSize: 14,
        }}
      >
        Loading Waldiez…
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}
    >
      {/* Install hint banner */}
      {isTauri() && !canRun && (
        <div
          style={{
            padding: "6px 12px",
            fontSize: 12,
            background: "rgba(255,200,50,0.12)",
            borderBottom: "1px solid rgba(255,200,50,0.25)",
            color: "rgba(255,220,100,0.85)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>⚠</span>
          <span>
            Flow execution disabled — run{" "}
            <code
              style={{
                fontFamily: "monospace",
                background: "rgba(255,255,255,0.08)",
                padding: "1px 5px",
                borderRadius: 3,
              }}
            >
              pip install waldiez
            </code>{" "}
            to enable.
          </span>
        </div>
      )}

      {/* Waldiez editor — takes all available space */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        <Waldiez
          flowId={flowId}
          storageId={storageId}
          onSave={onSave}
          onRun={onRun}
          onConvert={onConvert}
          onUpload={onUpload}
          chat={chat}
          stepByStep={stepByStep}
          checkpoints={{ get: onGetCheckpoints }}
        />
      </div>

      {/* Execution console — visible while running or after */}
      {output.length > 0 && (
        <div
          style={{
            height: 160,
            minHeight: 80,
            borderTop: "1px solid rgba(100,150,255,0.2)",
            background: "rgba(8,12,24,0.95)",
            overflow: "auto",
            fontFamily: "monospace",
            fontSize: 11,
            padding: "6px 10px",
            color: "rgba(200,220,255,0.75)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 4,
              opacity: 0.5,
              fontSize: 10,
            }}
          >
            <span>{running ? "▶ Running…" : "◼ Done"}</span>
            <button
              onClick={() => setOutput([])}
              style={{
                background: "none",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                fontSize: 10,
              }}
            >
              ✕ clear
            </button>
          </div>
          {output.map((l, i) => (
            <div
              key={i}
              style={{
                color: l.err ? "rgba(255,100,100,0.85)" : "inherit",
                lineHeight: "1.5",
              }}
            >
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
