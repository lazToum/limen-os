import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const GRID_SIZE = 16;
const BASE_TICK_MS = 180;
const FASTEST_TICK_MS = 92;

interface Cell {
  x: number;
  y: number;
}

interface SnakeState {
  snake: Cell[];
  food: Cell;
  heading: Cell;
  pendingTurn: Cell | null;
  score: number;
  best: number;
  phase: "idle" | "running" | "paused" | "over";
}

interface HudState {
  score: number;
  best: number;
  phase: SnakeState["phase"];
  pace: number;
}

const START_SNAKE: Cell[] = [
  { x: 5, y: 8 },
  { x: 4, y: 8 },
  { x: 3, y: 8 },
];

function equalCell(a: Cell, b: Cell) {
  return a.x === b.x && a.y === b.y;
}

function createFood(snake: Cell[]): Cell {
  const open: Cell[] = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      if (!snake.some((part) => part.x === x && part.y === y)) {
        open.push({ x, y });
      }
    }
  }
  return open[Math.floor(Math.random() * open.length)] ?? { x: 0, y: 0 };
}

function currentTick(score: number) {
  return Math.max(FASTEST_TICK_MS, BASE_TICK_MS - score * 6);
}

function buildState(best = 0): SnakeState {
  const snake = [...START_SNAKE];
  return {
    snake,
    food: createFood(snake),
    heading: { x: 1, y: 0 },
    pendingTurn: null,
    score: 0,
    best,
    phase: "idle",
  };
}

function hudFromState(state: SnakeState): HudState {
  return {
    score: state.score,
    best: state.best,
    phase: state.phase,
    pace: Math.round(1000 / currentTick(state.score)),
  };
}

function drawScene(canvas: HTMLCanvasElement, side: number, state: SnakeState) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const cell = side / GRID_SIZE;

  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, side, side);

  const bg = ctx.createLinearGradient(0, 0, side, side);
  bg.addColorStop(0, "#06101b");
  bg.addColorStop(0.55, "#0e2233");
  bg.addColorStop(1, "#153349");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, side, side);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.08)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= GRID_SIZE; i += 1) {
    const pos = i * cell;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, side);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(side, pos);
    ctx.stroke();
  }

  const foodX = state.food.x * cell + cell / 2;
  const foodY = state.food.y * cell + cell / 2;
  const apple = ctx.createRadialGradient(
    foodX - cell * 0.12,
    foodY - cell * 0.14,
    cell * 0.08,
    foodX,
    foodY,
    cell * 0.42,
  );
  apple.addColorStop(0, "#fde68a");
  apple.addColorStop(0.4, "#fb7185");
  apple.addColorStop(1, "#be123c");
  ctx.fillStyle = apple;
  ctx.beginPath();
  ctx.arc(foodX, foodY, cell * 0.28, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#14532d";
  ctx.lineWidth = Math.max(2, cell * 0.06);
  ctx.beginPath();
  ctx.moveTo(foodX, foodY - cell * 0.28);
  ctx.lineTo(foodX + cell * 0.06, foodY - cell * 0.44);
  ctx.stroke();

  state.snake.forEach((part, index) => {
    const inset = cell * 0.09;
    const x = part.x * cell + inset;
    const y = part.y * cell + inset;
    const size = cell - inset * 2;
    const radius = index === 0 ? cell * 0.2 : cell * 0.16;
    ctx.fillStyle =
      index === 0 ? "#67e8f9" : index % 2 === 0 ? "#34d399" : "#10b981";
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, radius);
    ctx.fill();

    if (index === 0) {
      const dx = state.heading.x * cell * 0.08;
      const dy = state.heading.y * cell * 0.08;
      ctx.fillStyle = "#083344";
      ctx.beginPath();
      ctx.arc(
        x + size * 0.34 + dx,
        y + size * 0.34 + dy,
        Math.max(2, cell * 0.055),
        0,
        Math.PI * 2,
      );
      ctx.arc(
        x + size * 0.66 + dx,
        y + size * 0.34 + dy,
        Math.max(2, cell * 0.055),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  });

  if (state.phase !== "running") {
    ctx.fillStyle = "rgba(2, 6, 23, 0.22)";
    ctx.fillRect(0, 0, side, side);
  }

  ctx.restore();
}

export function SnakeGame() {
  const initial = buildState();
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const stateRef = useRef<SnakeState>(initial);
  const elapsedRef = useRef(0);
  const lastTimeRef = useRef(0);
  const dragStartRef = useRef<Cell | null>(null);
  const [boardSide, setBoardSide] = useState(320);
  const [hud, setHud] = useState<HudState>(() => hudFromState(initial));

  const syncHud = useCallback(() => {
    setHud(hudFromState(stateRef.current));
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(boardSide * dpr);
    canvas.height = Math.floor(boardSide * dpr);
    canvas.style.width = `${boardSide}px`;
    canvas.style.height = `${boardSide}px`;
    drawScene(canvas, boardSide, stateRef.current);
  }, [boardSide]);

  const reset = useCallback(() => {
    const best = stateRef.current.best;
    stateRef.current = buildState(best);
    elapsedRef.current = 0;
    lastTimeRef.current = 0;
    syncHud();
    draw();
  }, [draw, syncHud]);

  const start = useCallback(() => {
    if (stateRef.current.phase === "over") {
      reset();
    }
    stateRef.current.phase = "running";
    syncHud();
    draw();
  }, [draw, reset, syncHud]);

  const togglePause = useCallback(() => {
    const state = stateRef.current;
    if (state.phase === "idle" || state.phase === "over") return;
    state.phase = state.phase === "paused" ? "running" : "paused";
    syncHud();
    draw();
  }, [draw, syncHud]);

  const turn = useCallback((next: Cell) => {
    const state = stateRef.current;
    const active = state.pendingTurn ?? state.heading;
    if (next.x === -active.x && next.y === -active.y) return;
    state.pendingTurn = next;
  }, []);

  const tick = useCallback(() => {
    const state = stateRef.current;
    if (state.phase !== "running") return;

    const heading = state.pendingTurn ?? state.heading;
    state.heading = heading;
    state.pendingTurn = null;

    const nextHead = {
      x: state.snake[0].x + heading.x,
      y: state.snake[0].y + heading.y,
    };

    const wallHit =
      nextHead.x < 0 ||
      nextHead.x >= GRID_SIZE ||
      nextHead.y < 0 ||
      nextHead.y >= GRID_SIZE;
    const bodyHit = state.snake.some((part) => equalCell(part, nextHead));
    if (wallHit || bodyHit) {
      state.phase = "over";
      state.best = Math.max(state.best, state.score);
      syncHud();
      draw();
      return;
    }

    state.snake = [nextHead, ...state.snake];
    if (equalCell(nextHead, state.food)) {
      state.score += 1;
      state.best = Math.max(state.best, state.score);
      state.food = createFood(state.snake);
    } else {
      state.snake.pop();
    }

    syncHud();
    draw();
  }, [draw, syncHud]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const widthBudget = host.clientWidth - 16;
      const heightBudget = host.clientHeight - 16;
      const side = Math.max(
        220,
        Math.floor(Math.min(widthBudget, heightBudget)),
      );
      setBoardSide(side);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const loop = (time: number) => {
      const state = stateRef.current;
      if (!lastTimeRef.current) lastTimeRef.current = time;
      const delta = time - lastTimeRef.current;
      lastTimeRef.current = time;

      if (state.phase === "running") {
        elapsedRef.current += delta;
        const tickMs = currentTick(state.score);
        while (elapsedRef.current >= tickMs) {
          tick();
          elapsedRef.current -= tickMs;
          if (stateRef.current.phase !== "running") {
            elapsedRef.current = 0;
            break;
          }
        }
      }

      frameRef.current = requestAnimationFrame(loop);
    };

    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [tick]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const directions: Record<string, Cell> = {
        ArrowUp: { x: 0, y: -1 },
        KeyW: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        KeyS: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        KeyA: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        KeyD: { x: 1, y: 0 },
      };

      const next = directions[event.code];
      if (next) {
        turn(next);
        if (stateRef.current.phase === "idle") start();
        event.preventDefault();
        return;
      }

      if (event.code === "Space") {
        if (stateRef.current.phase === "idle") start();
        else togglePause();
        event.preventDefault();
        return;
      }

      if (event.code === "Enter") {
        if (stateRef.current.phase === "over") {
          reset();
          start();
        } else if (stateRef.current.phase === "idle") {
          start();
        }
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reset, start, togglePause, turn]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      dragStartRef.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.focus();
    },
    [],
  );

  const handlePointerEnd = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const startPoint = dragStartRef.current;
      dragStartRef.current = null;
      if (!startPoint) return;

      const dx = event.clientX - startPoint.x;
      const dy = event.clientY - startPoint.y;
      if (Math.hypot(dx, dy) < 16) {
        if (stateRef.current.phase === "idle") start();
        else if (
          stateRef.current.phase === "running" ||
          stateRef.current.phase === "paused"
        )
          togglePause();
        return;
      }

      if (Math.abs(dx) > Math.abs(dy)) {
        turn(dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 });
      } else {
        turn(dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 });
      }

      if (stateRef.current.phase === "idle") {
        start();
      }
    },
    [start, togglePause, turn],
  );

  const title =
    hud.phase === "over"
      ? "Game Over"
      : hud.phase === "paused"
        ? "Paused"
        : "Snake";

  const message =
    hud.phase === "idle"
      ? "Built fresh again, sized to the window, with no scroll-driven layout issues."
      : hud.phase === "paused"
        ? "Resume when ready."
        : hud.phase === "over"
          ? `Score ${hud.score}. Press Play Again or hit Enter.`
          : "";

  return (
    <div
      className="wg-game"
      style={{
        overflow: "hidden",
        minHeight: 0,
        justifyContent: "space-between",
      }}
    >
      <div className="wg-status">
        Score <strong>{hud.score}</strong> · Best <strong>{hud.best}</strong> ·
        Pace <strong>{hud.pace}</strong>/s · {hud.phase}
      </div>
      <div className="wg-toolbar">
        <button className="wg-btn" onClick={start}>
          {hud.phase === "idle"
            ? "Start"
            : hud.phase === "over"
              ? "Play Again"
              : "Resume"}
        </button>
        <button
          className="wg-btn"
          onClick={togglePause}
          disabled={hud.phase === "idle" || hud.phase === "over"}
        >
          {hud.phase === "paused" ? "Continue" : "Pause"}
        </button>
        <button className="wg-btn" onClick={reset}>
          Reset
        </button>
        <span className="wg-hint">
          Arrow keys or WASD. Swipe on touch. Tap to pause.
        </span>
      </div>
      <div
        ref={hostRef}
        style={{
          position: "relative",
          flex: 1,
          minHeight: 0,
          width: "100%",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          className="wg-canvas"
          tabIndex={0}
          style={{
            display: "block",
            maxWidth: "100%",
            maxHeight: "100%",
            aspectRatio: "1 / 1",
            touchAction: "none",
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        />
        {hud.phase !== "running" && (
          <div className="wg-overlay-card">
            <strong>{title}</strong>
            <span>{message}</span>
            <button
              className="wg-btn"
              onClick={hud.phase === "paused" ? togglePause : start}
            >
              {hud.phase === "paused"
                ? "Resume"
                : hud.phase === "over"
                  ? "Play Again"
                  : "Start Run"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
