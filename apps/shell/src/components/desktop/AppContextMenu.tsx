import { useEffect, useRef } from "react";
import { useShellStore } from "../../store/shell";
import { getApp } from "../../constants/apps";

interface Props {
  appId: string;
  x: number;
  y: number;
  onClose: () => void;
  /** Label shown when the app is NOT yet pinned. Default: "Pin to taskbar" */
  pinLabel?: string;
  /** Label shown when the app IS pinned. Default: "Unpin from taskbar" */
  unpinLabel?: string;
  /** Label for the close/quit action. Default: "Close window" */
  closeLabel?: string;
}

export function AppContextMenu({
  appId,
  x,
  y,
  onClose,
  pinLabel = "Pin to taskbar",
  unpinLabel = "Unpin from taskbar",
  closeLabel = "Close window",
}: Props) {
  const {
    windows,
    pinnedApps,
    openWindow,
    focusWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    moveWindow,
    resizeWindow,
    pinApp,
    unpinApp,
  } = useShellStore();

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const isPinned = pinnedApps.includes(appId);
  const openWin = windows.find((w) => w.appId === appId);
  const isRunning = !!openWin;

  return (
    <div
      ref={ref}
      className="win11-context-menu"
      style={{ position: "fixed", left: x, top: y, zIndex: 99999 }}
    >
      {isRunning && openWin && (
        <>
          <button
            onClick={() => {
              focusWindow(openWin.id);
              onClose();
            }}
          >
            Bring to front
          </button>
          <button
            onClick={() => {
              minimizeWindow(openWin.id);
              onClose();
            }}
          >
            Minimize
          </button>
          <button
            onClick={() => {
              maximizeWindow(openWin.id);
              onClose();
            }}
          >
            {openWin.maximized ? "Restore" : "Maximize"}
          </button>
          <div className="win11-context-sep" />
          <button
            onClick={() => {
              const sw = window.innerWidth;
              const sh = window.innerHeight - 48;
              moveWindow(openWin.id, 0, 0);
              resizeWindow(openWin.id, sw / 2, sh);
              focusWindow(openWin.id);
              onClose();
            }}
          >
            Snap left
          </button>
          <button
            onClick={() => {
              const sw = window.innerWidth;
              const sh = window.innerHeight - 48;
              moveWindow(openWin.id, sw / 2, 0);
              resizeWindow(openWin.id, sw / 2, sh);
              focusWindow(openWin.id);
              onClose();
            }}
          >
            Snap right
          </button>
          <div className="win11-context-sep" />
        </>
      )}
      {!isRunning && (
        <button
          onClick={() => {
            const app = getApp(appId);
            if (app) openWindow(app);
            onClose();
          }}
        >
          Open
        </button>
      )}
      {isPinned ? (
        <button
          onClick={() => {
            unpinApp(appId);
            onClose();
          }}
        >
          {unpinLabel}
        </button>
      ) : (
        <button
          onClick={() => {
            pinApp(appId);
            onClose();
          }}
        >
          {pinLabel}
        </button>
      )}
      {isRunning && openWin && (
        <>
          <div className="win11-context-sep" />
          <button
            onClick={() => {
              closeWindow(openWin.id);
              onClose();
            }}
          >
            {closeLabel}
          </button>
        </>
      )}
    </div>
  );
}
