import { useEffect, useRef, useState, useCallback } from "react";
import {
  makeInitialState,
  getLegalMovesFrom,
  getLegalMoves,
  applyMove,
  getStatus,
  moveToAlgebraic,
  isInCheck,
  squareName,
} from "./engine";
import type { GameState, Move } from "./engine";
import type { ChessMode, ChessMove } from "./types";
import { nextWid } from "./wid";

const SYM: Record<string, string> = {
  wp: "♙",
  wr: "♖",
  wn: "♘",
  wb: "♗",
  wq: "♕",
  wk: "♔",
  bp: "♟",
  br: "♜",
  bn: "♞",
  bb: "♝",
  bq: "♛",
  bk: "♚",
};

const MODE_LABELS: Record<ChessMode, string> = {
  "2p": "2P Local",
  "vs-ai-white": "VS AI (you=White)",
  "vs-ai-black": "VS AI (you=Black)",
  hint: "Hint",
};

interface OnlineState {
  connected: boolean;
  url: string;
  side: "w" | "b";
}

export function ChessGame() {
  const [gameState, setGameState] = useState<GameState>(makeInitialState);
  const [selected, setSelected] = useState<number>(-1);
  const [legalTargets, setLegalTargets] = useState<Move[]>([]);
  const [mode, setMode] = useState<ChessMode>("2p");
  const [history, setHistory] = useState<ChessMove[]>([]);
  const [sessionId] = useState<string>(() => nextWid());
  const [thinking, setThinking] = useState(false);
  const [status, setStatus] = useState("White's turn");
  const [online, setOnline] = useState<OnlineState>({
    connected: false,
    url: "ws://localhost:3737",
    side: "w",
  });
  const [showOnline, setShowOnline] = useState(false);
  const [promotion, setPromotion] = useState<{
    from: number;
    to: number;
    piece: string;
  } | null>(null);

  const workerRef = useRef<Worker | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const historyEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll history to bottom (scrollIntoView may not exist in all environments)
  useEffect(() => {
    if (
      historyEndRef.current &&
      typeof historyEndRef.current.scrollIntoView === "function"
    ) {
      historyEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history]);

  // Cleanup worker and WebSocket on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      wsRef.current?.close();
    };
  }, []);

  const getStatusText = useCallback(
    (gs: GameState, isThinking: boolean): string => {
      if (isThinking) return "AI thinking...";
      const gStatus = getStatus(gs);
      if (gStatus === "checkmate") {
        const winner = gs.turn === "w" ? "Black" : "White";
        return `Checkmate! ${winner} wins`;
      }
      if (gStatus === "stalemate") return "Stalemate — draw";
      if (gStatus === "draw") return "Draw (50-move rule)";
      const inCheck = isInCheck(gs.board, gs.turn);
      const turnName = gs.turn === "w" ? "White" : "Black";
      return inCheck ? `${turnName}'s turn — in check!` : `${turnName}'s turn`;
    },
    [],
  );

  const isGameOver = (gs: GameState) => getStatus(gs) !== "playing";

  const recordMove = useCallback(
    (move: Move, _legalsBefore: Move[]): ChessMove => {
      const wid = nextWid();
      return {
        id: wid,
        from: move.from,
        to: move.to,
        piece: move.piece,
        ...(move.promotion ? { promotion: move.promotion } : {}),
        timestamp: wid,
      };
    },
    [],
  );

  // WebSocket connect/disconnect
  const connectWs = useCallback(
    (url: string, side: "w" | "b", _gs: GameState) => {
      if (wsRef.current) wsRef.current.close();
      const ws = new WebSocket(url);
      wsRef.current = ws;
      ws.onopen = () => {
        setOnline((o) => ({ ...o, connected: true }));
        ws.send(JSON.stringify({ type: "join", gameId: sessionId, side }));
      };
      ws.onclose = () => setOnline((o) => ({ ...o, connected: false }));
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string) as {
            type: string;
            move?: Move;
          };
          if (msg.type === "move" && msg.move) {
            setGameState((prev) => {
              const legals = getLegalMoves(prev);
              const lm = legals.find(
                (m) => m.from === msg.move!.from && m.to === msg.move!.to,
              );
              if (!lm) return prev;
              const next = applyMove(prev, lm);
              const cm = recordMove(lm, legals);
              setHistory((h) => [...h, cm]);
              setStatus(getStatusText(next, false));
              return next;
            });
          }
        } catch {
          /* ignore bad messages */
        }
      };
    },
    [sessionId, getStatusText, recordMove],
  );

  // Trigger AI move after player moves in vs-ai modes
  const triggerAI = useCallback(
    (gs: GameState) => {
      if (isGameOver(gs)) return;
      setThinking(true);

      // Lazily create worker
      if (!workerRef.current) {
        workerRef.current = new Worker(
          new URL("./worker.ts", import.meta.url),
          { type: "module" },
        );
      }

      const worker = workerRef.current;
      worker.onmessage = (
        e: MessageEvent<{ type: string; move: Move | null }>,
      ) => {
        setThinking(false);
        if (e.data.type === "bestMove" && e.data.move) {
          const aiMove = e.data.move;
          setGameState((prev) => {
            const legals = getLegalMoves(prev);
            const next = applyMove(prev, aiMove);
            const cm = recordMove(aiMove, legals);
            setHistory((h) => [...h, cm]);
            setStatus(getStatusText(next, false));
            return next;
          });
        }
      };
      worker.postMessage({ type: "getBestMove", state: gs, depth: 4 });
    },
    [getStatusText, recordMove],
  );

  // Determine if it's the human player's turn
  const isHumanTurn = useCallback(
    (gs: GameState): boolean => {
      if (mode === "2p") return true;
      if (thinking) return false;
      if (mode === "vs-ai-white") return gs.turn === "w";
      if (mode === "vs-ai-black") return gs.turn === "b";
      return true; // hint mode
    },
    [mode, thinking],
  );

  const applyHumanMove = useCallback(
    (move: Move) => {
      setGameState((prev) => {
        const legals = getLegalMoves(prev);
        const next = applyMove(prev, move);
        const cm = recordMove(move, legals);
        setHistory((h) => [...h, cm]);
        setSelected(-1);
        setLegalTargets([]);
        const st = getStatusText(next, false);
        setStatus(st);

        // Send over WebSocket if connected
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: "move",
              gameId: sessionId,
              moveId: cm.id,
              from: move.from,
              to: move.to,
              promotion: move.promotion,
            }),
          );
        }

        // Trigger AI for vs-ai modes (after state updates)
        if (
          (mode === "vs-ai-white" || mode === "vs-ai-black") &&
          !isGameOver(next)
        ) {
          setTimeout(() => triggerAI(next), 50);
        }

        return next;
      });
    },
    [mode, sessionId, getStatusText, recordMove, triggerAI],
  );

  const handleCellClick = (i: number) => {
    if (!isHumanTurn(gameState)) return;
    if (isGameOver(gameState)) return;

    const piece = gameState.board[i];

    if (selected < 0) {
      if (piece && piece[0] === gameState.turn) {
        setSelected(i);
        setLegalTargets(getLegalMovesFrom(gameState, i));
      }
      return;
    }

    if (i === selected) {
      setSelected(-1);
      setLegalTargets([]);
      return;
    }

    // Check if clicking own piece (re-select)
    if (piece && piece[0] === gameState.turn) {
      setSelected(i);
      setLegalTargets(getLegalMovesFrom(gameState, i));
      return;
    }

    // Check if this is a legal target
    const move = legalTargets.find((m) => m.to === i);
    if (!move) {
      setSelected(-1);
      setLegalTargets([]);
      return;
    }

    // Check for promotion (pawn reaching last rank)
    if (move.piece[1] === "p" && !move.promotion) {
      const promRank = gameState.turn === "w" ? 0 : 7;
      const toRank = Math.floor(move.to / 8);
      if (toRank === promRank) {
        setPromotion({ from: move.from, to: move.to, piece: move.piece });
        return;
      }
    }

    applyHumanMove(move);
  };

  const handlePromotion = (promPiece: string) => {
    if (!promotion) return;
    const move = legalTargets.find(
      (m) =>
        m.from === promotion.from &&
        m.to === promotion.to &&
        m.promotion === promPiece,
    );
    setPromotion(null);
    if (move) applyHumanMove(move);
  };

  const handleHint = () => {
    if (mode !== "hint" || isGameOver(gameState) || thinking) return;
    triggerAI(gameState);
  };

  const reset = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    const newState = makeInitialState();
    setGameState(newState);
    setSelected(-1);
    setLegalTargets([]);
    setHistory([]);
    setThinking(false);
    setStatus("White's turn");
    setPromotion(null);

    // If starting vs-ai-black, AI plays first as white
    if (mode === "vs-ai-black") {
      setTimeout(() => triggerAI(newState), 100);
    }
  };

  const changeMode = (m: ChessMode) => {
    setMode(m);
    workerRef.current?.terminate();
    workerRef.current = null;
    const newState = makeInitialState();
    setGameState(newState);
    setSelected(-1);
    setLegalTargets([]);
    setHistory([]);
    setThinking(false);
    setPromotion(null);
    setStatus("White's turn");
    // AI plays first if player is black
    if (m === "vs-ai-black") {
      setTimeout(() => triggerAI(newState), 100);
    }
  };

  const gStatus = getStatus(gameState);

  return (
    <div className="wg-game wg-chess-container">
      {/* Mode selector */}
      <div className="wg-chess-modes">
        {(Object.keys(MODE_LABELS) as ChessMode[]).map((m) => (
          <button
            key={m}
            className={`wg-btn wg-chess-mode-btn${mode === m ? " active" : ""}`}
            onClick={() => changeMode(m)}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Main layout: board + history */}
      <div className="wg-chess-layout">
        {/* Board */}
        <div className="wg-chess-board-wrap">
          <div className="wg-chess-board">
            {Array.from({ length: 64 }, (_, i) => {
              const r = Math.floor(i / 8),
                c = i % 8;
              const dark = (r + c) % 2 === 1;
              const isSel = i === selected;
              const isTarget = legalTargets.some((m) => m.to === i);
              const isCapture = isTarget && !!gameState.board[i];
              const isLastFrom =
                history.length > 0 && history[history.length - 1].from === i;
              const isLastTo =
                history.length > 0 && history[history.length - 1].to === i;

              let bg: string;
              if (isSel) bg = "#22D3EE";
              else if (isCapture) bg = "#F87171";
              else if (isLastFrom || isLastTo)
                bg = dark ? "#a8c18f" : "#cde6a0";
              else bg = dark ? "#90A7D0" : "#DCE8FF";

              return (
                <div
                  key={i}
                  className="wg-chess-cell"
                  style={{ background: bg, cursor: "pointer" }}
                  onClick={() => handleCellClick(i)}
                >
                  <span className="wg-piece">
                    {SYM[gameState.board[i]] ?? ""}
                  </span>
                  <span className="wg-sq-label">{squareName(i)}</span>
                  {isTarget && !isCapture && <span className="wg-dot" />}
                </div>
              );
            })}
          </div>

          {/* Promotion picker */}
          {promotion && (
            <div className="wg-chess-promotion">
              <span style={{ fontSize: 11, color: "#9fc0ea" }}>
                Promote to:
              </span>
              {["q", "r", "b", "n"].map((p) => (
                <button
                  key={p}
                  className="wg-btn"
                  style={{ fontSize: 20, padding: "2px 8px" }}
                  onClick={() => handlePromotion(gameState.turn + p)}
                >
                  {SYM[gameState.turn + p]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Move history panel */}
        <div className="wg-chess-history">
          <div className="wg-chess-history-header">
            <span>Move History</span>
            <span style={{ fontSize: 9, color: "#5d728f" }}>
              {sessionId.slice(-12)}
            </span>
          </div>
          <div className="wg-chess-history-list">
            {history.map((cm, idx) => {
              const lm: Move = {
                from: cm.from,
                to: cm.to,
                piece: cm.piece,
                ...(cm.promotion ? { promotion: cm.promotion } : {}),
              };
              const notation = moveToAlgebraic(lm, []);
              const isWhite = cm.piece[0] === "w";
              const moveNum = Math.floor(idx / 2) + 1;
              return (
                <div key={cm.id} className="wg-chess-history-item">
                  <span className="wg-chess-history-num">
                    {idx % 2 === 0 ? `${moveNum}.` : ""}
                  </span>
                  <span
                    className={`wg-chess-history-move${isWhite ? " white" : " black"}`}
                  >
                    {notation}
                  </span>
                  <span className="wg-chess-history-id" title={cm.id}>
                    {cm.id.slice(-10)}
                  </span>
                </div>
              );
            })}
            <div ref={historyEndRef} />
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="wg-status" style={{ gap: 8 }}>
        <span
          className="wg-chip"
          style={{
            background: gameState.turn === "w" ? "#F9FAFB" : "#111827",
            color: gameState.turn === "w" ? "#111827" : "#F9FAFB",
          }}
        >
          {gameState.turn === "w" ? "White" : "Black"}
        </span>
        <span style={{ flex: 1 }}>{status}</span>
        {thinking && <span style={{ fontSize: 11, color: "#f59e0b" }}>⏳</span>}
        {mode === "hint" && !thinking && gStatus === "playing" && (
          <button className="wg-btn" onClick={handleHint}>
            Get Hint
          </button>
        )}
        <button className="wg-btn" onClick={reset}>
          Reset
        </button>
      </div>

      {/* Online mode toggle */}
      <div className="wg-chess-online-bar">
        <label
          style={{
            fontSize: 11,
            color: "#9fc0ea",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <input
            type="checkbox"
            checked={showOnline}
            onChange={(e) => setShowOnline(e.target.checked)}
            style={{ accentColor: "#22D3EE" }}
          />
          Online
        </label>
        {showOnline && (
          <div
            style={{
              display: "flex",
              gap: 6,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <input
              type="text"
              value={online.url}
              onChange={(e) =>
                setOnline((o) => ({ ...o, url: e.target.value }))
              }
              placeholder="ws://localhost:3737"
              className="wg-chess-ws-input"
            />
            <select
              value={online.side}
              onChange={(e) =>
                setOnline((o) => ({ ...o, side: e.target.value as "w" | "b" }))
              }
              className="wg-btn"
              style={{ fontSize: 11 }}
            >
              <option value="w">White</option>
              <option value="b">Black</option>
            </select>
            <button
              className="wg-btn"
              onClick={() => {
                if (online.connected) {
                  wsRef.current?.close();
                  setOnline((o) => ({ ...o, connected: false }));
                } else {
                  connectWs(online.url, online.side, gameState);
                }
              }}
            >
              {online.connected ? "Disconnect" : "Connect"}
            </button>
            {online.connected && (
              <span style={{ fontSize: 10, color: "#34d399" }}>
                ● Connected
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
