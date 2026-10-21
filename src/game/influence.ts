// 勢力: 対局中の陣地の見込み。各石から、空いた交点をたどって影響を広げ、黒と白の影響の差で空点の持ち主を見込む。
// 石は越えないので、囲まれた内側には外から届かない。終局の数え方 (score.ts) と同じく、石 + 見込みの地で合計を出す。

import { neighbors, type Board, type Stone } from "./board";
import { KOMI } from "./score";

/** 影響が届く距離 (空点をたどる手数)。 */
export const INFLUENCE_RANGE = 4;
/** 空点をその色の勢力とみなす、影響の差の下限。 */
export const INFLUENCE_THRESHOLD = 0.45;

/** 石からの距離ごとの影響。距離 1 で 1、そこから 1 マスごとに半分。 */
const weight = (distance: number) => 2 ** (1 - distance);

export interface Influence {
  /** 交点ごとの影響 (黒が正、白が負)。石のある交点は 0。 */
  value: number[];
  /** 空点ごとに見込まれる持ち主。勢力の弱い空点と石のある交点は null。 */
  owner: (Stone | null)[];
  /** 見込みの合計 (石 + 勢力の空点)。白にはコミを足す。 */
  total: Record<Stone, number>;
}

export function influence(board: Board): Influence {
  const { size, cells } = board;
  const value = cells.map(() => 0);
  cells.forEach((color, stone) => {
    if (color === null) return;
    const sign = color === "black" ? 1 : -1;
    // 石から空点だけをたどる幅優先探索で、距離ごとに影響を足す。
    const distance = new Map<number, number>([[stone, 0]]);
    const queue = [stone];
    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]!;
      const d = distance.get(current)!;
      if (d >= INFLUENCE_RANGE) continue;
      for (const next of neighbors(size, current)) {
        if (cells[next] !== null || distance.has(next)) continue;
        distance.set(next, d + 1);
        value[next]! += sign * weight(d + 1);
        queue.push(next);
      }
    }
  });
  const owner = value.map((v, index): Stone | null =>
    cells[index] !== null || Math.abs(v) < INFLUENCE_THRESHOLD ? null : v > 0 ? "black" : "white",
  );
  const count = (color: Stone) =>
    cells.filter((cell) => cell === color).length + owner.filter((o) => o === color).length;
  return { value, owner, total: { black: count("black"), white: count("white") + KOMI } };
}
