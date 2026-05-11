/**
 * Pac-Man — self-contained canvas game for the summer reader.
 * Classic maze, 4 ghosts, smooth movement, responsive canvas.
 */
import { useCallback, useEffect, useRef, useState } from "react";

// ── Config ─────────────────────────────────────────────────────────────────────
const COLS = 19;
const ROWS = 21;
// Base cell size; actual cell is computed from container width at mount time.
const BASE_CELL = 22;

// Speed in cells/second (frame-rate independent)
const PAC_SPEED_CPS  = 7.0;
const GHOST_SPEED_CPS = 6.0;
const GHOST_FRIGHT_CPS = 3.5;

const FRIGHT_DURATION = 8000; // ms
const READY_DURATION  = 2000;

// 0=dot  1=wall  2=empty  3=power  4=ghost-door
const MAZE_TEMPLATE: number[][] = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,3,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,3,1],
  [1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,0,1],
  [1,0,0,0,0,1,0,1,1,1,1,1,0,1,0,0,0,0,1],
  [1,1,1,1,0,1,0,2,2,2,2,2,0,1,0,1,1,1,1],
  [1,1,1,1,0,0,0,2,1,4,2,1,2,0,0,1,1,1,1],
  [2,2,2,2,0,1,0,2,2,2,2,2,2,0,1,2,2,2,2],
  [1,1,1,1,0,0,0,2,1,1,1,1,2,0,0,1,1,1,1],
  [1,1,1,1,0,1,0,2,2,2,2,2,0,1,0,1,1,1,1],
  [1,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,0,1,1,1,0,1,1,0,1],
  [1,3,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,3,1],
  [1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,1],
  [1,0,1,1,1,1,1,1,0,1,0,1,1,1,1,1,1,0,1],
  [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0,1,1],
  [1,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const PAC_START = { row: 17, col: 9 };
const GHOST_DEFS = [
  { row: 8, col: 8,  color: "#ff0000", scatter: { row: 0,      col: COLS - 1 } },
  { row: 8, col: 9,  color: "#ffb8ff", scatter: { row: 0,      col: 0        } },
  { row: 8, col: 10, color: "#00ffdd", scatter: { row: ROWS-1, col: COLS-1   } },
  { row: 9, col: 9,  color: "#ffb852", scatter: { row: ROWS-1, col: 0        } },
];

// ── Types ──────────────────────────────────────────────────────────────────────
type Dir = 0 | 1 | 2 | 3; // 0=right 1=down 2=left 3=up
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const OPPOSITE = [2, 3, 0, 1];

interface Pos { x: number; y: number; }
interface Ghost {
  pos: Pos; dir: Dir;
  mode: "chase" | "frightened" | "eaten";
  frightTimer: number;
  scatter: { row: number; col: number };
  color: string;
}
interface GameState {
  maze: number[][];
  pac: { pos: Pos; dir: Dir; nextDir: Dir; mouthAngle: number; mouthDir: number };
  ghosts: Ghost[];
  score: number;
  lives: number;
  phase: "ready" | "playing" | "dying" | "won" | "over";
  readyTimer: number;
  dotsLeft: number;
  frame: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function cellOf(pos: Pos, cell: number) {
  return { row: Math.round(pos.y / cell), col: Math.round(pos.x / cell) };
}
function centerOf(row: number, col: number, cell: number): Pos {
  return { x: col * cell, y: row * cell };
}
function isWall(maze: number[][], row: number, col: number, isGhost = false): boolean {
  if (row < 0 || row >= ROWS) return true;
  if (col < 0) return maze[row][COLS - 1] === 1;
  if (col >= COLS) return maze[row][0] === 1;
  const v = maze[row][col];
  if (v === 1) return true;
  if (v === 4) return !isGhost;
  return false;
}
function wrapCol(col: number): number {
  if (col < 0) return COLS - 1;
  if (col >= COLS) return 0;
  return col;
}
function wrapPos(pos: Pos, cell: number): Pos {
  let { x, y } = pos;
  if (x < -cell / 2) x = (COLS - 1) * cell;
  if (x > (COLS - 1) * cell + cell / 2) x = 0;
  return { x, y };
}
function countDots(maze: number[][]): number {
  return maze.flat().filter(v => v === 0 || v === 3).length;
}
function freshMaze() { return MAZE_TEMPLATE.map(r => [...r]); }

function initGhosts(cell: number): Ghost[] {
  return GHOST_DEFS.map(def => ({
    pos: centerOf(def.row, def.col, cell),
    dir: 3 as Dir,
    mode: "chase" as const,
    frightTimer: 0,
    scatter: def.scatter,
    color: def.color,
  }));
}

function initState(cell: number): GameState {
  const maze = freshMaze();
  return {
    maze,
    pac: {
      pos: centerOf(PAC_START.row, PAC_START.col, cell),
      dir: 0, nextDir: 0,
      mouthAngle: 0.25, mouthDir: 1,
    },
    ghosts: initGhosts(cell),
    score: 0, lives: 3,
    phase: "ready",
    readyTimer: READY_DURATION,
    dotsLeft: countDots(maze),
    frame: 0,
  };
}

// ── Ghost AI ───────────────────────────────────────────────────────────────────
function ghostTurn(ghost: Ghost, maze: number[][], pac: Pos, cell: number): Dir {
  const c = cellOf(ghost.pos, cell);
  const cx = centerOf(c.row, c.col, cell);
  if (Math.abs(ghost.pos.x - cx.x) > 2 || Math.abs(ghost.pos.y - cx.y) > 2) return ghost.dir;

  const opposite = OPPOSITE[ghost.dir];
  const possible: Dir[] = ([0, 1, 2, 3] as Dir[]).filter(d => {
    if (d === opposite) return false;
    const nr = c.row + DY[d], nc = wrapCol(c.col + DX[d]);
    return !isWall(maze, nr, nc, true);
  });

  if (possible.length === 0) return opposite as Dir;
  if (ghost.mode === "frightened") return possible[Math.floor(Math.random() * possible.length)];

  const target = ghost.mode === "chase"
    ? pac
    : { x: ghost.scatter.col * cell, y: ghost.scatter.row * cell };

  let best = possible[0], bestDist = Infinity;
  for (const d of possible) {
    const nr = c.row + DY[d], nc = wrapCol(c.col + DX[d]);
    const dist = (nc * cell - target.x) ** 2 + (nr * cell - target.y) ** 2;
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

// ── Step logic (dt-based) ─────────────────────────────────────────────────────
function stepGame(s: GameState, dt: number, cell: number): GameState {
  if (s.phase === "won" || s.phase === "over") return s;

  if (s.phase === "ready") {
    const readyTimer = s.readyTimer - dt;
    if (readyTimer <= 0) return { ...s, readyTimer: 0, phase: "playing" };
    return { ...s, readyTimer };
  }
  if (s.phase === "dying") {
    const readyTimer = s.readyTimer - dt;
    if (readyTimer <= 0) {
      if (s.lives <= 0) return { ...s, phase: "over" };
      return { ...initState(cell), maze: s.maze, score: s.score, lives: s.lives, dotsLeft: s.dotsLeft, phase: "ready" };
    }
    return { ...s, readyTimer };
  }

  const PAC_SPD  = cell * PAC_SPEED_CPS  * (dt / 1000);
  const GHST_SPD = cell * GHOST_SPEED_CPS * (dt / 1000);
  const FGHT_SPD = cell * GHOST_FRIGHT_CPS * (dt / 1000);
  const SNAP_TOL = Math.max(PAC_SPD * 1.5, 2);

  const maze = s.maze.map(r => [...r]);
  let { score, lives, dotsLeft } = s;
  let phase: GameState["phase"] = s.phase;

  // ── Move Pac-Man ─────────────────────────────────────────────────────────────
  const pac = { ...s.pac, pos: { ...s.pac.pos } };
  const pc = cellOf(pac.pos, cell);
  const center = centerOf(pc.row, pc.col, cell);
  const snap = Math.abs(pac.pos.x - center.x) <= SNAP_TOL
            && Math.abs(pac.pos.y - center.y) <= SNAP_TOL;

  if (snap) {
    const nd = pac.nextDir;
    const nr = pc.row + DY[nd], nc = wrapCol(pc.col + DX[nd]);
    if (!isWall(maze, nr, nc)) {
      pac.dir = nd;
      // Snap exactly to center so alignment is clean after turning
      pac.pos = { ...center };
    }
  }
  {
    const d = pac.dir;
    const nr = pc.row + DY[d], nc = wrapCol(pc.col + DX[d]);
    if (!isWall(maze, nr, nc)) {
      pac.pos.x += DX[d] * PAC_SPD;
      pac.pos.y += DY[d] * PAC_SPD;
    } else if (snap) {
      pac.pos = { ...center }; // stop cleanly at cell center
    }
  }
  pac.pos = wrapPos(pac.pos, cell);

  // Mouth animation
  pac.mouthAngle += pac.mouthDir * 0.08;
  if (pac.mouthAngle >= 0.35) pac.mouthDir = -1;
  if (pac.mouthAngle <= 0.02) pac.mouthDir = 1;

  // Eat dot/pellet
  const ec = cellOf(pac.pos, cell);
  const eatV = maze[ec.row]?.[ec.col];
  if (eatV === 0) { maze[ec.row][ec.col] = 2; score += 10; dotsLeft--; }
  const powerEaten = eatV === 3;
  if (powerEaten) { maze[ec.row][ec.col] = 2; score += 50; dotsLeft--; }
  if (dotsLeft <= 0) phase = "won";

  // ── Move Ghosts ──────────────────────────────────────────────────────────────
  const ghosts = s.ghosts.map(ghost => {
    ghost = { ...ghost, pos: { ...ghost.pos } };
    if (powerEaten && ghost.mode !== "eaten") {
      ghost = { ...ghost, mode: "frightened", frightTimer: FRIGHT_DURATION };
    }
    if (ghost.mode === "frightened") {
      ghost.frightTimer -= dt;
      if (ghost.frightTimer <= 0) ghost = { ...ghost, mode: "chase", frightTimer: 0 };
    }
    if (ghost.mode === "eaten") {
      const home = centerOf(8, 9, cell);
      const dx = home.x - ghost.pos.x, dy = home.y - ghost.pos.y;
      if (Math.abs(dx) < 2 && Math.abs(dy) < 2) ghost = { ...ghost, mode: "chase" };
    }
    const spd = ghost.mode === "frightened" ? FGHT_SPD : ghost.mode === "eaten" ? GHST_SPD * 1.5 : GHST_SPD;
    ghost.dir = ghostTurn(ghost, maze, pac.pos, cell);
    const gc = cellOf(ghost.pos, cell);
    const nr = gc.row + DY[ghost.dir], nc = wrapCol(gc.col + DX[ghost.dir]);
    if (!isWall(maze, nr, nc, true)) {
      ghost.pos.x += DX[ghost.dir] * spd;
      ghost.pos.y += DY[ghost.dir] * spd;
      ghost.pos = wrapPos(ghost.pos, cell);
    }
    return ghost;
  });

  // ── Collision ─────────────────────────────────────────────────────────────────
  let dying = false;
  let ghostEaten = 0;
  const updatedGhosts = ghosts.map(ghost => {
    const dist = Math.hypot(pac.pos.x - ghost.pos.x, pac.pos.y - ghost.pos.y);
    if (dist < cell * 0.7) {
      if (ghost.mode === "frightened") {
        score += 200 * (1 << ghostEaten++);
        return { ...ghost, mode: "eaten" as const };
      } else if (ghost.mode !== "eaten") {
        dying = true;
      }
    }
    return ghost;
  });

  if (dying) {
    lives--;
    return { ...s, ghosts: updatedGhosts, lives, score, phase: "dying", readyTimer: 1500 };
  }
  return { ...s, maze, pac, ghosts: updatedGhosts, score, lives, dotsLeft, phase, frame: s.frame + 1 };
}

// ── Renderer ───────────────────────────────────────────────────────────────────
function render(ctx: CanvasRenderingContext2D, s: GameState, cell: number) {
  const W = COLS * cell, H = ROWS * cell;
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, W, H);

  // Maze
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const v = s.maze[r][c];
      const x = c * cell, y = r * cell;
      if (v === 1) {
        ctx.fillStyle = "#1a3a7a";
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeStyle = "#2255cc";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, cell - 1, cell - 1);
      } else if (v === 4) {
        ctx.fillStyle = "#ff88aa";
        ctx.fillRect(x + 4, y + cell / 2 - 2, cell - 8, 4);
      } else if (v === 0) {
        ctx.fillStyle = "#c8a060";
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, Math.max(2, cell * 0.1), 0, Math.PI * 2);
        ctx.fill();
      } else if (v === 3) {
        const t = Date.now() / 400;
        ctx.fillStyle = `hsl(${40 + Math.sin(t) * 20},90%,${60 + Math.sin(t) * 15}%)`;
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, Math.max(3, cell * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Pac-Man
  if (s.phase !== "dying") {
    const { pos, dir, mouthAngle } = s.pac;
    const px = pos.x + cell / 2, py = pos.y + cell / 2;
    const rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir];
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(rot);
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, cell / 2 - 2, mouthAngle * Math.PI, (2 - mouthAngle) * Math.PI);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Ghosts
  for (const ghost of s.ghosts) {
    const gx = ghost.pos.x + cell / 2, gy = ghost.pos.y + cell / 2;
    const r2 = cell / 2 - 2;
    const frightFlash = ghost.mode === "frightened" && ghost.frightTimer < 2000 && Math.floor(Date.now() / 200) % 2 === 0;
    const col = ghost.mode === "frightened"
      ? (frightFlash ? "#ffffff" : "#2244ff")
      : ghost.mode === "eaten" ? "rgba(200,200,200,0.4)"
      : ghost.color;

    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(gx, gy - 2, r2, Math.PI, 0);
    ctx.lineTo(gx + r2, gy + r2);
    for (let i = 3; i >= 0; i--) {
      ctx.arc(gx + r2 - (3 - i) * (r2 * 2 / 3) - r2 / 3, gy + r2, r2 / 3, 0, Math.PI, i % 2 === 0);
    }
    ctx.closePath();
    ctx.fill();

    if (ghost.mode !== "frightened" && ghost.mode !== "eaten") {
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(gx - 4, gy - 4, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx + 4, gy - 4, 3.5, 0, Math.PI * 2); ctx.fill();
      const ex = DX[ghost.dir] * 1.5, ey = DY[ghost.dir] * 1.5;
      ctx.fillStyle = "#00f";
      ctx.beginPath(); ctx.arc(gx - 4 + ex, gy - 4 + ey, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(gx + 4 + ex, gy - 4 + ey, 2, 0, Math.PI * 2); ctx.fill();
    }
  }

  // HUD
  ctx.fillStyle = "#ffd700";
  ctx.font = `bold ${Math.max(11, cell * 0.58)}px monospace`;
  ctx.textAlign = "left";
  ctx.fillText(`SCORE: ${s.score}`, 8, H - 6);
  for (let i = 0; i < s.lives; i++) {
    const r = Math.max(5, cell * 0.3);
    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.moveTo(W - 16 - i * (r * 2 + 4), H - 4);
    ctx.arc(W - 16 - i * (r * 2 + 4), H - 4 - r, r, 0.25 * Math.PI, 1.75 * Math.PI);
    ctx.closePath();
    ctx.fill();
  }

  // Overlays
  if (s.phase === "ready" || s.phase === "dying" || s.phase === "won" || s.phase === "over") {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, H / 2 - 36, W, 62);
    if (s.phase === "ready") {
      ctx.fillStyle = "#ffd700"; ctx.font = `bold ${Math.max(14, cell * 0.75)}px monospace`; ctx.textAlign = "center";
      ctx.fillText("READY!", W / 2, H / 2 + 2);
      ctx.fillStyle = "#ccc"; ctx.font = `${Math.max(10, cell * 0.5)}px monospace`;
      ctx.fillText("arrows / WASD / d-pad", W / 2, H / 2 + 20);
    } else if (s.phase === "dying") {
      ctx.fillStyle = "#ff4444"; ctx.font = `bold ${Math.max(13, cell * 0.68)}px monospace`; ctx.textAlign = "center";
      ctx.fillText("CAUGHT!", W / 2, H / 2 + 5);
    } else if (s.phase === "won") {
      ctx.fillStyle = "#ffd700"; ctx.font = `bold ${Math.max(16, cell * 0.85)}px monospace`; ctx.textAlign = "center";
      ctx.fillText("YOU WIN!", W / 2, H / 2);
      ctx.fillStyle = "#aaa"; ctx.font = `${Math.max(11, cell * 0.55)}px monospace`;
      ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 22);
    } else {
      ctx.fillStyle = "#ff4444"; ctx.font = `bold ${Math.max(16, cell * 0.85)}px monospace`; ctx.textAlign = "center";
      ctx.fillText("GAME OVER", W / 2, H / 2);
      ctx.fillStyle = "#aaa"; ctx.font = `${Math.max(11, cell * 0.55)}px monospace`;
      ctx.fillText(`Score: ${s.score}`, W / 2, H / 2 + 22);
    }
  }
}

// ── On-screen D-pad ────────────────────────────────────────────────────────────
function DPad({ onDir }: { onDir: (d: Dir) => void }) {
  const btn = (label: string, d: Dir, style?: React.CSSProperties) => (
    <button
      className="wg-btn pac-dpad-btn"
      style={style}
      onPointerDown={e => { e.preventDefault(); onDir(d); }}
      aria-label={["Right","Down","Left","Up"][d]}
    >{label}</button>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 38px)", gridTemplateRows: "repeat(3, 38px)", gap: 4, userSelect: "none" }}>
      <span />{btn("▲", 3)}<span />
      {btn("◀", 2)}<span />{btn("▶", 0)}
      <span />{btn("▼", 1)}<span />
    </div>
  );
}

// React import needed for JSX in DPad
import React from "react";

// ── Component ──────────────────────────────────────────────────────────────────
export function PacmanGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const cellRef      = useRef<number>(BASE_CELL);
  const stateRef     = useRef<GameState>(initState(BASE_CELL));
  const rafRef       = useRef<number>(0);
  const lastRef      = useRef<number>(0);
  const [phase, setPhase] = useState<GameState["phase"]>("ready");
  const keysRef = useRef<Set<string>>(new Set());

  const tick = useCallback((now: number) => {
    const dt = Math.min(now - lastRef.current, 50);
    lastRef.current = now;

    const keys = keysRef.current;
    const dirMap: Record<string, Dir> = {
      ArrowRight: 0, KeyD: 0,
      ArrowDown:  1, KeyS: 1,
      ArrowLeft:  2, KeyA: 2,
      ArrowUp:    3, KeyW: 3,
    };
    for (const [k, d] of Object.entries(dirMap)) {
      if (keys.has(k)) stateRef.current.pac.nextDir = d;
    }

    stateRef.current = stepGame(stateRef.current, dt, cellRef.current);
    setPhase(stateRef.current.phase);

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.save();
        ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
        render(ctx, stateRef.current, cellRef.current);
        ctx.restore();
      }
    }

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Compute cell size from container, set up canvas, start loop
  useEffect(() => {
    const container = containerRef.current;
    const canvas    = canvasRef.current;
    if (!container || !canvas) return;

    const dpr  = window.devicePixelRatio || 1;
    // Fit COLS columns into container width, leave a small margin
    const availW = container.clientWidth - 4;
    const availH = container.clientHeight - 4;
    const cellByW = Math.floor(availW / COLS);
    const cellByH = Math.floor(availH / ROWS);
    const cell = Math.max(16, Math.min(cellByW, cellByH, 28)); // clamp 16–28
    cellRef.current = cell;

    const W = COLS * cell, H = ROWS * cell;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + "px";
    canvas.style.height = H + "px";

    stateRef.current = initState(cell);

    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) {
        e.preventDefault();
        e.stopPropagation();
      }
      keysRef.current.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.code);
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });

    lastRef.current = performance.now();
    rafRef.current  = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
    };
  }, [tick]);

  const restart = () => {
    stateRef.current = initState(cellRef.current);
    setPhase("ready");
  };

  const handleDir = useCallback((d: Dir) => {
    stateRef.current.pac.nextDir = d;
  }, []);

  // Touch swipe
  const touchRef = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchRef.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchRef.current.x;
    const dy = t.clientY - touchRef.current.y;
    touchRef.current = null;
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
    stateRef.current.pac.nextDir = Math.abs(dx) > Math.abs(dy)
      ? (dx > 0 ? 0 : 2)
      : (dy > 0 ? 1 : 3);
  };

  return (
    <div className="wg-game" style={{ background: "#0d0d0d", gap: 6, padding: 10, justifyContent: "center" }}>
      <div className="wg-status" style={{ fontSize: 11, padding: "4px 10px" }}>
        PAC-MAN · arrows / WASD / d-pad / swipe
      </div>
      {/* Canvas wrapper: fills remaining height */}
      <div ref={containerRef} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", width: "100%", overflow: "hidden" }}>
        <canvas
          ref={canvasRef}
          className="wg-canvas"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{ touchAction: "none", borderRadius: 8 }}
        />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
        <DPad onDir={handleDir} />
        {(phase === "won" || phase === "over") && (
          <button className="wg-btn" onClick={restart}>
            {phase === "won" ? "Play Again 🎉" : "Try Again"}
          </button>
        )}
      </div>
    </div>
  );
}
