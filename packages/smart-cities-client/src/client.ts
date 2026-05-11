/**
 * SmartCitiesClient — high-level API for smart city sensor data.
 *
 * Wraps SPARQL query helpers and provides a clean typed interface
 * for limen-os shell components.
 */

import type {
  SmartCitiesClientOptions,
  WeaponAlert,
  RoadUser,
  RoadDensityReport,
  ParkingLot,
  CityStatus,
  WeaponQueryOptions,
  RoadUserQueryOptions,
  ParkingQueryOptions,
} from "./types";

import {
  sparqlSelect,
  weaponAlertsQuery,
  roadUsersQuery,
  roadDensityQuery,
  parkingQuery,
  cityStatusQuery,
  mapWeaponAlerts,
  mapRoadUsers,
  mapRoadDensity,
  mapParkingLots,
  mapCityStatus,
} from "./sparql";

const DEFAULT_FUSEKI_URL = "http://localhost:3030/limen";
const DEFAULT_TIMEOUT_MS = 15_000;

export class SmartCitiesClient {
  private fusekiUrl: string;
  private weaponThreshold: number;
  private timeoutMs: number;

  constructor(opts: SmartCitiesClientOptions = {}) {
    this.fusekiUrl = (opts.fusekiUrl ?? DEFAULT_FUSEKI_URL).replace(/\/$/, "");
    this.weaponThreshold = opts.weaponThreshold ?? 0.6;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  // ── Weapon detection ──────────────────────────────────────────────────────

  async getWeaponAlerts(opts: WeaponQueryOptions = {}): Promise<WeaponAlert[]> {
    const threshold = opts.minConfidence ?? this.weaponThreshold;
    const rows = await sparqlSelect(
      this.fusekiUrl,
      weaponAlertsQuery({ ...opts, minConfidence: threshold }),
      this.timeoutMs,
    );
    return mapWeaponAlerts(rows, threshold);
  }

  async getActiveWeaponAlerts(): Promise<WeaponAlert[]> {
    const since = new Date(Date.now() - 3_600_000)
      .toISOString()
      .replace(".000Z", "Z");
    return this.getWeaponAlerts({ since });
  }

  async hasCriticalAlerts(): Promise<boolean> {
    const alerts = await this.getActiveWeaponAlerts();
    return alerts.some((a) => a.severity === "critical");
  }

  // ── Road users ────────────────────────────────────────────────────────────

  async getRoadUsers(opts: RoadUserQueryOptions = {}): Promise<RoadUser[]> {
    const rows = await sparqlSelect(
      this.fusekiUrl,
      roadUsersQuery(opts),
      this.timeoutMs,
    );
    return mapRoadUsers(rows);
  }

  async getRoadDensity(): Promise<RoadDensityReport> {
    const rows = await sparqlSelect(
      this.fusekiUrl,
      roadDensityQuery(),
      this.timeoutMs,
    );
    return mapRoadDensity(rows);
  }

  // ── Parking ───────────────────────────────────────────────────────────────

  async getParkingOccupancy(
    opts: ParkingQueryOptions = {},
  ): Promise<ParkingLot[]> {
    const rows = await sparqlSelect(
      this.fusekiUrl,
      parkingQuery(opts),
      this.timeoutMs,
    );
    return mapParkingLots(rows);
  }

  async getAverageOccupancyRate(): Promise<number> {
    const lots = await this.getParkingOccupancy();
    if (lots.length === 0) return 0;
    return lots.reduce((sum, l) => sum + l.occupancyRate, 0) / lots.length;
  }

  // ── City status ───────────────────────────────────────────────────────────

  async getCityStatus(): Promise<CityStatus> {
    const [statusRows, alertsCount, roadDensity, avgParking] =
      await Promise.all([
        sparqlSelect(this.fusekiUrl, cityStatusQuery(), this.timeoutMs),
        this.getActiveWeaponAlerts()
          .then((a) => a.length)
          .catch(() => 0),
        this.getRoadDensity().catch(() => ({ total: 0 }) as RoadDensityReport),
        this.getAverageOccupancyRate().catch(() => 0),
      ]);

    const partial = mapCityStatus(statusRows);
    return {
      totalObservations: partial.totalObservations ?? 0,
      observationsByType: partial.observationsByType ?? {},
      activeWeaponAlerts: alertsCount,
      roadUserCount: roadDensity.total,
      parkingOccupancyRate: avgParking,
      timestamp: new Date().toISOString(),
    };
  }

  // ── Raw SPARQL ────────────────────────────────────────────────────────────

  async query(
    sparql: string,
  ): Promise<Record<string, { type: string; value: string }>[]> {
    return sparqlSelect(this.fusekiUrl, sparql, this.timeoutMs);
  }
}
