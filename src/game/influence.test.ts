import { describe, expect, it } from "vitest";
import { createBoard, toIndex, type Board, type Stone } from "./board";
import { influence, INFLUENCE_RANGE } from "./influence";
import { KOMI } from "./score";

const SIZE = 9;
const at = (x: number, y: number) => toIndex(SIZE, x, y);

function boardWith(stones: Partial<Record<Stone, [number, number][]>>): Board {
  const cells = [...createBoard(SIZE).cells];
  (Object.entries(stones) as [Stone, [number, number][]][]).forEach(([color, points]) =>
    points.forEach(([x, y]) => (cells[at(x, y)] = color)),
  );
  return { size: SIZE, cells };
}

describe("勢力", () => {
  it("石のない盤では、どこも誰の勢力でもなく、白はコミだけ", () => {
    const result = influence(createBoard(SIZE));
    expect(result.owner.every((owner) => owner === null)).toBe(true);
    expect(result.total).toEqual({ black: 0, white: KOMI });
  });

  it("石のまわりはその色の勢力で、届く距離より遠い所は誰のものでもない", () => {
    const result = influence(boardWith({ black: [[4, 4]] }));
    expect(result.owner[at(4, 3)]).toBe("black");
    expect(result.owner[at(5, 5)]).toBe("black");
    expect(result.owner[at(4, 4 - INFLUENCE_RANGE)]).toBeNull();
    expect(result.owner[at(4, 4)]).toBeNull();
  });

  it("黒と白から同じ距離の所は打ち消し合って、誰のものでもない", () => {
    const result = influence(boardWith({ black: [[2, 4]], white: [[6, 4]] }));
    expect(result.owner[at(4, 4)]).toBeNull();
    expect(result.owner[at(3, 4)]).toBe("black");
    expect(result.owner[at(5, 4)]).toBe("white");
  });

  it("影響は石を越えないので、囲まれた内側には外の石から届かない", () => {
    // 黒が (0, 0) の隅を (1, 0), (0, 1) で囲み、すぐ外に白がいる。
    const result = influence(boardWith({ black: [[1, 0], [0, 1]], white: [[2, 1], [1, 2]] }));
    expect(result.value[at(0, 0)]).toBeGreaterThan(0);
    expect(result.owner[at(0, 0)]).toBe("black");
  });
});
