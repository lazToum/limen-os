#!/usr/bin/env bun
/**
 * ha-agent.ts — Local HA proxy agent for Limen OS
 *
 * Run this on any machine that can reach Home Assistant (laptop, Pi, BeagleBone…).
 * It connects OUTBOUND to the Limen EC2 server via WebSocket, so it works
 * through NAT without any SSH tunnel or port forwarding.
 *
 * Usage:
 *   bun scripts/ha-agent.ts
 *   HA_LOCAL_HOST=homeassistant.local bun scripts/ha-agent.ts
 *   HA_LOCAL_HOST=192.168.1.10 HA_AGENT_SECRET=mysecret bun scripts/ha-agent.ts
 *
 * Env vars:
 *   EC2_WS_URL       WebSocket URL of the Limen server  (default: wss://io.waldiez.io/ha-agent)
 *   HA_LOCAL_HOST    Hostname/IP of local HA              (default: homeassistant.local)
 *   HA_LOCAL_PORT    HA HTTP port                         (default: 8123)
 *   HA_AGENT_SECRET  Shared secret (must match server)    (default: empty = no auth)
 */

const EC2_WS_URL = process.env.EC2_WS_URL ?? "wss://io.waldiez.io/ha-agent";
const HA_HOST = process.env.HA_LOCAL_HOST ?? "homeassistant.local";
const HA_PORT = process.env.HA_LOCAL_PORT ?? "8123";
const SECRET = process.env.HA_AGENT_SECRET ?? "";

const HA_ORIGIN = `http://${HA_HOST}:${HA_PORT}`;
const HA_WS_ORIGIN = `ws://${HA_HOST}:${HA_PORT}`;
const agentUrl = SECRET
  ? `${EC2_WS_URL}?secret=${encodeURIComponent(SECRET)}`
  : EC2_WS_URL;

// Active WS sub-channels to local HA: channelId → WebSocket
const channels = new Map<string, WebSocket>();

const HOP_BY_HOP = new Set([
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

function connect() {
  console.log(`[ha-agent] Connecting → ${EC2_WS_URL}`);
  const ws = new WebSocket(agentUrl);

  ws.onopen = () => {
    console.log(`[ha-agent] Ready — proxying ${HA_ORIGIN}`);
  };

  ws.onmessage = async (ev) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(ev.data));
    } catch {
      return;
    }

    if (msg.type === "http") {
      await handleHttp(ws, msg);
    } else if (msg.type === "ws_open") {
      handleWsOpen(ws, msg);
    } else if (msg.type === "ws_msg") {
      const ch = channels.get(msg.id as string);
      if (ch?.readyState === WebSocket.OPEN) {
        ch.send(
          msg.binary
            ? Buffer.from(msg.data as string, "base64")
            : (msg.data as string),
        );
      }
    } else if (msg.type === "ws_close") {
      const ch = channels.get(msg.id as string);
      ch?.close();
      channels.delete(msg.id as string);
    }
  };

  ws.onclose = (e) => {
    console.log(
      `[ha-agent] Disconnected (code ${e.code}). Reconnecting in 5s…`,
    );
    setTimeout(connect, 5000);
  };

  ws.onerror = () => {
    console.error("[ha-agent] Connection error — will retry");
  };
}

async function handleHttp(ws: WebSocket, msg: Record<string, unknown>) {
  const id = msg.id as string;
  const method = msg.method as string;
  const path = msg.path as string;

  const reqHeaders: Record<string, string> = { host: `${HA_HOST}:${HA_PORT}` };
  for (const [k, v] of Object.entries(
    (msg.headers as Record<string, string>) ?? {},
  )) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) reqHeaders[k] = v;
  }

  try {
    const body =
      msg.body && method !== "GET" && method !== "HEAD"
        ? Buffer.from(msg.body as string, "base64")
        : undefined;

    const resp = await fetch(`${HA_ORIGIN}${path}`, {
      method,
      headers: reqHeaders,
      body: body ?? undefined,
      redirect: "follow",
    });

    const respHeaders: Record<string, string> = {};
    resp.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });

    ws.send(
      JSON.stringify({
        id,
        type: "http",
        status: resp.status,
        headers: respHeaders,
        body: Buffer.from(await resp.arrayBuffer()).toString("base64"),
      }),
    );
  } catch (e) {
    ws.send(
      JSON.stringify({
        id,
        type: "http",
        status: 502,
        headers: {},
        body: Buffer.from(String(e)).toString("base64"),
      }),
    );
  }
}

function handleWsOpen(agentWs: WebSocket, msg: Record<string, unknown>) {
  const id = msg.id as string;
  const path = msg.path as string;
  const haWs = new WebSocket(`${HA_WS_ORIGIN}${path}`);
  haWs.binaryType = "arraybuffer";

  haWs.onopen = () => {
    channels.set(id, haWs);
  };

  haWs.onmessage = (ev) => {
    const isBinary = ev.data instanceof ArrayBuffer;
    agentWs.send(
      JSON.stringify({
        id,
        type: "ws_msg",
        binary: isBinary,
        data: isBinary
          ? Buffer.from(ev.data as ArrayBuffer).toString("base64")
          : ev.data,
      }),
    );
  };

  haWs.onclose = () => {
    channels.delete(id);
    if (agentWs.readyState === WebSocket.OPEN)
      agentWs.send(JSON.stringify({ id, type: "ws_close" }));
  };

  haWs.onerror = () => {
    channels.delete(id);
    if (agentWs.readyState === WebSocket.OPEN)
      agentWs.send(JSON.stringify({ id, type: "ws_close" }));
  };
}

connect();
