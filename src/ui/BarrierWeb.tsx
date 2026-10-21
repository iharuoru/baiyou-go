// 結界: 敵に取られない呼吸点 (眼) の中心に口を開き (本当の眼は大きな口、未確定は小さな口)、まわりの石からあらゆる方向に伸びた触覚が
// 交差しながら丸を支えて網目を作る。上下左右の石からはまっすぐ丸へ向かう触覚 (GoBoard.tsx が描く) のほかに、石の縁の左右から
// 斜めに伸びて丸の反対側へ回り込む触覚を何本も出す。となりの向きから来た触覚どうしが交差して網目になる。
// 盤の端・隅では、石の代わりに壁 (モニターの枠) から触手が生えて丸を支える。

import type { CSSProperties } from "react";
import type { EyeStatus } from "../game/shape";
import { Mouth } from "./Mouth";

/** 中心の丸の半径 (盤の 1 マスに対する割合)。結界へ向かう触覚は、この丸の縁で止まる。 */
export const BARRIER_RATIO = 0.25;

/** 網目の触覚が伸び始める時刻と、1 本ずつの遅れ、伸びる長さ (秒)。 */
const SPREAD_START = 0.3;
const SPREAD_LAG = 0.08;
const SPREAD_SECONDS = 0.7;
/** 脈の長さ (秒)。 */
const PULSE_SECONDS = 1.8;
/**
 * 網目の触覚: 石の縁の、真正面から offset 度ずれた所から生え、丸の上の、真正面から -land 度の所 (反対側) へつく。
 * 生える側とつく側が逆なので、となりの触覚どうしが交差する。
 */
const STRANDS = [
  { offset: -44, land: 64 },
  { offset: -22, land: 34 },
  { offset: 22, land: -34 },
  { offset: 44, land: -64 },
];
/** 網目の触覚の太さ。 */
const STRAND_WIDTH = 1.7;
/** 未確定の眼の中心に置く小さな口の半径。 */
const SMALL_MOUTH_RADIUS = 6.5;

interface Point {
  cx: number;
  cy: number;
}

/** 中心から angle (度) の向きに distance 離れた点。 */
function toward(center: Point, angle: number, distance: number): Point {
  const radians = (angle * Math.PI) / 180;
  return { cx: center.cx + distance * Math.cos(radians), cy: center.cy + distance * Math.sin(radians) };
}

const format = ({ cx, cy }: Point) => `${cx.toFixed(1)} ${cy.toFixed(1)}`;

/** 結界ごとに同じ形になる乱数 (0〜1)。 */
function seededRandom(seed: number): () => number {
  let state = ((seed + 1) * 2654435761) % 4294967296;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * from から to への触覚: 根元ではまっすぐ出て、くねりながら to へつく 3 次ベジェ曲線。
 * reach < 1 なら先が届かずに垂れ (解けた網)、sag で横へのたるみを大きくする。
 */
function strandPath(from: Point, to: Point, bend: number, reach = 1, sag = 1): string {
  const end = { cx: from.cx + (to.cx - from.cx) * reach, cy: from.cy + (to.cy - from.cy) * reach };
  const dx = end.cx - from.cx;
  const dy = end.cy - from.cy;
  const at = (t: number, side: number) => ({ cx: from.cx + dx * t - dy * side, cy: from.cy + dy * t + dx * side });
  return `M ${format(from)} C ${format(at(1 / 3, bend * sag))} ${format(at(2 / 3, -bend * 0.6 * sag))} ${format(end)}`;
}

/** 壁から丸へ伸びる触手。壁の根元から、くねりながら丸の縁へ。 */
function wallFeelerPath(center: Point, angle: number, radius: number, wallDistance: number): string {
  const root = toward(center, angle, wallDistance);
  const tip = toward(center, angle, radius);
  const length = wallDistance - radius;
  const side = (angle + 90) % 360;
  const bend = length * 0.3;
  const at = (along: number, offset: number) =>
    format(toward(toward(center, angle, wallDistance - along), side, offset));
  return `M ${format(root)} C ${at(length / 3, bend)} ${at((length * 2) / 3, -bend)} ${format(tip)}`;
}

/**
 * 結界の口へ向かう触覚が、1 つの石から生える根元 (石の縁の点) の一覧: 真正面から伸びる触覚 (GoBoard.tsx が描く) と、網目の触覚。
 * stone は石の中心、eye は結界の中心、stoneBase は石の中心から縁までの距離。臓器の管は、この根元ごとに枝分かれしてつながる。
 */
export function strandRoots(stone: Point, eye: Point, stoneBase: number): Point[] {
  const angle = (Math.atan2(stone.cy - eye.cy, stone.cx - eye.cx) * 180) / Math.PI;
  return [0, ...STRANDS.map(({ offset }) => offset)].map((offset) => toward(stone, angle + 180 + offset, stoneBase));
}

/** 結界の状態: 眼の状態と、コウの一時的な結界。 */
export type BarrierStatus = EyeStatus | "ko";

interface Props {
  center: Point;
  /** 中心の丸の半径。 */
  radius: number;
  /** 盤の 1 マスの大きさ。上下左右の石の中心は、中心からこの距離にある。 */
  cell: number;
  /** 石の中心から、石の縁で触覚が生える所までの距離。 */
  stoneBase: number;
  /** 盤の外 (壁) になっている向き (度)。端は 1 つ、隅は 2 つ。 */
  walls: number[];
  /** 中心から壁 (モニターの枠) までの距離。 */
  wallDistance: number;
  /** 網目の曲がりを結界ごとに変えるための数。 */
  seed: number;
  isAlly: boolean;
  /**
   * 結界の状態。眼の状態 (src/game/shape.ts) と、コウの一時的な結界 (ko)。
   * 本当の眼は張った網目と、歯の並んだ大きな口。未確定は解けた網目 (触覚がたるみ、半分ほどは中心まで届かずに垂れる) と小さな口。
   * 欠け目は解けた網目で、口を置かない。コウは本当の眼と同じ張った網目で、口を置かない。
   */
  status: BarrierStatus;
}

export function BarrierWeb({ center, radius, cell, stoneBase, walls, wallDistance, seed, isAlly, status }: Props) {
  const unraveled = status === "unsettled" || status === "false";
  const random = seededRandom(seed);
  // 網目の触覚: 上下左右のそれぞれの向き (石か壁) から、STRANDS の本数ずつ。
  const strands = [0, 90, 180, 270].flatMap((angle) =>
    STRANDS.map(({ offset, land }, k) => {
      const from = walls.includes(angle)
        ? // 壁: 壁の上の、正面から横にずれた所から生える。
          toward(toward(center, angle, wallDistance), angle + 90, offset * 0.35)
        : // 石: 石の縁の、丸の方を向いた所から offset 度ずれた所。
          toward(toward(center, angle, cell), angle + 180 + offset, stoneBase);
      const to = toward(center, angle + land, radius);
      return {
        key: `${angle}-${k}`,
        from,
        to,
        bend: (random() - 0.5) * 0.5,
        reach: random() < 0.5 ? 1 : 0.5 + random() * 0.3,
        sag: 2.5 + random() * 1.5,
        order: angle / 90 + k * 0.5,
      };
    }),
  );
  return (
    <g
      className={`barrier ${isAlly ? "ally" : "enemy"}${unraveled ? " torn" : ""}`}
    >
      {walls.map((angle) => (
        <g key={`wall-${angle}`} className="wall-feeler">
          <path d={wallFeelerPath(center, angle, radius, wallDistance)} pathLength={1} className="wall-feeler-stalk" />
          <circle {...toward(center, angle, wallDistance)} r={4.5} className="wall-feeler-root" />
        </g>
      ))}
      {strands.map(({ key, from, to, bend, reach, sag, order }) => (
        <path
          key={key}
          d={unraveled ? strandPath(from, to, bend, reach, sag) : strandPath(from, to, bend)}
          pathLength={1}
          className="web-vein"
          style={
            {
              "--vein-width": STRAND_WIDTH,
              animationDelay: `${SPREAD_START + order * SPREAD_LAG}s, ${-order * 0.3}s`,
              animationDuration: `${SPREAD_SECONDS}s, ${PULSE_SECONDS}s`,
            } as CSSProperties
          }
        />
      ))}
      {/*
        中心の口: 網目が届いてから現れ、ゆっくり開閉して息をする。本当の眼は歯の並んだ大きな口、未確定は小さな口。
        欠け目とコウは口を置かない
      */}
      {(status === "real" || status === "unsettled") && (
        <Mouth
          cx={center.cx}
          cy={center.cy}
          r={status === "real" ? radius : SMALL_MOUTH_RADIUS}
          big={status === "real"}
          phase={seed % 7}
          className="eye-core"
          style={{ animationDelay: `${SPREAD_START + SPREAD_SECONDS}s` }}
        />
      )}
    </g>
  );
}
