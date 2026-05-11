/**
 * Chess AI web worker.
 * Import with: new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
 */
import { getBestMove } from "./engine";
import type { GameState } from "./engine";

self.onmessage = (
  e: MessageEvent<{ type: string; state: GameState; depth?: number }>,
) => {
  const { type, state, depth } = e.data;
  if (type === "getBestMove") {
    const move = getBestMove(state, depth ?? 4);
    self.postMessage({ type: "bestMove", move });
  }
};
