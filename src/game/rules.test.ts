import { describe, expect, it } from "vitest";
import { groupAt, toIndex, type Stone } from "./board";
import { inspectPoint, isGameOver, newGame, pass, playMove, type GameState } from "./rules";

const SIZE = 9;
const at = (x: number, y: number) => toIndex(SIZE, x, y);

/** 指定した石を置いた局面を作る (手番は toPlay)。 */
function setup(stones: Record<Stone, [number, number][]>, toPlay: Stone = "black"): GameState {
  const base = newGame(SIZE);
  const cells = [...base.board.cells];
  for (const color of ["black", "white"] as const) {
    for (const [x, y] of stones[color]) cells[at(x, y)] = color;
  }
  return { ...base, board: { size: SIZE, cells }, toPlay };
}

function mustPlay(state: GameState, x: number, y: number): GameState {
  const result = playMove(state, at(x, y));
  if (!result.ok) throw new Error(`illegal: ${result.reason}`);
  return result.state;
}

describe("HP (呼吸点の数)", () => {
  it("中央は 4、辺は 3、隅は 2", () => {
    const state = setup({ black: [[4, 4], [0, 4], [0, 0]], white: [] });
    expect(groupAt(state.board, at(4, 4))!.liberties).toHaveLength(4);
    expect(groupAt(state.board, at(0, 4))!.liberties).toHaveLength(3);
    expect(groupAt(state.board, at(0, 0))!.liberties).toHaveLength(2);
  });

  it("となり合う味方は合体して呼吸点を共有する (L 字の 3 子で HP 7)", () => {
    const state = setup({ black: [[2, 2], [2, 3], [3, 3]], white: [] });
    const group = groupAt(state.board, at(2, 2))!;
    expect(group.stones).toHaveLength(3);
    expect(group.liberties).toHaveLength(7);
  });
});

describe("取る / 打てない", () => {
  it("呼吸点を全部ふさがれると取られる", () => {
    const state = setup({ black: [[4, 3], [5, 4], [4, 5]], white: [[4, 4]] });
    const next = mustPlay(state, 3, 4);
    expect(next.board.cells[at(4, 4)]).toBeNull();
    expect(next.captures.black).toBe(1);
  });

  it("呼吸点のない所には打てない", () => {
    const state = setup({ black: [], white: [[4, 3], [3, 4], [5, 4], [4, 5]] });
    expect(playMove(state, at(4, 4))).toEqual({ ok: false, reason: "suicide" });
  });

  it("ただし、殺られる前に殺れる (相手 HP 1 x 4 体をまとめて取る)", () => {
    const state = setup({
      black: [[4, 2], [3, 3], [5, 3], [2, 4], [6, 4], [3, 5], [5, 5], [4, 6]],
      white: [[4, 3], [3, 4], [5, 4], [4, 5]],
    });
    const next = mustPlay(state, 4, 4);
    expect(next.captures.black).toBe(4);
    expect(groupAt(next.board, at(4, 4))!.liberties).toHaveLength(4);
  });

  it("コウはすぐに取り返せない", () => {
    const state = setup({
      black: [[3, 4], [4, 3], [4, 5]],
      white: [[5, 3], [6, 4], [5, 5], [4, 4]],
    });
    const next = mustPlay(state, 5, 4);
    expect(next.board.cells[at(4, 4)]).toBeNull();
    expect(playMove(next, at(4, 4))).toEqual({ ok: false, reason: "ko" });
  });
});

describe("同形反復の禁止 (中国ルール)", () => {
  it("これまでに出た盤の配置に戻る手は打てない", () => {
    // 空の盤から (4, 4) に打った配置を、すでに出た配置として持つ局面では、(4, 4) に打てない。
    const start = newGame(SIZE);
    const after = mustPlay(start, 4, 4);
    expect(playMove({ ...start, positions: after.positions }, at(4, 4))).toEqual({ ok: false, reason: "repeat" });
  });

  it("打つたびに配置を覚え、見送りでは増えない", () => {
    const state = mustPlay(mustPlay(newGame(SIZE), 4, 4), 3, 3);
    expect(state.positions.size).toBe(3);
    expect(pass(state).positions.size).toBe(3);
  });
});

describe("inspectPoint", () => {
  it("打つ前に、自分の HP と取れる石を教える", () => {
    const state = setup({ black: [[4, 3], [5, 4], [4, 5]], white: [[4, 4]] });
    const info = inspectPoint(state, at(3, 4));
    expect(info.kind).toBe("move");
    if (info.kind !== "move") return;
    expect(info.captured).toEqual([at(4, 4)]);
    expect(info.group.liberties).toHaveLength(4);
  });
});

it("2 手続けてパスすると終局", () => {
  const state = pass(pass(newGame(SIZE)));
  expect(isGameOver(state)).toBe(true);
  expect(playMove(state, at(0, 0))).toEqual({ ok: false, reason: "gameOver" });
});
