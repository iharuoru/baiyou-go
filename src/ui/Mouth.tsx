// 口: 結界 (眼) の中心に置く、ぬめっとした口。ゆっくり開閉して息をする。
// 唇は色 (currentColor) の輪に暗い縁とつや、内側に暗い口の穴と舌、穴のまわりに小さな歯が並ぶ。
// 小さな口 (未確定の眼) も同じ形で歯を減らす (歯がないと目玉に見えるため)。
// 開閉は .mouth-open の伸び縮み (styles.css)。

import type { CSSProperties } from "react";

/** 歯の数 (大きな口と小さな口)。 */
const TEETH = { big: 10, small: 6 };

interface Props {
  cx: number;
  cy: number;
  r: number;
  /** 外側の g に付けるクラス (出入りのアニメーション用)。 */
  className?: string;
  /** 大きな口 (本当の眼)。小さな口より歯が多く、ゆっくり深く息をする。 */
  big?: boolean;
  /** 開閉のタイミングをずらす秒数。 */
  phase?: number;
  style?: CSSProperties;
}

export function Mouth({ cx, cy, r, className, big = false, phase = 0, style }: Props) {
  const holeX = r * 0.6;
  const holeY = r * 0.52;
  // 歯: 穴の縁に沿って、内側を向いた小さな三角。
  const count = big ? TEETH.big : TEETH.small;
  const teeth = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 2 * Math.PI;
    const at = (scale: number, turn = 0) => ({
      x: cx + holeX * scale * Math.cos(angle + turn),
      y: cy + holeY * scale * Math.sin(angle + turn),
    });
    const [a, b, tip] = [at(1, -0.2), at(1, 0.2), at(0.72)];
    return `M ${a.x.toFixed(1)} ${a.y.toFixed(1)} L ${b.x.toFixed(1)} ${b.y.toFixed(1)} L ${tip.x.toFixed(1)} ${tip.y.toFixed(1)} Z`;
  });
  return (
    <g className={["mouth", big && "big", className].filter(Boolean).join(" ")} style={style}>
      <circle cx={cx} cy={cy} r={r} className="mouth-lip" style={{ strokeWidth: r * 0.2 }} />
      <g className="mouth-open" style={{ animationDelay: `${-phase}s` }}>
        <ellipse cx={cx} cy={cy} rx={holeX} ry={holeY} className="mouth-hole" />
        <ellipse cx={cx} cy={cy + holeY * 0.45} rx={holeX * 0.55} ry={holeY * 0.38} className="mouth-tongue" />
        {teeth.map((d, i) => (
          <path key={i} d={d} className="mouth-tooth" />
        ))}
      </g>
      <ellipse cx={cx - r * 0.42} cy={cy - r * 0.5} rx={r * 0.28} ry={r * 0.15} className="mouth-shine" />
    </g>
  );
}
