/**
 * Chess engine for @waldiez/games.
 * Pure TypeScript, zero dependencies beyond the project.
 * Board is a flat 64-element string array (index 0 = a8, index 63 = h1).
 * Piece strings: '' | 'wp' | 'wn' | 'wb' | 'wr' | 'wq' | 'wk'
 *                    | 'bp' | 'bn' | 'bb' | 'br' | 'bq' | 'bk'
 */

export interface CastlingRights {
  wk: boolean; // white king-side
  wq: boolean; // white queen-side
  bk: boolean; // black king-side
  bq: boolean; // black queen-side
}

export interface GameState {
  board: string[];
  turn: "w" | "b";
  castling: CastlingRights;
  enPassant: number | null; // target square index or null
  halfmove: number; // for 50-move rule
  fullmove: number;
}

export interface Move {
  from: number;
  to: number;
  piece: string;
  captured?: string;
  promotion?: string;
  castleSide?: "k" | "q";
  enPassantCapture?: number; // square of captured pawn
}

// ── Coordinate helpers ──────────────────────────────────────────────────────

export function rank(sq: number): number {
  return Math.floor(sq / 8);
}
export function file(sq: number): number {
  return sq % 8;
}
export function sq(r: number, f: number): number {
  return r * 8 + f;
}

export function squareName(index: number): string {
  return "abcdefgh"[file(index)] + String(8 - rank(index));
}

// ── Initial board ───────────────────────────────────────────────────────────

const BACK_ROW = ["r", "n", "b", "q", "k", "b", "n", "r"] as const;

export function makeInitialState(): GameState {
  const board = Array(64).fill("");
  for (let i = 0; i < 8; i++) {
    board[i] = `b${BACK_ROW[i]}`;
    board[8 + i] = "bp";
    board[48 + i] = "wp";
    board[56 + i] = `w${BACK_ROW[i]}`;
  }
  return {
    board,
    turn: "w",
    castling: { wk: true, wq: true, bk: true, bq: true },
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

// ── Move generation ─────────────────────────────────────────────────────────

function isOwnPiece(board: string[], sq: number, side: "w" | "b"): boolean {
  return board[sq] !== "" && board[sq][0] === side;
}

function isEnemy(board: string[], sq: number, side: "w" | "b"): boolean {
  const opp = side === "w" ? "b" : "w";
  return board[sq] !== "" && board[sq][0] === opp;
}

function isEmpty(board: string[], sq: number): boolean {
  return board[sq] === "";
}

/** Sliding piece ray generator */
function slide(
  board: string[],
  from: number,
  side: "w" | "b",
  drs: number[],
  dfs: number[],
): number[] {
  const targets: number[] = [];
  const r0 = rank(from),
    f0 = file(from);
  for (let d = 0; d < drs.length; d++) {
    let r = r0 + drs[d],
      f = f0 + dfs[d];
    while (r >= 0 && r < 8 && f >= 0 && f < 8) {
      const t = sq(r, f);
      if (isOwnPiece(board, t, side)) break;
      targets.push(t);
      if (isEnemy(board, t, side)) break;
      r += drs[d];
      f += dfs[d];
    }
  }
  return targets;
}

function pawnMoves(state: GameState, from: number): Move[] {
  const { board, turn, enPassant } = state;
  const moves: Move[] = [];
  const dir = turn === "w" ? -1 : 1;
  const startRank = turn === "w" ? 6 : 1;
  const promRank = turn === "w" ? 0 : 7;
  const r = rank(from),
    f = file(from);
  const piece = board[from];

  // Forward 1
  const r1 = r + dir;
  if (r1 >= 0 && r1 < 8) {
    const t1 = sq(r1, f);
    if (isEmpty(board, t1)) {
      if (r1 === promRank) {
        for (const p of ["q", "r", "b", "n"]) {
          moves.push({ from, to: t1, piece, promotion: turn + p });
        }
      } else {
        moves.push({ from, to: t1, piece });
      }
      // Forward 2 from start
      if (r === startRank) {
        const r2 = r + 2 * dir;
        const t2 = sq(r2, f);
        if (isEmpty(board, t2)) {
          moves.push({ from, to: t2, piece });
        }
      }
    }
    // Diagonal captures
    for (const df of [-1, 1]) {
      const fc = f + df;
      if (fc < 0 || fc >= 8) continue;
      const tc = sq(r1, fc);
      if (isEnemy(board, tc, turn)) {
        if (r1 === promRank) {
          for (const p of ["q", "r", "b", "n"]) {
            moves.push({
              from,
              to: tc,
              piece,
              captured: board[tc],
              promotion: turn + p,
            });
          }
        } else {
          moves.push({ from, to: tc, piece, captured: board[tc] });
        }
      } else if (enPassant !== null && tc === enPassant) {
        const epCap = sq(r, fc);
        moves.push({
          from,
          to: tc,
          piece,
          enPassantCapture: epCap,
          captured: board[epCap],
        });
      }
    }
  }
  return moves;
}

function knightMoves(board: string[], from: number, side: "w" | "b"): Move[] {
  const moves: Move[] = [];
  const r0 = rank(from),
    f0 = file(from);
  const offsets = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];
  const piece = board[from];
  for (const [dr, df] of offsets) {
    const r = r0 + dr,
      f = f0 + df;
    if (r < 0 || r >= 8 || f < 0 || f >= 8) continue;
    const t = sq(r, f);
    if (isOwnPiece(board, t, side)) continue;
    moves.push({
      from,
      to: t,
      piece,
      ...(board[t] ? { captured: board[t] } : {}),
    });
  }
  return moves;
}

function bishopMoves(board: string[], from: number, side: "w" | "b"): Move[] {
  const targets = slide(board, from, side, [-1, -1, 1, 1], [-1, 1, -1, 1]);
  const piece = board[from];
  return targets.map((t) => ({
    from,
    to: t,
    piece,
    ...(board[t] ? { captured: board[t] } : {}),
  }));
}

function rookMoves(board: string[], from: number, side: "w" | "b"): Move[] {
  const targets = slide(board, from, side, [-1, 0, 1, 0], [0, -1, 0, 1]);
  const piece = board[from];
  return targets.map((t) => ({
    from,
    to: t,
    piece,
    ...(board[t] ? { captured: board[t] } : {}),
  }));
}

function queenMoves(board: string[], from: number, side: "w" | "b"): Move[] {
  const targets = slide(
    board,
    from,
    side,
    [-1, -1, 1, 1, -1, 0, 1, 0],
    [-1, 1, -1, 1, 0, -1, 0, 1],
  );
  const piece = board[from];
  return targets.map((t) => ({
    from,
    to: t,
    piece,
    ...(board[t] ? { captured: board[t] } : {}),
  }));
}

function kingMoves(state: GameState, from: number, side: "w" | "b"): Move[] {
  const { board, castling } = state;
  const moves: Move[] = [];
  const r0 = rank(from),
    f0 = file(from);
  const piece = board[from];

  // Normal king moves
  for (const [dr, df] of [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]) {
    const r = r0 + dr,
      f = f0 + df;
    if (r < 0 || r >= 8 || f < 0 || f >= 8) continue;
    const t = sq(r, f);
    if (isOwnPiece(board, t, side)) continue;
    moves.push({
      from,
      to: t,
      piece,
      ...(board[t] ? { captured: board[t] } : {}),
    });
  }

  // Castling
  const kRow = side === "w" ? 7 : 0;
  if (from === sq(kRow, 4)) {
    // King-side
    if (side === "w" ? castling.wk : castling.bk) {
      const f5 = sq(kRow, 5),
        f6 = sq(kRow, 6);
      if (isEmpty(board, f5) && isEmpty(board, f6)) {
        if (
          !isSquareAttacked(board, from, side) &&
          !isSquareAttacked(board, f5, side) &&
          !isSquareAttacked(board, f6, side)
        ) {
          moves.push({ from, to: f6, piece, castleSide: "k" });
        }
      }
    }
    // Queen-side
    if (side === "w" ? castling.wq : castling.bq) {
      const f3 = sq(kRow, 3),
        f2 = sq(kRow, 2),
        f1 = sq(kRow, 1);
      if (isEmpty(board, f3) && isEmpty(board, f2) && isEmpty(board, f1)) {
        if (
          !isSquareAttacked(board, from, side) &&
          !isSquareAttacked(board, f3, side) &&
          !isSquareAttacked(board, f2, side)
        ) {
          moves.push({ from, to: f2, piece, castleSide: "q" });
        }
      }
    }
  }

  return moves;
}

/** Is square `sq` attacked by the opponent of `side`? */
export function isSquareAttacked(
  board: string[],
  square: number,
  side: "w" | "b",
): boolean {
  const opp = side === "w" ? "b" : "w";

  // Check pawn attacks
  const pawnDir = side === "w" ? -1 : 1; // pawns of opponent attack in opposite dir
  const r = rank(square),
    f = file(square);
  for (const df of [-1, 1]) {
    const pr = r - pawnDir,
      pf = f + df;
    if (pr >= 0 && pr < 8 && pf >= 0 && pf < 8) {
      const ps = sq(pr, pf);
      if (board[ps] === opp + "p") return true;
    }
  }

  // Knight
  for (const [dr, df] of [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ]) {
    const nr = r + dr,
      nf = f + df;
    if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
      if (board[sq(nr, nf)] === opp + "n") return true;
    }
  }

  // Bishop/Queen diagonals
  const diagDirs = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  for (const [dr, df] of diagDirs) {
    let cr = r + dr,
      cf = f + df;
    while (cr >= 0 && cr < 8 && cf >= 0 && cf < 8) {
      const cs = sq(cr, cf);
      if (board[cs]) {
        if (board[cs] === opp + "b" || board[cs] === opp + "q") return true;
        break;
      }
      cr += dr;
      cf += df;
    }
  }

  // Rook/Queen straights
  const straightDirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  for (const [dr, df] of straightDirs) {
    let cr = r + dr,
      cf = f + df;
    while (cr >= 0 && cr < 8 && cf >= 0 && cf < 8) {
      const cs = sq(cr, cf);
      if (board[cs]) {
        if (board[cs] === opp + "r" || board[cs] === opp + "q") return true;
        break;
      }
      cr += dr;
      cf += df;
    }
  }

  // King
  for (const [dr, df] of [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ]) {
    const kr = r + dr,
      kf = f + df;
    if (kr >= 0 && kr < 8 && kf >= 0 && kf < 8) {
      if (board[sq(kr, kf)] === opp + "k") return true;
    }
  }

  return false;
}

export function isInCheck(board: string[], side: "w" | "b"): boolean {
  const kingPiece = side + "k";
  const kingIdx = board.indexOf(kingPiece);
  if (kingIdx < 0) return true; // shouldn't happen
  return isSquareAttacked(board, kingIdx, side);
}

/** Generate pseudo-legal moves for one side */
function pseudoLegalMoves(state: GameState): Move[] {
  const { board, turn } = state;
  const moves: Move[] = [];
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p || p[0] !== turn) continue;
    const type = p[1];
    switch (type) {
      case "p":
        moves.push(...pawnMoves(state, i));
        break;
      case "n":
        moves.push(...knightMoves(board, i, turn));
        break;
      case "b":
        moves.push(...bishopMoves(board, i, turn));
        break;
      case "r":
        moves.push(...rookMoves(board, i, turn));
        break;
      case "q":
        moves.push(...queenMoves(board, i, turn));
        break;
      case "k":
        moves.push(...kingMoves(state, i, turn));
        break;
    }
  }
  return moves;
}

/** Apply a move and return new board (no state mutation) */
export function applyMove(state: GameState, move: Move): GameState {
  const board = [...state.board];
  const { from, to, piece, promotion, castleSide, enPassantCapture } = move;
  const side = state.turn;
  const opp = side === "w" ? "b" : "w";

  board[to] = promotion ?? piece;
  board[from] = "";

  // En passant capture
  if (enPassantCapture !== undefined) {
    board[enPassantCapture] = "";
  }

  // Castling: move the rook
  if (castleSide) {
    const kRow = side === "w" ? 7 : 0;
    if (castleSide === "k") {
      board[sq(kRow, 5)] = board[sq(kRow, 7)];
      board[sq(kRow, 7)] = "";
    } else {
      board[sq(kRow, 3)] = board[sq(kRow, 0)];
      board[sq(kRow, 0)] = "";
    }
  }

  // Update castling rights
  const castling = { ...state.castling };
  if (piece === "wk") {
    castling.wk = false;
    castling.wq = false;
  }
  if (piece === "bk") {
    castling.bk = false;
    castling.bq = false;
  }
  if (from === 56 || to === 56) castling.wq = false;
  if (from === 63 || to === 63) castling.wk = false;
  if (from === 0 || to === 0) castling.bq = false;
  if (from === 7 || to === 7) castling.bk = false;

  // En passant square for next move (double pawn push)
  let enPassant: number | null = null;
  if (piece[1] === "p" && Math.abs(rank(to) - rank(from)) === 2) {
    enPassant = sq((rank(from) + rank(to)) / 2, file(from));
  }

  const halfmove = piece[1] === "p" || move.captured ? 0 : state.halfmove + 1;

  return {
    board,
    turn: opp,
    castling,
    enPassant,
    halfmove,
    fullmove: side === "b" ? state.fullmove + 1 : state.fullmove,
  };
}

/** Return only legal moves (no moves that leave own king in check) */
export function getLegalMoves(state: GameState): Move[] {
  return pseudoLegalMoves(state).filter((move) => {
    const next = applyMove(state, move);
    return !isInCheck(next.board, state.turn);
  });
}

export function getLegalMovesFrom(state: GameState, from: number): Move[] {
  return getLegalMoves(state).filter((m) => m.from === from);
}

// ── Game Status ─────────────────────────────────────────────────────────────

export type GameStatus = "playing" | "checkmate" | "stalemate" | "draw";

export function getStatus(state: GameState): GameStatus {
  if (state.halfmove >= 100) return "draw"; // 50-move rule (100 half-moves)
  const legal = getLegalMoves(state);
  if (legal.length > 0) return "playing";
  if (isInCheck(state.board, state.turn)) return "checkmate";
  return "stalemate";
}

// ── Evaluation ──────────────────────────────────────────────────────────────

const PIECE_VALUE: Record<string, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables (white perspective; flip rank for black)
// Indexed by rank 0-7 (0=rank8 ... 7=rank1), file 0-7
const PST: Record<string, number[]> = {
  // Pawns: incentivise advancing and centre control
  p: [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30,
    20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5,
    -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0,
    0,
  ],
  n: [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30,
    0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20,
    20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20,
    -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ],
  b: [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0,
    5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10,
    0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20,
    -10, -10, -10, -10, -10, -10, -20,
  ],
  r: [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0,
    -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
    0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ],
  q: [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5,
    5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5,
    5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
    -10, -20,
  ],
  k: [
    -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40,
    -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40,
    -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20,
    -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ],
};

function pstScore(piece: string, index: number): number {
  const side = piece[0] as "w" | "b";
  const type = piece[1];
  const table = PST[type];
  if (!table) return 0;
  // White: use index directly; Black: flip rank
  const tableIdx = side === "w" ? index : (7 - rank(index)) * 8 + file(index);
  return table[tableIdx] ?? 0;
}

export function evaluate(state: GameState): number {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = state.board[i];
    if (!p) continue;
    const val = PIECE_VALUE[p[1]] ?? 0;
    const pst = pstScore(p, i);
    if (p[0] === "w") {
      score += val + pst;
    } else {
      score -= val + pst;
    }
  }
  return score;
}

// ── Move ordering ───────────────────────────────────────────────────────────

function mvvLva(move: Move): number {
  if (!move.captured) return 0;
  const attacker = PIECE_VALUE[move.piece[1]] ?? 0;
  const victim = PIECE_VALUE[move.captured[1]] ?? 0;
  return victim * 10 - attacker;
}

function orderMoves(moves: Move[]): Move[] {
  return [...moves].sort((a, b) => mvvLva(b) - mvvLva(a));
}

// ── Minimax with alpha-beta ─────────────────────────────────────────────────

function minimax(
  state: GameState,
  depth: number,
  alpha: number,
  beta: number,
  maximising: boolean,
): number {
  if (depth === 0) return evaluate(state);

  const status = getStatus(state);
  if (status === "checkmate") return maximising ? -Infinity : Infinity;
  if (status === "stalemate" || status === "draw") return 0;

  const moves = orderMoves(getLegalMoves(state));

  if (maximising) {
    let best = -Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const val = minimax(next, depth - 1, alpha, beta, false);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break; // pruning
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      const next = applyMove(state, move);
      const val = minimax(next, depth - 1, alpha, beta, true);
      if (val < best) best = val;
      if (val < beta) beta = val;
      if (beta <= alpha) break; // pruning
    }
    return best;
  }
}

/** Find the best move for the current player. Returns null if no legal moves. */
export function getBestMove(state: GameState, depth = 4): Move | null {
  const moves = orderMoves(getLegalMoves(state));
  if (moves.length === 0) return null;

  const maximising = state.turn === "w";
  let bestMove = moves[0];
  let bestVal = maximising ? -Infinity : Infinity;

  for (const move of moves) {
    const next = applyMove(state, move);
    const val = minimax(next, depth - 1, -Infinity, Infinity, !maximising);
    if (maximising ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestMove = move;
    }
  }
  return bestMove;
}

/** Move to algebraic notation (short form) */
export function moveToAlgebraic(move: Move, legalMoves: Move[]): string {
  const piece = move.piece[1].toUpperCase();
  const to = squareName(move.to);

  if (move.castleSide === "k") return "O-O";
  if (move.castleSide === "q") return "O-O-O";

  if (move.piece[1] === "p") {
    if (move.captured || move.enPassantCapture !== undefined) {
      const fromFile = "abcdefgh"[file(move.from)];
      const cap = `${fromFile}x${to}`;
      return move.promotion ? cap + "=" + move.promotion[1].toUpperCase() : cap;
    }
    return move.promotion ? to + "=" + move.promotion[1].toUpperCase() : to;
  }

  // Disambiguation
  const ambiguous = legalMoves.filter(
    (m) => m !== move && m.piece === move.piece && m.to === move.to,
  );
  let dis = "";
  if (ambiguous.length > 0) {
    const sameFile = ambiguous.some((m) => file(m.from) === file(move.from));
    const sameRank = ambiguous.some((m) => rank(m.from) === rank(move.from));
    if (!sameFile) dis = "abcdefgh"[file(move.from)];
    else if (!sameRank) dis = String(8 - rank(move.from));
    else dis = squareName(move.from);
  }

  const cap = move.captured ? "x" : "";
  return `${piece}${dis}${cap}${to}`;
}
