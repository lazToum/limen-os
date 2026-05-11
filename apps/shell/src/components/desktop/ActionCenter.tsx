import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  onClose: () => void;
}

interface Toggle {
  id: string;
  label: string;
  icon: React.ReactNode;
}

function WifiIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 14a1 1 0 1 0 0 2 1 1 0 0 0 0-2z" fill="currentColor" />
      <path
        d="M5.6 10.8a4.8 4.8 0 0 1 6.8 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M2.2 7.4a9.2 9.2 0 0 1 13.6 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
function BluetoothIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M6 6l6 6-3 3V3l3 3-6 6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function MoonIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 3a6 6 0 1 0 6 6 6 6 0 0 0-3.5-5.4A5 5 0 0 1 9 3z"
        fill="currentColor"
        opacity="0.8"
      />
    </svg>
  );
}
function AirplaneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M9 2L3 10h3.5v4l2.5-1.5 2.5 1.5v-4H15L9 2z"
        fill="currentColor"
        opacity="0.85"
      />
    </svg>
  );
}
function FocusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="3" fill="currentColor" opacity="0.9" />
      <circle
        cx="9"
        cy="9"
        r="6"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}
function AccessibilityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="4" r="1.5" fill="currentColor" />
      <path
        d="M5 8h8M9 8v6M6 14l3-2 3 2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

const TOGGLES: Toggle[] = [
  { id: "wifi", label: "Wi-Fi", icon: <WifiIcon /> },
  { id: "bluetooth", label: "Bluetooth", icon: <BluetoothIcon /> },
  { id: "night-light", label: "Night light", icon: <MoonIcon /> },
  { id: "airplane", label: "Airplane mode", icon: <AirplaneIcon /> },
  { id: "focus", label: "Focus assist", icon: <FocusIcon /> },
  { id: "accessibility", label: "Accessibility", icon: <AccessibilityIcon /> },
];

export function ActionCenter({ onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<Record<string, boolean>>({
    wifi: true,
    bluetooth: false,
    "night-light": false,
    airplane: false,
    focus: false,
    accessibility: false,
  });
  const [brightness, setBrightness] = useState(80);
  const [volume, setVolume] = useState(60);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Close on outside click / Escape
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) onClose();
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  const toggle = (id: string) => setActive((a) => ({ ...a, [id]: !a[id] }));

  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const dateStr = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <motion.div
      ref={panelRef}
      className="win11-action-center"
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {/* Date/time header */}
      <div className="win11-ac-header">
        <div className="win11-ac-time">{timeStr}</div>
        <div className="win11-ac-date">{dateStr}</div>
      </div>

      {/* Quick toggles */}
      <div className="win11-ac-toggles">
        {TOGGLES.map((t) => (
          <button
            key={t.id}
            className={`win11-ac-toggle${active[t.id] ? " on" : ""}`}
            onClick={() => toggle(t.id)}
            title={t.label}
          >
            <span className="win11-ac-toggle-icon">{t.icon}</span>
            <span className="win11-ac-toggle-label">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Brightness slider */}
      <div className="win11-ac-slider-row">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          opacity="0.7"
        >
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
        <input
          type="range"
          min={0}
          max={100}
          value={brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
          className="win11-ac-range"
          title={`Brightness: ${brightness}%`}
        />
        <span className="win11-ac-range-val">{brightness}%</span>
      </div>

      {/* Volume slider */}
      <div className="win11-ac-slider-row">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          opacity="0.7"
        >
          <path d="M2 6h2.5L8 3v10l-3.5-3H2z" fill="currentColor" />
          <path
            d="M10.5 5.5a3.5 3.5 0 0 1 0 5"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
          <path
            d="M12.5 3.5a6 6 0 0 1 0 9"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="win11-ac-range"
          title={`Volume: ${volume}%`}
        />
        <span className="win11-ac-range-val">{volume}%</span>
      </div>
    </motion.div>
  );
}
