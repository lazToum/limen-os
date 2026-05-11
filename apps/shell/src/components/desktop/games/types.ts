export type GameId =
  | "snake"
  | "pong"
  | "chess"
  | "bubble-shooter"
  | "pool"
  | "bowling";

export type ChessMode = "2p" | "vs-ai-white" | "vs-ai-black" | "hint";

export interface GameSession {
  /** HLC-WID session identifier */
  id: string;
  /** HLC-WID start timestamp */
  startedAt: string;
  game: GameId;
}

export interface ChessMove {
  /** HLC-WID move identifier */
  id: string;
  from: number;
  to: number;
  piece: string;
  promotion?: string;
  /** HLC-WID timestamp */
  timestamp: string;
}

export interface GameMeta {
  id: GameId;
  label: string;
  description: string;
}

export const GAME_META: Record<GameId, GameMeta> = {
  snake: {
    id: "snake",
    label: "Snake",
    description: "Classic snake on a 10×10 grid",
  },
  pong: {
    id: "pong",
    label: "Pong",
    description: "Ball-and-paddle arcade game, solo vs AI or 2P local",
  },
  chess: {
    id: "chess",
    label: "Chess",
    description: "Two-player chess with piece highlights",
  },
  "bubble-shooter": {
    id: "bubble-shooter",
    label: "Bubble Shooter",
    description: "Aim and pop colour-matched bubble clusters",
  },
  pool: {
    id: "pool",
    label: "Pool",
    description: "8-ball billiards with realistic ball physics",
  },
  bowling: {
    id: "bowling",
    label: "Bowling",
    description: "Top-down 10-pin bowling with frame scoring",
  },
};
