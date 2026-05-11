/**
 * React hooks for smart city sensor data in LIMEN OS shell.
 *
 * All hooks support polling and live MQTT updates.
 * They degrade gracefully when Fuseki / MQTT are unavailable.
 *
 * Usage:
 *   import { useWeaponAlerts, useRoadUsers, useParkingOccupancy } from "@limen-os/smart-cities-client";
 *
 *   function SafetyWidget() {
 *     const { alerts, loading } = useWeaponAlerts({ pollingMs: 10_000 });
 *     return <div>{alerts.length} weapon alert(s)</div>;
 *   }
 */

// Lazy React import — this file only matters in React environments.
// When imported in Node.js / non-React contexts the hooks are defined
// but calling them will throw a normal React hooks-outside-component error.
import { useState, useEffect, useCallback, useRef } from "react";

import type {
  WeaponAlert,
  RoadUser,
  RoadDensityReport,
  ParkingLot,
  CityStatus,
  UseWeaponAlertsResult,
  UseRoadUsersResult,
  UseParkingOccupancyResult,
  UseCityStatusResult,
} from "./types";

import { SmartCitiesClient } from "./client";

// ── Shared client singleton ───────────────────────────────────────────────────

let _defaultClient: SmartCitiesClient | null = null;

function getDefaultClient(): SmartCitiesClient {
  if (!_defaultClient) {
    _defaultClient = new SmartCitiesClient({
      fusekiUrl: (typeof window !== "undefined"
        ? (window as unknown as Record<string, unknown>)["__LIMEN_FUSEKI_URL"]
        : undefined) as string | undefined,
    });
  }
  return _defaultClient;
}

export function setSmartCitiesClient(client: SmartCitiesClient): void {
  _defaultClient = client;
}

// ── Hook options ──────────────────────────────────────────────────────────────

export interface BaseHookOptions {
  /** Polling interval in ms (default: 15 000). Set to 0 to disable polling. */
  pollingMs?: number;
  /** Custom client instance (defaults to global singleton). */
  client?: SmartCitiesClient;
  /** Whether to fetch immediately on mount (default: true). */
  enabled?: boolean;
}

export interface WeaponHookOptions extends BaseHookOptions {
  minConfidence?: number;
  /** Time window in ms to look back for alerts (default: 3 600 000 = 1h). */
  windowMs?: number;
}

export interface RoadUserHookOptions extends BaseHookOptions {
  sensorId?: string;
}

export interface ParkingHookOptions extends BaseHookOptions {
  sensorId?: string;
}

// ── useWeaponAlerts ───────────────────────────────────────────────────────────

export function useWeaponAlerts(
  opts: WeaponHookOptions = {},
): UseWeaponAlertsResult {
  const {
    pollingMs = 15_000,
    client,
    enabled = true,
    minConfidence,
    windowMs = 3_600_000,
  } = opts;

  const [alerts, setAlerts] = useState<WeaponAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const mountedRef = useRef(true);

  const fetch_ = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(undefined);
    try {
      const c = client ?? getDefaultClient();
      const since = new Date(Date.now() - windowMs)
        .toISOString()
        .replace(".000Z", "Z");
      const result = await c.getWeaponAlerts({ since, minConfidence });
      if (mountedRef.current) setAlerts(result);
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client, enabled, minConfidence, windowMs]);

  useEffect(() => {
    mountedRef.current = true;
    void fetch_();
    if (!pollingMs) return;
    const id = setInterval(() => {
      void fetch_();
    }, pollingMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetch_, pollingMs]);

  return { alerts, loading, error, refresh: fetch_ };
}

// ── useRoadUsers ──────────────────────────────────────────────────────────────

export function useRoadUsers(
  opts: RoadUserHookOptions = {},
): UseRoadUsersResult {
  const { pollingMs = 5_000, client, enabled = true, sensorId } = opts;

  const [users, setUsers] = useState<RoadUser[]>([]);
  const [density, setDensity] = useState<RoadDensityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const mountedRef = useRef(true);

  const fetch_ = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(undefined);
    try {
      const c = client ?? getDefaultClient();
      const [u, d] = await Promise.all([
        c.getRoadUsers({ sensorId }),
        c.getRoadDensity(),
      ]);
      if (mountedRef.current) {
        setUsers(u);
        setDensity(d);
      }
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client, enabled, sensorId]);

  useEffect(() => {
    mountedRef.current = true;
    void fetch_();
    if (!pollingMs) return;
    const id = setInterval(() => {
      void fetch_();
    }, pollingMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetch_, pollingMs]);

  return { users, density, loading, error, refresh: fetch_ };
}

// ── useParkingOccupancy ───────────────────────────────────────────────────────

export function useParkingOccupancy(
  opts: ParkingHookOptions = {},
): UseParkingOccupancyResult {
  const { pollingMs = 30_000, client, enabled = true, sensorId } = opts;

  const [lots, setLots] = useState<ParkingLot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const mountedRef = useRef(true);

  const fetch_ = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(undefined);
    try {
      const c = client ?? getDefaultClient();
      const result = await c.getParkingOccupancy({ sensorId });
      if (mountedRef.current) setLots(result);
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client, enabled, sensorId]);

  useEffect(() => {
    mountedRef.current = true;
    void fetch_();
    if (!pollingMs) return;
    const id = setInterval(() => {
      void fetch_();
    }, pollingMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetch_, pollingMs]);

  return { lots, loading, error, refresh: fetch_ };
}

// ── useCityStatus ─────────────────────────────────────────────────────────────

export function useCityStatus(opts: BaseHookOptions = {}): UseCityStatusResult {
  const { pollingMs = 60_000, client, enabled = true } = opts;

  const [status, setStatus] = useState<CityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const mountedRef = useRef(true);

  const fetch_ = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(undefined);
    try {
      const c = client ?? getDefaultClient();
      const result = await c.getCityStatus();
      if (mountedRef.current) setStatus(result);
    } catch (e) {
      if (mountedRef.current) setError(String(e));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [client, enabled]);

  useEffect(() => {
    mountedRef.current = true;
    void fetch_();
    if (!pollingMs) return;
    const id = setInterval(() => {
      void fetch_();
    }, pollingMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [fetch_, pollingMs]);

  return { status, loading, error, refresh: fetch_ };
}

// ── useLiveWeaponAlerts (MQTT) ────────────────────────────────────────────────

import type { SmartCitiesMqttBridge } from "./mqtt";

export interface UseLiveWeaponAlertsResult {
  /** All alerts received since mount (most recent first). */
  alerts: WeaponAlert[];
  connected: boolean;
  clear: () => void;
}

/**
 * Subscribe to weapon alerts via MQTT for zero-latency notifications.
 * Falls back gracefully if MQTT is unavailable.
 */
export function useLiveWeaponAlerts(
  bridge: SmartCitiesMqttBridge,
): UseLiveWeaponAlertsResult {
  const [alerts, setAlerts] = useState<WeaponAlert[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    setConnected(true);
    const unsub = bridge.onWeaponAlert((alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 200)); // keep latest 200
    });
    return () => {
      unsub();
      setConnected(false);
    };
  }, [bridge]);

  const clear = useCallback(() => setAlerts([]), []);
  return { alerts, connected, clear };
}
