import type { GameState } from "../game/rules";
import { BAD_MOVE, scoreMoves } from "./heuristic";
import { monteCarlo } from "./montecarlo";

export type AiLevel = "easy" | "normal" | "hard";
export type AiMove = number | "pass";

export interface ChooseOptions {
  random?: () => number;
  /** つよいの考える時間 (ミリ秒)。 */
  timeMs?: number;
}

/** つよいで、モンテカルロ法にかける候補手の数。 */
const HARD_CANDIDATES = 10;

/**
 * - やさしい: 半分はでたらめ、半分は 1 手先の評価で打つ
 * - ふつう: 1 手先の評価で一番の手
 * - つよい: 1 手先の評価の上位を、モンテカルロ法で比べる
 */
export function chooseMove(
  state: GameState,
  level: AiLevel,
  { random = Math.random, timeMs = 1200 }: ChooseOptions = {},
): AiMove {
  const moves = scoreMoves(state).filter((move) => move.score > BAD_MOVE);
  if (moves.length === 0) return "pass";

  // 少し揺らして、同じ局面でも毎回同じ手にならないようにする。
  const ranked = (noise: number) =>
    moves
      .map((move) => ({ ...move, score: move.score + random() * noise }))
      .sort((a, b) => b.score - a.score);

  switch (level) {
    case "easy":
      return random() < 0.5 ? moves[Math.floor(random() * moves.length)]!.index : ranked(6)[0]!.index;
    case "normal":
      return ranked(1.5)[0]!.index;
    case "hard":
      return monteCarlo(state, ranked(1.5).slice(0, HARD_CANDIDATES), { random, timeMs });
  }
}
