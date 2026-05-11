/**
 * SPARQL query builders and Fuseki HTTP client for smart city data.
 */

import type {
  WeaponAlert,
  RoadUser,
  RoadDensityReport,
  ParkingLot,
  CityStatus,
  WeaponQueryOptions,
  RoadUserQueryOptions,
  ParkingQueryOptions,
} from "./types";

// ── Namespace prefixes ────────────────────────────────────────────────────────

const PREFIXES = `
PREFIX rdf:      <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX sosa:     <http://www.w3.org/ns/sosa/>
PREFIX sc:       <https://diaedge.com/ont/smart-cities#>
PREFIX xsd:      <http://www.w3.org/2001/XMLSchema#>
PREFIX dcterms:  <http://purl.org/dc/terms/>
PREFIX geo:      <http://www.opengis.net/ont/geosparql#>
PREFIX qudt:     <https://qudt.org/schema/qudt/>
PREFIX schema:   <https://schema.org/>
`.trim();

// ── Query builders ────────────────────────────────────────────────────────────

export function weaponAlertsQuery(opts: WeaponQueryOptions = {}): string {
  const since =
    opts.since ??
    new Date(Date.now() - 3_600_000).toISOString().replace(".000Z", "Z");
  const threshold = opts.minConfidence ?? 0.6;
  const limit = opts.limit ?? 100;
  return `${PREFIXES}
SELECT ?obs ?sensor ?confidence ?ts ?wid
FROM <urn:limen:events>
WHERE {
  ?obs a sosa:Observation ;
       sosa:observedProperty sc:DetectionConfidence ;
       sosa:madeBySensor ?sensor ;
       sosa:resultTime ?ts ;
       sosa:hasSimpleResult ?confidence .
  OPTIONAL { ?obs dcterms:identifier ?wid }
  FILTER (?confidence >= ${threshold})
  FILTER (?ts > "${since}"^^xsd:dateTime)
}
ORDER BY DESC(?confidence)
LIMIT ${limit}`;
}

export function roadUsersQuery(opts: RoadUserQueryOptions = {}): string {
  const sensorFilter = opts.sensorId
    ? `FILTER (STRENDS(STR(?sensor), "/${opts.sensorId}"))`
    : "";
  const limit = opts.limit ?? 500;
  return `${PREFIXES}
SELECT ?user ?userId ?sensor ?lat ?lon ?speed ?heading ?class ?ts
FROM <urn:limen:current>
WHERE {
  ?user a sc:RoadUser ;
        schema:identifier ?userId .
  ?posObs sosa:hasFeatureOfInterest ?user ;
          sosa:observedProperty sc:Position ;
          sosa:madeBySensor ?sensor ;
          sosa:resultTime ?ts ;
          sosa:hasResult ?posResult .
  ?posResult geo:asWKT ?wkt .
  OPTIONAL {
    ?speedObs sosa:hasFeatureOfInterest ?user ;
              sosa:observedProperty sc:Speed ;
              sosa:hasResult ?speedResult .
    ?speedResult qudt:value ?speed .
  }
  OPTIONAL {
    ?headObs sosa:hasFeatureOfInterest ?user ;
             sosa:observedProperty sc:Heading ;
             sosa:hasResult ?headResult .
    ?headResult qudt:value ?heading .
  }
  OPTIONAL {
    ?classObs sosa:hasFeatureOfInterest ?user ;
              sosa:observedProperty sc:ObjectClass ;
              sosa:hasResult ?classResult .
    ?classResult sc:objectClass/skos:prefLabel ?class .
  }
  BIND(xsd:decimal(STRBEFORE(STRAFTER(STR(?wkt), "POINT("), " ")) AS ?lon)
  BIND(xsd:decimal(STRAFTER(STRAFTER(STR(?wkt), "POINT("), " ")) AS ?lat)
  ${sensorFilter}
}
ORDER BY DESC(?ts)
LIMIT ${limit}`;
}

export function roadDensityQuery(): string {
  return `${PREFIXES}
SELECT ?sensor (COUNT(DISTINCT ?user) AS ?count)
FROM <urn:limen:current>
WHERE {
  ?obs a sosa:Observation ;
       sosa:observedProperty sc:ObjectDetection ;
       sosa:madeBySensor ?sensor ;
       sosa:hasFeatureOfInterest ?user .
  ?user a sc:RoadUser .
}
GROUP BY ?sensor
ORDER BY DESC(?count)`;
}

export function parkingQuery(opts: ParkingQueryOptions = {}): string {
  const sensorFilter = opts.sensorId
    ? `FILTER (STRENDS(STR(?sensor), "/${opts.sensorId}"))`
    : "";
  return `${PREFIXES}
SELECT ?sensor
  (SUM(IF(?occupied = "true"^^xsd:boolean, 1, 0)) AS ?occupiedCount)
  (COUNT(?space) AS ?total)
FROM <urn:limen:current>
WHERE {
  ?obs a sosa:Observation ;
       sosa:observedProperty sc:Occupancy ;
       sosa:madeBySensor ?sensor ;
       sosa:hasFeatureOfInterest ?space ;
       sosa:hasSimpleResult ?occupied .
  ${sensorFilter}
}
GROUP BY ?sensor`;
}

export function cityStatusQuery(): string {
  return `${PREFIXES}
SELECT ?type (COUNT(*) AS ?count)
FROM <urn:limen:events>
WHERE {
  ?obs a sosa:Observation ;
       sosa:observedProperty ?type .
}
GROUP BY ?type
ORDER BY DESC(?count)`;
}

// ── Fuseki HTTP client ────────────────────────────────────────────────────────

export type SparqlBinding = Record<
  string,
  { type: string; value: string; datatype?: string }
>;

export async function sparqlSelect(
  endpointUrl: string,
  query: string,
  timeoutMs = 15_000,
): Promise<SparqlBinding[]> {
  const params = new URLSearchParams({ query, format: "json" });
  const url = `${endpointUrl}/sparql?${params}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      headers: { Accept: "application/sparql-results+json" },
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(
        `Fuseki SPARQL error HTTP ${resp.status}: ${body.slice(0, 200)}`,
      );
    }
    const json = (await resp.json()) as {
      results?: { bindings?: SparqlBinding[] };
    };
    return json.results?.bindings ?? [];
  } finally {
    clearTimeout(timer);
  }
}

function val(row: SparqlBinding, v: string): string {
  return row[v]?.value ?? "";
}

// ── Result mappers ────────────────────────────────────────────────────────────

export function mapWeaponAlerts(
  rows: SparqlBinding[],
  threshold: number,
): WeaponAlert[] {
  return rows.map((r) => {
    const conf = parseFloat(val(r, "confidence") || "0");
    return {
      observationUri: val(r, "obs"),
      sensorId: val(r, "sensor").split("/").at(-1) ?? "unknown",
      confidence: conf,
      threshold,
      severity: conf >= 0.85 ? "critical" : "warning",
      timestamp: val(r, "ts"),
      wid: val(r, "wid") || undefined,
      source: "sparql",
    } satisfies WeaponAlert;
  });
}

export function mapRoadUsers(rows: SparqlBinding[]): RoadUser[] {
  return rows.map((r) => ({
    uri: val(r, "user"),
    id: parseInt(val(r, "userId") || "0"),
    lat: parseFloat(val(r, "lat") || "0"),
    lon: parseFloat(val(r, "lon") || "0"),
    speedMs: parseFloat(val(r, "speed") || "0"),
    headingRad: parseFloat(val(r, "heading") || "0"),
    vehicleClass: (val(r, "class") ||
      "unknown_class_0") as RoadUser["vehicleClass"],
    sensorId: val(r, "sensor").split("/").at(-1) ?? "unknown",
    timestamp: val(r, "ts"),
  }));
}

export function mapRoadDensity(rows: SparqlBinding[]): RoadDensityReport {
  const bySensor: Record<string, number> = {};
  let total = 0;
  for (const r of rows) {
    const sid = val(r, "sensor").split("/").at(-1) ?? "unknown";
    const count = parseInt(val(r, "count") || "0");
    bySensor[sid] = count;
    total += count;
  }
  return { bySensor, total, timestamp: new Date().toISOString() };
}

export function mapParkingLots(rows: SparqlBinding[]): ParkingLot[] {
  return rows.map((r) => {
    const occupied = parseInt(val(r, "occupiedCount") || "0");
    const total = parseInt(val(r, "total") || "0");
    return {
      sensorId: val(r, "sensor").split("/").at(-1) ?? "unknown",
      occupied,
      total,
      occupancyRate: total > 0 ? occupied / total : 0,
      timestamp: new Date().toISOString(),
    } satisfies ParkingLot;
  });
}

export function mapCityStatus(rows: SparqlBinding[]): Partial<CityStatus> {
  const byType: Record<string, number> = {};
  for (const r of rows) {
    const type = val(r, "type").split("#").at(-1) ?? val(r, "type");
    const count = parseInt(val(r, "count") || "0");
    byType[type] = count;
  }
  const total = Object.values(byType).reduce((a, b) => a + b, 0);
  return {
    totalObservations: total,
    observationsByType: byType,
    timestamp: new Date().toISOString(),
  };
}
