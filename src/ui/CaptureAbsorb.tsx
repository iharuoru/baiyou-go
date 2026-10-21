// 取られた生命体の吸収: 囲まれて窒息した生命体は、置いた石の着地の後にはじけて小さな粒になり、
// 四方で囲んでいた相手の生命体から触覚が伸びてきて、粒を触覚に沿って自分の体へ吸い込む。触覚は吸い込み終わると縮む。
// 時間の流れはすべて styles.css の capture-* のアニメーション (同じ遅れ・長さで揃える)。

import type { CSSProperties } from "react";
import { neighbors, opponent, type Cell, type Stone } from "../game/board";

/** 1 体が崩れてできる粒の数。 */
const BITS = 8;

interface Point {
  cx: number;
  cy: number;
}

interface Props {
  /** 今の手で取られた石の位置。 */
  captured: readonly number[];
  /** 取った側の色。 */
  capturer: Stone;
  /** 取った後の盤。 */
  cells: readonly Cell[];
  size: number;
  /** 石の半径。 */
  radius: number;
  pos: (index: number) => Point;
  /** 取った側の触覚の色 (味方は黄色、敵はピンク)。 */
  side: "ally" | "enemy";
}

/** 取られた石を吸い込む相手の石: となりの取った側の石。なければ (大きな群れの内側) 一番近い取った側の石。 */
function absorbers(index: number, { capturer, cells, size, pos }: Props): number[] {
  const around = neighbors(size, index).filter((next) => cells[next] === capturer);
  if (around.length > 0) return around;
  const from = pos(index);
  const distance = (other: number) => (pos(other).cx - from.cx) ** 2 + (pos(other).cy - from.cy) ** 2;
  const nearest = cells
    .map((cell, other) => (cell === capturer ? other : -1))
    .filter((other) => other >= 0)
    .sort((a, b) => distance(a) - distance(b))[0];
  return nearest === undefined ? [] : [nearest];
}

export function CaptureAbsorb(props: Props) {
  const { captured, capturer, radius, pos, side } = props;
  const pulls = captured.map((index) => ({ index, from: pos(index), targets: absorbers(index, props).map(pos) }));
  return (
    <g className="capture-absorb">
      {/* 触覚: 相手の石の縁から、取られた石の中心へ伸びて、粒を引き込んで縮む */}
      <g className={`capture-feelers ${side}`}>
        {pulls.flatMap(({ index, from, targets }) =>
          targets.map((to, k) => {
            const [ux, uy] = unit(from.cx - to.cx, from.cy - to.cy);
            const root = { x: to.cx + ux * radius * 0.85, y: to.cy + uy * radius * 0.85 };
            // 少し横へふくらませて、まっすぐな棒にしない (向きは触覚ごとに変える)。
            const bend = radius * 0.35 * (k % 2 === 0 ? 1 : -1);
            const control = { x: (root.x + from.cx) / 2 - uy * bend, y: (root.y + from.cy) / 2 + ux * bend };
            return (
              <g key={`${index}-${k}`} style={{ "--rx": `${root.x - from.cx}px`, "--ry": `${root.y - from.cy}px` } as CSSProperties}>
                <path
                  d={`M ${root.x} ${root.y} Q ${control.x} ${control.y} ${from.cx} ${from.cy}`}
                  pathLength={1}
                  className="capture-feeler"
                />
                <circle cx={from.cx} cy={from.cy} r={radius * 0.16} className="capture-tip" />
              </g>
            );
          }),
        )}
      </g>
      {/* 取られた体: はじけて消え、粒になって散り、触覚に引かれて相手の石へ吸い込まれる */}
      <g className={`team ${opponent(capturer)}`}>
        {pulls.map(({ index, from }) => (
          <circle key={index} cx={from.cx} cy={from.cy} r={radius - 2} className="capture-burst" />
        ))}
        {pulls.flatMap(({ index, from, targets }) => {
          let seed = index + 7;
          const random = () => {
            seed = (seed * 9301 + 49297) % 233280;
            return seed / 233280;
          };
          return Array.from({ length: BITS }, (_, k) => {
            const angle = (k / BITS) * 2 * Math.PI + random() * 0.6;
            const spread = radius * (0.45 + random() * 0.45);
            const to = targets[k % Math.max(1, targets.length)] ?? from;
            return (
              <circle
                key={`${index}-${k}`}
                cx={from.cx}
                cy={from.cy}
                r={radius * (0.12 + random() * 0.08)}
                className="capture-bit"
                style={
                  {
                    "--sx": `${Math.cos(angle) * spread}px`,
                    "--sy": `${Math.sin(angle) * spread}px`,
                    "--tx": `${to.cx - from.cx}px`,
                    "--ty": `${to.cy - from.cy}px`,
                    animationDelay: `calc(var(--capture-at) + ${(random() * 0.12).toFixed(2)}s)`,
                  } as CSSProperties
                }
              />
            );
          });
        })}
      </g>
    </g>
  );
}

function unit(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
}
