import { useState, useEffect, useCallback, useRef } from "react";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const MAX_WRONG = 6;

// ── Drawing ───────────────────────────────────────────────────────────────────
function drawHangman(canvas: HTMLCanvasElement, wrong: number, phase: string) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width / (window.devicePixelRatio || 1);
  const H = canvas.height / (window.devicePixelRatio || 1);
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Background
  ctx.fillStyle = "#fffdf5";
  ctx.fillRect(0, 0, W, H);

  // Gallows
  ctx.strokeStyle = "#8a6a50";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Base
  ctx.beginPath(); ctx.moveTo(20, H - 15); ctx.lineTo(W - 20, H - 15); ctx.stroke();
  // Pole
  ctx.beginPath(); ctx.moveTo(55, H - 15); ctx.lineTo(55, 20); ctx.stroke();
  // Beam
  ctx.beginPath(); ctx.moveTo(55, 20); ctx.lineTo(W - 40, 20); ctx.stroke();
  // Rope
  ctx.beginPath(); ctx.moveTo(W - 40, 20); ctx.lineTo(W - 40, 45); ctx.stroke();

  const cx = W - 40, headY = 62;
  if (wrong < 1) { ctx.restore(); return; }

  // Head
  ctx.strokeStyle = phase === "lost" ? "#b85c38" : "#5a7a52";
  ctx.beginPath(); ctx.arc(cx, headY, 17, 0, Math.PI * 2); ctx.stroke();

  if (wrong >= 2) {
    // Body
    ctx.beginPath(); ctx.moveTo(cx, headY + 17); ctx.lineTo(cx, headY + 65); ctx.stroke();
  }
  if (wrong >= 3) {
    // Left arm
    ctx.beginPath(); ctx.moveTo(cx, headY + 28); ctx.lineTo(cx - 22, headY + 48); ctx.stroke();
  }
  if (wrong >= 4) {
    // Right arm
    ctx.beginPath(); ctx.moveTo(cx, headY + 28); ctx.lineTo(cx + 22, headY + 48); ctx.stroke();
  }
  if (wrong >= 5) {
    // Left leg
    ctx.beginPath(); ctx.moveTo(cx, headY + 65); ctx.lineTo(cx - 22, headY + 88); ctx.stroke();
  }
  if (wrong >= 6) {
    // Right leg
    ctx.beginPath(); ctx.moveTo(cx, headY + 65); ctx.lineTo(cx + 22, headY + 88); ctx.stroke();
    // X eyes
    ctx.strokeStyle = "#b85c38";
    ctx.lineWidth = 2;
    [[cx-6,headY-5],[cx+6,headY-5]].forEach(([ex, ey]) => {
      ctx.beginPath(); ctx.moveTo(ex-4, ey-4); ctx.lineTo(ex+4, ey+4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex+4, ey-4); ctx.lineTo(ex-4, ey+4); ctx.stroke();
    });
  }
  ctx.restore();
}

// ── Component ─────────────────────────────────────────────────────────────────
const DEFAULT_WORDS = ["HUMAN","LABEL","MODEL","TRUST","ANNOTATE","FEEDBACK","DATASET","ETHICS","BIAS","REVIEW","AUDIT","CONSENT","LOOP","AGENT","EXPERT"];

interface Props { words?: string[] }

export function HangmanGame({ words = DEFAULT_WORDS }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const pickWord = useCallback(() => {
    if (!words.length) return "";
    return words[Math.floor(Math.random() * words.length)].toUpperCase();
  }, [words]);

  const [word, setWord] = useState(pickWord);
  const [guessed, setGuessed] = useState<Set<string>>(new Set());

  const wrong = [...guessed].filter((l) => !word.includes(l)).length;
  const revealed = word.split("").every((l) => guessed.has(l) || l === " ");
  const phase: "playing" | "won" | "lost" =
    revealed ? "won" : wrong >= MAX_WRONG ? "lost" : "playing";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(180 * dpr);
    canvas.height = Math.round(200 * dpr);
    canvas.style.width  = "180px";
    canvas.style.height = "200px";
    drawHangman(canvas, wrong, phase);
  }, [wrong, phase]);

  const guess = useCallback((letter: string) => {
    if (phase !== "playing" || guessed.has(letter)) return;
    setGuessed((prev) => new Set([...prev, letter]));
  }, [phase, guessed]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (/^[a-zA-Z]$/.test(e.key)) guess(e.key.toUpperCase());
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [guess]);

  const reset = useCallback(() => {
    setWord(pickWord());
    setGuessed(new Set());
  }, [pickWord]);

  return (
    <div className="hm">
      <div className="hm-top">
        <canvas ref={canvasRef} className="hm-canvas" />
        <div className="hm-right">
          <div className="hm-word" aria-label={`Word: ${word.split("").map(l => guessed.has(l) ? l : "blank").join(" ")}`}>
            {word.split("").map((l, i) =>
              l === " "
                ? <span key={i} className="hm-space" />
                : <span key={i} className={`hm-letter${guessed.has(l) ? " hm-letter--revealed" : ""}`}>
                    {guessed.has(l) ? l : ""}
                  </span>
            )}
          </div>
          <div className="hm-status" role="status">
            {phase === "won"  && <span className="hm-won">You got it! 🎉</span>}
            {phase === "lost" && <span className="hm-lost">It was: <strong>{word}</strong></span>}
            {phase === "playing" && (
              <span className="hm-lives">
                {MAX_WRONG - wrong} guess{MAX_WRONG - wrong !== 1 ? "es" : ""} left
              </span>
            )}
          </div>
          <div className="hm-wrong-letters">
            {[...guessed].filter(l => !word.includes(l)).map(l =>
              <span key={l} className="hm-wrong-letter">{l}</span>
            )}
          </div>
        </div>
      </div>

      <div className="hm-keyboard" aria-label="Guess a letter">
        {ALPHABET.map((l) => {
          const isGuessed = guessed.has(l);
          const isRight = isGuessed && word.includes(l);
          const isWrong = isGuessed && !word.includes(l);
          return (
            <button
              key={l}
              className={[
                "hm-key",
                isRight ? "hm-key--right" : "",
                isWrong ? "hm-key--wrong" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => guess(l)}
              disabled={isGuessed || phase !== "playing"}
              aria-label={`Guess ${l}`}
              aria-pressed={isGuessed}
            >
              {l}
            </button>
          );
        })}
      </div>

      <button className="hm-reset" onClick={reset}>
        {phase === "playing" ? "New word" : "Play again"}
      </button>
    </div>
  );
}
