import { useCallback, useEffect, useRef, useState } from "react";

// ─── Constants ────────────────────────────────────────────────────────────────
const CW = 620;
const CH = 360;
const RAIL = 22; // px
const POCKET_R_PX = 16; // px
const FRICTION = 0.9865;
const STOP_SPEED = 0.00015; // normalized per frame
const SPEED_SCALE = 0.065;
const BALL_R = 0.032; // normalized, relative to min(CW, CH)
const CUE_X = 0.28;
const CUE_Y = 0.5;

// Rail inner bounds in normalized coords
const INNER_LEFT = RAIL / CW;
const INNER_RIGHT = (CW - RAIL) / CW;
const INNER_TOP = RAIL / CH;
const INNER_BOTTOM = (CH - RAIL) / CH;

// Pockets [nx, ny] normalized
const POCKETS: [number, number][] = [
  [RAIL / CW, RAIL / CH], // top-left
  [0.5, RAIL / CH], // top-mid
  [(CW - RAIL) / CW, RAIL / CH], // top-right
  [RAIL / CW, (CH - RAIL) / CH], // bottom-left
  [0.5, (CH - RAIL) / CH], // bottom-mid
  [(CW - RAIL) / CW, (CH - RAIL) / CH], // bottom-right
];

// Ball color definitions
const SOLID_COLORS: Record<number, string> = {
  1: "#e8c832", // yellow
  2: "#2563eb", // blue
  3: "#dc2626", // red
  4: "#7c3aed", // purple
  5: "#ea6c1a", // orange
  6: "#16a34a", // green
  7: "#7f1d1d", // maroon
  8: "#111111", // black
};

// ─── Types ────────────────────────────────────────────────────────────────────
interface Ball {
  id: number;
  x: number; // normalized 0–1
  y: number;
  vx: number;
  vy: number;
  color: string;
  num: number; // 0 = cue, 1-15
  striped: boolean;
  alive: boolean;
}

interface DragState {
  startX: number;
  startY: number;
  curX: number;
  curY: number;
}

interface GameState {
  balls: Ball[];
  drag: DragState | null;
  aiming: boolean;
  shooting: boolean; // balls are moving
  solids: number; // pocketed
  stripes: number;
  turn: 1 | 2;
  p1Type: "solids" | "stripes" | null;
  winner: 1 | 2 | null;
  status: string;
}

// ─── Ball radius in pixels ────────────────────────────────────────────────────
const BR = BALL_R * Math.min(CW, CH);

// ─── Build the rack ───────────────────────────────────────────────────────────
// Triangle rack at ~65% x, centered y
// Rows: row0=1 ball, row1=2, row2=3, row3=4, row4=5
// 8-ball goes at row 2 center (index 4 counting from apex)
// Arrangement: 8 at row2 middle position
function buildRack(): Ball[] {
  const balls: Ball[] = [];

  // Cue ball
  balls.push({
    id: 0,
    x: CUE_X,
    y: CUE_Y,
    vx: 0,
    vy: 0,
    color: "#f8fafc",
    num: 0,
    striped: false,
    alive: true,
  });

  // Rack position center
  const rx = 0.67;
  const ry = 0.5;
  // spacing
  const dx = (BR * 1.98) / CW;
  const dy = (BR * 1.98) / CH;

  // Row layouts [row, col] for each position
  // apex is top-right of the rack (row 0)
  // Each row is offset left by half dx per ball
  // positions accumulate left to right, row by row
  const rowLayout: [number, number][] = [
    [0, 0], // pos 0: row 0
    [1, -0.5], // pos 1: row 1 left
    [1, 0.5], // pos 2: row 1 right
    [2, -1], // pos 3: row 2 left
    [2, 0], // pos 4: row 2 CENTER ← 8-ball
    [2, 1], // pos 5: row 2 right
    [3, -1.5], // pos 6
    [3, -0.5], // pos 7
    [3, 0.5], // pos 8
    [3, 1.5], // pos 9
    [4, -2], // pos 10
    [4, -1], // pos 11
    [4, 0], // pos 12
    [4, 1], // pos 13
    [4, 2], // pos 14
  ];

  // Ball number assignment:
  // pos 4 = ball 8; remaining 14 positions = balls 1-7 (solids) and 9-15 (stripes)
  // Randomize the arrangement except 8-ball
  const otherNums = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15];
  // Shuffle
  for (let i = otherNums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [otherNums[i], otherNums[j]] = [otherNums[j], otherNums[i]];
  }

  let otherIdx = 0;
  for (let pos = 0; pos < 15; pos++) {
    const [row, col] = rowLayout[pos];
    const bx = rx - row * dx;
    const by = ry + col * dy;

    let num: number;
    if (pos === 4) {
      num = 8;
    } else {
      num = otherNums[otherIdx++];
    }

    const striped = num >= 9;
    const colorNum = striped ? num - 8 : num;
    const color = SOLID_COLORS[colorNum] ?? "#888";

    balls.push({
      id: num,
      x: bx,
      y: by,
      vx: 0,
      vy: 0,
      color,
      num,
      striped,
      alive: true,
    });
  }

  return balls;
}

// ─── Drawing helpers ──────────────────────────────────────────────────────────
function drawTable(ctx: CanvasRenderingContext2D) {
  // Wood rail border
  const railColor = "#4a2c0a";
  const railHighlight = "#6b3d10";
  ctx.fillStyle = railColor;
  ctx.beginPath();
  ctx.roundRect(0, 0, CW, CH, 10);
  ctx.fill();

  // Cushion highlight line
  ctx.strokeStyle = railHighlight;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(3, 3, CW - 6, CH - 6, 8);
  ctx.stroke();

  // Felt surface
  const feltGrad = ctx.createRadialGradient(
    CW / 2,
    CH / 2,
    10,
    CW / 2,
    CH / 2,
    CW * 0.7,
  );
  feltGrad.addColorStop(0, "#1a5c38");
  feltGrad.addColorStop(0.55, "#155234");
  feltGrad.addColorStop(1, "#0e3d27");
  ctx.fillStyle = feltGrad;
  ctx.beginPath();
  ctx.roundRect(RAIL, RAIL, CW - RAIL * 2, CH - RAIL * 2, 4);
  ctx.fill();

  // Felt subtle texture lines
  ctx.strokeStyle = "rgba(255,255,255,0.018)";
  ctx.lineWidth = 1;
  for (let y = RAIL; y < CH - RAIL; y += 18) {
    ctx.beginPath();
    ctx.moveTo(RAIL, y);
    ctx.lineTo(CW - RAIL, y);
    ctx.stroke();
  }

  // Table markings: head string line (x=CUE_X) and spots
  const headX = CUE_X * CW;
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 8]);
  ctx.beginPath();
  ctx.moveTo(headX, RAIL + 6);
  ctx.lineTo(headX, CH - RAIL - 6);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center dot
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.beginPath();
  ctx.arc(CW * 0.5, CH * 0.5, 3, 0, Math.PI * 2);
  ctx.fill();
  // Rack spot
  ctx.beginPath();
  ctx.arc(CW * 0.67, CH * 0.5, 3, 0, Math.PI * 2);
  ctx.fill();
  // Head spot
  ctx.beginPath();
  ctx.arc(headX, CH * 0.5, 3, 0, Math.PI * 2);
  ctx.fill();

  // Pockets
  for (const [px, py] of POCKETS) {
    const x = px * CW;
    const y = py * CH;
    // Pocket shadow
    const pGrad = ctx.createRadialGradient(x, y, 0, x, y, POCKET_R_PX + 4);
    pGrad.addColorStop(0, "#000000");
    pGrad.addColorStop(0.6, "#0a0a0a");
    pGrad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pGrad;
    ctx.beginPath();
    ctx.arc(x, y, POCKET_R_PX + 4, 0, Math.PI * 2);
    ctx.fill();
    // Pocket opening
    ctx.fillStyle = "#050505";
    ctx.beginPath();
    ctx.arc(x, y, POCKET_R_PX, 0, Math.PI * 2);
    ctx.fill();
    // Pocket rim highlight
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, POCKET_R_PX, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Inner rail cushion outline
  ctx.strokeStyle = "#3d2007";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(RAIL, RAIL, CW - RAIL * 2, CH - RAIL * 2, 4);
  ctx.stroke();
}

function drawBall(ctx: CanvasRenderingContext2D, b: Ball) {
  const x = b.x * CW;
  const y = b.y * CH;

  // Shadow
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  if (b.num === 0) {
    // Cue ball
    const cGrad = ctx.createRadialGradient(
      x - BR * 0.3,
      y - BR * 0.3,
      BR * 0.05,
      x,
      y,
      BR,
    );
    cGrad.addColorStop(0, "#ffffff");
    cGrad.addColorStop(0.7, "#f0f4f8");
    cGrad.addColorStop(1, "#d0d8e0");
    ctx.fillStyle = cGrad;
    ctx.beginPath();
    ctx.arc(x, y, BR, 0, Math.PI * 2);
    ctx.fill();
  } else if (!b.striped) {
    // Solid ball
    const bGrad = ctx.createRadialGradient(
      x - BR * 0.35,
      y - BR * 0.35,
      BR * 0.05,
      x,
      y,
      BR * 1.05,
    );
    bGrad.addColorStop(0, lighten(b.color, 0.4));
    bGrad.addColorStop(0.5, b.color);
    bGrad.addColorStop(1, darken(b.color, 0.35));
    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.arc(x, y, BR, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Striped ball: white base
    const wGrad = ctx.createRadialGradient(
      x - BR * 0.3,
      y - BR * 0.3,
      BR * 0.05,
      x,
      y,
      BR,
    );
    wGrad.addColorStop(0, "#ffffff");
    wGrad.addColorStop(0.8, "#f0f0f0");
    wGrad.addColorStop(1, "#dcdcdc");
    ctx.fillStyle = wGrad;
    ctx.beginPath();
    ctx.arc(x, y, BR, 0, Math.PI * 2);
    ctx.fill();

    // Color band across middle third
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, BR, 0, Math.PI * 2);
    ctx.clip();
    const bandH = BR * 0.65;
    const sGrad = ctx.createLinearGradient(
      x - BR,
      y - bandH,
      x - BR,
      y + bandH,
    );
    sGrad.addColorStop(0, darken(b.color, 0.2));
    sGrad.addColorStop(0.3, b.color);
    sGrad.addColorStop(0.7, b.color);
    sGrad.addColorStop(1, darken(b.color, 0.2));
    ctx.fillStyle = sGrad;
    ctx.fillRect(x - BR, y - bandH, BR * 2, bandH * 2);
    ctx.restore();
  }

  ctx.restore(); // remove shadow for number

  // Number label
  if (b.num !== 0) {
    // White circle behind number
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(x, y, BR * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#111";
    ctx.font = `bold ${Math.max(8, Math.round(BR * 0.72))}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(b.num), x, y + 0.5);
  }

  // Specular highlight
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.beginPath();
  ctx.arc(x - BR * 0.28, y - BR * 0.28, BR * 0.22, 0, Math.PI * 2);
  ctx.fill();
}

function drawCueStick(
  ctx: CanvasRenderingContext2D,
  cueX: number,
  cueY: number,
  mouseX: number,
  mouseY: number,
  power: number,
) {
  const dx = cueX - mouseX;
  const dy = cueY - mouseY;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const ux = dx / dist;
  const uy = dy / dist;

  // Stick goes from near cue ball tip to further away (away from mouse = direction of shot)
  // But visually stick points FROM mouse toward cue ball
  // The gap between tip and cue ball increases with power
  const gap = 6 + power * 28;
  const tipX = cueX - ux * (BR + gap);
  const tipY = cueY - uy * (BR + gap);
  const stickLen = 180;
  const buttX = tipX - ux * stickLen;
  const buttY = tipY - uy * stickLen;

  // Draw tapered stick using a trapezoid path
  const perpX = -uy;
  const perpY = ux;

  const tipW = 1.5;
  const buttW = 4.5;

  ctx.save();
  const stickGrad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
  stickGrad.addColorStop(0, "#e8d5a3"); // light wood at tip
  stickGrad.addColorStop(0.3, "#c8a96e");
  stickGrad.addColorStop(0.7, "#8b5e2a");
  stickGrad.addColorStop(1, "#4a2c0a"); // dark at butt

  ctx.fillStyle = stickGrad;
  ctx.beginPath();
  ctx.moveTo(tipX + perpX * tipW, tipY + perpY * tipW);
  ctx.lineTo(tipX - perpX * tipW, tipY - perpY * tipW);
  ctx.lineTo(buttX - perpX * buttW, buttY - perpY * buttW);
  ctx.lineTo(buttX + perpX * buttW, buttY + perpY * buttW);
  ctx.closePath();
  ctx.fill();

  // Highlight on stick
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tipX + perpX * tipW * 0.4, tipY + perpY * tipW * 0.4);
  ctx.lineTo(buttX + perpX * buttW * 0.4, buttY + perpY * buttW * 0.4);
  ctx.stroke();

  // Wrap rings near butt
  for (let i = 0; i < 3; i++) {
    const t = 0.72 + i * 0.06;
    const rx = tipX * (1 - t) + buttX * t;
    const ry = tipY * (1 - t) + buttY * t;
    const rw = tipW + (buttW - tipW) * t;
    ctx.strokeStyle = i === 1 ? "rgba(120,60,10,0.9)" : "rgba(60,20,5,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx + perpX * rw, ry + perpY * rw);
    ctx.lineTo(rx - perpX * rw, ry - perpY * rw);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAimLine(
  ctx: CanvasRenderingContext2D,
  cueX: number,
  cueY: number,
  mouseX: number,
  mouseY: number,
  balls: Ball[],
) {
  const dx = cueX - mouseX;
  const dy = cueY - mouseY;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return;
  const ux = dx / dist;
  const uy = dy / dist;

  // Find first ball hit
  let hitT = Infinity;
  let hitBall: Ball | null = null;
  for (const b of balls) {
    if (!b.alive || b.num === 0) continue;
    // Ray-circle intersection
    const bx = b.x * CW - cueX;
    const by = b.y * CH - cueY;
    const a = 1;
    const bDot = -(ux * bx + uy * by);
    const c = bx * bx + by * by - BR * 2 * (BR * 2);
    const disc = bDot * bDot - a * c;
    if (disc < 0) continue;
    const t = bDot - Math.sqrt(disc);
    if (t > 0 && t < hitT) {
      hitT = t;
      hitBall = b;
    }
  }

  // Aim line from cue to contact (or far)
  const maxLen = Math.hypot(CW, CH);
  const lineLen = hitBall ? hitT : maxLen;

  ctx.save();
  ctx.setLineDash([6, 8]);
  ctx.strokeStyle = "rgba(100,220,255,0.55)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cueX, cueY);
  ctx.lineTo(cueX + ux * lineLen, cueY + uy * lineLen);
  ctx.stroke();
  ctx.setLineDash([]);

  // Ghost ball at contact point
  if (hitBall) {
    const ghostX = cueX + ux * hitT;
    const ghostY = cueY + uy * hitT;
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#f8fafc";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ghostX, ghostY, BR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Deflection line from ghost ball (reflection off hit ball)
    const hbx = hitBall.x * CW;
    const hby = hitBall.y * CH;
    const nx2 = (ghostX - hbx) / Math.hypot(ghostX - hbx, ghostY - hby);
    const ny2 = (ghostY - hby) / Math.hypot(ghostX - hbx, ghostY - hby);
    ctx.setLineDash([4, 7]);
    ctx.strokeStyle = "rgba(100,220,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ghostX, ghostY);
    ctx.lineTo(ghostX + nx2 * 60, ghostY + ny2 * 60);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawPowerMeter(ctx: CanvasRenderingContext2D, power: number) {
  const bw = 14;
  const bh = CH - RAIL * 2 - 20;
  const bx = CW - RAIL + 4;
  const by = RAIL + 10;

  // Background
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.fill();

  // Power fill
  const fillH = bh * power;
  const powerGrad = ctx.createLinearGradient(bx, by + bh - fillH, bx, by + bh);
  powerGrad.addColorStop(0, "#ef4444");
  powerGrad.addColorStop(0.4, "#f59e0b");
  powerGrad.addColorStop(1, "#22c55e");
  ctx.fillStyle = powerGrad;
  ctx.beginPath();
  ctx.roundRect(bx, by + bh - fillH, bw, fillH, 3);
  ctx.fill();

  // Border
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 4);
  ctx.stroke();

  // Label
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.font = "bold 9px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("PWR", bx + bw / 2, by - 12);
}

// ─── Color helpers ────────────────────────────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.min(255, r + 255 * amount)},${Math.min(255, g + 255 * amount)},${Math.min(255, b + 255 * amount)})`;
}
function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.max(0, r - 255 * amount)},${Math.max(0, g - 255 * amount)},${Math.max(0, b - 255 * amount)})`;
}

// ─── Physics ──────────────────────────────────────────────────────────────────
function stepPhysics(balls: Ball[]): { pocketed: Ball[] } {
  const pocketed: Ball[] = [];
  for (const b of balls) {
    if (!b.alive) continue;
    const spd = Math.hypot(b.vx, b.vy);
    if (spd < STOP_SPEED) {
      b.vx = 0;
      b.vy = 0;
      continue;
    }
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= FRICTION;
    b.vy *= FRICTION;

    // Rail bounce (using pixel-accurate radius)
    const minX = INNER_LEFT + BR / CW;
    const maxX = INNER_RIGHT - BR / CW;
    const minY = INNER_TOP + BR / CH;
    const maxY = INNER_BOTTOM - BR / CH;

    if (b.x < minX) {
      b.x = minX;
      b.vx = Math.abs(b.vx) * 0.88;
    }
    if (b.x > maxX) {
      b.x = maxX;
      b.vx = -Math.abs(b.vx) * 0.88;
    }
    if (b.y < minY) {
      b.y = minY;
      b.vy = Math.abs(b.vy) * 0.88;
    }
    if (b.y > maxY) {
      b.y = maxY;
      b.vy = -Math.abs(b.vy) * 0.88;
    }
  }

  // Ball-ball elastic collisions
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (!b.alive) continue;

      const dxPx = (b.x - a.x) * CW;
      const dyPx = (b.y - a.y) * CH;
      const distPx = Math.hypot(dxPx, dyPx);
      const minDist = BR * 2;
      if (distPx <= 0 || distPx >= minDist) continue;

      const nx = dxPx / distPx;
      const ny = dyPx / distPx;
      const overlap = minDist - distPx;

      // Separate
      a.x -= (nx * overlap * 0.5) / CW;
      a.y -= (ny * overlap * 0.5) / CH;
      b.x += (nx * overlap * 0.5) / CW;
      b.y += (ny * overlap * 0.5) / CH;

      // Impulse (equal mass elastic)
      const avx = a.vx * CW,
        avy = a.vy * CH;
      const bvx = b.vx * CW,
        bvy = b.vy * CH;
      const rel = (avx - bvx) * nx + (avy - bvy) * ny;
      if (rel <= 0) continue; // moving apart or already separating

      a.vx = (avx - rel * nx) / CW;
      a.vy = (avy - rel * ny) / CH;
      b.vx = (bvx + rel * nx) / CW;
      b.vy = (bvy + rel * ny) / CH;
    }
  }

  // Pocket check
  for (const b of balls) {
    if (!b.alive) continue;
    for (const [px, py] of POCKETS) {
      const dx = (b.x - px) * CW;
      const dy = (b.y - py) * CH;
      if (Math.hypot(dx, dy) < POCKET_R_PX + BR * 0.3) {
        b.alive = false;
        b.vx = 0;
        b.vy = 0;
        pocketed.push(b);
        break;
      }
    }
  }

  return { pocketed };
}

function allStopped(balls: Ball[]): boolean {
  return balls.every((b) => !b.alive || (b.vx === 0 && b.vy === 0));
}

// ─── Component ────────────────────────────────────────────────────────────────
export function PoolGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    balls: buildRack(),
    drag: null,
    aiming: false,
    shooting: false,
    solids: 0,
    stripes: 0,
    turn: 1,
    p1Type: null,
    winner: null,
    status: "Drag from cue ball to aim and shoot",
  });
  const rafRef = useRef<number>(0);
  const [ui, setUi] = useState({
    solids: 0,
    stripes: 0,
    turn: 1 as 1 | 2,
    p1Type: null as "solids" | "stripes" | null,
    winner: null as 1 | 2 | null,
    status: "Drag from cue ball to aim and shoot",
  });

  // ── calcPower (defined here so renderFrame can reference it) ──
  const calcPower = (
    cxPx: number,
    cyPx: number,
    mxPx: number,
    myPx: number,
  ): number => {
    const pull = Math.hypot(cxPx - mxPx, cyPx - myPx);
    return Math.min(1, pull / (Math.min(CW, CH) * 0.35));
  };

  // ── Render ──
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, CW, CH);

    const s = stateRef.current;

    drawTable(ctx);

    // Aim line + cue stick (only when aiming and balls stopped)
    const cue = s.balls.find((b) => b.num === 0 && b.alive);
    if (cue && s.aiming && s.drag) {
      const cueXpx = cue.x * CW;
      const cueYpx = cue.y * CH;
      const mxPx = s.drag.curX;
      const myPx = s.drag.curY;
      const power = calcPower(cue.x * CW, cue.y * CH, mxPx, myPx);

      drawAimLine(ctx, cueXpx, cueYpx, mxPx, myPx, s.balls);
      drawCueStick(ctx, cueXpx, cueYpx, mxPx, myPx, power);
      drawPowerMeter(ctx, power);
    } else if (s.aiming) {
      drawPowerMeter(ctx, 0);
    }

    // Draw balls (back to front: draw non-cue first)
    for (const b of s.balls) {
      if (!b.alive || b.num === 0) continue;
      drawBall(ctx, b);
    }
    if (cue && cue.alive) drawBall(ctx, cue);

    ctx.restore();
  }, []);

  // ── Game loop ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = CW * dpr;
    canvas.height = CH * dpr;

    const tick = () => {
      const s = stateRef.current;

      if (s.shooting && !s.winner) {
        const { pocketed } = stepPhysics(s.balls);

        for (const b of pocketed) {
          if (b.num === 0) {
            // Scratch — respawn cue ball
            const newCue = s.balls.find((x) => x.num === 0);
            if (newCue) {
              newCue.alive = true;
              newCue.x = CUE_X;
              newCue.y = CUE_Y;
              newCue.vx = 0;
              newCue.vy = 0;
            }
            s.status = `Player ${s.turn === 1 ? 2 : 1} scratched — cue ball reset`;
          } else if (b.num === 8) {
            // 8-ball potted — check win/loss
            const eightOk =
              (s.p1Type === "solids" && s.turn === 1 && s.solids === 7) ||
              (s.p1Type === "stripes" && s.turn === 1 && s.stripes === 7) ||
              (s.p1Type === "solids" && s.turn === 2 && s.stripes === 7) ||
              (s.p1Type === "stripes" && s.turn === 2 && s.solids === 7);
            s.winner = eightOk ? s.turn : s.turn === 1 ? 2 : 1;
            s.status = `PLAYER ${s.winner} WINS!`;
          } else {
            const isStripe = b.num >= 9;
            if (isStripe) s.stripes++;
            else s.solids++;

            // Assign types on first pot
            if (!s.p1Type) {
              s.p1Type = isStripe
                ? s.turn === 1
                  ? "stripes"
                  : "solids"
                : s.turn === 1
                  ? "solids"
                  : "stripes";
            }
            s.status = `Player ${s.turn}: Potted ball ${b.num}!`;
          }
        }

        if (allStopped(s.balls) && !s.winner) {
          s.shooting = false;
          if (pocketed.filter((b) => b.num !== 0).length === 0) {
            // No ball potted — switch turn
            s.turn = s.turn === 1 ? 2 : 1;
            s.status = `Player ${s.turn}'s turn`;
          } else {
            s.status = `Player ${s.turn} continues`;
          }
          setUi({
            solids: s.solids,
            stripes: s.stripes,
            turn: s.turn,
            p1Type: s.p1Type,
            winner: s.winner,
            status: s.status,
          });
        } else if (pocketed.length > 0) {
          setUi({
            solids: s.solids,
            stripes: s.stripes,
            turn: s.turn,
            p1Type: s.p1Type,
            winner: s.winner,
            status: s.status,
          });
        }
      }

      renderFrame();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [renderFrame]);

  // ── Input helpers ──
  const getCanvasXY = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      (e.clientX - rect.left) * (CW / rect.width),
      (e.clientY - rect.top) * (CH / rect.height),
    ];
  };

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const s = stateRef.current;
      if (s.shooting || s.winner) return;
      const [mx, my] = getCanvasXY(e);
      const cue = s.balls.find((b) => b.num === 0 && b.alive);
      if (!cue) return;
      const dist = Math.hypot(mx - cue.x * CW, my - cue.y * CH);
      if (dist > BR * 3.5) return;
      s.aiming = true;
      s.drag = { startX: mx, startY: my, curX: mx, curY: my };
      setUi((u) => ({ ...u, status: "Aiming — release to shoot" }));
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const s = stateRef.current;
      if (!s.aiming || !s.drag) return;
      const [mx, my] = getCanvasXY(e);
      s.drag.curX = mx;
      s.drag.curY = my;
    },
    [],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const s = stateRef.current;
      if (!s.aiming || !s.drag || s.winner) return;
      const [mx, my] = getCanvasXY(e);
      const cue = s.balls.find((b) => b.num === 0 && b.alive);
      if (!cue) {
        s.aiming = false;
        s.drag = null;
        return;
      }

      const cxPx = cue.x * CW;
      const cyPx = cue.y * CH;
      const power = calcPower(cxPx, cyPx, mx, my);

      if (power < 0.03) {
        s.aiming = false;
        s.drag = null;
        setUi((u) => ({ ...u, status: "Pull further to aim" }));
        return;
      }

      const dx = cxPx - mx;
      const dy = cyPx - my;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = SPEED_SCALE * (0.25 + 0.75 * power);

      cue.vx = (dx / dist) * speed;
      cue.vy = (dy / dist) * speed;

      s.aiming = false;
      s.drag = null;
      s.shooting = true;
      setUi((u) => ({ ...u, status: "Shot in motion" }));
    },
    [],
  );

  const handleRack = useCallback(() => {
    const s = stateRef.current;
    s.balls = buildRack();
    s.drag = null;
    s.aiming = false;
    s.shooting = false;
    s.solids = 0;
    s.stripes = 0;
    s.turn = 1;
    s.p1Type = null;
    s.winner = null;
    s.status = "New rack — Player 1 breaks";
    setUi({
      solids: 0,
      stripes: 0,
      turn: 1,
      p1Type: null,
      winner: null,
      status: s.status,
    });
  }, []);

  // ── Render UI ──
  const p1Desc = ui.p1Type
    ? ui.p1Type === "solids"
      ? "Solids (1–7)"
      : "Stripes (9–15)"
    : "—";
  const p2Desc = ui.p1Type
    ? ui.p1Type === "solids"
      ? "Stripes (9–15)"
      : "Solids (1–7)"
    : "—";

  return (
    <div
      className="wg-game"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        userSelect: "none",
      }}
    >
      {/* Score panel */}
      <div
        className="wg-pool-info"
        style={{
          display: "flex",
          gap: 24,
          alignItems: "center",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          color: "#e2e8f0",
          background: "rgba(0,0,0,0.38)",
          borderRadius: 8,
          padding: "6px 18px",
          letterSpacing: "0.02em",
        }}
      >
        <span>
          <b style={{ color: "#facc15" }}>P1</b> {p1Desc}
        </span>
        <span style={{ color: "#64748b" }}>|</span>
        <span>
          SOLIDS <b style={{ color: "#4ade80" }}>{ui.solids}</b>
        </span>
        <span style={{ color: "#64748b" }}>·</span>
        <span>
          STRIPES <b style={{ color: "#60a5fa" }}>{ui.stripes}</b>
        </span>
        <span style={{ color: "#64748b" }}>|</span>
        <span>
          <b style={{ color: ui.turn === 1 ? "#facc15" : "#a78bfa" }}>
            TURN: Player {ui.turn}
          </b>
        </span>
        <span style={{ color: "#64748b" }}>|</span>
        <span>
          <b style={{ color: "#f87171" }}>P2</b> {p2Desc}
        </span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="wg-canvas"
        style={{
          width: CW,
          height: CH,
          cursor: "crosshair",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
          display: "block",
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        tabIndex={0}
      />

      {/* Status + controls */}
      <div
        className="wg-toolbar"
        style={{ width: "100%", justifyContent: "center", flexWrap: "wrap" }}
      >
        <div
          className="wg-status"
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            color: ui.winner ? "#4ade80" : "#cbd5e1",
            background: "rgba(0,0,0,0.35)",
            borderRadius: 6,
            padding: "5px 14px",
            fontWeight: ui.winner ? 700 : 400,
            letterSpacing: "0.02em",
            minWidth: 240,
            textAlign: "center",
          }}
        >
          {ui.status}
        </div>
        <button
          className="wg-btn"
          onClick={handleRack}
          style={{
            background: "#4a2c0a",
            color: "#f5deb3",
            border: "1px solid #6b3d10",
            borderRadius: 6,
            padding: "5px 16px",
            cursor: "pointer",
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.04em",
          }}
        >
          Rack
        </button>
        <span className="wg-hint">
          Drag back from the cue ball to set angle and power, then release.
        </span>
      </div>
    </div>
  );
}
