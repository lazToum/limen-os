/**
 * NetworkManager — singleton that monitors network state and exposes a
 * scan-network command to discover LAN devices.
 *
 * Browser layer:
 *  - navigator.onLine / online + offline events → immediate state
 *  - navigator.connection (Network Information API) → type, downlink, rtt
 *  - State transitions → WID-stamped `NetworkStateChanged` event via Tauri IPC
 *
 * Native layer (Tauri only):
 *  - `scan_network()` command → nmcli Wi-Fi list + ip neigh → NetworkDevice[]
 *  - Each found device emitted as `NetworkDeviceFound` WID event via synapsd
 */

import { useShellStore } from "../store/shell";

export interface NetworkDevice {
  ip: string;
  mac: string | null;
  hostname: string | null;
  signal_dbm: number | null;
  source: "wifi" | "neigh" | string;
}

// ── Connection Information API shim ──────────────────────────────────────────

interface NetworkInformation extends EventTarget {
  readonly effectiveType: string; // "slow-2g" | "2g" | "3g" | "4g"
  readonly type: string; // "wifi" | "ethernet" | "cellular" | "none" | "unknown"
  readonly downlink: number; // Mbps
  readonly rtt: number; // ms
}

function getConnection(): NetworkInformation | null {
  const nav = navigator as unknown as Record<string, unknown>;
  return (nav["connection"] ??
    nav["mozConnection"] ??
    nav["webkitConnection"] ??
    null) as NetworkInformation | null;
}

function resolveType(conn: NetworkInformation | null): string {
  if (!conn) return "unknown";
  if (conn.type && conn.type !== "unknown") return conn.type;
  // Map effectiveType to broader categories
  if (conn.effectiveType === "4g") return "wifi";
  if (conn.effectiveType === "3g" || conn.effectiveType === "2g")
    return "cellular";
  return "unknown";
}

// ── NetworkManager ────────────────────────────────────────────────────────────

class NetworkManager {
  private _lastOnline: boolean | null = null;
  private _lastType: string = "unknown";

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  start(): void {
    // Snapshot current state immediately.
    this._push(navigator.onLine);

    window.addEventListener("online", () => this._push(true));
    window.addEventListener("offline", () => this._push(false));

    const conn = getConnection();
    if (conn) {
      conn.addEventListener("change", () => this._push(navigator.onLine));
    }
  }

  stop(): void {
    window.removeEventListener("online", () => this._push(true));
    window.removeEventListener("offline", () => this._push(false));
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Trigger a LAN scan (Tauri only). Returns empty array in browser mode. */
  async scanNetwork(): Promise<NetworkDevice[]> {
    if (!("__TAURI_INTERNALS__" in window)) return [];
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<NetworkDevice[]>("scan_network");
    } catch (e) {
      console.warn("[Network] scan_network failed:", e);
      return [];
    }
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _push(online: boolean): void {
    const conn = getConnection();
    const type = online ? resolveType(conn) : "none";
    const downlink = conn?.downlink ?? 0;
    const rtt = conn?.rtt ?? 0;

    // Update store unconditionally (cheap Zustand set).
    useShellStore.getState().setNetworkState(online, type, downlink, rtt);

    // Only fire IPC on meaningful transitions (online/offline or type change).
    const typeChanged = type !== this._lastType;
    const onlineChanged = online !== this._lastOnline;
    if (!onlineChanged && !typeChanged) return;

    this._lastOnline = online;
    this._lastType = type;

    void this._ipc("network_state_event", {
      online,
      connection_type: type,
      downlink_mbps: downlink,
      rtt_ms: Math.round(rtt),
    });
  }

  /** Fire-and-forget Tauri IPC — silent if not in Tauri or synapsd is down. */
  private async _ipc(
    cmd: string,
    args: Record<string, unknown>,
  ): Promise<void> {
    if (!("__TAURI_INTERNALS__" in window)) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke(cmd, args);
    } catch {
      /* best-effort */
    }
  }
}

export const networkManager = new NetworkManager();
