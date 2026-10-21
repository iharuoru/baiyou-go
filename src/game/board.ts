export type Stone = "black" | "white";
export type Cell = Stone | null;

/** 盤面。交点は y * size + x の index で表す。 */
export interface Board {
  readonly size: number;
  readonly cells: readonly Cell[];
}

/** となり合う同じ色の石のまとまり。呼吸点を共有する。 */
export interface Group {
  readonly color: Stone;
  readonly stones: readonly number[];
  /** 呼吸点 (となりの空いた交点)。この数がグループの HP になる。 */
  readonly liberties: readonly number[];
}

export function opponent(stone: Stone): Stone {
  return stone === "black" ? "white" : "black";
}

export function createBoard(size: number): Board {
  return { size, cells: Array<Cell>(size * size).fill(null) };
}

export function toIndex(size: number, x: number, y: number): number {
  return y * size + x;
}

/** 上下左右の交点。端や隅では数が減る (= 最大 HP が減る)。 */
export function neighbors(size: number, index: number): number[] {
  const x = index % size;
  const y = Math.floor(index / size);
  const result: number[] = [];
  if (x > 0) result.push(index - 1);
  if (x < size - 1) result.push(index + 1);
  if (y > 0) result.push(index - size);
  if (y < size - 1) result.push(index + size);
  return result;
}

export function groupAt(board: Board, index: number): Group | null {
  const color = board.cells[index];
  if (!color) return null;

  const stones = new Set<number>([index]);
  const liberties = new Set<number>();
  const stack = [index];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const next of neighbors(board.size, current)) {
      const cell = board.cells[next];
      if (cell === null) {
        liberties.add(next);
      } else if (cell === color && !stones.has(next)) {
        stones.add(next);
        stack.push(next);
      }
    }
  }
  return { color, stones: [...stones], liberties: [...liberties] };
}

export function allGroups(board: Board): Group[] {
  const seen = new Set<number>();
  const groups: Group[] = [];
  board.cells.forEach((cell, index) => {
    if (cell === null || seen.has(index)) return;
    const group = groupAt(board, index)!;
    group.stones.forEach((stone) => seen.add(stone));
    groups.push(group);
  });
  return groups;
}
