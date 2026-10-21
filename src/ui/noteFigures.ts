// 遊び方の図: 実験方法と観察結果の項目ごとに、その状況を再現した小さな培養槽 (5 × 5) の局面。
// 画像ではなく盤 (GoBoard) で描くので、盤の見た目を変えても図が古くならない。
// 局面が意図した状況 (本当の眼・臓器・コウ・攻め合いなど) になっているかは noteFigures.test.ts で確かめる。

import { type Cell, type Stone } from "../game/board";
import { positionKey, type GameState } from "../game/rules";

/** 図の局面。行は上から、B = 紫、W = 緑、. = 空き。 */
export interface FigureSpec {
  rows: readonly string[];
  /** 手番 (コウで、手番が投下し返せない点を見せる時など)。既定は紫。 */
  toPlay?: Stone;
  /** コウで、手番がすぐには投下できない点 ([列, 行])。 */
  ko?: readonly [number, number];
  /** 実験終了の局面として、死に石の分解と範囲の染み出しを見せる。 */
  finished?: boolean;
}

const CELL_OF: Record<string, Cell> = { B: "black", W: "white", ".": null };

export function figureState({ rows, toPlay = "black", ko, finished = false }: FigureSpec): GameState {
  const size = rows.length;
  const board = { size, cells: rows.flatMap((row) => [...row].map((char) => CELL_OF[char] ?? null)) };
  return {
    board,
    toPlay,
    captures: { black: 0, white: 0 },
    koPoint: ko ? ko[1] * size + ko[0] : null,
    positions: new Set([positionKey(board)]),
    consecutivePasses: finished ? 2 : 0,
    lastMove: null,
    lastCaptured: [],
  };
}

/** 実験方法の図。 */
export const METHOD_FIGURES = {
  /** 投下した生命体が、となりの空いた点へ触手を伸ばす。 */
  feelers: { rows: [".....", ".....", "..B..", ".....", "....."] },
  /** 実験終了: 取り残された生命体は粒に分解し、支配した範囲に染み出しが広がる。 */
  finished: { rows: [".B.W.", ".B.W.", "WB.W.", ".B.W.", ".B.W."], finished: true },
} satisfies Record<string, FigureSpec>;

/** 観察結果の図 (観察結果の項目の順)。 */
export const OBSERVATION_FIGURES = {
  /** となり合うと溶け合って 1 つの群れになる。 */
  merge: { rows: [".....", ".....", ".BB..", "..B..", "....."] },
  /** 窒息が近い (触手を伸ばせる場所が残り 1 つ)。 */
  atari: { rows: [".....", "..W..", ".WBW.", ".....", "....."] },
  /** 群れが中心に口を形成する (本当の眼)。 */
  mouth: { rows: [".....", ".BBB.", ".B.B.", ".BBB.", "....."] },
  /** 口を 2 つ形成して、臓器を育てる。 */
  organ: { rows: ["BBBBB", "B.B.B", "BBBBB", ".....", "....."] },
  /** 隙間が埋まっていない間は、口は小さいまま (未確定の眼)。 */
  gap: { rows: [".....", ".BB..", "B.B..", ".BB..", "....."] },
  /** 隙間に相手が入り込むと、口は形成されない (欠け目)。 */
  broken: { rows: [".....", ".WBB.", ".B.B.", ".BBW.", "....."] },
  /** 吸収した直後、吸収した側の触手が居座る (コウ)。 */
  ko: { rows: [".....", ".BW..", "B.BW.", ".BW..", "....."], toPlay: "white", ko: [1, 2] },
  /** 呼吸の場所を奪い合い、触手が交差して絡む (攻め合い)。 */
  race: { rows: [".W...", ".B...", ".BW..", "..W..", "..B.."] },
  /** 斜めの個体がつながろうと震える (切断点)。 */
  diagonal: { rows: [".....", ".B...", ".WB..", ".....", "....."] },
  /** 群れから液体が染み出す (勢力)。 */
  seep: { rows: [".....", ".B...", ".....", "...W.", "....."] },
} satisfies Record<string, FigureSpec>;
