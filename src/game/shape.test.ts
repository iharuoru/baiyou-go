import { describe, expect, it } from "vitest";
import { createBoard, toIndex, type Board, type Stone } from "./board";
import { deadStones, diagonalLinks, eyeStatuses, fights, sealedLiberties } from "./shape";

const SIZE = 9;
const at = (x: number, y: number) => toIndex(SIZE, x, y);

/** 石の位置を色ごとに並べた盤。 */
function boardWith(stones: Partial<Record<Stone, [number, number][]>>): Board {
  const cells = [...createBoard(SIZE).cells];
  (Object.entries(stones) as [Stone, [number, number][]][]).forEach(([color, points]) =>
    points.forEach(([x, y]) => (cells[at(x, y)] = color)),
  );
  return { size: SIZE, cells };
}

describe("眼の状態", () => {
  // 黒が (4, 4) を上下左右から囲んだ眼。
  const around: [number, number][] = [
    [4, 3],
    [3, 4],
    [5, 4],
    [4, 5],
  ];
  const eye = new Map([[at(4, 4), "black" as const]]);
  const statusOf = (stones: Partial<Record<Stone, [number, number][]>>) =>
    eyeStatuses(boardWith(stones), eye).get(at(4, 4));
  const diagonals: [number, number][] = [
    [3, 3],
    [5, 3],
    [3, 5],
    [5, 5],
  ];

  it("盤の中: 斜めに相手の石が 2 つで欠け目、相手と空きを合わせて 2 つ以上なら未確定、1 つ以下なら本当の眼", () => {
    expect(statusOf({ black: [...around, ...diagonals.slice(0, 3)] })).toBe("real");
    expect(statusOf({ black: [...around, ...diagonals.slice(0, 2)] })).toBe("unsettled");
    expect(statusOf({ black: [...around, ...diagonals.slice(0, 2)], white: [[5, 5]] })).toBe("unsettled");
    expect(statusOf({ black: [...around], white: [[3, 3], [5, 5]] })).toBe("false");
  });

  it("端: 斜めに相手の石が 1 つで欠け目、空きが 1 つでもあれば未確定", () => {
    const edge = new Map([[at(4, 0), "black" as const]]);
    const black: [number, number][] = [
      [3, 0],
      [5, 0],
      [4, 1],
    ];
    const statusAtEdge = (stones: Partial<Record<Stone, [number, number][]>>) =>
      eyeStatuses(boardWith(stones), edge).get(at(4, 0));
    expect(statusAtEdge({ black: [...black, [3, 1], [5, 1]] })).toBe("real");
    expect(statusAtEdge({ black: [...black, [3, 1]] })).toBe("unsettled");
    expect(statusAtEdge({ black, white: [[3, 1]] })).toBe("false");
  });
});

describe("斜めの連絡と切断点", () => {
  it("間の 2 つが空いていれば連絡", () => {
    expect(diagonalLinks(boardWith({ black: [[2, 2], [3, 3]] }))).toEqual([
      { a: at(2, 2), b: at(3, 3), color: "black", cut: null },
    ]);
  });

  it("間の一方に相手の石があれば、もう一方が切断点", () => {
    expect(diagonalLinks(boardWith({ black: [[2, 2], [3, 3]], white: [[3, 2]] }))).toEqual([
      { a: at(2, 2), b: at(3, 3), color: "black", cut: at(2, 3) },
    ]);
  });

  it("間に相手の石が 2 つ (切れている) か、すでにつながっていれば出さない", () => {
    expect(diagonalLinks(boardWith({ black: [[2, 2], [3, 3]], white: [[3, 2], [2, 3]] }))).toEqual([]);
    expect(diagonalLinks(boardWith({ black: [[2, 2], [3, 3], [3, 2]] }))).toEqual([]);
  });
});

describe("攻め合いとセキ", () => {
  it("となり合って呼吸点を共有する、眼のない少ない HP のグループどうしは攻め合い。HP の多い方が先に取れる", () => {
    // 黒 (列 0) は HP 1、白 (列 1) は HP 2 で、(0, 3) を共有する。列 2 の黒は白の外側を塞ぐ別のグループ。
    const board = boardWith({
      black: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2], [2, 3]],
      white: [[1, 0], [1, 1], [1, 2], [1, 3]],
    });
    const { semeais, sekis } = fights(board);
    expect(sekis).toEqual([]);
    expect(semeais.map(({ shared, leader }) => ({ shared, leader }))).toEqual([{ shared: [at(0, 3)], leader: "white" }]);
  });

  it("共有する 2 つの呼吸点のほかに呼吸点がなく、どちらが打っても打った側が取られる形はセキ", () => {
    // 5 路: 黒が列 0 と (1, 0), (1, 2), (1, 4)、白が列 2、白の外側を列 3 の黒が塞ぐ。(1, 1) と (1, 3) を共有する。
    const cells = [...createBoard(5).cells];
    const put = (color: Stone, points: [number, number][]) =>
      points.forEach(([x, y]) => (cells[toIndex(5, x, y)] = color));
    put("black", [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 0], [1, 2], [1, 4], [3, 0], [3, 1], [3, 2], [3, 3], [3, 4]]);
    put("white", [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]]);
    const { semeais, sekis } = fights({ size: 5, cells });
    expect(semeais).toEqual([]);
    expect(sekis.map(({ shared }) => [...shared].sort((a, b) => a - b))).toEqual([[toIndex(5, 1, 1), toIndex(5, 1, 3)]]);
  });
});

describe("終局の死に石", () => {
  it("相手の地の中に取り残された石は死、自分の地を持つ石は生き", () => {
    // 白は列 5 から右を広く囲み、その中 (7, 4) に黒が 1 つ。黒は列 3 で左を広く囲む。
    const board = boardWith({
      black: [[3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6], [3, 7], [3, 8], [7, 4]],
      white: [[5, 0], [5, 1], [5, 2], [5, 3], [5, 4], [5, 5], [5, 6], [5, 7], [5, 8]],
    });
    expect([...deadStones(board)]).toEqual([at(7, 4)]);
  });

  it("セキのグループは、相手の勢力の中でも両方とも生き", () => {
    // 5 路: 黒の列 0 と白の列 2 が (1, 1) と (1, 3) を共有するセキ (攻め合いとセキのテストと同じ形)。
    const cells = [...createBoard(5).cells];
    const put = (color: Stone, points: [number, number][]) =>
      points.forEach(([x, y]) => (cells[toIndex(5, x, y)] = color));
    put("black", [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [1, 0], [1, 2], [1, 4], [3, 0], [3, 1], [3, 2], [3, 3], [3, 4]]);
    put("white", [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]]);
    expect(deadStones({ size: 5, cells }).size).toBe(0);
  });

  it("二眼のグループは、相手の勢力の中でも生き", () => {
    // 白の陣地の中で、黒が (6, 2) と (6, 4) の 2 つの眼を作っている。
    const black: [number, number][] = [
      [5, 1], [6, 1], [7, 1], [5, 2], [7, 2], [5, 3], [6, 3], [7, 3], [5, 4], [7, 4], [5, 5], [6, 5], [7, 5],
    ];
    const white: [number, number][] = [
      [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [4, 1], [8, 1], [4, 2], [8, 2], [4, 3], [8, 3], [4, 4], [8, 4], [4, 5], [8, 5],
      [4, 6], [5, 6], [6, 6], [7, 6], [8, 6],
    ];
    expect(deadStones(boardWith({ black, white })).size).toBe(0);
  });
});

describe("結界 (眼)", () => {
  it("となりがすべて自分の石なら眼、となりに相手の息の詰まった石があれば眼ではない", () => {
    // 白が (4, 4) を上と左右から囲み、下 (4, 5) に黒。黒は (4, 4) のほかに息の通り道がない。
    const white: [number, number][] = [
      [3, 3], [4, 3], [5, 3], [3, 4], [5, 4], [3, 5], [5, 5], [4, 6],
    ];
    const board = boardWith({ white, black: [[4, 5]] });
    expect(sealedLiberties(board).has(at(4, 4))).toBe(false);
    const eye = boardWith({ white: [...white, [4, 5]] });
    expect(sealedLiberties(eye).get(at(4, 4))).toBe("white");
  });
});
