/**
 * @limen-os/smart-cities-client
 * ================================
 * TypeScript client for smart city sensor data inside LIMEN OS.
 *
 * Provides:
 *   • Typed SPARQL query helpers for Fuseki (road users, weapons, parking)
 *   • React hooks: useRoadUsers, useWeaponAlerts, useParkingOccupancy
 *   • MQTT subscription helpers for live event streams
 *   • Safety alert management with severity escalation
 *
 * Usage:
 *   import { SmartCitiesClient, useWeaponAlerts } from "@limen-os/smart-cities-client";
 *
 *   const client = new SmartCitiesClient({ fusekiUrl: "http://localhost:3030/limen" });
 *   const alerts = await client.getWeaponAlerts({ since: "2026-01-01T00:00:00Z", minConfidence: 0.6 });
 *
 *   // React hook
 *   const { alerts, loading } = useWeaponAlerts({ pollingMs: 5000 });
 */

// ── Re-export everything ──────────────────────────────────────────────────────
export * from "./types";
export * from "./sparql";
export * from "./client";
export * from "./mqtt";
export * from "./hooks";
