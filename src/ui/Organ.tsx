// 二眼の臓器: 結界を 2 つ以上持つ (相手に取られない) グループの中に育つ、ぬめっとした塊。
// 心臓のように「ドクン、ドクン」と脈打ち、管で結界とつながる。管は結界の口に面した石ごとに 1 本で、群れの石を最短でたどって
// スライムの中を通り (臓器に近づくと重なって 1 本にまとまる)、根元だけで、その面の触覚の数に枝分かれして触覚の根元につながる。
// 管の中を、脈に合わせて体液が流れる。
// 塊の形は凸凹で、グループごとに変える。石の顔 (つや) の下に描いて、スライムの中に透けて見えるようにする。

import type { CSSProperties } from "react";

/** 塊の輪郭の点の数。 */
const LUMPS = 9;

interface Point {
  cx: number;
  cy: number;
}

const format = ({ cx, cy }: Point) => `${cx.toFixed(1)} ${cy.toFixed(1)}`;

/** グループごとに同じ形になる乱数 (0〜1)。 */
function seededRandom(seed: number): () => number {
  let state = ((seed + 1) * 2654435761) % 4294967296;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** 凸凹の塊の輪郭: 半径をばらつかせた点を、となりとの中点を通る曲線で閉じる。 */
function lumpPath(center: Point, radius: number, random: () => number): string {
  const points = Array.from({ length: LUMPS }, (_, i) => {
    const angle = (i / LUMPS) * 2 * Math.PI;
    const r = radius * (0.78 + random() * 0.36);
    return { cx: center.cx + r * Math.cos(angle), cy: center.cy + r * Math.sin(angle) };
  });
  const middle = (a: Point, b: Point) => ({ cx: (a.cx + b.cx) / 2, cy: (a.cy + b.cy) / 2 });
  const start = middle(points[LUMPS - 1]!, points[0]!);
  const curves = points.map((point, i) => `Q ${format(point)} ${format(middle(point, points[(i + 1) % LUMPS]!))}`);
  return `M ${format(start)} ${curves.join(" ")} Z`;
}

/** 臓器から管の分かれ目への管: 群れの石の中心を順にたどる点列 (スライムの中を通る) を、なめらかな曲線でつなぐ。 */
function vesselPath(points: readonly Point[]): string {
  const at = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!;
  const segments = points.slice(1).map((end, k) => {
    const [before, start, after] = [at(k - 1), at(k), at(k + 2)];
    const c1 = { cx: start.cx + (end.cx - before.cx) / 6, cy: start.cy + (end.cy - before.cy) / 6 };
    const c2 = { cx: end.cx - (after.cx - start.cx) / 6, cy: end.cy - (after.cy - start.cy) / 6 };
    return `C ${format(c1)} ${format(c2)} ${format(end)}`;
  });
  return `M ${format(points[0]!)} ${segments.join(" ")}`;
}

interface Props {
  /** 塊を置く石の位置。 */
  center: Point;
  /**
   * 管: 臓器から群れの石の中心を順にたどり、結界の口に面した石の縁の手前 (分かれ目) までの点列と、
   * そこから枝分かれしてつながる触覚の根元 (fan)。key は結界と石。
   */
  links: { key: string; points: Point[]; fan: Point[] }[];
  radius: number;
  /** 塊の形と管の曲がりをグループごとに変えるための数。 */
  seed: number;
}

export function Organ({ center, links, radius, seed }: Props) {
  const random = seededRandom(seed);
  const flesh = lumpPath(center, radius, random);
  const lobe = lumpPath({ cx: center.cx + radius * 0.15, cy: center.cy + radius * 0.2 }, radius * 0.55, random);
  // 表面を這う細い血管: 塊の中心寄りから外へ、短い曲線を数本。
  const veins = Array.from({ length: 4 }, (_, i) => {
    const angle = (i / 4) * 2 * Math.PI + random() * 1.2;
    const at = (r: number, turn: number) => ({
      cx: center.cx + r * Math.cos(angle + turn),
      cy: center.cy + r * Math.sin(angle + turn),
    });
    return `M ${format(at(radius * 0.2, 0))} Q ${format(at(radius * 0.55, 0.5))} ${format(at(radius * 0.85, 0.2))}`;
  });
  return (
    <g className="organ">
      {/* 管は結界と石ごとに key を保つので、新しい結界ができた時は、その管だけが伸びて生える */}
      {links.map(({ key, points, fan }, i) => {
        const d = vesselPath(points);
        const fork = points[points.length - 1]!;
        return (
          <g
            key={`vessel-${key}`}
            className="organ-vessel"
            style={{ "--vessel-delay": `${0.4 + (i % 6) * 0.08}s` } as CSSProperties}
          >
            <path d={d} pathLength={1} className="vessel-wall" />
            <path d={d} pathLength={1} className="vessel-flow" />
            {/* 根元だけの枝分かれ: 分かれ目から、その面の触覚の根元それぞれへ細い枝 */}
            {fan.map((root, k) => (
              <g key={k} className="vessel-twig">
                <path d={`M ${format(fork)} L ${format(root)}`} pathLength={1} className="vessel-wall" />
                <circle {...root} r={2.2} className="vessel-joint" />
              </g>
            ))}
          </g>
        );
      })}
      <g className="organ-beat">
        <path d={flesh} className="organ-flesh" />
        <path d={lobe} className="organ-lobe" />
        {veins.map((d, i) => (
          <path key={i} d={d} className="organ-vein" />
        ))}
        <ellipse
          cx={center.cx - radius * 0.35}
          cy={center.cy - radius * 0.4}
          rx={radius * 0.3}
          ry={radius * 0.14}
          transform={`rotate(-30 ${center.cx - radius * 0.35} ${center.cy - radius * 0.4})`}
          className="organ-shine"
        />
      </g>
    </g>
  );
}
