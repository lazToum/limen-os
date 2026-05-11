/* eslint-disable react-hooks/preserve-manual-memoization */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

// ── Canvas / geometry constants ──────────────────────────────────────────────

const CANVAS_W = 600;
const CANVAS_H = 420;
const LANE_L = 110;
const LANE_R = 490;
const LANE_CX = (LANE_L + LANE_R) / 2;
const LANE_W = LANE_R - LANE_L;
const BALL_R = 18;
const PIN_R = 11;
const START_Y = 378;
const FOUL_Y = 318;
const TARGET_Y = 110;
const MAX_FRAMES = 10;

// ── Pin layout (standard 10-pin triangle) ────────────────────────────────────

function makePins() {
  const dx = 37,
    dy = 32,
    top = 82;
  return [
    { x: LANE_CX, y: top + dy * 3, standing: true }, // 1
    { x: LANE_CX - dx / 2, y: top + dy * 2, standing: true }, // 2
    { x: LANE_CX + dx / 2, y: top + dy * 2, standing: true }, // 3
    { x: LANE_CX - dx, y: top + dy, standing: true }, // 4
    { x: LANE_CX, y: top + dy, standing: true }, // 5
    { x: LANE_CX + dx, y: top + dy, standing: true }, // 6
    { x: LANE_CX - dx * 1.5, y: top, standing: true }, // 7
    { x: LANE_CX - dx * 0.5, y: top, standing: true }, // 8
    { x: LANE_CX + dx * 0.5, y: top, standing: true }, // 9
    { x: LANE_CX + dx * 1.5, y: top, standing: true }, // 10
  ];
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Frame {
  rolls: number[];
}
type Phase = "ready" | "rolling" | "settling" | "over";
interface BowlingState {
  pins: ReturnType<typeof makePins>;
  frames: Frame[];
  frameIndex: number;
  rollIndex: number;
  aim: number;
  power: number;
  ball: { x: number; y: number; vx: number; vy: number } | null;
  phase: Phase;
  pendingKnock: Set<number>;
}
interface BowlingUi {
  frame: number;
  roll: number;
  aim: number;
  power: number;
  status: string;
  gameOver: boolean;
  frames: Frame[];
  totals: number[];
}

function createState(): BowlingState {
  return {
    pins: makePins(),
    frames: Array.from({ length: MAX_FRAMES }, () => ({ rolls: [] })),
    frameIndex: 0,
    rollIndex: 0,
    aim: 0,
    power: 0.62,
    ball: null,
    phase: "ready",
    pendingKnock: new Set(),
  };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function flattenRolls(frames: Frame[]) {
  const rolls: number[] = [];
  frames.forEach((f, i) => {
    if (i < 9) {
      if (f.rolls[0] === 10) rolls.push(10);
      else {
        if (f.rolls[0] !== undefined) rolls.push(f.rolls[0]);
        if (f.rolls[1] !== undefined) rolls.push(f.rolls[1]);
      }
    } else f.rolls.forEach((r) => rolls.push(r));
  });
  return rolls;
}

function frameTotals(frames: Frame[]) {
  const totals = Array(MAX_FRAMES).fill(-1);
  const rolls = flattenRolls(frames);
  let p = 0,
    total = 0;
  for (let f = 0; f < MAX_FRAMES; f++) {
    if (f === 9) {
      const ff = frames[9];
      if (ff.rolls.length < 2) break;
      if (
        ff.rolls[0] === 10 ||
        (ff.rolls[0] ?? 0) + (ff.rolls[1] ?? 0) === 10
      ) {
        if (ff.rolls.length < 3) break;
      }
      total += ff.rolls.reduce((s, r) => s + r, 0);
      totals[f] = total;
      break;
    }
    const first = rolls[p];
    if (first === undefined) break;
    if (first === 10) {
      const a = rolls[p + 1],
        b = rolls[p + 2];
      if (a === undefined || b === undefined) break;
      total += 10 + a + b;
      totals[f] = total;
      p++;
      continue;
    }
    const second = rolls[p + 1];
    if (second === undefined) break;
    if (first + second === 10) {
      const bonus = rolls[p + 2];
      if (bonus === undefined) break;
      total += 10 + bonus;
    } else total += first + second;
    totals[f] = total;
    p += 2;
  }
  return totals;
}

function rollLabel(frame: Frame, fi: number, slot: number) {
  const v = frame.rolls[slot];
  if (v === undefined) return "";
  if (fi < 9) {
    if (slot === 0 && v === 10) return "X";
    if (slot === 1 && (frame.rolls[0] ?? 0) + v === 10) return "/";
    return String(v);
  }
  if (v === 10) return "X";
  if (
    slot > 0 &&
    (frame.rolls[slot - 1] ?? 0) !== 10 &&
    (frame.rolls[slot - 1] ?? 0) + v === 10
  )
    return "/";
  return String(v);
}

function laneXFromAim(aim: number) {
  return LANE_CX + aim * 68;
}

// ── Renderer ──────────────────────────────────────────────────────────────────

function drawBowling(canvas: HTMLCanvasElement, state: BowlingState) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // ── Background: dark bowling alley ───────────────────────────────────────
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
  bg.addColorStop(0, "#060e1c");
  bg.addColorStop(0.5, "#0a1628");
  bg.addColorStop(1, "#0d1b30");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Ceiling strip at top
  const ceiling = ctx.createLinearGradient(0, 0, 0, 50);
  ceiling.addColorStop(0, "rgba(20,30,60,0.9)");
  ceiling.addColorStop(1, "rgba(10,18,40,0)");
  ctx.fillStyle = ceiling;
  ctx.fillRect(0, 0, CANVAS_W, 50);

  // ── Side gutters (dark recessed) ─────────────────────────────────────────
  const gutterL = ctx.createLinearGradient(0, 0, LANE_L, 0);
  gutterL.addColorStop(0, "#030810");
  gutterL.addColorStop(1, "#071228");
  ctx.fillStyle = gutterL;
  ctx.fillRect(0, 60, LANE_L, CANVAS_H - 60);

  const gutterR = ctx.createLinearGradient(LANE_R, 0, CANVAS_W, 0);
  gutterR.addColorStop(0, "#071228");
  gutterR.addColorStop(1, "#030810");
  ctx.fillStyle = gutterR;
  ctx.fillRect(LANE_R, 60, CANVAS_W - LANE_R, CANVAS_H - 60);

  // Gutter groove lines
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 2;
  for (const x of [LANE_L - 4, LANE_L - 12, LANE_R + 4, LANE_R + 12]) {
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x, CANVAS_H);
    ctx.stroke();
  }

  // ── Lane wood surface ────────────────────────────────────────────────────
  const wood = ctx.createLinearGradient(LANE_L, 60, LANE_R, CANVAS_H);
  wood.addColorStop(0, "#e8c882");
  wood.addColorStop(0.25, "#d9b46a");
  wood.addColorStop(0.5, "#cca55e");
  wood.addColorStop(0.75, "#d4ad68");
  wood.addColorStop(1, "#c79850");
  ctx.fillStyle = wood;
  ctx.fillRect(LANE_L, 60, LANE_W, CANVAS_H - 60);

  // Wood grain lines
  ctx.strokeStyle = "rgba(80,40,10,0.10)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 14; i++) {
    const x = LANE_L + (LANE_W / 14) * i;
    ctx.beginPath();
    ctx.moveTo(x, 60);
    ctx.lineTo(x, CANVAS_H);
    ctx.stroke();
  }

  // ── Lane divider borders ─────────────────────────────────────────────────
  ctx.strokeStyle = "rgba(80,40,10,0.30)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(LANE_L, 60);
  ctx.lineTo(LANE_L, CANVAS_H);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(LANE_R, 60);
  ctx.lineTo(LANE_R, CANVAS_H);
  ctx.stroke();

  // ── Pin deck (slightly lighter zone at top) ───────────────────────────────
  const deck = ctx.createLinearGradient(LANE_L, 60, LANE_L, TARGET_Y + 80);
  deck.addColorStop(0, "rgba(255,230,160,0.18)");
  deck.addColorStop(1, "rgba(255,230,160,0)");
  ctx.fillStyle = deck;
  ctx.fillRect(LANE_L, 60, LANE_W, TARGET_Y + 80 - 60);

  // Overhead spotlight on pin deck
  const spot = ctx.createRadialGradient(
    LANE_CX,
    TARGET_Y,
    20,
    LANE_CX,
    TARGET_Y,
    160,
  );
  spot.addColorStop(0, "rgba(255,240,200,0.14)");
  spot.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(LANE_L, 60, LANE_W, 200);

  // ── Approach dots (3 rows before foul line) ───────────────────────────────
  const dotY = [FOUL_Y + 28, FOUL_Y + 46, FOUL_Y + 64];
  const dotXOffsets = [-70, -48, -26, 0, 26, 48, 70];
  ctx.fillStyle = "rgba(80,40,10,0.22)";
  dotY.forEach((y) => {
    dotXOffsets.forEach((dx) => {
      ctx.beginPath();
      ctx.arc(LANE_CX + dx, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  // ── Arrow markers (7 arrows pointing up the lane) ────────────────────────
  const arrowY = FOUL_Y - 60;
  const arrowOffsets = [-60, -40, -20, 0, 20, 40, 60];
  ctx.fillStyle = "rgba(80,40,10,0.28)";
  arrowOffsets.forEach((dx) => {
    const x = LANE_CX + dx;
    ctx.beginPath();
    ctx.moveTo(x, arrowY - 8);
    ctx.lineTo(x - 5, arrowY + 6);
    ctx.lineTo(x, arrowY + 2);
    ctx.lineTo(x + 5, arrowY + 6);
    ctx.closePath();
    ctx.fill();
  });

  // ── Foul line ─────────────────────────────────────────────────────────────
  ctx.save();
  ctx.shadowColor = "#ef4444";
  ctx.shadowBlur = 8;
  ctx.strokeStyle = "#ef4444";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(LANE_L, FOUL_Y);
  ctx.lineTo(LANE_R, FOUL_Y);
  ctx.stroke();
  ctx.restore();

  // Foul label
  ctx.fillStyle = "rgba(239,68,68,0.55)";
  ctx.font = "bold 9px monospace";
  ctx.textAlign = "left";
  ctx.fillText("FOUL", LANE_L + 6, FOUL_Y - 5);

  // ── Aim guide (only in ready phase) ──────────────────────────────────────
  if (state.phase === "ready") {
    const targetX = laneXFromAim(state.aim);
    ctx.save();
    ctx.setLineDash([8, 7]);
    ctx.strokeStyle = "rgba(56,226,240,0.55)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(LANE_CX, START_Y);
    ctx.lineTo(targetX, TARGET_Y);
    ctx.stroke();
    ctx.setLineDash([]);
    // Target crosshair dot
    ctx.beginPath();
    ctx.arc(targetX, TARGET_Y - 10, 4, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(56,226,240,0.5)";
    ctx.fill();
    ctx.restore();
  }

  // ── Pins ──────────────────────────────────────────────────────────────────
  state.pins.forEach((pin, i) => {
    if (!pin.standing) {
      // Fallen pin: dark oval shadow
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#3d1e0a";
      ctx.beginPath();
      ctx.ellipse(
        pin.x + 2,
        pin.y + 7,
        PIN_R * 1.3,
        PIN_R * 0.55,
        0.4,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
      return;
    }

    const wobble = state.pendingKnock.has(i)
      ? Math.sin(Date.now() * 0.03 + i) * 2.5
      : 0;

    // Pin drop shadow
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = "#3d1e0a";
    ctx.beginPath();
    ctx.ellipse(
      pin.x + 3,
      pin.y + 5,
      PIN_R * 0.85,
      PIN_R * 0.4,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();

    // Pin body gradient (white ceramic)
    const pg = ctx.createRadialGradient(
      pin.x + wobble - 3,
      pin.y - 4,
      1,
      pin.x + wobble,
      pin.y,
      PIN_R,
    );
    pg.addColorStop(0, "#ffffff");
    pg.addColorStop(0.5, "#f0eeeb");
    pg.addColorStop(1, "#ccc8c0");
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(pin.x + wobble, pin.y, PIN_R, 0, Math.PI * 2);
    ctx.fill();

    // Red crown stripe
    ctx.save();
    ctx.beginPath();
    ctx.arc(pin.x + wobble, pin.y, PIN_R, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#dc2626";
    ctx.fillRect(
      pin.x + wobble - PIN_R,
      pin.y - PIN_R * 0.25,
      PIN_R * 2,
      PIN_R * 0.5,
    );
    ctx.restore();

    // Pin highlight
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.beginPath();
    ctx.arc(pin.x + wobble - 3, pin.y - 4, PIN_R * 0.32, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── Ball ─────────────────────────────────────────────────────────────────
  const ball = state.ball ?? { x: LANE_CX, y: START_Y, vx: 0, vy: 0 };

  // Ball drop shadow
  ctx.save();
  ctx.globalAlpha = 0.3;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(
    ball.x + 3,
    ball.y + 5,
    BALL_R * 0.95,
    BALL_R * 0.45,
    0,
    0,
    Math.PI * 2,
  );
  ctx.fill();
  ctx.restore();

  // Ball body (indigo/violet radial gradient)
  const bg2 = ctx.createRadialGradient(
    ball.x - 6,
    ball.y - 7,
    2,
    ball.x,
    ball.y,
    BALL_R,
  );
  bg2.addColorStop(0, "#c4b5fd");
  bg2.addColorStop(0.35, "#7c3aed");
  bg2.addColorStop(0.72, "#4c1d95");
  bg2.addColorStop(1, "#1e1040");
  ctx.fillStyle = bg2;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();

  // Shine highlight
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.beginPath();
  ctx.arc(ball.x - 5, ball.y - 6, BALL_R * 0.33, 0, Math.PI * 2);
  ctx.fill();

  // Finger holes
  ctx.fillStyle = "rgba(10,5,30,0.6)";
  [
    [ball.x + 3, ball.y - 2, 2.4],
    [ball.x - 2, ball.y + 5, 2.4],
    [ball.x + 7, ball.y + 4, 2.4],
  ].forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Power meter bar (bottom-right HUD)
  const barX = LANE_R + 10,
    barY = CANVAS_H - 140,
    barH = 120,
    barW = 10;
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 4);
  ctx.fill();
  const powerH = barH * state.power;
  const powerGrad = ctx.createLinearGradient(
    0,
    barY + barH - powerH,
    0,
    barY + barH,
  );
  powerGrad.addColorStop(0, "#f59e0b");
  powerGrad.addColorStop(1, "#ef4444");
  ctx.fillStyle = powerGrad;
  ctx.beginPath();
  ctx.roundRect(barX, barY + barH - powerH, barW, powerH, 4);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = "8px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("PWR", barX + barW / 2, barY - 5);
  ctx.fillText(
    `${Math.round(state.power * 100)}%`,
    barX + barW / 2,
    barY + barH + 12,
  );

  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────

export function BowlingGame() {
  "use no memo"; // opt out of React Compiler — imperative game loop using refs
  const initial = createState();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<BowlingState>(initial);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const settleAtRef = useRef(0);
  const [scale, setScale] = useState(1);
  const [ui, setUi] = useState<BowlingUi>({
    frame: 1,
    roll: 1,
    aim: initial.aim,
    power: initial.power,
    status: "Aim · Power · Roll",
    gameOver: false,
    frames: initial.frames.map((f) => ({ rolls: [...f.rolls] })),
    totals: frameTotals(initial.frames),
  });

  const syncUi = useCallback((status?: string) => {
    const s = stateRef.current;
    setUi({
      frame: Math.min(s.frameIndex + 1, MAX_FRAMES),
      roll: s.rollIndex + 1,
      aim: s.aim,
      power: s.power,
      status: status ?? "",
      gameOver: s.phase === "over",
      frames: s.frames.map((f) => ({ rolls: [...f.rolls] })),
      totals: frameTotals(s.frames),
    });
  }, []);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(CANVAS_W * dpr);
    canvas.height = Math.floor(CANVAS_H * dpr);
    drawBowling(canvas, stateRef.current);
  }, []);

  const resetRack = useCallback(() => {
    const s = stateRef.current;
    s.pins = makePins();
    s.pendingKnock = new Set();
    s.ball = null;
    s.phase = "ready";
  }, []);

  const finishRoll = useCallback(() => {
    const s = stateRef.current;
    const standing = s.pins.filter((p) => p.standing).length;
    const knockedTotal = 10 - standing;
    const frame = s.frames[s.frameIndex];
    const previous = frame.rolls.reduce((sum, r) => sum + r, 0);
    const knocked = Math.max(0, knockedTotal - previous);
    frame.rolls.push(knocked);

    const strike = s.rollIndex === 0 && knocked === 10;
    const spare = s.rollIndex > 0 && previous + knocked === 10;
    let status = strike
      ? "🎳 Strike!"
      : spare
        ? "Spare!"
        : `${knocked} pin${knocked === 1 ? "" : "s"} down.`;

    if (s.frameIndex === 9) {
      if (s.rollIndex === 0) {
        s.rollIndex = 1;
        if (strike) resetRack();
        else {
          s.phase = "ready";
          s.ball = null;
        }
      } else if (s.rollIndex === 1) {
        const first = frame.rolls[0] ?? 0;
        if (first === 10 || first + knocked === 10) {
          s.rollIndex = 2;
          resetRack();
        } else {
          s.phase = "over";
          s.ball = null;
          status = `Game over · Final score: ${frameTotals(s.frames)[9]}`;
        }
      } else {
        s.phase = "over";
        s.ball = null;
        status = `Game over · Final score: ${frameTotals(s.frames)[9]}`;
      }
    } else if (strike || s.rollIndex === 1) {
      s.frameIndex++;
      s.rollIndex = 0;
      resetRack();
    } else {
      s.rollIndex = 1;
      s.phase = "ready";
      s.ball = null;
    }

    s.pendingKnock = new Set();
    syncUi(status);
    drawFrame();
  }, [drawFrame, resetRack, syncUi]);

  const releaseBall = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== "ready" || s.ball) return;
    const targetX = laneXFromAim(s.aim);
    const dx = targetX - LANE_CX;
    const dy = TARGET_Y - START_Y;
    const len = Math.hypot(dx, dy) || 1;
    const speed = 5.5 + s.power * 3.5;
    s.ball = {
      x: LANE_CX,
      y: START_Y,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
    };
    s.phase = "rolling";
    syncUi("Rolling…");
  }, [syncUi]);

  const resetGame = useCallback(() => {
    stateRef.current = createState();
    syncUi("Aim · Power · Roll");
    drawFrame();
  }, [drawFrame, syncUi]);

  // Responsive canvas scaling
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      const s = Math.min(1, w / CANVAS_W, h / CANVAS_H);
      setScale(s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    drawFrame();
  }, [drawFrame, scale]);

  // Game loop
  useEffect(() => {
    const tick = (time: number) => {
      const s = stateRef.current;
      const delta = lastTimeRef.current
        ? Math.min(24, time - lastTimeRef.current)
        : 16;
      lastTimeRef.current = time;

      if (s.phase === "rolling" && s.ball) {
        s.ball.x += s.ball.vx * (delta / 16);
        s.ball.y += s.ball.vy * (delta / 16);
        s.ball.vx *= 0.993;

        if (s.ball.x < LANE_L + BALL_R) {
          s.ball.x = LANE_L + BALL_R;
          s.ball.vx = Math.abs(s.ball.vx) * 0.25;
        }
        if (s.ball.x > LANE_R - BALL_R) {
          s.ball.x = LANE_R - BALL_R;
          s.ball.vx = -Math.abs(s.ball.vx) * 0.25;
        }

        const impact = Math.max(12, 20 * s.power);
        s.pendingKnock = new Set();
        s.pins.forEach((pin, i) => {
          if (!pin.standing) return;
          const ddx = Math.abs(s.ball!.x - pin.x);
          const ddy = Math.abs(s.ball!.y - pin.y);
          if (ddy < impact && ddx < PIN_R + BALL_R + (1 - s.power) * 6)
            s.pendingKnock.add(i);
        });

        if (s.ball.y <= TARGET_Y) {
          s.pendingKnock.forEach((i) => {
            s.pins[i].standing = false;
          });
          s.phase = "settling";
          settleAtRef.current = time + 250;
        }
      } else if (s.phase === "settling" && time >= settleAtRef.current) {
        finishRoll();
      }

      drawFrame();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [finishRoll, drawFrame]);

  // Keyboard controls
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (e.code === "ArrowLeft") {
        s.aim = Math.max(-1, s.aim - 0.07);
        drawFrame();
        e.preventDefault();
      }
      if (e.code === "ArrowRight") {
        s.aim = Math.min(1, s.aim + 0.07);
        drawFrame();
        e.preventDefault();
      }
      if (e.code === "ArrowUp") {
        s.power = Math.min(1, s.power + 0.05);
        syncUi();
        e.preventDefault();
      }
      if (e.code === "ArrowDown") {
        s.power = Math.max(0.2, s.power - 0.05);
        syncUi();
        e.preventDefault();
      }
      if (e.code === "Space" || e.code === "Enter") {
        releaseBall();
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawFrame, releaseBall, syncUi]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "linear-gradient(160deg, #06101e 0%, #0b1728 100%)",
        color: "#e2e8f0",
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* ── Scorecard ── */}
      <div
        style={{
          display: "flex",
          gap: 2,
          padding: "8px 10px 6px",
          background: "rgba(0,0,0,0.35)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          overflowX: "auto",
          flexShrink: 0,
        }}
      >
        {ui.frames.map((frame, fi) => {
          const active = fi === ui.frame - 1 && !ui.gameOver;
          return (
            <div
              key={fi}
              style={{
                flex: fi === 9 ? "1.4 0 auto" : "1 0 auto",
                minWidth: fi === 9 ? 52 : 38,
                border: `1px solid ${active ? "#6366f1" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 4,
                background: active
                  ? "rgba(99,102,241,0.15)"
                  : "rgba(255,255,255,0.04)",
                textAlign: "center",
                fontSize: 10,
              }}
            >
              <div
                style={{
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  padding: "2px 0",
                  color: "rgba(255,255,255,0.4)",
                }}
              >
                {fi + 1}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 3,
                  padding: "3px 2px",
                }}
              >
                {[0, 1, ...(fi === 9 ? [2] : [])].map((slot) => (
                  <span
                    key={slot}
                    style={{
                      width: 16,
                      height: 16,
                      lineHeight: "16px",
                      borderRadius: 3,
                      background:
                        rollLabel(frame, fi, slot) === "X"
                          ? "rgba(239,68,68,0.25)"
                          : rollLabel(frame, fi, slot) === "/"
                            ? "rgba(251,191,36,0.25)"
                            : "rgba(255,255,255,0.06)",
                      color:
                        rollLabel(frame, fi, slot) === "X"
                          ? "#f87171"
                          : rollLabel(frame, fi, slot) === "/"
                            ? "#fbbf24"
                            : "rgba(255,255,255,0.8)",
                      fontWeight: "bold",
                    }}
                  >
                    {rollLabel(frame, fi, slot)}
                  </span>
                ))}
              </div>
              <div
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  padding: "2px 0",
                  fontSize: 11,
                  color: active ? "#a5b4fc" : "rgba(255,255,255,0.7)",
                  fontWeight: "bold",
                  minHeight: 18,
                }}
              >
                {ui.totals[fi] >= 0 ? ui.totals[fi] : ""}
              </div>
            </div>
          );
        })}
        {/* Total */}
        <div
          style={{
            minWidth: 44,
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 4,
            background: "rgba(255,255,255,0.04)",
            textAlign: "center",
            fontSize: 10,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 9 }}>
            TOTAL
          </div>
          <div style={{ color: "#e2e8f0", fontWeight: "bold", fontSize: 13 }}>
            {ui.totals.filter((t) => t >= 0).slice(-1)[0] ?? 0}
          </div>
        </div>
      </div>

      {/* ── Canvas area ── */}
      <div
        ref={hostRef}
        style={{
          flex: 1,
          minHeight: 0,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <canvas
          ref={canvasRef}
          tabIndex={0}
          style={{
            display: "block",
            width: CANVAS_W * scale,
            height: CANVAS_H * scale,
            cursor: "crosshair",
            borderRadius: 6,
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }}
          onPointerMove={(e) => {
            const s = stateRef.current;
            if (s.phase !== "ready") return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
            s.aim = Math.max(-1, Math.min(1, (x - LANE_CX) / 68));
            drawFrame();
          }}
          onClick={() => releaseBall()}
        />
      </div>

      {/* ── Controls bar ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "7px 12px",
          background: "rgba(0,0,0,0.4)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        {ui.gameOver ? (
          <>
            <span
              style={{ color: "#fbbf24", fontWeight: "bold", fontSize: 13 }}
            >
              {ui.status}
            </span>
            <button onClick={resetGame} style={btnStyle("#6366f1")}>
              Play Again
            </button>
          </>
        ) : (
          <>
            <button
              onClick={releaseBall}
              disabled={ui.gameOver}
              style={btnStyle("#6366f1")}
            >
              Roll
            </button>
            <button
              onClick={resetGame}
              style={btnStyle("rgba(255,255,255,0.12)")}
            >
              Reset
            </button>

            {/* Aim slider */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Aim
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={Math.round(ui.aim * 100)}
                onChange={(e) => {
                  stateRef.current.aim = Number(e.target.value) / 100;
                  syncUi();
                  drawFrame();
                }}
                style={{ width: 80, accentColor: "#22d3ee" }}
              />
            </label>

            {/* Power slider */}
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                color: "rgba(255,255,255,0.6)",
              }}
            >
              Power
              <input
                type="range"
                min={20}
                max={100}
                step={1}
                value={Math.round(ui.power * 100)}
                onChange={(e) => {
                  stateRef.current.power = Number(e.target.value) / 100;
                  syncUi();
                  drawFrame();
                }}
                style={{ width: 80, accentColor: "#f59e0b" }}
              />
              <span style={{ fontSize: 11, color: "#fbbf24", minWidth: 30 }}>
                {Math.round(ui.power * 100)}%
              </span>
            </label>

            <span
              style={{
                marginLeft: "auto",
                fontSize: 12,
                color: "rgba(255,255,255,0.35)",
              }}
            >
              Frame <strong style={{ color: "#a5b4fc" }}>{ui.frame}</strong>
              &nbsp;·&nbsp;Roll{" "}
              <strong style={{ color: "#a5b4fc" }}>{ui.roll}</strong>
              {ui.status ? (
                <>
                  &nbsp;· <span style={{ color: "#94a3b8" }}>{ui.status}</span>
                </>
              ) : null}
            </span>

            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)" }}>
              ← → aim &nbsp; ↑ ↓ power &nbsp; Space/click roll
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    padding: "5px 14px",
    borderRadius: 6,
    border: "none",
    background: bg,
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: "bold",
  };
}
