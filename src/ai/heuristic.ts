import { groupAt, neighbors, opponent, type Board, type Group, type Stone } from "../game/board";
import { playMove, type GameState } from "../game/rules";

export interface ScoredMove {
  readonly index: number;
  readonly score: number;
}

/** これより低い手 (自分の目をつぶす / 自分からアタリになる) は打たない。 */
export const BAD_MOVE = -5;

/** となりにある、別々のグループ。 */
function adjacentGroups(board: Board, index: number, color: Stone): Group[] {
  const seen = new Set<number>();
  const groups: Group[] = [];
  for (const next of neighbors(board.size, index)) {
    if (board.cells[next] !== color || seen.has(next)) continue;
    const group = groupAt(board, next)!;
    group.stones.forEach((stone) => seen.add(stone));
    groups.push(group);
  }
  return groups;
}

/** 打てる手それぞれを、1 手先の盤面だけを見て点数にする。大きいほど良い手。 */
export function scoreMoves(state: GameState): ScoredMove[] {
  const { size, cells } = state.board;
  const me = state.toPlay;
  const enemy = opponent(me);
  const stoneCount = cells.filter((cell) => cell !== null).length;
  const opening = stoneCount < (size * size) / 6;

  return cells.flatMap((cell, index) => {
    if (cell !== null) return [];
    const result = playMove(state, index);
    if (!result.ok) return [];
    const after = result.state;
    const near = neighbors(size, index);
    const captured = after.lastCaptured.length;
    const own = groupAt(after.board, index)!;
    const hp = own.liberties.length;
    let score = captured * 10;

    // 自分の目をつぶす手は、生きている石を自分で殺すことになる。
    if (captured === 0 && near.every((next) => cells[next] === me)) score -= 30;

    // HP 1 の味方を、HP 2 以上にして助ける。
    for (const group of adjacentGroups(state.board, index, me)) {
      if (group.liberties.length === 1 && hp >= 2) score += 8 * group.stones.length;
    }

    // 自分から HP 1 になる手は、すぐ取られる。
    if (hp === 1 && captured === 0) score -= 6 * own.stones.length;
    score += Math.min(hp, 4) * 0.5;

    // 相手の HP を減らす。HP 1 (アタリ) にできれば大きい。
    for (const group of adjacentGroups(after.board, index, enemy)) {
      const left = group.liberties.length;
      if (left === 1) score += 4 * group.stones.length;
      else if (left === 2) score += 1;
    }

    // 序盤は 3・4 線を好み、1・2 線を避ける。
    const x = index % size;
    const y = Math.floor(index / size);
    const line = Math.min(x, y, size - 1 - x, size - 1 - y);
    if (line === 0) score -= opening ? 4 : 2;
    else if (line === 1) score -= opening ? 1 : 0.5;
    else if (opening && line <= 3) score += 2;

    if (near.some((next) => cells[next] !== null)) score += 0.5;

    return [{ index, score }];
  });
}
