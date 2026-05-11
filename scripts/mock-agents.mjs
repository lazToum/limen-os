#!/usr/bin/env node
/**
 * mock-agents.mjs — Fake MQTT broker + agent stream for AgentFlow dev mode.
 *
 * Spawns a minimal WebSocket server on ws://localhost:9001 that speaks just
 * enough of the MQTT 3.1.1 binary protocol for the AgentFlowContent dashboard
 * to connect, subscribe, and receive live updates.
 *
 * Topics mirrored from patato4:
 *   agents/{id}/heartbeat  — agent still alive
 *   agents/{id}/spawn      — new agent appeared
 *   agents/{id}/status     — state change
 *   agents/{id}/alert      — warning / error
 *   agents/{id}/chat       — chat message from agent
 *   system/health          — global health score
 *   io/chat                — user → agent messages
 *
 * Usage:
 *   node scripts/mock-agents.mjs
 *   # or via make:
 *   make mock-agents
 */

import { createServer } from "http";
import { WebSocketServer } from "ws";

const PORT = 9001;

// ── Minimal MQTT 3.1.1 binary helpers ────────────────────────────────────────

function encodeLength(n) {
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return Buffer.from(out);
}

function utf8(str) {
  const b = Buffer.from(str, "utf8");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(b.length);
  return Buffer.concat([len, b]);
}

/** Build a minimal MQTT CONNACK (connection accepted). */
function connack() {
  // Fixed header: 0x20 (CONNACK), remaining=2
  // Variable header: session-present=0, return-code=0 (accepted)
  return Buffer.from([0x20, 0x02, 0x00, 0x00]);
}

/** Build a SUBACK for packet-id. */
function suback(packetId) {
  const pid = Buffer.alloc(2);
  pid.writeUInt16BE(packetId);
  // QoS granted = 0x00
  return Buffer.concat([Buffer.from([0x90, 0x03]), pid, Buffer.from([0x00])]);
}

/** Build a PUBLISH frame (QoS 0). */
function publish(topic, payload) {
  const topicBuf = utf8(topic);
  const payloadBuf = Buffer.from(
    typeof payload === "string" ? payload : JSON.stringify(payload),
    "utf8"
  );
  const remaining = topicBuf.length + payloadBuf.length;
  return Buffer.concat([
    Buffer.from([0x30]),   // PUBLISH, QoS 0, no retain
    encodeLength(remaining),
    topicBuf,
    payloadBuf,
  ]);
}

/** Parse a CONNECT packet; return client-id string or null. */
function parseConnect(buf) {
  if (buf[0] !== 0x10) return null;
  // Skip remaining-length bytes (1–4)
  let i = 1;
  while (buf[i] & 0x80) i++;
  i++; // past remaining length
  // Protocol name length (should be 4 → "MQTT")
  const nameLen = buf.readUInt16BE(i); i += 2 + nameLen;
  i += 1; // protocol level
  i += 1; // connect flags
  i += 2; // keep-alive
  const clientIdLen = buf.readUInt16BE(i); i += 2;
  return buf.slice(i, i + clientIdLen).toString("utf8");
}

/** Parse a SUBSCRIBE packet; return { packetId, topics }. */
function parseSubscribe(buf) {
  // buf[0] should be 0x82
  let i = 1;
  while (buf[i] & 0x80) i++;
  i++;
  const packetId = buf.readUInt16BE(i); i += 2;
  const topics = [];
  while (i < buf.length) {
    const len = buf.readUInt16BE(i); i += 2;
    topics.push(buf.slice(i, i + len).toString("utf8")); i += len;
    i++; // QoS byte
  }
  return { packetId, topics };
}

// ── Fake agents ───────────────────────────────────────────────────────────────

const AGENTS = [
  { id: "main-actor",    label: "MainActor",    type: "orchestrator", model: "claude-opus-4-6" },
  { id: "monitor",       label: "Monitor",      type: "monitor",      model: "claude-haiku-4-5" },
  { id: "ml-agent",      label: "ML Agent",     type: "dynamic",      model: "gpt-4o-mini" },
  { id: "data-fetcher",  label: "DataFetcher",  type: "dynamic",      model: "gemini-flash" },
];

const STATUSES = ["idle", "running", "waiting", "error"];
const ALERT_MSGS = [
  "Memory usage above threshold",
  "API rate limit approaching",
  "Retrying failed subtask",
  "Checkpoint saved",
];
const CHAT_MSGS = [
  "Processing user request…",
  "Delegating subtask to ml-agent",
  "Fetching external data source",
  "Consolidating results",
  "All subtasks complete ✓",
  "Encountered error, retrying",
];

function randOf(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

// ── WebSocket server ──────────────────────────────────────────────────────────

const http = createServer();
const wss = new WebSocketServer({ server: http });

const clients = new Set();

wss.on("connection", (ws) => {
  let connected = false;

  ws.on("message", (data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    const type = buf[0] & 0xf0;

    if (type === 0x10) {
      // CONNECT
      const clientId = parseConnect(buf) || "anon";
      console.log(`[mqtt] CONNECT from ${clientId}`);
      ws.send(connack());
      connected = true;
      clients.add(ws);

      // Immediately publish spawn events for all fake agents
      for (const agent of AGENTS) {
        ws.send(publish(`agents/${agent.id}/spawn`, {
          id: agent.id, label: agent.label, type: agent.type,
          model: agent.model, state: "idle", ts: Date.now(),
        }));
      }
    } else if (type === 0x80 && connected) {
      // SUBSCRIBE
      const { packetId } = parseSubscribe(buf);
      ws.send(suback(packetId));
    } else if (type === 0xe0) {
      // DISCONNECT
      clients.delete(ws);
    }
  });

  ws.on("close", () => { clients.delete(ws); });
  ws.on("error", () => { clients.delete(ws); });
});

/** Broadcast a publish frame to all connected clients. */
function broadcast(topic, payload) {
  const frame = publish(topic, payload);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) ws.send(frame);
  }
}

// ── Simulation loop ───────────────────────────────────────────────────────────

// Heartbeat every 4s per agent
for (const agent of AGENTS) {
  setInterval(() => {
    broadcast(`agents/${agent.id}/heartbeat`, {
      id: agent.id, ts: Date.now(), uptime: randInt(60, 3600),
    });
  }, 4000 + Math.random() * 2000);
}

// Status change every 8–15s per agent
for (const agent of AGENTS) {
  setInterval(() => {
    const state = randOf(STATUSES);
    broadcast(`agents/${agent.id}/status`, {
      id: agent.id, state, ts: Date.now(),
    });
  }, randInt(8000, 15000));
}

// Random alert every 20s
setInterval(() => {
  const agent = randOf(AGENTS);
  broadcast(`agents/${agent.id}/alert`, {
    id: agent.id, level: randOf(["info", "warn", "error"]),
    msg: randOf(ALERT_MSGS), ts: Date.now(),
  });
}, 20000);

// Agent chat messages every 5–10s
for (const agent of AGENTS) {
  setInterval(() => {
    broadcast(`agents/${agent.id}/chat`, {
      id: agent.id, role: "assistant",
      text: randOf(CHAT_MSGS), ts: Date.now(),
    });
  }, randInt(5000, 10000));
}

// System health every 10s
setInterval(() => {
  broadcast("system/health", {
    score: randInt(70, 100),
    agents: AGENTS.length,
    ts: Date.now(),
  });
}, 10000);

// ── Start ─────────────────────────────────────────────────────────────────────
http.listen(PORT, () => {
  console.log(`[mock-agents] MQTT WebSocket broker on ws://localhost:${PORT}`);
  console.log(`[mock-agents] Simulating ${AGENTS.length} agents`);
  console.log(`[mock-agents] Press Ctrl+C to stop`);
});
