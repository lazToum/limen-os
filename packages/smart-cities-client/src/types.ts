/**
 * Domain types for smart city sensor data in LIMEN.
 * Mirrors the RDF model from smartCities_v2.
 */

// ── Road users ────────────────────────────────────────────────────────────────

export type VehicleClass =
  | "person"
  | "bicycle"
  | "car"
  | "motorcycle"
  | "bus"
  | "truck"
  | `unknown_class_${number}`;

export interface RoadUser {
  /** URI: https://data.diaedge.com/it/modina/road/road-users/<id> */
  uri: string;
  id: number;
  lat: number;
  lon: number;
  altitudeM?: number;
  speedMs: number;
  headingRad: number;
  vehicleClass: VehicleClass;
  sensorId: string;
  timestamp: string; // ISO 8601
  wid?: string;
}

export interface RoadDensityReport {
  bySensor: Record<string, number>; // sensorId → active user count
  total: number;
  timestamp: string;
}

// ── Weapon detection ──────────────────────────────────────────────────────────

export type WeaponAlertSeverity = "warning" | "critical";

export interface WeaponAlert {
  /** URI of the sosa:Observation */
  observationUri: string;
  sensorId: string;
  confidence: number; // 0.0 – 1.0
  threshold: number;
  severity: WeaponAlertSeverity;
  timestamp: string; // ISO 8601
  wid?: string;
  source: "sparql" | "mqtt";
}

// ── Parking ───────────────────────────────────────────────────────────────────

export interface ParkingSpace {
  uri: string;
  id: number | string;
  occupied: boolean;
  lat?: number;
  lon?: number;
}

export interface ParkingLot {
  sensorId: string;
  occupied: number;
  total: number;
  occupancyRate: number; // 0.0 – 1.0
  spaces?: ParkingSpace[];
  timestamp: string;
}

// ── Generic city status ───────────────────────────────────────────────────────

export interface CityStatus {
  totalObservations: number;
  observationsByType: Record<string, number>;
  activeWeaponAlerts: number;
  roadUserCount: number;
  parkingOccupancyRate: number; // average across all lots
  timestamp: string;
}

// ── Client config ─────────────────────────────────────────────────────────────

export interface SmartCitiesClientOptions {
  /** Fuseki SPARQL endpoint base URL — e.g. http://localhost:3030/limen */
  fusekiUrl?: string;
  /** MQTT broker WebSocket URL — e.g. ws://localhost:9001 */
  mqttWsUrl?: string;
  /** Minimum confidence for weapon alerts (default: 0.6) */
  weaponThreshold?: number;
  /** HTTP timeout in ms (default: 15000) */
  timeoutMs?: number;
}

// ── Query options ─────────────────────────────────────────────────────────────

export interface WeaponQueryOptions {
  since?: string; // ISO 8601
  minConfidence?: number;
  limit?: number;
}

export interface ParkingQueryOptions {
  sensorId?: string;
}

export interface RoadUserQueryOptions {
  sensorId?: string;
  limit?: number;
}

// ── Hook return types ─────────────────────────────────────────────────────────

export interface UseWeaponAlertsResult {
  alerts: WeaponAlert[];
  loading: boolean;
  error?: string;
  refresh: () => void;
}

export interface UseRoadUsersResult {
  users: RoadUser[];
  density: RoadDensityReport | null;
  loading: boolean;
  error?: string;
  refresh: () => void;
}

export interface UseParkingOccupancyResult {
  lots: ParkingLot[];
  loading: boolean;
  error?: string;
  refresh: () => void;
}

export interface UseCityStatusResult {
  status: CityStatus | null;
  loading: boolean;
  error?: string;
  refresh: () => void;
}
