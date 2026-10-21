// 石の形の読み: 結界 (眼)、眼の状態 (本当の眼 / 未確定 / 欠け目)、斜めにならんだ石の連絡と切断点、攻め合いとセキ。
// 画面のヒント (結界の網、触覚の動き) に使う。

import { allGroups, groupAt, neighbors, opponent, toIndex, type Board, type Group, type Stone } from "./board";
import { influence } from "./influence";
import { playMove, positionKey, type GameState } from "./rules";

/** 攻め合いとみなすグループの HP (呼吸点の数) の上限。これより多いと、まだ急ぐ戦いではないとみなす。 */
export const SEMEAI_MAX_HP = 4;

/** board の上で color が打つ時の局面 (コウ・同形反復・アゲハマは考えない)。 */
function stateFor(board: Board, color: Stone): GameState {
  return {
    board,
    toPlay: color,
    captures: { black: 0, white: 0 },
    koPoint: null,
    positions: new Set([positionKey(board)]),
    consecutivePasses: 0,
    lastMove: null,
    lastCaptured: [],
  };
}

/**
 * 結界: となりがすべて自分の石 (または盤の外) で、相手がそこに打つと自殺手になって打てない (= 敵に取られない) 呼吸点と、
 * その持ち主の色。囲碁の「眼」。相手が打つとこちらを取れる (= 打てる) 所と、となりに相手の石がある所は含まない
 * (相手の息の詰まった石がとなりにあると、相手はそこに打てないが、まだ眼ではなく、こちらが打てばその石を取れる所)。
 */
export function sealedLiberties(board: Board): Map<number, Stone> {
  const sealed = new Map<number, Stone>();
  allGroups(board).forEach((group) =>
    group.liberties.forEach((liberty) => {
      if (sealed.has(liberty)) return;
      // となりに相手の石がある点は眼ではない (その石が息の詰まった石なら、こちらが打てば取れる所)。
      if (neighbors(board.size, liberty).some((next) => board.cells[next] !== group.color)) return;
      const attempt = playMove(stateFor(board, opponent(group.color)), liberty);
      if (!attempt.ok && attempt.reason === "suicide") sealed.set(liberty, group.color);
    }),
  );
  return sealed;
}

/**
 * 眼の状態。斜めの交点のうち相手の石がある数で決める。盤の中では 2 つ以上、端・隅 (斜めが盤の外にかかる) では 1 つ以上で欠け目。
 * - real: 本当の眼に決まっている。空いている斜めにすべて相手が打っても欠け目にならない
 * - unsettled: まだ決まっていない。空いている斜めに相手が打つと欠け目になりうる
 * - false: 欠け目。眼に見えても、本当の眼にならない
 */
export type EyeStatus = "real" | "unsettled" | "false";

/** 眼ごとの状態。eyes は眼 (相手が打てない呼吸点) の位置と、その眼を囲む色。 */
export function eyeStatuses(board: Board, eyes: ReadonlyMap<number, Stone>): Map<number, EyeStatus> {
  const { size, cells } = board;
  const result = new Map<number, EyeStatus>();
  eyes.forEach((color, eye) => {
    const x = eye % size;
    const y = Math.floor(eye / size);
    let enemies = 0;
    let empties = 0;
    let offBoard = 0;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) offBoard++;
      else if (cells[toIndex(size, nx, ny)] === opponent(color)) enemies++;
      else if (cells[toIndex(size, nx, ny)] === null) empties++;
    }
    const limit = offBoard > 0 ? 1 : 2;
    result.set(eye, enemies >= limit ? "false" : enemies + empties >= limit ? "unsettled" : "real");
  });
  return result;
}

/** 斜めにならんだ、別のグループの同じ色の石の組。 */
export interface DiagonalLink {
  a: number;
  b: number;
  color: Stone;
  /**
   * 切断点: 間の 2 つの交点の一方に相手の石があり、もう一方が空いている時の、空いている交点。相手がここに打つと切れる。
   * null なら間の 2 つが空いていて、どちらを打たれてももう一方でつながる (連絡)。
   */
  cut: number | null;
}

/** 斜めにならんだ別のグループの石の組と、それが連絡か切断点か。間に相手の石が 2 つある組 (切れている) は含めない。 */
export function diagonalLinks(board: Board): DiagonalLink[] {
  const { size, cells } = board;
  const groupOf = new Map<number, number>();
  allGroups(board).forEach((group, id) => group.stones.forEach((stone) => groupOf.set(stone, id)));
  const links: DiagonalLink[] = [];
  cells.forEach((color, a) => {
    if (color === null) return;
    const x = a % size;
    const y = Math.floor(a / size);
    // 右上と右下だけを見て、同じ組を 2 回数えない。
    for (const dy of [-1, 1]) {
      if (x + 1 >= size || y + dy < 0 || y + dy >= size) continue;
      const b = toIndex(size, x + 1, y + dy);
      if (cells[b] !== color || groupOf.get(a) === groupOf.get(b)) continue;
      const between = [toIndex(size, x + 1, y), toIndex(size, x, y + dy)];
      const [p, q] = between.map((index) => cells[index]);
      if (p === null && q === null) links.push({ a, b, color, cut: null });
      else if (p === null && q === opponent(color)) links.push({ a, b, color, cut: between[0]! });
      else if (q === null && p === opponent(color)) links.push({ a, b, color, cut: between[1]! });
    }
  });
  return links;
}

/** となり合った相手どうしのグループの戦い。 */
export interface Fight {
  /** 黒のグループと白のグループ。 */
  black: Group;
  white: Group;
  /** 両方のグループの呼吸点 (共有する呼吸点)。 */
  shared: number[];
}

/** 攻め合い: HP の多い方 (leader) が先に相手を取れる。同じなら null (先に打った方が勝つ)。 */
export interface Semeai extends Fight {
  leader: Stone | null;
}

/** 本当の眼を 2 つ以上持つ (取られない) グループか。 */
function isAlive(group: Group, sealed: ReadonlyMap<number, Stone>, statuses: ReadonlyMap<number, EyeStatus>): boolean {
  return group.liberties.filter((liberty) => sealed.get(liberty) === group.color && statuses.get(liberty) === "real").length >= 2;
}

/**
 * 共有する呼吸点に打つと、打った側が自分から取られる形になる (自殺手、または取れずに HP 1 になる) か。
 * セキでは、両方の色にとって、共有する呼吸点がすべてこうなっている。
 */
function isSelfAtari(board: Board, color: Stone, point: number): boolean {
  const attempt = playMove(stateFor(board, color), point);
  if (!attempt.ok) return true;
  if (attempt.state.lastCaptured.length > 0) return false;
  return (groupAt(attempt.state.board, point)?.liberties.length ?? 0) <= 1;
}

/**
 * となり合った黒と白のグループのうち、攻め合いとセキになっている組。どちらかが生きている (本当の眼が 2 つ) 組は除く。
 * - セキ: どちらのグループも、共有する呼吸点のほかには自分の眼しか呼吸点がなく、共有する呼吸点はどちらの色が打っても
 *   打った側が取られる形になる。互いに手を出せず、両方とも生きている
 * - 攻め合い: セキでなく、両方とも 2 子以上で、HP が SEMEAI_MAX_HP 以下
 */
export function fights(board: Board): { semeais: Semeai[]; sekis: Fight[] } {
  const groups = allGroups(board);
  const sealed = sealedLiberties(board);
  const statuses = eyeStatuses(board, sealed);
  const groupOf = new Map<number, Group>();
  groups.forEach((group) => group.stones.forEach((stone) => groupOf.set(stone, group)));
  const semeais: Semeai[] = [];
  const sekis: Fight[] = [];
  groups
    .filter((group) => group.color === "black")
    .forEach((black) => {
      // 黒のグループにとなり合う白のグループ。
      const whites = new Set<Group>();
      black.stones.forEach((stone) => {
        const x = stone % board.size;
        const y = Math.floor(stone / board.size);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= board.size || ny >= board.size) continue;
          const other = groupOf.get(toIndex(board.size, nx, ny));
          if (other?.color === "white") whites.add(other);
        }
      });
      whites.forEach((white) => {
        const shared = black.liberties.filter((liberty) => white.liberties.includes(liberty));
        if (shared.length === 0) return;
        if (isAlive(black, sealed, statuses) || isAlive(white, sealed, statuses)) return;
        const onlyOwnEyes = (group: Group) =>
          group.liberties.every((liberty) => shared.includes(liberty) || sealed.get(liberty) === group.color);
        const seki =
          onlyOwnEyes(black) &&
          onlyOwnEyes(white) &&
          shared.every((point) => isSelfAtari(board, "black", point) && isSelfAtari(board, "white", point));
        if (seki) {
          sekis.push({ black, white, shared });
          return;
        }
        const hp = { black: black.liberties.length, white: white.liberties.length };
        if (black.stones.length < 2 || white.stones.length < 2) return;
        if (hp.black > SEMEAI_MAX_HP || hp.white > SEMEAI_MAX_HP) return;
        const leader = hp.black === hp.white ? null : hp.black > hp.white ? "black" : "white";
        semeais.push({ black, white, shared, leader });
      });
    });
  return { semeais, sekis };
}

/** 死に石の判定で、生きとみなす自分だけの地の大きさ (これだけの空点を自分だけで囲んでいれば生き)。 */
export const ALIVE_TERRITORY = 5;

/**
 * 終局で死とみなす石 (実質的に死んでいる領域に置かれた石)。グループごとに、次をすべて満たすものを死とする。
 * - セキになっていない (セキのグループは両方とも生き)
 * - 本当の眼に決まった結界が 2 つない (二眼のグループは必ず生き)
 * - 自分の色だけに接する空点の領域 (自分だけの地) が、合わせて ALIVE_TERRITORY 未満
 * - そのグループを取り除いた盤の勢力で、グループの石の過半数が相手の勢力に入る
 * 小さいグループから順に調べ、死とみなした石は取り除いた盤で次のグループを調べる (相手の地の中の死に石が、
 * 相手の地を「両方の色に接する所」に見せてしまわないように)。
 * 攻め合いの途中などの際どい形は外れることがある (厳密な死活判定ではない)。
 */
export function deadStones(board: Board): Set<number> {
  const size = board.size;
  const sealed = sealedLiberties(board);
  const statuses = eyeStatuses(board, sealed);
  const dead = new Set<number>();
  const cells = [...board.cells];
  const inSeki = new Set(fights(board).sekis.flatMap(({ black, white }) => [...black.stones, ...white.stones]));
  const groups = allGroups(board).sort((a, b) => a.stones.length - b.stones.length);
  groups.forEach((group) => {
    if (inSeki.has(group.stones[0]!)) return;
    const realEyes = group.liberties.filter(
      (liberty) => sealed.get(liberty) === group.color && statuses.get(liberty) === "real",
    );
    if (realEyes.length >= 2) return;
    // 自分だけの地: グループに接する空点 (死とみなして取り除いた点も含む) から広がる領域のうち、自分の色だけに接するもの。
    const seen = new Set<number>();
    let ownTerritory = 0;
    const starts = group.stones.flatMap((stone) => neighbors(size, stone).filter((next) => cells[next] === null));
    starts.forEach((start) => {
      if (seen.has(start)) return;
      const region = [start];
      seen.add(start);
      let onlyOwn = true;
      for (let i = 0; i < region.length; i++) {
        for (const next of neighbors(size, region[i]!)) {
          const cell = cells[next];
          if (cell === null) {
            if (!seen.has(next)) {
              seen.add(next);
              region.push(next);
            }
          } else if (cell !== group.color) onlyOwn = false;
        }
      }
      if (onlyOwn) ownTerritory += region.length;
    });
    if (ownTerritory >= ALIVE_TERRITORY) return;
    // グループを取り除いた盤の勢力で、相手の勢力に入る石の数。
    const members = new Set(group.stones);
    const without = { size, cells: cells.map((cell, index) => (members.has(index) ? null : cell)) };
    const owner = influence(without).owner;
    const enemy = group.stones.filter((stone) => owner[stone] === opponent(group.color)).length;
    if (enemy * 2 > group.stones.length) {
      group.stones.forEach((stone) => {
        dead.add(stone);
        cells[stone] = null;
      });
    }
  });
  return dead;
}
