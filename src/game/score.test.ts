import { describe, expect, it } from "vitest";
import { createBoard, toIndex, type Board, type Cell } from "./board";
import { KOMI, scoreArea } from "./score";

const SIZE = 9;

/** 列 x ごとに石の色を決めた盤 (null の列は空ける)。 */
function columns(colors: (Cell | "empty")[]): Board {
  const cells: Cell[] = [...createBoard(SIZE).cells];
  colors.forEach((color, x) => {
    for (let y = 0; y < SIZE; y++) cells[toIndex(SIZE, x, y)] = color === "empty" ? null : color;
  });
  return { size: SIZE, cells };
}

describe("終局の数え方 (石 + 地)", () => {
  it("1 色だけに囲まれた空点はその色の地、合計マスにコミを足して比べる", () => {
    // 列 0-3 は空 (黒の地)、列 4 は黒、列 5 は白、列 6-8 は空 (白の地)。
    const board = columns(["empty", "empty", "empty", "empty", "black", "white", "empty", "empty", "empty"]);
    const score = scoreArea(board);
    expect(score.stones).toEqual({ black: 9, white: 9 });
    expect(score.territory).toEqual({ black: 36, white: 27 });
    expect(score.area).toEqual({ black: 45, white: 36 });
    expect(score.winner).toBe("black");
    expect(score.margin).toBe(45 - 36 - KOMI);
  });

  it("両方の色に接する空点 (ダメ) はどちらの地でもない", () => {
    // 列 4 だけ空けて、両側を黒と白で埋める。
    const board = columns(["black", "black", "black", "black", "empty", "white", "white", "white", "white"]);
    const score = scoreArea(board);
    expect(score.territory).toEqual({ black: 0, white: 0 });
    expect(score.owner[toIndex(SIZE, 4, 0)]).toBeNull();
    expect(score.winner).toBe("white");
  });

  it("石のない盤は誰の地でもなく、コミで白の勝ち", () => {
    const score = scoreArea(createBoard(SIZE));
    expect(score.area).toEqual({ black: 0, white: 0 });
    expect(score.winner).toBe("white");
    expect(score.margin).toBe(KOMI);
  });

  it("死に石を渡すと、取り除いて相手の地として数える", () => {
    // 列 4 が黒、列 5 が白。白の地の中 (7, 4) に黒が 1 つ。
    const cells = [...columns(["empty", "empty", "empty", "empty", "black", "white", "empty", "empty", "empty"]).cells];
    cells[toIndex(SIZE, 7, 4)] = "black";
    const board = { size: SIZE, cells };
    const score = scoreArea(board, new Set([toIndex(SIZE, 7, 4)]));
    expect(score.dead).toEqual([toIndex(SIZE, 7, 4)]);
    expect(score.stones).toEqual({ black: 9, white: 9 });
    expect(score.territory).toEqual({ black: 36, white: 27 });
  });
});

