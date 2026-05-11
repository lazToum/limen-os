/**
 * MQTT subscription helpers for live smart city event streams.
 *
 * Connects to the LIMEN MQTT broker (via WebSocket) and provides
 * typed subscriptions for weapon alerts, telemetry, and RDF streams.
 *
 * Note: uses a lazy-loaded MQTT client so this module is safe to import
 * in non-browser environments (SSR, Node.js) — it only connects when
 * subscribe() or connect() is called explicitly.
 */

import type { WeaponAlert } from "./types";

// ── Topic constants ───────────────────────────────────────────────────────────

export const TOPICS = {
  weaponAlerts: "limen/alerts/weapon",
  safetyAlerts: "limen/smartcities/safety/alerts",
  roadDensity: "limen/smartcities/road-density",
  parkingStatus: "limen/smartcities/status",
  telemetryAll: "limen/telemetry/#",
  telemetry: (sensorId: string) => `limen/telemetry/${sensorId}`,
  roadUserRdf: (sensorId: string) =>
    `limen/smartcities/road-user/${sensorId}/rdf`,
  weaponRdf: (sensorId: string) => `limen/smartcities/weapon/${sensorId}/rdf`,
  parkingRdf: (sensorId: string) =>
    `limen/smartcities/parking/${sensorId}/rdf`,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageHandler<T = unknown> = (data: T, topic: string) => void;
export type UnsubscribeFn = () => void;

export interface MqttBridgeOptions {
  /** MQTT broker WebSocket URL — e.g. ws://localhost:9001 */
  brokerUrl: string;
  clientId?: string;
  username?: string;
  password?: string;
}

// ── SmartCitiesMqttBridge ─────────────────────────────────────────────────────

/**
 * Lightweight MQTT bridge for smart city live streams.
 *
 * Uses the browser's native WebSocket transport (no native TCP).
 * Requires an MQTT broker with WebSocket support (Mosquitto 2.x default: port 9001).
 *
 * Example:
 *   const bridge = new SmartCitiesMqttBridge({ brokerUrl: "ws://localhost:9001" });
 *   await bridge.connect();
 *
 *   const unsub = bridge.onWeaponAlert((alert) => {
 *     console.log("ALERT", alert.confidence, alert.sensorId);
 *   });
 *
 *   // later...
 *   unsub();
 *   bridge.disconnect();
 */
export class SmartCitiesMqttBridge {
  private opts: MqttBridgeOptions;
  private _client: unknown = null;
  private _handlers: Map<string, Set<MessageHandler>> = new Map();

  constructor(opts: MqttBridgeOptions) {
    this.opts = opts;
  }

  async connect(): Promise<void> {
    // Dynamic import — mqtt.js is an optional peer dep; don't fail at import time
    const mqtt = await import("mqtt").catch(() => null);
    if (!mqtt) {
      console.warn(
        "[SmartCitiesMqttBridge] mqtt package not available — install: npm i mqtt",
      );
      return;
    }

    const clientId =
      this.opts.clientId ??
      `limen-sc-${Math.random().toString(36).slice(2, 8)}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (mqtt as any).connect(this.opts.brokerUrl, {
      clientId,
      username: this.opts.username,
      password: this.opts.password,
      protocolVersion: 5,
      reconnectPeriod: 3_000,
    });

    client.on("message", (topic: string, payload: Buffer) => {
      this._dispatch(topic, payload);
    });

    this._client = client;
  }

  disconnect(): void {
    if (this._client) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this._client as any).end(true);
      this._client = null;
    }
  }

  /**
   * Subscribe to an MQTT topic pattern.
   * Returns an unsubscribe function.
   */
  subscribe<T = unknown>(
    topic: string,
    handler: MessageHandler<T>,
  ): UnsubscribeFn {
    if (!this._handlers.has(topic)) {
      this._handlers.set(topic, new Set());
      if (this._client) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (this._client as any).subscribe(topic, { qos: 0 });
      }
    }
    this._handlers.get(topic)!.add(handler as MessageHandler);
    return () => {
      this._handlers.get(topic)?.delete(handler as MessageHandler);
    };
  }

  /** Convenience: subscribe to weapon alerts. */
  onWeaponAlert(handler: MessageHandler<WeaponAlert>): UnsubscribeFn {
    return this.subscribe<WeaponAlert>(TOPICS.weaponAlerts, handler);
  }

  /** Convenience: subscribe to safety alerts (weapon + future). */
  onSafetyAlert(handler: MessageHandler<WeaponAlert>): UnsubscribeFn {
    return this.subscribe<WeaponAlert>(TOPICS.safetyAlerts, handler);
  }

  /** Convenience: subscribe to road density updates. */
  onRoadDensity(
    handler: MessageHandler<{
      bySensor: Record<string, number>;
      total: number;
      timestamp: string;
    }>,
  ): UnsubscribeFn {
    return this.subscribe(TOPICS.roadDensity, handler);
  }

  /** Convenience: subscribe to parking status updates. */
  onParkingStatus(
    handler: MessageHandler<{
      parking: Array<{
        sensorId: string;
        occupied: number;
        total: number;
        occupancyRate: number;
      }>;
    }>,
  ): UnsubscribeFn {
    return this.subscribe(TOPICS.parkingStatus, handler);
  }

  /** Convenience: subscribe to all LIMEN telemetry. */
  onTelemetry(handler: MessageHandler<Record<string, unknown>>): UnsubscribeFn {
    return this.subscribe(TOPICS.telemetryAll, handler);
  }

  private _dispatch(topic: string, payload: Buffer): void {
    let data: unknown;
    const text = payload.toString("utf-8");
    try {
      data = JSON.parse(text);
    } catch {
      data = text; // Turtle RDF arrives as plain text
    }

    // Exact match
    if (this._handlers.has(topic)) {
      this._handlers.get(topic)!.forEach((h) => {
        try {
          h(data, topic);
        } catch (e) {
          console.error("[SmartCitiesMqttBridge]", e);
        }
      });
    }

    // Wildcard match (topic/#)
    for (const [pattern, handlers] of this._handlers) {
      if (pattern.endsWith("/#") && topic.startsWith(pattern.slice(0, -2))) {
        handlers.forEach((h) => {
          try {
            h(data, topic);
          } catch (e) {
            console.error("[SmartCitiesMqttBridge]", e);
          }
        });
      }
    }
  }
}
