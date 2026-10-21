import {
  createBoard,
  groupAt,
  neighbors,
  opponent,
  type Board,
  type Cell,
  type Group,
  type Stone,
} from "./board";

export interface GameState {
  readonly board: Board;
  readonly toPlay: Stone;
  /** それぞれの色が取った相手の石の数 (アゲハマ)。 */
  readonly captures: Readonly<Record<Stone, number>>;
  /** コウで、次の手番がすぐには打てない交点。 */
  readonly koPoint: number | null;
  /** これまでに出た盤の配置 (`positionKey`)。同じ配置に戻る手は打てない (中国ルールの同形反復の禁止)。 */
  readonly positions: ReadonlySet<string>;
  readonly consecutivePasses: number;
  readonly lastMove: number | "pass" | null;
  /** 直前の手で取られた石の位置。 */
  readonly lastCaptured: readonly number[];
}

/** 打てない理由。repeat は、コウ以外でこれまでと同じ盤の配置に戻る手 (三コウなど)。 */
export type IllegalReason = "occupied" | "suicide" | "ko" | "repeat" | "gameOver";

export type MoveResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly reason: IllegalReason };

/** 盤の配置を、同形反復を見分けるための文字列にする (手番は含めない)。 */
export function positionKey(board: Board): string {
  return board.cells.map((cell) => (cell === "black" ? "b" : cell === "white" ? "w" : ".")).join("");
}

export function newGame(size: number): GameState {
  const board = createBoard(size);
  return {
    board,
    toPlay: "black",
    captures: { black: 0, white: 0 },
    koPoint: null,
    positions: new Set([positionKey(board)]),
    consecutivePasses: 0,
    lastMove: null,
    lastCaptured: [],
  };
}

/** 2 手続けてパスしたら終局。 */
export function isGameOver(state: GameState): boolean {
  return state.consecutivePasses >= 2;
}

export function playMove(state: GameState, index: number): MoveResult {
  if (isGameOver(state)) return { ok: false, reason: "gameOver" };
  if (state.board.cells[index] !== null) return { ok: false, reason: "occupied" };
  if (index === state.koPoint) return { ok: false, reason: "ko" };

  const me = state.toPlay;
  const enemy = opponent(me);
  const size = state.board.size;
  const cells: Cell[] = [...state.board.cells];
  cells[index] = me;
  const board: Board = { size, cells };

  // 自分の HP より先に、相手の HP 0 を判定する (殺られる前に殺れる)。
  const captured = new Set<number>();
  for (const next of neighbors(size, index)) {
    if (cells[next] !== enemy || captured.has(next)) continue;
    const group = groupAt(board, next)!;
    if (group.liberties.length === 0) group.stones.forEach((stone) => captured.add(stone));
  }
  captured.forEach((stone) => {
    cells[stone] = null;
  });

  const own = groupAt(board, index)!;
  if (own.liberties.length === 0) return { ok: false, reason: "suicide" };

  // これまでと同じ配置に戻る手は打てない (コウの取り返しは上で ko として先に断る)。
  const key = positionKey(board);
  if (state.positions.has(key)) return { ok: false, reason: "repeat" };

  // 1 子を取って 1 子が HP 1 で残る形は、すぐ取り返されると同じ局面に戻る。
  const isKoShape = captured.size === 1 && own.stones.length === 1 && own.liberties.length === 1;

  return {
    ok: true,
    state: {
      board,
      toPlay: enemy,
      captures: { ...state.captures, [me]: state.captures[me] + captured.size },
      koPoint: isKoShape ? [...captured][0]! : null,
      positions: new Set(state.positions).add(key),
      consecutivePasses: 0,
      lastMove: index,
      lastCaptured: [...captured],
    },
  };
}

export function pass(state: GameState): GameState {
  return {
    ...state,
    toPlay: opponent(state.toPlay),
    koPoint: null,
    consecutivePasses: state.consecutivePasses + 1,
    lastMove: "pass",
    lastCaptured: [],
  };
}

/** 交点にカーソルを合わせた時に見せる情報。 */
export type PointInfo =
  | { readonly kind: "stone"; readonly group: Group }
  | { readonly kind: "move"; readonly group: Group; readonly captured: readonly number[] }
  | { readonly kind: "illegal"; readonly reason: IllegalReason };

export function inspectPoint(state: GameState, index: number): PointInfo {
  const existing = groupAt(state.board, index);
  if (existing) return { kind: "stone", group: existing };

  const result = playMove(state, index);
  if (!result.ok) return { kind: "illegal", reason: result.reason };
  return {
    kind: "move",
    group: groupAt(result.state.board, index)!,
    captured: result.state.lastCaptured,
  };
}
