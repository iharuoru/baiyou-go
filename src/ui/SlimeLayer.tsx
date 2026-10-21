// 石をスライムのように描く。形は環境変数 VITE_SLIME_SHAPE で切り替える (ビルド時に決まる)。
// - round (既定): 石ごとの丸を、くびれた形でつなぐ。2×2 に並んだ所は中を埋める。
// - tension: 表面張力で 1 つの液体にまとまったように、くびれずに太くつなぎ、L 字の外側の角は大きく丸め、
//   内側の角は液だまり (メニスカス) のように丸く埋める。石 1 つの形は、角ごとに丸みを変えた四角 (blobPath)。
// どちらも、盤の端の石は壁の外にも同じ色の石があるものとしてつなぎ、壁 (モニターの枠) にへばりつかせる。外の石は描かない
// (壁の外へはみ出した分は、GoBoard.tsx の screen-clip で切り取る)。
// ぼかしのフィルターで溶け合わせる方法は、アニメーションのたびに盤全体を計算し直して重いので使わない。

/** 落下アニメーションの長さ。styles.css の .slime circle.drop と揃える。 */
export const DROP_SECONDS = 0.9;
/** 終局で陣地に滲み出す長さ。styles.css の .slime .ooze と揃える。 */
export const OOZE_SECONDS = 0.9;

/** スライムの形。環境変数 VITE_SLIME_SHAPE が "tension" なら表面張力の形、それ以外は丸っぽい形。 */
const TENSION = import.meta.env.VITE_SLIME_SHAPE === "tension";

/**
 * くびれの細さ (半径に対する、くびれの一番細い所の半分の幅) と、くびれが石につながる角度 (2 つの石を結ぶ向きから)。
 * 表面張力の形はくびれず、真横でつないで、石の辺とつなぎの縁を一直線にする。
 */
const NECK = TENSION ? 1 : 0.62;
const NECK_ANGLE = TENSION ? Math.PI / 2 : (55 * Math.PI) / 180;
/** (表面張力の形) L 字の外側の角の丸み (半径に対する割合)。石の半径より大きく丸めて、曲がった管のようにする。 */
const OUTER_ROUND = 1.5;
/** (表面張力の形) L 字の内側の角を埋める液だまりの大きさ (半径に対する割合)。 */
const FILLET = 1;
/** 液だまりの角を、石の中心から半径のどれだけの所に置くか。つなぎの一番細い所 (NECK) より内側。 */
const FILLET_INSET = 0.95;

/** 上下左右の向き。L 字の角は、となり合う 2 つの向き (右と下 など) で探す。 */
const DIRECTIONS = [
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: -1 },
];

interface Point {
  cx: number;
  cy: number;
}

/** 2 つの石を、内側にくびれた 2 本の曲線でつなぐ形。 */
function neckPath(p: Point, q: Point, radius: number): string {
  const d = Math.hypot(q.cx - p.cx, q.cy - p.cy);
  const ux = (q.cx - p.cx) / d;
  const uy = (q.cy - p.cy) / d;
  const nx = -uy;
  const ny = ux;
  const along = radius * Math.cos(NECK_ANGLE);
  const side = radius * Math.sin(NECK_ANGLE);
  const mx = (p.cx + q.cx) / 2;
  const my = (p.cy + q.cy) / 2;
  const half = radius * NECK;
  const edge = (sign: 1 | -1) => {
    const a = { x: p.cx + ux * along + nx * side * sign, y: p.cy + uy * along + ny * side * sign };
    const b = { x: q.cx - ux * along + nx * side * sign, y: q.cy - uy * along + ny * side * sign };
    // 2 次ベジェ曲線の中点が、くびれの一番細い所を通るように制御点を決める。
    const c = {
      x: 2 * (mx + nx * half * sign) - (a.x + b.x) / 2,
      y: 2 * (my + ny * half * sign) - (a.y + b.y) / 2,
    };
    return { a, b, c };
  };
  const top = edge(1);
  const bottom = edge(-1);
  const f = (n: number) => n.toFixed(1);
  return [
    `M ${f(top.a.x)} ${f(top.a.y)}`,
    `Q ${f(top.c.x)} ${f(top.c.y)} ${f(top.b.x)} ${f(top.b.y)}`,
    `L ${f(bottom.b.x)} ${f(bottom.b.y)}`,
    `Q ${f(bottom.c.x)} ${f(bottom.c.y)} ${f(bottom.a.x)} ${f(bottom.a.y)}`,
    "Z",
  ].join(" ");
}

/**
 * 石 1 つの形: 角ごとに丸みを変えた四角。linked は DIRECTIONS の向きごとに、同じ色の石とつながっているか。
 * 角の丸み: 両側ともつながっていない角は半径 (円の 1/4)。ただし反対の 2 方向がつながっている L 字の外側の角は、
 * OUTER_ROUND で大きく丸める。片側だけつながっている角は、つなぎの縁へまっすぐ続くよう丸めない。
 * 両側ともつながっている (L 字の内側の) 角は半径で丸め、液だまり (filletPath) で埋める。
 */
function blobPath(p: Point, radius: number, linked: readonly boolean[]): string {
  const f = (n: number) => n.toFixed(1);
  const corners = DIRECTIONS.map((a, i) => {
    const j = (i + 1) % 4;
    const b = DIRECTIONS[j]!;
    const round =
      !linked[i] && !linked[j]
        ? linked[(i + 2) % 4] && linked[(j + 2) % 4]
          ? radius * OUTER_ROUND
          : radius
        : linked[i] && linked[j]
          ? radius
          : 0;
    const corner = { x: p.cx + (a.dx + b.dx) * radius, y: p.cy + (a.dy + b.dy) * radius };
    // 時計回りに、a の向きを向いた辺を b の向きへ進み、角で曲がって b の向きを向いた辺を a の逆へ進む。
    const start = { x: corner.x - b.dx * round, y: corner.y - b.dy * round };
    const end = { x: corner.x - a.dx * round, y: corner.y - a.dy * round };
    return { start, end, round };
  });
  // 右下の角から始めて時計回り。
  const first = corners[0]!;
  return [
    `M ${f(first.start.x)} ${f(first.start.y)}`,
    ...corners.map(({ start, end, round }, k) => {
      const turn = round > 0 ? `A ${f(round)} ${f(round)} 0 0 1 ${f(end.x)} ${f(end.y)}` : `L ${f(end.x)} ${f(end.y)}`;
      const next = corners[(k + 1) % 4]!.start;
      return `${k === 0 ? "" : `L ${f(start.x)} ${f(start.y)} `}${turn}${k === 3 ? ` L ${f(next.x)} ${f(next.y)}` : ""}`;
    }),
    "Z",
  ].join(" ");
}

/**
 * L 字の内側の角を埋める液だまり。石 p から u と v の向きに同じ色の石がある時、2 本のつなぎの縁が出会う角を、
 * 角へ向かってへこんだ曲線で丸く埋める。
 */
function filletPath(p: Point, u: { dx: number; dy: number }, v: { dx: number; dy: number }, radius: number): string {
  // 2 本のつなぎの縁の内側に収める (縁よりはみ出すと、輪郭に段差ができる)。
  const corner = {
    x: p.cx + (u.dx + v.dx) * radius * FILLET_INSET,
    y: p.cy + (u.dy + v.dy) * radius * FILLET_INSET,
  };
  const size = radius * FILLET;
  const f = (n: number) => n.toFixed(1);
  // 角から少し石の側に入った所から始めて、つなぎの縁との間に隙間を作らない。
  const inner = { x: corner.x - (u.dx + v.dx) * radius * 0.2, y: corner.y - (u.dy + v.dy) * radius * 0.2 };
  return [
    `M ${f(inner.x)} ${f(inner.y)}`,
    `L ${f(corner.x + u.dx * size - v.dx * radius * 0.2)} ${f(corner.y + u.dy * size - v.dy * radius * 0.2)}`,
    `L ${f(corner.x + u.dx * size)} ${f(corner.y + u.dy * size)}`,
    // 角の外側に中心を置いた円弧: 角へ向かってへこみ、2 本の縁に接する。
    `A ${f(size)} ${f(size)} 0 0 ${v.dx * u.dy - v.dy * u.dx > 0 ? 1 : 0} ${f(corner.x + v.dx * size)} ${f(corner.y + v.dy * size)}`,
    `L ${f(corner.x + v.dx * size - u.dx * radius * 0.2)} ${f(corner.y + v.dy * size - u.dy * radius * 0.2)}`,
    "Z",
  ].join(" ");
}

interface Props {
  className: string;
  stones: readonly number[];
  bridges: readonly (readonly [number, number])[];
  /** 2×2 に並んだ 4 つの石 (左上, 右上, 左下, 右下)。中に穴が開かないよう四角で埋める。 */
  squares: readonly (readonly number[])[];
  radius: number;
  pos: (index: number) => Point;
  /** 今打った石。落下してから、くびれが伸びる。 */
  justPlaced: number | null;
  /** 交点ごとに、滲み出して現れる時刻 (秒)。終局の侵食で使う。 */
  appear?: ReadonlyMap<number, number>;
  /** 盤の大きさ。端の石を壁へつなぐのに使う。 */
  size: number;
  /** 端の交点から壁 (モニターの枠) までの距離。 */
  wallDistance: number;
}

/** 2 点を対角とする四角。 */
function rectBetween(key: string, a: Point, b: Point, className: string | undefined) {
  return (
    <rect
      key={key}
      x={Math.min(a.cx, b.cx)}
      y={Math.min(a.cy, b.cy)}
      width={Math.abs(b.cx - a.cx)}
      height={Math.abs(b.cy - a.cy)}
      className={className}
    />
  );
}

export function SlimeLayer({
  className,
  stones,
  bridges,
  squares,
  radius,
  pos,
  justPlaced,
  appear,
  size,
  wallDistance,
}: Props) {
  if (stones.length === 0) return null;
  const appearAt = (index: number) => appear?.get(index) ?? 0;
  // 石ごとに、上下左右のどの向きが壁か (DIRECTIONS の順)。
  const wallsOf = (index: number) => {
    const x = index % size;
    const y = Math.floor(index / size);
    return [x === size - 1, y === size - 1, x === 0, y === 0];
  };
  // 石ごとに、上下左右のどの向きの石とつながっているか。
  const linked = new Set(bridges.flatMap(([a, b]) => [`${a}-${b}`, `${b}-${a}`]));
  const links = new Map(
    stones.map((index) => {
      const p = pos(index);
      return [
        index,
        DIRECTIONS.map(({ dx, dy }, i) =>
          wallsOf(index)[i]! ||
          stones.some((other) => {
            const q = pos(other);
            return linked.has(`${index}-${other}`) && Math.sign(q.cx - p.cx) === dx && Math.sign(q.cy - p.cy) === dy;
          }),
        ),
      ] as const;
    }),
  );
  // 石 1 つの形を決めるつながり。丸っぽい形では使わず、どの石も円にする。
  const blobLinks = (index: number) => (TENSION ? links.get(index)! : [false, false, false, false]);
  // L 字の内側の角 (表面張力の形だけ): となり合う 2 つの向きの両方につながっている所。
  const fillets = (TENSION ? stones : []).flatMap((index) =>
    DIRECTIONS.flatMap((u, i) => {
      const j = (i + 1) % 4;
      return links.get(index)![i] && links.get(index)![j] ? [{ index, u, v: DIRECTIONS[j]!, key: `${index}-${i}` }] : [];
    }),
  );
  // 壁へのへばりつき: 壁の外の (描かない) 石へのつなぎ、同じ壁に接するとなりの石との間、隅の石の角。
  const placed = (index: number) => (justPlaced !== null && index === justPlaced ? "stretch" : undefined);
  // 交点の間隔。壁の外の石は、端の石から 1 間隔外にあるものとする。
  const spacing = size > 1 ? pos(1).cx - pos(0).cx : wallDistance;
  const wallRects = [
    ...stones.flatMap((index) => {
      const p = pos(index);
      const walls = wallsOf(index);
      return DIRECTIONS.flatMap((d, i) => {
        if (!walls[i]) return [];
        const outside = { cx: p.cx + d.dx * spacing, cy: p.cy + d.dy * spacing };
        const band = <path key={`wall-${index}-${i}`} d={neckPath(p, outside, radius)} className={placed(index)} />;
        const next = DIRECTIONS[(i + 1) % 4]!;
        const corner = walls[(i + 1) % 4]
          ? [
              rectBetween(
                `wall-corner-${index}`,
                p,
                { cx: p.cx + (d.dx + next.dx) * wallDistance, cy: p.cy + (d.dy + next.dy) * wallDistance },
                placed(index),
              ),
            ]
          : [];
        return [band, ...corner];
      });
    }),
    ...bridges.flatMap(([a, b]) =>
      DIRECTIONS.flatMap((d, i) =>
        wallsOf(a)[i] && wallsOf(b)[i]
          ? [
              rectBetween(
                `wall-${a}-${b}-${i}`,
                pos(a),
                { cx: pos(b).cx + d.dx * wallDistance, cy: pos(b).cy + d.dy * wallDistance },
                placed(a) ?? placed(b),
              ),
            ]
          : [],
      ),
    ),
  ];

  return (
    <g className={`slime ${className}`}>
      {wallRects}
      {squares.map((corners) => {
        const p = pos(corners[0]!);
        const q = pos(corners[3]!);
        return (
          <rect
            key={`sq-${corners[0]}`}
            x={p.cx}
            y={p.cy}
            width={q.cx - p.cx}
            height={q.cy - p.cy}
            className={justPlaced !== null && corners.includes(justPlaced) ? "stretch" : undefined}
          />
        );
      })}
      {fillets.map(({ index, u, v, key }) => (
        <path
          key={`fillet-${key}`}
          d={filletPath(pos(index), u, v, radius)}
          className={appear ? "ooze" : index === justPlaced ? "stretch" : undefined}
          style={appear ? { animationDelay: `${appearAt(index)}s` } : undefined}
        />
      ))}
      {bridges.map(([a, b]) => (
        <path
          key={`${a}-${b}`}
          d={neckPath(pos(a), pos(b), radius)}
          className={appear ? "ooze" : a === justPlaced || b === justPlaced ? "stretch" : undefined}
          style={appear ? { animationDelay: `${Math.max(appearAt(a), appearAt(b))}s` } : undefined}
        />
      ))}
      {stones.map((index) => (
        <path
          key={index}
          d={blobPath(pos(index), radius, blobLinks(index))}
          // 表面張力の形でつながっている石は角が四角いので、うねうねの伸び縮みを小さくする (大きいと、つなぎとの継ぎ目に段差が出る)。
          className={[
            "blob",
            blobLinks(index).some(Boolean) && "linked",
            appear ? "ooze" : index === justPlaced && "drop",
          ]
            .filter(Boolean)
            .join(" ")}
          // うねうね: 石ごとに伸び縮みのタイミングをずらす。今打った石は落下の後から、滲み出す所は現れてから始める。
          style={{
            animationDelay: appear
              ? `${appearAt(index)}s, ${appearAt(index) + OOZE_SECONDS}s`
              : index === justPlaced
                ? `0s, ${DROP_SECONDS}s`
                : `${-((index * 0.37) % 2.6)}s`,
          }}
        />
      ))}
    </g>
  );
}
