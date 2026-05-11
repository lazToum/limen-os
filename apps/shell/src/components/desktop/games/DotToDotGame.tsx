import { useState, useEffect, useRef, useCallback } from "react";

// Canvas viewport — portrait, prints well on A5/A4
const CW = 420;
const CH = 450;
const DOT_R = 6;
const HIT_R = 22; // click tolerance

interface Shape {
  id: string;
  label: string;
  emoji: string;
  dots: [number, number][];
  closed?: boolean; // whether last dot connects back to first
}

// ── Shape definitions ─────────────────────────────────────────────────────────
// All coordinates in CW×CH space. Each shape is a single sequential path —
// connect dots 1→2→3→…→N with a pencil, lift for repeated positions.

const SHAPES: Shape[] = [
  {
    id: "brain",
    label: "Human Brain",
    emoji: "🧠",
    closed: true,
    dots: [
      [210, 58], [254, 52], [293, 67], [321, 95], [333, 133],
      [325, 171], [303, 200], [264, 217], [210, 221],
      [156, 217], [117, 200], [95, 171], [87, 133],
      [99,  95], [127,  67], [166,  52],
    ],
  },
  {
    id: "loop",
    label: "Feedback Loop",
    emoji: "🔄",
    closed: false,
    dots: [
      // 12-point circle
      [210, 52], [258, 65], [296, 99], [310, 147],
      [296, 195], [258, 229], [210, 241], [162, 229],
      [124, 195], [110, 147], [124,  99], [162,  65],
      // close + arrowhead at top
      [210, 52], [192, 33], [210, 52], [228, 33],
    ],
  },
  {
    id: "person",
    label: "Human in the Loop",
    emoji: "👤",
    closed: false,
    dots: [
      // head
      [210, 52], [233, 60], [244, 82], [234, 106],
      [210, 114], [186, 106], [176, 82], [187, 60], [210, 52],
      // neck → waist
      [210, 126], [210, 174],
      // left arm (out and back)
      [172, 152], [142, 136], [172, 152],
      // right arm (out and back)
      [248, 152], [278, 136], [248, 152],
      // left leg
      [210, 174], [193, 214], [183, 252],
      // rejoin waist → right leg
      [193, 214], [210, 174], [227, 214], [237, 252],
    ],
  },
  {
    id: "robot",
    label: "AI System",
    emoji: "🤖",
    closed: false,
    dots: [
      // head box
      [150, 68], [270, 68], [270, 182], [150, 182], [150, 68],
      // left eye
      [175, 104], [195, 104], [195, 122], [175, 122], [175, 104],
      // right eye
      [225, 104], [245, 104], [245, 122], [225, 122], [225, 104],
      // mouth bar
      [175, 156], [245, 156],
      // antenna
      [210, 68], [210, 48], [198, 38], [210, 48], [222, 38],
    ],
  },
];

// ── Drawing ───────────────────────────────────────────────────────────────────
function render(
  canvas: HTMLCanvasElement,
  shape: Shape,
  nextDot: number,  // how many dots have been "connected" (0 = none)
  reveal: boolean,  // show all lines regardless of nextDot
  printing: boolean,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = printing ? 1 : (window.devicePixelRatio || 1);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, CW, CH);

  // Paper background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CW, CH);

  if (!printing) {
    // Subtle grid texture for screen
    ctx.strokeStyle = "rgba(0,0,0,0.04)";
    ctx.lineWidth = 0.5;
    for (let x = 0; x < CW; x += 20) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,CH); ctx.stroke(); }
    for (let y = 0; y < CH; y += 20) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(CW,y); ctx.stroke(); }
  }

  const dots = shape.dots;
  const connected = reveal ? dots.length : nextDot;

  // Draw connecting lines
  if (connected >= 2) {
    ctx.strokeStyle = "#888";
    ctx.lineWidth = printing ? 0.8 : 1.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(dots[0][0], dots[0][1]);
    for (let i = 1; i < connected; i++) {
      ctx.lineTo(dots[i][0], dots[i][1]);
    }
    if (shape.closed && connected === dots.length) {
      ctx.lineTo(dots[0][0], dots[0][1]);
    }
    ctx.stroke();
  }

  // Draw dots
  const totalUnique = new Set(dots.map(([x, y]) => `${x},${y}`)).size;
  const seenPositions = new Map<string, number>(); // pos → first dot index

  for (let i = 0; i < dots.length; i++) {
    const [x, y] = dots[i];
    const key = `${x},${y}`;
    if (seenPositions.has(key)) continue; // skip repeated positions (only label first occurrence)
    seenPositions.set(key, i);

    const isConnected = i < connected;
    const isNext = i === nextDot && !reveal;

    // Dot circle
    ctx.beginPath();
    ctx.arc(x, y, DOT_R, 0, Math.PI * 2);
    ctx.fillStyle = printing
      ? "#000"
      : isConnected ? "#2d6a4f" : isNext ? "#b5451b" : "#444";
    ctx.fill();

    // Number label
    const num = i + 1;
    const fontSize = printing ? 9 : (isNext ? 11 : 9);
    ctx.font = `bold ${fontSize}px sans-serif`;
    ctx.fillStyle = printing ? "#000" : (isNext ? "#b5451b" : "#333");
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(String(num), x, y - DOT_R - 2);
  }

  void totalUnique; // suppress lint warning

  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────
export function DotToDotGame() {
  const [shapeIdx, setShapeIdx] = useState(0);
  const [nextDot, setNextDot]   = useState(0);
  const [reveal, setReveal]     = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const shape = SHAPES[shapeIdx];

  // Unique clickable positions (skip duplicates)
  const clickOrder = (() => {
    const seen = new Set<string>();
    return shape.dots
      .map(([x, y], i) => ({ x, y, i }))
      .filter(({ x, y }) => {
        const k = `${x},${y}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  })();
  const totalDots = clickOrder.length;

  const done = nextDot >= totalDots;

  // Set canvas size + redraw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(CW * dpr);
    canvas.height = Math.round(CH * dpr);
    canvas.style.width  = `${CW}px`;
    canvas.style.height = `${CH}px`;
    render(canvas, shape, nextDot, reveal, false);
  }, [shape, nextDot, reveal]);

  // Shared hit-test logic
  const tryHit = useCallback((clientX: number, clientY: number) => {
    if (reveal || done) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left) * (CW / rect.width);
    const my = (clientY - rect.top)  * (CH / rect.height);
    const target = clickOrder[nextDot];
    if (!target) return;
    if (Math.hypot(mx - target.x, my - target.y) < HIT_R) {
      setNextDot(n => n + 1);
    }
  }, [reveal, done, nextDot, clickOrder]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    tryHit(e.clientX, e.clientY);
  }, [tryHit]);

  const handleTouch = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    if (t) tryHit(t.clientX, t.clientY);
  }, [tryHit]);

  const reset = () => { setNextDot(0); setReveal(false); };

  const changeShape = (delta: number) => {
    setShapeIdx(i => (i + delta + SHAPES.length) % SHAPES.length);
    setNextDot(0);
    setReveal(false);
  };

  // Print: render dots-only to an offscreen canvas, open in a new window
  const handlePrint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Temporarily render dots-only (not reveal, nextDot=0) to a print canvas
    const print = document.createElement("canvas");
    print.width  = CW;
    print.height = CH;
    render(print, shape, 0, false, true);

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Dot-to-Dot: ${shape.label}</title>
      <style>
        body { margin: 20px; font-family: sans-serif; }
        h2 { font-size: 14px; margin-bottom: 4px; }
        p  { font-size: 11px; color: #666; margin-bottom: 12px; }
        img { display: block; max-width: 100%; }
        @media print { button { display: none; } }
      </style></head><body>
      <h2>${shape.emoji} ${shape.label} — Connect the Dots</h2>
      <p>Connect dot 1 → 2 → 3 → … in order. Lift your pencil at repeated positions.</p>
      <img src="${print.toDataURL()}" />
      <br><button onclick="window.print()">🖨 Print</button>
      </body></html>
    `);
    win.document.close();
  }, [shape]);

  const target = clickOrder[nextDot];

  return (
    <div className="dtd">
      <div className="dtd-toolbar">
        <button className="dtd-btn" onClick={() => changeShape(-1)}>◀</button>
        <span className="dtd-name">{shape.emoji} {shape.label}</span>
        <button className="dtd-btn" onClick={() => changeShape(1)}>▶</button>
        <button className="dtd-btn" onClick={reset}>Reset</button>
        <button
          className="dtd-btn"
          style={reveal ? { background: "#2d6a4f", color: "#fff" } : undefined}
          onClick={() => setReveal(r => !r)}
        >
          {reveal ? "Hide solution" : "Reveal"}
        </button>
        <button className="dtd-btn" onClick={handlePrint} title="Open printable sheet in new tab">
          🖨 Print
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="dtd-canvas"
        onClick={handleClick}
        onTouchEnd={handleTouch}
        style={{ cursor: reveal || done ? "default" : "crosshair" }}
        aria-label={`Connect-the-dots: ${shape.label}. ${reveal ? "Solution shown." : done ? "Complete!" : `Click dot ${nextDot + 1} next.`}`}
      />

      <div className={`dtd-footer${done ? " dtd-done" : ""}`}>
        {reveal
          ? "Solution revealed — print to get a blank puzzle sheet"
          : done
          ? `✓ Complete! ${shape.emoji}`
          : target
          ? <>Tap dot <strong style={{ color: "#b5451b" }}>{nextDot + 1}</strong> of {totalDots}</>
          : null
        }
      </div>
    </div>
  );
}
