import { describe, expect, it } from "vitest";
import { allGroups, toIndex } from "../game/board";
import { inspectPoint } from "../game/rules";
import { deadStones, diagonalLinks, eyeStatuses, fights, sealedLiberties } from "../game/shape";
import { figureState, METHOD_FIGURES, OBSERVATION_FIGURES } from "./noteFigures";

const board = (spec: Parameters<typeof figureState>[0]) => figureState(spec).board;
const statusesOf = (spec: Parameters<typeof figureState>[0]) => {
  const b = board(spec);
  return [...eyeStatuses(b, sealedLiberties(b)).values()];
};

describe("遊び方の図の局面", () => {
  it("群れ: となり合う 3 体が 1 つの群れ", () => {
    expect(allGroups(board(OBSERVATION_FIGURES.merge))).toHaveLength(1);
  });

  it("窒息が近い: 紫の触手が残り 1 本", () => {
    const purple = allGroups(board(OBSERVATION_FIGURES.atari)).find((group) => group.color === "black")!;
    expect(purple.liberties).toHaveLength(1);
  });

  it("口: 本当の眼が 1 つ", () => {
    expect(statusesOf(OBSERVATION_FIGURES.mouth)).toEqual(["real"]);
  });

  it("臓器: 本当の眼が 2 つ", () => {
    expect(statusesOf(OBSERVATION_FIGURES.organ)).toEqual(["real", "real"]);
  });

  it("隙間: 未確定の眼と、欠け目", () => {
    expect(statusesOf(OBSERVATION_FIGURES.gap)).toEqual(["unsettled"]);
    expect(statusesOf(OBSERVATION_FIGURES.broken)).toEqual(["false"]);
  });

  it("居座る触手: 緑はコウの点にすぐには投下できない", () => {
    const state = figureState(OBSERVATION_FIGURES.ko);
    expect(inspectPoint(state, toIndex(5, 1, 2))).toMatchObject({ kind: "illegal", reason: "ko" });
  });

  it("奪い合い: 攻め合いが 1 組", () => {
    const { semeais, sekis } = fights(board(OBSERVATION_FIGURES.race));
    expect(semeais).toHaveLength(1);
    expect(sekis).toHaveLength(0);
  });

  it("斜め: 切断点がある", () => {
    expect(diagonalLinks(board(OBSERVATION_FIGURES.diagonal)).some((link) => link.cut !== null)).toBe(true);
  });

  it("実験終了: 紫の範囲に取り残された緑が分解する", () => {
    expect([...deadStones(board(METHOD_FIGURES.finished))]).toEqual([toIndex(5, 0, 2)]);
  });
});
