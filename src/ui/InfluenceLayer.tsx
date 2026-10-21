// 勢力 (src/game/influence.ts): 対局中の陣地の見込み。スライムから液体が染み出したように、勢力のある空点を
// 半透明の水たまりで覆う。勢力の空点と、そのとなりの同じ色の石から、なだらかに広がる「液体の濃さ」を盤全体で足し合わせ、
// 濃さがしきい値以上の所の輪郭 (等高線) をなめらかな曲線で描く。近い水たまりは溶け合い、離れると丸く分かれる。
// 影響が強い所ほど濃く (広く)、石から離れて弱くなると細くなって途切れる。スライムや触覚の下に敷く。
// 打った後、置いた石が着地してから、前の液体が薄れて新しい形の液体がにじみ出て入れ替わる (置く前の予告では変えない)。

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { neighbors, type Cell, type Stone } from "../game/board";
import type { Influence } from "../game/influence";
import { contours, smoothClosedPath } from "./contour";

const COLORS: Stone[] = ["black", "white"];
/** 影響の強さを 0〜1 にする時の、強さ 1 とみなす影響。 */
const FULL_STRENGTH = 2;
/** 勢力の空点の液体の量: 影響の弱い所と強い所。となりの石は強い所と同じ量にして、スライムから液体がつながって出す。 */
const WEAK = 0.55;
const STRONG = 1;
/** 液体の広がり (盤の 1 マスに対する割合)。大きいほど、となりどうしが溶け合う。 */
const SPREAD = 0.4;
/** 輪郭にする液体の濃さ。 */
const THRESHOLD = 0.5;
/** 濃さを求める格子の間隔 (盤の 1 マスに対する割合)。 */
const STEP = 0.25;

interface Props {
  influence: Influence;
  cells: readonly Cell[];
  size: number;
  cell: number;
  /** 盤 (SVG) の一辺。 */
  span: number;
  pos: (index: number) => { cx: number; cy: number };
  /** 盤面が変わってから、液体が形を変え始めるまでの秒数 (置いた石が着地してから)。 */
  delay: number;
}

/**
 * 液体の輪郭: 出どころ (交点と液体の量) から、なだらかに広がる液体の濃さ (ガウス関数の和) を盤全体で足し合わせ、
 * 濃さがしきい値以上の所の輪郭 (等高線) をなめらかな曲線のパスにする。勢力と、終局の陣地の粘液で使う。
 */
export function liquidPath(
  sources: ReadonlyMap<number, number>,
  pos: (index: number) => { cx: number; cy: number },
  cell: number,
  span: number,
): string {
  const step = cell * STEP;
  const sigma = cell * SPREAD;
  const n = Math.ceil(span / step) + 1;
  // 格子の点ごとに、出どころからのガウス関数の和を液体の濃さにする (出どころから 3σ より遠い所は足さない)。
  const field = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const reach = Math.ceil((3 * sigma) / step);
  sources.forEach((amount, index) => {
    const { cx, cy } = pos(index);
    const ci = Math.round(cx / step);
    const cj = Math.round(cy / step);
    for (let j = Math.max(0, cj - reach); j <= Math.min(n - 1, cj + reach); j++) {
      for (let i = Math.max(0, ci - reach); i <= Math.min(n - 1, ci + reach); i++) {
        const d2 = (i * step - cx) ** 2 + (j * step - cy) ** 2;
        field[j]![i]! += amount * Math.exp(-d2 / (2 * sigma * sigma));
      }
    }
  });
  return contours(field, step, THRESHOLD).map(smoothClosedPath).join(" ");
}

export function InfluenceLayer({ influence, cells, size, cell, span, pos, delay }: Props) {
  const paths = useMemo(
    () =>
      COLORS.map((color) => {
        // 液体の出どころ: 勢力の空点と、そのとなりの同じ色の石。
        const sources = new Map<number, number>();
        influence.owner.forEach((owner, index) => {
          if (owner !== color) return;
          const strength = Math.min(1, Math.abs(influence.value[index]!) / FULL_STRENGTH);
          sources.set(index, WEAK + (STRONG - WEAK) * strength);
          neighbors(size, index).forEach((next) => {
            if (cells[next] === color) sources.set(next, STRONG);
          });
        });
        return { color, d: liquidPath(sources, pos, cell, span) };
      }),
    // pos は盤の大きさだけで決まるので、盤の大きさ (size) が変わらない限り作り直さない。
    [influence, cells, size, cell, span],
  );
  // 盤面が変わったら、前の液体を残して薄れさせ、新しい形の液体をにじませて入れ替える。
  const current = useRef<{ id: Influence; version: number; paths: typeof paths } | null>(null);
  const previous = useRef<typeof current.current>(null);
  if (current.current?.id !== influence) {
    previous.current = current.current;
    current.current = { id: influence, version: (current.current?.version ?? 0) + 1, paths };
  }
  const layers = [
    ...(previous.current ? [{ ...previous.current, phase: "fading" }] : []),
    { ...current.current!, phase: previous.current ? "rising" : "steady" },
  ];
  return (
    <g className="influence" style={{ "--seep-delay": `${delay}s` } as CSSProperties}>
      {layers.map(({ version, paths: shapes, phase }) => (
        <g key={version} className={`influence-layer ${phase}`}>
          {shapes.map(({ color, d }) => (
            <path key={color} d={d} fillRule="evenodd" className={`team ${color} influence-pool`} />
          ))}
        </g>
      ))}
    </g>
  );
}

/**
 * 見込みの数: 値が変わったら、delay 秒待ってから duration 秒かけて、前の値から新しい値へゆっくり数を変える
 * (液体がにじんで入れ替わるのに合わせる)。SVG の text の中でも使える。
 */
export function SeepingNumber({ value, delay, duration }: { value: number; delay: number; duration: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now() + delay * 1000;
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, Math.max(0, (now - start) / (duration * 1000)));
      const eased = t * t * (3 - 2 * t);
      const next = Math.round((origin + (value - origin) * eased) * 10) / 10;
      from.current = next;
      setShown(next);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, delay, duration]);
  return <>{shown}</>;
}
