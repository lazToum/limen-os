import { useEffect, useRef, useState } from "react";
import { useShellStore } from "../../store/shell";
import { DEFAULT_APPS, getApp } from "../../constants/apps";
import { useDeviceSize } from "../../hooks/useDeviceSize";
import type { DeviceSize } from "../../hooks/useDeviceSize";
import { AppIcon } from "./AppIcon";
import { AppContextMenu } from "./AppContextMenu";
import { OuroSRing } from "./OuroSLogo";


interface Props {
  onStartClick: () => void;
  onActionCenterClick: () => void;
  onNotificationCenterClick: () => void;
  startOpen: boolean;
}

// ── Device Size Toggle ───────────────────────────────────────────────────────

const SIZE_CYCLE: DeviceSize[] = ["desktop", "tablet", "mobile"];

function DeviceSizeToggle() {
  const detectedSize = useDeviceSize();
  const { deviceOverride, setDeviceOverride } = useShellStore();
  const effective = deviceOverride ?? detectedSize;

  const next = () => {
    const idx = SIZE_CYCLE.indexOf(effective);
    const nextSize = SIZE_CYCLE[(idx + 1) % SIZE_CYCLE.length] ?? "desktop";
    setDeviceOverride(nextSize === detectedSize ? null : nextSize);
  };

  const icons: Record<DeviceSize, React.ReactNode> = {
    desktop: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect
          x="1"
          y="2"
          width="12"
          height="8.5"
          rx="1.2"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <path
          d="M4.5 12.5h5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
        <path
          d="M7 10.5V12"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ),
    tablet: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect
          x="2"
          y="1"
          width="10"
          height="12"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle cx="7" cy="11" r="0.8" fill="currentColor" />
      </svg>
    ),
    mobile: (
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect
          x="3.5"
          y="1"
          width="7"
          height="12"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <circle cx="7" cy="11" r="0.7" fill="currentColor" />
      </svg>
    ),
  };

  const label = deviceOverride
    ? `${effective} (forced)`
    : `${effective} (auto)`;

  return (
    <button
      className={`win11-tray-btn win11-device-toggle${deviceOverride ? " forced" : ""}`}
      onClick={next}
      title={`View: ${label} — click to cycle`}
    >
      {icons[effective]}
    </button>
  );
}

// ── Clock ───────────────────────────────────────────────────────────────────

function Clock({ onClick }: { onClick: () => void }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const time = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = now.toLocaleDateString([], {
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });

  return (
    <button className="win11-clock" onClick={onClick} title="Action center">
      <div>{time}</div>
      <div style={{ fontSize: 11, opacity: 0.75 }}>{date}</div>
    </button>
  );
}

// ── Tray Popups ───────────────────────────────────────────────────────────────

function VolumePopup({ onClose }: { onClose: () => void }) {
  const [vol, setVol] = useState(75);
  const [muted, setMuted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  return (
    <div ref={ref} className="win11-tray-popup">
      <div className="win11-tray-popup-title">Volume</div>
      <div className="win11-tray-popup-row">
        <button
          className="win11-tray-popup-icon-btn"
          onClick={() => setMuted((m) => !m)}
          title={muted ? "Unmute" : "Mute"}
        >
          <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
            {muted ? (
              <>
                <path d="M2 5h2l3-3v10L4 9H2z" fill="currentColor" />
                <path
                  d="M10 5l3 4m0-4l-3 4"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </>
            ) : (
              <>
                <path d="M2 5h2l3-3v10L4 9H2z" fill="currentColor" />
                <path
                  d="M9 4.5a3 3 0 0 1 0 5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </>
            )}
          </svg>
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : vol}
          onChange={(e) => {
            setVol(+e.target.value);
            setMuted(false);
          }}
          className="win11-tray-slider"
        />
        <span className="win11-tray-popup-val">{muted ? 0 : vol}%</span>
      </div>
      <div
        className="win11-tray-popup-row"
        style={{ fontSize: 11, opacity: 0.6, gap: 6 }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M1 4h2l2.5-2.5v7L3 7H1z" fill="currentColor" />
        </svg>
        Speakers (default)
      </div>
    </div>
  );
}

function NetworkPopup({ onClose }: { onClose: () => void }) {
  const { networkOnline, networkType, networkDownlink, networkRtt } =
    useShellStore();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  const typeLabel =
    networkType === "wifi"
      ? "Wi-Fi"
      : networkType === "ethernet"
        ? "Ethernet"
        : networkType === "cellular"
          ? "Cellular"
          : networkType === "none"
            ? "No connection"
            : "Network";

  const typeIcon =
    networkType === "ethernet" ? (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path
          d="M2 5h9M2 8h9M4 2v9M9 2v9"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    ) : (
      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
        <path
          d="M6.5 10a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z"
          fill="currentColor"
        />
        <path
          d="M3.9 7.8a3.7 3.7 0 0 1 5.2 0"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity={networkOnline ? 1 : 0.3}
        />
        <path
          d="M1.3 5.2a6.1 6.1 0 0 1 11.4 0"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity={networkOnline ? 0.6 : 0.2}
        />
      </svg>
    );

  return (
    <div ref={ref} className="win11-tray-popup">
      <div className="win11-tray-popup-title">Network</div>
      <div
        className="win11-tray-popup-net-item"
        style={{ opacity: networkOnline ? 1 : 0.5 }}
      >
        {typeIcon}
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{typeLabel}</div>
          <div style={{ opacity: 0.55, fontSize: 11 }}>
            {networkOnline
              ? [
                  networkDownlink > 0 && `↓ ${networkDownlink.toFixed(1)} Mbps`,
                  networkRtt > 0 && `RTT ${networkRtt} ms`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Connected"
              : "Disconnected"}
          </div>
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: 4,
            background: networkOnline
              ? "rgba(34,197,94,0.18)"
              : "rgba(239,68,68,0.18)",
            color: networkOnline ? "#22c55e" : "#ef4444",
          }}
        >
          {networkOnline ? "●" : "○"}
        </span>
      </div>
    </div>
  );
}

function BatteryPopup({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  const pct = 82;
  return (
    <div ref={ref} className="win11-tray-popup">
      <div className="win11-tray-popup-title">Battery</div>
      <div
        className="win11-tray-popup-row"
        style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            width: "100%",
          }}
        >
          <div className="win11-tray-battery-bar">
            <div
              className="win11-tray-battery-fill"
              style={{
                width: `${pct}%`,
                background: pct > 20 ? "#22c55e" : "#ef4444",
              }}
            />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{pct}%</span>
        </div>
        <div style={{ fontSize: 11, opacity: 0.6 }}>
          ⚡ Plugged in, charging
        </div>
      </div>
      <div className="win11-tray-popup-row">
        <span className="win11-tray-popup-label">Power mode</span>
        <span className="win11-settings-badge">Balanced</span>
      </div>
    </div>
  );
}

function PowerMenu({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const isDev = import.meta.env.DEV;
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);
  const doAction = (action: string) => {
    onClose();
    if (action === "exit" && isDev) {
      window.location.reload();
      return;
    }
    // In production these would call Tauri commands
    alert(`${action} — connect Tauri backend to enable.`);
  };
  return (
    <div ref={ref} className="win11-tray-popup win11-power-menu">
      <div className="win11-tray-popup-title">Power</div>
      <button className="win11-power-btn" onClick={() => doAction("sleep")}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M13.5 8A5.5 5.5 0 0 1 5.5 2.5a5.5 5.5 0 1 0 8 8z"
            fill="currentColor"
            opacity="0.9"
          />
        </svg>
        Sleep
      </button>
      <button className="win11-power-btn" onClick={() => doAction("restart")}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M13 8A5 5 0 1 1 8 3M8 1v4l3-2-3-2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Restart
      </button>
      <button
        className="win11-power-btn danger"
        onClick={() => doAction("shutdown")}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 2v6M5 4.3A5 5 0 1 0 11 4.3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Shut down
      </button>
      {isDev && (
        <>
          <div
            style={{
              height: 1,
              background: "rgba(255,255,255,0.1)",
              margin: "4px 0",
            }}
          />
          <button className="win11-power-btn" onClick={() => doAction("exit")}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M10 8H2m0 0 3-3m-3 3 3 3M6 4V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-1"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Exit (dev)
          </button>
        </>
      )}
    </div>
  );
}

// ── Running Apps Tray ────────────────────────────────────────────────────────

function RunningAppsTray() {
  const windows = useShellStore((s) => s.windows);
  const pinnedApps = useShellStore((s) => s.pinnedApps);
  const { focusWindow } = useShellStore();

  // Show apps that are running but NOT pinned (they're already visible in the dock)
  // OR apps that are minimized (regardless of pin state) — so user can restore them
  const minimizedWins = windows.filter((w) => w.minimized);
  const unpinnedRunning = windows.filter(
    (w) => !w.minimized && !pinnedApps.includes(w.appId),
  );

  const toShow = [
    ...new Map(
      [...minimizedWins, ...unpinnedRunning].map((w) => [w.appId, w]),
    ).values(),
  ];

  if (toShow.length === 0) return null;

  return (
    <div className="win11-running-tray" title="Running apps">
      {toShow.map((w) => {
        const appDef =
          getApp(w.appId) ?? DEFAULT_APPS.find((a) => a.id === w.appId);
        if (!appDef) return null;
        return (
          <button
            key={w.id}
            className={`win11-running-tray-btn${w.minimized ? " minimized" : ""}`}
            title={`${w.title}${w.minimized ? " (minimized)" : ""}`}
            onClick={() => {
              if (w.minimized) focusWindow(w.id);
              else focusWindow(w.id);
            }}
          >
            <AppIcon icon={appDef.icon} size={14} />
            {w.minimized && <span className="win11-running-tray-min-dot" />}
          </button>
        );
      })}
    </div>
  );
}

// ── Tray Icons ───────────────────────────────────────────────────────────────

function TrayIcons() {
  const [open, setOpen] = useState<
    "volume" | "network" | "battery" | "power" | null
  >(null);
  const toggle = (name: "volume" | "network" | "battery" | "power") =>
    setOpen((o) => (o === name ? null : name));

  return (
    <div className="win11-tray-icons" style={{ position: "relative" }}>
      {/* Network */}
      <button
        className="win11-tray-btn"
        title="Network"
        onClick={() => toggle("network")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M7 11a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"
            fill="currentColor"
            opacity="0.9"
          />
          <path
            d="M4.3 8.7a3.8 3.8 0 0 1 5.4 0"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M1.6 6a6.5 6.5 0 0 1 10.8 0"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
            opacity="0.6"
          />
        </svg>
      </button>
      {/* Volume */}
      <button
        className="win11-tray-btn"
        title="Volume"
        onClick={() => toggle("volume")}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 5h2l3-3v10L4 9H2z" fill="currentColor" />
          <path
            d="M9 4.5a3 3 0 0 1 0 5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M10.5 2.5a5 5 0 0 1 0 9"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            fill="none"
            opacity="0.5"
          />
        </svg>
      </button>
      {/* Battery */}
      <button
        className="win11-tray-btn"
        title="Battery"
        onClick={() => toggle("battery")}
      >
        <svg width="16" height="10" viewBox="0 0 16 10" fill="none">
          <rect
            x="0.6"
            y="1.6"
            width="13"
            height="7"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <rect
            x="1.5"
            y="2.5"
            width="8"
            height="5"
            rx="0.8"
            fill="currentColor"
            opacity="0.7"
          />
          <path
            d="M14 3.5v3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {/* Power */}
      <button
        className="win11-tray-btn"
        title="Power"
        onClick={() => toggle("power")}
        style={{ opacity: 0.75 }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path
            d="M8 2v5M5.3 4.3A5 5 0 1 0 10.7 4.3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {/* Popups — rendered above the tray */}
      {open === "volume" && <VolumePopup onClose={() => setOpen(null)} />}
      {open === "network" && <NetworkPopup onClose={() => setOpen(null)} />}
      {open === "battery" && <BatteryPopup onClose={() => setOpen(null)} />}
      {open === "power" && <PowerMenu onClose={() => setOpen(null)} />}
    </div>
  );
}

// ── Taskbar App Button ───────────────────────────────────────────────────────

interface AppBtnProps {
  appId: string;
  icon: string;
  label: string;
  running: boolean;
  focused: boolean;
  onClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function TaskbarAppBtn({
  appId: _appId,
  icon,
  label,
  running,
  focused,
  onClick,
  onContextMenu,
}: AppBtnProps) {
  return (
    <button
      className={`win11-taskbar-app${focused ? " active" : ""}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={label}
    >
      <span className="win11-taskbar-app-icon">
        <AppIcon icon={icon} size={20} />
      </span>
      {running && <span className="win11-taskbar-running-dot" />}
    </button>
  );
}

// ── Context Menu ────────────────────────────────────────────────────────────

interface CtxMenu {
  appId: string;
  x: number;
  y: number;
}

// ── Taskbar ──────────────────────────────────────────────────────────────────

export function Taskbar({
  onStartClick,
  onActionCenterClick,
  onNotificationCenterClick,
  startOpen,
}: Props) {
  const windows = useShellStore((s) => s.windows);
  const maxZIndex = useShellStore((s) => s.maxZIndex);
  const pinnedApps = useShellStore((s) => s.pinnedApps);
  const { openWindow, focusWindow, minimizeWindow } = useShellStore();
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null);

  // All visible app IDs = pinned ∪ running (pinned order preserved, running appended)
  const runningAppIds = [...new Set(windows.map((w) => w.appId))];
  const allAppIds = [...new Set([...pinnedApps, ...runningAppIds])];

  const handleAppClick = (appId: string) => {
    const openWins = windows.filter((w) => w.appId === appId);
    if (!openWins.length) {
      const app = getApp(appId);
      if (app) openWindow(app);
      return;
    }
    // If only one: toggle minimize/focus
    if (openWins.length === 1) {
      const w = openWins[0];
      if (w.minimized || w.zIndex < maxZIndex) focusWindow(w.id);
      else minimizeWindow(w.id);
    } else {
      // Multiple: focus the top one, or cycle
      const top = [...openWins].sort((a, b) => b.zIndex - a.zIndex)[0];
      if (top) focusWindow(top.id);
    }
  };

  const openContextMenu = (e: React.MouseEvent, appId: string) => {
    e.preventDefault();
    setCtxMenu({ appId, x: e.clientX, y: e.clientY - 120 });
  };

  return (
    <>
      <div className="win11-taskbar" style={{ pointerEvents: "auto" }}>
        {/* Left: Start button */}
        <div className="win11-taskbar-left">
          <button
            className={`win11-start-btn${startOpen ? " open" : ""}`}
            onClick={onStartClick}
            title="OuroS — Limen OS"
          >
            <OuroSRing size={22} />
          </button>
        </div>

        {/* Center: pinned + running apps */}
        <div className="win11-taskbar-center">
          {allAppIds.map((appId) => {
            const appDef =
              getApp(appId) ?? DEFAULT_APPS.find((a) => a.id === appId);
            const openWins = windows.filter((w) => w.appId === appId);
            const running = openWins.length > 0;
            const focused = openWins.some(
              (w) => !w.minimized && w.zIndex === maxZIndex,
            );
            if (!appDef) return null;
            return (
              <TaskbarAppBtn
                key={appId}
                appId={appId}
                icon={appDef.icon}
                label={appDef.title}
                running={running}
                focused={focused}
                onClick={() => handleAppClick(appId)}
                onContextMenu={(e) => openContextMenu(e, appId)}
              />
            );
          })}
        </div>

        {/* Right: tray + clock */}
        <div className="win11-taskbar-right">
          <RunningAppsTray />
          <DeviceSizeToggle />
          <div
            style={{
              width: 1,
              height: 28,
              background: "rgba(255,255,255,0.08)",
              margin: "0 4px",
            }}
          />
          <TrayIcons />
          <div
            style={{
              width: 1,
              height: 28,
              background: "rgba(255,255,255,0.08)",
              margin: "0 4px",
            }}
          />
          <Clock onClick={onActionCenterClick} />
          {/* Notification bell */}
          <button
            className="win11-tray-btn"
            title="Notifications"
            onClick={onNotificationCenterClick}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M7 1.5a4 4 0 0 0-4 4v3l-1 1.5h10l-1-1.5v-3a4 4 0 0 0-4-4z"
                stroke="currentColor"
                strokeWidth="1.2"
                fill="none"
              />
              <path
                d="M5.5 11.5a1.5 1.5 0 0 0 3 0"
                stroke="currentColor"
                strokeWidth="1.2"
                fill="none"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <AppContextMenu
          appId={ctxMenu.appId}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          pinLabel="Pin to taskbar"
          unpinLabel="Unpin from taskbar"
          closeLabel="Close window"
        />
      )}
    </>
  );
}
