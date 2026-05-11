import { useRef, useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useShellStore, type WindowInstance } from "../../store/shell";
import { WindowContent } from "./WindowContent";
import { AppIcon } from "./AppIcon";

type ResizeDir = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const RESIZE_CURSOR: Record<ResizeDir, string> = {
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
  nw: "nwse-resize",
};

const RESIZE_DIRS: ResizeDir[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];

interface Props {
  win: WindowInstance;
}

export function Window({ win }: Props) {
  const {
    focusWindow,
    closeWindow,
    minimizeWindow,
    maximizeWindow,
    moveWindow,
    resizeWindow,
  } = useShellStore();

  const [pos, setPos] = useState({ x: win.x, y: win.y });
  const [size, setSize] = useState({ w: win.width, h: win.height });
  const [showSnap, setShowSnap] = useState(false);
  const [dragging, setDragging] = useState(false);

  const dragRef = useRef<{
    type: "drag" | ResizeDir;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);


  // Set global cursor during drag/resize so it doesn't flicker over other elements
  useEffect(() => {
    if (!dragging || !dragRef.current) return;
    const type = dragRef.current.type;
    const cursor = type === "drag" ? "move" : RESIZE_CURSOR[type as ResizeDir];
    document.body.style.cursor = cursor;
    return () => {
      document.body.style.cursor = "";
    };
  }, [dragging]);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      if (win.maximized) return;
      e.preventDefault();
      focusWindow(win.id);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      dragRef.current = {
        type: "drag",
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
        origW: size.w,
        origH: size.h,
      };
    },
    [win.maximized, win.id, pos, size, focusWindow],
  );

  const startResize = useCallback(
    (e: React.PointerEvent, dir: ResizeDir) => {
      e.preventDefault();
      e.stopPropagation();
      focusWindow(win.id);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setDragging(true);
      dragRef.current = {
        type: dir,
        startX: e.clientX,
        startY: e.clientY,
        origX: pos.x,
        origY: pos.y,
        origW: size.w,
        origH: size.h,
      };
    },
    [win.id, pos, size, focusWindow],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { type, startX, startY, origX, origY, origW, origH } =
      dragRef.current;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (type === "drag") {
      setPos({ x: Math.max(0, origX + dx), y: Math.max(0, origY + dy) });
    } else {
      const MIN_W = 320,
        MIN_H = 200;
      let x = origX,
        y = origY,
        w = origW,
        h = origH;
      if (type.includes("e")) w = Math.max(MIN_W, origW + dx);
      if (type.includes("w")) {
        w = Math.max(MIN_W, origW - dx);
        x = origX + (origW - w);
      }
      if (type.includes("s")) h = Math.max(MIN_H, origH + dy);
      if (type.includes("n")) {
        h = Math.max(MIN_H, origH - dy);
        y = origY + (origH - h);
      }
      setPos({ x, y });
      setSize({ w, h });
    }
  }, []);

  const onPointerUp = useCallback(() => {
    if (!dragRef.current) return;
    moveWindow(win.id, pos.x, pos.y);
    resizeWindow(win.id, size.w, size.h);
    dragRef.current = null;
    setDragging(false);
  }, [win.id, pos, size, moveWindow, resizeWindow]);

  const snapLeft = useCallback(() => {
    const sw = window.innerWidth;
    const sh = window.innerHeight - 48;
    setPos({ x: 0, y: 0 });
    setSize({ w: sw / 2, h: sh });
    moveWindow(win.id, 0, 0);
    resizeWindow(win.id, sw / 2, sh);
  }, [win.id, moveWindow, resizeWindow]);

  const snapRight = useCallback(() => {
    const sw = window.innerWidth;
    const sh = window.innerHeight - 48;
    setPos({ x: sw / 2, y: 0 });
    setSize({ w: sw / 2, h: sh });
    moveWindow(win.id, sw / 2, 0);
    resizeWindow(win.id, sw / 2, sh);
  }, [win.id, moveWindow, resizeWindow]);

  if (win.minimized) return null;

  const containerStyle = win.maximized
    ? {
        position: "fixed" as const,
        left: 0,
        top: "var(--wm-inset-top, 0px)",
        width: "100vw",
        height:
          "calc(100vh - var(--wm-inset-top, 0px) - var(--wm-inset-bottom, 48px))",
        borderRadius: 0,
      }
    : {
        position: "fixed" as const,
        left: pos.x,
        top: pos.y,
        width: size.w,
        height: size.h,
      };

  // Resize ring: 8px larger than the window on all sides (4px each).
  // Placed OUTSIDE the window so iframe content can never intercept the handles.
  const ringStyle = {
    position: "fixed" as const,
    left: pos.x - 4,
    top: pos.y - 4,
    width: size.w + 8,
    height: size.h + 8,
    zIndex: win.zIndex,
    pointerEvents: "none" as const,
  };

  const appClass =
    win.appId === "home-assistant"
      ? " ha-window"
      : "";

  return (
    <>
      {/* ── Resize ring ─────────────────────────────────────────────────────────
          Sits outside the visual window. Handles are in the 4-8px gap that
          iframe content can never reach → solves "can't resize" on iframe windows. */}
      {!win.maximized && (
        <div
          style={ringStyle}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {RESIZE_DIRS.map((dir) => (
            <div
              key={dir}
              className={`win11-resize win11-resize-${dir}`}
              style={{ cursor: RESIZE_CURSOR[dir], pointerEvents: "all" }}
              onPointerDown={(e) => startResize(e, dir)}
            />
          ))}
        </div>
      )}

      {/* ── Visual window ───────────────────────────────────────────────────── */}
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        style={{ ...containerStyle, zIndex: win.zIndex, pointerEvents: "auto" }}
        className={`win11-window${appClass}${dragging ? " is-dragging" : ""}`}
        onPointerDown={(e) => {
          e.stopPropagation();
          focusWindow(win.id);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* Title bar */}
        <div
          className="win11-titlebar"
          onPointerDown={startDrag}
          onDoubleClick={() => maximizeWindow(win.id)}
        >
          <span className="win11-titlebar-icon">
            <AppIcon icon={win.icon} size={16} />
          </span>
          <span
            className="win11-titlebar-title"
          >
            {win.title}
          </span>

          <div
            className="win11-titlebar-controls"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              className="win11-wbtn win11-wbtn-min"
              onClick={(e) => {
                e.stopPropagation();
                minimizeWindow(win.id);
              }}
              title="Minimize"
            >
              <svg width="10" height="1" viewBox="0 0 10 1">
                <rect width="10" height="1" fill="currentColor" />
              </svg>
            </button>

            {/* Maximize + snap zones */}
            <div
              className="win11-wbtn-max-wrap"
              onMouseEnter={() => setShowSnap(true)}
              onMouseLeave={() => setShowSnap(false)}
            >
              <button
                className="win11-wbtn win11-wbtn-max"
                onClick={(e) => {
                  e.stopPropagation();
                  maximizeWindow(win.id);
                }}
                title={win.maximized ? "Restore" : "Maximize"}
              >
                {win.maximized ? (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <rect
                      x="0"
                      y="3"
                      width="7"
                      height="7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                    <path
                      d="M3 3V1h7v7H7"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <rect
                      x="0.6"
                      y="0.6"
                      width="9.8"
                      height="9.8"
                      stroke="currentColor"
                      strokeWidth="1.2"
                    />
                  </svg>
                )}
              </button>
              <AnimatePresence>
                {showSnap && !win.maximized && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.1 }}
                    className="win11-snap-popup"
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        snapLeft();
                        setShowSnap(false);
                      }}
                      title="Snap left"
                    >
                      <svg width="28" height="20" viewBox="0 0 28 20">
                        <rect
                          x="1"
                          y="1"
                          width="12"
                          height="18"
                          rx="2"
                          fill="rgba(0,120,212,0.5)"
                          stroke="rgba(96,205,255,0.8)"
                          strokeWidth="1.5"
                        />
                        <rect
                          x="15"
                          y="1"
                          width="12"
                          height="18"
                          rx="2"
                          fill="rgba(255,255,255,0.06)"
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth="1"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        maximizeWindow(win.id);
                        setShowSnap(false);
                      }}
                      title="Maximize"
                    >
                      <svg width="28" height="20" viewBox="0 0 28 20">
                        <rect
                          x="1"
                          y="1"
                          width="26"
                          height="18"
                          rx="2"
                          fill="rgba(0,120,212,0.5)"
                          stroke="rgba(96,205,255,0.8)"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        snapRight();
                        setShowSnap(false);
                      }}
                      title="Snap right"
                    >
                      <svg width="28" height="20" viewBox="0 0 28 20">
                        <rect
                          x="1"
                          y="1"
                          width="12"
                          height="18"
                          rx="2"
                          fill="rgba(255,255,255,0.06)"
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth="1"
                        />
                        <rect
                          x="15"
                          y="1"
                          width="12"
                          height="18"
                          rx="2"
                          fill="rgba(0,120,212,0.5)"
                          stroke="rgba(96,205,255,0.8)"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              className="win11-wbtn win11-wbtn-close"
              onClick={(e) => {
                e.stopPropagation();
                closeWindow(win.id);
              }}
              title="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path
                  d="M1 1L9 9M9 1L1 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="win11-window-body">
          <WindowContent win={win} />
        </div>
      </motion.div>
    </>
  );
}
