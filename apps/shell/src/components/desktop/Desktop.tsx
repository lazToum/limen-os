import { useState, useCallback, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Taskbar } from "./Taskbar";
import { StartMenu } from "./StartMenu";
import { ActionCenter } from "./ActionCenter";
import { NotificationCenter } from "./NotificationCenter";
import { WindowManager } from "./WindowManager";
import {
  MacOSShell,
  UnixShell,
  MinimalShell,
  NebulaShell,
  DosShell,
  CalmShell,
} from "./ParadigmShells";
import { useShellStore } from "../../store/shell";
import { getApp } from "../../constants/apps";

/**
 * Desktop chrome — routes to per-paradigm shell.
 * Each shell owns its own taskbar/dock/panel + WindowManager with correct insets.
 * Win11 stays as the default.
 */
export function Desktop() {
  const { paradigm } = useShellStore();

  switch (paradigm) {
    case "macos7":
      return <MacOSShell />;
    case "unix":
      return <UnixShell />;
    case "minimal":
      return <MinimalShell />;
    case "nebula":
      return <NebulaShell />;
    case "dos":
      return <DosShell />;
    case "lobby":
      return null;
    case "calm":
      return <CalmShell />;
    default:
      return <Win11Shell />;
  }
}

// ── Win11 shell (original) ────────────────────────────────────────────────────

function Win11Shell() {
  const [startOpen, setStartOpen] = useState(false);
  const [actionCenterOpen, setActionCenterOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const { openWindow, hasSeenTutorial } = useShellStore();

  useEffect(() => {
    if (!hasSeenTutorial) {
      const app = getApp("waldiez-reader");
      if (app) openWindow(app);
    }
  }, [hasSeenTutorial, openWindow]);

  const toggleStart = useCallback(() => {
    setStartOpen((v) => !v);
    setActionCenterOpen(false);
    setNotificationCenterOpen(false);
  }, []);

  const toggleActionCenter = useCallback(() => {
    setActionCenterOpen((v) => !v);
    setStartOpen(false);
    setNotificationCenterOpen(false);
  }, []);

  const toggleNotificationCenter = useCallback(() => {
    setNotificationCenterOpen((v) => !v);
    setStartOpen(false);
    setActionCenterOpen(false);
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none" }}>
      <WindowManager />

      {/* Start Menu */}
      <AnimatePresence>
        {startOpen && (
          <StartMenu key="start-menu" onClose={() => setStartOpen(false)} />
        )}
      </AnimatePresence>

      {/* Action Center */}
      <AnimatePresence>
        {actionCenterOpen && (
          <ActionCenter
            key="action-center"
            onClose={() => setActionCenterOpen(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notificationCenterOpen && (
          <NotificationCenter
            key="notification-center"
            onClose={() => setNotificationCenterOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Taskbar */}
      <Taskbar
        onStartClick={toggleStart}
        onActionCenterClick={toggleActionCenter}
        onNotificationCenterClick={toggleNotificationCenter}
        startOpen={startOpen}
      />
    </div>
  );
}
