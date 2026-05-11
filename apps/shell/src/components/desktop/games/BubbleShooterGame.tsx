import { useCallback, useEffect, useRef, useState } from "react";

const WW = 340;
const WH = 540;
const R = 14;
const PALETTE = [
  "#F59E0B",
  "#0EA5E9",
  "#EF4444",
  "#22C55E",
  "#A855F7",
] as const;

interface Bubble {
  x: number;
  y: number;
  c: string;
}
interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  c: string;
}

interface BSState {
  bubbles: Bubble[];
  shot: Shot | null;
  shotColor: string;
  aimX: number;
  aimPoint: { x: number; y: number } | null;
  aiming: boolean;
  aimPower: number;
  score: number;
}

function randColor() {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

function makeField(): Bubble[] {
  const out: Bubble[] = [];
  for (let row = 0; row < 9; row++) {
    for (let col = 0; col < 10; col++) {
      const x = 24 + col * 30 + (row % 2 === 1 ? 15 : 0);
      const y = 28 + row * 28;
      if (x < WW - 18) out.push({ x, y, c: randColor() });
    }
  }
  return out;
}

function neighbors(bubbles: Bubble[], idx: number): number[] {
  const b = bubbles[idx];
  return bubbles
    .map((o, i) => ({ o, i }))
    .filter(
      ({ o, i }) => i !== idx && Math.hypot(o.x - b.x, o.y - b.y) <= R * 2.2,
    )
    .map(({ i }) => i);
}

function popCluster(state: BSState, startIdx: number) {
  const target = state.bubbles[startIdx].c;
  const seen = new Set([startIdx]);
  const q = [startIdx];
  while (q.length) {
    const i = q.shift()!;
    for (const n of neighbors(state.bubbles, i)) {
      if (seen.has(n)) continue;
      if (state.bubbles[n].c !== target) continue;
      seen.add(n);
      q.push(n);
    }
  }
  if (seen.size < 3) return;
  state.bubbles = state.bubbles.filter((_, i) => !seen.has(i));
  state.score += seen.size;
}

function placeShot(state: BSState, x: number, y: number) {
  state.bubbles.push({ x, y, c: state.shot!.c });
  popCluster(state, state.bubbles.length - 1);
  state.shot = null;
  state.shotColor = randColor();
  if (state.bubbles.length === 0) {
    state.bubbles = makeField();
    state.score += 10; // bonus for clearing
  }
}

function drawBS(canvas: HTMLCanvasElement, s: BSState, cw: number, ch: number) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.scale(dpr, dpr);

  const scaleX = cw / WW,
    scaleY = ch / WH;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (cw - WW * scale) / 2;
  const offsetY = (ch - WH * scale) / 2;

  ctx.fillStyle = "#08162E";
  ctx.fillRect(0, 0, cw, ch);

  ctx.translate(offsetX, offsetY);
  ctx.scale(scale, scale);

  const r = R;
  const cannonX = WW / 2,
    cannonY = WH - 24;
  const aim = s.aimPoint ?? { x: s.aimX, y: WH - 180 };

  // Aim line
  ctx.strokeStyle = `rgba(245,158,11,${s.aiming ? 0.5 + 0.4 * s.aimPower : 0.35})`;
  ctx.lineWidth = s.aiming ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(cannonX, cannonY);
  ctx.lineTo(aim.x, aim.y);
  ctx.stroke();

  // Bubbles
  for (const b of s.bubbles) {
    ctx.fillStyle = b.c;
    ctx.beginPath();
    ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
    ctx.fill();
    // Shine
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(b.x - r * 0.28, b.y - r * 0.28, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flying shot
  if (s.shot) {
    ctx.fillStyle = s.shot.c;
    ctx.beginPath();
    ctx.arc(s.shot.x, s.shot.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Cannon / next bubble
  ctx.fillStyle = s.shotColor + "CC";
  ctx.beginPath();
  ctx.arc(cannonX, cannonY, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function BubbleShooterGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<BSState>({
    bubbles: makeField(),
    shot: null,
    shotColor: randColor(),
    aimX: WW / 2,
    aimPoint: null,
    aiming: false,
    aimPower: 0.55,
    score: 0,
  });
  const rafRef = useRef<number>(0);
  const [score, setScore] = useState(0);
  const sizeRef = useRef({ w: WW, h: WH });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas)
      drawBS(canvas, stateRef.current, sizeRef.current.w, sizeRef.current.h);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      sizeRef.current = { w: rect.width, h: rect.height };
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      draw();
    };
    resize();

    const tick = () => {
      const s = stateRef.current;

      if (s.shot) {
        let { x, y, vx, vy } = s.shot;
        x += vx;
        y += vy;

        if (x <= R || x >= WW - R) {
          vx = -vx;
          x = s.shot.x + vx;
        }

        if (y <= R + 6) {
          placeShot(s, Math.min(Math.max(x, R), WW - R), R + 6);
          setScore(s.score);
        } else {
          let hit = false;
          for (const b of s.bubbles) {
            if (Math.hypot(b.x - x, b.y - y) <= R * 2.0) {
              const ang = Math.atan2(y - b.y, x - b.x);
              const sx = Math.min(
                Math.max(b.x + Math.cos(ang) * R * 2.04, R),
                WW - R,
              );
              const sy = Math.min(
                Math.max(b.y + Math.sin(ang) * R * 2.04, R + 4),
                WH - 40,
              );
              placeShot(s, sx, sy);
              setScore(s.score);
              hit = true;
              break;
            }
          }
          if (!hit) s.shot = { x, y, vx, vy, c: s.shot.c };
        }
        draw();
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [draw]);

  const fire = useCallback((localX: number, localY: number, power: number) => {
    const s = stateRef.current;
    if (s.shot) return;
    const { w: cw, h: ch } = sizeRef.current;
    const scaleX = cw / WW,
      scaleY = ch / WH;
    const scale = Math.min(scaleX, scaleY);
    const offsetX = (cw - WW * scale) / 2;
    const offsetY = (ch - WH * scale) / 2;
    const wx = (localX - offsetX) / scale;
    const wy = (localY - offsetY) / scale;
    const startX = WW / 2,
      startY = WH - 24;
    const dx = wx - startX,
      dy = wy - startY;
    const dist = Math.hypot(dx, dy);
    if (dist < 4) return;
    const speed = 3.8 + power * 4.8;
    s.shot = {
      x: startX,
      y: startY,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      c: s.shotColor,
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const s = stateRef.current;
      s.aiming = true;
      s.aimPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      draw();
    },
    [draw],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const s = stateRef.current;
      if (!s.aiming) return;
      const rect = canvas.getBoundingClientRect();
      const lx = e.clientX - rect.left,
        ly = e.clientY - rect.top;
      const { w: cw, h: ch } = sizeRef.current;
      const startX = cw / 2,
        startY = ch * ((WH - 24) / WH);
      const pull = Math.hypot(lx - startX, ly - startY);
      s.aimPoint = { x: lx, y: ly };
      s.aimPower = Math.min(1, Math.max(0.2, pull / (Math.min(cw, ch) * 0.55)));
      draw();
    },
    [draw],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const s = stateRef.current;
      const rect = canvas.getBoundingClientRect();
      fire(e.clientX - rect.left, e.clientY - rect.top, s.aimPower);
      s.aiming = false;
      s.aimPoint = null;
      draw();
    },
    [draw, fire],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      fire(e.clientX - rect.left, e.clientY - rect.top, 0.55);
    },
    [fire],
  );

  return (
    <div className="wg-game">
      <div className="wg-status">
        Score: <strong>{score}</strong>&nbsp;·&nbsp;drag &amp; release to aim ·
        tap to shoot
      </div>
      <canvas
        ref={canvasRef}
        className="wg-canvas"
        style={{
          width: "100%",
          aspectRatio: `${WW}/${WH}`,
          maxWidth: WW,
          maxHeight: WH,
        }}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
      />
    </div>
  );
}
