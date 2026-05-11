/**
 * Per-paradigm desktop chrome layouts.
 *
 * Each shell owns its taskbar/dock/panel and renders <WindowManager> with the
 * correct inset so windows never overlap the chrome.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WindowManager } from "./WindowManager";
import { ActionCenter } from "./ActionCenter";
import { useShellStore } from "../../store/shell";
import { DEFAULT_APPS, getApp } from "../../constants/apps";
import { AppIcon } from "./AppIcon";
import { AppContextMenu } from "./AppContextMenu";

// ── Paradigm desktop background ───────────────────────────────────────────────

type Paradigm = "macos7" | "unix" | "minimal" | "nebula" | "dos" | "calm";
function ParadigmBg({ paradigm }: { paradigm: Paradigm }) {
  return <div className={`paradigm-bg paradigm-bg-${paradigm}`} />;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function useContextMenu(onOpen: (x: number, y: number) => void) {
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (
        (e.target as HTMLElement).closest(
          ".win11-window, .win11-taskbar, .mac-menu-bar, .mac-dock, .unix-panel, .minimal-dock, .dos-bar, .calm-dock",
        )
      )
        return;
      e.preventDefault();
      onOpen(e.clientX, e.clientY);
    },
    [onOpen],
  );
  return handleContextMenu;
}

function DesktopContextMenu({
  x,
  y,
  onClose,
}: {
  x: number;
  y: number;
  onClose: () => void;
}) {
  const { openWindow } = useShellStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="win11-context-menu"
      style={{
        position: "fixed",
        left: x,
        top: y,
        zIndex: 99998,
        pointerEvents: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={() => {
          openWindow({
            id: "browser",
            title: "Web Browser",
            icon: "🌐",
            contentType: "browser",
            defaultWidth: 1200,
            defaultHeight: 750,
            contentUrl: "https://www.google.com",
          });
          onClose();
        }}
      >
        Open Browser
      </button>
      <button
        onClick={() => {
          openWindow({
            id: "terminal",
            title: "Terminal",
            icon: "⬛",
            contentType: "terminal",
            defaultWidth: 800,
            defaultHeight: 500,
          });
          onClose();
        }}
      >
        Open Terminal
      </button>
      <button
        onClick={() => {
          openWindow({
            id: "settings",
            title: "Settings",
            icon: "⚙️",
            contentType: "settings",
            defaultWidth: 900,
            defaultHeight: 650,
          });
          onClose();
        }}
      >
        Settings
      </button>
      <button
        onClick={() => {
          openWindow({
            id: "ai-chat",
            title: "AI Chat",
            icon: "🤖",
            contentType: "ai-chat",
            defaultWidth: 720,
            defaultHeight: 620,
          });
          onClose();
        }}
      >
        Ask Limen AI…
      </button>
      <div className="win11-context-sep" />
      <button onClick={onClose}>Close menu</button>
    </div>
  );
}

// ── macOS 7–style shell ───────────────────────────────────────────────────────

export function MacOSShell() {
  const now = useClock();
  const {
    openWindow,
    windows,
    focusWindow,
    minimizeWindow,
    maxZIndex,
    pinnedApps,
  } = useShellStore();
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [actionCenterOpen, setActionCenterOpen] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [dockCtx, setDockCtx] = useState<{
    appId: string;
    x: number;
    y: number;
  } | null>(null);
  const appMenuRef = useRef<HTMLDivElement>(null);

  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = now.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const handleCtx = useContextMenu((x, y) => {
    setCtxPos({ x, y });
    setAppMenuOpen(false);
  });

  // Close app menu on outside click
  useEffect(() => {
    if (!appMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!appMenuRef.current?.contains(e.target as Node))
        setAppMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [appMenuOpen]);

  const dockApps = pinnedApps.slice(0, 10);

  return (
    <div
      style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
      onContextMenu={handleCtx}
      onClick={() => {
        setCtxPos(null);
        setAppMenuOpen(false);
      }}
    >
      <ParadigmBg paradigm="macos7" />
      <WindowManager insetTop={28} insetBottom={80} />

      {/* ── Top Menu Bar ── */}
      <div className="mac-menu-bar" style={{ pointerEvents: "auto" }}>
        {/* Apple logo / app menu */}
        <div style={{ position: "relative" }}>
          <button
            className="mac-menu-item mac-apple-btn"
            onClick={(e) => {
              e.stopPropagation();
              setAppMenuOpen((v) => !v);
            }}
          >
            {/* Apple/Limen logo */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 1.5c1.2 0 2.3.6 3 1.6-.1.1-1.8 1-1.8 3 0 2.3 2 3.1 2 3.1-.1.2-.4 1.3-1.3 2.5-.8 1-1.6 2-2.8 2s-1.5-.7-2.8-.7c-1.3 0-1.7.7-2.8.7-1.2 0-2-1-2.8-2C.3 10.2-.3 8.2-.3 6.4c0-3.2 2.1-4.9 4.1-4.9 1.1 0 2 .7 2.6.7.7 0 1.8-.7 3-.7zM7.1 0c0 1.4-1.2 2.4-2.4 2.3-.1-1.2 1-2.3 2.4-2.3z" />
            </svg>
            Limen
          </button>
          <AnimatePresence>
            {appMenuOpen && (
              <motion.div
                ref={appMenuRef}
                className="mac-dropdown"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    openWindow({
                      id: "settings",
                      title: "Settings",
                      icon: "⚙️",
                      contentType: "settings",
                      defaultWidth: 900,
                      defaultHeight: 650,
                    });
                    setAppMenuOpen(false);
                  }}
                >
                  System Settings…
                </button>
                <div className="mac-sep" />
                <button
                  onClick={() => {
                    openWindow({
                      id: "ai-chat",
                      title: "AI Chat",
                      icon: "🤖",
                      contentType: "ai-chat",
                      defaultWidth: 720,
                      defaultHeight: 620,
                    });
                    setAppMenuOpen(false);
                  }}
                >
                  About Limen OS
                </button>
                <div className="mac-sep" />
                <button
                  onClick={() => {
                    openWindow({
                      id: "terminal",
                      title: "Terminal",
                      icon: "⬛",
                      contentType: "terminal",
                      defaultWidth: 800,
                      defaultHeight: 500,
                    });
                    setAppMenuOpen(false);
                  }}
                >
                  Terminal
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button className="mac-menu-item">Finder</button>
        <button className="mac-menu-item">File</button>
        <button className="mac-menu-item">Edit</button>
        <button className="mac-menu-item">View</button>
        <button className="mac-menu-item">Window</button>

        <div style={{ flex: 1 }} />

        {/* Right: tray */}
        <button className="mac-menu-item mac-tray-item" title="Wi-Fi">
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
            />
            <path
              d="M1.3 5.2a6.1 6.1 0 0 1 11.4 0"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
              opacity="0.6"
            />
          </svg>
        </button>
        <button className="mac-menu-item mac-tray-item" title="Battery">
          <svg width="18" height="10" viewBox="0 0 18 10" fill="none">
            <rect
              x="0.5"
              y="1.5"
              width="14"
              height="7"
              rx="1.5"
              stroke="currentColor"
              strokeWidth="1.1"
            />
            <rect
              x="1.3"
              y="2.3"
              width="9"
              height="5.4"
              rx="0.8"
              fill="currentColor"
              opacity="0.7"
            />
            <path
              d="M15.5 3.5v3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          className="mac-menu-item mac-clock"
          onClick={() => setActionCenterOpen((v) => !v)}
        >
          {timeStr} &nbsp;
          <span style={{ opacity: 0.6, fontSize: 11 }}>{dateStr}</span>
        </button>
      </div>

      {/* ── Action Center (reuse Win11 one) ── */}
      <AnimatePresence>
        {actionCenterOpen && (
          <ActionCenter key="ac" onClose={() => setActionCenterOpen(false)} />
        )}
      </AnimatePresence>

      {/* ── Bottom Dock ── */}
      <div className="mac-dock" style={{ pointerEvents: "auto" }}>
        <div className="mac-dock-shelf">
          {dockApps.map((appId) => {
            const app = getApp(appId);
            if (!app) return null;
            const openWins = windows.filter((w) => w.appId === appId);
            const running = openWins.length > 0;
            const focused = openWins.some(
              (w) => !w.minimized && w.zIndex === maxZIndex,
            );
            const handle = () => {
              if (!openWins.length) {
                openWindow(app);
                return;
              }
              const w = openWins[0];
              if (w && (w.minimized || w.zIndex < maxZIndex)) focusWindow(w.id);
              else if (w) minimizeWindow(w.id);
            };
            return (
              <div key={appId} className="mac-dock-item-wrap" title={app.title}>
                <button
                  className={`mac-dock-item${focused ? " active" : ""}`}
                  onClick={handle}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setDockCtx({ appId, x: e.clientX, y: e.clientY - 160 });
                  }}
                >
                  <span className="mac-dock-icon">
                    <AppIcon icon={app.icon} size={26} />
                  </span>
                </button>
                {running && <span className="mac-dock-dot" />}
              </div>
            );
          })}
          {/* Separator + trash */}
          <div className="mac-dock-sep" />
          <div className="mac-dock-item-wrap" title="Trash">
            <button className="mac-dock-item">
              <span className="mac-dock-icon">🗑️</span>
            </button>
          </div>
        </div>
      </div>

      {/* Dock context menu */}
      {dockCtx && (
        <AppContextMenu
          appId={dockCtx.appId}
          x={dockCtx.x}
          y={dockCtx.y}
          onClose={() => setDockCtx(null)}
          pinLabel="Keep in Dock"
          unpinLabel="Remove from Dock"
          closeLabel="Quit"
        />
      )}

      {ctxPos && (
        <DesktopContextMenu
          x={ctxPos.x}
          y={ctxPos.y}
          onClose={() => setCtxPos(null)}
        />
      )}
    </div>
  );
}

// ── GNOME/Unix top-panel shell ────────────────────────────────────────────────

export function UnixShell() {
  const now = useClock();
  const { openWindow, windows, focusWindow, minimizeWindow } = useShellStore();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [actionCenterOpen, setActionCenterOpen] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const launcherRef = useRef<HTMLDivElement>(null);

  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateStr = now.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const handleCtx = useContextMenu((x, y) => {
    setCtxPos({ x, y });
    setLauncherOpen(false);
  });

  useEffect(() => {
    if (!launcherOpen) return;
    const handler = (e: MouseEvent) => {
      if (!launcherRef.current?.contains(e.target as Node))
        setLauncherOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [launcherOpen]);

  // Focused window title
  const focusedWin = [...windows]
    .sort((a, b) => b.zIndex - a.zIndex)
    .find((w) => !w.minimized);

  return (
    <div
      style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
      onContextMenu={handleCtx}
      onClick={() => {
        setCtxPos(null);
        setLauncherOpen(false);
      }}
    >
      <ParadigmBg paradigm="unix" />
      <WindowManager insetTop={32} insetBottom={0} />

      {/* ── Top Panel ── */}
      <div className="unix-panel" style={{ pointerEvents: "auto" }}>
        {/* Activities / App launcher */}
        <div style={{ position: "relative" }}>
          <button
            className="unix-activities-btn"
            onClick={(e) => {
              e.stopPropagation();
              setLauncherOpen((v) => !v);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect
                x="1"
                y="1"
                width="6"
                height="6"
                rx="1.2"
                fill="currentColor"
                opacity="0.9"
              />
              <rect
                x="9"
                y="1"
                width="6"
                height="6"
                rx="1.2"
                fill="currentColor"
                opacity="0.9"
              />
              <rect
                x="1"
                y="9"
                width="6"
                height="6"
                rx="1.2"
                fill="currentColor"
                opacity="0.9"
              />
              <rect
                x="9"
                y="9"
                width="6"
                height="6"
                rx="1.2"
                fill="currentColor"
                opacity="0.9"
              />
            </svg>
            Activities
          </button>

          <AnimatePresence>
            {launcherOpen && (
              <motion.div
                ref={launcherRef}
                className="unix-launcher"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="unix-launcher-title">Applications</div>
                <div className="unix-launcher-grid">
                  {DEFAULT_APPS.slice(0, 12).map((app) => (
                    <button
                      key={app.id}
                      className="unix-launcher-item"
                      onClick={() => {
                        openWindow(app);
                        setLauncherOpen(false);
                      }}
                    >
                      <span className="unix-launcher-icon">
                        <AppIcon icon={app.icon} size={28} />
                      </span>
                      <span className="unix-launcher-label">{app.title}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Window list — centered */}
        <div className="unix-panel-windows">
          {windows
            .filter((w) => !w.minimized)
            .map((w) => (
              <button
                key={w.id}
                className={`unix-win-btn${w.id === focusedWin?.id ? " active" : ""}`}
                onClick={() => focusWindow(w.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  minimizeWindow(w.id);
                }}
              >
                <AppIcon icon={w.icon} size={14} />
                <span className="unix-win-title">{w.title}</span>
              </button>
            ))}
        </div>

        {/* Right: clock + tray */}
        <div className="unix-panel-right">
          <button className="unix-panel-tray-btn" title="Wi-Fi">
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
              />
              <path
                d="M1.3 5.2a6.1 6.1 0 0 1 11.4 0"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.6"
              />
            </svg>
          </button>
          <button className="unix-panel-tray-btn" title="Volume">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 5h2l2.5-2.5v8L4 8H2z" fill="currentColor" />
              <path
                d="M8.5 4a3 3 0 0 1 0 5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="unix-clock"
            onClick={() => setActionCenterOpen((v) => !v)}
          >
            {dateStr} &nbsp; {timeStr}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {actionCenterOpen && (
          <ActionCenter key="ac" onClose={() => setActionCenterOpen(false)} />
        )}
      </AnimatePresence>

      {ctxPos && (
        <DesktopContextMenu
          x={ctxPos.x}
          y={ctxPos.y}
          onClose={() => setCtxPos(null)}
        />
      )}
    </div>
  );
}

// ── Minimal floating dock ─────────────────────────────────────────────────────

export function MinimalShell() {
  const { openWindow, windows, focusWindow, minimizeWindow } = useShellStore();
  const maxZIndex = useShellStore((s) => s.maxZIndex);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const handleCtx = useContextMenu((x, y) => setCtxPos({ x, y }));

  const dockApps = [
    getApp("terminal"),
    getApp("browser"),
    getApp("ai-chat"),
    getApp("settings"),
    getApp("waldiez-player"),
  ].filter(Boolean);

  return (
    <div
      style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
      onContextMenu={handleCtx}
      onClick={() => setCtxPos(null)}
    >
      <ParadigmBg paradigm="minimal" />
      <WindowManager insetTop={0} insetBottom={64} />

      <div className="minimal-dock" style={{ pointerEvents: "auto" }}>
        {dockApps.map((app) => {
          if (!app) return null;
          const openWins = windows.filter((w) => w.appId === app.id);
          const running = openWins.length > 0;
          const focused = openWins.some(
            (w) => !w.minimized && w.zIndex === maxZIndex,
          );
          const handle = () => {
            if (!openWins.length) {
              openWindow(app);
              return;
            }
            const w = openWins[0];
            if (w && (w.minimized || w.zIndex < maxZIndex)) focusWindow(w.id);
            else if (w) minimizeWindow(w.id);
          };
          return (
            <div
              key={app.id}
              className="minimal-dock-item-wrap"
              title={app.title}
            >
              <button
                className={`minimal-dock-item${focused ? " active" : ""}`}
                onClick={handle}
              >
                <AppIcon icon={app.icon} size={22} />
              </button>
              {running && <span className="minimal-dock-dot" />}
            </div>
          );
        })}
      </div>

      {ctxPos && (
        <DesktopContextMenu
          x={ctxPos.x}
          y={ctxPos.y}
          onClose={() => setCtxPos(null)}
        />
      )}
    </div>
  );
}

// ── Nebula — canvas-primary, no chrome ───────────────────────────────────────

export function NebulaShell() {
  const { openWindow } = useShellStore();
  const [open, setOpen] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const fabRef = useRef<HTMLDivElement>(null);
  const handleCtx = useContextMenu((x, y) => {
    setCtxPos({ x, y });
    setOpen(false);
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!fabRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
      onContextMenu={handleCtx}
      onClick={() => {
        setCtxPos(null);
        setOpen(false);
      }}
    >
      <ParadigmBg paradigm="nebula" />
      <WindowManager insetTop={0} insetBottom={0} />

      {/* Floating action button */}
      <div
        ref={fabRef}
        className="nebula-fab-wrap"
        style={{ pointerEvents: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              className="nebula-fab-menu"
              initial={{ opacity: 0, scale: 0.9, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 8 }}
              transition={{ duration: 0.15 }}
            >
              {[
                { id: "browser", label: "Browser", icon: "🌐" },
                { id: "terminal", label: "Terminal", icon: "⬛" },
                { id: "ai-chat", label: "AI Chat", icon: "🤖" },
                { id: "settings", label: "Settings", icon: "⚙️" },
                { id: "waldiez-player", label: "Waldiez", icon: "🎬" },
              ].map((item) => {
                const app = getApp(item.id);
                return (
                  <button
                    key={item.id}
                    className="nebula-fab-item"
                    onClick={() => {
                      if (app) openWindow(app);
                      setOpen(false);
                    }}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
        <button
          className={`nebula-fab${open ? " open" : ""}`}
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="3" fill="currentColor" />
            <circle cx="4" cy="11" r="2" fill="currentColor" opacity="0.6" />
            <circle cx="18" cy="11" r="2" fill="currentColor" opacity="0.6" />
            <circle cx="11" cy="4" r="2" fill="currentColor" opacity="0.6" />
            <circle cx="11" cy="18" r="2" fill="currentColor" opacity="0.6" />
          </svg>
        </button>
      </div>

      {ctxPos && (
        <DesktopContextMenu
          x={ctxPos.x}
          y={ctxPos.y}
          onClose={() => setCtxPos(null)}
        />
      )}
    </div>
  );
}

// ── DOS retro shell ───────────────────────────────────────────────────────────

export function DosShell() {
  const now = useClock();
  const { openWindow, windows, closeWindow } = useShellStore();
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const handleCtx = useContextMenu((x, y) => setCtxPos({ x, y }));

  const dateStr = now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div
      style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
      onContextMenu={handleCtx}
      onClick={() => setCtxPos(null)}
    >
      <ParadigmBg paradigm="dos" />
      <WindowManager insetTop={20} insetBottom={20} />

      {/* Top status bar */}
      <div className="dos-bar dos-bar-top" style={{ pointerEvents: "auto" }}>
        <span className="dos-title">LIMEN OS 1.0</span>
        <div className="dos-bar-center">
          {windows.map((w) => (
            <button
              key={w.id}
              className="dos-win-btn"
              onClick={() => closeWindow(w.id)}
            >
              [{w.title} ×]
            </button>
          ))}
        </div>
        <span className="dos-clock">
          {dateStr} {timeStr}
        </span>
      </div>

      {/* Bottom status bar */}
      <div className="dos-bar dos-bar-bottom" style={{ pointerEvents: "auto" }}>
        <button
          className="dos-cmd-btn"
          onClick={() =>
            openWindow({
              id: "terminal",
              title: "Terminal",
              icon: "⬛",
              contentType: "terminal",
              defaultWidth: 800,
              defaultHeight: 500,
            })
          }
        >
          F1 Shell
        </button>
        <button
          className="dos-cmd-btn"
          onClick={() =>
            openWindow({
              id: "browser",
              title: "Browser",
              icon: "🌐",
              contentType: "browser",
              defaultWidth: 1200,
              defaultHeight: 750,
              contentUrl: "https://www.google.com",
            })
          }
        >
          F2 WWW
        </button>
        <button
          className="dos-cmd-btn"
          onClick={() =>
            openWindow({
              id: "ai-chat",
              title: "AI Chat",
              icon: "🤖",
              contentType: "ai-chat",
              defaultWidth: 720,
              defaultHeight: 620,
            })
          }
        >
          F3 AI
        </button>
        <button
          className="dos-cmd-btn"
          onClick={() =>
            openWindow({
              id: "settings",
              title: "Settings",
              icon: "⚙️",
              contentType: "settings",
              defaultWidth: 900,
              defaultHeight: 650,
            })
          }
        >
          F4 Setup
        </button>
        <div style={{ flex: 1 }} />
        <span style={{ opacity: 0.5 }}>ALT+F4=Quit</span>
      </div>

      {ctxPos && (
        <DesktopContextMenu
          x={ctxPos.x}
          y={ctxPos.y}
          onClose={() => setCtxPos(null)}
        />
      )}
    </div>
  );
}

// ── Calm — soft floating dock ─────────────────────────────────────────────────

export function CalmShell() {
  const {
    openWindow,
    windows,
    focusWindow,
    minimizeWindow,
    maxZIndex,
    pinnedApps,
  } = useShellStore();
  const [actionCenterOpen, setActionCenterOpen] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const handleCtx = useContextMenu((x, y) => {
    setCtxPos({ x, y });
  });
  const now = useClock();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const dockApps = pinnedApps.slice(0, 8).map(getApp).filter(Boolean);

  return (
    <div
      style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
      onContextMenu={handleCtx}
      onClick={() => setCtxPos(null)}
    >
      <ParadigmBg paradigm="calm" />
      <WindowManager insetTop={0} insetBottom={80} />

      <div className="calm-dock" style={{ pointerEvents: "auto" }}>
        {/* Clock pill */}
        <button
          className="calm-clock"
          onClick={() => setActionCenterOpen((v) => !v)}
        >
          {timeStr}
        </button>
        <div className="calm-dock-sep" />
        {/* Apps */}
        {dockApps.map((app) => {
          if (!app) return null;
          const openWins = windows.filter((w) => w.appId === app.id);
          const running = openWins.length > 0;
          const focused = openWins.some(
            (w) => !w.minimized && w.zIndex === maxZIndex,
          );
          const handle = () => {
            if (!openWins.length) {
              openWindow(app);
              return;
            }
            const w = openWins[0];
            if (w && (w.minimized || w.zIndex < maxZIndex)) focusWindow(w.id);
            else if (w) minimizeWindow(w.id);
          };
          return (
            <div key={app.id} className="calm-dock-item-wrap" title={app.title}>
              <button
                className={`calm-dock-item${focused ? " active" : ""}`}
                onClick={handle}
              >
                <AppIcon icon={app.icon} size={24} />
              </button>
              {running && <span className="calm-dock-dot" />}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {actionCenterOpen && (
          <ActionCenter key="ac" onClose={() => setActionCenterOpen(false)} />
        )}
      </AnimatePresence>

      {ctxPos && (
        <DesktopContextMenu
          x={ctxPos.x}
          y={ctxPos.y}
          onClose={() => setCtxPos(null)}
        />
      )}
    </div>
  );
}
