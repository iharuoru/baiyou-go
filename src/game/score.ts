import { neighbors, type Board, type Stone } from "./board";

/** 後手 (白) に足す点 (コミ)。先手の有利を補う。中国ルールの 7.5 目。半端にして引き分けをなくす。 */
export const KOMI = 7.5;

/**
 * 終局時の数え方 (中国ルール): 石の数 + 1 色の石だけに囲まれた空点 (地)。
 * 死に石 (dead) を渡すと、その石を取り除いた盤で数える (取り除いた点は、囲んでいる相手の地になる)。
 */
export interface AreaScore {
  /** 取り除いた死に石の位置。 */
  readonly dead: readonly number[];
  /** 交点ごとの持ち主。石はその色。空点は 1 色だけに接する領域ならその色、両方に接する / どちらにも接しないなら null。 */
  readonly owner: readonly (Stone | null)[];
  readonly stones: Readonly<Record<Stone, number>>;
  readonly territory: Readonly<Record<Stone, number>>;
  /** 合計マス (石 + 地)。コミは含まない。 */
  readonly area: Readonly<Record<Stone, number>>;
  readonly winner: Stone;
  /** 勝った側の差 (コミ込み)。 */
  readonly margin: number;
}

export function scoreArea(board: Board, dead: ReadonlySet<number> = new Set()): AreaScore {
  const size = board.size;
  const cells = board.cells.map((cell, index) => (dead.has(index) ? null : cell));
  const owner: (Stone | null)[] = [...cells];
  const seen = new Set<number>();

  cells.forEach((cell, start) => {
    if (cell !== null || seen.has(start)) return;
    // つながった空点の領域と、それに接する石の色を調べる。
    const region = [start];
    const touches = new Set<Stone>();
    seen.add(start);
    for (let i = 0; i < region.length; i++) {
      for (const next of neighbors(size, region[i]!)) {
        const color = cells[next];
        if (color) touches.add(color);
        else if (!seen.has(next)) {
          seen.add(next);
          region.push(next);
        }
      }
    }
    if (touches.size === 1) {
      const [color] = touches;
      region.forEach((index) => (owner[index] = color!));
    }
  });

  const count = (values: readonly (Stone | null)[], color: Stone) => values.filter((v) => v === color).length;
  const stones = { black: count(cells, "black"), white: count(cells, "white") };
  const area = { black: count(owner, "black"), white: count(owner, "white") };
  const territory = { black: area.black - stones.black, white: area.white - stones.white };
  const diff = area.black - (area.white + KOMI);
  return {
    dead: [...dead],
    owner,
    stones,
    territory,
    area,
    winner: diff > 0 ? "black" : "white",
    margin: Math.abs(diff),
  };
}
