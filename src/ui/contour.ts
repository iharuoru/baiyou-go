// 等高線: 格子の上の値から、しきい値の境目を閉じた輪郭として取り出す (マーチング・スクエア法)。
// 液体のような丸い形 (勢力の水たまり) を描くのに使う。輪郭はなめらかな曲線のパス (smoothClosedPath) にする。

export interface Point {
  x: number;
  y: number;
}

/**
 * 格子の値 values[j][i] (点 (i * step, j * step)) から、値が threshold 以上の領域の輪郭を、閉じた点列の集まりで返す。
 * 格子の端の値は threshold より小さいこと (輪郭が端で途切れないように)。
 */
export function contours(values: readonly (readonly number[])[], step: number, threshold: number): Point[][] {
  const rows = values.length;
  const cols = values[0]?.length ?? 0;
  const inside = (i: number, j: number) => values[j]![i]! >= threshold;
  // 辺の上で値がしきい値になる点。辺は "h i j" (点 (i, j) と (i + 1, j)) か "v i j" (点 (i, j) と (i, j + 1))。
  const edgePoint = (key: string): Point => {
    const [kind, si, sj] = key.split(" ");
    const i = Number(si);
    const j = Number(sj);
    const [i2, j2] = kind === "h" ? [i + 1, j] : [i, j + 1];
    const a = values[j]![i]!;
    const b = values[j2]![i2]!;
    const t = a === b ? 0.5 : (threshold - a) / (b - a);
    return { x: (i + (i2 - i) * t) * step, y: (j + (j2 - j) * t) * step };
  };
  // 升ごとに、輪郭の線分を辺の組で集める。
  const next = new Map<string, string>();
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const top = `h ${i} ${j}`;
      const right = `v ${i + 1} ${j}`;
      const bottom = `h ${i} ${j + 1}`;
      const left = `v ${i} ${j}`;
      const code =
        (inside(i, j) ? 8 : 0) | (inside(i + 1, j) ? 4 : 0) | (inside(i + 1, j + 1) ? 2 : 0) | (inside(i, j + 1) ? 1 : 0);
      // 内側を右手に見て進む向きで、線分 (始まりの辺 → 終わりの辺) をつなぐ。
      const center = (values[j]![i]! + values[j]![i + 1]! + values[j + 1]![i + 1]! + values[j + 1]![i]!) / 4;
      const segments: [string, string][] = (() => {
        switch (code) {
          case 1: return [[bottom, left]];
          case 2: return [[right, bottom]];
          case 3: return [[right, left]];
          case 4: return [[top, right]];
          case 5: return center >= threshold ? [[top, left], [bottom, right]] : [[top, right], [bottom, left]];
          case 6: return [[top, bottom]];
          case 7: return [[top, left]];
          case 8: return [[left, top]];
          case 9: return [[bottom, top]];
          case 10: return center >= threshold ? [[left, bottom], [right, top]] : [[left, top], [right, bottom]];
          case 11: return [[right, top]];
          case 12: return [[left, right]];
          case 13: return [[bottom, right]];
          case 14: return [[left, bottom]];
          default: return [];
        }
      })();
      segments.forEach(([from, to]) => next.set(from, to));
    }
  }
  // 線分をたどって、閉じた輪郭にする。
  const loops: Point[][] = [];
  const visited = new Set<string>();
  next.forEach((_, start) => {
    if (visited.has(start)) return;
    const loop: Point[] = [];
    for (let key: string | undefined = start; key !== undefined && !visited.has(key); key = next.get(key)) {
      visited.add(key);
      loop.push(edgePoint(key));
    }
    if (loop.length >= 3) loops.push(loop);
  });
  return loops;
}

/** 閉じた点列を順に通る、なめらかな閉じた曲線のパス (Catmull-Rom 曲線を 3 次ベジェ曲線に直したもの)。 */
export function smoothClosedPath(loop: readonly Point[]): string {
  const n = loop.length;
  const at = (k: number) => loop[((k % n) + n) % n]!;
  const f = (v: number) => v.toFixed(1);
  const segments = loop.map((_, k) => {
    const [before, start, end, after] = [at(k - 1), at(k), at(k + 1), at(k + 2)];
    const c1 = { x: start.x + (end.x - before.x) / 6, y: start.y + (end.y - before.y) / 6 };
    const c2 = { x: end.x - (after.x - start.x) / 6, y: end.y - (after.y - start.y) / 6 };
    return `C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(end.x)} ${f(end.y)}`;
  });
  return `M ${f(loop[0]!.x)} ${f(loop[0]!.y)} ${segments.join(" ")} Z`;
}
