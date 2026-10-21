import { describe, expect, it } from "vitest";
import { toIndex, type Stone } from "../game/board";
import { newGame, pass, playMove, type GameState } from "../game/rules";
import { chooseMove, type AiLevel } from "./chooseMove";

const SIZE = 9;
const at = (x: number, y: number) => toIndex(SIZE, x, y);
const LEVELS: AiLevel[] = ["easy", "normal", "hard"];

/** 種を決めた乱数 (mulberry32)。テストの結果を毎回同じにする。 */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function setup(stones: Record<Stone, [number, number][]>, toPlay: Stone = "black"): GameState {
  const base = newGame(SIZE);
  const cells = [...base.board.cells];
  for (const color of ["black", "white"] as const) {
    for (const [x, y] of stones[color]) cells[at(x, y)] = color;
  }
  return { ...base, board: { size: SIZE, cells }, toPlay };
}

const options = { random: seeded(1), timeMs: 100 };

describe("AI", () => {
  it("HP 1 の相手の石は取る (ふつう / つよい)", () => {
    const state = setup({ black: [[3, 4], [5, 4], [4, 3]], white: [[4, 4]] });
    expect(chooseMove(state, "normal", options)).toBe(at(4, 5));
    expect(chooseMove(state, "hard", options)).toBe(at(4, 5));
  });

  it("HP 1 の味方は逃がす (ふつう)", () => {
    const state = setup({ black: [[4, 4]], white: [[3, 4], [5, 4], [4, 3]] });
    expect(chooseMove(state, "normal", options)).toBe(at(4, 5));
  });

  it("自分の目しか打つ所がなければパスする", () => {
    const cells = [...newGame(SIZE).board.cells];
    cells.fill("black");
    cells[at(0, 0)] = null;
    cells[at(8, 8)] = null;
    const state: GameState = { ...newGame(SIZE), board: { size: SIZE, cells } };
    for (const level of LEVELS) expect(chooseMove(state, level, options)).toBe("pass");
  });

  it("AI どうしで打ち続けても、打てない手を選ばない", () => {
    let state = newGame(SIZE);
    for (let turn = 0; turn < 60; turn++) {
      const move = chooseMove(state, LEVELS[turn % 3]!, { random: seeded(turn), timeMs: 20 });
      if (move === "pass") {
        state = pass(state);
        continue;
      }
      const result = playMove(state, move);
      expect(result.ok).toBe(true);
      if (result.ok) state = result.state;
    }
  });
});
