/**
 * CameraSelector — pick which camera to use and toggle ghost/mirror mode.
 *
 * Rendered as a compact floating pill. Embed it wherever the UI needs
 * camera controls (ambient overlay, settings panel, etc.).
 *
 * Props:
 *   compact — single icon button that opens a popover (default: false)
 */

import { useEffect, useRef, useState } from "react";
import { useShellStore } from "../store/shell";
import { cameraManager } from "../video/camera";
import type { CameraDevice } from "../video/camera";

interface Props {
  compact?: boolean;
}

export function CameraSelector({ compact = false }: Props) {
  const {
    cameraDevices,
    activeCameraId,
    cameraMode,
    cameraActive,
    setCameraMode,
  } = useShellStore();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Refresh device list whenever we open the popover.
  useEffect(() => {
    if (open) void cameraManager.listCameras();
  }, [open]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const activeLabel =
    cameraDevices.find((d) => d.id === activeCameraId)?.label ??
    (cameraActive ? "Camera" : "No camera");

  const handleSwitch = async (device: CameraDevice) => {
    setLoading(true);
    await cameraManager.switchTo(device.id);
    setLoading(false);
    setOpen(false);
  };

  const toggleMode = () =>
    setCameraMode(cameraMode === "ghost" ? "mirror" : "ghost");

  // ── Compact variant ────────────────────────────────────────────────────────
  if (compact) {
    return (
      <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
        <button
          className="cam-sel-icon-btn"
          title={`Camera: ${activeLabel}`}
          onClick={() => setOpen((v) => !v)}
        >
          <CameraIcon active={cameraActive} />
        </button>
        {open && (
          <CameraPopover
            devices={cameraDevices}
            activeCameraId={activeCameraId}
            cameraMode={cameraMode}
            loading={loading}
            onSwitch={handleSwitch}
            onToggleMode={toggleMode}
            onClose={() => setOpen(false)}
          />
        )}
      </div>
    );
  }

  // ── Inline variant ─────────────────────────────────────────────────────────
  return (
    <div ref={ref} className="cam-sel-inline">
      <div className="cam-sel-row">
        <CameraIcon active={cameraActive} />
        <span className="cam-sel-label">{activeLabel}</span>
        <button
          className="cam-sel-mode-btn"
          title={
            cameraMode === "ghost"
              ? "Switch to mirror mode"
              : "Switch to ghost mode"
          }
          onClick={toggleMode}
        >
          {cameraMode === "ghost" ? "👻" : "🪞"}
        </button>
        <button
          className="cam-sel-toggle-btn"
          onClick={() => setOpen((v) => !v)}
          title="Switch camera"
        >
          ▾
        </button>
      </div>
      {open && (
        <CameraPopover
          devices={cameraDevices}
          activeCameraId={activeCameraId}
          cameraMode={cameraMode}
          loading={loading}
          onSwitch={handleSwitch}
          onToggleMode={toggleMode}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// ── Popover ──────────────────────────────────────────────────────────────────

interface PopoverProps {
  devices: CameraDevice[];
  activeCameraId: string;
  cameraMode: "ghost" | "mirror";
  loading: boolean;
  onSwitch: (d: CameraDevice) => void;
  onToggleMode: () => void;
  onClose: () => void;
}

function CameraPopover({
  devices,
  activeCameraId,
  cameraMode,
  loading,
  onSwitch,
  onToggleMode,
}: PopoverProps) {
  return (
    <div className="cam-sel-popover">
      <div className="cam-sel-section-label">Camera</div>
      {devices.length === 0 && (
        <div className="cam-sel-empty">No cameras detected</div>
      )}
      {devices.map((d) => (
        <button
          key={d.id}
          className={`cam-sel-device-btn ${d.id === activeCameraId ? "active" : ""}`}
          onClick={() => onSwitch(d)}
          disabled={loading || d.id === activeCameraId}
        >
          <span
            className="cam-sel-device-dot"
            style={{ background: d.source === "native" ? "#7c6" : "#68f" }}
          />
          <span className="cam-sel-device-label">{d.label}</span>
          {d.id === activeCameraId && <span className="cam-sel-check">✓</span>}
        </button>
      ))}

      <div className="cam-sel-divider" />

      <div className="cam-sel-section-label">Screensaver mode</div>
      <button
        className={`cam-sel-mode-row ${cameraMode === "ghost" ? "active" : ""}`}
        onClick={() => cameraMode !== "ghost" && onToggleMode()}
      >
        <span>👻</span>
        <span>
          Ghost <small>(faint, aurora on top)</small>
        </span>
        {cameraMode === "ghost" && <span className="cam-sel-check">✓</span>}
      </button>
      <button
        className={`cam-sel-mode-row ${cameraMode === "mirror" ? "active" : ""}`}
        onClick={() => cameraMode !== "mirror" && onToggleMode()}
      >
        <span>🪞</span>
        <span>
          Mirror <small>(full camera feed)</small>
        </span>
        {cameraMode === "mirror" && <span className="cam-sel-check">✓</span>}
      </button>
    </div>
  );
}

// ── Icon ─────────────────────────────────────────────────────────────────────

function CameraIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      style={{ opacity: active ? 1 : 0.4 }}
    >
      <rect
        x="1"
        y="4"
        width="10"
        height="8"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M11 6.5l4-2v7l-4-2V6.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle
        cx="6"
        cy="8"
        r="1.5"
        fill="currentColor"
        opacity={active ? 0.8 : 0.3}
      />
    </svg>
  );
}
