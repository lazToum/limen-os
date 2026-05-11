import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useShellStore } from "../../store/shell";
import { DEFAULT_APPS } from "../../constants/apps";
import { OuroSLogo } from "./OuroSLogo";
import { AppIcon } from "./AppIcon";

interface Props {
  onClose: () => void;
}

export function StartMenu({ onClose }: Props) {
  const { openWindow, sessionUser, setSession } = useShellStore();
  const [search, setSearch] = useState("");
  const [showAllApps, setShowAllApps] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search on open
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Close on outside click or Escape
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
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

  const filtered = search.trim()
    ? DEFAULT_APPS.filter(
        (a) =>
          a.title.toLowerCase().includes(search.toLowerCase()) ||
          a.id.includes(search.toLowerCase()),
      )
    : DEFAULT_APPS;

  const launch = (app: (typeof DEFAULT_APPS)[0]) => {
    openWindow(app);
    onClose();
  };

  return (
    <motion.div
      ref={menuRef}
      className="win11-start-menu"
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.97 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
    >
      {/* OuroS brand mark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "16px 20px 4px",
        }}
      >
        <OuroSLogo size={36} glow />
        <div style={{ lineHeight: 1.2 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.9)",
              letterSpacing: "0.5px",
            }}
          >
            OuroS
          </div>
          <div
            style={{
              fontSize: 9,
              color: "rgba(255,255,255,0.3)",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            True OS · waldiez/patato⁵
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="win11-start-search-wrap">
        <svg
          className="win11-start-search-icon"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
        >
          <circle
            cx="6"
            cy="6"
            r="4.5"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <path
            d="M9.5 9.5L13 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <input
          ref={inputRef}
          className="win11-start-search selectable"
          placeholder="Type here to search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && filtered.length === 1) launch(filtered[0]);
          }}
        />
      </div>

      {/* Content */}
      <div className="win11-start-content">
        {!showAllApps && !search ? (
          <>
            {/* Pinned */}
            <div className="win11-start-section-header">
              <span>Pinned</span>
              <button
                className="win11-start-all-btn"
                onClick={() => setShowAllApps(true)}
              >
                All apps{" "}
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M3 2l4 3-4 3"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="win11-start-grid">
              {DEFAULT_APPS.map((app) => (
                <button
                  key={app.id}
                  className="win11-start-app"
                  onClick={() => launch(app)}
                >
                  <span className="win11-start-app-icon">
                    <AppIcon icon={app.icon} size={28} />
                  </span>
                  <span className="win11-start-app-label">{app.title}</span>
                </button>
              ))}
            </div>

            {/* Recommended */}
            <div
              className="win11-start-section-header"
              style={{ marginTop: 20 }}
            >
              <span>Recommended</span>
            </div>
            <div className="win11-start-recommended">
              <div className="win11-start-recommended-empty">
                Recently used files and apps will appear here.
              </div>
            </div>
          </>
        ) : (
          <>
            {/* All apps / search results */}
            {!search && (
              <div className="win11-start-section-header">
                <button
                  className="win11-start-back-btn"
                  onClick={() => setShowAllApps(false)}
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M7 2L3 5l4 3"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                    />
                  </svg>
                  Back
                </button>
                <span style={{ marginLeft: "auto" }}>All apps</span>
              </div>
            )}
            {search && filtered.length === 0 && (
              <div className="win11-start-recommended-empty">
                No results for "{search}"
              </div>
            )}
            <div className="win11-start-all-list">
              {filtered.map((app) => (
                <button
                  key={app.id}
                  className="win11-start-list-item"
                  onClick={() => launch(app)}
                >
                  <span className="win11-start-list-icon">
                    <AppIcon icon={app.icon} size={20} />
                  </span>
                  <span>{app.title}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer: user + power */}
      <div className="win11-start-footer">
        <button
          className="win11-start-user"
          onClick={() => setSession(null, true)}
        >
          <span className="win11-start-user-avatar">
            {(sessionUser ?? "U").charAt(0).toUpperCase()}
          </span>
          <span>{sessionUser ?? "User"}</span>
        </button>
        <div style={{ flex: 1 }} />
        <div className="win11-start-power-btns">
          {/* Sleep */}
          <button className="win11-start-power-btn" title="Sleep">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2v2M8 12v2M2 8H4M12 8h2M4.2 4.2l1.4 1.4M10.4 10.4l1.4 1.4M4.2 11.8l1.4-1.4M10.4 5.6l1.4-1.4"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <circle
                cx="8"
                cy="8"
                r="2.5"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            </svg>
          </button>
          {/* Restart */}
          <button className="win11-start-power-btn" title="Restart">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M4 8a4 4 0 1 1 1 2.8"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
              />
              <path
                d="M4 11.5V8.5H7"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          {/* Power */}
          <button
            className="win11-start-power-btn"
            title="Shut down"
            onClick={() => setSession(null)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M8 2v6"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M5 4.5A5.5 5.5 0 1 0 11 4.5"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
