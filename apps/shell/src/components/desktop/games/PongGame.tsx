import { useCallback, useEffect, useRef, useState } from "react";

const W = 560;
const H = 380;
const PADDLE_HALF = 0.11;
const KB_STEP = 0.018;

interface PongState {
  left: number;
  right: number;
  bx: number;
  by: number;
  vx: number;
  vy: number;
  playerScore: number;
  aiScore: number;
  twoPlayer: boolean;
  keys: Set<string>;
}

function serve(dir: number, state: PongState) {
  state.bx = 0.5;
  state.by = 0.5;
  state.vx = dir * 0.011;
  state.vy = (Math.random() - 0.5) * 0.018;
}

function drawPong(canvas: HTMLCanvasElement, s: PongState) {
  const dpr = window.devicePixelRatio || 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#07152B";
  ctx.fillRect(0, 0, W, H);

  const arenaW = Math.min(W, H * 1.22);
  const x0 = (W - arenaW) / 2;

  // Arena
  ctx.fillStyle = "#0A1A36";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0, 0, arenaW, H, 14);
  else ctx.rect(x0, 0, arenaW, H);
  ctx.fill();

  // Center line
  ctx.strokeStyle = "rgba(125,211,252,0.2)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.moveTo(x0 + arenaW / 2, 0);
  ctx.lineTo(x0 + arenaW / 2, H);
  ctx.stroke();
  ctx.setLineDash([]);

  const ph = H * 0.22;

  // Left paddle
  ctx.fillStyle = "#7DD3FC";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x0 + 8, s.left * H - ph / 2, 8, ph, 8);
  else ctx.rect(x0 + 8, s.left * H - ph / 2, 8, ph);
  ctx.fill();

  // Right paddle
  ctx.fillStyle = "#34D399";
  ctx.beginPath();
  if (ctx.roundRect)
    ctx.roundRect(x0 + arenaW - 16, s.right * H - ph / 2, 8, ph, 8);
  else ctx.rect(x0 + arenaW - 16, s.right * H - ph / 2, 8, ph);
  ctx.fill();

  // Ball
  ctx.fillStyle = "#F59E0B";
  ctx.beginPath();
  ctx.arc(x0 + s.bx * arenaW, s.by * H, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function PongGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<PongState>({
    left: 0.5,
    right: 0.5,
    bx: 0.5,
    by: 0.5,
    vx: 0.011,
    vy: 0.008,
    playerScore: 0,
    aiScore: 0,
    twoPlayer: false,
    keys: new Set(),
  });
  const rafRef = useRef<number>(0);
  const [scores, setScores] = useState({ player: 0, ai: 0, twoPlayer: false });

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas) drawPong(canvas, stateRef.current);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * dpr;
    canvas.height = H * dpr;

    const tick = () => {
      const s = stateRef.current;

      // Keyboard paddle control
      if (s.twoPlayer) {
        if (s.keys.has("KeyW"))
          s.left = Math.max(PADDLE_HALF, s.left - KB_STEP);
        if (s.keys.has("KeyS"))
          s.left = Math.min(1 - PADDLE_HALF, s.left + KB_STEP);
        if (s.keys.has("ArrowUp"))
          s.right = Math.max(PADDLE_HALF, s.right - KB_STEP);
        if (s.keys.has("ArrowDown"))
          s.right = Math.min(1 - PADDLE_HALF, s.right + KB_STEP);
      } else {
        const up = s.keys.has("ArrowUp") || s.keys.has("KeyW");
        const down = s.keys.has("ArrowDown") || s.keys.has("KeyS");
        if (up) s.left = Math.max(PADDLE_HALF, s.left - KB_STEP);
        if (down) s.left = Math.min(1 - PADDLE_HALF, s.left + KB_STEP);
        // AI
        s.right += Math.max(-0.012, Math.min(0.012, s.by - s.right));
        s.right = Math.max(PADDLE_HALF, Math.min(1 - PADDLE_HALF, s.right));
      }

      s.bx += s.vx;
      s.by += s.vy;

      // Wall bounce
      if (s.by < 0.02 || s.by > 0.98) s.vy *= -1;

      // Left paddle
      const lt = s.left - PADDLE_HALF,
        lb = s.left + PADDLE_HALF;
      if (s.vx < 0 && s.bx <= 0.04 && s.by >= lt && s.by <= lb) {
        s.bx = 0.04;
        s.vx = Math.abs(s.vx) * 1.04;
      }
      // Right paddle
      const rt = s.right - PADDLE_HALF,
        rb = s.right + PADDLE_HALF;
      if (s.vx > 0 && s.bx >= 0.96 && s.by >= rt && s.by <= rb) {
        s.bx = 0.96;
        s.vx = -Math.abs(s.vx) * 1.04;
      }

      // Score
      if (s.bx < -0.02) {
        s.aiScore += 1;
        serve(1, s);
        setScores({
          player: s.playerScore,
          ai: s.aiScore,
          twoPlayer: s.twoPlayer,
        });
      }
      if (s.bx > 1.02) {
        s.playerScore += 1;
        serve(-1, s);
        setScores({
          player: s.playerScore,
          ai: s.aiScore,
          twoPlayer: s.twoPlayer,
        });
      }

      draw();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      stateRef.current.keys.add(e.code);
      if (["ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
      if (e.code === "KeyT") {
        const s = stateRef.current;
        s.twoPlayer = !s.twoPlayer;
        setScores((sc) => ({ ...sc, twoPlayer: s.twoPlayer }));
      }
    };
    const up = (e: KeyboardEvent) => {
      stateRef.current.keys.delete(e.code);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Mouse: control left paddle (or right paddle in 2P if mouse is on right half)
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const norm = Math.max(
        PADDLE_HALF,
        Math.min(1 - PADDLE_HALF, (e.clientY - rect.top) / rect.height),
      );
      const s = stateRef.current;
      if (s.twoPlayer && e.clientX - rect.left >= rect.width / 2)
        s.right = norm;
      else s.left = norm;
    },
    [],
  );

  return (
    <div className="wg-game">
      <div
        className="wg-status"
        style={{
          display: "flex",
          justifyContent: "space-between",
          width: W,
          maxWidth: "100%",
        }}
      >
        <span>
          <strong>{scores.player}</strong> — <strong>{scores.ai}</strong>
          &nbsp;·&nbsp;{scores.twoPlayer ? "2P Local" : "Solo vs AI"}
          &nbsp;·&nbsp;arrows/WASD + mouse
        </span>
        <button
          className="wg-btn"
          onClick={() => {
            const s = stateRef.current;
            s.twoPlayer = !s.twoPlayer;
            setScores((sc) => ({ ...sc, twoPlayer: s.twoPlayer }));
          }}
        >
          {scores.twoPlayer ? "2P ON" : "2P Local"}
        </button>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: W, height: H }}
        className="wg-canvas"
        tabIndex={0}
        onMouseMove={handleMouseMove}
      />
    </div>
  );
}
