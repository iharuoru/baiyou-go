// モンテカルロ法: 候補手ごとに、最後までランダムに打ち進める試行 (プレイアウト) をくり返し、勝率の高い手を選ぶ。
// 試行の回数を稼ぐため、src/game の不変な盤ではなく、書き換えて使う型付き配列の盤で打つ。

import { neighbors } from "../game/board";
import type { GameState } from "../game/rules";
import { KOMI } from "../game/score";
import type { ScoredMove } from "./heuristic";

const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

/** 勝率に足す 1 手先の評価の重み。取る / 逃げるなど、試行では差が出にくい手を拾う。 */
const PRIOR_WEIGHT = 0.03;

/** UCB1 で、試した回数の少ない手を試す強さ。 */
const EXPLORATION = 1.0;

class FastBoard {
  readonly cells: Int8Array;
  ko = -1;
  private readonly near: number[][];
  private readonly mark: Int32Array;
  private readonly stack: Int32Array;
  private generation = 0;

  constructor(readonly size: number) {
    const area = size * size;
    this.cells = new Int8Array(area);
    this.near = Array.from({ length: area }, (_, index) => neighbors(size, index));
    this.mark = new Int32Array(area);
    this.stack = new Int32Array(area);
  }

  static from(state: GameState): FastBoard {
    const board = new FastBoard(state.board.size);
    state.board.cells.forEach((cell, index) => {
      board.cells[index] = cell === "black" ? BLACK : cell === "white" ? WHITE : EMPTY;
    });
    board.ko = state.koPoint ?? -1;
    return board;
  }

  copyFrom(other: FastBoard): void {
    this.cells.set(other.cells);
    this.ko = other.ko;
  }

  /** start のグループに、except 以外の呼吸点があるか。 */
  private hasLiberty(start: number, except: number): boolean {
    const color = this.cells[start];
    const gen = ++this.generation;
    let top = 0;
    this.stack[top++] = start;
    this.mark[start] = gen;
    while (top > 0) {
      const current = this.stack[--top]!;
      for (const next of this.near[current]!) {
        const cell = this.cells[next];
        if (cell === EMPTY) {
          if (next !== except) return true;
        } else if (cell === color && this.mark[next] !== gen) {
          this.mark[next] = gen;
          this.stack[top++] = next;
        }
      }
    }
    return false;
  }

  private removeGroup(start: number): number {
    const color = this.cells[start];
    let top = 0;
    let count = 0;
    this.stack[top++] = start;
    this.cells[start] = EMPTY;
    while (top > 0) {
      const current = this.stack[--top]!;
      count++;
      for (const next of this.near[current]!) {
        if (this.cells[next] === color) {
          this.cells[next] = EMPTY;
          this.stack[top++] = next;
        }
      }
    }
    return count;
  }

  isLegal(index: number, color: number): boolean {
    if (this.cells[index] !== EMPTY || index === this.ko) return false;
    for (const next of this.near[index]!) {
      const cell = this.cells[next];
      if (cell === EMPTY) return true;
      const keepsLiberty = this.hasLiberty(next, index);
      if (cell === color && keepsLiberty) return true;
      if (cell !== color && !keepsLiberty) return true;
    }
    return false;
  }

  /** 自分の石に囲まれた目。斜めに相手の石が多いと欠け目なので目とみなさない。 */
  isOwnEye(index: number, color: number): boolean {
    for (const next of this.near[index]!) if (this.cells[next] !== color) return false;
    const x = index % this.size;
    const y = Math.floor(index / this.size);
    let enemies = 0;
    let offBoard = 0;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= this.size || ny >= this.size) offBoard++;
      else if (this.cells[ny * this.size + nx] === 3 - color) enemies++;
    }
    return offBoard > 0 ? enemies === 0 : enemies < 2;
  }

  /** isLegal を確かめてから呼ぶ。 */
  play(index: number, color: number): void {
    this.cells[index] = color;
    let captured = 0;
    let capturedAt = -1;
    for (const next of this.near[index]!) {
      if (this.cells[next] === 3 - color && !this.hasLiberty(next, -1)) {
        capturedAt = next;
        captured += this.removeGroup(next);
      }
    }
    // 1 子を取って、打った石が 1 子のまま HP 1 で残ればコウ。
    const alone = this.near[index]!.every((next) => this.cells[next] !== color);
    const emptyNear = this.near[index]!.filter((next) => this.cells[next] === EMPTY).length;
    this.ko = captured === 1 && alone && emptyNear === 1 ? capturedAt : -1;
  }

  /** 中国ルールの数え方 (石 + 自分の石だけに接する空点)。黒 - 白 - コミ。 */
  score(): number {
    let total = -KOMI;
    for (let index = 0; index < this.cells.length; index++) {
      const cell = this.cells[index];
      if (cell === BLACK) total++;
      else if (cell === WHITE) total--;
      else {
        let touches = 0;
        for (const next of this.near[index]!) touches |= 1 << this.cells[next]!;
        if (touches === 1 << BLACK) total++;
        else if (touches === 1 << WHITE) total--;
      }
    }
    return total;
  }
}

/** 盤が埋まるまでランダムに打ち、勝った色を返す。 */
function playout(board: FastBoard, toPlay: number, random: () => number): number {
  const empties = new Int32Array(board.cells.length);
  const maxMoves = board.cells.length * 2;
  let color = toPlay;
  let passes = 0;
  for (let move = 0; passes < 2 && move < maxMoves; move++) {
    let count = 0;
    for (let index = 0; index < board.cells.length; index++) {
      if (board.cells[index] === EMPTY) empties[count++] = index;
    }
    let played = false;
    while (count > 0) {
      const pick = Math.floor(random() * count);
      const index = empties[pick]!;
      empties[pick] = empties[--count]!;
      if (!board.isOwnEye(index, color) && board.isLegal(index, color)) {
        board.play(index, color);
        played = true;
        break;
      }
    }
    passes = played ? 0 : passes + 1;
    if (!played) board.ko = -1;
    color = 3 - color;
  }
  return board.score() > 0 ? BLACK : WHITE;
}

export interface MonteCarloOptions {
  random: () => number;
  /** 考える時間 (ミリ秒)。 */
  timeMs: number;
  /** 時間に関係なく、候補 1 つあたり最低これだけ試す。 */
  minPlayouts?: number;
}

/** 候補手から、プレイアウトの勝率 + 1 手先の評価が高い手を選ぶ。試す候補は UCB1 で、その値が高いものに寄せる。 */
export function monteCarlo(
  state: GameState,
  candidates: readonly ScoredMove[],
  { random, timeMs, minPlayouts = 4 }: MonteCarloOptions,
): number {
  const me = state.toPlay === "black" ? BLACK : WHITE;
  const base = FastBoard.from(state);
  const board = new FastBoard(base.size);
  const wins = new Float64Array(candidates.length);
  const visits = new Float64Array(candidates.length);
  const deadline = Date.now() + timeMs;
  const value = (i: number) => wins[i]! / visits[i]! + PRIOR_WEIGHT * candidates[i]!.score;

  for (let total = 0; ; total++) {
    if (total >= candidates.length * minPlayouts && Date.now() > deadline) break;
    let pick = 0;
    let best = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const ucb =
        visits[i] === 0 ? Infinity : value(i) + EXPLORATION * Math.sqrt(Math.log(total) / visits[i]!);
      if (ucb > best) {
        best = ucb;
        pick = i;
      }
    }
    board.copyFrom(base);
    board.play(candidates[pick]!.index, me);
    if (playout(board, 3 - me, random) === me) wins[pick] += 1;
    visits[pick] += 1;
  }

  let choice = 0;
  for (let i = 1; i < candidates.length; i++) if (value(i) > value(choice)) choice = i;
  return candidates[choice]!.index;
}
