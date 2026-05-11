/**
 * Workers — embedded AgentFlow + LIMEN operations dashboard.
 *
 * Uses the monitor_server.py WebSocket contract:
 *   full_snapshot / patch / config / chat / stream_chunk / stream_end
 * Surfaces the semantic middleware layers and foundations inside the app.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AgentFlowIcon } from "./AgentFlowIcon";

type AgentState =
  | "initializing"
  | "running"
  | "paused"
  | "stopped"
  | { failed: string }
  | string;
type ConnectionState = "connecting" | "live" | "demo";
type View = "overview" | "feed" | "chat" | "limen";

interface WorkerAgent {
  id: string;
  name: string;
  state: AgentState;
  protected: boolean;
  agentType?: string | undefined;
  cpu?: number | undefined;
  mem?: number | undefined;
  task?: string | undefined;
  messagesProcessed?: number | undefined;
  messagesFailed?: number | undefined;
  costUsd?: number | undefined;
  uptime?: number | undefined;
  lastHeartbeatAt?: string | undefined;
  lastUpdateAt?: string | undefined;
  node?: string | undefined;
}

interface WorkerNode {
  node: string;
  agents: string[];
  online: boolean;
  lastSeen?: number | undefined;
  nodeId?: string | undefined;
}

interface WorkerFeedItem {
  id: string;
  ts: number;
  kind:
    | "status"
    | "heartbeat"
    | "spawn"
    | "alert"
    | "chat"
    | "system"
    | "command";
  severity?: "info" | "warning" | "error" | "critical" | undefined;
  agentName: string;
  text: string;
}

interface ChatMsg {
  id: string;
  from: string;
  to: string;
  content: string;
  ts: number;
}

interface SnapshotState {
  agents?: unknown[];
  nodes?: unknown[];
  alerts?: unknown[];
  log_feed?: unknown[];
  system_health?: Record<string, unknown>;
  total_cost_usd?: number;
}

interface ServiceProbe {
  label: string;
  status: "online" | "offline" | "unknown";
  detail: string;
}

const DEMO_AGENTS: WorkerAgent[] = [
  {
    id: "main",
    name: "main",
    state: "running",
    protected: true,
    agentType: "orchestrator",
    messagesProcessed: 182,
    costUsd: 0.0184,
    lastHeartbeatAt: new Date(Date.now() - 2_000).toISOString(),
    task: "routing user requests",
  },
  {
    id: "monitor",
    name: "monitor",
    state: "running",
    protected: true,
    agentType: "monitor",
    messagesProcessed: 62,
    lastHeartbeatAt: new Date(Date.now() - 8_000).toISOString(),
    task: "checking worker health",
  },
  {
    id: "semantic-bridge",
    name: "semantic-bridge",
    state: "paused",
    protected: false,
    agentType: "limen",
    messagesProcessed: 11,
    lastHeartbeatAt: new Date(Date.now() - 62_000).toISOString(),
    task: "waiting for telemetry sync",
  },
];

const DEMO_NODES: WorkerNode[] = [
  {
    node: "local",
    agents: ["main", "monitor", "semantic-bridge"],
    online: true,
  },
  { node: "edge-kitchen", agents: ["temperature-worker"], online: false },
];

const DEMO_FEED: WorkerFeedItem[] = [
  {
    id: "demo-1",
    ts: Date.now() - 60_000,
    kind: "spawn",
    agentName: "semantic-bridge",
    text: "spawned for LIMEN graph sync",
  },
  {
    id: "demo-2",
    ts: Date.now() - 42_000,
    kind: "status",
    agentName: "main",
    text: "planner completed 3-step orchestration",
  },
  {
    id: "demo-3",
    ts: Date.now() - 18_000,
    kind: "alert",
    severity: "warning",
    agentName: "monitor",
    text: "edge-kitchen heartbeat delayed",
  },
];

const LIMEN_LAYERS = [
  {
    name: "IoT Data",
    detail: "Sensors, actuators, multimodal telemetry, edge nodes",
  },
  {
    name: "Semantic Middleware",
    detail: "RDF normalization, event graph, current belief graph",
  },
  {
    name: "ActInf Agents",
    detail: "Belief updates, policy selection, low-level reasoning",
  },
  {
    name: "LLM Agents",
    detail: "Intent recognition, explanation, orchestration",
  },
  {
    name: "User Interaction",
    detail: "Dashboards, chat, transparent rationale",
  },
];

const LIMEN_FOUNDATIONS = [
  { name: "SOSA / SSN", detail: "observations, sensors, actuators, systems" },
  { name: "SAREF", detail: "devices, functions, tasks, energy semantics" },
  { name: "PROV-O", detail: "provenance, traceability, accountability" },
  { name: "SHACL", detail: "validation and conformance of semantic state" },
];

const BRIDGE_TOPICS = [
  "io/chat -> AgentFlow main actor",
  "agents/+/chat -> LIMEN notifications",
  "os/window/open -> shell window launch",
  "os/scene/set -> shell scene change",
  "os/notify -> desktop notification",
];

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
}

function stateLabel(state: AgentState): string {
  if (typeof state === "object" && state && "failed" in state) return "failed";
  return String(state || "unknown");
}

function stateColor(state: AgentState): string {
  switch (stateLabel(state)) {
    case "running":
      return "#22d3a0";
    case "initializing":
      return "#60a5fa";
    case "paused":
      return "#fbbf24";
    case "stopped":
      return "#6b7280";
    case "failed":
      return "#f87171";
    default:
      return "#a78bfa";
  }
}

function agentTypeColor(agentType?: string): string {
  switch ((agentType ?? "").toLowerCase()) {
    case "orchestrator":
    case "main":
      return "#60a5fa";
    case "monitor":
      return "#22d3a0";
    case "limen":
      return "#8b5cf6";
    case "dynamic":
      return "#818cf8";
    case "ml":
      return "#f59e0b";
    default:
      return "#94a3b8";
  }
}

function ago(iso?: string): string {
  if (!iso) return "n/a";
  const delta = Date.now() - new Date(iso).getTime();
  if (delta < 2_000) return "now";
  if (delta < 60_000) return `${Math.floor(delta / 1_000)}s ago`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  return `${Math.floor(delta / 3_600_000)}h ago`;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function normalizeAgent(input: unknown): WorkerAgent | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const id = stringOrUndefined(record.agent_id) ?? stringOrUndefined(record.id);
  const name =
    stringOrUndefined(record.name) ?? stringOrUndefined(record.agentName);
  if (!id || !name) return null;
  return {
    id,
    name,
    state: (record.state as AgentState | undefined) ?? "unknown",
    protected: Boolean(record.protected),
    agentType:
      stringOrUndefined(record.agentType) ??
      stringOrUndefined(record.agent_type),
    cpu: numberOrUndefined(record.cpu),
    mem: numberOrUndefined(record.mem),
    task: stringOrUndefined(record.task),
    messagesProcessed:
      numberOrUndefined(record.messagesProcessed) ??
      numberOrUndefined(record.messages_processed),
    messagesFailed:
      numberOrUndefined(record.messagesFailed) ??
      numberOrUndefined(record.messages_failed),
    costUsd:
      numberOrUndefined(record.costUsd) ?? numberOrUndefined(record.cost_usd),
    uptime: numberOrUndefined(record.uptime),
    lastHeartbeatAt: (() => {
      const lastUpdate = numberOrUndefined(record.last_update);
      if (lastUpdate) return new Date(lastUpdate * 1000).toISOString();
      return stringOrUndefined(record.lastHeartbeatAt);
    })(),
    lastUpdateAt: (() => {
      const lastUpdate = numberOrUndefined(record.last_update);
      return lastUpdate ? new Date(lastUpdate * 1000).toISOString() : undefined;
    })(),
    node: stringOrUndefined(record.node),
  };
}

function normalizeNode(input: unknown): WorkerNode | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const node = stringOrUndefined(record.node);
  if (!node) return null;
  return {
    node,
    agents: Array.isArray(record.agents)
      ? record.agents.map((item) => String(item))
      : [],
    online: Boolean(record.online),
    lastSeen: numberOrUndefined(record.last_seen),
    nodeId: stringOrUndefined(record.node_id),
  };
}

function logKind(type: string): WorkerFeedItem["kind"] {
  switch (type) {
    case "spawned":
      return "spawn";
    case "alert":
      return "alert";
    case "command":
      return "command";
    case "status":
      return "status";
    default:
      return "system";
  }
}

function normalizeFeed(snapshot: SnapshotState): WorkerFeedItem[] {
  const logs = Array.isArray(snapshot.log_feed) ? snapshot.log_feed : [];
  const alerts = Array.isArray(snapshot.alerts) ? snapshot.alerts : [];
  const items: WorkerFeedItem[] = [];

  for (const entry of logs) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const agentName =
      stringOrUndefined(record.name) ??
      stringOrUndefined(record.agent_id) ??
      "system";
    const rawType = stringOrUndefined(record.type) ?? "system";
    const tsSeconds = numberOrUndefined(record.timestamp) ?? Date.now() / 1000;
    const detail =
      stringOrUndefined(record.message) ??
      stringOrUndefined(record.command) ??
      stringOrUndefined(record.status) ??
      rawType;
    items.push({
      id: uid("feed"),
      ts: Math.round(tsSeconds * 1000),
      kind: logKind(rawType),
      severity: stringOrUndefined(record.severity) as
        | WorkerFeedItem["severity"]
        | undefined,
      agentName,
      text: detail,
    });
  }

  for (const entry of alerts) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const tsSeconds = numberOrUndefined(record.timestamp) ?? Date.now() / 1000;
    items.push({
      id: uid("alert"),
      ts: Math.round(tsSeconds * 1000),
      kind: "alert",
      severity: (stringOrUndefined(record.severity) ??
        "warning") as WorkerFeedItem["severity"],
      agentName:
        stringOrUndefined(record.name) ??
        stringOrUndefined(record.agent_id) ??
        "monitor",
      text: stringOrUndefined(record.message) ?? "alert",
    });
  }

  return items.sort((a, b) => b.ts - a.ts).slice(0, 200);
}

function getWsCandidates(): string[] {
  const env = import.meta.env as Record<string, string | undefined>;
  const explicit = env.VITE_AGENTFLOW_WS_URL?.trim();
  if (explicit) return [explicit];
  // Use the shell's own origin (served through serve.ts /af/ws proxy) first,
  // then fall back to direct port 8889 (avoids conflict with JupyterLab on 8888).
  const secure = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return [`${secure}://${host}/af/ws`];
}

function getRelayCandidates(): string[] {
  const env = import.meta.env as Record<string, string | undefined>;
  const explicit =
    env.LIMEN_RELAY_URL?.trim() ?? env.VITE_LIMEN_RELAY_URL?.trim();
  if (explicit) return [`${explicit.replace(/\/$/, "")}/health`];
  // /health is proxied by serve.ts → synapsd :1421 — works from any origin.
  return ["/health", "http://localhost:1421/health"];
}

function getActorApiCandidates(): string[] {
  const env = import.meta.env as Record<string, string | undefined>;
  const explicit = env.VITE_AGENTFLOW_HTTP_URL?.trim();
  if (explicit) return [`${explicit.replace(/\/$/, "")}/api/actors`];
  return ["/af/api/actors"];
}

async function fetchJson(url: string, timeoutMs = 1600): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function AgentFlowContent() {
  const [agents, setAgents] = useState<WorkerAgent[]>(DEMO_AGENTS);
  const [nodes, setNodes] = useState<WorkerNode[]>(DEMO_NODES);
  const [feed, setFeed] = useState<WorkerFeedItem[]>(DEMO_FEED);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [target, setTarget] = useState("main");
  const [sidebarSearch, setSidebarSearch] = useState("");
  const [view, setView] = useState<View>("overview");
  const [connected, setConnected] = useState<ConnectionState>("connecting");
  const [chatMode, setChatMode] = useState<"direct_ws" | "mqtt">("mqtt");
  const [totalCostUsd, setTotalCostUsd] = useState(0);
  const [systemHealth, setSystemHealth] = useState<Record<string, unknown>>({});
  const [serviceProbes, setServiceProbes] = useState<ServiceProbe[]>([
    { label: "AgentFlow monitor", status: "unknown", detail: "probing" },
    { label: "LIMEN relay", status: "unknown", detail: "probing" },
  ]);
  const [streaming, setStreaming] = useState<Record<string, string>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const feedEndRef = useRef<HTMLDivElement>(null);

  const applySnapshot = useCallback((snapshot: SnapshotState) => {
    const nextAgents = (Array.isArray(snapshot.agents) ? snapshot.agents : [])
      .map(normalizeAgent)
      .filter((item): item is WorkerAgent => item !== null)
      .sort((a, b) => {
        if (a.name === "main") return -1;
        if (b.name === "main") return 1;
        return a.name.localeCompare(b.name);
      });
    const nextNodes = (Array.isArray(snapshot.nodes) ? snapshot.nodes : [])
      .map(normalizeNode)
      .filter((item): item is WorkerNode => item !== null)
      .sort((a, b) => a.node.localeCompare(b.node));

    if (nextAgents.length > 0) {
      setAgents(nextAgents);
      setTarget((current) =>
        nextAgents.some((agent) => agent.name === current)
          ? current
          : nextAgents[0].name,
      );
    }
    if (nextNodes.length > 0) setNodes(nextNodes);
    setFeed(normalizeFeed(snapshot));
    setSystemHealth(snapshot.system_health ?? {});
    setTotalCostUsd(
      typeof snapshot.total_cost_usd === "number" ? snapshot.total_cost_usd : 0,
    );
  }, []);

  const pushChat = useCallback((message: ChatMsg) => {
    setChat((current) => [...current, message].slice(-200));
  }, []);

  const probeServices = useCallback(async () => {
    const next: ServiceProbe[] = [];

    let actorProbe: ServiceProbe = {
      label: "AgentFlow monitor",
      status: "offline",
      detail: "unreachable",
    };
    for (const url of getActorApiCandidates()) {
      try {
        const result = await fetchJson(url);
        const actors = Array.isArray(result) ? result.length : 0;
        actorProbe = {
          label: "AgentFlow monitor",
          status: "online",
          detail: actors > 0 ? `${actors} actor records` : "reachable",
        };
        break;
      } catch {
        actorProbe = {
          label: "AgentFlow monitor",
          status: "offline",
          detail: url,
        };
      }
    }
    next.push(actorProbe);

    let relayProbe: ServiceProbe = {
      label: "LIMEN relay",
      status: "offline",
      detail: "unreachable",
    };
    for (const url of getRelayCandidates()) {
      try {
        const result = await fetchJson(url);
        const ok = Boolean((result as Record<string, unknown>).ok);
        relayProbe = {
          label: "LIMEN relay",
          status: ok ? "online" : "unknown",
          detail: ok ? "bridge + relay healthy" : "reachable",
        };
        break;
      } catch {
        relayProbe = {
          label: "LIMEN relay",
          status: "offline",
          detail: url,
        };
      }
    }
    next.push(relayProbe);

    setServiceProbes(next);
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimerRef.current !== null) return;
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      connectWebSocket();
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectWebSocket = useCallback(() => {
    const candidates = getWsCandidates();
    const targetUrl = candidates[0];
    try {
      setConnected((current) => (current === "live" ? current : "connecting"));
      const ws = new WebSocket(targetUrl);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setConnected("live");
      });

      ws.addEventListener("message", (event) => {
        let payload: Record<string, unknown>;
        try {
          payload = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        switch (payload.type) {
          case "full_snapshot":
            applySnapshot((payload.state as SnapshotState | undefined) ?? {});
            break;
          case "patch":
            applySnapshot((payload.state as SnapshotState | undefined) ?? {});
            break;
          case "config":
            setChatMode(
              payload.chat_mode === "direct_ws" ? "direct_ws" : "mqtt",
            );
            break;
          case "chat":
            setStreaming((current) => {
              const next = { ...current };
              delete next[String(payload.from ?? "io-gateway")];
              return next;
            });
            pushChat({
              id: uid("chat"),
              from: String(payload.from ?? "io-gateway"),
              to: "user",
              content: String(payload.content ?? ""),
              ts: Date.now(),
            });
            break;
          case "stream_chunk":
            setStreaming((current) => ({
              ...current,
              [String(payload.from ?? "io-gateway")]:
                `${current[String(payload.from ?? "io-gateway")] ?? ""}${String(payload.content ?? "")}`,
            }));
            break;
          case "stream_end":
            setStreaming((current) => {
              const from = String(payload.from ?? "io-gateway");
              const content = current[from];
              if (content?.trim()) {
                pushChat({
                  id: uid("chat"),
                  from,
                  to: "user",
                  content,
                  ts: Date.now(),
                });
              }
              const next = { ...current };
              delete next[from];
              return next;
            });
            break;
          default:
            break;
        }
      });

      ws.addEventListener("close", () => {
        wsRef.current = null;
        setConnected("demo");
        scheduleReconnect();
      });

      ws.addEventListener("error", () => {
        setConnected("demo");
      });
    } catch {
      setConnected("demo");
      scheduleReconnect();
    }
  }, [applySnapshot, pushChat, scheduleReconnect]);

  useEffect(() => {
    connectWebSocket();
    void probeServices();
    const probeTimer = window.setInterval(() => {
      void probeServices();
    }, 15_000);
    return () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      window.clearInterval(probeTimer);
      wsRef.current?.close();
    };
  }, [connectWebSocket, probeServices]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, streaming, target]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feed]);

  const sendCommand = useCallback(
    (agentId: string, command: "pause" | "resume" | "stop" | "delete") => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(
        JSON.stringify({ type: "command", agent_id: agentId, command }),
      );
    },
    [],
  );

  const sendMessage = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    // Always send the message as-is to main. The sidebar "target" is just a
    // conversation context filter — not a routing directive. Users who want to
    // explicitly delegate to an agent can type @agent-name manually.
    // (ML/monitoring agents don't handle text queries; main answers about them.)
    const content = trimmed;
    pushChat({
      id: uid("chat"),
      from: "user",
      to: target,
      content: trimmed,
      ts: Date.now(),
    });
    setInput("");

    if (
      chatMode === "direct_ws" &&
      wsRef.current?.readyState === WebSocket.OPEN
    ) {
      wsRef.current.send(JSON.stringify({ type: "chat", content }));
    } else {
      // Always route to main (agent_name: "main") — main handles @routing internally.
      // Response is tagged to the same target so per-agent threads stay coherent.
      setStreaming((cur) => ({ ...cur, ["io-gateway"]: "" }));
      try {
        const res = await fetch("/af/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: content, agent_name: "main" }),
        });
        const json = (await res.json()) as {
          response?: string;
          error?: string;
        };
        const text = json.response ?? json.error ?? "(no response)";
        // Tag response to target so it appears in the right per-agent thread.
        pushChat({
          id: uid("chat"),
          from: "io-gateway",
          to: target,
          content: text,
          ts: Date.now(),
        });
      } catch (err) {
        pushChat({
          id: uid("chat"),
          from: "system",
          to: target,
          content: `Error: ${String(err)}`,
          ts: Date.now(),
        });
      } finally {
        setStreaming((cur) => {
          const n = { ...cur };
          delete n["io-gateway"];
          return n;
        });
      }
    }
  }, [input, pushChat, target, chatMode]);

  const targetThread = useMemo(() => {
    // Each message is tagged with both `from` and `to`.
    // User messages: from="user", to=target (agent selected when sent).
    // Main responses: from="io-gateway", to=target (agent the message was about).
    // WS messages: from=agent-name, to="user" (legacy, still show in main thread).
    const filtered = chat.filter((msg) => {
      if (msg.from === "user") return msg.to === target;
      if (msg.to === target) return true; // io-gateway reply tagged to this agent
      if (target === "main") return msg.to === "user" || msg.to === "main"; // main thread shows legacy WS msgs
      return false;
    });
    // Streaming: always shown when io-gateway is waiting (response tied to current target)
    const isStreaming = "io-gateway" in streaming;
    const streamed = isStreaming
      ? [
          {
            id: "stream-io-gateway",
            from: "io-gateway",
            to: target,
            content: streaming["io-gateway"] ?? "",
            ts: Date.now(),
            streaming: true,
          },
        ]
      : [];
    return [...filtered, ...streamed].sort((a, b) => a.ts - b.ts);
  }, [chat, streaming, target]);

  const healthyCount = agents.filter(
    (agent) => stateLabel(agent.state) === "running",
  ).length;
  const totalCount = agents.length;
  const onlineNodes = nodes.filter((node) => node.online).length;
  const totalMessages = agents.reduce(
    (sum, agent) => sum + (agent.messagesProcessed ?? 0),
    0,
  );
  const semanticSignals = Object.keys(systemHealth).length;

  return (
    <div className="af-root">
      <div className="af-header">
        <div className="af-header-left">
          <AgentFlowIcon size={28} />
          <span className="af-title">Workers</span>
          <span className={`af-conn-badge af-conn-${connected}`}>
            {connected === "live"
              ? "● AgentFlow live"
              : connected === "connecting"
                ? "○ Connecting…"
                : "◎ Demo fallback"}
          </span>
        </div>
        <div className="af-header-center">
          <span className="af-health">
            {healthyCount}/{totalCount} workers healthy • {onlineNodes}/
            {nodes.length} nodes online
          </span>
        </div>
        <div className="af-header-right">
          {(["overview", "feed", "chat", "limen"] as View[]).map((item) => (
            <button
              key={item}
              className={`af-view-btn${view === item ? " active" : ""}`}
              onClick={() => setView(item)}
            >
              {item === "overview"
                ? "◫ Overview"
                : item === "feed"
                  ? "≡ Feed"
                  : item === "chat"
                    ? "💬 Chat"
                    : "🧠 Limen"}
            </button>
          ))}
        </div>
      </div>

      <div className="af-body">
        {view === "overview" && (
          <div className="af-overview">
            <div className="af-stats-grid">
              <StatCard
                label="Workers"
                value={String(totalCount)}
                detail={`${healthyCount} running`}
                accent="#60a5fa"
              />
              <StatCard
                label="Messages"
                value={String(totalMessages)}
                detail="processed across workers"
                accent="#22d3a0"
              />
              <StatCard
                label="Cost"
                value={`$${totalCostUsd.toFixed(4)}`}
                detail="reported by AgentFlow"
                accent="#f59e0b"
              />
              <StatCard
                label="Semantic Signals"
                value={String(semanticSignals)}
                detail="keys from LIMEN health/state"
                accent="#8b5cf6"
              />
            </div>

            <div className="af-overview-panels">
              <section className="af-panel">
                <div className="af-panel-head">
                  <h3>Workers</h3>
                  <span>
                    {chatMode === "direct_ws"
                      ? "direct ws chat"
                      : "mqtt chat path"}
                  </span>
                </div>
                <div className="af-cards-grid">
                  {agents.map((agent) => (
                    <WorkerCard
                      key={agent.id}
                      agent={agent}
                      onCommand={sendCommand}
                      onChat={() => {
                        setTarget(agent.name);
                        setView("chat");
                      }}
                    />
                  ))}
                </div>
              </section>

              <section className="af-panel">
                <div className="af-panel-head">
                  <h3>Nodes</h3>
                  <span>from AgentFlow monitor snapshot</span>
                </div>
                <div className="af-node-list">
                  {nodes.map((node) => (
                    <div key={node.node} className="af-node-item">
                      <div>
                        <div className="af-node-name">{node.node}</div>
                        <div className="af-node-meta">
                          {node.agents.join(", ") || "no agents"}
                        </div>
                      </div>
                      <span
                        className={`af-node-pill${node.online ? " online" : ""}`}
                      >
                        {node.online ? "online" : "offline"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        )}

        {view === "feed" && (
          <div className="af-feed">
            {feed.map((item) => (
              <div
                key={item.id}
                className={`af-feed-item af-feed-${item.kind}`}
              >
                <span className="af-feed-icon">
                  {feedGlyph(item.kind, item.severity)}
                </span>
                <span className="af-feed-time">
                  {new Date(item.ts).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span className="af-feed-agent">{item.agentName}</span>
                <span className="af-feed-text">{item.text}</span>
              </div>
            ))}
            <div ref={feedEndRef} />
          </div>
        )}

        {view === "chat" && (
          <div className="af-chat">
            {/* Sidebar — agent list with search */}
            <div className="af-chat-sidebar">
              <div className="af-chat-sidebar-search">
                <input
                  placeholder="Filter agents…"
                  value={sidebarSearch}
                  onChange={(e) => setSidebarSearch(e.target.value)}
                />
              </div>
              <div className="af-chat-agent-list">
                {agents
                  .filter(
                    (a) =>
                      !sidebarSearch ||
                      a.name
                        .toLowerCase()
                        .includes(sidebarSearch.toLowerCase()),
                  )
                  .map((agent) => (
                    <button
                      key={agent.id}
                      className={`af-chat-agent-row${target === agent.name ? " active" : ""}`}
                      onClick={() => setTarget(agent.name)}
                    >
                      <span
                        className="af-chat-agent-dot"
                        style={{ background: stateColor(agent.state) }}
                      />
                      <span className="af-chat-agent-name">{agent.name}</span>
                    </button>
                  ))}
              </div>
            </div>

            {/* Conversation pane */}
            <div className="af-chat-pane">
              {(() => {
                const activeAgent = agents.find((a) => a.name === target);
                const isMain = target === "main";
                return (
                  <div className="af-chat-pane-header">
                    {activeAgent && (
                      <span
                        className="af-chat-agent-dot"
                        style={{ background: stateColor(activeAgent.state) }}
                      />
                    )}
                    <span className="af-chat-pane-title">@{target}</span>
                    {activeAgent && (
                      <span className="af-chat-pane-state">
                        {stateLabel(activeAgent.state)}
                      </span>
                    )}
                    {!isMain && (
                      <span
                        className="af-chat-pane-via"
                        title="This is a context filter — all messages go to @main. Type @agent-name to delegate directly."
                      >
                        context · all msgs → @main
                      </span>
                    )}
                  </div>
                );
              })()}
              <div className="af-chat-thread">
                {targetThread.filter((m) => !m.id.startsWith("stream-"))
                  .length === 0 &&
                  !("io-gateway" in streaming) && (
                    <div className="af-chat-empty">
                      {target === "main" ? (
                        <p>
                          Say hello to <strong>@main</strong> — the system
                          orchestrator.
                        </p>
                      ) : (
                        <>
                          <p>
                            No messages in <strong>@{target}</strong> context
                            yet.
                          </p>
                          <p style={{ fontSize: 11, opacity: 0.5 }}>
                            Messages go to @main. Type{" "}
                            <code>@{target} ...</code> to delegate directly.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                {targetThread.map((msg) => (
                  <div
                    key={msg.id}
                    className={`af-chat-msg af-chat-msg-${msg.from === "user" ? "user" : "agent"}${msg.id.startsWith("stream-") ? " streaming" : ""}`}
                  >
                    <div className="af-chat-msg-from">
                      {msg.from === "io-gateway" && target !== "main"
                        ? `main → @${target}`
                        : msg.from}
                    </div>
                    <div className="af-chat-msg-bubble">
                      {msg.content ||
                        (msg.id.startsWith("stream-") ? null : "…")}
                      {msg.id.startsWith("stream-") && (
                        <span className="af-stream-caret">▍</span>
                      )}
                    </div>
                    {!msg.id.startsWith("stream-") && (
                      <div className="af-chat-msg-time">
                        {new Date(msg.ts).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            </div>
          </div>
        )}

        {view === "limen" && (
          <div className="af-limen">
            <section className="af-panel">
              <div className="af-panel-head">
                <h3>Service Probes</h3>
                <span>live reachability from this shell</span>
              </div>
              <div className="af-service-grid">
                {serviceProbes.map((probe) => (
                  <div key={probe.label} className="af-service-card">
                    <div className="af-service-top">
                      <span>{probe.label}</span>
                      <span
                        className={`af-node-pill${probe.status === "online" ? " online" : ""}`}
                      >
                        {probe.status}
                      </span>
                    </div>
                    <div className="af-service-detail">{probe.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="af-panel">
              <div className="af-panel-head">
                <h3>LIMEN Layers</h3>
                <span>
                  adapted from /home/tam/Projects/waldiez/limen/README.md
                </span>
              </div>
              <div className="af-limen-grid">
                {LIMEN_LAYERS.map((layer) => (
                  <div key={layer.name} className="af-limen-card">
                    <div className="af-limen-card-title">{layer.name}</div>
                    <div className="af-limen-card-text">{layer.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="af-panel">
              <div className="af-panel-head">
                <h3>Semantic Foundations</h3>
                <span>normative stack referenced by LIMEN</span>
              </div>
              <div className="af-limen-grid af-limen-grid-compact">
                {LIMEN_FOUNDATIONS.map((item) => (
                  <div key={item.name} className="af-limen-card">
                    <div className="af-limen-card-title">{item.name}</div>
                    <div className="af-limen-card-text">{item.detail}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className="af-panel">
              <div className="af-panel-head">
                <h3>Bridge Topics</h3>
                <span>from crates/limen-core/src/agentflow.rs</span>
              </div>
              <div className="af-bridge-list">
                {BRIDGE_TOPICS.map((topic) => (
                  <div key={topic} className="af-bridge-item">
                    {topic}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      <div className="af-iobar">
        <select
          className="af-target-select"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        >
          {agents.map((agent) => (
            <option key={agent.id} value={agent.name}>
              @{agent.name}
            </option>
          ))}
        </select>
        <input
          className="af-iobar-input selectable"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendMessage();
            }
          }}
          placeholder={
            target === "main"
              ? "Message @main…"
              : `Context: @${target} — asking @main…`
          }
        />
        <button
          className="af-send-btn"
          onClick={sendMessage}
          disabled={!input.trim()}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path
              d="M1 13L13 7 1 1v4.5l8.5 1.5-8.5 1.5V13z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

function WorkerCard({
  agent,
  onCommand,
  onChat,
}: {
  agent: WorkerAgent;
  onCommand: (
    agentId: string,
    command: "pause" | "resume" | "stop" | "delete",
  ) => void;
  onChat: () => void;
}) {
  const status = stateLabel(agent.state);
  const accent = stateColor(agent.state);
  const typeColor = agentTypeColor(agent.agentType);
  return (
    <div className="af-card">
      <div
        className="af-card-state-dot"
        style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
      />
      <div
        className="af-card-type-badge"
        style={{ color: typeColor, borderColor: `${typeColor}55` }}
      >
        {agent.agentType ?? "worker"}
      </div>
      <div className="af-card-name">{agent.name}</div>
      <div className="af-card-state-label" style={{ color: accent }}>
        {status}
      </div>
      <div className="af-card-meta">
        <span>♥ {ago(agent.lastHeartbeatAt)}</span>
        <span>{agent.messagesProcessed ?? 0} msgs</span>
        {typeof agent.costUsd === "number" && (
          <span>${agent.costUsd.toFixed(4)}</span>
        )}
      </div>
      {agent.task && <div className="af-card-task">{agent.task}</div>}
      <div className="af-card-controls">
        <button className="af-mini-btn" onClick={onChat}>
          Chat
        </button>
        {status === "running" && (
          <button
            className="af-mini-btn"
            onClick={() => onCommand(agent.id, "pause")}
          >
            Pause
          </button>
        )}
        {status === "paused" && (
          <button
            className="af-mini-btn"
            onClick={() => onCommand(agent.id, "resume")}
          >
            Resume
          </button>
        )}
        {!agent.protected && status !== "stopped" && (
          <button
            className="af-mini-btn danger"
            onClick={() => onCommand(agent.id, "stop")}
          >
            Stop
          </button>
        )}
      </div>
      {agent.protected && (
        <div className="af-card-protected" title="Protected worker">
          🔒
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
}) {
  return (
    <div className="af-stat-card" style={{ borderColor: `${accent}44` }}>
      <div className="af-stat-label">{label}</div>
      <div className="af-stat-value" style={{ color: accent }}>
        {value}
      </div>
      <div className="af-stat-detail">{detail}</div>
    </div>
  );
}

function feedGlyph(kind: WorkerFeedItem["kind"], severity?: string): string {
  if (kind === "spawn") return "⚡";
  if (kind === "chat") return "💬";
  if (kind === "heartbeat") return "♥";
  if (kind === "command") return "⌘";
  if (kind === "alert")
    return severity === "error" || severity === "critical" ? "🔴" : "🟡";
  if (kind === "status") return "◎";
  return "·";
}
